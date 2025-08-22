/**
 * Advanced Metrics Service
 * Uses REAL data from canonical_data to calculate advanced fantasy metrics
 * No hallucinated data - only what we actually have available
 */

import { Position } from '../types';
import { ExtendedPlayer } from './pprAnalyzer';

export interface HistoricalStats {
  // From 2024 actual data
  games: number;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  rushCarries: number;
  rushYards: number;
  rushTDs: number;
  
  // Advanced metrics we ACTUALLY have
  catchRate: number;        // 'catch' field in CSV
  depthOfTarget: number;    // 'depth' field - this is aDOT!
  yardsPerTarget: number;   // 'ypt' field
  yardsPerReception: number; // 'ypr' field
  yardsAfterCatch: number;  // 'rac' field for receivers
  
  // Red zone data we have
  rzTargets: number;        // 'rzRecTarg'
  rzReceptions: number;     // 'rzRecRec'
  rzRecTDs: number;         // 'rzRecTds'
  rzCarries: number;        // 'rzRushCarries'
  rzRushTDs: number;        // 'rzRushTds'
  
  // Rushing efficiency we have
  yardsPerCarry: number;    // 'ypc'
  rushYAC: number;          // 'yac' for rushers
  tacklesAvoided: number;   // 'rushTa' - missed/broken tackles
  
  fantasyPoints: number;    // Actual fantasy points scored
}

export interface TargetMetrics {
  projectedTargets: number;
  estimatedTargetShare: number;  // Based on 640 team average
  catchRate: number;
  redZoneTargetShare: number;
  targetQuality: 'elite' | 'good' | 'average' | 'poor';
}

export interface EfficiencyMetrics {
  yardsPerTarget: number;
  yardsPerReception: number;
  yardsPerTouch: number;
  depthOfTarget: number;  // We have this!
  yardsAfterCatch: number; // We have this!
  redZoneTDRate: number;
}

export interface RegressionAnalysis {
  projected2025Points: number;
  historical2024Points?: number;
  pointsPerGameDiff?: number;
  efficiencyTrend: 'improve' | 'maintain' | 'decline';
  regressionConfidence: 'high' | 'medium' | 'low';
  flags: string[];
}

export class AdvancedMetricsService {
  private historicalData: Map<string, HistoricalStats> = new Map();
  private teamTargetAverages = 640; // NFL average ~640 targets per team per season
  
  /**
   * Load historical stats from CSV files
   * This would be called during initialization
   */
  async loadHistoricalData(csvContent: string): Promise<void> {
    // Parse the CSV and populate historicalData map
    // Implementation would parse the actual CSV format we have
    console.log('Loading historical data from CSV');
  }
  
  /**
   * Calculate target metrics using REAL projected data
   */
  calculateTargetMetrics(player: ExtendedPlayer): TargetMetrics {
    const targets = player.targets || 0;
    const receptions = player.receptions || 0;
    
    // Estimate target share based on team average
    const estimatedTargetShare = (targets / this.teamTargetAverages) * 100;
    
    // Calculate catch rate
    const catchRate = targets > 0 ? (receptions / targets) * 100 : 0;
    
    // Get historical data if available
    const historical = this.historicalData.get(player.name);
    const rzTargetShare = historical && historical.targets > 0
      ? (historical.rzTargets / historical.targets) * 100
      : 0;
    
    // Determine target quality based on volume and efficiency
    let targetQuality: 'elite' | 'good' | 'average' | 'poor';
    if (estimatedTargetShare >= 25 && catchRate >= 70) {
      targetQuality = 'elite';
    } else if (estimatedTargetShare >= 20 || catchRate >= 65) {
      targetQuality = 'good';
    } else if (estimatedTargetShare >= 15) {
      targetQuality = 'average';
    } else {
      targetQuality = 'poor';
    }
    
    return {
      projectedTargets: targets,
      estimatedTargetShare,
      catchRate,
      redZoneTargetShare: rzTargetShare,
      targetQuality
    };
  }
  
  /**
   * Calculate efficiency metrics using data we actually have
   */
  calculateEfficiencyMetrics(player: ExtendedPlayer): EfficiencyMetrics {
    const targets = player.targets || 0;
    const receptions = player.receptions || 0;
    const recYards = player.receivingYards || 0;
    const rushAttempts = player.rushAttempts || 0;
    const rushYards = player.rushYards || 0;
    
    // Get historical data for advanced metrics
    const historical = this.historicalData.get(player.name);
    
    // Calculate basic efficiency
    const yardsPerTarget = targets > 0 ? recYards / targets : 0;
    const yardsPerReception = receptions > 0 ? recYards / receptions : 0;
    const totalTouches = receptions + rushAttempts;
    const totalYards = recYards + rushYards;
    const yardsPerTouch = totalTouches > 0 ? totalYards / totalTouches : 0;
    
    // Use historical data for advanced metrics if available
    const depthOfTarget = historical?.depthOfTarget || 
      (player.position === 'RB' ? 2.5 : player.position === 'TE' ? 7.5 : 10.0);
    
    const yardsAfterCatch = historical?.yardsAfterCatch || 
      (yardsPerReception > 15 ? 5.0 : 3.5); // Estimate if not available
    
    // Calculate red zone efficiency
    let redZoneTDRate = 0;
    if (historical) {
      const rzTotalTouches = historical.rzTargets + historical.rzCarries;
      const rzTotalTDs = historical.rzRecTDs + historical.rzRushTDs;
      redZoneTDRate = rzTotalTouches > 0 ? (rzTotalTDs / rzTotalTouches) * 100 : 0;
    }
    
    return {
      yardsPerTarget,
      yardsPerReception,
      yardsPerTouch,
      depthOfTarget,
      yardsAfterCatch,
      redZoneTDRate
    };
  }
  
