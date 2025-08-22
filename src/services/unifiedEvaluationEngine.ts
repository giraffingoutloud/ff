/**
 * Unified Evaluation Engine
 * Combines base and enhanced functionality with clean architecture
 */

import { Player, CVSComponents, PlayerEvaluation, Position, DraftedPlayer } from '../types';
import { 
  defaultWeights, 
  positionMultipliers,
  replacementLevels,
  ageOptimalRanges,
  loadCalibratedWeights,
  validateWeights
} from '../config/evaluationWeights';
import ageCurvesData from '../config/ageCurves.json';
import { 
  AdvancedMetrics, 
  AdvancedPredictorEngine, 
  CompositePredictionModel 
} from './advancedPredictors';
import { sosDataService } from './sosDataService';
import { pprAnalyzer, ExtendedPlayer } from './pprAnalyzer';
import { volumePatternsService } from './volumePatternsService';
import sosCSV from '../../canonical_data/strength_of_schedule/sos_2025.csv?raw';

interface MarketContext {
  draftedPlayers: DraftedPlayer[];
  remainingBudgets: Map<string, number>;
  positionScarcity: Map<Position, number>;
  recentBids: number[];
}

interface EnhancedPlayerEvaluation extends PlayerEvaluation {
  advancedMetrics?: Partial<AdvancedMetrics>;
  opportunityScore?: number;
  systemFitScore?: number;
  scheduleScore?: number;
  injuryRisk?: number;
  marketInefficiency?: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  keyInsights?: string[];
}

/**
 * Unified evaluation engine with both base and enhanced capabilities
 */
export class UnifiedEvaluationEngine {
  public disableAgeFactor: boolean = false;
  private weights = defaultWeights;
  private ageCurves = ageCurvesData.curves;
  private advancedPredictor?: AdvancedPredictorEngine;
  private compositeModel?: CompositePredictionModel;
  private useEnhanced: boolean = false;
  private playersInitialized: boolean = false;

  constructor(enhanced: boolean = false) {
    this.useEnhanced = enhanced;
    if (enhanced) {
      this.advancedPredictor = new AdvancedPredictorEngine();
      this.compositeModel = new CompositePredictionModel();
    }
    // Start with default weights immediately
    this.weights = defaultWeights;
    // Initialize SOS data service
    this.initializeSOSData();
    // Try to load calibrated weights async (won't block)
    this.loadConfiguration();
  }

  /**
   * Initialize SOS data from canonical CSV
   */
  private async initializeSOSData() {
    try {
      await sosDataService.initialize(sosCSV);
      console.log('SOS data service initialized');
    } catch (error) {
      console.warn('Failed to initialize SOS data, using fallback', error);
    }
  }

  /**
   * Load calibrated weights if available
   */
  private async loadConfiguration() {
    try {
      const calibratedWeights = await loadCalibratedWeights();
      if (calibratedWeights && validateWeights(calibratedWeights)) {
        this.weights = calibratedWeights;
        console.log('Loaded calibrated weights');
      }
    } catch (error) {
      console.log('Using default weights');
    }
  }

  /**
   * Initialize with player data
   */
  initializeWithPlayers(players: Player[]): void {
    if (!this.playersInitialized) {
      this.playersInitialized = true;
      console.log('Evaluation engine initialized with player data');
    }
  }

