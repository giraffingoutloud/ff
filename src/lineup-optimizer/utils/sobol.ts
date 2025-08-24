/**
 * Sobol Sequence Generator for Quasi-Monte Carlo
 * Low-discrepancy sequences for variance reduction
 */

/**
 * Direction numbers for Sobol sequence (up to dimension 21)
 * From Joe & Kuo (2008)
 */
const DIRECTION_NUMBERS: number[][] = [
  // Dimension 1 (standard)
  [1],
  // Dimension 2
  [1, 3],
  // Dimension 3
  [1, 3, 1],
  // Dimension 4
  [1, 1, 1],
  // Dimension 5
  [1, 1, 3, 3],
  // Dimension 6
  [1, 3, 5, 13],
  // Dimension 7
  [1, 1, 5, 5, 17],
  // Dimension 8
  [1, 1, 5, 5, 5],
  // Dimension 9
  [1, 1, 7, 11, 19],
  // Dimension 10
  [1, 1, 5, 1, 1],
  // Dimension 11
  [1, 1, 1, 3, 11],
  // Dimension 12
  [1, 3, 5, 5, 31],
  // Dimension 13
  [1, 3, 3, 9, 7, 49],
  // Dimension 14
  [1, 1, 1, 15, 21, 21],
  // Dimension 15
  [1, 3, 1, 13, 27, 49],
  // Dimension 16
  [1, 1, 1, 15, 7, 5],
  // Dimension 17
  [1, 3, 1, 15, 13, 25],
  // Dimension 18
  [1, 1, 5, 5, 19, 61],
  // Dimension 19
  [1, 3, 7, 11, 23, 15],
  // Dimension 20
  [1, 3, 7, 13, 13, 15],
  // Dimension 21
  [1, 1, 3, 13, 7, 35]
];

/**
 * Primitive polynomials for Sobol sequence
 */
const PRIMITIVE_POLYNOMIALS = [
  0, 1, 3, 3, 5, 7, 7, 9, 9, 11, 13, 13, 15, 17, 17, 19, 21, 21, 23, 25, 27
];

/**
 * Sobol sequence generator
 */
export class SobolSequence {
  private dimension: number;
  private count: number;
  private direction: number[][];
  private x: number[];
  private lastGray: number;
  
  constructor(dimension: number) {
    if (dimension < 1 || dimension > 21) {
      throw new Error(`Sobol dimension must be 1-21, got ${dimension}`);
    }
    
    this.dimension = dimension;
    this.count = 0;
    this.x = Array(dimension).fill(0);
    this.lastGray = 0;
    
    // Initialize direction numbers
    this.direction = Array(dimension).fill(null).map(() => Array(32).fill(0));
    
    for (let d = 0; d < dimension; d++) {
      const m = DIRECTION_NUMBERS[d].length;
      const s = PRIMITIVE_POLYNOMIALS[d];
      
      // Copy initial direction numbers
      for (let i = 0; i < m; i++) {
        this.direction[d][i] = DIRECTION_NUMBERS[d][i] << (31 - i);
      }
      
      // Generate remaining direction numbers
      for (let i = m; i < 32; i++) {
        this.direction[d][i] = this.direction[d][i - m] ^ (this.direction[d][i - m] >>> m);
        
        for (let k = 1; k < m; k++) {
          if ((s >>> (m - 1 - k)) & 1) {
            this.direction[d][i] ^= this.direction[d][i - k];
          }
        }
      }
    }
  }
  
  /**
   * Generate next point in sequence
   */
  next(): number[] {
    if (this.count === 0) {
      this.count++;
      return Array(this.dimension).fill(0.5);
    }
    
    // Find rightmost zero bit of count
    const gray = this.count ^ (this.count >>> 1);
    const diff = gray ^ this.lastGray;
    
    // Find position of change
    let j = 0;
    let temp = diff;
    while (temp) {
      temp >>>= 1;
      j++;
    }
    j--;
    
    // XOR with appropriate direction number
    for (let d = 0; d < this.dimension; d++) {
      this.x[d] ^= this.direction[d][j];
    }
    
    this.count++;
    this.lastGray = gray;
    
    // Convert to [0,1]
    return this.x.map(xi => (xi >>> 0) / 0x100000000);
  }
  
