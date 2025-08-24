/**
 * Enhanced Opponent Modeling Service
 * Returns both aggregate statistics and actual starters when available
 */

import { PlayerProjection } from '../domain/typesCorrected';
import { EnhancedOpponentProjection } from '../stats/jointSimulation';

/**
 * League scoring settings
 */
export interface LeagueScoringSettings {
  passingTD: number;
  passingYards: number;
  interception: number;
  rushingTD: number;
  rushingYards: number;
  reception: number;
  receivingTD: number;
  receivingYards: number;
  fumble: number;
}

/**
 * Opponent roster info
 */
export interface OpponentRoster {
  players: PlayerProjection[];
  locked: Set<string>;
  excluded: Set<string>;
}

/**
 * Build enhanced opponent projection
 */
export function buildOpponentProjection(
  opponentInfo?: OpponentRoster,
  leagueHistorical?: {
    avgScore: number;
    stdDev: number;
  },
  options?: {
    includeStarters?: boolean;
    optimizeLineup?: boolean;
  }
): EnhancedOpponentProjection {
  // Default to league average if no specific opponent
  if (!opponentInfo) {
    return {
      mean: leagueHistorical?.avgScore ?? 115,
      variance: Math.pow(leagueHistorical?.stdDev ?? 25, 2)
    };
  }
  
  // If we have opponent roster, model them specifically
  const { players, locked, excluded } = opponentInfo;
  
  // Filter eligible players
  const eligible = players.filter(p => {
    if (excluded.has(p.player.id)) return false;
    if (p.player.status === 'OUT') return false;
    return true;
  });
  
  // Simple heuristic: pick likely starters
  const starters = selectLikelyStarters(eligible, locked);
  
  // Calculate opponent statistics
  const oppMean = starters.reduce((s, p) => s + p.mean, 0);
  const oppVar = starters.reduce((s, p) => s + p.sd * p.sd, 0);
  
  // Optionally include actual starters for joint simulation
  if (options?.includeStarters) {
    return {
      mean: oppMean,
      variance: oppVar,
      starters
    };
  }
  
  return {
    mean: oppMean,
    variance: oppVar
  };
}

/**
 * Select likely starters based on projections
 * Simple greedy approach - could be enhanced with DP
 */
function selectLikelyStarters(
  eligible: PlayerProjection[],
  locked: Set<string>
): PlayerProjection[] {
  const starters: PlayerProjection[] = [];
  const used = new Set<string>();
  
  // Requirements
  const needs = {
    QB: 1,
    RB: 2,
    WR: 3,
    TE: 1,
    K: 1,
    DST: 1,
    FLEX: 1
  };
  
  // First, add all locked players
  for (const p of eligible) {
    if (locked.has(p.player.id)) {
      starters.push(p);
      used.add(p.player.id);
      
      // Update needs
      const pos = p.player.position;
      if (pos in needs && needs[pos as keyof typeof needs] > 0) {
        needs[pos as keyof typeof needs]--;
      }
    }
  }
  
  // Sort remaining by projected points
  const remaining = eligible
    .filter(p => !used.has(p.player.id))
    .sort((a, b) => b.mean - a.mean);
  
  // Fill required positions
  for (const pos of ['QB', 'K', 'DST', 'TE', 'RB', 'WR'] as const) {
    while (needs[pos] > 0) {
      const player = remaining.find(p => 
        p.player.position === pos && !used.has(p.player.id)
      );
      
      if (player) {
        starters.push(player);
        used.add(player.player.id);
        needs[pos]--;
      } else {
        break; // No more players at this position
      }
    }
  }
  
  // Fill FLEX with best remaining RB/WR/TE
  if (needs.FLEX > 0) {
    const flexEligible = remaining.find(p => 
      ['RB', 'WR', 'TE'].includes(p.player.position) && 
      !used.has(p.player.id)
    );
    
    if (flexEligible) {
      starters.push(flexEligible);
      used.add(flexEligible.player.id);
      needs.FLEX--;
    }
  }
  
  return starters;
}

/**
 * Historical league statistics service
 */
export class LeagueHistoricalService {
  private cache = new Map<string, { avgScore: number; stdDev: number }>();
  
  /**
   * Get historical scoring statistics for a league
   */
  getHistoricalStats(
    leagueId: string,
    scoringSettings: LeagueScoringSettings
  ): { avgScore: number; stdDev: number } {
    const key = this.getCacheKey(leagueId, scoringSettings);
    
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    
    // Default PPR statistics
    const stats = this.calculateDefaultStats(scoringSettings);
    this.cache.set(key, stats);
    
    return stats;
  }
  
  /**
   * Calculate default statistics based on scoring
   */
  private calculateDefaultStats(
    settings: LeagueScoringSettings
  ): { avgScore: number; stdDev: number } {
    // Base PPR averages
    let avgScore = 115;
    let stdDev = 25;
    
    // Adjust for scoring differences
    if (settings.reception === 0) {
      // Standard scoring
      avgScore -= 15;
      stdDev -= 3;
    } else if (settings.reception === 0.5) {
      // Half PPR
      avgScore -= 7;
      stdDev -= 1.5;
    }
    
    // Adjust for TD scoring
    const tdMultiplier = settings.passingTD / 4;
    avgScore *= tdMultiplier;
    stdDev *= Math.sqrt(tdMultiplier);
    
    return { avgScore, stdDev };
  }
  
  private getCacheKey(
    leagueId: string,
    settings: LeagueScoringSettings
  ): string {
    return `${leagueId}:${JSON.stringify(settings)}`;
  }
}

/**
 * Symmetric opponent modeling
 * Both lineups treated equivalently for joint simulation
 */
export function buildSymmetricOpponents(
  myRoster: PlayerProjection[],
  oppRoster: PlayerProjection[],
  myLocked: Set<string>,
  oppLocked: Set<string>,
  options?: {
    optimizeBoth?: boolean;
  }
): {
  myProjection: EnhancedOpponentProjection;
  oppProjection: EnhancedOpponentProjection;
} {
  // Select starters for both sides
  const myStarters = selectLikelyStarters(
    myRoster.filter(p => p.player.status !== 'OUT'),
    myLocked
  );
  
  const oppStarters = selectLikelyStarters(
    oppRoster.filter(p => p.player.status !== 'OUT'),
    oppLocked
  );
  
  // Build projections with starters
  const myProjection: EnhancedOpponentProjection = {
    mean: myStarters.reduce((s, p) => s + p.mean, 0),
    variance: myStarters.reduce((s, p) => s + p.sd * p.sd, 0),
    starters: myStarters
  };
  
  const oppProjection: EnhancedOpponentProjection = {
    mean: oppStarters.reduce((s, p) => s + p.mean, 0),
    variance: oppStarters.reduce((s, p) => s + p.sd * p.sd, 0),
    starters: oppStarters
  };
  
  return { myProjection, oppProjection };
}