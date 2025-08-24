/**
 * Corrected Win Probability Estimation
 * Analytical screening + Monte Carlo with early stopping and SE
 */

import { normalCDF } from '../utils/normal';
import { RNG } from '../utils/rng';
import { PlayerProjection, OpponentProjection } from '../domain/typesCorrected';
import { 
  simulateTotalsCopulaTN, 
  simulateTotalsCopulaTN_LHS,
  simulateJointTotalsCopulaTN 
} from '../stats/simulators2025';

/**
 * Analytical win probability (for quick screening only)
 * Ignores correlations - use only for candidate ranking
 */
export function analyticWinProbability(
  ourMean: number, 
  ourVar: number, 
  oppMean: number, 
  oppVar: number
): number {
  const diffMean = ourMean - oppMean;
  const diffSD = Math.sqrt(Math.max(ourVar + oppVar, 1e-6));
  return normalCDF(diffMean / diffSD);
}

/**
 * Monte Carlo win probability with early stopping
 * This is the authoritative estimate using copula with exact TN marginals
 */
export function monteCarloWinProbabilityEarlyStop(
  lineup: PlayerProjection[],
  opponent: OpponentProjection,
  maxSims: number = 20000,
  targetSE: number = 0.005,
  checkEvery: number = 500,
  seed: number = 1337,
  useLHS: boolean = true
) {
  const rng = new RNG(seed);
  let wins = 0, sum = 0, sumsq = 0, m = 0;
  const margins: number[] = [];
  
  // Batch simulator for efficiency (use LHS for variance reduction)
  const batch = (n: number) => useLHS 
    ? simulateTotalsCopulaTN_LHS(lineup, n, rng)
    : simulateTotalsCopulaTN(lineup, n, rng);

  while (m < maxSims) {
    const n = Math.min(checkEvery, maxSims - m);
    const totals = batch(n);
    
    for (let i = 0; i < n; i++) {
      const our = totals[i];
      const opp = opponent.sample();
      const marg = our - opp;
      margins.push(marg);
      
      if (marg > 0) wins++;
      sum += marg; 
      sumsq += marg * marg;
    }
    
    m += n;
    const p = wins / m;
    const se = Math.sqrt(Math.max(p * (1 - p), 1e-6) / m);
    
    // Early stop if SE target achieved
    if (se < targetSE) break;
  }
  
  // Calculate statistics
  margins.sort((a, b) => a - b);
  const p = wins / m;
  const mean = sum / m;
  const var_ = Math.max(0, sumsq / m - mean * mean);
  
  // Quantile function
  const q = (u: number) => margins[
    Math.max(0, Math.min(margins.length - 1, Math.floor(u * margins.length)))
  ];
  
  return {
    winProbability: p,
    expectedMargin: mean,
    marginStd: Math.sqrt(var_),
    p5: q(0.05), 
    p25: q(0.25), 
    p50: q(0.50), 
    p75: q(0.75), 
    p95: q(0.95),
    mcStdErr: Math.sqrt(Math.max(p * (1 - p), 1e-6) / m),
    sims: m
  };
}

/**
 * Monte Carlo joint win probability with shared factors
 * For when opponent's actual starters are known
 */
export function monteCarloJointWinProbabilityEarlyStop(
  lineup: PlayerProjection[],
  opponentStarters: PlayerProjection[],
  maxSims: number = 20000,
  targetSE: number = 0.005,
  checkEvery: number = 500,
  seed: number = 1447
) {
  const rng = new RNG(seed);
  let wins = 0, sum = 0, sumsq = 0, m = 0;
  const margins: number[] = [];
  
  while (m < maxSims) {
    const n = Math.min(checkEvery, maxSims - m);
    const { totalsA, totalsB } = simulateJointTotalsCopulaTN(
      lineup, 
      opponentStarters, 
      n, 
      rng
    );
    
    for (let i = 0; i < n; i++) {
      const marg = totalsA[i] - totalsB[i];
      margins.push(marg);
      if (marg > 0) wins++;
      sum += marg;
      sumsq += marg * marg;
    }
    
    m += n;
    const p = wins / m;
    const se = Math.sqrt(Math.max(p * (1 - p), 1e-6) / m);
    if (se < targetSE && m >= 1000) break;
  }
  
  margins.sort((a, b) => a - b);
  const p = wins / m;
  const mean = sum / m;
  const var_ = Math.max(0, sumsq / m - mean * mean);
  
  const q = (u: number) => margins[Math.max(0, Math.min(margins.length - 1, Math.floor(u * margins.length)))];
  
  return {
    winProbability: p,
    expectedMargin: mean,
    marginStd: Math.sqrt(var_),
    p5: q(0.05),
    p25: q(0.25),
    p50: q(0.50),
    p75: q(0.75),
    p95: q(0.95),
    mcStdErr: Math.sqrt(Math.max(p * (1 - p), 1e-6) / m),
    sims: m
  };
}