/**
 * Calibration Metrics
 * CRPS via samples, reliability analysis, interval coverage
 */

/**
 * Continuous Ranked Probability Score from samples
 * CRPS = E|X - y| - 0.5 * E|X - X'|
 */
export function crpsFromSamples(samples: number[], actual: number): number {
  const n = samples.length;
  if (n === 0) return 0;
  
  // E|X - y|
  const meanAbsError = samples.reduce((sum, x) => sum + Math.abs(x - actual), 0) / n;
  
  // E|X - X'| via sorted samples
  const sorted = [...samples].sort((a, b) => a - b);
  
  // Efficient O(n) formula: (2/n²) * Σ_i (2i - n - 1) * x_i
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += sorted[i] * (2 * (i + 1) - n - 1);
  }
  const exx = (2 / (n * n)) * acc;
  
  return meanAbsError - 0.5 * exx;
}

/**
 * Reliability analysis for probabilistic predictions
 * Bins predicted probabilities and compares to observed frequencies
 */
export function reliabilityBins(
  predicted: number[],
  observed: boolean[],
  nBins: number = 10
): Array<{
  lo: number;
  hi: number;
  avgPredicted: number;
  observedFreq: number;
  count: number;
  se: number;
}> {
  if (predicted.length !== observed.length) {
    throw new Error('Predicted and observed arrays must have same length');
  }
  
  const edges = Array.from({ length: nBins + 1 }, (_, i) => i / nBins);
  const bins: Array<{
    lo: number;
    hi: number;
    avgPredicted: number;
    observedFreq: number;
    count: number;
    se: number;
  }> = [];
  
  for (let b = 0; b < nBins; b++) {
    const lo = edges[b];
    const hi = edges[b + 1];
    
    // Find predictions in this bin
    const indices: number[] = [];
    for (let i = 0; i < predicted.length; i++) {
      if (predicted[i] >= lo && predicted[i] < hi) {
        indices.push(i);
      }
    }
    
    if (indices.length === 0) continue;
    
    // Calculate statistics for this bin
    const avgPredicted = indices.reduce((sum, i) => sum + predicted[i], 0) / indices.length;
    const observedCount = indices.reduce((sum, i) => sum + (observed[i] ? 1 : 0), 0);
    const observedFreq = observedCount / indices.length;
    
    // Standard error (binomial)
    const se = Math.sqrt(observedFreq * (1 - observedFreq) / indices.length);
    
    bins.push({
      lo,
      hi,
      avgPredicted,
      observedFreq,
      count: indices.length,
      se
    });
  }
  
  return bins;
}

/**
 * Calculate calibration error (ECE - Expected Calibration Error)
 */
export function expectedCalibrationError(
  bins: Array<{ avgPredicted: number; observedFreq: number; count: number }>
): number {
  const totalCount = bins.reduce((sum, b) => sum + b.count, 0);
  if (totalCount === 0) return 0;
  
  let ece = 0;
  for (const bin of bins) {
    const weight = bin.count / totalCount;
    const error = Math.abs(bin.avgPredicted - bin.observedFreq);
    ece += weight * error;
  }
  
  return ece;
}

/**
 * Interval coverage analysis
 */
export function intervalCoverage(
  predictions: Array<{ lower: number; upper: number }>,
  actuals: number[],
  nominalCoverage: number = 0.8
): {
  actualCoverage: number;
  nominalCoverage: number;
  coverageError: number;
  isCalibrated: boolean;
} {
  if (predictions.length !== actuals.length) {
    throw new Error('Predictions and actuals must have same length');
  }
  
  let covered = 0;
  for (let i = 0; i < predictions.length; i++) {
    if (actuals[i] >= predictions[i].lower && actuals[i] <= predictions[i].upper) {
      covered++;
    }
  }
  
  const actualCoverage = covered / predictions.length;
  const coverageError = Math.abs(actualCoverage - nominalCoverage);
  
  // Consider calibrated if within 5% of nominal
  const isCalibrated = coverageError < 0.05;
  
  return {
    actualCoverage,
    nominalCoverage,
    coverageError,
    isCalibrated
  };
}

/**
 * Brier Score for binary outcomes
 */
export function brierScore(
  predicted: number[],
  observed: boolean[]
): number {
  if (predicted.length !== observed.length) {
    throw new Error('Arrays must have same length');
  }
  
  let sum = 0;
  for (let i = 0; i < predicted.length; i++) {
    const diff = predicted[i] - (observed[i] ? 1 : 0);
    sum += diff * diff;
  }
  
  return sum / predicted.length;
}

/**
 * Log Score (logarithmic scoring rule)
 */
