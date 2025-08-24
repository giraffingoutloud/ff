/**
 * Corrected Truncated Normal Distribution
 * Properly handles parameter fitting from quantiles
 */
import { normalCDF, normalInvCDF, normalPDF } from '../utils/normal';
import { RNG } from '../utils/random';

export class TruncatedNormal {
  constructor(
    public mu: number,     // pre-truncation mean
    public sigma: number,  // pre-truncation sd > 0
    public a: number,      // lower bound
    public b: number       // upper bound
  ) {
    if (!(b > a)) throw new Error('Upper bound must exceed lower bound');
    if (!(sigma > 0)) throw new Error('Sigma must be positive');
  }

  get alpha(): number { 
    return (this.a - this.mu) / this.sigma; 
  }
  
  get beta(): number { 
    return (this.b - this.mu) / this.sigma; 
  }
  
  get Z(): number { 
    return normalCDF(this.beta) - normalCDF(this.alpha); 
  }

  /**
   * Post-truncation mean
   */
  mean(): number {
    const α = this.alpha, β = this.beta, σ = this.sigma;
    const Z = this.Z;
    if (Z < 1e-10) return (this.a + this.b) / 2; // Degenerate case
    return this.mu + σ * (normalPDF(α) - normalPDF(β)) / Z;
  }
  
  /**
   * Post-truncation variance
   */
  variance(): number {
    const α = this.alpha, β = this.beta, σ = this.sigma;
    const Z = this.Z;
    if (Z < 1e-10) return 0; // Degenerate case
    const term = (α * normalPDF(α) - β * normalPDF(β)) / Z;
    const delta = (normalPDF(α) - normalPDF(β)) / Z;
    return σ * σ * (1 + term - delta * delta);
  }
  
  /**
   * Quantile function
   */
  quantile(p: number): number {
    if (!(p >= 0 && p <= 1)) throw new Error('p must be in [0,1]');
    const α = this.alpha, β = this.beta;
    const Fa = normalCDF(α), Fb = normalCDF(β);
    const u = Fa + p * (Fb - Fa);
    // Handle edge cases
    if (u <= 0) return this.a;
    if (u >= 1) return this.b;
    return this.mu + this.sigma * normalInvCDF(u);
  }
  
  /**
   * Sample from distribution
   */
  sample(rng: RNG): number {
    const u = rng.next();
    return this.quantile(u);
  }
  
  /**
   * Get standard percentiles
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
}

/**
 * Fit TN parameters from two quantiles using 2D Newton's method
 */
export function fitTNFromTwoQuantiles(
  xL: number, pL: number,  // Lower quantile
  xU: number, pU: number,  // Upper quantile
  a: number, b: number     // Bounds
): TruncatedNormal {
  if (!(a < b)) throw new Error('Invalid bounds');
  if (!(xL < xU)) throw new Error('Lower quantile value must be less than upper');
  if (!(pL < pU)) throw new Error('Lower probability must be less than upper');
  
  // Initial guess
  let mu = (xL + xU) / 2;
  let sigma = Math.max((xU - xL) / (normalInvCDF(pU) - normalInvCDF(pL)), 1e-3);
  
  const maxIter = 100;
  const tol = 1e-6;
  
  for (let it = 0; it < maxIter; it++) {
    // Ensure sigma stays positive
    sigma = Math.max(sigma, 1e-4);
    
    const tn = new TruncatedNormal(mu, sigma, a, b);
    
    // Residuals
    const f1 = tn.quantile(pL) - xL;
    const f2 = tn.quantile(pU) - xU;
    const err = Math.hypot(f1, f2);
    
    if (err < tol) return tn;
    
    // Finite difference Jacobian
    const hMu = Math.max(1e-4, Math.abs(mu) * 1e-4);
    const hSig = Math.max(1e-5, sigma * 1e-4);
    
    const tnMu = new TruncatedNormal(mu + hMu, sigma, a, b);
    const tnSig = new TruncatedNormal(mu, sigma + hSig, a, b);
    
    const df1dMu = (tnMu.quantile(pL) - tn.quantile(pL)) / hMu;
    const df1dSig = (tnSig.quantile(pL) - tn.quantile(pL)) / hSig;
    const df2dMu = (tnMu.quantile(pU) - tn.quantile(pU)) / hMu;
    const df2dSig = (tnSig.quantile(pU) - tn.quantile(pU)) / hSig;
    
    // Solve 2x2 system J * delta = -f
    const J11 = df1dMu, J12 = df1dSig;
    const J21 = df2dMu, J22 = df2dSig;
    const det = J11 * J22 - J12 * J21;
    
    if (Math.abs(det) < 1e-10) {
      // Singular Jacobian, try small perturbation
      mu += (Math.random() - 0.5) * 0.1;
      sigma *= 1 + (Math.random() - 0.5) * 0.1;
      continue;
    }
    
    const dMu = (-f1 * J22 + f2 * J12) / det;
    const dSig = (-J11 * f2 + J21 * f1) / det;
    
    // Line search for stability
    let stepSize = 1.0;
    for (let ls = 0; ls < 10; ls++) {
      const newMu = mu + stepSize * dMu;
      const newSigma = Math.max(1e-4, sigma + stepSize * dSig);
      
      try {
        const tnNew = new TruncatedNormal(newMu, newSigma, a, b);
        const newF1 = tnNew.quantile(pL) - xL;
        const newF2 = tnNew.quantile(pU) - xU;
        const newErr = Math.hypot(newF1, newF2);
        
        if (newErr < err) {
          mu = newMu;
          sigma = newSigma;
          break;
        }
      } catch {
        // Invalid parameters, reduce step
      }
      
      stepSize *= 0.5;
    }
  }
  
  // Return best effort
  return new TruncatedNormal(mu, Math.max(sigma, 1e-3), a, b);
}

/**
 * Fit TN from mean and CV
 */
export function fitTNFromMeanAndCV(
  targetMean: number,
  cv: number,
  a: number,
  b: number
): TruncatedNormal {
  // Initialize with reasonable guess
  let mu = targetMean;
  let sigma = Math.max(targetMean * cv, 1.0);
  
  for (let it = 0; it < 50; it++) {
    sigma = Math.max(sigma, 1e-3);
    const tn = new TruncatedNormal(mu, sigma, a, b);
    const currentMean = tn.mean();
    const currentVar = tn.variance();
    const currentCV = Math.sqrt(currentVar) / currentMean;
    
    const meanError = currentMean - targetMean;
    const cvError = currentCV - cv;
    
    if (Math.abs(meanError) < 1e-3 && Math.abs(cvError) < 1e-3) {
      return tn;
    }
    
    // Adjust parameters
    mu -= meanError * 0.7;
    sigma *= 1 + cvError * 0.3;
  }
  
  return new TruncatedNormal(mu, sigma, a, b);
}