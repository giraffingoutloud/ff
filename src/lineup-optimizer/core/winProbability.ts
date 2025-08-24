/**
 * Win Probability Calculations
 * Analytical for screening, Monte Carlo for selection
 */
import { PlayerProjection, OpponentProjection } from '../types';
import { RNG } from '../utils/random';
import { simulateCorrelatedLineupTotals, lineupMeanAndVariance } from '../stats/factorCorrelation';
import { normalCDF } from '../utils/normal';

/**
 * Analytical win probability (for screening only)
 * Uses normal approximation: P(X - Y > 0)
 */
export function analyticWinProbability(
  ourMean: number,
  ourVar: number,
  oppMean: number,
  oppVar: number
): number {
  // Z = X - Y ~ N(μ_X - μ_Y, σ²_X + σ²_Y)
  const diffMean = ourMean - oppMean;
  const diffSD = Math.sqrt(ourVar + oppVar);
  
  if (diffSD <= 0) {
    return diffMean > 0 ? 1 : 0;
  }
  
  // P(Z > 0) = Φ(diffMean / diffSD)
  const z = diffMean / diffSD;
  return normalCDF(z);
}

/**
 * Monte Carlo win probability (authoritative)
 * Accounts for correlations and truncation
 */
export function monteCarloWinProbability(
  lineup: PlayerProjection[],
  opponent: OpponentProjection,
  sims: number = 10000,
  seed: number = 12345
): {
  winProbability: number;
  expectedMargin: number;
  marginStd: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
} {
  const rng = new RNG(seed);
  
  // Simulate correlated lineup totals
  const { totals } = simulateCorrelatedLineupTotals(lineup, sims, rng);
  
  // Track margins
  const margins: number[] = new Array(sims);
  let wins = 0;
  let sum = 0;
  let sumsq = 0;
  
  for (let s = 0; s < sims; s++) {
    const ourScore = totals[s];
    const oppScore = opponent.sample();
    const margin = ourScore - oppScore;
    
    margins[s] = margin;
    if (margin > 0) wins++;
    sum += margin;
    sumsq += margin * margin;
  }
  
  // Sort for percentiles
  margins.sort((a, b) => a - b);
  
  // Calculate statistics
  const mean = sum / sims;
  const variance = sumsq / sims - mean * mean;
  const std = Math.sqrt(Math.max(variance, 0));
  
  // Percentile function
  const percentile = (p: number) => {
    const idx = Math.max(0, Math.min(sims - 1, Math.floor(p * sims)));
    return margins[idx];
  };
  
  return {
    winProbability: wins / sims,
    expectedMargin: mean,
    marginStd: std,
    p5: percentile(0.05),
    p25: percentile(0.25),
    p50: percentile(0.50),
    p75: percentile(0.75),
    p95: percentile(0.95)
  };
}

/**
 * Determine strategy based on win probability
 */
export function determineStrategy(
  currentWinProb: number
): 'floor' | 'ceiling' | 'balanced' {
  if (currentWinProb > 0.70) {
    return 'floor';  // Favorite: minimize variance
  } else if (currentWinProb < 0.30) {
    return 'ceiling'; // Underdog: maximize variance
  } else {
    return 'balanced';
  }
}

/**
 * Quick analytical screen for candidate ranking
 */
export function quickScreen(
  lineup: PlayerProjection[],
  oppMean: number,
  oppVar: number
): {
  analyticWinProb: number;
  lineupMean: number;
  lineupVar: number;
} {
  const { mean, variance } = lineupMeanAndVariance(lineup);
  const analyticWinProb = analyticWinProbability(mean, variance, oppMean, oppVar);
  
  return {
    analyticWinProb,
    lineupMean: mean,
    lineupVar: variance
  };
}

/**
 * Calculate confidence interval for win probability
 * Using Wilson score interval for binomial proportion
 */
export function winProbabilityCI(
  wins: number,
  trials: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 1 };
  
  const p = wins / trials;
  const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.645;
  const zsq = z * z;
  
  const denominator = 1 + zsq / trials;
  const center = (p + zsq / (2 * trials)) / denominator;
  const halfWidth = z * Math.sqrt(p * (1 - p) / trials + zsq / (4 * trials * trials)) / denominator;
  
  return {
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth)
  };
}