/**
 * Symmetric Opponent Modeling for 2025-2026
 * Uses DP to infer opponent's optimal lineup
 */

import { PlayerProjection, OpponentProjection, LineupRequirements, ESPN_PPR_2025 } from '../domain/typesCorrected';
import { KBestDP } from './kBestDPCorrected';
import { RNG } from '../utils/rng';
import { simulateTotalsCopulaTN } from '../stats/simulators2025';

/**
 * Build opponent projection from their roster using DP
 */
export function opponentFromRoster(
  roster: PlayerProjection[],
  reqs: LineupRequirements = ESPN_PPR_2025,
  sims: number = 8000
): OpponentProjection {
  // Use DP to find opponent's likely starters
  const dp = new KBestDP(30, 2000);
  const candidates = dp.optimizeCandidates(roster, reqs, p => p.mean);
  
  // Best lineup by expected value
  const starters = candidates[0]?.players ?? roster.slice(0, Math.min(10, roster.length));
  
  // Simulate their distribution
  const rng = new RNG(24680);
  const totals = simulateTotalsCopulaTN(starters, sims, rng).sort((a, b) => a - b);
  
  const mean = totals.reduce((s, x) => s + x, 0) / sims;
  const var_ = totals.reduce((s, x) => s + x * x, 0) / sims - mean * mean;
  
  return {
    mean,
    variance: Math.max(var_, 1),
    starters,
    sample: () => {
      const u = Math.random();
      const idx = Math.max(0, Math.min(sims - 1, Math.floor(u * sims)));
      return totals[idx];
    }
  };
}

/**
 * Fallback opponent based on league averages
 */
export function opponentLeagueFallback(
  mean: number,
  sd: number
): OpponentProjection {
  return {
    mean,
    variance: sd * sd,
    sample: () => {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(Math.max(1e-12, u1))) * Math.cos(2 * Math.PI * u2);
      const x = mean + sd * z;
      // Reasonable bounds for fantasy scores
      return Math.max(50, Math.min(260, x));
    }
  };
}

/**
 * Sample across opponent's top-K candidates for uncertainty
 */
export function opponentWithUncertainty(
  roster: PlayerProjection[],
  reqs: LineupRequirements = ESPN_PPR_2025,
  topK: number = 10,
  sims: number = 8000
): OpponentProjection {
  const dp = new KBestDP(50, 2000);
  const candidates = dp.optimizeCandidates(roster, reqs, p => p.mean);
  
  // Take top K candidates
  const topCandidates = candidates.slice(0, Math.min(topK, candidates.length));
  
  if (topCandidates.length === 0) {
    // Fallback if no valid lineups
    return opponentLeagueFallback(115, 25);
  }
  
  // Simulate each candidate
  const rng = new RNG(13579);
  const simsPerCandidate = Math.floor(sims / topCandidates.length);
  const allTotals: number[] = [];
  
  for (const cand of topCandidates) {
    const totals = simulateTotalsCopulaTN(cand.players, simsPerCandidate, rng);
    allTotals.push(...totals);
  }
  
  allTotals.sort((a, b) => a - b);
  
  const mean = allTotals.reduce((s, x) => s + x, 0) / allTotals.length;
  const var_ = allTotals.reduce((s, x) => s + x * x, 0) / allTotals.length - mean * mean;
  
  // Return best candidate's starters for joint simulation
  const starters = topCandidates[0].players;
  
  return {
    mean,
    variance: Math.max(var_, 1),
    starters,
    sample: () => {
      const u = Math.random();
      const idx = Math.max(0, Math.min(allTotals.length - 1, Math.floor(u * allTotals.length)));
      return allTotals[idx];
    }
  };
}

/**
 * League-specific opponent statistics for 2025-2026
 */
export interface LeagueSettings {
  scoringType: 'PPR' | 'HALF_PPR' | 'STANDARD';
  teamCount: number;
  rosterSize: number;
}

export function getLeagueOpponentStats(settings: LeagueSettings): {
  mean: number;
  sd: number;
} {
  // Base statistics for 12-team PPR
  let mean = 115;
  let sd = 25;
  
  // Adjust for scoring type
  switch (settings.scoringType) {
    case 'STANDARD':
      mean -= 15;
      sd -= 3;
      break;
    case 'HALF_PPR':
      mean -= 7;
      sd -= 1.5;
      break;
  }
  
  // Adjust for league size
  if (settings.teamCount === 10) {
    mean += 5;
    sd += 2;
  } else if (settings.teamCount === 14) {
    mean -= 5;
    sd -= 2;
  }
  
  return { mean, sd };
}

/**
 * Build symmetric projections for both sides
 */
export function buildSymmetricProjections(
  myRoster: PlayerProjection[],
  oppRoster: PlayerProjection[],
  reqs: LineupRequirements = ESPN_PPR_2025
): {
  myProjection: OpponentProjection;
  oppProjection: OpponentProjection;
} {
  const myProjection = opponentFromRoster(myRoster, reqs, 5000);
  const oppProjection = opponentFromRoster(oppRoster, reqs, 5000);
  
  return { myProjection, oppProjection };
}