/**
 * 2025-2026 Simulators with Exact Gaussian Copula
 * No clamping - exact marginal preservation via copula transform
 */

import { RNG } from '../utils/rng';
import { lhsNormals } from '../utils/latinHypercube';
import { normalCDF } from '../utils/normal';
import { PlayerProjection, Position } from '../domain/typesCorrected';

/**
 * Position-specific explained variance fractions
 */
export const EXPLAINED_FRACTION_LATENT: Record<Position, number> = {
  QB: 0.35,
  WR: 0.30,
  TE: 0.25,
  RB: 0.20,
  K: 0.15,
  DST: 0.10
};

/**
 * Position weights for latent factors
 */
export const POS_WEIGHTS: Record<Position, {
  pass: number;
  rush: number;
  pace: number;
  teamBoost: number;
}> = {
  QB: { pass: 0.85, rush: 0.05, pace: 0.25, teamBoost: 1.10 },
  WR: { pass: 0.80, rush: 0.05, pace: 0.20, teamBoost: 1.10 },
  TE: { pass: 0.70, rush: 0.10, pace: 0.20, teamBoost: 1.05 },
  RB: { pass: 0.35, rush: 0.65, pace: 0.15, teamBoost: 1.00 },
  K: { pass: 0.25, rush: 0.25, pace: 0.50, teamBoost: 1.00 },
  DST: { pass: -0.25, rush: -0.20, pace: 0.10, teamBoost: 1.00 }
};

export interface FactorSetup {
  weights: number[][];
  nFactors: number;
  factorIndex: Map<string, number>;
}

/**
 * Build latent factor weights with PSD guarantee
 */
export function buildLatentFactorWeights(lineup: PlayerProjection[]): FactorSetup {
  const factorIndex = new Map<string, number>();
  const add = (k: string) => {
    if (!factorIndex.has(k)) {
      factorIndex.set(k, factorIndex.size);
    }
    return factorIndex.get(k)!;
  };
  
  // Create factors for teams and games
  const teams = new Set<string>();
  const games = new Set<string>();
  
  for (const p of lineup) {
    teams.add(p.player.team);
    games.add(p.game.gameId);
  }
  
  for (const t of teams) {
    add(`${t}:pass`);
    add(`${t}:rush`);
  }
  
  for (const g of games) {
    add(`GAME:${g}`);
  }
  
  const nFactors = factorIndex.size;
  const weights = Array.from({ length: lineup.length }, () => Array(nFactors).fill(0));
  
  lineup.forEach((p, i) => {
    const pos = p.player.position;
    const f = Math.max(0, Math.min(0.95, EXPLAINED_FRACTION_LATENT[pos]));
    const boost = POS_WEIGHTS[pos].teamBoost;
    const fBoost = Math.min(0.98, f * boost);
    const targetNorm = Math.sqrt(fBoost);
    
    const w = POS_WEIGHTS[pos];
    const raw = [w.pass, w.rush, w.pace];
    const norm = Math.hypot(...raw) || 1;
    const scale = targetNorm / norm;
    
    const passIdx = factorIndex.get(`${p.player.team}:pass`)!;
    const rushIdx = factorIndex.get(`${p.player.team}:rush`)!;
    const gameIdx = factorIndex.get(`GAME:${p.game.gameId}`)!;
    
    weights[i][passIdx] = raw[0] * scale;
    weights[i][rushIdx] = raw[1] * scale;
    weights[i][gameIdx] = raw[2] * scale;
  });
  
  return { weights, nFactors, factorIndex };
}

/**
 * Standard MC with Gaussian copula: EXACT marginals, no clamping
 */
export function simulateTotalsCopulaTN(
  lineup: PlayerProjection[],
  sims: number,
  rng: RNG
): number[] {
  const n = lineup.length;
  const { weights, nFactors } = buildLatentFactorWeights(lineup);
  
  // Calculate residual variances
  const norms = weights.map(w => Math.hypot(...w));
  const residVars = norms.map(norm => Math.max(0, 1 - norm * norm));
  
  const totals = new Array<number>(sims);
  
  for (let s = 0; s < sims; s++) {
    // Generate shared factors
    const G = Array.from({ length: nFactors }, () => rng.normal());
    
    let total = 0;
    for (let i = 0; i < n; i++) {
      // Common component from factors
      let common = 0;
      for (let k = 0; k < nFactors; k++) {
        common += weights[i][k] * G[k];
      }
      
      // Idiosyncratic component
      const resid = Math.sqrt(residVars[i]) * rng.normal();
      
      // Latent normal
      const Zi = common + resid;
      
      // Transform to uniform via CDF
      const Ui = normalCDF(Zi);
      
      // Apply TN quantile - EXACT marginal, no clamping!
      total += lineup[i].tn.quantile(Ui);
    }
    
    totals[s] = total;
  }
  
  return totals;
}

/**
 * LHS-based variance reduction with Gaussian copula
 */
