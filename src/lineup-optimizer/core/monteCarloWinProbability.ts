/**
 * Monte Carlo Win Probability Estimation
 * 
 * Authoritative win probability via simulation with:
 * - Standard error tracking
 * - Early stopping when converged
 * - Symmetric opponent modeling
 * - Correlation-aware sampling
 */

import { PlayerProjection, OpponentProjection } from '../types';
import { GaussianCopulaSampler } from '../stats/copulaSampler';

/**
 * Monte Carlo simulation result
 */
export interface MCResult {
  winProbability: number;
  standardError: number;
  expectedMargin: number;
  marginStd: number;
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  simulations: number;
  converged: boolean;
  convergenceReason?: string;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  if (lower === upper) {
    return sorted[lower];
  }
  
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Monte Carlo win probability estimation
 */
export class MonteCarloEstimator {
  private copulaSampler: GaussianCopulaSampler;
  
  constructor() {
    this.copulaSampler = new GaussianCopulaSampler();
  }
  
  /**
   * Estimate win probability via Monte Carlo
   */
  estimateWinProbability(
    lineup: PlayerProjection[],
    opponent: OpponentProjection,
    options: {
      maxSimulations?: number;
      minSimulations?: number;
      targetSE?: number;
      earlyStopWindow?: number;
      seed?: number;
      verbose?: boolean;
    } = {}
  ): MCResult {
    const {
      maxSimulations = 100000,
      minSimulations = 1000,
      targetSE = 0.005, // 0.5% standard error
      earlyStopWindow = 100,
      seed = 12345,
      verbose = false
    } = options;
    
    // Initialize copula sampler
    this.copulaSampler.initialize(lineup);
    
    // Seeded RNG
    let s = seed;
    const rng = () => {
      s = (s * 1664525 + 1013904223) % 2147483648;
      return s / 2147483648;
    };
    
    // Simulation storage
    const margins: number[] = [];
    let wins = 0;
    let lastWinRate = 0;
    let stableCount = 0;
    
    // Run simulations
    let n = 0;
    for (n = 0; n < maxSimulations; n++) {
      // Sample lineup total
      const lineupSamples = this.copulaSampler.sample(rng);
      const lineupTotal = lineupSamples.reduce((sum, x) => sum + x, 0);
      
      // Sample opponent total
      const oppTotal = opponent.sample();
      
      // Calculate margin
      const margin = lineupTotal - oppTotal;
      margins.push(margin);
      
      if (margin > 0) {
        wins++;
      }
      
      // Check convergence after minimum simulations
      if (n >= minSimulations && n % earlyStopWindow === 0) {
        const winRate = wins / (n + 1);
        const se = Math.sqrt(winRate * (1 - winRate) / (n + 1));
        
        if (verbose && n % 1000 === 0) {
          console.log(`Sim ${n}: Win% = ${(winRate * 100).toFixed(2)}%, SE = ${(se * 100).toFixed(3)}%`);
        }
        
        // Check if converged
        if (se <= targetSE) {
          if (verbose) {
            console.log(`Converged at ${n} simulations (SE = ${(se * 100).toFixed(3)}%)`);
          }
          break;
        }
        
        // Check if stable (no significant change)
        if (Math.abs(winRate - lastWinRate) < 0.001) {
          stableCount++;
          if (stableCount >= 10) {
            if (verbose) {
              console.log(`Stable at ${n} simulations`);
            }
            break;
          }
        } else {
          stableCount = 0;
        }
        
        lastWinRate = winRate;
      }
    }
    
    // Calculate final statistics
    const finalN = n + 1;
    const winProb = wins / finalN;
    const standardError = Math.sqrt(winProb * (1 - winProb) / finalN);
    
    // Sort margins for percentiles
    margins.sort((a, b) => a - b);
    
    // Calculate margin statistics
    const expectedMargin = margins.reduce((sum, m) => sum + m, 0) / finalN;
    const marginVariance = margins.reduce((sum, m) => 
      sum + (m - expectedMargin) ** 2, 0) / (finalN - 1);
    const marginStd = Math.sqrt(marginVariance);
    
    // Determine convergence reason
    let converged = true;
    let convergenceReason = 'Completed all simulations';
    
    if (standardError <= targetSE) {
      convergenceReason = `Target SE (${(targetSE * 100).toFixed(2)}%) achieved`;
    } else if (stableCount >= 10) {
      convergenceReason = 'Win probability stabilized';
    } else if (n >= maxSimulations - 1) {
      converged = false;
      convergenceReason = 'Maximum simulations reached without convergence';
    }
    
    return {
      winProbability: winProb,
      standardError,
      expectedMargin,
      marginStd,
      percentiles: {
        p5: percentile(margins, 0.05),
        p10: percentile(margins, 0.10),
        p25: percentile(margins, 0.25),
        p50: percentile(margins, 0.50),
        p75: percentile(margins, 0.75),
        p90: percentile(margins, 0.90),
        p95: percentile(margins, 0.95)
      },
      simulations: finalN,
      converged,
      convergenceReason
    };
  }
  
