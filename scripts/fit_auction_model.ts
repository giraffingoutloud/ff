/**
 * Auction Price Model
 * Learns optimal bidding from historical auction data
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import historicalData from '../src/data/auctions/historical.json';
import { Player } from '../src/types';

interface AuctionDataPoint {
  playerId: string;
  name: string;
  position: string;
  auctionPrice: number;
  adp: number;
  projectedPoints?: number;
  age?: number;
  experience?: number;
}

interface AuctionModel {
  coefficients: {
    adp: number;
    projectedPoints: number;
    position: Record<string, number>;
    age: number;
    experience: number;
    intercept: number;
  };
  scarcityFactors: Record<string, number>;
  inflationCurve: {
    draftProgress: number[];
    multipliers: number[];
  };
  marketInefficiencies: {
    patterns: string[];
    adjustments: number[];
  };
  metrics: {
    r2: number;
    mae: number;
    rmse: number;
  };
}

class AuctionPriceModel {
  private historicalPrices: AuctionDataPoint[] = [];
  private model: AuctionModel;

  constructor() {
    this.loadHistoricalData();
    this.model = this.getDefaultModel();
  }

  /**
   * Load historical auction data
   */
  private loadHistoricalData(): void {
    Object.values(historicalData.auctions).forEach(season => {
      this.historicalPrices.push(...season);
    });
    console.log(`Loaded ${this.historicalPrices.length} historical auction prices`);
  }

  /**
   * Get default model parameters
   */
  private getDefaultModel(): AuctionModel {
    return {
      coefficients: {
        adp: -0.8,
        projectedPoints: 0.15,
        position: {
          QB: 0.7,
          RB: 1.0,
          WR: 0.9,
          TE: 0.8,
          K: 0.3,
          DST: 0.3
        },
        age: -0.5,
        experience: 0.2,
        intercept: 50
      },
      scarcityFactors: historicalData.marketTrends.scarcityPremiums,
      inflationCurve: {
        draftProgress: [0, 0.25, 0.5, 0.75, 1.0],
        multipliers: [1.15, 1.05, 1.0, 0.9, 0.8]
      },
      marketInefficiencies: {
        patterns: [
          'rookie_rb',
          'veteran_discount',
          'injury_recovery',
          'new_team',
          'coaching_change'
        ],
        adjustments: [1.1, 0.85, 0.75, 0.9, 0.95]
      },
      metrics: {
        r2: 0,
        mae: 0,
        rmse: 0
      }
    };
  }

  /**
   * Fit model using linear regression
   */
  fitModel(players?: Player[]): AuctionModel {
    console.log('Fitting auction price model...');
    
    // Prepare training data
    const X: number[][] = [];
    const y: number[] = [];
    
    this.historicalPrices.forEach(dataPoint => {
      const features = this.extractFeatures(dataPoint);
      X.push(features);
      y.push(dataPoint.auctionPrice);
    });

    // Simple linear regression (in production, use a proper ML library)
    const coefficients = this.fitLinearRegression(X, y);
    
    // Update model coefficients
    this.model.coefficients = {
      adp: coefficients[0],
      projectedPoints: coefficients[1],
      position: {
        QB: coefficients[2],
        RB: coefficients[3],
        WR: coefficients[4],
        TE: coefficients[5],
        K: coefficients[6],
        DST: coefficients[7]
      },
      age: coefficients[8],
      experience: coefficients[9],
      intercept: coefficients[10]
    };

    // Calculate model metrics
    this.model.metrics = this.calculateMetrics(X, y);
    
    // Learn scarcity patterns
    this.learnScarcityPatterns();
    
    // Learn inflation curve
    this.learnInflationCurve();
    
    // Save model
    this.saveModel();
    
    return this.model;
  }

  /**
   * Extract features from data point
   */
  private extractFeatures(dataPoint: AuctionDataPoint): number[] {
    const features = [
      dataPoint.adp,
      dataPoint.projectedPoints || 200, // Default if missing
      dataPoint.position === 'QB' ? 1 : 0,
      dataPoint.position === 'RB' ? 1 : 0,
      dataPoint.position === 'WR' ? 1 : 0,
      dataPoint.position === 'TE' ? 1 : 0,
      dataPoint.position === 'K' ? 1 : 0,
      dataPoint.position === 'DST' ? 1 : 0,
      dataPoint.age || 26, // Default age
      dataPoint.experience || 4, // Default experience
      1 // Intercept term
    ];
    return features;
  }

  /**
   * Simple linear regression
   */
  private fitLinearRegression(X: number[][], y: number[]): number[] {
    const n = X.length;
    const k = X[0].length;
    
    // Initialize coefficients
    const coefficients = new Array(k).fill(0);
    
    // Gradient descent
    const learningRate = 0.001;
    const iterations = 1000;
    
    for (let iter = 0; iter < iterations; iter++) {
      const predictions = X.map(features => 
        features.reduce((sum, f, i) => sum + f * coefficients[i], 0)
      );
      
      const errors = predictions.map((pred, i) => pred - y[i]);
      
      // Update coefficients
      for (let j = 0; j < k; j++) {
        const gradient = errors.reduce((sum, error, i) => sum + error * X[i][j], 0) / n;
        coefficients[j] -= learningRate * gradient;
      }
    }
    
    return coefficients;
  }

  /**
   * Calculate model metrics
   */
  private calculateMetrics(X: number[][], y: number[]): { r2: number; mae: number; rmse: number } {
    const predictions = X.map(features => this.predictFromFeatures(features));
    const n = y.length;
    
    // MAE
    const mae = predictions.reduce((sum, pred, i) => sum + Math.abs(pred - y[i]), 0) / n;
    
    // RMSE
    const mse = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - y[i], 2), 0) / n;
    const rmse = Math.sqrt(mse);
    
    // R²
    const yMean = y.reduce((sum, val) => sum + val, 0) / n;
    const totalSS = y.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
    const residualSS = predictions.reduce((sum, pred, i) => sum + Math.pow(y[i] - pred, 2), 0);
    const r2 = 1 - (residualSS / totalSS);
    
    return { r2, mae, rmse };
  }

  /**
   * Predict price from features
   */
  private predictFromFeatures(features: number[]): number {
    const c = this.model.coefficients;
    let price = c.intercept;
    
    price += features[0] * c.adp;
    price += features[1] * c.projectedPoints;
    price += features[2] * c.position.QB;
    price += features[3] * c.position.RB;
    price += features[4] * c.position.WR;
    price += features[5] * c.position.TE;
    price += features[6] * c.position.K;
    price += features[7] * c.position.DST;
    price += features[8] * c.age;
    price += features[9] * c.experience;
    
    return Math.max(1, Math.round(price));
  }

  /**
   * Learn scarcity patterns from data
   */
  private learnScarcityPatterns(): void {
    // Analyze price premiums for top players by position
    const positions = ['QB', 'RB', 'WR', 'TE'];
    
    positions.forEach(pos => {
      const positionPrices = this.historicalPrices
        .filter(p => p.position === pos)
        .sort((a, b) => b.auctionPrice - a.auctionPrice);
      
      if (positionPrices.length < 5) return;
      
      // Calculate premium for top 3 vs next 7
      const top3Avg = positionPrices.slice(0, 3).reduce((sum, p) => sum + p.auctionPrice, 0) / 3;
      const next7Avg = positionPrices.slice(3, 10).reduce((sum, p) => sum + p.auctionPrice, 0) / 7;
      
      const premium = top3Avg / next7Avg;
      this.model.scarcityFactors[`elite_${pos}`] = premium;
    });
  }

  /**
   * Learn inflation curve from draft progression
   */
  private learnInflationCurve(): void {
    // Analyze how prices change throughout the draft
    const sortedByADP = [...this.historicalPrices].sort((a, b) => a.adp - b.adp);
    const totalPlayers = sortedByADP.length;
    
    const segments = 5;
    const segmentSize = Math.floor(totalPlayers / segments);
    
    const inflationCurve: number[] = [];
    
    for (let i = 0; i < segments; i++) {
      const segment = sortedByADP.slice(i * segmentSize, (i + 1) * segmentSize);
      const avgPrice = segment.reduce((sum, p) => sum + p.auctionPrice, 0) / segment.length;
      const expectedPrice = segment.reduce((sum, p) => sum + (100 - p.adp) * 0.5, 0) / segment.length;
      
      inflationCurve.push(avgPrice / expectedPrice);
    }
    
    this.model.inflationCurve.multipliers = inflationCurve;
  }

  /**
   * Predict auction price for a player
   */
  predictPrice(player: Player, marketContext?: any): number {
    // Base prediction from model
    const features = [
      player.adp,
      player.projectedPoints,
      player.position === 'QB' ? 1 : 0,
      player.position === 'RB' ? 1 : 0,
      player.position === 'WR' ? 1 : 0,
      player.position === 'TE' ? 1 : 0,
      player.position === 'K' ? 1 : 0,
      player.position === 'DST' ? 1 : 0,
      player.age,
      player.experience || 4,
      1
    ];
    
    let price = this.predictFromFeatures(features);
    
    // Apply scarcity premium for elite players
    if (player.adp <= 3 && player.position === 'RB') {
      price *= this.model.scarcityFactors.elite_RB || 1.25;
    } else if (player.adp <= 5 && player.position === 'WR') {
      price *= this.model.scarcityFactors.elite_WR || 1.20;
    } else if (player.adp <= 2 && player.position === 'TE') {
      price *= this.model.scarcityFactors.elite_TE || 1.30;
    }
    
    // Apply market context adjustments
    if (marketContext) {
      const draftProgress = marketContext.draftedPlayers / 192; // 12 teams * 16 players
      const inflationIndex = Math.floor(draftProgress * 4);
      const inflationMultiplier = this.model.inflationCurve.multipliers[inflationIndex] || 1.0;
      price *= inflationMultiplier;
      
      // Budget remaining adjustment
      if (marketContext.averageBudgetRemaining < 50) {
        price *= 0.85; // Deflation in late draft
      } else if (marketContext.averageBudgetRemaining > 150) {
        price *= 1.10; // Inflation in early draft
      }
    }
    
    // Apply market inefficiency patterns
    if (player.experience === 1 && player.position === 'RB') {
      price *= 1.1; // Rookie RB premium
    }
    if (player.age >= 30 && player.position !== 'QB') {
      price *= 0.85; // Veteran discount
    }
    
    return Math.max(1, Math.min(200, Math.round(price)));
  }

  /**
   * Save model to file
   */
  private saveModel(): void {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const modelPath = path.join(here, '../src/config/auctionModel.json');
    fs.writeFileSync(modelPath, JSON.stringify(this.model, null, 2));
    console.log(`Saved auction model to ${modelPath}`);
  }

  /**
   * Generate model report
   */
  generateReport(): string {
    let report = '=== AUCTION PRICE MODEL REPORT ===\n\n';
    
    report += '--- Model Performance ---\n';
    report += `R²: ${this.model.metrics.r2.toFixed(3)}\n`;
    report += `MAE: $${this.model.metrics.mae.toFixed(2)}\n`;
    report += `RMSE: $${this.model.metrics.rmse.toFixed(2)}\n\n`;
    
    report += '--- Coefficients ---\n';
    report += `ADP Impact: ${this.model.coefficients.adp.toFixed(3)}\n`;
    report += `Projected Points: ${this.model.coefficients.projectedPoints.toFixed(3)}\n`;
    report += `Age Factor: ${this.model.coefficients.age.toFixed(3)}\n`;
    report += `Experience: ${this.model.coefficients.experience.toFixed(3)}\n\n`;
    
    report += '--- Position Multipliers ---\n';
    Object.entries(this.model.coefficients.position).forEach(([pos, mult]) => {
      report += `${pos}: ${mult.toFixed(2)}\n`;
    });
    
    report += '\n--- Scarcity Premiums ---\n';
    Object.entries(this.model.scarcityFactors).forEach(([key, value]) => {
      report += `${key}: ${(value * 100 - 100).toFixed(1)}% premium\n`;
    });
    
    report += '\n--- Inflation Curve ---\n';
    this.model.inflationCurve.draftProgress.forEach((progress, i) => {
      const pct = (progress * 100).toFixed(0);
      const mult = this.model.inflationCurve.multipliers[i];
      report += `${pct}% drafted: ${(mult * 100).toFixed(0)}% of expected\n`;
    });
    
    return report;
  }
}

// Run if executed directly
async function main() {
  console.log('Training auction price model...\n');
  
  const model = new AuctionPriceModel();
  model.fitModel();
  
  const report = model.generateReport();
  console.log(report);
  
  // Save report
  const reportPath = path.join(__dirname, '../auction_model_report.txt');
  fs.writeFileSync(reportPath, report);
  console.log(`\nSaved report to ${reportPath}`);
}

// Execute if run directly (guard for ESM)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hasRequire = typeof (globalThis as any).require !== 'undefined' && typeof (globalThis as any).module !== 'undefined';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (hasRequire && (require as any).main === (module as any)) {
  main().catch(console.error);
}

export { AuctionPriceModel };