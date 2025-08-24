/**
 * Corrected Calibration Metrics
 * CRPS and reliability for distribution quality assessment
 */

/**
 * Continuous Ranked Probability Score from samples
 * Lower is better
 */
export function crpsFromSamples(samples: number[], y: number): number {
  const n = samples.length;
  const meanAbs = samples.reduce((s, x) => s + Math.abs(x - y), 0) / n;
  const sorted = [...samples].sort((a, b) => a - b);
  
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += sorted[i] * (2 * (i + 1) - n - 1);
  }
  const exx = (2 / (n * n)) * acc;
  
  return meanAbs - 0.5 * exx;
}

/**
 * Reliability binning for calibration analysis
 */
export function reliabilityBins(
  pred: number[], 
  obs: boolean[], 
  bins = 10
): { 
  lo: number; 
  hi: number; 
  avgP: number; 
  freq: number; 
  count: number 
}[] {
  const edges = Array.from({ length: bins + 1 }, (_, i) => i / bins);
  const out: { 
    lo: number; 
    hi: number; 
    avgP: number; 
    freq: number; 
    count: number 
  }[] = [];
  
  for (let b = 0; b < bins; b++) {
    const lo = edges[b], hi = edges[b + 1];
    const inIdx: number[] = [];
    
    for (let i = 0; i < pred.length; i++) {
      if (pred[i] >= lo && pred[i] < hi) inIdx.push(i);
    }
    
    if (inIdx.length === 0) continue;
    
    const avgP = inIdx.reduce((s, j) => s + pred[j], 0) / inIdx.length;
    const freq = inIdx.reduce((s, j) => s + (obs[j] ? 1 : 0), 0) / inIdx.length;
    
    out.push({ lo, hi, avgP, freq, count: inIdx.length });
  }
  
  return out;
}

/**
 * Expected Calibration Error
 * Weighted average of bin calibration errors
 */
export function expectedCalibrationError(
  bins: { avgP: number; freq: number; count: number }[], 
  N: number
): number {
  return bins.reduce(
    (s, b) => s + (b.count / N) * Math.abs(b.avgP - b.freq), 
    0
  );
}