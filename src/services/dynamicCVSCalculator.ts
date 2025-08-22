/**
 * Dynamic CVS Calculator Service
 * Calculates CVS scores on-the-fly instead of using hardcoded values
 */

import { Player, PlayerEvaluation } from '../types';
import { UnifiedEvaluationEngine } from './unifiedEvaluationEngine';

class DynamicCVSCalculator {
  private engine: UnifiedEvaluationEngine;
  private cache: Map<string, PlayerEvaluation>;

  constructor() {
    this.engine = new UnifiedEvaluationEngine();
    this.cache = new Map();
    // Clear cache on initialization to ensure fresh calculations
    this.clearCache();
  }

  /**
   * Calculate CVS for a single player
   */
  calculatePlayerCVS(player: Player): Player {
    // Don't use existing cvsScore, force recalculation
    const cleanPlayer = { ...player, cvsScore: 0 };
    
    const cacheKey = `${player.id}-${player.projectedPoints}-${player.injuryStatus}`;
    
    // TEMPORARILY DISABLED - Force fresh calculations
    // Check cache first
    // if (this.cache.has(cacheKey)) {
    //   const cached = this.cache.get(cacheKey)!;
    //   console.log(`Using cached CVS for ${player.name}: ${cached.cvsScore}`);
    //   return {
    //     ...player,
    //     cvsScore: cached.cvsScore
    //   };
    // }

    // Calculate fresh CVS
    const evaluation = this.engine.calculateCVS(cleanPlayer);
    
    // Log for first few players or high-value players (for debugging)
    if (this.cache.size < 5 || player.adp <= 5 || player.name === 'Bijan Robinson' || player.name === 'Ja\'Marr Chase') {
      console.log(`[CVS CALC] ${player.name}:`, {
        input: { 
          auctionValue: player.auctionValue,
          adp: player.adp,
          projectedPoints: player.projectedPoints, 
          position: player.position, 
          age: player.age,
          existingCVS: player.cvsScore 
        },
        output: { 
          cvsScore: evaluation.cvsScore, 
          recommendedBid: evaluation.recommendedBid 
        }
      });
    }
    
    // Cache the result
    this.cache.set(cacheKey, evaluation);
    
    const result = {
      ...player,
      cvsScore: evaluation.cvsScore // Keep NaN for K/DST to show N/A
    };
    
    // Verify key fields are preserved
    if (player.name === 'Bijan Robinson' || player.name === 'Ja\'Marr Chase') {
      console.log(`[CVS RETURN] ${player.name}:`, {
        auctionValue: result.auctionValue,
        adp: result.adp,
        cvsScore: result.cvsScore
      });
    }
    
    return result;
  }

  /**
   * Calculate CVS for multiple players
   */
  calculateBulkCVS(players: Player[]): Player[] {
    return players.map(player => this.calculatePlayerCVS(player));
  }

  /**
   * Get full evaluation for a player (includes CVS components)
   */
  getFullEvaluation(player: Player): PlayerEvaluation {
    const cacheKey = `${player.id}-${player.projectedPoints}-${player.injuryStatus}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const evaluation = this.engine.calculateCVS(player);
    this.cache.set(cacheKey, evaluation);
    return evaluation;
  }

  /**
   * Clear the cache (useful when settings change)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get position rank based on CVS scores
   */
  getPositionRanks(players: Player[]): Map<string, number> {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const ranks = new Map<string, number>();

    positions.forEach(position => {
      const positionPlayers = players
        .filter(p => p.position === position)
        .map(p => this.calculatePlayerCVS(p))
        .sort((a, b) => b.cvsScore - a.cvsScore);

      positionPlayers.forEach((player, index) => {
        ranks.set(player.id, index + 1);
      });
    });

    return ranks;
  }

  /**
   * Get overall rank based on CVS scores
   */
  getOverallRanks(players: Player[]): Map<string, number> {
    const ranks = new Map<string, number>();
    
    const allPlayers = players
      .map(p => this.calculatePlayerCVS(p))
      .sort((a, b) => b.cvsScore - a.cvsScore);

    allPlayers.forEach((player, index) => {
      ranks.set(player.id, index + 1);
    });

    return ranks;
  }
}

// Export singleton instance
export const dynamicCVSCalculator = new DynamicCVSCalculator();