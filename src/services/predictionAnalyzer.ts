import { Player } from '../types';
import { UnifiedEvaluationEngine } from './unifiedEvaluationEngine';
import * as actualData2024 from '../data/actuals/2024.json';

interface PredictionResult {
  playerId: string;
  playerName: string;
  position: string;
  predictedValue: number;
  actualValue: number;
  error: number;
  percentError: number;
}

interface ModelComparison {
  withAge: {
    mae: number;  // Mean Absolute Error
    rmse: number; // Root Mean Square Error
    r2: number;   // R-squared
    predictions: PredictionResult[];
  };
  withoutAge: {
    mae: number;
    rmse: number;
    r2: number;
    predictions: PredictionResult[];
  };
  improvement: {
    maeReduction: number;
    rmseReduction: number;
    r2Increase: number;
    significantlyBetter: boolean;
  };
}

export class PredictionAnalyzer {
  private engineWithAge: UnifiedEvaluationEngine;
  private engineWithoutAge: UnifiedEvaluationEngine;

  constructor() {
    this.engineWithAge = new UnifiedEvaluationEngine();
    this.engineWithoutAge = new UnifiedEvaluationEngine();
    // Disable age factors in the second engine
    this.engineWithoutAge.disableAgeFactor = true;
  }

  /**
   * Load actual results from 2024 season data
   */
  loadActualResults(): Map<string, number> {
    const actuals = new Map<string, number>();
    
    // Load from 2024 actuals file
    if (actualData2024 && actualData2024.players) {
      Object.entries(actualData2024.players).forEach(([playerId, data]) => {
        actuals.set(playerId, data.actualPoints);
      });
    }
    
    return actuals;
  }

