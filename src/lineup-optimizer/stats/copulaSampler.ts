/**
 * Gaussian Copula Sampler with Exact Truncated Normal Marginals
 * 
 * This implementation ensures that sampled values exactly follow
 * truncated normal distributions while maintaining correlations.
 */

import { PlayerProjection, Projection } from '../types';

/**
 * Error function approximation (Abramowitz & Stegun)
 */
function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  
  const t = 1.0 / (1.0 + p * x);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  
  const y = 1.0 - (((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * Math.exp(-x * x));
  
  return sign * y;
}

/**
 * Standard normal CDF
 */
function normCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * Standard normal PDF
 */
function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Inverse normal CDF using rational approximation
 */
function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  
  // Rational approximation for lower region
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return ((((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 2.400758277161838) * q - 2.549732539343734) * q + 4.374664141464968) * q + 2.938163982698783)) / 
           ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 2.445134137142996) * q + 3.754408661907416) * q + 1);
  }
  
  // Rational approximation for upper region
  if (p > 0.97575) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -((((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 2.400758277161838) * q - 2.549732539343734) * q + 4.374664141464968) * q + 2.938163982698783)) /
            ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 2.445134137142996) * q + 3.754408661907416) * q + 1);
  }
  
  // Rational approximation for central region
  const q = p - 0.5;
  const r = q * q;
  return q * ((((((-3.969683028665376e+01 * r + 2.209460984245205e+02) * r - 2.759285104469687e+02) * r + 1.383577518672690e+02) * r - 3.066479806614716e+01) * r + 2.506628277459239) /
             ((((((-5.447609879822406e+01 * r + 1.615858368580409e+02) * r - 1.556989798598866e+02) * r + 6.680131188771972e+01) * r - 1.328068155288572e+01) * r + 1));
}

/**
 * Truncated normal quantile function
 */
function tnQuantile(u: number, mean: number, stdDev: number, lower: number, upper: number): number {
  const alpha = (lower - mean) / stdDev;
  const beta = (upper - mean) / stdDev;
  
  const Fa = normCDF(alpha);
  const Fb = normCDF(beta);
  const Z = Fb - Fa;
  
  // Map uniform [0,1] to truncated normal
  const p = Fa + u * Z;
  const z = normInv(p);
  
  return mean + stdDev * z;
}

/**
 * Cholesky decomposition for positive semi-definite matrix
 */
function cholesky(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const L: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      
      if (i === j) {
        // Diagonal elements
        for (let k = 0; k < j; k++) {
          sum += L[j][k] * L[j][k];
        }
        const diag = matrix[j][j] - sum;
        if (diag < -1e-10) {
          return null; // Not PSD
        }
        L[j][j] = Math.sqrt(Math.max(0, diag));
      } else {
        // Off-diagonal elements
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        if (Math.abs(L[j][j]) < 1e-10) {
          L[i][j] = 0;
        } else {
          L[i][j] = (matrix[i][j] - sum) / L[j][j];
        }
      }
    }
  }
  
  return L;
}

/**
 * Build correlation matrix from factor model
 */
