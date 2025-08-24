/**
 * Calibration Loop for Weekly Updates
 * 
 * Tracks predictions vs actuals and updates model parameters
 * to maintain calibration over the season.
 */

import { 
  generateCalibrationReport, 
  CalibrationReport,
  crpsFromSamples,
  reliabilityBins,
  expectedCalibrationError
} from '../eval/calibration';
import { PlayerProjection, BacktestResult } from '../types';

/**
 * Weekly calibration data
 */
interface WeeklyData {
  week: number;
  predictions: Array<{
    playerId: string;
    playerName: string;
    position: string;
    projectedMean: number;
    projectedVariance: number;
    samples?: number[];
    floor: number;
    ceiling: number;
  }>;
  actuals: Array<{
    playerId: string;
    actualPoints: number;
  }>;
  lineupWinProb?: number;
  opponentActual?: number;
  lineupActual?: number;
}

/**
 * Calibration state
 */
interface CalibrationState {
  weeklyData: WeeklyData[];
  positionAdjustments: Map<string, {
    meanBias: number;      // Multiplicative adjustment
    varianceScale: number; // Variance scaling factor
    lastUpdated: number;   // Week number
  }>;
  globalMetrics: {
    overallCRPS: number;
    overallECE: number;
    positionCRPS: Map<string, number>;
    positionECE: Map<string, number>;
  };
  updateHistory: Array<{
    week: number;
    adjustments: Map<string, { meanBias: number; varianceScale: number }>;
    metrics: CalibrationReport;
  }>;
}

/**
 * Calibration Loop Manager
 */
export class CalibrationLoop {
  private state: CalibrationState;
  private readonly minWeeksForUpdate = 3; // Need 3 weeks of data minimum
  private readonly maxAdjustmentPerWeek = 0.1; // Max 10% adjustment per week
  