  /**
   * Batch estimation for multiple lineups
   */
  batchEstimate(
    lineups: PlayerProjection[][],
    opponent: OpponentProjection,
    options: {
      maxSimulations?: number;
      parallel?: boolean;
    } = {}
  ): MCResult[] {
    const results: MCResult[] = [];
    
    // Process each lineup
    for (let i = 0; i < lineups.length; i++) {
      const result = this.estimateWinProbability(
        lineups[i],
        opponent,
        {
          ...options,
          seed: 12345 + i, // Vary seed
          verbose: false
        }
      );
      
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Symmetric opponent modeling
   * Both lineup and opponent use same correlation structure
   */
  estimateSymmetric(
    myLineup: PlayerProjection[],
    oppLineup: PlayerProjection[],
    options: {
      maxSimulations?: number;
      seed?: number;
    } = {}
  ): MCResult {
    const {
      maxSimulations = 50000,
      seed = 12345
    } = options;
    
    // Initialize samplers for both lineups
    const mySampler = new GaussianCopulaSampler();
    mySampler.initialize(myLineup);
    
    const oppSampler = new GaussianCopulaSampler();
    oppSampler.initialize(oppLineup);
    
    // Seeded RNG
    let s = seed;
    const rng = () => {
      s = (s * 1664525 + 1013904223) % 2147483648;
      return s / 2147483648;
    };
    
    // Run simulations
    const margins: number[] = [];
    let wins = 0;
    
    for (let n = 0; n < maxSimulations; n++) {
      // Sample both lineups with correlation
      const mySamples = mySampler.sample(rng);
      const myTotal = mySamples.reduce((sum, x) => sum + x, 0);
      
      const oppSamples = oppSampler.sample(rng);
      const oppTotal = oppSamples.reduce((sum, x) => sum + x, 0);
      
      const margin = myTotal - oppTotal;
      margins.push(margin);
      
      if (margin > 0) {
        wins++;
      }
    }
    
    // Calculate statistics
    const winProb = wins / maxSimulations;
    const standardError = Math.sqrt(winProb * (1 - winProb) / maxSimulations);
    
    margins.sort((a, b) => a - b);
    
    const expectedMargin = margins.reduce((sum, m) => sum + m, 0) / maxSimulations;
    const marginVariance = margins.reduce((sum, m) => 
      sum + (m - expectedMargin) ** 2, 0) / (maxSimulations - 1);
    const marginStd = Math.sqrt(marginVariance);
    
    return {
      winProbability: winProb,
      standardError,
      expectedMargin,
      marginStd,
      percentiles: {
        p5: percentile(margins, 0.05),
        p10: percentile(margins, 0.10),
        p25: percentile(margins, 0.25),
        p50: percentile(margins, 0.50),
        p75: percentile(margins, 0.75),
        p90: percentile(margins, 0.90),
        p95: percentile(margins, 0.95)
      },
      simulations: maxSimulations,
      converged: true,
      convergenceReason: 'Symmetric simulation completed'
    };
  }
  
  /**
   * Confidence interval for win probability
   */
  getConfidenceInterval(
    winProb: number,
    standardError: number,
    confidence: number = 0.95
  ): { lower: number; upper: number } {
    // Normal approximation for binomial CI
    const z = confidence === 0.95 ? 1.96 : 
              confidence === 0.99 ? 2.576 : 
              confidence === 0.90 ? 1.645 : 1.96;
    
    const margin = z * standardError;
    
    return {
      lower: Math.max(0, winProb - margin),
      upper: Math.min(1, winProb + margin)
    };
  }
}

/**
 * Analytical win probability (for quick screening)
 */
export function analyticWinProbability(
  lineupMean: number,
  lineupVar: number,
  oppMean: number,
  oppVar: number
): number {
  const diffMean = lineupMean - oppMean;
  const diffVar = lineupVar + oppVar;
  
  if (diffVar <= 0) {
    return diffMean > 0 ? 1 : 0;
  }
  
  const z = diffMean / Math.sqrt(diffVar);
  
  // Standard normal CDF approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = 1 - d * t * (0.31938153 + t * (-0.356563782 + t * 
    (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  
  return z < 0 ? 1 - prob : prob;
}

/**
 * Determine optimization strategy based on win probability
 */
export function determineStrategy(
  winProb: number
): 'floor' | 'balanced' | 'ceiling' {
  if (winProb < 0.35) {
    return 'ceiling'; // Underdog - maximize upside
  } else if (winProb > 0.65) {
    return 'floor'; // Favorite - minimize downside
  } else {
    return 'balanced'; // Close matchup - balance risk/reward
  }
}