/**
 * Latin Hypercube Sampling (LHS) for Variance Reduction
 * More robust than full Sobol for practical use
 */

import { normalInvCDF } from './normal';
import { RNG } from './rng';

/**
 * Multi-dimensional Latin Hypercube Sampling
 * Returns dims × sims matrix of N(0,1) variates with LHS per dimension
 */
export function lhsNormals(
  dims: number,
  sims: number,
  rng: RNG
): number[][] {
  const out: number[][] = Array.from({ length: dims }, () => new Array<number>(sims));
  
  for (let d = 0; d < dims; d++) {
    // Create stratified samples
    const strata = new Array<number>(sims);
    for (let i = 0; i < sims; i++) {
      // Stratified uniform: (i + U[0,1]) / sims
      const u = (i + rng.next()) / sims;
      strata[i] = u;
    }
    
    // Permute strata for this dimension
    for (let i = sims - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = strata[i];
      strata[i] = strata[j];
      strata[j] = tmp;
    }
    
    // Transform to normal
    for (let i = 0; i < sims; i++) {
      // Protect against extreme values
      const u = Math.min(1 - 1e-12, Math.max(1e-12, strata[i]));
      out[d][i] = normalInvCDF(u);
    }
  }
  
  return out;
}

/**
 * LHS for uniform samples
 */
export function lhsUniforms(
  dims: number,
  sims: number,
  rng: RNG
): number[][] {
  const out: number[][] = Array.from({ length: dims }, () => new Array<number>(sims));
  
  for (let d = 0; d < dims; d++) {
    // Create stratified samples
    const strata = new Array<number>(sims);
    for (let i = 0; i < sims; i++) {
      const u = (i + rng.next()) / sims;
      strata[i] = u;
    }
    
    // Permute strata
    for (let i = sims - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = strata[i];
      strata[i] = strata[j];
      strata[j] = tmp;
    }
    
    out[d] = strata;
  }
  
  return out;
}

/**
 * Orthogonal Latin Hypercube (enhanced space-filling)
 */
export function orthogonalLHS(
  dims: number,
  sims: number,
  rng: RNG,
  iterations = 10
): number[][] {
  let best = lhsUniforms(dims, sims, rng);
  let bestCorr = maxAbsCorrelation(best);
  
  for (let iter = 0; iter < iterations; iter++) {
    const candidate = lhsUniforms(dims, sims, rng);
    const corr = maxAbsCorrelation(candidate);
    
    if (corr < bestCorr) {
      best = candidate;
      bestCorr = corr;
    }
  }
  
  // Transform to normal
  const normal: number[][] = Array.from({ length: dims }, () => new Array<number>(sims));
  for (let d = 0; d < dims; d++) {
    for (let i = 0; i < sims; i++) {
      const u = Math.min(1 - 1e-12, Math.max(1e-12, best[d][i]));
      normal[d][i] = normalInvCDF(u);
    }
  }
  
  return normal;
}

/**
 * Calculate maximum absolute correlation between dimensions
 */
function maxAbsCorrelation(data: number[][]): number {
  const dims = data.length;
  const sims = data[0].length;
  
  let maxCorr = 0;
  
  for (let i = 0; i < dims; i++) {
    for (let j = i + 1; j < dims; j++) {
      // Calculate correlation between dimensions i and j
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
      
      for (let k = 0; k < sims; k++) {
        const x = data[i][k];
        const y = data[j][k];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
      }
      
      const meanX = sumX / sims;
      const meanY = sumY / sims;
      const cov = sumXY / sims - meanX * meanY;
      const varX = sumX2 / sims - meanX * meanX;
      const varY = sumY2 / sims - meanY * meanY;
      
      if (varX > 0 && varY > 0) {
        const corr = Math.abs(cov / Math.sqrt(varX * varY));
        maxCorr = Math.max(maxCorr, corr);
      }
    }
  }
  
  return maxCorr;
}

/**
 * Compare LHS vs standard MC convergence
 */
export function compareLHSvsMC(
  f: (x: number[]) => number,
  dims: number,
  maxSims: number,
  checkpoints: number[] = [100, 500, 1000, 2000, 5000]
): {
  mc: { n: number; mean: number; stderr: number }[];
  lhs: { n: number; mean: number; stderr: number }[];
} {
  const mcResults: { n: number; mean: number; stderr: number }[] = [];
  const lhsResults: { n: number; mean: number; stderr: number }[] = [];
  
  // Standard MC
  {
    const rng = new RNG(42);
    let sum = 0, sum2 = 0;
    
    for (let i = 1; i <= maxSims; i++) {
      const x = Array(dims).fill(0).map(() => rng.normal());
      const y = f(x);
      sum += y;
      sum2 += y * y;
      
      if (checkpoints.includes(i)) {
        const mean = sum / i;
        const var_ = (sum2 / i) - mean * mean;
        const stderr = Math.sqrt(Math.max(0, var_) / i);
        mcResults.push({ n: i, mean, stderr });
      }
    }
  }
  
  // LHS
  {
    const rng = new RNG(42);
    const samples = lhsNormals(dims, maxSims, rng);
    let sum = 0, sum2 = 0;
    
    for (let i = 1; i <= maxSims; i++) {
      const x = samples.map(d => d[i - 1]);
      const y = f(x);
      sum += y;
      sum2 += y * y;
      
      if (checkpoints.includes(i)) {
        const mean = sum / i;
        const var_ = (sum2 / i) - mean * mean;
        const stderr = Math.sqrt(Math.max(0, var_) / i);
        lhsResults.push({ n: i, mean, stderr });
      }
    }
  }
  
  return { mc: mcResults, lhs: lhsResults };
}