function buildCorrelationMatrix(players: PlayerProjection[]): number[][] {
  const n = players.length;
  const corr: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  // Factor loadings based on team and position
  const getFactorLoading = (p: PlayerProjection): { pass: number; rush: number; pace: number } => {
    const pos = p.player.position;
    
    // Position-specific loadings
    const positionLoadings: Record<string, { pass: number; rush: number; pace: number }> = {
      'QB': { pass: 0.8, rush: 0.1, pace: 0.3 },
      'RB': { pass: 0.2, rush: 0.7, pace: 0.3 },
      'WR': { pass: 0.6, rush: 0.1, pace: 0.4 },
      'TE': { pass: 0.5, rush: 0.2, pace: 0.3 },
      'K': { pass: 0.3, rush: 0.3, pace: 0.5 },
      'DST': { pass: -0.3, rush: -0.3, pace: -0.2 }
    };
    
    return positionLoadings[pos] || { pass: 0, rush: 0, pace: 0 };
  };
  
  // Calculate correlations via factor model
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        corr[i][j] = 1;
      } else {
        const fi = getFactorLoading(players[i]);
        const fj = getFactorLoading(players[j]);
        
        // Same team boost
        const sameTeam = players[i].player.team === players[j].player.team ? 0.15 : 0;
        
        // Factor correlation
        const factorCorr = fi.pass * fj.pass + fi.rush * fj.rush + fi.pace * fj.pace;
        
        // Total correlation (bounded)
        corr[i][j] = Math.max(-0.9, Math.min(0.9, factorCorr + sameTeam));
      }
    }
  }
  
  return corr;
}

/**
 * Sample from multivariate normal using Cholesky
 */
function sampleMVN(mean: number[], chol: number[][], rng: () => number): number[] {
  const n = mean.length;
  const z: number[] = Array(n);
  
  // Generate independent standard normals
  for (let i = 0; i < n; i++) {
    const u1 = rng();
    const u2 = rng();
    // Box-Muller transform
    z[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  // Apply Cholesky to get correlated normals
  const x: number[] = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      x[i] += chol[i][j] * z[j];
    }
    x[i] += mean[i];
  }
  
  return x;
}

/**
 * Gaussian Copula Sampler
 * 
 * Samples correlated values that exactly preserve truncated normal marginals
 */
export class GaussianCopulaSampler {
  private cholesky: number[][] | null = null;
  private players: PlayerProjection[] = [];
  
  /**
   * Initialize sampler with player projections
   */
  initialize(players: PlayerProjection[]): void {
    this.players = players;
    
    // Build correlation matrix
    const corrMatrix = buildCorrelationMatrix(players);
    
    // Compute Cholesky decomposition
    this.cholesky = cholesky(corrMatrix);
    
    if (!this.cholesky) {
      console.warn('Correlation matrix not PSD, using diagonal');
      // Fallback to diagonal
      this.cholesky = Array(players.length)
        .fill(null)
        .map((_, i) => Array(players.length).fill(0).map((_, j) => i === j ? 1 : 0));
    }
  }
  
  /**
   * Sample correlated points preserving TN marginals
   */
  sample(rng: () => number = Math.random): number[] {
    if (!this.cholesky || this.players.length === 0) {
      throw new Error('Sampler not initialized');
    }
    
    const n = this.players.length;
    
    // Step 1: Sample from standard MVN
    const z = sampleMVN(Array(n).fill(0), this.cholesky, rng);
    
    // Step 2: Transform to uniform via standard normal CDF
    const u = z.map(zi => normCDF(zi));
    
    // Step 3: Transform to TN marginals via quantile function
    const samples = this.players.map((p, i) => {
      const proj = p.projection;
      if (!proj) return 0;
      
      // Use projection parameters
      const mean = proj.originalMean || proj.mean;
      const stdDev = proj.originalStdDev || Math.sqrt(proj.variance);
      const lower = proj.lowerBound;
      const upper = proj.upperBound;
      
      // Apply TN quantile transform
      return tnQuantile(u[i], mean, stdDev, lower, upper);
    });
    
    return samples;
  }
  
  /**
   * Generate multiple samples
   */
  sampleMany(count: number, seed?: number): number[][] {
    // Simple seeded RNG
    let s = seed || 42;
    const rng = () => {
      s = (s * 1664525 + 1013904223) % 2147483648;
      return s / 2147483648;
    };
    
    const samples: number[][] = [];
    for (let i = 0; i < count; i++) {
      samples.push(this.sample(rng));
    }
    
    return samples;
  }
  
