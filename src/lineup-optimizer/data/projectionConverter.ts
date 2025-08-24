/**
 * Convert canonical projections to TruncatedNormal distributions
 */

import { TruncatedNormal } from '../stats/truncatedNormalRobust';
import { PlayerProjection, PlayerInfo, GameInfo } from '../domain/typesCorrected';
import { CanonicalPlayer, PlayerContext } from './types';

export class ProjectionConverter {
  private readonly positionBounds = {
    QB: { a: 0, b: 60 },
    RB: { a: 0, b: 50 },
    WR: { a: 0, b: 55 },
    TE: { a: 0, b: 40 },
    K: { a: 0, b: 25 },
    DST: { a: -10, b: 35 }
  };
  
  private readonly baseUncertainty = {
    QB: 0.28,  // 28% CV
    RB: 0.35,  // 35% CV  
    WR: 0.40,  // 40% CV
    TE: 0.42,  // 42% CV
    K: 0.35,   // 35% CV
    DST: 0.45  // 45% CV
  };
  
  /**
   * Convert a canonical player to a PlayerProjection with TN distribution
   */
  convertPlayer(
    player: CanonicalPlayer, 
    week: number = 1,
    useBlending: boolean = true
  ): PlayerProjection {
    // Get position bounds
    const { a, b } = this.positionBounds[player.position];
    
    // Calculate mean projection
    let mean = this.calculateBlendedMean(player, useBlending);
    
    // Apply context adjustments
    mean = this.applyContextAdjustments(mean, player, week);
    
    // Calculate uncertainty
    let cv = this.calculateUncertainty(player);
    let sd = mean * cv;
    
    // Ensure minimum variance
    sd = Math.max(sd, 2.0);
    
    // Create TN distribution
    const tn = new TruncatedNormal(mean, sd, a, b);
    
    // Build player info
    const playerInfo: PlayerInfo = {
      id: player.id,
      name: player.name,
      team: player.team,
      position: player.position,
      status: 'HEALTHY' // Would be updated from Sleeper API
    };
    
    // Build game info
    const gameInfo: GameInfo = {
      gameId: `W${week}_${player.team}`,
      kickoffTimeUTC: '2025-09-07T17:00:00Z', // Would be from schedule
      homeTeam: player.team,
      awayTeam: 'OPP' // Would be from schedule
    };
    
    return {
      player: playerInfo,
      game: gameInfo,
      tn,
      mean: tn.mean(),
      sd: Math.sqrt(tn.variance()),
      lower: a,
      upper: b
    };
  }
  
  /**
   * Blend multiple projection sources
   */
  private calculateBlendedMean(player: CanonicalPlayer, useBlending: boolean): number {
    const ctx = player.context;
    if (!ctx) {
      return this.getBaseProjection(player);
    }
    
    if (!useBlending) {
      return ctx.projectedPoints / (player.projection as any).games || 16;
    }
    
    // Weighted blend of sources
    let totalWeight = 0;
    let weightedSum = 0;
    
    // 1. Base projection (highest weight)
    const baseProj = ctx.projectedPoints / ((player.projection as any).games || 16);
    if (baseProj > 0) {
      const w = 0.5;
      weightedSum += baseProj * w;
      totalWeight += w;
    }
    
    // 2. Historical performance (medium weight)
    if (ctx.historicalGames > 8) {
      const w = 0.3 * Math.min(ctx.historicalGames / 16, 1);
      weightedSum += ctx.historicalMean * w;
      totalWeight += w;
    }
    
    // 3. Market consensus (lower weight)
    if (ctx.marketAdp < 150) {
      // Convert ADP to expected points (rough heuristic)
      const adpPoints = this.adpToPoints(ctx.marketAdp, player.position);
      const w = 0.2 * Math.max(0, (150 - ctx.marketAdp) / 150);
      weightedSum += adpPoints * w;
      totalWeight += w;
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : baseProj;
  }
  
  /**
   * Apply team/QB/SOS context adjustments
   */
  private applyContextAdjustments(
    baseMean: number, 
    player: CanonicalPlayer, 
    week: number
  ): number {
    const ctx = player.context;
    if (!ctx) return baseMean;
    
    let adjustedMean = baseMean;
    
    // Team strength adjustment
    if (ctx.teamPower !== 0) {
      // Teams with positive power rating get boost
      const teamAdj = 1 + (ctx.teamPower / 20); // ±5% per point of power
      adjustedMean *= teamAdj;
    }
    
    // QB quality adjustment for pass catchers
    if (ctx.qbPower > 0 && (player.position === 'WR' || player.position === 'TE')) {
      const qbAdj = 1 + ((ctx.qbPower - 3.5) / 10); // 3.5 is average QB rating
      adjustedMean *= qbAdj;
    }
    
    // SOS adjustment for QBs
    if (player.position === 'QB' && ctx.sosWeekly !== null) {
      // Lower rank = harder matchup = negative adjustment
      const sosAdj = 1 - ((16 - ctx.sosWeekly) / 50); // ±32% range
      adjustedMean *= sosAdj;
    }
    
    // Bye week check
    const byeWeek = (player.projection as any).byeWeek;
    if (byeWeek === week) {
      adjustedMean = 0;
    }
    
    return Math.max(0, adjustedMean);
  }
  
  /**
   * Calculate uncertainty based on multiple factors
   */
  private calculateUncertainty(player: CanonicalPlayer): number {
    let cv = this.baseUncertainty[player.position];
    const ctx = player.context;
    
    if (!ctx) return cv;
    
    // Less uncertainty for top players
    if (ctx.marketAdp < 50) {
      cv *= 0.85;
    } else if (ctx.marketAdp < 100) {
      cv *= 0.92;
    }
    
    // More uncertainty if limited historical data
    if (ctx.historicalGames < 8) {
      cv *= 1.15;
    }
    
    // Use market uncertainty if available
    if (ctx.marketUncertainty > 0) {
      const marketCV = ctx.marketUncertainty / Math.max(1, ctx.projectedPoints / 16);
      cv = (cv + marketCV) / 2; // Average the two
    }
    
    return Math.min(0.6, Math.max(0.15, cv)); // Cap between 15% and 60%
  }
  
  /**
   * Get base projection from raw data
   */
  private getBaseProjection(player: CanonicalPlayer): number {
    const proj = player.projection;
    
    if ('fantasyPoints' in proj && 'games' in proj) {
      return proj.fantasyPoints / (proj.games || 16);
    }
    
    return 10; // Default fallback
  }
  
  /**
   * Convert ADP to expected points (heuristic)
   */
  private adpToPoints(adp: number, position: string): number {
    // Rough conversion based on historical data
    const adpCurves = {
      QB: (adp: number) => Math.max(8, 25 - adp * 0.15),
      RB: (adp: number) => Math.max(5, 22 - adp * 0.18),
      WR: (adp: number) => Math.max(5, 20 - adp * 0.16),
      TE: (adp: number) => Math.max(4, 14 - adp * 0.12),
      K: (adp: number) => Math.max(6, 10 - adp * 0.02),
      DST: (adp: number) => Math.max(4, 12 - adp * 0.04)
    };
    
    const curve = adpCurves[position as keyof typeof adpCurves];
    return curve ? curve(adp) : 8;
  }
  
  /**
   * Convert multiple players
   */
  convertRoster(
    players: CanonicalPlayer[], 
    week: number = 1,
    useBlending: boolean = true
  ): PlayerProjection[] {
    return players.map(p => this.convertPlayer(p, week, useBlending));
  }
}