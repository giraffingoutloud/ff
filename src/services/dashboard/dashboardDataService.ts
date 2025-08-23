/**
 * Dashboard Data Service
 * Aggregates and formats data from valuation engines for dashboard display
 */

import { Player, Position } from '../../types';
import { IntrinsicValueEngine } from '../valuation/intrinsicValueEngine';
import { MarketPriceModel } from '../market/marketPriceModel';
import { EdgeCalculator, PlayerEdge } from '../edge/edgeCalculator';
import { DraftState } from '../../store/draftStore';
import { LeagueSettings } from '../valuation/leagueSettings';

export interface MarketContext {
  totalSpent: number;
  totalRemaining: number;
  avgTeamRemaining: number;
  inflationRate: number;
  paceVsExpected: number;
  draftProgress: number;
}

export interface PositionScarcity {
  position: string;
  available: number;
  needed: number;
  scarcityScore: number;
  averageValue: number;
  topTierRemaining: number;
}

export interface OpportunityData {
  bestValues: PlayerEdge[];
  traps: PlayerEdge[];
  nominations: PlayerEdge[];
}

export interface CriticalMoment {
  type: 'last-elite' | 'scarcity-cliff' | 'value-run' | 'budget-pressure';
  position: string;
  message: string;
  urgency: 'high' | 'medium' | 'low';
  affectedPlayers: Player[];
}

export interface DashboardData {
  marketContext: MarketContext;
  positionScarcity: PositionScarcity[];
  opportunities: OpportunityData;
  criticalMoments: CriticalMoment[];
  myRoster: {
    spent: number;
    remaining: number;
    rosterSpots: number;
    filledSpots: number;
    needs: string[];
    strengths: string[];
    positionCounts: Record<string, number>;
  };
}

export class DashboardDataService {
  private intrinsicValueEngine: IntrinsicValueEngine;
  private marketPriceModel: MarketPriceModel;
  private edgeCalculator: EdgeCalculator;
  private leagueSettings: LeagueSettings;

  constructor(leagueSettings: LeagueSettings) {
    this.leagueSettings = leagueSettings;
    this.intrinsicValueEngine = new IntrinsicValueEngine(leagueSettings);
    this.marketPriceModel = new MarketPriceModel(leagueSettings);
    this.edgeCalculator = new EdgeCalculator();
  }

  /**
   * Generate complete dashboard data
   */
  generateDashboardData(
    allPlayers: Player[],
    draftState: DraftState
  ): DashboardData {
    // Calculate values and prices for available players
    const availablePlayers = allPlayers.filter(p => !draftState.draftedPlayers.has(p.id));
    const intrinsicValues = this.intrinsicValueEngine.calculateAllValues(availablePlayers);
    
    // Create market context for price prediction
    // Convert Map to budget map and calculate totals
    const remainingBudgetMap = new Map<string, number>();
    let totalRemaining = 0;
    draftState.teamBudgets.forEach((budget, teamId) => {
      remainingBudgetMap.set(teamId, budget.remaining);
      totalRemaining += budget.remaining;
    });
    
    // Get recent prices from draft history (last 10 picks)
    const recentPrices = draftState.draftHistory
      .slice(-10)
      .map(pick => ({
        position: allPlayers.find(p => p.id === pick.playerId)?.position || 'QB' as Position,
        price: pick.purchasePrice
      }));
    
    const marketContext = {
      draftedPlayers: draftState.draftHistory,
      remainingBudget: remainingBudgetMap,
      totalRemainingBudget: totalRemaining,
      remainingPlayers: availablePlayers,
      inflationRate: totalRemaining / (availablePlayers.length * 10) || 1.0, // Simple inflation estimate
      recentPrices
    };
    
    const marketPrices = this.marketPriceModel.predictMultiple(
      availablePlayers,
      marketContext
    );
    const edges = this.edgeCalculator.calculateMultipleEdges(intrinsicValues, marketPrices);

    return {
      marketContext: this.calculateMarketContext(draftState, allPlayers),
      positionScarcity: this.calculatePositionScarcity(availablePlayers, draftState),
      opportunities: this.findOpportunities(edges, draftState),
      criticalMoments: this.detectCriticalMoments(availablePlayers, draftState, edges),
      myRoster: this.analyzeMyRoster(draftState)
    };
  }

  /**
   * Calculate market context metrics
   */
  private calculateMarketContext(
    draftState: DraftState,
    allPlayers: Player[]
  ): MarketContext {
    const totalBudget = this.leagueSettings.budget * this.leagueSettings.numTeams;
    const totalSpent = Array.from(draftState.teamBudgets.values())
      .reduce((sum, budget) => sum + (this.leagueSettings.budget - budget.remaining), 0);
    const totalRemaining = totalBudget - totalSpent;
    
    const activeTeams = Array.from(draftState.teamBudgets.values())
      .filter(b => b.remaining > 1);
    const avgTeamRemaining = activeTeams.length > 0
      ? activeTeams.reduce((sum, b) => sum + b.remaining, 0) / activeTeams.length
      : 0;

    // Calculate expected spending at this point
    const draftedCount = draftState.draftedPlayers.size;
    const totalPlayers = this.leagueSettings.rosterSize * this.leagueSettings.numTeams;
    const draftProgress = draftedCount / totalPlayers;
    const expectedSpent = totalBudget * draftProgress;
    const paceVsExpected = totalSpent / (expectedSpent || 1);

    // Inflation rate: how much more remaining money vs remaining value
    const remainingSlots = totalPlayers - draftedCount;
    const expectedAvgPrice = totalRemaining / (remainingSlots || 1);
    const baseAvgPrice = totalBudget / totalPlayers;
    const inflationRate = expectedAvgPrice / baseAvgPrice;

    return {
      totalSpent,
      totalRemaining,
      avgTeamRemaining,
      inflationRate,
      paceVsExpected,
      draftProgress: draftProgress * 100
    };
  }