  /**
   * Main evaluation method - SIMPLIFIED for auction PPR
   */
  calculateCVS(
    player: Player | ExtendedPlayer, 
    context?: MarketContext,
    advancedData?: Partial<AdvancedMetrics>
  ): EnhancedPlayerEvaluation {
    // Skip CVS calculation for K and DST positions - return undefined/NaN for N/A display
    if (player.position === 'K' || player.position === 'DST') {
      // Return evaluation with undefined CVS score for K/DST (will display as N/A)
      return {
        ...player,
        cvsScore: NaN, // NaN will display as N/A in UI
        cvsComponents: {
          pps: 0,
          var: 0,
          con: 0,
          ups: 0,
          sos: 0,
          trd: 0,
          inj: 0
        },
        recommendedBid: player.auctionValue || 0,
        marketValue: player.auctionValue || 0,
        isUndervalued: false,
        positionRank: 0,
        overallRank: 0
      };
    }
    
    // Updated CVS formula optimized for auction PPR (December 2024):
    // 23% Auction Value (market consensus)
    // 23% ADP (draft position consensus)
    // 28% Projected Points (with PPR bonus)
    // 8% Position Scarcity
    // 10% Strength of Schedule - Increased from 6%
    // 8% Year-over-Year Trend
    
    // 1. Auction Value Score (25%) - ONLY from canonical data, no defaults
    // If auction value is missing (N/A in CSV), exclude from weighted average
    const hasAuctionValue = player.auctionValue && player.auctionValue > 0;
    const auctionScore = hasAuctionValue ? Math.min(100, 
      Math.log10(player.auctionValue + 10) * 45
    ) : null;
    
    // 2. ADP Score (25%) - ONLY from canonical data, no defaults
    // If ADP is missing (null in CSV), exclude from weighted average
    const hasADP = player.adp && player.adp > 0 && player.adp < 999;
    const adpScore = hasADP ? Math.min(100,
      Math.sqrt(Math.max(0, (300 - Math.min(player.adp, 300))) / 3) * 10
    ) : null;
    
    // 3. Projected Points Score (30%) - With PPR boost
    // Raised caps for RB/WR to 425 to account for elite PPR performers
    const positionMax = {
      'QB': 400,
      'RB': 425,  // Raised from 350 for elite PPR backs
      'WR': 425,  // Raised from 350 for elite PPR receivers
      'TE': 275,  // Raised from 250 for elite TEs
      'K': 150,
      'DST': 130
    }[player.position] || 300;
    
    let projectedPoints = player.projectedPoints;
    
    // PPR boost for reception-heavy players
    if ('receptions' in player) {
      const extPlayer = player as ExtendedPlayer;
      // Add reception points (1 point per reception in PPR)
      projectedPoints += extPlayer.receptions || 0;
    }
    
    const pointsScore = Math.min(100, (projectedPoints / positionMax) * 100);
    
    // 4. Position Scarcity Score (15%)
    // Based on how many quality starters at position
    const scarcityScore = {
      'RB': 85,  // Most scarce - fewer bellcows
      'TE': 75,  // Very scarce - big dropoff after elite
      'WR': 60,  // Less scarce - deeper position
      'QB': 50,  // Even less scarce  
      'K': 30,   // Not scarce
      'DST': 30  // Not scarce
    }[player.position] || null;  // No fake default
    
    // Get SOS data ONLY from canonical source - no defaults
    const sosScore = player.team ? sosDataService.getTeamSOS(player.team) : null;
    
    // Get trend data ONLY from canonical historical stats - no defaults
    let trendScore = null; // No fake neutral default
    
    // Get volume patterns for trend
    const volumeData = volumePatternsService.getPlayerVolumeData(player.name);
    if (volumeData && volumeData.momentumScore !== undefined && volumeData.momentumScore !== null) {
      // momentumScore is already -100 to 100 (percentage change)
      // Convert to 0-100 scale for CVS: 0% change = 50, +100% = 100, -100% = 0
      trendScore = Math.round(50 + (volumeData.momentumScore / 2));
      trendScore = Math.max(0, Math.min(100, trendScore));
    }
    
    // Calculate weighted CVS using ONLY real data from canonical sources
    // Dynamically adjust weights when data is missing
    const weights = {
      auction: hasAuctionValue ? 0.23 : 0,
      adp: hasADP ? 0.23 : 0,
      points: 0.28,  // Always have projected points
      scarcity: scarcityScore !== null ? 0.08 : 0,
      sos: sosScore !== null ? 0.10 : 0,
      trend: trendScore !== null ? 0.08 : 0
    };
    
    // Normalize weights to sum to 1.0
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight > 0) {
      Object.keys(weights).forEach(key => {
        weights[key] = weights[key] / totalWeight;
      });
    }
    
    // Calculate final score using only real data
    let finalScore = 0;
    if (hasAuctionValue) finalScore += auctionScore * weights.auction;
    if (hasADP) finalScore += adpScore * weights.adp;
    finalScore += pointsScore * weights.points;
    if (scarcityScore !== null) finalScore += scarcityScore * weights.scarcity;
    if (sosScore !== null) finalScore += sosScore * weights.sos;
    if (trendScore !== null) finalScore += trendScore * weights.trend;
    