export function simulateTotalsCopulaTN_LHS(
  lineup: PlayerProjection[],
  sims: number,
  rng: RNG
): number[] {
  const n = lineup.length;
  const { weights, nFactors } = buildLatentFactorWeights(lineup);
  
  // Calculate residual variances
  const norms = weights.map(w => Math.hypot(...w));
  const residVars = norms.map(norm => Math.max(0, 1 - norm * norm));
  
  // Generate LHS samples: dims = nFactors + n (shared + residuals)
  const dims = nFactors + n;
  const Z = lhsNormals(dims, sims, rng); // dims × sims
  
  const totals = new Array<number>(sims);
  
  for (let s = 0; s < sims; s++) {
    // Extract shared factors
    const Gs = new Array<number>(nFactors);
    for (let k = 0; k < nFactors; k++) {
      Gs[k] = Z[k][s];
    }
    
    let total = 0;
    for (let i = 0; i < n; i++) {
      // Common component
      let common = 0;
      for (let k = 0; k < nFactors; k++) {
        common += weights[i][k] * Gs[k];
      }
      
      // Residual from LHS (offset by nFactors)
      const resid = Math.sqrt(residVars[i]) * Z[nFactors + i][s];
      
      // Latent normal
      const Zi = common + resid;
      
      // Transform to uniform
      const Ui = normalCDF(Zi);
      
      // Apply TN quantile - EXACT marginal!
      total += lineup[i].tn.quantile(Ui);
    }
    
    totals[s] = total;
  }
  
  return totals;
}

/**
 * Joint simulation with shared factors across two lineups
 */
export function simulateJointTotalsCopulaTN(
  lineupA: PlayerProjection[],
  lineupB: PlayerProjection[],
  sims: number,
  rng: RNG
): {
  totalsA: number[];
  totalsB: number[];
} {
  // Unify factor space across both lineups
  const unify = (lineup: PlayerProjection[]) => {
    const teams = new Set<string>();
    const games = new Set<string>();
    for (const p of lineup) {
      teams.add(p.player.team);
      games.add(p.game.gameId);
    }
    return { teams, games };
  };
  
  const a = unify(lineupA);
  const b = unify(lineupB);
  
  // Build unified factor index
  const factorIndex = new Map<string, number>();
  const add = (k: string) => {
    if (!factorIndex.has(k)) {
      factorIndex.set(k, factorIndex.size);
    }
    return factorIndex.get(k)!;
  };
  
  const teams = new Set<string>([...a.teams, ...b.teams]);
  const games = new Set<string>([...a.games, ...b.games]);
  
  for (const t of teams) {
    add(`${t}:pass`);
    add(`${t}:rush`);
  }
  
  for (const g of games) {
    add(`GAME:${g}`);
  }
  
  const nFactors = factorIndex.size;
  
  // Build weights for each lineup
  const buildWeights = (lineup: PlayerProjection[]) => {
    const weights = Array.from({ length: lineup.length }, () => Array(nFactors).fill(0));
    const norms = new Array(lineup.length).fill(0);
    
    lineup.forEach((p, i) => {
      const pos = p.player.position;
      const f = Math.max(0, Math.min(0.95, EXPLAINED_FRACTION_LATENT[pos]));
      const boost = POS_WEIGHTS[pos].teamBoost;
      const fBoost = Math.min(0.98, f * boost);
      const targetNorm = Math.sqrt(fBoost);
      
      const w = POS_WEIGHTS[pos];
      const raw = [w.pass, w.rush, w.pace];
      const norm = Math.hypot(...raw) || 1;
      const scale = targetNorm / norm;
      
      const passIdx = factorIndex.get(`${p.player.team}:pass`);
      const rushIdx = factorIndex.get(`${p.player.team}:rush`);
      const gameIdx = factorIndex.get(`GAME:${p.game.gameId}`);
      
      if (passIdx !== undefined) weights[i][passIdx] = raw[0] * scale;
      if (rushIdx !== undefined) weights[i][rushIdx] = raw[1] * scale;
      if (gameIdx !== undefined) weights[i][gameIdx] = raw[2] * scale;
      
      norms[i] = targetNorm;
    });
    
    return { weights, norms };
  };
  
  const WA = buildWeights(lineupA);
  const WB = buildWeights(lineupB);
  
  const totalsA = new Array<number>(sims);
  const totalsB = new Array<number>(sims);
  
  for (let s = 0; s < sims; s++) {
    // Shared factors across both lineups
    const G = Array.from({ length: nFactors }, () => rng.normal());
    
    // Lineup A
    let sumA = 0;
    for (let i = 0; i < lineupA.length; i++) {
      let common = 0;
      for (let k = 0; k < nFactors; k++) {
        common += WA.weights[i][k] * G[k];
      }
      const residVar = Math.max(0, 1 - WA.norms[i] * WA.norms[i]);
      const resid = Math.sqrt(residVar) * rng.normal();
      const Zi = common + resid;
      const Ui = normalCDF(Zi);
      sumA += lineupA[i].tn.quantile(Ui);
    }
    
    // Lineup B
    let sumB = 0;
    for (let j = 0; j < lineupB.length; j++) {
      let common = 0;
      for (let k = 0; k < nFactors; k++) {
        common += WB.weights[j][k] * G[k];
      }
      const residVar = Math.max(0, 1 - WB.norms[j] * WB.norms[j]);
      const resid = Math.sqrt(residVar) * rng.normal();
      const Zj = common + resid;
      const Uj = normalCDF(Zj);
      sumB += lineupB[j].tn.quantile(Uj);
    }
    
    totalsA[s] = sumA;
    totalsB[s] = sumB;
  }
  
  return { totalsA, totalsB };
}