  /**
   * Calculate position scarcity metrics
   */
  private calculatePositionScarcity(
    availablePlayers: Player[],
    draftState: DraftState
  ): PositionScarcity[] {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const scarcityData: PositionScarcity[] = [];

    for (const position of positions) {
      const posPlayers = availablePlayers.filter(p => p.position === position);
      const available = posPlayers.length;
      
      // Calculate how many more are needed
      const minRequired = this.leagueSettings.rosterRequirements[position]?.min || 0;
      const totalNeeded = minRequired * this.leagueSettings.numTeams;
      const alreadyDrafted = Array.from(draftState.draftedPlayers.values())
        .filter(id => {
          const player = availablePlayers.find(p => p.id === id);
          return player?.position === position;
        }).length;
      const stillNeeded = Math.max(0, totalNeeded - alreadyDrafted);

      // Calculate scarcity score
      const scarcityScore = available > 0 ? (stillNeeded / available) * 100 : 100;
      
      // Average value of available players
      const avgValue = posPlayers.length > 0
        ? posPlayers.reduce((sum, p) => sum + (p.value || 0), 0) / posPlayers.length
        : 0;
      
      // Count top tier (top 25% by projected points)
      const sortedByPoints = [...posPlayers].sort((a, b) => b.projectedPoints - a.projectedPoints);
      const topTierCutoff = sortedByPoints[Math.floor(posPlayers.length * 0.25)]?.projectedPoints || 0;
      const topTierRemaining = sortedByPoints.filter(p => p.projectedPoints >= topTierCutoff).length;

      scarcityData.push({
        position,
        available,
        needed: stillNeeded,
        scarcityScore: Math.min(100, scarcityScore),
        averageValue: avgValue,
        topTierRemaining
      });
    }

    return scarcityData.sort((a, b) => b.scarcityScore - a.scarcityScore);
  }

  /**
   * Find opportunities in the market
   */
  private findOpportunities(
    edges: PlayerEdge[],
    draftState: DraftState
  ): OpportunityData {
    // Best values: positive edge opportunities
    const bestValues = edges
      .filter(e => e.edge > 0 && (e.recommendation === 'buy' || e.recommendation === 'strong-buy'))
      .sort((a, b) => b.confidenceWeightedEdge - a.confidenceWeightedEdge)
      .slice(0, 10);

    // Traps: overpriced players to avoid
    const traps = edges
      .filter(e => e.edge < -3 && (e.recommendation === 'avoid' || e.recommendation === 'strong-avoid'))
      .sort((a, b) => a.edge - b.edge)
      .slice(0, 5);

    // Nomination targets: expensive players you don't want
    const myTeamId = draftState.myTeamId || 'team1';
    const myNeeds = this.getTeamNeeds(myTeamId, draftState);
    
    const nominations = edges
      .filter(e => 
        e.marketPrice > 20 &&
        !myNeeds.includes(e.player.position) &&
        (e.recommendation === 'hold' || e.recommendation === 'avoid')
      )
      .sort((a, b) => b.marketPrice - a.marketPrice)
      .slice(0, 5);

    return {
      bestValues,
      traps,
      nominations
    };
  }