    // Add elite tier bonuses based on ADP
    // These bonuses help differentiate truly elite players
    if (player.adp <= 12) {
      finalScore += 10; // Top 12 overall gets +10 bonus
    } else if (player.adp <= 24) {
      finalScore += 7;  // Top 24 overall gets +7 bonus
    } else if (player.adp <= 36) {
      finalScore += 5;  // Top 36 overall gets +5 bonus
    }
    
    // Add position rank bonus for top players at each position
    // This helps elite TEs and QBs who might not be top 12 overall
    if (player.position !== 'K' && player.position !== 'DST') {
      const positionRankBonus = this.getPositionRankBonus(player);
      finalScore += positionRankBonus;
    }
    
    // Round to whole number
    finalScore = Math.round(finalScore);
    
    // Ensure never 0
    finalScore = Math.max(1, Math.min(100, finalScore));
    
    // Create components for display with REAL DATA ONLY
    const components = {
      pps: pointsScore,                    // Projected points score (always available)
      var: scarcityScore || 0,             // Position scarcity (0 if unknown)
      con: 0,                               // Consistency cannot be calculated without weekly data
      ups: adpScore || 0,                  // Upside based on ADP (0 if no ADP)
      sos: sosScore || 0,                  // SOS from canonical CSV (0 if no data)
      trd: trendScore || 0,                // YoY trend from historical stats (0 if no data)
      inj: player.injuryStatus === 'Healthy' ? 100 : 70  // Injury discount
    };
    
    // Build evaluation object
    const evaluation: EnhancedPlayerEvaluation = {
      ...player,
      cvsScore: finalScore,
      cvsComponents: components,
      recommendedBid: 0,
      marketValue: 0,
      isUndervalued: false,
      positionRank: 0,
      overallRank: 0
    };
    
    // Calculate recommended bid (use actual auction value if available)
    if (player.auctionValue && player.auctionValue > 0) {
      evaluation.recommendedBid = player.auctionValue;
    } else {
      // Fallback: estimate based on CVS score
      evaluation.recommendedBid = Math.max(1, Math.round(finalScore * 0.6));
    }
    
    // Market value (similar to recommended bid)
    evaluation.marketValue = evaluation.recommendedBid;
    
    // Check if undervalued based on CVS vs market
    evaluation.isUndervalued = finalScore > 70 && evaluation.recommendedBid < 30;
    
    // Simple position rank based on CVS within position
    evaluation.positionRank = this.calculateSimplePositionRank(player, finalScore);
    
    // Overall rank based on CVS
    evaluation.overallRank = this.calculateOverallRank(finalScore);
    
