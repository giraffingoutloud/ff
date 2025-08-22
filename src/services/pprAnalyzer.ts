/**
 * PPR (Points Per Reception) Analyzer
 * Analyzes and adjusts player values based on PPR-specific metrics
 */

import { Player, Position } from '../types';

export interface PPRMetrics {
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  catchRate: number;
  yardsPerReception: number;
  targetShare: number;
  redZoneTargets?: number;
  pprPoints: number;
  standardPoints: number;
  pprBonus: number;
}

export interface ExtendedPlayer extends Player {
  rushAttempts?: number;
  rushYards?: number;
  rushTDs?: number;
  targets?: number;
  receptions?: number;
  receivingYards?: number;
  receivingTDs?: number;
  pprMetrics?: PPRMetrics;
  auctionValue?: number; // Actual auction dollar value
}

export class PPRAnalyzer {
  /**
   * Calculate PPR-specific metrics from raw stats
   */
  calculatePPRMetrics(player: ExtendedPlayer): PPRMetrics {
    const targets = player.targets || 0;
    const receptions = player.receptions || 0;
    const receivingYards = player.receivingYards || 0;
    const receivingTDs = player.receivingTDs || 0;
    
    // Calculate catch rate
    const catchRate = targets > 0 ? receptions / targets : 0;
    
    // Calculate yards per reception
    const yardsPerReception = receptions > 0 ? receivingYards / receptions : 0;
    
    // Estimate target share (position-based averages)
    const targetShare = this.estimateTargetShare(player, targets);
    
    // Calculate PPR vs Standard scoring difference
    const pprPoints = this.calculatePPRPoints(player);
    const standardPoints = this.calculateStandardPoints(player);
    const pprBonus = pprPoints - standardPoints;
    
    return {
      targets,
      receptions,
      receivingYards,
      receivingTDs,
      catchRate,
      yardsPerReception,
      targetShare,
      pprPoints,
      standardPoints,
      pprBonus
    };
  }
  
  /**
   * Calculate total PPR fantasy points
   */
  private calculatePPRPoints(player: ExtendedPlayer): number {
    let points = 0;
    
    // Rushing stats (all positions)
    const rushYards = player.rushYards || 0;
    const rushTDs = player.rushTDs || 0;
    points += rushYards * 0.1; // 1 point per 10 yards
    points += rushTDs * 6;
    
    // Receiving stats (PPR scoring)
    const receptions = player.receptions || 0;
    const receivingYards = player.receivingYards || 0;
    const receivingTDs = player.receivingTDs || 0;
    points += receptions * 1; // PPR: 1 point per reception
    points += receivingYards * 0.1; // 1 point per 10 yards
    points += receivingTDs * 6;
    
    return points;
  }
  
  /**
   * Calculate standard (non-PPR) fantasy points
   */
  private calculateStandardPoints(player: ExtendedPlayer): number {
    let points = 0;
    
    // Rushing stats
    const rushYards = player.rushYards || 0;
    const rushTDs = player.rushTDs || 0;
    points += rushYards * 0.1;
    points += rushTDs * 6;
    
    // Receiving stats (standard scoring - no PPR)
    const receivingYards = player.receivingYards || 0;
    const receivingTDs = player.receivingTDs || 0;
    points += receivingYards * 0.1;
    points += receivingTDs * 6;
    
    return points;
  }
  
  /**
   * Estimate target share based on position and volume
   */
  private estimateTargetShare(player: ExtendedPlayer, targets: number): number {
    // Average team targets per game: ~35-40
    // 17 game season = ~600-680 targets
    const avgTeamTargets = 640;
    
    // Position-based adjustments
    const positionTargetRanges: Record<Position, [number, number]> = {
      RB: [40, 120],   // RBs: 6-18% of team targets
      WR: [60, 180],   // WRs: 9-28% of team targets
      TE: [40, 150],   // TEs: 6-23% of team targets
      QB: [0, 0],      // QBs don't get targets
      K: [0, 0],       // Kickers don't get targets
      DST: [0, 0]      // DST doesn't get targets
    };
    
    const [min, max] = positionTargetRanges[player.position] || [0, 0];
    if (max === 0) return 0;
    
    // Calculate estimated target share
    const targetShare = (targets / avgTeamTargets) * 100;
    return Math.min(30, Math.max(0, targetShare)); // Cap at 30%
  }
  
