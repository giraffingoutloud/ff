/**
 * Analytic Gradients for Truncated Normal Fitting
 * Exact derivatives for faster, more stable optimization
 */

import { normalPDF, normalCDF } from '../utils/normal';

/**
 * Analytic gradients of TN quantile function
 */
export interface TNGradients {
  dQ_dmu: number;
  dQ_dsigma: number;
  d2Q_dmu2: number;
  d2Q_dsigma2: number;
  d2Q_dmu_dsigma: number;
}

/**
 * Calculate analytic gradients of TN quantile
 * Q(p; μ, σ, a, b) = μ + σ * Φ^(-1)(Φ(α) + p*(Φ(β) - Φ(α)))
 */
export function tnQuantileGradients(
  p: number,
  mu: number,
  sigma: number,
  a: number,
  b: number
): TNGradients {
  const alpha = (a - mu) / sigma;
  const beta = (b - mu) / sigma;
  
  const phiAlpha = normalCDF(alpha);
  const phiBeta = normalCDF(beta);
  const Z = phiBeta - phiAlpha;
  
  const pdfAlpha = normalPDF(alpha);
  const pdfBeta = normalPDF(beta);
  
  // Quantile of standard TN
  const u = phiAlpha + p * Z;
  const xi = inverseNormalCDF(u);
  const pdfXi = normalPDF(xi);
  
  // First derivatives
  const dAlpha_dmu = -1 / sigma;
  const dBeta_dmu = -1 / sigma;
  const dAlpha_dsigma = -alpha / sigma;
  const dBeta_dsigma = -beta / sigma;
  
  const dZ_dmu = (pdfAlpha - pdfBeta) / sigma;
  const dZ_dsigma = (pdfAlpha * alpha - pdfBeta * beta) / sigma;
  
  const du_dmu = pdfAlpha * dAlpha_dmu + p * dZ_dmu;
  const du_dsigma = pdfAlpha * dAlpha_dsigma + p * dZ_dsigma;
  
  const dxi_du = 1 / pdfXi;
  
  const dQ_dmu = 1 + sigma * dxi_du * du_dmu;
  const dQ_dsigma = xi + sigma * dxi_du * du_dsigma;
  
  // Second derivatives (for Newton-Raphson)
  const d2Alpha_dmu2 = 0;
  const d2Beta_dmu2 = 0;
  const d2Alpha_dsigma2 = (2 * alpha) / (sigma * sigma);
  const d2Beta_dsigma2 = (2 * beta) / (sigma * sigma);
  const d2Alpha_dmu_dsigma = 1 / (sigma * sigma);
  const d2Beta_dmu_dsigma = 1 / (sigma * sigma);
  
  // Chain rule for second derivatives
  const dpdfAlpha_dalpha = -alpha * pdfAlpha;
  const dpdfBeta_dbeta = -beta * pdfBeta;
  
  const d2Z_dmu2 = (dpdfAlpha_dalpha * dAlpha_dmu * dAlpha_dmu - 
                     dpdfBeta_dbeta * dBeta_dmu * dBeta_dmu) / sigma;
  
  const d2Z_dsigma2 = (dpdfAlpha_dalpha * dAlpha_dsigma * dAlpha_dsigma + 
                        pdfAlpha * d2Alpha_dsigma2 -
                        dpdfBeta_dbeta * dBeta_dsigma * dBeta_dsigma - 
                        pdfBeta * d2Beta_dsigma2) / sigma -
                       dZ_dsigma / sigma;
  
  const d2Z_dmu_dsigma = (dpdfAlpha_dalpha * dAlpha_dmu * dAlpha_dsigma + 
                           pdfAlpha * d2Alpha_dmu_dsigma -
                           dpdfBeta_dbeta * dBeta_dmu * dBeta_dsigma - 
                           pdfBeta * d2Beta_dmu_dsigma) / sigma -
                          dZ_dmu / sigma;
  
  const d2u_dmu2 = dpdfAlpha_dalpha * dAlpha_dmu * dAlpha_dmu + p * d2Z_dmu2;
  const d2u_dsigma2 = dpdfAlpha_dalpha * dAlpha_dsigma * dAlpha_dsigma + 
                       pdfAlpha * d2Alpha_dsigma2 + p * d2Z_dsigma2;
  const d2u_dmu_dsigma = dpdfAlpha_dalpha * dAlpha_dmu * dAlpha_dsigma + 
                          pdfAlpha * d2Alpha_dmu_dsigma + p * d2Z_dmu_dsigma;
  
  const dpdfXi_dxi = -xi * pdfXi;
  const d2xi_du2 = -dpdfXi_dxi / (pdfXi * pdfXi * pdfXi);
  
  const d2Q_dmu2 = sigma * (d2xi_du2 * du_dmu * du_dmu + dxi_du * d2u_dmu2);
  const d2Q_dsigma2 = 2 * dxi_du * du_dsigma + 
                       sigma * (d2xi_du2 * du_dsigma * du_dsigma + dxi_du * d2u_dsigma2);
  const d2Q_dmu_dsigma = dxi_du * du_dmu + 
                          sigma * (d2xi_du2 * du_dmu * du_dsigma + dxi_du * d2u_dmu_dsigma);
  
  return {
    dQ_dmu,
    dQ_dsigma,
    d2Q_dmu2,
    d2Q_dsigma2,
    d2Q_dmu_dsigma
  };
}

