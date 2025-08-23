/**
 * Unified Evaluation Service
 * Provides a single interface that can use either old CVS or new Value/Price/Edge system
 * Controlled by feature flags
 */

import { Player, PlayerEvaluation, DraftedPlayer, Position } from '../types';
import { featureFlags, isNewSystemEnabled } from '../config/featureFlags';

// Old system
import { evaluationEngine } from './unifiedEvaluationEngine';

// New system
import { IntrinsicValueEngine, IntrinsicValue } from './valuation/intrinsicValueEngine';
import { MarketPriceModel, MarketPrice, MarketContext } from './market/marketPriceModel';
import { EdgeCalculator, PlayerEdge } from './edge/edgeCalculator';
import { LeagueSettings, defaultLeagueSettings } from './valuation/leagueSettings';

export interface UnifiedPlayerEvaluation extends PlayerEvaluation {
  // New system fields
  intrinsicValue?: number;
  vorp?: number;
  marketPrice?: number;
  edge?: number;
  edgePercent?: number;
  valueRecommendation?: 'strong-buy' | 'buy' | 'hold' | 'avoid' | 'strong-avoid';
  tier?: 'elite' | 'starter' | 'bench' | 'waiver';
}

export class UnifiedEvaluationService {
  // Old system
  private oldEngine = evaluationEngine;
  
  // New system
  private intrinsicEngine: IntrinsicValueEngine;
  private marketModel: MarketPriceModel;
  private edgeCalculator: EdgeCalculator;
  private leagueSettings: LeagueSettings;
  
  // Cache
  private cachedEvaluations: Map<string, UnifiedPlayerEvaluation> = new Map();

  constructor(leagueSettings: LeagueSettings = defaultLeagueSettings) {
    this.leagueSettings = leagueSettings;
    this.intrinsicEngine = new IntrinsicValueEngine(leagueSettings);
    this.marketModel = new MarketPriceModel(leagueSettings);
    this.edgeCalculator = new EdgeCalculator();
  }

  /**
   * Evaluate all players using the appropriate system
   */
  evaluateAllPlayers(
    players: Player[],
    draftedPlayers: DraftedPlayer[] = [],
    teamBudgets?: Map<string, number>
  ): UnifiedPlayerEvaluation[] {
    if (isNewSystemEnabled()) {
      return this.evaluateWithNewSystem(players, draftedPlayers, teamBudgets);
    } else {
      return this.evaluateWithOldSystem(players, draftedPlayers, teamBudgets);
    }
  }

  /**
   * Evaluate using the new Value/Price/Edge system
   */
  private evaluateWithNewSystem(
    players: Player[],
    draftedPlayers: DraftedPlayer[],
    teamBudgets?: Map<string, number>
  ): UnifiedPlayerEvaluation[] {
    // Calculate intrinsic values for all players
    const intrinsicValues = this.intrinsicEngine.calculateAllValues(players);
    
    // Calculate total remaining budget
    let totalRemainingBudget = 0;
    if (teamBudgets) {
      teamBudgets.forEach(budget => totalRemainingBudget += budget);
    } else {
      // Default: 12 teams * $200 budget
      totalRemainingBudget = 12 * 200;
    }
    
    // Filter out drafted players to get remaining players
    const draftedIds = new Set(draftedPlayers.map(p => p.id));
    const remainingPlayers = players.filter(p => !draftedIds.has(p.id));
    
    // Create market context with ALL required fields
    const marketContext: MarketContext = {
      draftedPlayers,
      remainingBudget: teamBudgets || new Map(),
      totalRemainingBudget,
      remainingPlayers,
      inflationRate: this.calculateInflation(draftedPlayers),
      recentPrices: draftedPlayers.slice(-10).map(p => ({
        position: p.position,
        price: p.purchasePrice
      }))
    };
    
    // Predict market prices
    const marketPrices = players.map(player => 
      this.marketModel.predictPrice(player, marketContext)
    );
    
    // Calculate edges
    const edges = this.edgeCalculator.calculateMultipleEdges(
      intrinsicValues,
      marketPrices
    );
    
    // Create unified evaluations
    const evaluations: UnifiedPlayerEvaluation[] = [];
    
    // Create maps for quick lookup
    const intrinsicMap = new Map<string, IntrinsicValue>();
    intrinsicValues.forEach(iv => intrinsicMap.set(iv.player.id, iv));
    
    const priceMap = new Map<string, MarketPrice>();
    marketPrices.forEach(mp => priceMap.set(mp.player.id, mp));
    
    const edgeMap = new Map<string, PlayerEdge>();
    edges.forEach(e => edgeMap.set(e.player.id, e));
    
    // Combine all data
    players.forEach(player => {
      const intrinsic = intrinsicMap.get(player.id);
      const market = priceMap.get(player.id);
      const edge = edgeMap.get(player.id);
      
      const evaluation: UnifiedPlayerEvaluation = {
        ...player,
        // Old system fields (set to defaults)
        cvsScore: intrinsic?.constrainedValue || 0,  // Use intrinsic value as score
        cvsComponents: {
          pps: player.projectedPoints,
          var: intrinsic?.vorp || 0,
          con: 0,
          ups: 0,
          sos: 0,
          trd: 0,
          inj: 0
        },
        recommendedBid: intrinsic?.constrainedValue || 0,
        marketValue: market?.predictedPrice || 0,
        isUndervalued: edge ? edge.edge > 3 : false,
        positionRank: intrinsic?.positionRank || 999,
        overallRank: intrinsic?.overallRank || 999,
        
        // New system fields
        intrinsicValue: intrinsic?.constrainedValue,
        vorp: intrinsic?.vorp,
        marketPrice: market?.predictedPrice,
        edge: edge?.edge,
        edgePercent: edge?.edgePercent,
        valueRecommendation: edge?.recommendation,
        tier: intrinsic?.tier
      };
      
      evaluations.push(evaluation);
    });
    
    // Sort by edge (best opportunities first)
    evaluations.sort((a, b) => (b.edge || 0) - (a.edge || 0));
    
    return evaluations;
  }

