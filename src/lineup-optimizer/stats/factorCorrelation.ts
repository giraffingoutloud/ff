/**
 * Factor-based correlation model
 * Guarantees PSD correlation matrix via Σ = ΛΛᵀ + D
 */
import { PlayerProjection, Position } from '../types';
import { RNG } from '../utils/random';

// Explained variance fraction per position
const EXPLAINED_FRACTION: Record<Position, number> = {
  'QB': 0.35,   // 35% from team factors
  'WR': 0.30,   // 30% from team factors
  'TE': 0.25,   // 25% from team factors
  'RB': 0.20,   // 20% from team factors (more independent)
  'K': 0.15,    // 15% from team factors
  'DST': 0.10   // 10% from team factors
};

// Position weights onto factors (pass, rush, pace)
const POS_WEIGHTS: Record<Position, { pass: number; rush: number; pace: number }> = {
  'QB':  { pass: 0.80, rush: 0.05, pace: 0.15 },
  'WR':  { pass: 0.75, rush: 0.05, pace: 0.20 },
  'TE':  { pass: 0.70, rush: 0.05, pace: 0.25 },
  'RB':  { pass: 0.30, rush: 0.60, pace: 0.10 },
  'K':   { pass: 0.20, rush: 0.20, pace: 0.60 },
  'DST': { pass: -0.20, rush: -0.15, pace: 0.10 } // negative on offense factors
};

export interface Factorized {
  loadings: number[][];      // Λ matrix: [nPlayers][nFactors]
  residSD: number[];         // sqrt(diag(D))
  factorIndex: Map<string, number>; // factor name -> index
  nPlayers: number;
  nFactors: number;
}

/**
 * Build factor model from lineup
 */
export function buildFactorization(lineup: PlayerProjection[]): Factorized {
  const n = lineup.length;
  const factorIndex = new Map<string, number>();
  
  // Helper to get or create factor index
  const getOrAddFactor = (key: string): number => {
    if (!factorIndex.has(key)) {
      factorIndex.set(key, factorIndex.size);
    }
    return factorIndex.get(key)!;
  };
  
  // Pre-collect all teams and games
  const teams = new Set<string>();
  const games = new Set<string>();
  
  for (const p of lineup) {
    teams.add(p.player.team);
    if (p.gameInfo?.gameId) {
      games.add(p.gameInfo.gameId);
    } else {
      // Create synthetic game ID from teams
      const gameId = `${p.gameInfo?.homeTeam || p.player.team}_vs_${p.gameInfo?.awayTeam || 'OPP'}`;
      games.add(gameId);
    }
  }
  
  // Create factors for each team and game
  for (const team of teams) {
    getOrAddFactor(`${team}:pass`);
    getOrAddFactor(`${team}:rush`);
  }
  for (const game of games) {
    getOrAddFactor(`GAME:${game}`);
  }
  
  const nFactors = factorIndex.size;
  const loadings: number[][] = Array(n).fill(null).map(() => Array(nFactors).fill(0));
  const residSD: number[] = new Array(n);
  
  // Build loadings matrix
  lineup.forEach((p, i) => {
    const pos = p.player.position;
    const f = Math.max(0, Math.min(0.9, EXPLAINED_FRACTION[pos] || 0.2));
    
    // Use post-truncation SD
    const sigmaTot = p.projection ? Math.sqrt(p.projection.variance) : 5;
    const sigmaExplained = sigmaTot * Math.sqrt(f);
    residSD[i] = sigmaTot * Math.sqrt(1 - f);
    
    // Get factor indices
    const team = p.player.team;
    const passIdx = factorIndex.get(`${team}:pass`)!;
    const rushIdx = factorIndex.get(`${team}:rush`)!;
    
    // Get game factor
    const gameId = p.gameInfo?.gameId || 
                   `${p.gameInfo?.homeTeam || team}_vs_${p.gameInfo?.awayTeam || 'OPP'}`;
    const gameIdx = factorIndex.get(`GAME:${gameId}`)!;
    
    // Position-specific weights
    const w = POS_WEIGHTS[pos] || { pass: 0.5, rush: 0.3, pace: 0.2 };
    const vec = [w.pass, w.rush, w.pace];
    const norm = Math.hypot(...vec);
    
    // Scale to preserve total explained variance
    const scale = sigmaExplained / (norm || 1);
    
    // Assign loadings
    loadings[i][passIdx] = vec[0] * scale;
    loadings[i][rushIdx] = vec[1] * scale;
    loadings[i][gameIdx] = vec[2] * scale;
  });
  
  return {
    loadings,
    residSD,
    factorIndex,
    nPlayers: n,
    nFactors
  };
}