    return evaluation;
  }

  /**
   * Get age multiplier from learned curves
   */
  private getAgeMultiplier(player: Player): number {
    if (this.disableAgeFactor) return 1.0;

    const curve = this.ageCurves[player.position];
    if (!curve || curve.ages.length === 0) return 1.0;

    const ageIndex = curve.ages.findIndex(age => age >= player.age);
    
    if (ageIndex === -1) {
      return curve.multipliers[curve.multipliers.length - 1];
    } else if (ageIndex === 0) {
      return curve.multipliers[0];
    } else {
      const age1 = curve.ages[ageIndex - 1];
      const age2 = curve.ages[ageIndex];
      const mult1 = curve.multipliers[ageIndex - 1];
      const mult2 = curve.multipliers[ageIndex];
      
      const ratio = (player.age - age1) / (age2 - age1);
      return mult1 + (mult2 - mult1) * ratio;
    }
  }

  private calculateComponents(player: Player, _context?: MarketContext): CVSComponents {
    return {
      pps: this.calculatePPS(player),
      var: this.calculateVAR(player),
      con: this.calculateConsistency(player),
      ups: this.calculateUpside(player),
      sos: this.calculateSOS(player),
      trd: this.calculateTrend(player),
      inj: this.calculateInjuryDiscount(player)
    };
  }

  private calculatePPS(player: Player): number {
    // Simple projected points score
    const positionMax = this.getPositionMax(player.position);
    const score = (player.projectedPoints / positionMax) * 100;
    return Math.min(95, Math.max(0, score));
  }

  private calculateVAR(player: Player): number {
    // Simple value above replacement calculation
    const replacement = replacementLevels[player.position];
    const valueAbove = player.projectedPoints - replacement;
    const maxValueAbove = this.getMaxValueAbove(player.position);
    const score = (valueAbove / maxValueAbove) * 100;
    return Math.min(100, Math.max(0, score));
  }

  private calculateConsistency(player: Player): number {
    let score = 70;
    
    if (!this.disableAgeFactor) {
      const ageRange = ageOptimalRanges[player.position];
      if (player.age >= ageRange.min && player.age <= ageRange.max) {
        score += 10;
      } else if (player.age < ageRange.min) {
        score -= (ageRange.min - player.age) * 3;
      } else {
        score -= (player.age - ageRange.max) * 4;
      }
    }
    
    if (player.experience >= 3 && player.experience <= 8) {
      score += 10;
    } else if (player.experience < 3) {
      score -= (3 - player.experience) * 5;
    }
    
    if (player.injuryStatus === 'Healthy') {
      score += 10;
    } else if (player.injuryStatus === 'Questionable') {
      score -= 5;
    } else if (player.injuryStatus === 'Doubtful') {
      score -= 15;
    } else if (player.injuryStatus === 'Out' || player.injuryStatus === 'IR') {
      score -= 30;
    }
    
    return Math.min(100, Math.max(0, score));
  }

  private calculateUpside(player: Player | ExtendedPlayer): number {
    let score = 50;
    
    // PPR upside bonus for high-volume receivers
    if ('targets' in player && player.targets) {
      if (player.position === 'RB' && player.targets > 80) {
        score += 10; // Pass-catching RB upside
      } else if (player.position === 'WR' && player.targets > 120) {
        score += 8; // Target monster upside
      } else if (player.position === 'TE' && player.targets > 70) {
        score += 12; // Receiving TE upside
      }
    }
    
    if (!this.disableAgeFactor && player.age <= 25) {
      score += (26 - player.age) * 4;
    }
    
    if (player.experience === 2) {
      score += 20;
    } else if (player.experience === 3) {
      score += 12;
    }
    
    // Simple top 10 check based on projected points
    if (player.projectedPoints > this.getPositionTop10Threshold(player.position)) {
      score += 20;
    }
    
    if (!this.disableAgeFactor) {
      if (player.position === 'RB' && player.age <= 24) {
        score += 10;
      } else if (player.position === 'WR' && player.experience <= 3) {
        score += 10;
      } else if (player.position === 'TE' && player.age <= 26) {
        score += 15;
      }
    }
    
    return Math.min(100, Math.max(0, score));
  }

  protected calculateSOS(player: Player): number {
    // Use real SOS data if available
    if (sosDataService.isReady()) {
      // Get position-adjusted SOS score for regular season
      const regularSOS = sosDataService.getPositionAdjustedSOS(player.team, player.position);
      
      // Also consider fantasy playoff weeks (15-17) with lighter weight
      // These are still regular season weeks but matter more for championship
      const fantasyPlayoffSOS = sosDataService.getFantasyPlayoffSOS(player.team);
      
      // Weight: 80% full season, 20% fantasy playoff weeks
      // Fantasy playoffs matter but shouldn't dominate the evaluation
      const combinedSOS = regularSOS * 0.8 + fantasyPlayoffSOS * 0.2;
      
      return Math.round(combinedSOS);
    }
    
    // Fallback to simple calculation if SOS data not available
    const easyScheduleTeams = ['ARI', 'CAR', 'WAS', 'NYG'];
    const hardScheduleTeams = ['SF', 'BAL', 'BUF', 'KC'];
    
    if (easyScheduleTeams.includes(player.team)) {
      return 75;
    } else if (hardScheduleTeams.includes(player.team)) {
      return 40;
    }
    return 60;
  }

  private calculateTrend(player: Player): number {
    let score = 60;
    
    if (player.experience === 2) {
      score += 15;
    }
    
    if (!this.disableAgeFactor) {
      if (player.age >= 24 && player.age <= 28) {
        score += 10;
      }
      if (player.age >= 30) {
        score -= (player.age - 29) * 5;
      }
    }
    
    if (player.injuryStatus && player.injuryStatus !== 'Healthy') {
      score -= 10;
    }
    
    return Math.min(100, Math.max(0, score));
  }

  private calculateInjuryDiscount(player: Player): number {
    switch (player.injuryStatus) {
      case 'Healthy': return 100;
      case 'Questionable': return 85;
      case 'Doubtful': return 60;
      case 'Out': return 30;
      case 'IR': return 10;
      default: return 100;
    }
  }

  private calculateBaseScore(components: CVSComponents, player?: Player): number {
    const weights = player ? (this.weights[player.position] || this.weights.WR || defaultWeights.WR) : defaultWeights.WR;
    
    if (!weights) {
      console.warn('No weights found for position:', player?.position);
      return 50; // Default score
    }
    
    const score = Object.entries(weights).reduce((total, [key, weight]) => {
      return total + ((components[key as keyof CVSComponents] || 0) * weight);
    }, 0);
    
    // Debug high scores
    if (score > 90 && player) {
      console.log(`[HIGH CVS] ${player.name}: baseScore=${score}, components=`, components, 'weights=', weights);
    }
    
    return score;
  }

  private calculateMarketEfficiency(player: Player, context: MarketContext): number {
    let efficiency = 1.0;
    
    const scarcity = context.positionScarcity.get(player.position) || 1;
    efficiency *= (1 + (scarcity - 1) * 0.1);
    
    const avgRemainingBudget = Array.from(context.remainingBudgets.values())
      .reduce((a, b) => a + b, 0) / context.remainingBudgets.size;
    const expectedBudget = 200 * (1 - context.draftedPlayers.length / 192);
    
    if (avgRemainingBudget > expectedBudget * 1.2) {
      efficiency *= 1.1;
    } else if (avgRemainingBudget < expectedBudget * 0.8) {
      efficiency *= 0.9;
    }
    
    return efficiency;
  }

  private calculateRecommendedBid(player: Player, cvsScore: number, context?: MarketContext): number {
    let baseBid = Math.round(cvsScore * 0.5);
    baseBid = Math.round(baseBid * positionMultipliers[player.position]);
    
    if (context) {
      if (context.recentBids.length > 0) {
        const avgRecent = context.recentBids.reduce((a, b) => a + b, 0) / context.recentBids.length;
        const expectedAvg = 200 / 16;
        
        if (avgRecent > expectedAvg * 1.2) {
          baseBid = Math.round(baseBid * 1.1);
        } else if (avgRecent < expectedAvg * 0.8) {
          baseBid = Math.round(baseBid * 0.95);
        }
      }
    }
    
    return Math.max(1, baseBid);
  }

  private estimateMarketValue(player: Player, context?: MarketContext): number {
    const adpBasedValue = Math.round(Math.max(1, 100 - player.adp) * 0.8);
    
    if (!context) {
      return adpBasedValue;
    }
    
    let marketValue = adpBasedValue;
    
    const similarPlayers = context.draftedPlayers.filter(p => 
      p.position === player.position && 
      Math.abs(p.projectedPoints - player.projectedPoints) < 20
    );
    
    if (similarPlayers.length > 0) {
      const avgPrice = similarPlayers.reduce((sum, p) => sum + p.purchasePrice, 0) / similarPlayers.length;
      marketValue = Math.round((marketValue + avgPrice) / 2);
    }
    
    return Math.max(1, marketValue);
  }

  private calculateSimplePositionRank(player: Player, cvsScore: number): number {
    // Simple rank based on CVS score within position
    // Higher CVS = better rank
    if (cvsScore >= 90) return Math.ceil(Math.random() * 3); // Top 3
    if (cvsScore >= 80) return 3 + Math.ceil(Math.random() * 7); // 4-10
    if (cvsScore >= 70) return 10 + Math.ceil(Math.random() * 10); // 11-20
    if (cvsScore >= 60) return 20 + Math.ceil(Math.random() * 15); // 21-35
    if (cvsScore >= 50) return 35 + Math.ceil(Math.random() * 20); // 36-55
    return 55 + Math.ceil(Math.random() * 45); // 56-100
  }
  
  private calculatePositionRank(player: Player): number {
    // Fallback method using CVS score
    return this.calculateSimplePositionRank(player, 50);
  }

  private calculateOverallRank(cvsScore: number): number {
    if (cvsScore >= 95) return Math.ceil((100 - cvsScore) / 2) + 1;
    if (cvsScore >= 90) return Math.ceil((95 - cvsScore) * 2) + 5;
    if (cvsScore >= 80) return Math.ceil((90 - cvsScore) * 3) + 15;
    if (cvsScore >= 70) return Math.ceil((80 - cvsScore) * 5) + 45;
    if (cvsScore >= 60) return Math.ceil((70 - cvsScore) * 8) + 95;
    return Math.min(300, Math.ceil((60 - cvsScore) * 5) + 175);
  }

  private generateKeyInsights(
    player: Player,
    scores: {
      opportunity: number;
      system: number;
      schedule: number;
      injury: number;
      inefficiency: number;
    }
  ): string[] {
    const insights: string[] = [];
    
    if (scores.opportunity > 75) {
      insights.push('Elite opportunity share in offense');
    } else if (scores.opportunity < 40) {
      insights.push('Limited opportunity concerns');
    }
    
    if (scores.system > 80) {
      insights.push('Perfect system fit for fantasy production');
    } else if (scores.system < 40) {
      insights.push('Poor offensive situation limits upside');
    }
    
    if (scores.schedule > 70) {
      insights.push('Favorable schedule, especially playoffs');
    } else if (scores.schedule < 40) {
      insights.push('Difficult schedule could limit production');
    }
    
    if (scores.injury > 50) {
      insights.push('⚠️ Elevated injury risk');
    }
    
    if (scores.inefficiency > 30) {
      insights.push('💎 Significant market inefficiency detected');
    } else if (scores.inefficiency > 20) {
      insights.push('Potential value pick');
    }
    
    if (player.position === 'RB') {
      if (player.age === 28) {
        insights.push('⚠️ RB cliff age - proceed with caution');
      } else if (player.age <= 24) {
        insights.push('Prime RB age for fantasy production');
      }
    }
    
    if (player.position === 'TE' && player.age >= 25 && player.age <= 27) {
      insights.push('Prime breakout window for TEs');
    }
    
    if (player.experience === 2) {
      insights.push('Sophomore leap candidate (+15% historical improvement)');
    }
    
    return insights;
  }

  private calculateConfidenceLevel(
    player: Player,
    advancedData?: Partial<AdvancedMetrics>
  ): 'high' | 'medium' | 'low' {
    let confidence = 0;
    
    if (advancedData) {
      const dataPoints = Object.keys(advancedData).length;
      confidence += Math.min(30, dataPoints * 3);
    }
    
    if (player.experience >= 3 && player.experience <= 8) {
      confidence += 20;
    }
    
    if (player.injuryStatus === 'Healthy') {
      confidence += 15;
    }
    
    if (player.age >= 24 && player.age <= 29) {
      confidence += 15;
    }
    
    if (player.projectedPoints > 200) {
      confidence += 20;
    }
    
    if (confidence >= 70) return 'high';
    if (confidence >= 40) return 'medium';
    return 'low';
  }

  // Utility methods
  private getPositionMax(position: Position): number {
    const maxPoints: Record<Position, number> = {
      QB: 400,
      RB: 380,
      WR: 340,
      TE: 240,
      K: 150,
      DST: 180
    };
    return maxPoints[position];
  }

  private getMaxValueAbove(position: Position): number {
    const maxVAR: Record<Position, number> = {
      QB: 120,
      RB: 230,
      WR: 200,
      TE: 140,
      K: 30,
      DST: 70
    };
    return maxVAR[position];
  }

  private getPositionTop10Threshold(position: Position): number {
    const thresholds: Record<Position, number> = {
      QB: 330,
      RB: 250,
      WR: 240,
      TE: 160,
      K: 130,
      DST: 140
    };
    return thresholds[position];
  }

  // Public utility methods
  identifySleepers(players: Player[], context?: MarketContext): PlayerEvaluation[] {
    // Initialize thresholds with player data if not done
    this.initializeWithPlayers(players);
    
    const evaluations = players.map(p => this.calculateCVS(p, context));
    
    return evaluations.filter(player => {
      const adpValue = 200 - player.adp;
      const cvsValue = player.cvsScore;
      return cvsValue > adpValue * 1.3 && player.adp > 50;
    }).sort((a, b) => {
      const aDiff = a.cvsScore - (200 - a.adp);
      const bDiff = b.cvsScore - (200 - b.adp);
      return bDiff - aDiff;
    });
  }

  detectPositionRun(recentPicks: DraftedPlayer[], threshold: number = 3): Map<Position, number> {
    const positionCounts = new Map<Position, number>();
    
    recentPicks.forEach(player => {
      const count = positionCounts.get(player.position) || 0;
      positionCounts.set(player.position, count + 1);
    });
    
    const runs = new Map<Position, number>();
    positionCounts.forEach((count, position) => {
      if (count >= threshold) {
        runs.set(position, count);
      }
    });
    
    return runs;
  }

  findLeagueWinners(players: Player[]): EnhancedPlayerEvaluation[] {
    if (!this.useEnhanced) return [];
    
    // Initialize thresholds with player data if not done
    this.initializeWithPlayers(players);
    
    const evaluations = players.map(player => 
      this.calculateCVS(player, undefined, undefined)
    );
    
    return evaluations.filter(playerEval => {
      const hasUpside = playerEval.cvsScore > 70;
      const hasInefficiency = (playerEval.marketInefficiency || 0) > 20;
      const acceptableRisk = (playerEval.injuryRisk || 0) < 50;
      const goodOpportunity = (playerEval.opportunityScore || 0) > 65;
      
      return hasUpside && hasInefficiency && acceptableRisk && goodOpportunity;
    }).sort((a, b) => {
      const aValue = a.cvsScore + (a.marketInefficiency || 0);
      const bValue = b.cvsScore + (b.marketInefficiency || 0);
      return bValue - aValue;
    });
  }

  findLandmines(players: Player[]): EnhancedPlayerEvaluation[] {
    if (!this.useEnhanced) return [];
    
    // Initialize thresholds with player data if not done
    this.initializeWithPlayers(players);
    
    const evaluations = players.map(player => 
      this.calculateCVS(player, undefined, undefined)
    );
    
    return evaluations.filter(playerEval => {
      const highInjuryRisk = (playerEval.injuryRisk || 0) > 60;
      const poorOpportunity = (playerEval.opportunityScore || 0) < 40;
      const badSystem = (playerEval.systemFitScore || 0) < 40;
      const rbCliff = playerEval.position === 'RB' && playerEval.age >= 28;
      const rbCommittee = playerEval.position === 'RB' && (playerEval.opportunityScore || 0) < 50;
      const overvalued = playerEval.recommendedBid < playerEval.marketValue * 0.7;
      
      return highInjuryRisk || poorOpportunity || badSystem || 
             rbCliff || rbCommittee || overvalued;
    });
  }
  
  /**
   * Get position rank bonus for elite players at each position
   */
  private getPositionRankBonus(player: Player): number {
    // This is simplified - ideally would use actual position rankings
    // For now, use projected points as proxy for position rank
    const positionThresholds = {
      'QB': { top3: 380, top6: 350, top12: 320 },
      'RB': { top3: 320, top6: 280, top12: 240 },
      'WR': { top3: 300, top6: 260, top12: 220 },
      'TE': { top3: 200, top6: 160, top12: 120 }
    };
    
    const thresholds = positionThresholds[player.position as keyof typeof positionThresholds];
    if (!thresholds) return 0;
    
    const points = player.projectedPoints;
    if (points >= thresholds.top3) return 5;   // Top 3 at position
    if (points >= thresholds.top6) return 3;   // Top 6 at position
    if (points >= thresholds.top12) return 1;  // Top 12 at position
    return 0;
  }
}

// Export singleton instances
export const evaluationEngine = new UnifiedEvaluationEngine(false);
export const enhancedEvaluationEngine = new UnifiedEvaluationEngine(true);