export function logScore(
  predicted: number[],
  observed: boolean[]
): number {
  if (predicted.length !== observed.length) {
    throw new Error('Arrays must have same length');
  }
  
  let sum = 0;
  for (let i = 0; i < predicted.length; i++) {
    const p = Math.max(1e-10, Math.min(1 - 1e-10, predicted[i]));
    if (observed[i]) {
      sum += Math.log(p);
    } else {
      sum += Math.log(1 - p);
    }
  }
  
  return -sum / predicted.length; // Return positive value (lower is better)
}

/**
 * Comprehensive calibration report
 */
export interface CalibrationReport {
  crps?: number;
  brier?: number;
  logScore?: number;
  ece?: number;
  reliability?: Array<{
    lo: number;
    hi: number;
    avgPredicted: number;
    observedFreq: number;
    count: number;
    se: number;
  }>;
  intervalCoverage?: {
    coverage80?: { actual: number; nominal: number; isCalibrated: boolean };
    coverage50?: { actual: number; nominal: number; isCalibrated: boolean };
  };
  sampleSize: number;
  isWellCalibrated: boolean;
}

/**
 * Generate comprehensive calibration report
 */
export function generateCalibrationReport(
  predictions: Array<{
    samples?: number[];
    probability?: number;
    intervals?: { p10: number; p90: number; p25: number; p75: number };
  }>,
  actuals: Array<{ value?: number; outcome?: boolean }>,
  options: {
    computeCRPS?: boolean;
    computeReliability?: boolean;
    computeIntervals?: boolean;
  } = {}
): CalibrationReport {
  const report: CalibrationReport = {
    sampleSize: actuals.length,
    isWellCalibrated: true
  };
  
  // CRPS from samples
  if (options.computeCRPS && predictions[0]?.samples && actuals[0]?.value !== undefined) {
    const crpsValues: number[] = [];
    for (let i = 0; i < Math.min(predictions.length, actuals.length); i++) {
      if (predictions[i].samples && actuals[i].value !== undefined) {
        crpsValues.push(crpsFromSamples(predictions[i].samples!, actuals[i].value!));
      }
    }
    if (crpsValues.length > 0) {
      report.crps = crpsValues.reduce((a, b) => a + b, 0) / crpsValues.length;
      if (report.crps > 5) report.isWellCalibrated = false; // Threshold for FF
    }
  }
  
  // Reliability and Brier/Log scores
  if (options.computeReliability) {
    const probs: number[] = [];
    const outcomes: boolean[] = [];
    
    for (let i = 0; i < Math.min(predictions.length, actuals.length); i++) {
      if (predictions[i].probability !== undefined && actuals[i].outcome !== undefined) {
        probs.push(predictions[i].probability!);
        outcomes.push(actuals[i].outcome!);
      }
    }
    
    if (probs.length > 0) {
      report.reliability = reliabilityBins(probs, outcomes);
      report.ece = expectedCalibrationError(report.reliability);
      report.brier = brierScore(probs, outcomes);
      report.logScore = logScore(probs, outcomes);
      
      if (report.ece > 0.1) report.isWellCalibrated = false;
    }
  }
  
  // Interval coverage
  if (options.computeIntervals && predictions[0]?.intervals && actuals[0]?.value !== undefined) {
    const intervals80: Array<{ lower: number; upper: number }> = [];
    const intervals50: Array<{ lower: number; upper: number }> = [];
    const values: number[] = [];
    
    for (let i = 0; i < Math.min(predictions.length, actuals.length); i++) {
      if (predictions[i].intervals && actuals[i].value !== undefined) {
        intervals80.push({
          lower: predictions[i].intervals!.p10,
          upper: predictions[i].intervals!.p90
        });
        intervals50.push({
          lower: predictions[i].intervals!.p25,
          upper: predictions[i].intervals!.p75
        });
        values.push(actuals[i].value!);
      }
    }
    
    if (values.length > 0) {
      const cov80 = intervalCoverage(intervals80, values, 0.8);
      const cov50 = intervalCoverage(intervals50, values, 0.5);
      
      report.intervalCoverage = {
        coverage80: {
          actual: cov80.actualCoverage,
          nominal: cov80.nominalCoverage,
          isCalibrated: cov80.isCalibrated
        },
        coverage50: {
          actual: cov50.actualCoverage,
          nominal: cov50.nominalCoverage,
          isCalibrated: cov50.isCalibrated
        }
      };
      
      if (!cov80.isCalibrated || !cov50.isCalibrated) {
        report.isWellCalibrated = false;
      }
    }
  }
  
  return report;
}