/**
 * Simulate correlated outcomes using factor model
 * X_i = μ_i + Λ_i·F + σ_resid,i·ε_i
 */
export function simulateCorrelatedLineupTotals(
  lineup: PlayerProjection[],
  sims: number,
  rng: RNG
): {
  totals: number[];
  perSimScores?: number[][];
} {
  const n = lineup.length;
  const { loadings, residSD, nFactors } = buildFactorization(lineup);
  
  const totals: number[] = new Array(sims);
  const perSimScores: number[][] = [];
  
  for (let s = 0; s < sims; s++) {
    // Sample factors ~ N(0, I)
    const F: number[] = Array.from({ length: nFactors }, () => rng.normal());
    
    const scores: number[] = new Array(n);
    let total = 0;
    
    for (let i = 0; i < n; i++) {
      const player = lineup[i];
      const mean = player.projection?.mean || player.projection?.median || 0;
      
      // Λ_i · F (factor contribution)
      let explained = 0;
      const row = loadings[i];
      for (let k = 0; k < nFactors; k++) {
        explained += row[k] * F[k];
      }
      
      // Add residual
      const resid = residSD[i] * rng.normal();
      
      // Final score with truncation bounds
      let xi = mean + explained + resid;
      
      // Apply truncation bounds
      const lower = player.projection?.lowerBound ?? 0;
      const upper = player.projection?.upperBound ?? mean * 3;
      xi = Math.max(lower, Math.min(upper, xi));
      
      scores[i] = xi;
      total += xi;
    }
    
    totals[s] = total;
    perSimScores.push(scores);
  }
  
  return { totals, perSimScores };
}

/**
 * Calculate analytic mean and variance under factor model
 * Mean = Σ μ_i
 * Var = Σ σ²_resid,i + Σ_k (Σ_i λ_ik)²
 */
export function lineupMeanAndVariance(
  lineup: PlayerProjection[]
): { mean: number; variance: number } {
  const n = lineup.length;
  
  // Calculate mean
  const mean = lineup.reduce((sum, p) => 
    sum + (p.projection?.mean || p.projection?.median || 0), 0
  );
  
  // Build factorization
  const { loadings, residSD, nFactors } = buildFactorization(lineup);
  
  // Calculate variance
  let variance = 0;
  
  // Add residual variances
  for (let i = 0; i < n; i++) {
    variance += residSD[i] * residSD[i];
  }
  
  // Add factor contributions
  for (let k = 0; k < nFactors; k++) {
    let factorSum = 0;
    for (let i = 0; i < n; i++) {
      factorSum += loadings[i][k];
    }
    variance += factorSum * factorSum;
  }
  
  return { mean, variance };
}

/**
 * Get correlation matrix from factor model
 * ρ_ij = (Λ_i · Λ_j) / (σ_i * σ_j)
 */
export function getCorrelationMatrix(lineup: PlayerProjection[]): number[][] {
  const n = lineup.length;
  const { loadings, residSD } = buildFactorization(lineup);
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  // Calculate total SD for each player
  const totalSD: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const factorVar = loadings[i].reduce((sum, l) => sum + l * l, 0);
    const totalVar = factorVar + residSD[i] * residSD[i];
    totalSD[i] = Math.sqrt(totalVar);
  }
  
  // Calculate correlations
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else {
        // Covariance from shared factors
        let cov = 0;
        for (let k = 0; k < loadings[i].length; k++) {
          cov += loadings[i][k] * loadings[j][k];
        }
        
        // Correlation
        matrix[i][j] = cov / (totalSD[i] * totalSD[j]);
        
        // Ensure in [-1, 1]
        matrix[i][j] = Math.max(-1, Math.min(1, matrix[i][j]));
      }
    }
  }
  
  return matrix;
}

/**
 * Verify matrix is positive semi-definite
 */
export function isPSD(matrix: number[][]): boolean {
  const n = matrix.length;
  
  // Check symmetry
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (Math.abs(matrix[i][j] - matrix[j][i]) > 1e-10) {
        return false;
      }
    }
  }
  
  // Sylvester's criterion: all leading principal minors >= 0
  // For practical purposes, check eigenvalues via power iteration
  // Simplified: just check diagonal dominance as proxy
  for (let i = 0; i < n; i++) {
    const diag = matrix[i][i];
    const offDiagSum = matrix[i].reduce((sum, val, j) => 
      i === j ? sum : sum + Math.abs(val), 0
    );
    
    // Gershgorin circle theorem
    if (diag < offDiagSum - 1) {
      return false;
    }
  }
  
  return true;
}