  /**
   * Get PPR value adjustment multiplier
   */
  getPPRAdjustment(player: ExtendedPlayer): number {
    const metrics = player.pprMetrics || this.calculatePPRMetrics(player);
    
    // Base multiplier is 1.0 (no adjustment)
    let multiplier = 1.0;
    
    // Position-specific PPR value boosts
    switch (player.position) {
      case 'RB':
        // Pass-catching RBs get biggest boost in PPR
        if (metrics.receptions >= 60) {
          multiplier = 1.25; // Elite pass-catcher
        } else if (metrics.receptions >= 40) {
          multiplier = 1.15; // Good pass-catcher
        } else if (metrics.receptions >= 25) {
          multiplier = 1.05; // Decent pass-catcher
        } else {
          multiplier = 0.95; // Rushing-only back worth less in PPR
        }
        break;
        
      case 'WR':
        // Volume receivers get boost, deep threats get less
        if (metrics.catchRate >= 0.70 && metrics.receptions >= 80) {
          multiplier = 1.15; // Possession receiver
        } else if (metrics.receptions >= 100) {
          multiplier = 1.20; // Target monster
        } else if (metrics.yardsPerReception >= 15 && metrics.receptions < 60) {
          multiplier = 0.90; // Boom/bust deep threat
        }
        break;
        
      case 'TE':
        // High-volume TEs are gold in PPR
        if (metrics.receptions >= 70) {
          multiplier = 1.30; // Elite receiving TE
        } else if (metrics.receptions >= 50) {
          multiplier = 1.15; // Good receiving TE
        } else if (metrics.receptions < 30) {
          multiplier = 0.85; // Blocking TE
        }
        break;
        
      default:
        // QB, K, DST don't change in PPR
        multiplier = 1.0;
    }
    
    return multiplier;
  }
  
  /**
   * Identify PPR-specific sleepers
   */
  findPPRSleepers(players: ExtendedPlayer[]): ExtendedPlayer[] {
    return players.filter(player => {
      if (!['RB', 'WR', 'TE'].includes(player.position)) return false;
      
      const metrics = player.pprMetrics || this.calculatePPRMetrics(player);
      
      // High reception volume but low ADP
      const isVolumeSleeper = metrics.receptions >= 60 && player.adp > 100;
      
      // High target share but undervalued
      const isTargetSleeper = metrics.targetShare >= 18 && player.adp > 80;
      
      // Big PPR bonus not reflected in ADP
      const isPPRValueSleeper = metrics.pprBonus >= 50 && player.adp > 60;
      
      return isVolumeSleeper || isTargetSleeper || isPPRValueSleeper;
    });
  }
  
  /**
   * Identify players to avoid in PPR
   */
  findPPRLandmines(players: ExtendedPlayer[]): ExtendedPlayer[] {
    return players.filter(player => {
      if (!['RB', 'WR', 'TE'].includes(player.position)) return false;
      
      const metrics = player.pprMetrics || this.calculatePPRMetrics(player);
      
      // High ADP but low reception volume
      const isLowVolume = player.adp < 50 && metrics.receptions < 30;
      
      // Poor catch rate
      const isPoorCatcher = metrics.catchRate < 0.60 && player.position === 'RB';
      
      // TD-dependent with low volume
      const isTDDependent = 
        metrics.receivingTDs > 8 && 
        metrics.receptions < 50 && 
        player.adp < 100;
      
      return isLowVolume || isPoorCatcher || isTDDependent;
    });
  }
  
  /**
   * Get PPR tier adjustments
   */
  getPPRTierAdjustment(player: ExtendedPlayer): number {
    const metrics = player.pprMetrics || this.calculatePPRMetrics(player);
    
    // Tier adjustments based on reception volume
    if (player.position === 'RB') {
      if (metrics.receptions >= 80) return -1; // Move up a tier
      if (metrics.receptions < 20) return +1; // Move down a tier
    } else if (player.position === 'WR') {
      if (metrics.receptions >= 100) return -1; // Move up a tier
      if (metrics.receptions < 50) return +1; // Move down a tier
    } else if (player.position === 'TE') {
      if (metrics.receptions >= 70) return -1; // Move up a tier
      if (metrics.receptions < 35) return +1; // Move down a tier
    }
    
    return 0; // No tier adjustment
  }
  
  /**
   * Compare PPR vs Standard value
   */
  comparePPRValue(player: ExtendedPlayer): {
    format: 'PPR' | 'Standard' | 'Neutral';
    differential: number;
    recommendation: string;
  } {
    const metrics = player.pprMetrics || this.calculatePPRMetrics(player);
    const differential = metrics.pprBonus;
    
    let format: 'PPR' | 'Standard' | 'Neutral';
    let recommendation: string;
    
    if (differential >= 60) {
      format = 'PPR';
      recommendation = `Strong PPR target - ${metrics.receptions} receptions worth ${differential.toFixed(0)} extra points`;
    } else if (differential >= 30) {
      format = 'PPR';
      recommendation = `Good PPR value - consistent reception volume`;
    } else if (differential <= 10) {
      format = 'Standard';
      recommendation = `Better in standard - low reception volume (${metrics.receptions})`;
    } else {
      format = 'Neutral';
      recommendation = `Similar value in both formats`;
    }
    
    return { format, differential, recommendation };
  }
}

// Export singleton
export const pprAnalyzer = new PPRAnalyzer();