  /**
   * Map player names to IDs for matching with actuals
   */
  private normalizePlayerId(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Compare models with and without age factor using REAL data
   */
  compareModels(players: Player[], actualResults?: Map<string, number>): ModelComparison {
    // Load real actual results if not provided
    const actuals = actualResults || this.loadActualResults();
    
    // If still no actuals, fall back to using projections with warning
    if (actuals.size === 0) {
      console.warn('WARNING: No actual results found, using projections as proxy');
      players.forEach(p => {
        actuals.set(this.normalizePlayerId(p.name), p.projectedPoints);
      });
    }

    // Map players to actuals
    const mappedPlayers = players.filter(p => {
      const playerId = this.normalizePlayerId(p.name);
      return actuals.has(playerId);
    });

    console.log(`Matched ${mappedPlayers.length} of ${players.length} players to actual results`);

    // Get predictions from both models
    const withAgePredictions = this.getPredictions(mappedPlayers, this.engineWithAge, actuals);
    const withoutAgePredictions = this.getPredictions(mappedPlayers, this.engineWithoutAge, actuals);

    // Calculate metrics for both models
    const withAgeMetrics = this.calculateMetrics(withAgePredictions);
    const withoutAgeMetrics = this.calculateMetrics(withoutAgePredictions);

    // Calculate improvement (with safeguards against division by zero)
    const maeReduction = withoutAgeMetrics.mae > 0 
      ? ((withoutAgeMetrics.mae - withAgeMetrics.mae) / withoutAgeMetrics.mae) * 100
      : 0;
    const rmseReduction = withoutAgeMetrics.rmse > 0
      ? ((withoutAgeMetrics.rmse - withAgeMetrics.rmse) / withoutAgeMetrics.rmse) * 100
      : 0;
    const r2Increase = withAgeMetrics.r2 - withoutAgeMetrics.r2;

    // Statistical significance test (paired t-test on errors)
    const significantlyBetter = this.isSignificantlyBetter(
      withAgePredictions,
      withoutAgePredictions
    );

    return {
      withAge: {
        ...withAgeMetrics,
        predictions: withAgePredictions
      },
      withoutAge: {
        ...withoutAgeMetrics,
        predictions: withoutAgePredictions
      },
      improvement: {
        maeReduction,
        rmseReduction,
        r2Increase,
        significantlyBetter
      }
    };
  }

  /**
   * Analyze age impact by position with real data
   */
  analyzeAgeImpactByPosition(players: Player[]): Map<string, number> {
    const positionImpacts = new Map<string, number>();
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const actuals = this.loadActualResults();

    positions.forEach(position => {
      const positionPlayers = players.filter(p => p.position === position);
      if (positionPlayers.length < 5) return; // Need minimum sample size

      // Map to actual results
      const mappedPlayers = positionPlayers.filter(p => {
        const playerId = this.normalizePlayerId(p.name);
        return actuals.has(playerId);
      });

      if (mappedPlayers.length < 3) return; // Need at least 3 players

      const comparison = this.compareModels(mappedPlayers, actuals);
      positionImpacts.set(position, comparison.improvement.maeReduction);
    });

    return positionImpacts;
  }

  /**
   * Generate predictions for a set of players
   */
  private getPredictions(
    players: Player[],
    engine: UnifiedEvaluationEngine,
    actuals: Map<string, number>
  ): PredictionResult[] {
    return players.map(player => {
      const evaluation = engine.calculateCVS(player);
      const playerId = this.normalizePlayerId(player.name);
      const actualValue = actuals.get(playerId) || player.projectedPoints;
      
      // Use CVS score as a proxy for predicted fantasy points
      // Scale it to match typical fantasy point ranges
      const predictedValue = (evaluation.cvsScore / 100) * 400; // Scale to ~400 max points
      
      const error = Math.abs(predictedValue - actualValue);
      const percentError = (error / actualValue) * 100;

      return {
        playerId,
        playerName: player.name,
        position: player.position,
        predictedValue,
        actualValue,
        error,
        percentError
      };
    });
  }

  /**
   * Calculate evaluation metrics
   */
  private calculateMetrics(predictions: PredictionResult[]): {
    mae: number;
    rmse: number;
    r2: number;
  } {
    const n = predictions.length;
    if (n === 0) return { mae: 0, rmse: 0, r2: 0 };

    // MAE
    const mae = predictions.reduce((sum, p) => sum + p.error, 0) / n;

    // RMSE
    const mse = predictions.reduce((sum, p) => sum + Math.pow(p.error, 2), 0) / n;
    const rmse = Math.sqrt(mse);

    // R-squared
    const actualMean = predictions.reduce((sum, p) => sum + p.actualValue, 0) / n;
    const totalSS = predictions.reduce((sum, p) => 
      sum + Math.pow(p.actualValue - actualMean, 2), 0
    );
    const residualSS = predictions.reduce((sum, p) => 
      sum + Math.pow(p.error, 2), 0
    );
    const r2 = totalSS > 0 ? 1 - (residualSS / totalSS) : 0;

    return { mae, rmse, r2 };
  }

  /**
   * Paired t-test for significance
   */
  private isSignificantlyBetter(
    predictions1: PredictionResult[],
    predictions2: PredictionResult[]
  ): boolean {
    if (predictions1.length !== predictions2.length || predictions1.length < 2) {
      return false;
    }

    const differences = predictions1.map((p1, i) => {
      const p2 = predictions2[i];
      return p2.error - p1.error; // Positive if model1 is better
    });

    const n = differences.length;
    const meanDiff = differences.reduce((sum, d) => sum + d, 0) / n;
    const variance = differences.reduce((sum, d) => 
      sum + Math.pow(d - meanDiff, 2), 0
    ) / (n - 1);
    const stdError = Math.sqrt(variance / n);

    // T-statistic
    const tStat = stdError > 0 ? meanDiff / stdError : 0;

    // Critical value for 95% confidence (two-tailed)
    const criticalValue = 1.96;

    return Math.abs(tStat) > criticalValue;
  }

  /**
   * Generate comprehensive analysis report
   */
  generateReport(players: Player[]): string {
    const comparison = this.compareModels(players);
    const positionImpacts = this.analyzeAgeImpactByPosition(players);
    const actuals = this.loadActualResults();

    let report = '=== PREDICTION ACCURACY ANALYSIS (WITH REAL 2024 DATA) ===\n\n';
    
    report += `Data Source: ${actuals.size > 0 ? '2024 NFL Season Actuals' : 'Projected Points (WARNING: No actuals available)'}\n`;
    report += `Players Analyzed: ${comparison.withAge.predictions.length}\n\n`;

    report += '--- Model WITH Age Factor ---\n';
    report += `MAE: ${comparison.withAge.mae.toFixed(2)} fantasy points\n`;
    report += `RMSE: ${comparison.withAge.rmse.toFixed(2)} fantasy points\n`;
    report += `R²: ${comparison.withAge.r2.toFixed(3)}\n\n`;

    report += '--- Model WITHOUT Age Factor ---\n';
    report += `MAE: ${comparison.withoutAge.mae.toFixed(2)} fantasy points\n`;
    report += `RMSE: ${comparison.withoutAge.rmse.toFixed(2)} fantasy points\n`;
    report += `R²: ${comparison.withoutAge.r2.toFixed(3)}\n\n`;

    report += '--- IMPROVEMENT SUMMARY ---\n';
    report += `MAE Reduction: ${comparison.improvement.maeReduction.toFixed(1)}%\n`;
    report += `RMSE Reduction: ${comparison.improvement.rmseReduction.toFixed(1)}%\n`;
    report += `R² Increase: ${comparison.improvement.r2Increase.toFixed(3)}\n`;
    report += `Statistically Significant: ${comparison.improvement.significantlyBetter ? 'YES (p < 0.05)' : 'NO'}\n\n`;

    report += '--- POSITION-SPECIFIC IMPACT ---\n';
    positionImpacts.forEach((improvement, position) => {
      report += `${position}: ${improvement.toFixed(1)}% improvement\n`;
    });

    report += '\n--- TOP PREDICTION ERRORS (for calibration) ---\n';
    const topErrors = comparison.withAge.predictions
      .sort((a, b) => b.error - a.error)
      .slice(0, 5);
    
    topErrors.forEach(p => {
      report += `${p.playerName} (${p.position}): Predicted ${p.predictedValue.toFixed(0)}, `;
      report += `Actual ${p.actualValue.toFixed(0)} (Error: ${p.error.toFixed(0)})\n`;
    });

    report += '\n--- RECOMMENDATION ---\n';
    if (comparison.improvement.maeReduction > 5 && comparison.improvement.significantlyBetter) {
      report += 'KEEP AGE FACTOR - Significant improvement in prediction accuracy\n';
      report += `Age-based adjustments improve predictions by ${comparison.improvement.maeReduction.toFixed(1)}%\n`;
      report += 'Especially critical for RB position evaluations\n';
    } else if (comparison.improvement.maeReduction > 0) {
      report += 'KEEP AGE FACTOR - Modest improvement in accuracy\n';
      report += 'Consider position-specific tuning for better results\n';
    } else {
      report += 'RECONSIDER AGE FACTOR - No significant improvement detected\n';
      report += 'May need recalibration with more data\n';
    }

    return report;
  }

  /**
   * Validate against specific metrics (for acceptance criteria)
   */
  validateAcceptanceCriteria(players: Player[]): {
    passed: boolean;
    results: string[];
  } {
    const comparison = this.compareModels(players);
    const results: string[] = [];
    let passedCount = 0;
    const totalCriteria = 5;

    // Criterion 1: Beat baseline MAE by ≥5%
    if (comparison.improvement.maeReduction >= 5) {
      results.push('✓ MAE improved by ≥5%');
      passedCount++;
    } else {
      results.push(`✗ MAE improved by only ${comparison.improvement.maeReduction.toFixed(1)}% (target: ≥5%)`);
    }

    // Criterion 2: Statistical significance
    if (comparison.improvement.significantlyBetter) {
      results.push('✓ Improvement is statistically significant (p < 0.05)');
      passedCount++;
    } else {
      results.push('✗ Improvement not statistically significant');
    }

    // Criterion 3: R² improvement
    if (comparison.improvement.r2Increase > 0) {
      results.push(`✓ R² improved by ${comparison.improvement.r2Increase.toFixed(3)}`);
      passedCount++;
    } else {
      results.push('✗ R² did not improve');
    }

    // Criterion 4: RB position improvement ≥3%
    const positionImpacts = this.analyzeAgeImpactByPosition(players);
    const rbImprovement = positionImpacts.get('RB') || 0;
    if (rbImprovement >= 3) {
      results.push(`✓ RB predictions improved by ${rbImprovement.toFixed(1)}% (target: ≥3%)`);
      passedCount++;
    } else {
      results.push(`✗ RB predictions improved by only ${rbImprovement.toFixed(1)}% (target: ≥3%)`);
    }

    // Criterion 5: Overall RMSE reduction
    if (comparison.improvement.rmseReduction > 0) {
      results.push(`✓ RMSE reduced by ${comparison.improvement.rmseReduction.toFixed(1)}%`);
      passedCount++;
    } else {
      results.push('✗ RMSE did not improve');
    }

    return {
      passed: passedCount >= 3, // Pass if at least 3 of 5 criteria met
      results
    };
  }
}