  /**
   * Evaluate using the old CVS system
   */
  private evaluateWithOldSystem(
    players: Player[],
    draftedPlayers: DraftedPlayer[],
    teamBudgets?: Map<string, number>
  ): UnifiedPlayerEvaluation[] {
    // Create market context for old system
    const context = {
      draftedPlayers,
      remainingBudgets: teamBudgets || new Map(),
      positionScarcity: this.calculatePositionScarcity(players, draftedPlayers),
      recentBids: draftedPlayers.slice(-10).map(p => p.purchasePrice)
    };
    
    // Use old evaluation engine
    const evaluations = players.map(player => {
      const evaluation = this.oldEngine.calculateCVS(player, context);
      
      // Convert to unified format
      return {
        ...evaluation,
        // New fields not available in old system
        intrinsicValue: undefined,
        vorp: undefined,
        marketPrice: undefined,
        edge: undefined,
        edgePercent: undefined,
        valueRecommendation: undefined,
        tier: undefined
      } as UnifiedPlayerEvaluation;
    });
    
    // Sort by CVS score
    evaluations.sort((a, b) => b.cvsScore - a.cvsScore);
    
    return evaluations;
  }

  /**
   * Calculate market inflation based on drafted players
   */
  private calculateInflation(draftedPlayers: DraftedPlayer[]): number {
    if (draftedPlayers.length === 0) return 1.0;
    
    let actualSum = 0;
    let expectedSum = 0;
    
    draftedPlayers.forEach(player => {
      actualSum += player.purchasePrice;
      expectedSum += player.auctionValue || 10;  // Default if no AAV
    });
    
    if (expectedSum === 0) return 1.0;
    
    const inflation = actualSum / expectedSum;
    return Math.max(0.7, Math.min(1.5, inflation));  // Cap between 0.7 and 1.5
  }

  /**
   * Calculate position scarcity for old system
   */
  private calculatePositionScarcity(
    allPlayers: Player[],
    draftedPlayers: DraftedPlayer[]
  ): Map<Position, number> {
    const scarcity = new Map<Position, number>();
    const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    
    positions.forEach(pos => {
      const available = allPlayers.filter(p => p.position === pos).length;
      const drafted = draftedPlayers.filter(p => p.position === pos).length;
      const total = available + drafted;
      
      const scarcityScore = total > 0 ? drafted / total : 0;
      scarcity.set(pos, scarcityScore);
    });
    
    return scarcity;
  }

  /**
   * Get top players by a specific metric
   */
  getTopPlayers(
    evaluations: UnifiedPlayerEvaluation[],
    metric: 'edge' | 'value' | 'cvs' = 'edge',
    count: number = 10
  ): UnifiedPlayerEvaluation[] {
    const sorted = [...evaluations];
    
    switch (metric) {
      case 'edge':
        sorted.sort((a, b) => (b.edge || 0) - (a.edge || 0));
        break;
      case 'value':
        sorted.sort((a, b) => (b.intrinsicValue || 0) - (a.intrinsicValue || 0));
        break;
      case 'cvs':
        sorted.sort((a, b) => b.cvsScore - a.cvsScore);
        break;
    }
    
    return sorted.slice(0, count);
  }

  /**
   * Get value opportunities
   */
  getValueOpportunities(
    evaluations: UnifiedPlayerEvaluation[],
    minEdge: number = 3
  ): UnifiedPlayerEvaluation[] {
    if (!isNewSystemEnabled()) {
      // For old system, use undervalued flag
      return evaluations.filter(e => e.isUndervalued);
    }
    
    return evaluations
      .filter(e => e.edge && e.edge >= minEdge)
      .sort((a, b) => (b.edge || 0) - (a.edge || 0));
  }

  /**
   * Get overpriced players (traps)
   */
  getOverpricedPlayers(
    evaluations: UnifiedPlayerEvaluation[],
    maxEdge: number = -3
  ): UnifiedPlayerEvaluation[] {
    if (!isNewSystemEnabled()) {
      // For old system, return players where market > recommended
      return evaluations.filter(e => 
        e.marketValue > e.recommendedBid * 1.2
      );
    }
    
    return evaluations
      .filter(e => e.edge && e.edge <= maxEdge)
      .sort((a, b) => (a.edge || 0) - (b.edge || 0));
  }

  /**
   * Update league settings
   */
  updateLeagueSettings(settings: LeagueSettings): void {
    this.leagueSettings = settings;
    this.intrinsicEngine.updateSettings(settings);
    this.marketModel = new MarketPriceModel(settings);
    this.cachedEvaluations.clear();
  }

  /**
   * Get current evaluation method
   */
  getCurrentMethod(): 'new' | 'old' {
    return isNewSystemEnabled() ? 'new' : 'old';
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cachedEvaluations.clear();
  }
}