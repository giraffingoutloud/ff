/**
 * Externalized weight configuration for the evaluation engine
 * These weights can be tuned without modifying core engine code
 */

export interface ComponentWeights {
  pps: number;  // Projected Performance Score
  var: number;  // Value Above Replacement
  con: number;  // Consistency
  ups: number;  // Upside
  sos: number;  // Strength of Schedule
  trd: number;  // Trend
  inj: number;  // Injury discount
}

export interface PositionWeights {
  QB: ComponentWeights;
  RB: ComponentWeights;
  WR: ComponentWeights;
  TE: ComponentWeights;
  K: ComponentWeights;
  DST: ComponentWeights;
}

/**
 * Default weights - can be overridden by calibrated values
 */
export const defaultWeights: PositionWeights = {
  QB: {
    pps: 0.35,  // Raw production most important
    var: 0.30,  // Value over replacement critical
    con: 0.10,  // Age less important for QBs
    ups: 0.10,
    sos: 0.10,
    trd: 0.03,  // Age trends minimal
    inj: 0.02   // QBs durable
  },
  RB: {
    pps: 0.25,  // Reduced - other factors more predictive
    var: 0.25,
    con: 0.20,  // Age/consistency critical for RBs
    ups: 0.08,
    sos: 0.08,
    trd: 0.06,  // Age trends matter
    inj: 0.08   // Injury risk high
  },
  WR: {
    pps: 0.30,
    var: 0.25,
    con: 0.15,  // Moderate age impact
    ups: 0.10,
    sos: 0.10,
    trd: 0.05,
    inj: 0.05
  },
  TE: {
    pps: 0.30,
    var: 0.25,
    con: 0.15,
    ups: 0.12,  // Late breakout potential
    sos: 0.08,
    trd: 0.05,
    inj: 0.05
  },
  K: {
    pps: 0.40,
    var: 0.30,
    con: 0.10,
    ups: 0.05,
    sos: 0.10,
    trd: 0.03,
    inj: 0.02
  },
  DST: {
    pps: 0.35,
    var: 0.30,
    con: 0.15,
    ups: 0.05,
    sos: 0.12,  // Schedule matters for DST
    trd: 0.03,
    inj: 0.00   // N/A for DST
  }
};

/**
 * Position multipliers for overall scoring
 * Updated to better reflect 2025 fantasy value
 */
export const positionMultipliers = {
  QB: 1.00,   // QBs normalized - top QBs are valuable
  RB: 1.20,   // RB scarcity premium (reduced from 1.30)
  WR: 1.00,   // Baseline
  TE: 1.10,   // Elite TE premium
  K: 0.60,    // Kickers very replaceable
  DST: 0.65   // DSTs replaceable
};

/**
 * Replacement levels by position (PPR scoring)
 * Based on 2025 fantasy projections for 12-team leagues
 * Source: FantasyPros VBD data shows QB12 (Bryce Young) at 244.4 points
 */
export const replacementLevels = {
  QB: 244,   // Points for 12th QB (verified: Bryce Young 2025)
  RB: 150,   // Points for 36th RB (12 teams * 3 RBs)
  WR: 140,   // Points for 36th WR
  TE: 100,   // Points for 12th TE
  K: 120,    // Points for 12th K
  DST: 110   // Points for 12th DST
};

/**
 * Age optimal ranges by position
 */
export const ageOptimalRanges = {
  QB: { min: 26, max: 33 },
  RB: { min: 22, max: 26 },
  WR: { min: 25, max: 29 },
  TE: { min: 26, max: 30 },
  K: { min: 25, max: 35 },
  DST: { min: 0, max: 0 }  // N/A
};

/**
 * Configuration flags to avoid double-counting
 */
export const engineConfig = {
  // When using explicit age multiplier, reduce age impact in other components
  reduceAgeInComponentsWhenMultiplierActive: true,
  ageReductionFactor: 0.3, // Reduce age impact by 70% in components when multiplier is active
  
  // Market context adjustments
  enableMarketContext: true,
  inflationThreshold: 1.2,  // 20% over expected
  deflationThreshold: 0.8,  // 20% under expected
  
  // Validation settings
  minSampleSizeForCalibration: 20,
  confidenceLevel: 0.95
};

/**
 * Load calibrated weights if available
 */
export async function loadCalibratedWeights(): Promise<PositionWeights | null> {
  try {
    // In production, this would load from a calibrated JSON file
    const calibrated = await import('./positionWeights.json');
    return calibrated.default as PositionWeights;
  } catch {
    console.log('No calibrated weights found, using defaults');
    return null;
  }
}

/**
 * Validate that weights sum to 1.0 for each position
 */
export function validateWeights(weights: PositionWeights): boolean {
  for (const position of Object.keys(weights) as Array<keyof PositionWeights>) {
    const sum = Object.values(weights[position]).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn(`Weights for ${position} sum to ${sum}, not 1.0`);
      return false;
    }
  }
  return true;
}