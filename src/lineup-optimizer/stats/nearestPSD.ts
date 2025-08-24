/**
 * Nearest Positive Semi-Definite Projection
 * Higham's algorithm for correlation matrix repair
 */

/**
 * Project a symmetric matrix to nearest PSD via Higham (2002)
 * Newton iteration with Dykstra correction
 */
export function nearestPSD(
  A: number[][],
  maxIter = 100,
  tol = 1e-9,
  weights?: number[]
): { 
  X: number[][]; 
  converged: boolean; 
  iterations: number;
  frobenius: number;
} {
  const n = A.length;
  const W = weights || Array(n).fill(1);
  
  // Initialize
  let Y = clone(A);
  let dS = zeros(n);
  let X = clone(A);
  
  for (let iter = 0; iter < maxIter; iter++) {
    const Xold = clone(X);
    
    // Dykstra correction
    const R = subtract(Y, dS);
    
    // Project to PSD cone
    const { U, D } = eigenDecomposition(R);
    const Dplus = D.map(d => Math.max(0, d));
    X = reconstruct(U, Dplus);
    
    // Update dS
    dS = subtract(X, R);
    
    // Project to unit diagonal (correlation constraint)
    Y = projectUnitDiagonal(X, W);
    
    // Check convergence
    const diff = frobeniusNorm(subtract(X, Xold));
    if (diff < tol) {
      return {
        X,
        converged: true,
        iterations: iter + 1,
        frobenius: frobeniusNorm(subtract(X, A))
      };
    }
  }
  
  return {
    X,
    converged: false,
    iterations: maxIter,
    frobenius: frobeniusNorm(subtract(X, A))
  };
}

/**
 * Simple eigendecomposition via Jacobi method
 */
function eigenDecomposition(A: number[][]): { 
  U: number[][]; 
  D: number[] 
} {
  const n = A.length;
  const maxSweeps = 50;
  const tol = 1e-10;
  
  let V = identity(n);
  let B = clone(A);
  
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let changed = false;
    
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const app = B[p][p];
        const aqq = B[q][q];
        const apq = B[p][q];
        
        if (Math.abs(apq) < tol) continue;
        
        // Rotation angle
        const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        
        // Apply rotation to B
        const newApp = c * c * app - 2 * s * c * apq + s * s * aqq;
        const newAqq = s * s * app + 2 * s * c * apq + c * c * aqq;
        
        B[p][p] = newApp;
        B[q][q] = newAqq;
        B[p][q] = 0;
        B[q][p] = 0;
        
        // Update other elements
        for (let i = 0; i < n; i++) {
          if (i !== p && i !== q) {
            const aip = B[i][p];
            const aiq = B[i][q];
            B[i][p] = c * aip - s * aiq;
            B[p][i] = B[i][p];
            B[i][q] = s * aip + c * aiq;
            B[q][i] = B[i][q];
          }
        }
        
        // Update eigenvectors
        for (let i = 0; i < n; i++) {
          const vip = V[i][p];
          const viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
        
        changed = true;
      }
    }
    
    if (!changed) break;
  }
  
  const D = B.map((row, i) => row[i]);
  return { U: V, D };
}

/**
 * Reconstruct matrix from eigendecomposition
 */
function reconstruct(U: number[][], D: number[]): number[][] {
  const n = U.length;
  const result = zeros(n);
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        result[i][j] += U[i][k] * D[k] * U[j][k];
      }
    }
  }
  
  return result;
}

/**
 * Project to unit diagonal (correlation constraint)
 */
function projectUnitDiagonal(X: number[][], W: number[]): number[][] {
  const n = X.length;
  const Y = clone(X);
  
  for (let i = 0; i < n; i++) {
    Y[i][i] = 1;
  }
  
  return Y;
}

/**
 * Matrix utilities
 */
function clone(A: number[][]): number[][] {
  return A.map(row => [...row]);
}

function zeros(n: number): number[][] {
  return Array(n).fill(0).map(() => Array(n).fill(0));
}

function identity(n: number): number[][] {
  const I = zeros(n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

function subtract(A: number[][], B: number[][]): number[][] {
  const n = A.length;
  const C = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      C[i][j] = A[i][j] - B[i][j];
    }
  }
  return C;
}

function frobeniusNorm(A: number[][]): number {
  let sum = 0;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[0].length; j++) {
      sum += A[i][j] * A[i][j];
    }
  }
  return Math.sqrt(sum);
}

/**
 * Check if matrix is positive semi-definite
 */
export function isPSD(A: number[][], tol = 1e-9): {
  isPSD: boolean;
  minEigenvalue: number;
  eigenvalues: number[];
} {
  const { D } = eigenDecomposition(A);
  const minEig = Math.min(...D);
  
  return {
    isPSD: minEig >= -tol,
    minEigenvalue: minEig,
    eigenvalues: D
  };
}

/**
 * Validate and repair correlation matrix
 */
export function validateCorrelationMatrix(
  C: number[][],
  repair = true
): {
  valid: boolean;
  issues: string[];
  repaired?: number[][];
  repairedDistance?: number;
} {
  const n = C.length;
  const issues: string[] = [];
  
  // Check square
  if (C.some(row => row.length !== n)) {
    issues.push('Matrix is not square');
    return { valid: false, issues };
  }
  
  // Check symmetry
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(C[i][j] - C[j][i]) > 1e-9) {
        issues.push(`Asymmetric at (${i},${j}): ${C[i][j]} != ${C[j][i]}`);
      }
    }
  }
  
  // Check diagonal
  for (let i = 0; i < n; i++) {
    if (Math.abs(C[i][i] - 1) > 1e-9) {
      issues.push(`Diagonal[${i}] = ${C[i][i]} != 1`);
    }
  }
  
  // Check bounds
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (C[i][j] < -1 || C[i][j] > 1) {
        issues.push(`Entry (${i},${j}) = ${C[i][j]} out of [-1,1]`);
      }
    }
  }
  
  // Check PSD
  const psdCheck = isPSD(C);
  if (!psdCheck.isPSD) {
    issues.push(`Not PSD: min eigenvalue = ${psdCheck.minEigenvalue}`);
  }
  
  if (issues.length === 0) {
    return { valid: true, issues: [] };
  }
  
  if (repair) {
    const { X, frobenius } = nearestPSD(C);
    return {
      valid: false,
      issues,
      repaired: X,
      repairedDistance: frobenius
    };
  }
  
  return { valid: false, issues };
}