/**
 * Robust Truncated Normal with Finite Difference Fitting
 * Production-grade implementation for 2025-2026 season
 */

import { normalCDF, normalInvCDF, normalPDF } from '../utils/normal';
import { RNG } from '../utils/rng';

export class TruncatedNormal {
  constructor(
    public mu: number,
    public sigma: number,
    public a: number,
    public b: number
  ) {
    if (!(b > a)) throw new Error('TN: upper must exceed lower');
    if (!(sigma > 0)) throw new Error('TN: sigma must be positive');
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
  
  mean(): number {
    const α = this.alpha;
    const β = this.beta;
    const Z = this.Z;
    return this.mu + this.sigma * (normalPDF(α) - normalPDF(β)) / Z;
  }
  
  variance(): number {
    const α = this.alpha;
    const β = this.beta;
    const Z = this.Z;
    const term = (α * normalPDF(α) - β * normalPDF(β)) / Z;
    const delta = (normalPDF(α) - normalPDF(β)) / Z;
    return this.sigma * this.sigma * (1 + term - delta * delta);
  }
  
  cdf(x: number): number {
    if (x <= this.a) return 0;
    if (x >= this.b) return 1;
    return (normalCDF((x - this.mu) / this.sigma) - normalCDF(this.alpha)) / this.Z;
  }
  
  quantile(p: number): number {
    if (!(p >= 0 && p <= 1)) throw new Error('TN.quantile: p in [0,1]');
    const Fa = normalCDF(this.alpha);
    const Fb = normalCDF(this.beta);
    const u = Fa + p * (Fb - Fa);
    return this.mu + this.sigma * normalInvCDF(u);
  }
  
  sample(rng: RNG): number {
    return this.quantile(rng.next());
  }
}

export interface TNFitResult {
  tn: TruncatedNormal;
  err: number;
  iters: number;
  converged: boolean;
}

/**
 * Robust TN fitting with finite differences and Levenberg-Marquardt
 */
export function fitTNFromQuantiles(
  qs: { p: number; x: number }[],
  a: number,
  b: number,
  init?: { mu?: number; sigma?: number }
): TNFitResult {
  if (qs.length < 2) throw new Error('Need ≥2 quantiles to fit TN');
  
  // Initial guess
  let mu = init?.mu ?? qs.reduce((s, q) => s + q.x, 0) / qs.length;
  let sigma = Math.max(
    init?.sigma ?? (qs[qs.length - 1].x - qs[0].x) / 
    (normalInvCDF(qs[qs.length - 1].p) - normalInvCDF(qs[0].p)),
    1e-2
  );
  
  const maxIter = 80;
  let prevErr = Infinity;
  
  for (let it = 0; it < maxIter; it++) {
    const tn = new TruncatedNormal(mu, sigma, a, b);
    
    // Calculate residuals
    const res = qs.map(q => tn.quantile(q.p) - q.x);
    const err = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / qs.length);
    
    // Check convergence
    if (err < 1e-6) {
      return { tn, err, iters: it + 1, converged: true };
    }
    
    // Finite difference Jacobian
    const hMu = Math.max(1e-3, Math.abs(mu) * 1e-3);
    const hSig = Math.max(1e-3, sigma * 1e-3);
    
    const tnMu = new TruncatedNormal(mu + hMu, sigma, a, b);
    const tnSig = new TruncatedNormal(mu, sigma + hSig, a, b);
    
    const J = qs.map(q => {
      const dMu = (tnMu.quantile(q.p) - tn.quantile(q.p)) / hMu;
      const dSig = (tnSig.quantile(q.p) - tn.quantile(q.p)) / hSig;
      return [dMu, dSig] as [number, number];
    });
    
    // Build normal equations J^T J delta = -J^T r
    const JTJ = [[0, 0], [0, 0]];
    const JTr = [0, 0];
    
    for (let i = 0; i < qs.length; i++) {
      JTJ[0][0] += J[i][0] * J[i][0];
      JTJ[0][1] += J[i][0] * J[i][1];
      JTJ[1][0] += J[i][1] * J[i][0];
      JTJ[1][1] += J[i][1] * J[i][1];
      JTr[0] += J[i][0] * res[i];
      JTr[1] += J[i][1] * res[i];
    }
    
    // Levenberg-Marquardt damping
    const lam = 1e-6 * (JTJ[0][0] + JTJ[1][1]);
    JTJ[0][0] += lam;
    JTJ[1][1] += lam;
    
    // Solve 2x2 system
    const det = JTJ[0][0] * JTJ[1][1] - JTJ[0][1] * JTJ[1][0];
    if (Math.abs(det) < 1e-12) break;
    
    const inv = [
      [JTJ[1][1] / det, -JTJ[0][1] / det],
      [-JTJ[1][0] / det, JTJ[0][0] / det]
    ];
    
    const dMu = -(inv[0][0] * JTr[0] + inv[0][1] * JTr[1]);
    const dSig = -(inv[1][0] * JTr[0] + inv[1][1] * JTr[1]);
    
    // Armijo line search
    let step = 1.0;
    let improved = false;
    const c1 = 0.0001;
    
    for (let ls = 0; ls < 20; ls++) {
      const nmu = mu + step * dMu;
      const nsig = Math.max(1e-2, sigma + step * dSig);
      
      try {
        const tryTN = new TruncatedNormal(nmu, nsig, a, b);
        const tryErr = Math.sqrt(
          qs.map(q => (tryTN.quantile(q.p) - q.x) ** 2)
            .reduce((s, v) => s + v, 0) / qs.length
        );
        
        // Armijo condition
        if (tryErr < err - c1 * step * (dMu * dMu + dSig * dSig)) {
          mu = nmu;
          sigma = nsig;
          prevErr = err;
          improved = true;
          break;
        }
      } catch {
        // Invalid parameters, reduce step
      }
      
      step *= 0.5;
    }
    
    if (!improved || Math.abs(prevErr - err) < 1e-9) {
      return {
        tn: new TruncatedNormal(mu, sigma, a, b),
        err,
        iters: it + 1,
        converged: false
      };
    }
  }
  
  const final = new TruncatedNormal(mu, sigma, a, b);
  const finalErr = Math.sqrt(
    qs.map(q => (final.quantile(q.p) - q.x) ** 2)
      .reduce((s, v) => s + v, 0) / qs.length
  );
  
  return { tn: final, err: finalErr, iters: maxIter, converged: false };
}

/**
 * Position-specific bounds for 2025-2026 season
 */
export const POSITION_BOUNDS: Record<import('../domain/typesCorrected').Position, { a: number; b: number }> = {
  QB: { a: 0, b: 60 },
  RB: { a: 0, b: 50 },
  WR: { a: 0, b: 55 },
  TE: { a: 0, b: 40 },
  K: { a: 0, b: 25 },
  DST: { a: -10, b: 35 }
};

/**
 * Position-specific coefficient of variation
 */
export const POSITION_CV: Record<import('../domain/typesCorrected').Position, number> = {
  QB: 0.20,
  RB: 0.25,
  WR: 0.30,
  TE: 0.35,
  K: 0.40,
  DST: 0.60
};