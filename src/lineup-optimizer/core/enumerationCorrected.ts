/**
 * Enumerative Oracle for Verification
 * Exhaustively checks all valid lineups to verify DP correctness
 */

import { PlayerProjection, Position, LineupRequirements } from '../domain/typesCorrected';
import { monteCarloWinProbabilityEarlyStop } from './winProbabilityCorrected';
import { OpponentProjection } from '../domain/typesCorrected';

/**
 * Generate all valid 10-player lineups
 */
export function enumerateAllValidLineups(
  roster: PlayerProjection[],
  reqs: LineupRequirements
): PlayerProjection[][] {
  const n = roster.length;
  const results: PlayerProjection[][] = [];
  
  const choose = (start: number, k: number, acc: number[]) => {
    if (k === 0) {
      const lineup = acc.map(i => roster[i]);
      if (isValidLineup(lineup, reqs)) {
        results.push(lineup);
      }
      return;
    }
    for (let i = start; i <= n - k; i++) {
      choose(i + 1, k - 1, acc.concat(i));
    }
  };
  
  choose(0, 10, []);
  return results;
}

/**
 * Check if lineup satisfies all position requirements
 */
export function isValidLineup(
  lineup: PlayerProjection[], 
  reqs: LineupRequirements
): boolean {
  const counts: Record<Position, number> = { 
    QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 
  };
  
  for (const p of lineup) {
    counts[p.player.position]++;
  }
  
  // Fixed positions
  if (counts.QB !== reqs.QB) return false;
  if (counts.K !== reqs.K) return false;
  if (counts.DST !== reqs.DST) return false;
  
  // Skill positions must total RB + WR + TE + FLEX
  const skill = counts.RB + counts.WR + counts.TE;
  const expectedSkill = reqs.RB + reqs.WR + reqs.TE + reqs.FLEX;
  if (skill !== expectedSkill) return false;
  
  // Minimum requirements
  if (counts.RB < reqs.RB) return false;
  if (counts.WR < reqs.WR) return false;
  if (counts.TE < reqs.TE) return false;
  
  return lineup.length === 10;
}

/**
 * Find the true optimal lineup via exhaustive search
 */
export function oracleArgmaxWinProbability(
  roster: PlayerProjection[],
  reqs: LineupRequirements,
  opponent: OpponentProjection,
  simsPerLineup: number = 4000
): { best: PlayerProjection[]; pwin: number } {
  const all = enumerateAllValidLineups(roster, reqs);
  
  let best: PlayerProjection[] = [];
  let bestP = -1;
  
  for (const L of all) {
    const mc = monteCarloWinProbabilityEarlyStop(
      L, 
      opponent, 
      simsPerLineup, 
      0.01, 
      500, 
      777
    );
    
    if (mc.winProbability > bestP) { 
      bestP = mc.winProbability; 
      best = L; 
    }
  }
  
  return { best, pwin: bestP };
}