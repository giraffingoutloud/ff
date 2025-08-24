/**
 * Corrected Projection Builder
 * Fixed bounds per position, fit only (μ, σ) from quantiles
 */

import { PlayerInfo, GameInfo, PlayerProjection, Position } from '../domain/typesCorrected';
import { TruncatedNormal, fitTNFromQuantiles } from './truncatedNormalCorrected';

// Position-specific coefficient of variation
const POSITION_CV: Record<Position, number> = { 
  QB: 0.20, 
  RB: 0.25, 
  WR: 0.30, 
  TE: 0.35, 
  K: 0.40, 
  DST: 0.60 
};

// Fixed bounds per position (calibrated annually)
const POSITION_BOUNDS: Record<Position, { a: number; b: number }> = {
  QB:  { a: 0,  b: 60 },
  RB:  { a: 0,  b: 50 },
  WR:  { a: 0,  b: 55 },
  TE:  { a: 0,  b: 40 },
  K:   { a: 0,  b: 25 },
  DST: { a: -10, b: 35 }
};

export interface ProjectionInputs {
  p10?: number; 
  p50?: number; 
  p90?: number;
  mean?: number; 
  cvHint?: number;
  lower?: number; 
  upper?: number;
}

/**
 * Build player projection with proper TN fitting
 */
export function buildPlayerProjection(
  player: PlayerInfo,
  game: GameInfo,
  inputs: ProjectionInputs
): PlayerProjection {
  const pos = player.position;
  const a = inputs.lower ?? POSITION_BOUNDS[pos].a;
  const b = inputs.upper ?? POSITION_BOUNDS[pos].b;

  let tn: TruncatedNormal;
  
  // Prefer quantiles for fitting
  if (inputs.p10 !== undefined && inputs.p50 !== undefined && inputs.p90 !== undefined) {
    // Three quantiles - well-posed
    tn = fitTNFromQuantiles(
      [
        { p: 0.10, x: inputs.p10 }, 
        { p: 0.50, x: inputs.p50 }, 
        { p: 0.90, x: inputs.p90 }
      ], 
      a, b
    ).tn;
  } else if (inputs.p10 !== undefined && inputs.p90 !== undefined) {
    // Two quantiles - minimal
    tn = fitTNFromQuantiles(
      [
        { p: 0.10, x: inputs.p10 }, 
        { p: 0.90, x: inputs.p90 }
      ], 
      a, b
    ).tn;
  } else {
    // Fall back to mean + CV
    const target = inputs.mean ?? inputs.p50 ?? 0;
    let mu = target;
    let sigma = Math.max(target * (inputs.cvHint ?? POSITION_CV[pos]), 1.0);
    
    // Iterate to match E[TN] = target
    for (let it = 0; it < 30; it++) {
      const curr = new TruncatedNormal(mu, sigma, a, b);
      const diff = curr.mean() - target;
      if (Math.abs(diff) < 1e-2) { 
        tn = curr; 
        break; 
      }
      // Adjust μ to compensate for truncation
      mu -= 0.8 * diff;
      sigma = Math.max(0.1, sigma * (1 - 0.1 * Math.sign(diff)));
    }
    tn ??= new TruncatedNormal(mu, sigma, a, b);
  }
  
  return { 
    player, 
    game, 
    tn, 
    mean: tn.mean(), 
    sd: Math.sqrt(tn.variance()), 
    lower: a, 
    upper: b 
  };
}