  /**
   * Generate batch of points
   */
  batch(n: number): number[][] {
    const points: number[][] = [];
    for (let i = 0; i < n; i++) {
      points.push(this.next());
    }
    return points;
  }
  
  /**
   * Reset sequence
   */
  reset(): void {
    this.count = 0;
    this.x = Array(this.dimension).fill(0);
    this.lastGray = 0;
  }
}

/**
 * Randomized Sobol sequence (Owen scrambling)
 */
export class RandomizedSobol extends SobolSequence {
  private permutations: Map<string, number>;
  private seed: number;
  
  constructor(dimension: number, seed = 42) {
    super(dimension);
    this.seed = seed;
    this.permutations = new Map();
  }
  
  /**
   * Apply digital shift (simplified Owen scrambling)
   */
  next(): number[] {
    const point = super.next();
    
    // Apply digital shift
    const shift = this.digitalShift(this.seed);
    return point.map((p, i) => {
      const shifted = (p + shift[i]) % 1;
      return shifted < 0 ? shifted + 1 : shifted;
    });
  }
  
  private digitalShift(seed: number): number[] {
    // Simple hash-based shift
    const shifts: number[] = [];
    let s = seed;
    
    for (let i = 0; i < this.dimension; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      shifts.push(s / 0x100000000);
    }
    
    return shifts;
  }
}

/**
 * Transform Sobol points to normal distribution
 */
export function sobolNormal(
  dimension: number,
  n: number,
  seed?: number
): number[][] {
  const sobol = seed !== undefined 
    ? new RandomizedSobol(dimension, seed)
    : new SobolSequence(dimension);
  
  const uniform = sobol.batch(n);
  
  // Transform to normal via inverse CDF
  return uniform.map(u => u.map(ui => inverseNormalCDF(ui)));
}

/**
 * Simple inverse normal CDF (for demonstration)
 */
function inverseNormalCDF(p: number): number {
  // Protect against extreme values
  p = Math.max(1e-10, Math.min(1 - 1e-10, p));
  
  // Simple approximation (Acklam's algorithm would be better)
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];
  
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  
  let q, r;
  
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Compare Monte Carlo vs Quasi-Monte Carlo convergence
 */
export function compareConvergence(
  f: (x: number[]) => number,
  dimension: number,
  maxSamples: number,
  checkpoints: number[] = [100, 500, 1000, 2000, 5000, 10000]
): {
  mc: { n: number; mean: number; stderr: number }[];
  qmc: { n: number; mean: number; stderr: number }[];
} {
  const mcResults: { n: number; mean: number; stderr: number }[] = [];
  const qmcResults: { n: number; mean: number; stderr: number }[] = [];
  
  // Monte Carlo
  let mcSum = 0;
  let mcSum2 = 0;
  
  for (let i = 1; i <= maxSamples; i++) {
    const x = Array(dimension).fill(0).map(() => Math.random() * 2 - 1);
    const y = f(x);
    mcSum += y;
    mcSum2 += y * y;
    
    if (checkpoints.includes(i)) {
      const mean = mcSum / i;
      const var_ = (mcSum2 / i) - mean * mean;
      const stderr = Math.sqrt(var_ / i);
      mcResults.push({ n: i, mean, stderr });
    }
  }
  
  // Quasi-Monte Carlo
  const sobol = new SobolSequence(dimension);
  let qmcSum = 0;
  let qmcSum2 = 0;
  
  for (let i = 1; i <= maxSamples; i++) {
    const u = sobol.next();
    const x = u.map(ui => 2 * ui - 1);
    const y = f(x);
    qmcSum += y;
    qmcSum2 += y * y;
    
    if (checkpoints.includes(i)) {
      const mean = qmcSum / i;
      const var_ = (qmcSum2 / i) - mean * mean;
      const stderr = Math.sqrt(var_ / i);
      qmcResults.push({ n: i, mean, stderr });
    }
  }
  
  return { mc: mcResults, qmc: qmcResults };
}