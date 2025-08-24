/**
 * Robust Truncated Normal Parameter Fitting
 * 
 * Solves for (μ, σ, a, b) given quantiles using Newton-Raphson
 * with backtracking line search for numerical stability.
 */

/**
 * Error function approximation
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
  const y = 1.0 - (((((a5 * t + a4 * t + a3 * t + a2) * t + a1) * t) * 
    Math.exp(-x * x));
  
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
  
  // Lower region
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return ((((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 
      2.400758277161838) * q - 2.549732539343734) * q + 
      4.374664141464968) * q + 2.938163982698783)) / 
      ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 
      2.445134137142996) * q + 3.754408661907416) * q + 1);
  }
  
  // Upper region
  if (p > 0.97575) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -((((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 
      2.400758277161838) * q - 2.549732539343734) * q + 
      4.374664141464968) * q + 2.938163982698783)) /
      ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 
      2.445134137142996) * q + 3.754408661907416) * q + 1);
  }
  
  // Central region
  const q = p - 0.5;
  const r = q * q;
  return q * ((((((-3.969683028665376e+01 * r + 2.209460984245205e+02) * r - 
    2.759285104469687e+02) * r + 1.383577518672690e+02) * r - 
    3.066479806614716e+01) * r + 2.506628277459239) /
    ((((((-5.447609879822406e+01 * r + 1.615858368580409e+02) * r - 
    1.556989798598866e+02) * r + 6.680131188771972e+01) * r - 
    1.328068155288572e+01) * r + 1));
}

/**
 * Truncated normal quantile function
 */
function tnQuantile(
  p: number,
  mu: number,
  sigma: number,
  a: number,
  b: number
): number {
  const alpha = (a - mu) / sigma;
  const beta = (b - mu) / sigma;
  
  const Fa = normCDF(alpha);
  const Fb = normCDF(beta);
  const Z = Fb - Fa;
  
  if (Z < 1e-10) {
    // Degenerate case - return midpoint
    return (a + b) / 2;
  }
  
  const u = Fa + p * Z;
  const z = normInv(u);
  
  return mu + sigma * z;
}

/**
 * TN mean and variance given parameters
 */
function tnMoments(
  mu: number,
  sigma: number,
  a: number,
  b: number
): { mean: number; variance: number } {
  const alpha = (a - mu) / sigma;
  const beta = (b - mu) / sigma;
  
  const phiAlpha = normPDF(alpha);
  const phiBeta = normPDF(beta);
  const PhiAlpha = normCDF(alpha);
  const PhiBeta = normCDF(beta);
  const Z = PhiBeta - PhiAlpha;
  
  if (Z < 1e-10) {
    // Degenerate case
    const mid = (a + b) / 2;
    return { mean: mid, variance: 0 };
  }
  
  // Mean
  const lambda = (phiAlpha - phiBeta) / Z;
  const mean = mu + sigma * lambda;
  
  // Variance
  const delta = (alpha * phiAlpha - beta * phiBeta) / Z;
  const variance = sigma * sigma * (1 + delta - lambda * lambda);
  
  return { mean, variance: Math.max(0, variance) };
}

/**
 * Objective function for fitting TN to quantiles
 */
function tnObjective(
  params: [number, number, number, number], // [mu, sigma, a, b]
  quantiles: Array<{ p: number; value: number }>
): number {
  const [mu, sigma, a, b] = params;
  
  if (sigma <= 0) return 1e10;
  if (a >= b) return 1e10;
  
  let sse = 0;
  for (const { p, value } of quantiles) {
    const predicted = tnQuantile(p, mu, sigma, a, b);
    sse += (predicted - value) ** 2;
  }
  
  return sse;
}

/**
 * Gradient of objective via finite differences
 */
function tnGradient(
  params: [number, number, number, number],
  quantiles: Array<{ p: number; value: number }>,
  h: number = 1e-6
): [number, number, number, number] {
  const f0 = tnObjective(params, quantiles);
  const grad: [number, number, number, number] = [0, 0, 0, 0];
  
  for (let i = 0; i < 4; i++) {
    const paramsPlus = [...params] as [number, number, number, number];
    paramsPlus[i] += h;
    const f1 = tnObjective(paramsPlus, quantiles);
    grad[i] = (f1 - f0) / h;
  }
  
  return grad;
}

/**
 * Robust TN parameter fitting with Newton-Raphson and line search
 */
