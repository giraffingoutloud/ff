import { PlayerProjection } from '../types';

/**
 * Calibration Tracker
 * Tracks and evaluates projection accuracy using proper metrics
 */
export class CalibrationTracker {
  private predictions: Map<string, {
    projection: PlayerProjection;
    actual?: number;
    week: number;
  }[]> = new Map();
  
  /**
   * Record a projection
   */
  recordProjection(
    playerId: string,
    week: number,
    projection: PlayerProjection
  ): void {
    if (!this.predictions.has(playerId)) {
      this.predictions.set(playerId, []);
    }
    
    this.predictions.get(playerId)!.push({
      projection,
      week,
      actual: undefined
    });
  }
  
  /**
   * Record actual outcome
   */
  recordActual(
    playerId: string,
    week: number,
    actual: number
  ): void {
    const playerPredictions = this.predictions.get(playerId);
    if (!playerPredictions) return;
    
    const prediction = playerPredictions.find(p => p.week === week);
    if (prediction) {
      prediction.actual = actual;
    }
  }
  
  /**
   * Calculate Continuous Ranked Probability Score (CRPS)
   * Lower is better, measures distance between predicted and actual CDFs
   */
  calculateCRPS(): number {
    let totalCRPS = 0;
    let count = 0;
    
    for (const playerPreds of this.predictions.values()) {
      for (const pred of playerPreds) {
        if (pred.actual === undefined) continue;
        
        const actual = pred.actual;
        const proj = pred.projection.projection;
        
        // Approximate CRPS using quantiles
        // CRPS ≈ Σ (F(x) - I(actual ≤ x))² dx
        const quantiles = [
          { value: proj.floor, cdf: 0.10 },
          { value: proj.q1, cdf: 0.25 },
          { value: proj.median, cdf: 0.50 },
          { value: proj.q3, cdf: 0.75 },
          { value: proj.ceiling, cdf: 0.90 }
        ];
        
        let crps = 0;
        for (let i = 0; i < quantiles.length - 1; i++) {
          const x1 = quantiles[i].value;
          const x2 = quantiles[i + 1].value;
          const f1 = quantiles[i].cdf;
          const f2 = quantiles[i + 1].cdf;
          
          if (actual <= x1) {
            // Actual is below this segment
            crps += (x2 - x1) * ((f1 + f2) / 2);
          } else if (actual >= x2) {
            // Actual is above this segment
            crps += (x2 - x1) * ((2 - f1 - f2) / 2);
          } else {
            // Actual is within this segment
            const ratio = (actual - x1) / (x2 - x1);
            const fActual = f1 + ratio * (f2 - f1);
            crps += (actual - x1) * (fActual / 2);
            crps += (x2 - actual) * ((2 - fActual - f2) / 2);
          }
        }
        
        totalCRPS += crps;
        count++;
      }
    }
    
    return count > 0 ? totalCRPS / count : 0;
  }
  
  /**
   * Calculate Root Mean Squared Error
   */
  calculateRMSE(): number {
    let sumSquaredError = 0;
    let count = 0;
    
    for (const playerPreds of this.predictions.values()) {
      for (const pred of playerPreds) {
        if (pred.actual === undefined) continue;
        
        const error = pred.projection.projection.mean - pred.actual;
        sumSquaredError += error * error;
        count++;
      }
    }
    
    return count > 0 ? Math.sqrt(sumSquaredError / count) : 0;
  }
  
  /**
   * Calculate Mean Absolute Error
   */
  calculateMAE(): number {
    let sumAbsError = 0;
    let count = 0;
    
    for (const playerPreds of this.predictions.values()) {
      for (const pred of playerPreds) {
        if (pred.actual === undefined) continue;
        
        const error = Math.abs(pred.projection.projection.mean - pred.actual);
        sumAbsError += error;
        count++;
      }
    }
    
    return count > 0 ? sumAbsError / count : 0;
  }
  
