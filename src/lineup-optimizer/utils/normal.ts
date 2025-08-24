/**
 * High-accuracy normal distribution functions
 */

/**
 * Standard normal PDF
 */
export function normalPDF(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * Standard normal CDF using Abramowitz-Stegun approximation
 */
export function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let prob = d * t * (
    0.3193815 +
    t * (-0.3565638 + 
    t * (1.781478 + 
    t * (-1.821256 + 
    t * 1.330274)))
  );
  if (z > 0) prob = 1 - prob;
  return prob;
}

/**
 * Inverse normal CDF using Acklam's algorithm
 */
export function normalInvCDF(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error('p must be in (0,1)');
  
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416
  ];
  
  const plow = 0.02425, phigh = 1 - plow;
  let q: number, r: number, x: number;
  
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    q = p - 0.5;
    r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  
  // Halley refinement for better accuracy
  const e = normalCDF(x) - p;
  const u = e / normalPDF(x);
  x = x - u / (1 + x * u / 2);
  
  return x;
}