export function fitTruncatedNormal(
  quantiles: Array<{ p: number; value: number }>,
  options: {
    maxIter?: number;
    tol?: number;
    verbose?: boolean;
    initialGuess?: [number, number, number, number];
  } = {}
): {
  mu: number;
  sigma: number;
  a: number;
  b: number;
  mean: number;
  variance: number;
  converged: boolean;
  iterations: number;
  finalError: number;
} {
  const {
    maxIter = 100,
    tol = 1e-6,
    verbose = false,
    initialGuess
  } = options;
  
  // Sort quantiles
  quantiles.sort((a, b) => a.p - b.p);
  
  // Initial guess if not provided
  let params: [number, number, number, number];
  if (initialGuess) {
    params = [...initialGuess];
  } else {
    // Use method of moments for initial guess
    const values = quantiles.map(q => q.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    // Find median quantile
    const medianQ = quantiles.find(q => Math.abs(q.p - 0.5) < 0.1) || quantiles[Math.floor(quantiles.length / 2)];
    const median = medianQ.value;
    
    // Initial parameters
    const mu = median;
    const sigma = range / 4; // Rough estimate
    const a = min - range * 0.2; // Extend bounds
    const b = max + range * 0.2;
    
    params = [mu, sigma, a, b];
  }
  
  let converged = false;
  let iterations = 0;
  let lastError = tnObjective(params, quantiles);
  
  // Newton-Raphson with line search
  for (let iter = 0; iter < maxIter; iter++) {
    iterations++;
    
    // Compute gradient
    const grad = tnGradient(params, quantiles);
    const gradNorm = Math.sqrt(grad.reduce((sum, g) => sum + g * g, 0));
    
    if (gradNorm < tol) {
      converged = true;
      break;
    }
    
    // Search direction (negative gradient for descent)
    const direction: [number, number, number, number] = [
      -grad[0],
      -grad[1],
      -grad[2],
      -grad[3]
    ];
    
    // Backtracking line search
    let alpha = 1.0;
    const c1 = 1e-4; // Armijo constant
    const backtrack = 0.5;
    let newParams: [number, number, number, number];
    let newError: number;
    
    for (let ls = 0; ls < 20; ls++) {
      newParams = [
        params[0] + alpha * direction[0],
        params[1] + alpha * direction[1],
        params[2] + alpha * direction[2],
        params[3] + alpha * direction[3]
      ];
      
      // Ensure constraints
      newParams[1] = Math.max(1e-6, newParams[1]); // sigma > 0
      if (newParams[2] >= newParams[3]) {
        // Maintain a < b
        const mid = (newParams[2] + newParams[3]) / 2;
        const gap = Math.abs(newParams[3] - newParams[2]) / 2 + 1e-3;
        newParams[2] = mid - gap;
        newParams[3] = mid + gap;
      }
      
      newError = tnObjective(newParams, quantiles);
      
      // Armijo condition
      const expectedDecrease = c1 * alpha * grad.reduce((sum, g, i) => 
        sum + g * direction[i], 0);
      
      if (newError <= lastError + expectedDecrease) {
        break; // Accept step
      }
      
      alpha *= backtrack;
    }
    
    // Update parameters
    params = newParams!;
    
    // Check convergence
    const errorDecrease = Math.abs(lastError - newError!);
    if (errorDecrease < tol) {
      converged = true;
      break;
    }
    
    lastError = newError!;
    
    if (verbose && iter % 10 === 0) {
      console.log(`Iteration ${iter}: Error = ${lastError.toFixed(6)}`);
    }
  }
  
  // Calculate final moments
  const { mean, variance } = tnMoments(params[0], params[1], params[2], params[3]);
  
  return {
    mu: params[0],
    sigma: params[1],
    a: params[2],
    b: params[3],
    mean,
    variance,
    converged,
    iterations,
    finalError: lastError
  };
}

/**
 * Fit TN from common fantasy football quantiles
 */
export function fitTNFromFantasyQuantiles(
  floor: number,    // p10
  median: number,   // p50
  ceiling: number,  // p90
  position: string
): {
  mu: number;
  sigma: number;
  lowerBound: number;
  upperBound: number;
  mean: number;
  variance: number;
} {
  // Position-specific bound multipliers
  const boundMultipliers: Record<string, { lower: number; upper: number }> = {
    'QB': { lower: 0.3, upper: 1.5 },
    'RB': { lower: 0.0, upper: 1.8 },
    'WR': { lower: 0.0, upper: 2.0 },
    'TE': { lower: 0.0, upper: 2.2 },
    'K': { lower: -5.0, upper: 2.5 }, // Can go negative
    'DST': { lower: -10.0, upper: 3.0 } // Can go very negative
  };
  
  const mult = boundMultipliers[position] || { lower: 0.0, upper: 2.0 };
  
  // Set bounds based on position
  const lowerBound = Math.min(floor * mult.lower, -2);
  const upperBound = Math.max(ceiling * mult.upper, ceiling + 10);
  
  // Fit TN to quantiles
  const result = fitTruncatedNormal(
    [
      { p: 0.1, value: floor },
      { p: 0.5, value: median },
      { p: 0.9, value: ceiling }
    ],
    {
      initialGuess: [
        median,
        (ceiling - floor) / 2.56, // Approximate sigma
        lowerBound,
        upperBound
      ]
    }
  );
  
  if (!result.converged) {
    console.warn(`TN fitting did not converge for ${position} player`);
    // Fallback to simple approximation
    const sigma = (ceiling - floor) / 2.56;
    return {
      mu: median,
      sigma,
      lowerBound,
      upperBound,
      mean: median,
      variance: sigma * sigma
    };
  }
  
  return {
    mu: result.mu,
    sigma: result.sigma,
    lowerBound: result.a,
    upperBound: result.b,
    mean: result.mean,
    variance: result.variance
  };
}

/**
 * Validate TN parameters
 */
export function validateTNParameters(
  mu: number,
  sigma: number,
  a: number,
  b: number
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (sigma <= 0) {
    errors.push('Sigma must be positive');
  }
  
  if (a >= b) {
    errors.push('Lower bound must be less than upper bound');
  }
  
  if (b - a < sigma * 0.1) {
    errors.push('Bounds too tight relative to sigma');
  }
  
  const alpha = (a - mu) / sigma;
  const beta = (b - mu) / sigma;
  
  if (Math.abs(alpha) > 10 || Math.abs(beta) > 10) {
    errors.push('Standardized bounds too extreme');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}