  constructor() {
    this.state = {
      weeklyData: [],
      positionAdjustments: new Map([
        ['QB', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['RB', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['WR', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['TE', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['K', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['DST', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }]
      ]),
      globalMetrics: {
        overallCRPS: 0,
        overallECE: 0,
        positionCRPS: new Map(),
        positionECE: new Map()
      },
      updateHistory: []
    };
  }
  
  /**
   * Add weekly results for calibration
   */
  addWeeklyResults(data: WeeklyData): void {
    this.state.weeklyData.push(data);
    
    // Update calibration if we have enough data
    if (this.state.weeklyData.length >= this.minWeeksForUpdate) {
      this.updateCalibration(data.week);
    }
  }
  
  /**
   * Update calibration based on accumulated data
   */
  private updateCalibration(currentWeek: number): void {
    // Calculate position-specific calibration metrics
    const positionData = this.groupByPosition();
    const newAdjustments = new Map<string, { meanBias: number; varianceScale: number }>();
    
    for (const [position, data] of positionData.entries()) {
      if (data.predictions.length < 10) {
        continue; // Not enough data for this position
      }
      
      // Calculate bias and variance adjustments
      const { meanBias, varianceScale } = this.calculateAdjustments(data);
      
      // Apply smoothing with existing adjustments
      const current = this.state.positionAdjustments.get(position)!;
      const smoothedMeanBias = this.smooth(current.meanBias, meanBias);
      const smoothedVarianceScale = this.smooth(current.varianceScale, varianceScale);
      
      // Update state
      this.state.positionAdjustments.set(position, {
        meanBias: smoothedMeanBias,
        varianceScale: smoothedVarianceScale,
        lastUpdated: currentWeek
      });
      
      newAdjustments.set(position, {
        meanBias: smoothedMeanBias,
        varianceScale: smoothedVarianceScale
      });
    }
    
    // Generate calibration report
    const report = this.generateReport();
    
    // Store update history
    this.state.updateHistory.push({
      week: currentWeek,
      adjustments: newAdjustments,
      metrics: report
    });
    
    // Update global metrics
    this.updateGlobalMetrics(report);
    
    console.log(`Calibration updated for week ${currentWeek}`);
    console.log(`Overall CRPS: ${report.crps?.toFixed(2)}`);
    console.log(`Overall ECE: ${(report.ece! * 100).toFixed(2)}%`);
  }
  
  /**
   * Group data by position
   */
  private groupByPosition(): Map<string, {
    predictions: Array<{ mean: number; variance: number; samples?: number[] }>;
    actuals: number[];
  }> {
    const grouped = new Map<string, {
      predictions: Array<{ mean: number; variance: number; samples?: number[] }>;
      actuals: number[];
    }>();
    
    for (const week of this.state.weeklyData) {
      for (const pred of week.predictions) {
        if (!grouped.has(pred.position)) {
          grouped.set(pred.position, { predictions: [], actuals: [] });
        }
        
        const actual = week.actuals.find(a => a.playerId === pred.playerId);
        if (actual) {
          const group = grouped.get(pred.position)!;
          group.predictions.push({
            mean: pred.projectedMean,
            variance: pred.projectedVariance,
            samples: pred.samples
          });
          group.actuals.push(actual.actualPoints);
        }
      }
    }
    
    return grouped;
  }
  
  /**
   * Calculate calibration adjustments
   */
  private calculateAdjustments(data: {
    predictions: Array<{ mean: number; variance: number }>;
    actuals: number[];
  }): { meanBias: number; varianceScale: number } {
    const n = data.predictions.length;
    
    // Calculate mean bias
    const predMeans = data.predictions.map(p => p.mean);
    const avgPredicted = predMeans.reduce((a, b) => a + b, 0) / n;
    const avgActual = data.actuals.reduce((a, b) => a + b, 0) / n;
    
    let meanBias = avgActual / avgPredicted;
    meanBias = Math.max(0.8, Math.min(1.2, meanBias)); // Limit adjustment
    
    // Calculate variance adjustment
    const errors = data.predictions.map((p, i) => 
      (data.actuals[i] - p.mean) ** 2
    );
    const avgError = errors.reduce((a, b) => a + b, 0) / n;
    
    const avgPredVar = data.predictions.reduce((sum, p) => 
      sum + p.variance, 0) / n;
    
    let varianceScale = avgError / avgPredVar;
    varianceScale = Math.max(0.5, Math.min(2.0, varianceScale)); // Limit adjustment
    
    return { meanBias, varianceScale };
  }
  
  /**
   * Smooth adjustments to prevent overfitting
   */
  private smooth(
    current: number,
    proposed: number,
    alpha: number = 0.3
  ): number {
    // Exponential smoothing
    const smoothed = alpha * proposed + (1 - alpha) * current;
    
    // Limit per-week change
    const maxChange = this.maxAdjustmentPerWeek;
    const change = smoothed - current;
    
    if (Math.abs(change) > maxChange) {
      return current + Math.sign(change) * maxChange;
    }
    
    return smoothed;
  }
  
  /**
   * Apply calibration to projections
   */
  applyCalibration(
    projections: PlayerProjection[],
    week: number
  ): PlayerProjection[] {
    return projections.map(p => {
      const position = p.player.position;
      const adjustment = this.state.positionAdjustments.get(position);
      
      if (!adjustment || !p.projection) {
        return p;
      }
      
      // Apply adjustments
      const calibratedProjection = {
        ...p.projection,
        mean: p.projection.mean * adjustment.meanBias,
        variance: p.projection.variance * adjustment.varianceScale,
        floor: p.projection.floor * adjustment.meanBias,
        median: p.projection.median * adjustment.meanBias,
        ceiling: p.projection.ceiling * adjustment.meanBias
      };
      
      return {
        ...p,
        projection: calibratedProjection
      };
    });
  }
  
  /**
   * Generate calibration report
   */
  private generateReport(): CalibrationReport {
    const allPredictions: Array<{
      samples?: number[];
      probability?: number;
      intervals?: { p10: number; p90: number; p25: number; p75: number };
    }> = [];
    
    const allActuals: Array<{
      value?: number;
      outcome?: boolean;
    }> = [];
    
    // Collect all predictions and actuals
    for (const week of this.state.weeklyData) {
      for (const pred of week.predictions) {
        const actual = week.actuals.find(a => a.playerId === pred.playerId);
        
        if (actual) {
          allPredictions.push({
            samples: pred.samples,
            intervals: {
              p10: pred.floor,
              p25: pred.projectedMean - 0.674 * Math.sqrt(pred.projectedVariance),
              p75: pred.projectedMean + 0.674 * Math.sqrt(pred.projectedVariance),
              p90: pred.ceiling
            }
          });
          
          allActuals.push({
            value: actual.actualPoints
          });
        }
      }
    }
    
    return generateCalibrationReport(
      allPredictions,
      allActuals,
      {
        computeCRPS: true,
        computeIntervals: true
      }
    );
  }
  
  /**
   * Update global metrics
   */
  private updateGlobalMetrics(report: CalibrationReport): void {
    if (report.crps !== undefined) {
      this.state.globalMetrics.overallCRPS = report.crps;
    }
    
    if (report.ece !== undefined) {
      this.state.globalMetrics.overallECE = report.ece;
    }
    
    // Update position-specific metrics
    const positionData = this.groupByPosition();
    
    for (const [position, data] of positionData.entries()) {
      if (data.predictions.length > 0) {
        // Calculate position CRPS if samples available
        if (data.predictions[0].samples) {
          const crpsValues = data.predictions.map((p, i) => 
            p.samples ? crpsFromSamples(p.samples, data.actuals[i]) : 0
          ).filter(c => c > 0);
          
          if (crpsValues.length > 0) {
            const avgCRPS = crpsValues.reduce((a, b) => a + b, 0) / crpsValues.length;
            this.state.globalMetrics.positionCRPS.set(position, avgCRPS);
          }
        }
      }
    }
  }
  
  /**
   * Get current calibration state
   */
  getCalibrationState(): {
    adjustments: Map<string, { meanBias: number; varianceScale: number }>;
    metrics: {
      overallCRPS: number;
      overallECE: number;
      weeksOfData: number;
    };
    needsUpdate: boolean;
  } {
    const latestWeek = this.state.weeklyData.length > 0 ?
      this.state.weeklyData[this.state.weeklyData.length - 1].week : 0;
    
    // Check if any position needs update
    let needsUpdate = false;
    for (const [_, adj] of this.state.positionAdjustments) {
      if (latestWeek - adj.lastUpdated > 2) {
        needsUpdate = true;
        break;
      }
    }
    
    return {
      adjustments: new Map(this.state.positionAdjustments.entries().map(([k, v]) => 
        [k, { meanBias: v.meanBias, varianceScale: v.varianceScale }]
      )),
      metrics: {
        overallCRPS: this.state.globalMetrics.overallCRPS,
        overallECE: this.state.globalMetrics.overallECE,
        weeksOfData: this.state.weeklyData.length
      },
      needsUpdate
    };
  }
  
  /**
   * Export calibration history for analysis
   */
  exportHistory(): {
    weekly: WeeklyData[];
    updates: Array<{
      week: number;
      adjustments: Record<string, { meanBias: number; varianceScale: number }>;
      crps?: number;
      ece?: number;
    }>;
  } {
    return {
      weekly: this.state.weeklyData,
      updates: this.state.updateHistory.map(u => ({
        week: u.week,
        adjustments: Object.fromEntries(u.adjustments),
        crps: u.metrics.crps,
        ece: u.metrics.ece
      }))
    };
  }
  
  /**
   * Reset calibration (for new season)
   */
  reset(): void {
    this.state = {
      weeklyData: [],
      positionAdjustments: new Map([
        ['QB', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['RB', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['WR', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['TE', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['K', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }],
        ['DST', { meanBias: 1.0, varianceScale: 1.0, lastUpdated: 0 }]
      ]),
      globalMetrics: {
        overallCRPS: 0,
        overallECE: 0,
        positionCRPS: new Map(),
        positionECE: new Map()
      },
      updateHistory: []
    };
  }
}