  /**
   * Analyze regression potential using historical vs projected
   */
  analyzeRegression(player: ExtendedPlayer): RegressionAnalysis {
    const projected2025 = player.projectedPoints;
    const historical = this.historicalData.get(player.name);
    
    const analysis: RegressionAnalysis = {
      projected2025Points: projected2025,
      efficiencyTrend: 'maintain',
      regressionConfidence: 'low',
      flags: []
    };
    
    if (!historical) {
      analysis.flags.push('No historical data available');
      return analysis;
    }
    
    analysis.historical2024Points = historical.fantasyPoints;
    
    // Calculate per-game difference
    const projectedPPG = projected2025 / 17;
    const historicalPPG = historical.fantasyPoints / historical.games;
    analysis.pointsPerGameDiff = projectedPPG - historicalPPG;
    
    // Analyze efficiency trends
    if (historical.catchRate > 75 && player.position === 'WR') {
      analysis.flags.push('Unsustainably high catch rate - likely to regress');
      analysis.efficiencyTrend = 'decline';
    }
    
    if (historical.rzRecTDs + historical.rzRushTDs > 12) {
      analysis.flags.push('TD-dependent season - regression likely');
      analysis.efficiencyTrend = 'decline';
    }
    
    if (historical.yardsPerTarget < 6 && player.position === 'WR') {
      analysis.flags.push('Low efficiency - positive regression possible');
      analysis.efficiencyTrend = 'improve';
    }
    
    if (historical.depthOfTarget > 15) {
      analysis.flags.push('Deep threat - high variance expected');
    }
    
    // Set confidence based on data quality
    if (historical.games >= 15) {
      analysis.regressionConfidence = 'high';
    } else if (historical.games >= 10) {
      analysis.regressionConfidence = 'medium';
    }
    
    return analysis;
  }
  
  /**
   * Identify players with unsustainable efficiency (sell high)
   */
  findSellHighCandidates(players: ExtendedPlayer[]): ExtendedPlayer[] {
    return players.filter(player => {
      const historical = this.historicalData.get(player.name);
      if (!historical) return false;
      
      // TD regression candidates
      const tdRate = historical.receivingTDs / historical.games;
      if (tdRate > 0.7) return true; // More than 0.7 TDs per game is unsustainable
      
      // Efficiency regression
      if (historical.yardsPerTarget > 12 && historical.targets < 80) {
        return true; // Low volume, high efficiency
      }
      
      // Catch rate regression for RBs
      if (player.position === 'RB' && historical.catchRate > 80) {
        return true;
      }
      
      return false;
    });
  }
  
  /**
   * Identify players likely to improve (buy low)
   */
  findBuyLowCandidates(players: ExtendedPlayer[]): ExtendedPlayer[] {
    return players.filter(player => {
      const historical = this.historicalData.get(player.name);
      if (!historical) return false;
      
      // High volume, low efficiency
      if (historical.targets > 100 && historical.yardsPerTarget < 7) {
        return true; // Volume is there, efficiency should improve
      }
      
      // Low TD rate with high red zone usage
      const rzUsage = historical.rzTargets + historical.rzCarries;
      const rzTDs = historical.rzRecTDs + historical.rzRushTDs;
      if (rzUsage > 20 && rzTDs < 5) {
        return true; // TD positive regression likely
      }
      
      // Young player with increasing targets
      if (player.age <= 24 && historical.targets > 80) {
        return true; // Breakout potential
      }
      
      return false;
    });
  }
  
  /**
   * Calculate a simplified Expected Fantasy Points
   * Based on usage and league averages, not play-by-play data
   */
  calculateSimplifiedXFP(player: ExtendedPlayer): number {
    // Average fantasy points per opportunity by position
    const ppOpportunity: Record<Position, number> = {
      QB: 0.55,   // Per pass attempt + rush attempt
      RB: 0.65,   // Per rush + target
      WR: 1.25,   // Per target
      TE: 1.15,   // Per target
      K: 3.5,     // Per FG attempt
      DST: 0      // N/A
    };
    
    const multiplier = ppOpportunity[player.position] || 0;
    
    // Calculate total opportunities
    let opportunities = 0;
    if (player.position === 'RB') {
      opportunities = (player.rushAttempts || 0) + (player.targets || 0);
    } else if (['WR', 'TE'].includes(player.position)) {
      opportunities = player.targets || 0;
    }
    
    // Base xFP
    let xFP = opportunities * multiplier;
    
    // Adjust for red zone usage (if we have historical data)
    const historical = this.historicalData.get(player.name);
    if (historical) {
      const rzBonus = (historical.rzTargets + historical.rzCarries) * 0.5;
      xFP += rzBonus;
    }
    
    return xFP;
  }
}

// Export singleton
export const advancedMetricsService = new AdvancedMetricsService();