  /**
   * Detect critical moments in the draft
   */
  private detectCriticalMoments(
    availablePlayers: Player[],
    draftState: DraftState,
    edges: PlayerEdge[]
  ): CriticalMoment[] {
    const moments: CriticalMoment[] = [];
    const positions = ['QB', 'RB', 'WR', 'TE'];

    for (const position of positions) {
      const posPlayers = availablePlayers
        .filter(p => p.position === position)
        .sort((a, b) => b.projectedPoints - a.projectedPoints);

      // Check for last elite player
      const eliteThreshold = posPlayers[0]?.projectedPoints * 0.85;
      const elitePlayers = posPlayers.filter(p => p.projectedPoints >= eliteThreshold);
      
      if (elitePlayers.length <= 2 && elitePlayers.length > 0) {
        moments.push({
          type: 'last-elite',
          position,
          message: `Only ${elitePlayers.length} elite ${position}${elitePlayers.length > 1 ? 's' : ''} remaining`,
          urgency: 'high',
          affectedPlayers: elitePlayers
        });
      }

      // Check for scarcity cliff
      const needed = this.leagueSettings.rosterRequirements[position]?.min || 0;
      const totalNeeded = needed * this.leagueSettings.numTeams;
      const alreadyDrafted = Array.from(draftState.draftedPlayers.values())
        .filter(id => {
          const player = availablePlayers.find(p => p.id === id);
          return player?.position === position;
        }).length;
      const stillNeeded = totalNeeded - alreadyDrafted;
      
      if (posPlayers.length <= stillNeeded * 1.2) {
        moments.push({
          type: 'scarcity-cliff',
          position,
          message: `${position} scarcity approaching - only ${posPlayers.length} left for ${stillNeeded} spots`,
          urgency: posPlayers.length <= stillNeeded ? 'high' : 'medium',
          affectedPlayers: posPlayers.slice(0, 5)
        });
      }
    }

    // Check for value runs
    const recentPicks = Array.from(draftState.draftHistory.slice(-5));
    const positionCounts = recentPicks.reduce((acc, pick) => {
      const player = availablePlayers.find(p => p.id === pick.playerId);
      if (player) {
        acc[player.position] = (acc[player.position] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    Object.entries(positionCounts).forEach(([position, count]) => {
      if (count >= 3) {
        moments.push({
          type: 'value-run',
          position,
          message: `Run on ${position} - ${count} drafted in last 5 picks`,
          urgency: 'medium',
          affectedPlayers: availablePlayers
            .filter(p => p.position === position)
            .sort((a, b) => b.projectedPoints - a.projectedPoints)
            .slice(0, 3)
        });
      }
    });

    // Check for budget pressure
    const myTeamId = draftState.myTeamId || 'team1';
    const myBudget = draftState.teamBudgets.get(myTeamId);
    if (myBudget) {
      const spotsToFill = this.leagueSettings.rosterSize - (draftState.teamRosters.get(myTeamId)?.length || 0);
      const avgPerSpot = myBudget.remaining / spotsToFill;
      
      if (avgPerSpot < 5 && spotsToFill > 5) {
        moments.push({
          type: 'budget-pressure',
          position: 'ALL',
          message: `Budget constraint: $${avgPerSpot.toFixed(0)} per remaining spot`,
          urgency: avgPerSpot < 3 ? 'high' : 'medium',
          affectedPlayers: edges
            .filter(e => e.marketPrice <= avgPerSpot * 1.5)
            .map(e => e.player)
            .slice(0, 5)
        });
      }
    }

    return moments.sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }

  /**
   * Analyze my roster
   */
  private analyzeMyRoster(draftState: DraftState): DashboardData['myRoster'] {
    const myTeamId = draftState.myTeamId || 'my-team';
    const myBudget = draftState.teamBudgets.get(myTeamId) || { 
      remaining: this.leagueSettings.budget,
      maxBid: this.leagueSettings.budget - 1
    };
    const myRoster = draftState.teamRosters.get(myTeamId) || [];
    
    const spent = this.leagueSettings.budget - myBudget.remaining;
    const needs = this.getTeamNeeds(myTeamId, draftState);
    const strengths = this.getTeamStrengths(myTeamId, draftState);
    const positionCountsMap = this.getPositionCounts(myTeamId, draftState);
    
    // Convert Map to plain object for React props
    const positionCounts: Record<string, number> = {};
    positionCountsMap.forEach((count, position) => {
      positionCounts[position] = count;
    });

    return {
      spent,
      remaining: myBudget.remaining,
      rosterSpots: this.leagueSettings.rosterSize,
      filledSpots: myRoster.length,
      needs,
      strengths,
      positionCounts
    };
  }

  /**
   * Get team needs
   */
  private getTeamNeeds(teamId: string, draftState: DraftState): string[] {
    const roster = draftState.teamRosters.get(teamId) || [];
    const needs: string[] = [];
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const positionCounts = this.getPositionCounts(teamId, draftState);

    for (const position of positions) {
      const required = this.leagueSettings.rosterRequirements[position]?.min || 0;
      const have = positionCounts.get(position) || 0;
      
      if (have < required) {
        needs.push(position);
      }
    }

    return needs;
  }

  /**
   * Get team strengths
   */
  private getTeamStrengths(teamId: string, draftState: DraftState): string[] {
    const roster = draftState.teamRosters.get(teamId) || [];
    const strengths: string[] = [];
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const positionCounts = this.getPositionCounts(teamId, draftState);

    for (const position of positions) {
      const required = this.leagueSettings.rosterRequirements[position]?.min || 0;
      const have = positionCounts.get(position) || 0;
      
      if (have >= required) {
        strengths.push(position);
      }
    }

    return strengths;
  }

  /**
   * Get actual position counts for a team's roster
   */
  private getPositionCounts(teamId: string, draftState: DraftState): Map<string, number> {
    const counts = new Map<string, number>();
    const rosterPlayerIds = draftState.teamRosters.get(teamId) || [];
    
    // Count each position from drafted players
    rosterPlayerIds.forEach(playerId => {
      const draftedPlayer = draftState.draftHistory.find(p => p.id === playerId);
      if (draftedPlayer) {
        const position = draftedPlayer.position;
        counts.set(position, (counts.get(position) || 0) + 1);
      }
    });
    
    return counts;
  }
}