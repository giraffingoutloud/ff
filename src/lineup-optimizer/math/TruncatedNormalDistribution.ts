/**
 * Truncated Normal Distribution Implementation
 * Provides exact calculations for truncated normal distributions
 */
export class TruncatedNormalDistribution {
  private mu: number;      // Original mean
  private sigma: number;   // Original std dev
  private a: number;       // Lower bound
  private b: number;       // Upper bound
  private alpha: number;   // (a - mu) / sigma
  private beta: number;    // (b - mu) / sigma
  private Z: number;       // Normalization constant
  
  constructor(mu: number, sigma: number, a: number = -Infinity, b: number = Infinity) {
    this.mu = mu;
    this.sigma = sigma;
    this.a = a;
    this.b = b;
    this.alpha = (a - mu) / sigma;
    this.beta = (b - mu) / sigma;
    
    // Normalization constant: Φ(β) - Φ(α)
    this.Z = this.normalCDF(this.beta) - this.normalCDF(this.alpha);
    
    if (this.Z < 1e-10) {
      throw new Error('Truncation range too narrow or outside distribution support');
    }
  }
  
  /**
   * Mean of truncated normal
   */
  mean(): number {
    const phiAlpha = this.normalPDF(this.alpha);
    const phiBeta = this.normalPDF(this.beta);
    return this.mu + this.sigma * (phiAlpha - phiBeta) / this.Z;
  }
  
  /**
   * Variance of truncated normal
   */
  variance(): number {
    const phiAlpha = this.normalPDF(this.alpha);
    const phiBeta = this.normalPDF(this.beta);
    const term1 = (this.alpha * phiAlpha - this.beta * phiBeta) / this.Z;
    const term2 = Math.pow((phiAlpha - phiBeta) / this.Z, 2);
    return this.sigma * this.sigma * (1 + term1 - term2);
  }
  
  /**
   * Standard deviation of truncated normal
   */
  stdDev(): number {
    return Math.sqrt(this.variance());
  }
  
  /**
   * Quantile function (inverse CDF)
   */
  quantile(p: number): number {
    if (p < 0 || p > 1) throw new Error('Probability must be in [0, 1]');
    
    // F_truncated^(-1)(p) = Φ^(-1)(Φ(α) + p * Z)
    const PhiAlpha = this.normalCDF(this.alpha);
    const arg = PhiAlpha + p * this.Z;
    const z = this.normalQuantile(arg);
    return this.mu + this.sigma * z;
  }
  
  /**
   * Get distribution percentiles
   */
  getPercentiles(): {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  } {
    return {
      p10: this.quantile(0.10),
      p25: this.quantile(0.25),
      p50: this.quantile(0.50),
      p75: this.quantile(0.75),
      p90: this.quantile(0.90)
    };
  }
  
  /**
   * Sample from truncated normal using inverse transform method
   */
  sample(): number {
    const u = Math.random();
    return this.quantile(u);
  }
  
  /**
   * Generate multiple samples
   */
  samples(n: number): number[] {
    const results: number[] = [];
    for (let i = 0; i < n; i++) {
      results.push(this.sample());
    }
    return results;
  }
  
  /**
   * Standard normal CDF using Zelen & Severo approximation
   */
  private normalCDF(z: number): number {
    if (z === Infinity) return 1;
    if (z === -Infinity) return 0;
    
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.39894228;
    
    if (z >= 0) {
      const t = 1.0 / (1.0 + p * z);
      return 1.0 - c * Math.exp(-z * z / 2.0) * t * 
        (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
    } else {
      return 1.0 - this.normalCDF(-z);
    }
  }
  
  /**
   * Standard normal PDF
   */
  private normalPDF(z: number): number {
    if (!isFinite(z)) return 0;
    return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  }
  
  /**
   * Inverse normal CDF using Beasley-Springer-Moro approximation
   */
  private normalQuantile(p: number): number {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    if (p < 0 || p > 1) throw new Error('Probability must be in [0, 1]');
    
    // Coefficients for Beasley-Springer-Moro approximation
    const a = [
      2.50662823884,
      -18.61500062529,
      41.39119773534,
      -25.44106049637
    ];
    
    const b = [
      -8.47351093090,
      23.08336743743,
      -21.06224101826,
      3.13082909833
    ];
    
    const c = [
      0.3374754822726147,
      0.9761690190917186,
      0.1607979714918209,
      0.0276438810333863,
      0.0038405729373609,
      0.0003951896511919,
      0.0000321767881768,
      0.0000002888167364,
      0.0000003960315187
    ];
    
    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    
    let q, r, x;
    
    if (p < pLow) {
      // Lower tail
      q = Math.sqrt(-2 * Math.log(p));
      // Horner's method for polynomial evaluation
      let num = c[8];
      for (let i = 7; i >= 0; i--) {
        num = num * q + c[i];
      }
      const numerator = num;
      
      let den = b[3];
      for (let i = 2; i >= 0; i--) {
        den = den * q + b[i];
      }
      const denominator = den * q + 1;
      x = numerator / denominator;
    } else if (p <= pHigh) {
      // Central region
      q = p - 0.5;
      r = q * q;
      x = (((((a[3] * r + a[2]) * r + a[1]) * r + a[0]) * q) /
          ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1));
    } else {
      // Upper tail
      q = Math.sqrt(-2 * Math.log(1 - p));
      // Horner's method for polynomial evaluation
      let num = c[8];
      for (let i = 7; i >= 0; i--) {
        num = num * q + c[i];
      }
      const numerator = num;
      
      let den = b[3];
      for (let i = 2; i >= 0; i--) {
        den = den * q + b[i];
      }
      const denominator = den * q + 1;
      x = -numerator / denominator;
    }
    
    return x;
  }
  
  /**
   * Create from projection data with smart bounds
   */
  static fromProjection(median: number, cv: number, position: string): TruncatedNormalDistribution {
    // Position-specific bounds
    const bounds: Record<string, { lower: number; upper: number }> = {
      'QB': { lower: 0, upper: median * 2.5 },
      'RB': { lower: 0, upper: median * 3.0 },
      'WR': { lower: 0, upper: median * 3.5 },
      'TE': { lower: 0, upper: median * 3.5 },
      'K': { lower: 0, upper: 25 },
      'DST': { lower: -5, upper: 30 }
    };
    
    const bound = bounds[position] || { lower: 0, upper: median * 3 };
    const sigma = median * cv;
    
    // For truncated normal, median ≠ mean
    // We need to solve for mu such that the median of TN(mu, sigma, a, b) = median
    // This requires iterative solution
    let mu = median; // Initial guess
    
    for (let iter = 0; iter < 10; iter++) {
      const dist = new TruncatedNormalDistribution(mu, sigma, bound.lower, bound.upper);
      const currentMedian = dist.quantile(0.5);
      const error = currentMedian - median;
      
      if (Math.abs(error) < 0.01) break;
      
      // Newton-like update
      mu = mu - error * 0.7;
    }
    
    return new TruncatedNormalDistribution(mu, sigma, bound.lower, bound.upper);
  }
}
