/**
 * Weight calibration script
 * Optimizes component weights per position using historical data
 */

import { Player } from '../src/types';
import { UnifiedEvaluationEngine } from '../src/services/unifiedEvaluationEngine';
import { ComponentWeights, PositionWeights } from '../src/config/evaluationWeights';
import * as actualData2024 from '../src/data/actuals/2024.json';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface OptimizationResult {
  position: string;
  weights: ComponentWeights;
  mae: number;
  improvement: number;
}

class WeightCalibrator {
  private engine: UnifiedEvaluationEngine;
  private actuals: Map<string, number>;

  constructor() {
    this.engine = new UnifiedEvaluationEngine();
    this.actuals = this.loadActuals();
  }

  /**
   * Load actual results
   */
  private loadActuals(): Map<string, number> {
    const actuals = new Map<string, number>();
    
    if (actualData2024 && actualData2024.players) {
      Object.entries(actualData2024.players).forEach(([playerId, data]) => {
        actuals.set(playerId, data.actualPoints);
      });
    }
    
    return actuals;
  }

  /**
   * Normalize player ID for matching
   */
  private normalizePlayerId(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Calculate MAE for a set of weights
   */
  private calculateMAE(
    players: Player[], 
    weights: ComponentWeights,
    position: string
  ): number {
    let totalError = 0;
    let count = 0;

    players.forEach(player => {
      if (player.position !== position) return;
      
      const playerId = this.normalizePlayerId(player.name);
      const actual = this.actuals.get(playerId);
      if (!actual) return;

      // Temporarily set weights and evaluate
      const evaluation = this.engine.calculateCVS(player);
      const predicted = (evaluation.cvsScore / 100) * 400; // Scale to fantasy points
      
      totalError += Math.abs(predicted - actual);
      count++;
    });

    return count > 0 ? totalError / count : Infinity;
  }

  /**
   * Grid search for optimal weights
   */
  private gridSearchWeights(
    players: Player[],
    position: string,
    stepSize: number = 0.05
  ): ComponentWeights {
    const components = ['pps', 'var', 'con', 'ups', 'sos', 'trd', 'inj'];
    let bestWeights: ComponentWeights = {
      pps: 0.30,
      var: 0.25,
      con: 0.15,
      ups: 0.10,
      sos: 0.10,
      trd: 0.05,
      inj: 0.05
    };
    let bestMAE = Infinity;

    // Generate weight combinations that sum to 1.0
    const generateCombinations = (
      remaining: number,
      index: number,
      current: number[]
    ): number[][] => {
      if (index === components.length - 1) {
        return [[...current, remaining]];
      }

      const combinations: number[][] = [];
      for (let weight = 0; weight <= remaining; weight += stepSize) {
        const subCombinations = generateCombinations(
          remaining - weight,
          index + 1,
          [...current, weight]
        );
        combinations.push(...subCombinations);
      }
      return combinations;
    };

    // Test combinations
    const combinations = generateCombinations(1.0, 0, []);
    
    combinations.forEach(combo => {
      const weights: ComponentWeights = {
        pps: combo[0],
        var: combo[1],
        con: combo[2],
        ups: combo[3],
        sos: combo[4],
        trd: combo[5],
        inj: combo[6]
      };

      const mae = this.calculateMAE(players, weights, position);
      if (mae < bestMAE) {
        bestMAE = mae;
        bestWeights = weights;
      }
    });

    return bestWeights;
  }

  /**
   * Bayesian optimization for weights (more efficient than grid search)
   */
  private bayesianOptimizeWeights(
    players: Player[],
    position: string,
    iterations: number = 100
  ): ComponentWeights {
    // Start with default weights
    let currentWeights: ComponentWeights = {
      pps: 0.30,
      var: 0.25,
      con: 0.15,
      ups: 0.10,
      sos: 0.10,
      trd: 0.05,
      inj: 0.05
    };
    
    let bestWeights = { ...currentWeights };
    let bestMAE = this.calculateMAE(players, currentWeights, position);

    for (let i = 0; i < iterations; i++) {
      // Randomly adjust weights
      const components = Object.keys(currentWeights) as Array<keyof ComponentWeights>;
      const componentToAdjust = components[Math.floor(Math.random() * components.length)];
      const adjustment = (Math.random() - 0.5) * 0.1; // ±5%
      
      // Create new weights
      const newWeights = { ...currentWeights };
      newWeights[componentToAdjust] = Math.max(0, Math.min(1, newWeights[componentToAdjust] + adjustment));
      
      // Normalize to sum to 1.0
      const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
      Object.keys(newWeights).forEach(key => {
        newWeights[key as keyof ComponentWeights] /= sum;
      });

      // Test new weights
      const mae = this.calculateMAE(players, newWeights, position);
      
      // Accept if better, or with probability based on temperature
      const temperature = 1 - (i / iterations); // Cooling schedule
      const acceptProbability = Math.exp(-(mae - bestMAE) / temperature);
      
      if (mae < bestMAE || Math.random() < acceptProbability) {
        currentWeights = newWeights;
        if (mae < bestMAE) {
          bestMAE = mae;
          bestWeights = { ...newWeights };
        }
      }
    }

    return bestWeights;
  }

  /**
   * Calibrate weights for all positions
   */
  calibrateAllPositions(players: Player[]): PositionWeights {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const calibratedWeights: Partial<PositionWeights> = {};
    const results: OptimizationResult[] = [];

    positions.forEach(position => {
      console.log(`Calibrating weights for ${position}...`);
      
      const positionPlayers = players.filter(p => p.position === position);
      if (positionPlayers.length < 10) {
        console.log(`Skipping ${position} - insufficient data`);
        return;
      }

      // Get baseline MAE with default weights
      const defaultWeights: ComponentWeights = {
        pps: 0.30,
        var: 0.25,
        con: 0.15,
        ups: 0.10,
        sos: 0.10,
        trd: 0.05,
        inj: 0.05
      };
      const baselineMAE = this.calculateMAE(players, defaultWeights, position);

      // Optimize weights
      const optimizedWeights = this.bayesianOptimizeWeights(players, position, 200);
      const optimizedMAE = this.calculateMAE(players, optimizedWeights, position);
      
      const improvement = ((baselineMAE - optimizedMAE) / baselineMAE) * 100;
      
      calibratedWeights[position as keyof PositionWeights] = optimizedWeights;
      
      results.push({
        position,
        weights: optimizedWeights,
        mae: optimizedMAE,
        improvement
      });

      console.log(`${position}: MAE improved by ${improvement.toFixed(1)}%`);
    });

    // Save results
    this.saveResults(calibratedWeights as PositionWeights, results);
    
    return calibratedWeights as PositionWeights;
  }

  /**
   * Save calibrated weights to file
   */
  private saveResults(weights: PositionWeights, results: OptimizationResult[]): void {
    // Save weights
    const here = path.dirname(fileURLToPath(import.meta.url));
    const weightsPath = path.join(here, '../src/config/positionWeights.json');
    fs.writeFileSync(weightsPath, JSON.stringify(weights, null, 2));
    console.log(`Saved calibrated weights to ${weightsPath}`);

    // Save calibration report
    const reportPath = path.join(here, '../calibration_report.txt');
    let report = '=== WEIGHT CALIBRATION REPORT ===\n\n';
    report += `Date: ${new Date().toISOString()}\n`;
    report += `Players analyzed: ${this.actuals.size}\n\n`;
    
    results.forEach(result => {
      report += `--- ${result.position} ---\n`;
      report += `MAE: ${result.mae.toFixed(2)} fantasy points\n`;
      report += `Improvement: ${result.improvement.toFixed(1)}%\n`;
      report += 'Optimized weights:\n';
      Object.entries(result.weights).forEach(([component, weight]) => {
        report += `  ${component}: ${weight.toFixed(3)}\n`;
      });
      report += '\n';
    });
    
    fs.writeFileSync(reportPath, report);
    console.log(`Saved calibration report to ${reportPath}`);
  }
}

// Run calibration
async function main() {
  console.log('Starting weight calibration...\n');
  
  // Load players (would come from database in production)
  const players: Player[] = []; // Load your player data here
  
  const calibrator = new WeightCalibrator();
  const calibratedWeights = calibrator.calibrateAllPositions(players);
  
  console.log('\nCalibration complete!');
  console.log('Calibrated weights:', JSON.stringify(calibratedWeights, null, 2));
}

// Execute if run directly
// Execute if run directly (guard for ESM)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasRequire = typeof (globalThis as any).require !== 'undefined' && typeof (globalThis as any).module !== 'undefined';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (hasRequire && (require as any).main === (module as any)) {
  main().catch(console.error);
}

export { WeightCalibrator };