/**
 * Jacobian matrix for TN quantile fitting
 */
export function tnJacobian(
  quantiles: { p: number; x: number }[],
  mu: number,
  sigma: number,
  a: number,
  b: number
): number[][] {
  const J: number[][] = [];
  
  for (const { p, x } of quantiles) {
    const grad = tnQuantileGradients(p, mu, sigma, a, b);
    J.push([grad.dQ_dmu, grad.dQ_dsigma]);
  }
  
  return J;
}

/**
 * Hessian matrix for TN quantile fitting
 */
export function tnHessian(
  quantiles: { p: number; x: number }[],
  mu: number,
  sigma: number,
  a: number,
  b: number
): number[][][] {
  const H: number[][][] = [];
  
  for (const { p, x } of quantiles) {
    const grad = tnQuantileGradients(p, mu, sigma, a, b);
    H.push([
      [grad.d2Q_dmu2, grad.d2Q_dmu_dsigma],
      [grad.d2Q_dmu_dsigma, grad.d2Q_dsigma2]
    ]);
  }
  
  return H;
}

/**
 * Newton-Raphson with analytic gradients
 */
export function fitTNAnalytic(
  quantiles: { p: number; x: number }[],
  a: number,
  b: number,
  maxIter = 50,
  tol = 1e-9
): { mu: number; sigma: number; converged: boolean; iterations: number } {
  // Initial guess
  let mu = quantiles.reduce((s, q) => s + q.x, 0) / quantiles.length;
  let sigma = (b - a) / 6; // Rough initial guess
  
  for (let iter = 0; iter < maxIter; iter++) {
    // Compute residuals and Jacobian
    const residuals: number[] = [];
    const J: number[][] = [];
    
    for (const { p, x } of quantiles) {
      const tn = new TruncatedNormalAnalytic(mu, sigma, a, b);
      const pred = tn.quantile(p);
      residuals.push(x - pred);
      
      const grad = tnQuantileGradients(p, mu, sigma, a, b);
      J.push([grad.dQ_dmu, grad.dQ_dsigma]);
    }
    
    // Gauss-Newton step
    const JtJ = matrixMultiply(transpose(J), J);
    const JtR = matrixVectorMultiply(transpose(J), residuals);
    
    // Add Levenberg damping for stability
    const lambda = 0.01;
    JtJ[0][0] += lambda;
    JtJ[1][1] += lambda;
    
    // Solve for delta
    const delta = solve2x2(JtJ, JtR);
    
    // Line search with Armijo condition
    let alpha = 1.0;
    const c1 = 0.0001;
    const currentError = residuals.reduce((s, r) => s + r * r, 0);
    
    for (let ls = 0; ls < 10; ls++) {
      const muNew = mu + alpha * delta[0];
      const sigmaNew = Math.max(0.001, sigma + alpha * delta[1]);
      
      // Check new error
      let newError = 0;
      for (const { p, x } of quantiles) {
        const tn = new TruncatedNormalAnalytic(muNew, sigmaNew, a, b);
        const pred = tn.quantile(p);
        const r = x - pred;
        newError += r * r;
      }
      
      if (newError < currentError - c1 * alpha * (delta[0] * delta[0] + delta[1] * delta[1])) {
        mu = muNew;
        sigma = sigmaNew;
        break;
      }
      
      alpha *= 0.5;
    }
    
    // Check convergence
    if (Math.abs(delta[0]) < tol && Math.abs(delta[1]) < tol) {
      return { mu, sigma, converged: true, iterations: iter + 1 };
    }
  }
  
  return { mu, sigma, converged: false, iterations: maxIter };
}

