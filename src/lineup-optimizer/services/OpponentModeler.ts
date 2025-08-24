import { PlayerProjection, OpponentProjection } from '../types';
import { CorrelationModel } from './CorrelationModel';

/**
 * Opponent Modeler
 * Models opponent's projected score distribution using same projection engine
 */
export class OpponentModeler {
  private correlationModel: CorrelationModel;
  
  constructor() {
    this.correlationModel = new CorrelationModel();
  }
  
  /**
   * Model opponent's score distribution from their roster
   */
  modelOpponent(
    opponentRoster: PlayerProjection[],
    assumeOptimalLineup: boolean = true
  ): OpponentProjection {
    let lineup: PlayerProjection[];
    
    if (assumeOptimalLineup) {
      // Assume opponent sets optimal lineup
      lineup = this.selectOptimalLineup(opponentRoster);
    } else {
      // Use provided lineup as-is
      lineup = opponentRoster.filter(p => p.player.isActive);
    }
    
    // Calculate mean and variance with correlations
    const correlationMatrix = this.correlationModel.calculateCorrelationMatrix(lineup);
    const mean = lineup.reduce((sum, p) => sum + p.projection.mean, 0);
    const variance = this.correlationModel.calculateLineupVariance(lineup, correlationMatrix);
    
    // Calculate percentiles using normal approximation
    const stdDev = Math.sqrt(variance);
    const percentiles = {
      p10: mean - 1.282 * stdDev,
      p25: mean - 0.674 * stdDev,
      p50: mean,
      p75: mean + 0.674 * stdDev,
      p90: mean + 1.282 * stdDev
    };
    
    return {
      mean,
      variance,
      percentiles
    };
  }
  
  /**
   * Estimate opponent distribution from league averages
   */
  estimateFromLeagueAverages(
    leagueSize: number = 12,
    scoringSettings: 'PPR' | 'HALF_PPR' | 'STANDARD' = 'PPR'
  ): OpponentProjection {
    // League average scores by format (based on historical data)
    const averages = {
      'PPR': { mean: 125, stdDev: 25 },
      'HALF_PPR': { mean: 115, stdDev: 23 },
      'STANDARD': { mean: 105, stdDev: 20 }
    };
    
    const settings = averages[scoringSettings];
    
    // Adjust for league size (deeper leagues = lower scores)
    const sizeAdjustment = 1 - (leagueSize - 10) * 0.02;
    const mean = settings.mean * sizeAdjustment;
    const stdDev = settings.stdDev;
    const variance = stdDev * stdDev;
    
    return {
      mean,
      variance,
      percentiles: {
        p10: mean - 1.282 * stdDev,
        p25: mean - 0.674 * stdDev,
        p50: mean,
        p75: mean + 0.674 * stdDev,
        p90: mean + 1.282 * stdDev
      }
    };
  }
  
  /**
   * Model opponent with partial information
   */
  modelWithPartialInfo(
    knownStarters: PlayerProjection[],
    leagueContext: { size: number; scoring: 'PPR' | 'HALF_PPR' | 'STANDARD' }
  ): OpponentProjection {
    // Calculate known portion
    const knownMean = knownStarters.reduce((sum, p) => sum + p.projection.mean, 0);
    const knownCorrelations = this.correlationModel.calculateCorrelationMatrix(knownStarters);
    const knownVariance = this.correlationModel.calculateLineupVariance(
      knownStarters,
      knownCorrelations
    );
    
    // Estimate unknown portion from league averages
    const fullEstimate = this.estimateFromLeagueAverages(
      leagueContext.size,
      leagueContext.scoring
    );
    
    // Assume known starters represent 60-70% of total score
    const knownWeight = 0.65;
    const unknownWeight = 1 - knownWeight;
    
    const totalMean = knownMean / knownWeight;
    const unknownMean = totalMean * unknownWeight;
    const unknownVariance = (fullEstimate.variance - knownVariance) * unknownWeight;
    
    const combinedVariance = knownVariance + unknownVariance;
    const stdDev = Math.sqrt(combinedVariance);
    
    return {
      mean: totalMean,
      variance: combinedVariance,
      percentiles: {
        p10: totalMean - 1.282 * stdDev,
        p25: totalMean - 0.674 * stdDev,
        p50: totalMean,
        p75: totalMean + 0.674 * stdDev,
        p90: totalMean + 1.282 * stdDev
      }
    };
  }
  
  /**
   * Select optimal lineup from roster (simplified)
   */
  private selectOptimalLineup(roster: PlayerProjection[]): PlayerProjection[] {
    // Group by position
    const byPosition = new Map<string, PlayerProjection[]>();
    
    for (const player of roster) {
      const pos = player.player.position;
      if (!byPosition.has(pos)) {
        byPosition.set(pos, []);
      }
      byPosition.get(pos)!.push(player);
    }
    
    // Sort each position by mean projection
    for (const players of byPosition.values()) {
      players.sort((a, b) => b.projection.mean - a.projection.mean);
    }
    
    // Select starters (ESPN standard)
    const lineup: PlayerProjection[] = [];
    
    // QB: 1
    const qbs = byPosition.get('QB') || [];
    if (qbs.length > 0) lineup.push(qbs[0]);
    
    // RB: 2
    const rbs = byPosition.get('RB') || [];
    lineup.push(...rbs.slice(0, 2));
    
    // WR: 3
    const wrs = byPosition.get('WR') || [];
    lineup.push(...wrs.slice(0, 3));
    
    // TE: 1
    const tes = byPosition.get('TE') || [];
    if (tes.length > 0) lineup.push(tes[0]);
    
    // FLEX: Best remaining RB/WR/TE
    const flexCandidates = [
      ...rbs.slice(2),
      ...wrs.slice(3),
      ...tes.slice(1)
    ].sort((a, b) => b.projection.mean - a.projection.mean);
    
    if (flexCandidates.length > 0) lineup.push(flexCandidates[0]);
    
    // K: 1
    const ks = byPosition.get('K') || [];
    if (ks.length > 0) lineup.push(ks[0]);
    
    // DST: 1
    const dsts = byPosition.get('DST') || [];
    if (dsts.length > 0) lineup.push(dsts[0]);
    
    return lineup;
  }
  
  /**
   * Adjust opponent model based on recent performance
   */
  adjustForRecentPerformance(
    baseProjection: OpponentProjection,
    recentScores: number[],
    weight: number = 0.3
  ): OpponentProjection {
    if (recentScores.length === 0) return baseProjection;
    
    // Calculate recent stats
    const recentMean = recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length;
    const recentVariance = recentScores.reduce((sum, s) => 
      sum + Math.pow(s - recentMean, 2), 0) / recentScores.length;
    
    // Weighted average
    const adjustedMean = baseProjection.mean * (1 - weight) + recentMean * weight;
    const adjustedVariance = baseProjection.variance * (1 - weight) + recentVariance * weight;
    
    const stdDev = Math.sqrt(adjustedVariance);
    
    return {
      mean: adjustedMean,
      variance: adjustedVariance,
      percentiles: {
        p10: adjustedMean - 1.282 * stdDev,
        p25: adjustedMean - 0.674 * stdDev,
        p50: adjustedMean,
        p75: adjustedMean + 0.674 * stdDev,
        p90: adjustedMean + 1.282 * stdDev
      }
    };
  }
}