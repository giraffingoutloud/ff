/**
 * Build correlation matrices using canonical data insights
 */

import { PlayerProjection } from '../domain/typesCorrected';
import { CanonicalPlayer, TeamPowerRating } from './types';

export class CorrelationBuilder {
  private teamPowerRatings: Map<string, TeamPowerRating>;
  
  constructor(teamPowerRatings: Map<string, TeamPowerRating>) {
    this.teamPowerRatings = teamPowerRatings;
  }
  
  /**
   * Build latent factor loadings for correlation model
   * Using team factors and position relationships
   */
  buildFactorLoadings(projections: PlayerProjection[]): number[][] {
    const n = projections.length;
    const loadings: number[][] = [];
    
    for (let i = 0; i < n; i++) {
      const p1 = projections[i];
      const lambda: number[] = [];
      
      // Factor 1: Same team factor
      const teamFactor = this.getTeamFactor(p1);
      lambda.push(teamFactor);
      
      // Factor 2: Same game factor (opponents)
      const gameFactor = this.getGameFactor(p1);
      lambda.push(gameFactor);
      
      // Factor 3: Position group factor
      const positionFactor = this.getPositionGroupFactor(p1);
      lambda.push(positionFactor);
      
      // Factor 4: QB-dependent factor (for pass catchers)
      const qbFactor = this.getQBDependentFactor(p1);
      lambda.push(qbFactor);
      
      // Ensure ||λ|| ≤ √0.98 for PSD guarantee
      const norm = Math.sqrt(lambda.reduce((s, x) => s + x * x, 0));
      const maxNorm = Math.sqrt(0.98);
      
      if (norm > maxNorm) {
        const scale = maxNorm / norm;
        for (let j = 0; j < lambda.length; j++) {
          lambda[j] *= scale;
        }
      }
      
      loadings.push(lambda);
    }
    
    return loadings;
  }
  
  /**
   * Build pairwise correlations for specific player pairs
   * (Used for validation and special cases)
   */
  buildPairwiseCorrelations(projections: PlayerProjection[]): number[][] {
    const n = projections.length;
    const corr: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      corr[i][i] = 1.0;
      
      for (let j = i + 1; j < n; j++) {
        const p1 = projections[i];
        const p2 = projections[j];
        
        let rho = 0;
        
        // Same team correlation
        if (p1.player.team === p2.player.team) {
          const teamPower = this.teamPowerRatings.get(p1.player.team);
          const teamStrength = teamPower ? 
            Math.min(0.3, 0.15 + teamPower.projectedWins / 100) : 0.15;
          
          // QB-WR/TE stack
          if (p1.player.position === 'QB' && 
              (p2.player.position === 'WR' || p2.player.position === 'TE')) {
            rho = 0.25 + teamStrength; // 0.25-0.55 range
          }
          else if (p2.player.position === 'QB' && 
                   (p1.player.position === 'WR' || p1.player.position === 'TE')) {
            rho = 0.25 + teamStrength;
          }
          // RB-DST negative correlation (game script)
          else if ((p1.player.position === 'RB' && p2.player.position === 'DST') ||
                   (p2.player.position === 'RB' && p1.player.position === 'DST')) {
            rho = -0.15;
          }
          // Same position, same team (cannibalization)
          else if (p1.player.position === p2.player.position) {
            if (p1.player.position === 'WR') {
              rho = -0.10; // WRs compete for targets
            } else if (p1.player.position === 'RB') {
              rho = -0.20; // RBs compete for carries
            }
          }
          // General same team
          else {
            rho = teamStrength;
          }
        }
        
        // Opponent correlation (same game, different teams)
        else if (this.areOpponents(p1, p2)) {
          // QB vs opposing DST
          if ((p1.player.position === 'QB' && p2.player.position === 'DST') ||
              (p2.player.position === 'QB' && p1.player.position === 'DST')) {
            rho = -0.30; // Strong negative
          }
          // General game environment
          else {
            rho = 0.05; // Slight positive (high-scoring game benefits both)
          }
        }
        
        corr[i][j] = rho;
        corr[j][i] = rho;
      }
    }
    
    return corr;
  }
  
  /**
   * Get team-based factor loading
   */
  private getTeamFactor(player: PlayerProjection): number {
    const teamPower = this.teamPowerRatings.get(player.player.team);
    if (!teamPower) return 0.3;
    
    // Stronger teams have higher factor loadings (more consistent)
    const normalized = (teamPower.pointSpreadRating + 10) / 20; // Normalize to ~[0,1]
    return 0.2 + 0.3 * Math.min(1, Math.max(0, normalized));
  }
  
  /**
   * Get game environment factor
   */
  private getGameFactor(player: PlayerProjection): number {
    // Would use actual game matchup data
    // For now, use position-based defaults
    switch (player.player.position) {
      case 'QB': return 0.25;
      case 'WR': return 0.20;
      case 'RB': return 0.15;
      case 'TE': return 0.15;
      case 'K': return 0.10;
      case 'DST': return 0.30;
      default: return 0.10;
    }
  }
  
  /**
   * Get position group factor
   */
  private getPositionGroupFactor(player: PlayerProjection): number {
    switch (player.player.position) {
      case 'QB': return 0.40;
      case 'RB': return 0.35;
      case 'WR': return 0.30;
      case 'TE': return 0.25;
      case 'K': return 0.20;
      case 'DST': return 0.25;
      default: return 0.20;
    }
  }
  
  /**
   * Get QB-dependent factor for pass catchers
   */
  private getQBDependentFactor(player: PlayerProjection): number {
    if (player.player.position !== 'WR' && player.player.position !== 'TE') {
      return 0;
    }
    
    const teamPower = this.teamPowerRatings.get(player.player.team);
    if (!teamPower) return 0.2;
    
    // Higher QB rating = stronger factor loading
    const qbNormalized = (teamPower.qbRating - 3) / 4; // ~[0,1]
    return 0.15 + 0.25 * Math.min(1, Math.max(0, qbNormalized));
  }
  
  /**
   * Check if two players are opponents
   */
  private areOpponents(p1: PlayerProjection, p2: PlayerProjection): boolean {
    // Would check actual game schedule
    // For now return false
    return false;
  }
  
  /**
   * Build team stacking recommendations
   */
  getStackingRecommendations(
    roster: CanonicalPlayer[]
  ): Map<string, string[]> {
    const recommendations = new Map<string, string[]>();
    
    // Group by team
    const byTeam = new Map<string, CanonicalPlayer[]>();
    roster.forEach(p => {
      if (!byTeam.has(p.team)) byTeam.set(p.team, []);
      byTeam.get(p.team)!.push(p);
    });
    
    // Find stacking opportunities
    byTeam.forEach((players, team) => {
      const qb = players.find(p => p.position === 'QB');
      const wrs = players.filter(p => p.position === 'WR');
      const te = players.find(p => p.position === 'TE');
      
      if (qb && (wrs.length > 0 || te)) {
        const stacks: string[] = [];
        
        // Rank WRs by projection
        wrs.sort((a, b) => {
          const aProj = a.context?.projectedPoints || 0;
          const bProj = b.context?.projectedPoints || 0;
          return bProj - aProj;
        });
        
        if (wrs.length > 0) {
          stacks.push(`${qb.name} + ${wrs[0].name} (WR1 stack)`);
        }
        if (te && te.context && te.context.projectedPoints > 80) {
          stacks.push(`${qb.name} + ${te.name} (Elite TE stack)`);
        }
        
        if (stacks.length > 0) {
          recommendations.set(team, stacks);
        }
      }
    });
    
    return recommendations;
  }
}