/**
 * TN with analytic derivatives
 */
class TruncatedNormalAnalytic {
  constructor(
    public mu: number,
    public sigma: number,
    public a: number,
    public b: number
  ) {}
  
  quantile(p: number): number {
    const alpha = (this.a - this.mu) / this.sigma;
    const beta = (this.b - this.mu) / this.sigma;
    
    const phiAlpha = normalCDF(alpha);
    const phiBeta = normalCDF(beta);
    const Z = phiBeta - phiAlpha;
    
    const u = phiAlpha + p * Z;
    const xi = inverseNormalCDF(u);
    
    return this.mu + this.sigma * xi;
  }
}

/**
 * Simple inverse normal CDF
 */
function inverseNormalCDF(p: number): number {
  // Protect bounds
  p = Math.max(1e-10, Math.min(1 - 1e-10, p));
  
  // Acklam's approximation
  const a1 = -3.969683028665376e+01;
  const a2 = 2.209460984245205e+02;
  const a3 = -2.759285104469687e+02;
  const a4 = 1.383577518672690e+02;
  const a5 = -3.066479806614716e+01;
  const a6 = 2.506628277459239e+00;
  
  const b1 = -5.447609879822406e+01;
  const b2 = 1.615858368580409e+02;
  const b3 = -1.556989798598866e+02;
  const b4 = 6.680131188771972e+01;
  const b5 = -1.328068155288572e+01;
  
  const c1 = -7.784894002430293e-03;
  const c2 = -3.223964580411365e-01;
  const c3 = -2.400758277161838e+00;
  const c4 = -2.549732539343734e+00;
  const c5 = 4.374664141464968e+00;
  const c6 = 2.938163982698783e+00;
  
  const d1 = 7.784695709041462e-03;
  const d2 = 3.224671290700398e-01;
  const d3 = 2.445134137142996e+00;
  const d4 = 3.754408661907416e+00;
  
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  
  let x: number;
  
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
        (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
         ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  
  return x;
}

/**
 * Matrix operations
 */
function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const At: number[][] = Array(n).fill(null).map(() => Array(m).fill(0));
  
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      At[j][i] = A[i][j];
    }
  }
  
  return At;
}

function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const n = B[0].length;
  const p = B.length;
  const C: number[][] = Array(m).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < p; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  
  return C;
}

function matrixVectorMultiply(A: number[][], b: number[]): number[] {
  const m = A.length;
  const n = A[0].length;
  const c: number[] = Array(m).fill(0);
  
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      c[i] += A[i][j] * b[j];
    }
  }
  
  return c;
}

function solve2x2(A: number[][], b: number[]): number[] {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  if (Math.abs(det) < 1e-10) {
    throw new Error('Singular matrix');
  }
  
  return [
    (A[1][1] * b[0] - A[0][1] * b[1]) / det,
    (A[0][0] * b[1] - A[1][0] * b[0]) / det
  ];
}