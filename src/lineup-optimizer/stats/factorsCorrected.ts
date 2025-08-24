/**
 * Corrected Factor Model for Latent Correlations
 * Guarantees PSD through Λ Λᵀ + D construction
 */

import { PlayerProjection, Position } from '../domain/typesCorrected';

// Explained variance fraction in latent space
export const EXPLAINED_FRACTION_LATENT: Record<Position, number> = {
  QB: 0.35, 
  WR: 0.30, 
  TE: 0.25, 
  RB: 0.20, 
  K: 0.15, 
  DST: 0.10
};

// Factor loadings with team boost (applied to explained fraction, not correlation)
export const POS_WEIGHTS: Record<Position, { 
  pass: number; 
  rush: number; 
  pace: number; 
  teamBoost: number 
}> = {
  QB:  { pass: 0.85, rush: 0.05, pace: 0.25, teamBoost: 1.10 },
  WR:  { pass: 0.80, rush: 0.05, pace: 0.20, teamBoost: 1.10 },
  TE:  { pass: 0.70, rush: 0.10, pace: 0.20, teamBoost: 1.05 },
  RB:  { pass: 0.35, rush: 0.65, pace: 0.15, teamBoost: 1.00 },
  K:   { pass: 0.25, rush: 0.25, pace: 0.50, teamBoost: 1.00 },
  DST: { pass: -0.25, rush: -0.20, pace: 0.10, teamBoost: 1.00 }
};

export interface FactorSetup {
  weights: number[][];     // nPlayers × nFactors
  nFactors: number;
  factorIndex: Map<string, number>;
}

/**
 * Build latent factor weights ensuring ||w_i||² ≤ 1
 * This guarantees PSD correlation: Σ = ΛΛᵀ + D where D = diag(1 - ||λ_i||²)
 */
export function buildLatentFactorWeights(lineup: PlayerProjection[]): FactorSetup {
  const factorIndex = new Map<string, number>();
  const add = (k: string) => { 
    if (!factorIndex.has(k)) factorIndex.set(k, factorIndex.size); 
    return factorIndex.get(k)!; 
  };

  // Identify unique teams and games for factors
  const teams = new Set<string>();
  const games = new Set<string>();
  
  for (const p of lineup) { 
    teams.add(p.player.team); 
    games.add(p.game.gameId); 
  }
  
  // Create factors: per-team pass/rush + per-game pace
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
    
    // Base explained fraction
    const f = Math.max(0, Math.min(0.95, EXPLAINED_FRACTION_LATENT[pos]));
    
    // Apply team boost to explained fraction (not correlation directly)
    const boost = POS_WEIGHTS[pos].teamBoost;
    const fBoost = Math.min(0.98, f * boost);
    
    // Target norm in latent space to achieve explained fraction
    const targetNorm = Math.sqrt(fBoost);

    // Get raw factor loadings
    const w = POS_WEIGHTS[pos];
    const raw = [w.pass, w.rush, w.pace];
    const norm = Math.hypot(...raw) || 1;
    
    // Scale to achieve target norm
    const scale = targetNorm / norm;

    // Assign scaled weights to factors
    const passIdx = factorIndex.get(`${p.player.team}:pass`)!;
    const rushIdx = factorIndex.get(`${p.player.team}:rush`)!;
    const gameIdx = factorIndex.get(`GAME:${p.game.gameId}`)!;

    weights[i][passIdx] = raw[0] * scale;
    weights[i][rushIdx] = raw[1] * scale;
    weights[i][gameIdx] = raw[2] * scale;
  });

  return { weights, nFactors, factorIndex };
}