  /**
   * Verify marginal distributions match expected TN
   */
  verifyMarginals(sampleCount: number = 10000): Array<{
    player: string;
    expectedMean: number;
    sampleMean: number;
    expectedStd: number;
    sampleStd: number;
    meanError: number;
    stdError: number;
  }> {
    const samples = this.sampleMany(sampleCount);
    const results = [];
    
    for (let i = 0; i < this.players.length; i++) {
      const playerSamples = samples.map(s => s[i]);
      const proj = this.players[i].projection;
      
      if (!proj) continue;
      
      // Sample statistics
      const sampleMean = playerSamples.reduce((a, b) => a + b, 0) / playerSamples.length;
      const sampleVar = playerSamples.reduce((sum, x) => sum + (x - sampleMean) ** 2, 0) / (playerSamples.length - 1);
      const sampleStd = Math.sqrt(sampleVar);
      
      // Expected TN statistics
      const expectedMean = proj.mean;
      const expectedStd = Math.sqrt(proj.variance);
      
      results.push({
        player: this.players[i].player.name,
        expectedMean,
        sampleMean,
        expectedStd,
        sampleStd,
        meanError: Math.abs(sampleMean - expectedMean),
        stdError: Math.abs(sampleStd - expectedStd)
      });
    }
    
    return results;
  }
}

/**
 * Linear Gaussian Sampler (simpler alternative)
 * 
 * Uses additive Gaussian factor model with clamping
 * Does NOT preserve exact TN marginals but is simpler
 */
export class LinearGaussianSampler {
  private players: PlayerProjection[] = [];
  private factorWeights: Map<string, { pass: number; rush: number; pace: number }> = new Map();
  
  initialize(players: PlayerProjection[]): void {
    this.players = players;
    
    // Precompute factor weights
    for (const p of players) {
      const pos = p.player.position;
      const weights = this.getPositionWeights(pos);
      this.factorWeights.set(p.player.id, weights);
    }
  }
  
  private getPositionWeights(position: string): { pass: number; rush: number; pace: number } {
    const weights: Record<string, { pass: number; rush: number; pace: number }> = {
      'QB': { pass: 0.4, rush: 0.05, pace: 0.15 },
      'RB': { pass: 0.1, rush: 0.35, pace: 0.15 },
      'WR': { pass: 0.3, rush: 0.05, pace: 0.2 },
      'TE': { pass: 0.25, rush: 0.1, pace: 0.15 },
      'K': { pass: 0.15, rush: 0.15, pace: 0.25 },
      'DST': { pass: -0.15, rush: -0.15, pace: -0.1 }
    };
    
    return weights[position] || { pass: 0, rush: 0, pace: 0 };
  }
  
  sample(rng: () => number = Math.random): number[] {
    // Sample common factors
    const factors = {
      pass: (rng() - 0.5) * 2 * Math.sqrt(3), // Uniform[-√3, √3] has variance 1
      rush: (rng() - 0.5) * 2 * Math.sqrt(3),
      pace: (rng() - 0.5) * 2 * Math.sqrt(3)
    };
    
    // Apply to each player
    return this.players.map(p => {
      const proj = p.projection;
      if (!proj) return 0;
      
      const weights = this.factorWeights.get(p.player.id)!;
      const factorContrib = weights.pass * factors.pass + 
                           weights.rush * factors.rush + 
                           weights.pace * factors.pace;
      
      // Add idiosyncratic noise
      const idioStd = Math.sqrt(Math.max(0, proj.variance * (1 - 
        weights.pass ** 2 - weights.rush ** 2 - weights.pace ** 2)));
      const idioNoise = (rng() - 0.5) * 2 * Math.sqrt(3) * idioStd / Math.sqrt(proj.variance);
      
      // Combine
      const z = factorContrib + idioNoise;
      const sample = proj.mean + z * Math.sqrt(proj.variance);
      
      // Clamp to bounds
      return Math.max(proj.lowerBound, Math.min(proj.upperBound, sample));
    });
  }
}