  /**
   * Calculate interval coverage (should be ~80% for 10th-90th percentile)
   */
  calculateIntervalCoverage(lowerPercentile = 0.10, upperPercentile = 0.90): {
    coverage: number;
    expectedCoverage: number;
    calibrated: boolean;
  } {
    let inInterval = 0;
    let total = 0;
    
    for (const playerPreds of this.predictions.values()) {
      for (const pred of playerPreds) {
        if (pred.actual === undefined) continue;
        
        const proj = pred.projection.projection;
        const lower = lowerPercentile === 0.10 ? proj.floor : proj.q1;
        const upper = upperPercentile === 0.90 ? proj.ceiling : proj.q3;
        
        if (pred.actual >= lower && pred.actual <= upper) {
          inInterval++;
        }
        total++;
      }
    }
    
    const coverage = total > 0 ? inInterval / total : 0;
    const expectedCoverage = upperPercentile - lowerPercentile;
    const calibrated = Math.abs(coverage - expectedCoverage) < 0.05; // Within 5%
    
    return { coverage, expectedCoverage, calibrated };
  }
  
  /**
   * Calculate Brier Score for binary outcomes (e.g., TD scored)
   */
  calculateBrierScore(
    outcomes: { predicted: number; actual: boolean }[]
  ): number {
    if (outcomes.length === 0) return 0;
    
    let sumSquaredDiff = 0;
    for (const outcome of outcomes) {
      const diff = outcome.predicted - (outcome.actual ? 1 : 0);
      sumSquaredDiff += diff * diff;
    }
    
    return sumSquaredDiff / outcomes.length;
  }
  
  /**
   * Get calibration summary
   */
  getCalibrationSummary(): {
    crps: number;
    rmse: number;
    mae: number;
    interval80Coverage: number;
    interval50Coverage: number;
    isWellCalibrated: boolean;
    sampleSize: number;
  } {
    const crps = this.calculateCRPS();
    const rmse = this.calculateRMSE();
    const mae = this.calculateMAE();
    const interval80 = this.calculateIntervalCoverage(0.10, 0.90);
    const interval50 = this.calculateIntervalCoverage(0.25, 0.75);
    
    let sampleSize = 0;
    for (const playerPreds of this.predictions.values()) {
      sampleSize += playerPreds.filter(p => p.actual !== undefined).length;
    }
    
    // Well-calibrated if intervals are close to expected and errors are reasonable
    const isWellCalibrated = 
      interval80.calibrated && 
      interval50.calibrated &&
      mae < 5; // Less than 5 points average error
    
    return {
      crps,
      rmse,
      mae,
      interval80Coverage: interval80.coverage,
      interval50Coverage: interval50.coverage,
      isWellCalibrated,
      sampleSize
    };
  }
  
  /**
   * Get per-position calibration
   */
  getPositionCalibration(): Map<string, {
    rmse: number;
    mae: number;
    sampleSize: number;
  }> {
    const positionStats = new Map<string, {
      errors: number[];
      absErrors: number[];
    }>();
    
    for (const playerPreds of this.predictions.values()) {
      for (const pred of playerPreds) {
        if (pred.actual === undefined) continue;
        
        const position = pred.projection.player.position;
        if (!positionStats.has(position)) {
          positionStats.set(position, { errors: [], absErrors: [] });
        }
        
        const stats = positionStats.get(position)!;
        const error = pred.projection.projection.mean - pred.actual;
        stats.errors.push(error);
        stats.absErrors.push(Math.abs(error));
      }
    }
    
    const results = new Map<string, { rmse: number; mae: number; sampleSize: number }>();
    
    for (const [position, stats] of positionStats) {
      const rmse = Math.sqrt(
        stats.errors.reduce((sum, e) => sum + e * e, 0) / stats.errors.length
      );
      const mae = stats.absErrors.reduce((sum, e) => sum + e, 0) / stats.absErrors.length;
      
      results.set(position, {
        rmse,
        mae,
        sampleSize: stats.errors.length
      });
    }
    
    return results;
  }
}