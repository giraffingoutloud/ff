/**
 * Injury Uncertainty Modeling with Mixtures
 * 2025-2026 Season Implementation
 */

import { PlayerProjection, PlayerInfo } from '../domain/typesCorrected';
import { TruncatedNormal } from './truncatedNormalRobust';
import { RNG } from '../utils/rng';

/**
 * Injury status probabilities based on designation
 */
export const INJURY_PROBABILITIES = {
  HEALTHY: 0.98,
  QUESTIONABLE: 0.75,
  DOUBTFUL: 0.25,
  GTD: 0.60, // Game-time decision
  OUT: 0.00,
  IR: 0.00
};

/**
 * Mixture model for injured players
 */
export class InjuryMixtureProjection {
  constructor(
    private activeProjection: PlayerProjection,
    private pActive: number
  ) {}
  
  /**
   * Sample from mixture
   */
  sample(rng: RNG): number {
    if (rng.next() < this.pActive) {
      // Player active - use normal projection
      return this.activeProjection.tn.sample(rng);
    } else {
      // Player inactive - near-zero points
      return rng.next() * 0.5; // 0-0.5 points if inactive
    }
  }
  
  /**
   * Expected value accounting for injury
   */
  mean(): number {
    return this.pActive * this.activeProjection.mean;
  }
  
  /**
   * Variance accounting for injury uncertainty
   */
  variance(): number {
    const activeMean = this.activeProjection.mean;
    const activeVar = this.activeProjection.sd * this.activeProjection.sd;
    
    // E[X] = p * E[X|active] + (1-p) * E[X|inactive]
    // Var[X] = E[X²] - E[X]²
    // E[X²] = p * E[X²|active] + (1-p) * E[X²|inactive]
    
    const eX = this.pActive * activeMean;
    const eX2Active = activeVar + activeMean * activeMean;
    const eX2Inactive = 0.25 / 3; // Variance of uniform[0, 0.5]
    const eX2 = this.pActive * eX2Active + (1 - this.pActive) * eX2Inactive;
    
    return eX2 - eX * eX;
  }
  
  /**
   * Create adjusted TN for simplified use
   */
  toAdjustedTN(): TruncatedNormal {
    const mean = this.mean();
    const sd = Math.sqrt(this.variance());
    
    // Fit TN with adjusted parameters
    const mu = mean;
    const sigma = sd;
    const a = 0;
    const b = this.activeProjection.upper;
    
    return new TruncatedNormal(mu, sigma, a, b);
  }
}

/**
 * Adjust projection for injury status
 */
export function adjustForInjury(
  projection: PlayerProjection
): PlayerProjection {
  const status = projection.player.status;
  const pActive = INJURY_PROBABILITIES[status] ?? 1.0;
  
  if (pActive >= 0.98) {
    // Healthy - no adjustment
    return projection;
  }
  
  if (pActive <= 0.01) {
    // Out/IR - zero projection
    const zeroTN = new TruncatedNormal(0.1, 0.1, 0, 1);
    return {
      ...projection,
      tn: zeroTN,
      mean: 0,
      sd: 0.1,
      lower: 0,
      upper: 1
    };
  }
  
  // Create mixture model
  const mixture = new InjuryMixtureProjection(projection, pActive);
  const adjustedTN = mixture.toAdjustedTN();
  
  return {
    ...projection,
    tn: adjustedTN,
    mean: mixture.mean(),
    sd: Math.sqrt(mixture.variance()),
    lower: 0,
    upper: projection.upper
  };
}

/**
 * Monte Carlo simulation with injury uncertainty
 */
export function simulateWithInjuries(
  lineup: PlayerProjection[],
  sims: number,
  rng: RNG
): number[] {
  const mixtures = lineup.map(p => {
    const pActive = INJURY_PROBABILITIES[p.player.status] ?? 1.0;
    return new InjuryMixtureProjection(p, pActive);
  });
  
  const totals: number[] = [];
  
  for (let s = 0; s < sims; s++) {
    let total = 0;
    for (const mixture of mixtures) {
      total += mixture.sample(rng);
    }
    totals.push(total);
  }
  
  return totals;
}

/**
 * Practice report parser for injury updates
 */
export interface PracticeReport {
  playerId: string;
  wednesday?: 'FP' | 'LP' | 'DNP' | null;
  thursday?: 'FP' | 'LP' | 'DNP' | null;
  friday?: 'FP' | 'LP' | 'DNP' | null;
  saturday?: 'FP' | 'LP' | 'DNP' | null;
}

/**
 * Update injury probability from practice reports
 */
export function updateFromPractice(
  status: PlayerInfo['status'],
  report: PracticeReport
): number {
  const base = INJURY_PROBABILITIES[status] ?? 0.75;
  
  // Get latest practice status
  const practices = [
    report.saturday,
    report.friday,
    report.thursday,
    report.wednesday
  ].filter(p => p !== null && p !== undefined);
  
  if (practices.length === 0) {
    return base;
  }
  
  const latest = practices[0];
  
  // Adjust based on practice participation
  switch (latest) {
    case 'FP': // Full practice
      return Math.min(0.95, base + 0.15);
    case 'LP': // Limited practice
      return base;
    case 'DNP': // Did not practice
      return Math.max(0.10, base - 0.25);
    default:
      return base;
  }
}

/**
 * Market-based injury probability calibration
 */
export function calibrateFromMarket(
  projection: PlayerProjection,
  marketLine: number,
  originalLine: number
): number {
  const lineShift = (originalLine - marketLine) / originalLine;
  
  // Large negative shift suggests injury concern
  if (lineShift > 0.15) {
    return 0.60; // Likely questionable
  } else if (lineShift > 0.30) {
    return 0.30; // Likely doubtful
  } else if (lineShift < -0.10) {
    return 0.95; // Upgraded to probable
  }
  
  return INJURY_PROBABILITIES[projection.player.status] ?? 0.75;
}