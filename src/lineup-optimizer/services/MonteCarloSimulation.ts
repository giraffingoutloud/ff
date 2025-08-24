import { PlayerProjection, OptimizedLineup, Projection } from '../types';
import { LineupOptimizer } from '../core/LineupOptimizer';
import { CorrelationService } from './CorrelationService';

interface SimulationConfig {
  iterations: number;
  correlationEnabled: boolean;
  injurySimulation: boolean;
  weatherVariance: boolean;
  contestType: 'cash' | 'gpp';
  numberOfLineups: number;
}

interface SimulationResult {
  lineup: OptimizedLineup;
  outcomes: SimulationOutcome[];
  statistics: SimulationStatistics;
  optimalExposures: Map<string, number>;
}

interface SimulationOutcome {
  iteration: number;
  totalPoints: number;
  playerPoints: Map<string, number>;
  percentileFinish: number;
  cashLine: boolean;
  top10: boolean;
  first: boolean;
}

interface SimulationStatistics {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  cashRate: number;
  top10Rate: number;
  winRate: number;
  sharpeRatio: number;
  sortino: number;
  calmar: number;
  var95: number;
  cvar95: number;
}

export class MonteCarloSimulation {
  private lineupOptimizer: LineupOptimizer;
  private correlationService: CorrelationService;

  constructor() {
    this.lineupOptimizer = new LineupOptimizer();
    this.correlationService = new CorrelationService();
  }

  async simulate(
    playerProjections: PlayerProjection[],
    config: SimulationConfig
  ): Promise<SimulationResult[]> {
    const results: SimulationResult[] = [];
    
    const lineups = this.generateLineups(
      playerProjections,
      config.numberOfLineups,
      config.contestType
    );
    
    for (const lineup of lineups) {
      const simulationResult = await this.simulateLineup(
        lineup,
        playerProjections,
        config
      );
      results.push(simulationResult);
    }
    
    this.calculateOptimalExposures(results, config);
    
    return results;
  }

  private generateLineups(
    playerProjections: PlayerProjection[],
    numberOfLineups: number,
    contestType: 'cash' | 'gpp'
  ): OptimizedLineup[] {
    const lineups: OptimizedLineup[] = [];
    const usedPlayers = new Set<string>();
    
    for (let i = 0; i < numberOfLineups; i++) {
      const strategy = contestType === 'cash' ? 'floor' : 
                       i % 3 === 0 ? 'ceiling' : 'balanced';
      
      const diversityPenalty = this.applyDiversityConstraints(
        playerProjections,
        usedPlayers,
        i / numberOfLineups
      );
      
      const lineup = this.lineupOptimizer.optimizeLineup(
        diversityPenalty,
        strategy,
        {
          QB: 1,
          RB: 2,
          WR: 3,
          TE: 1,
          FLEX: 1,
          DST: 1,
          K: 1
        },
        [],
        []
      );
      
      lineups.push(lineup);
      
      for (const slot of lineup.lineup) {
        usedPlayers.add(slot.player.id);
      }
    }
    
    return lineups;
  }

  private applyDiversityConstraints(
    projections: PlayerProjection[],
    usedPlayers: Set<string>,
    diversityFactor: number
  ): PlayerProjection[] {
    return projections.map(proj => {
      if (usedPlayers.has(proj.player.id)) {
        const penalty = 1 - (diversityFactor * 0.1);
        return {
          ...proj,
          projection: {
            ...proj.projection,
            median: proj.projection.median * penalty,
            ceiling: proj.projection.ceiling * penalty
          }
        };
      }
      return proj;
    });
  }

  private async simulateLineup(
    lineup: OptimizedLineup,
    allProjections: PlayerProjection[],
    config: SimulationConfig
  ): Promise<SimulationResult> {
    const outcomes: SimulationOutcome[] = [];
    const playerExposures = new Map<string, number>();
    
    const correlationMatrix = config.correlationEnabled
      ? this.correlationService.buildCorrelationMatrix(
          lineup.lineup.map(s => s.player.projection)
        )
      : null;
    
    for (let i = 0; i < config.iterations; i++) {
      const outcome = this.simulateSingleOutcome(
        lineup,
        correlationMatrix,
        config,
        i
      );
      
      outcomes.push(outcome);
      
      for (const [playerId, points] of outcome.playerPoints) {
        playerExposures.set(
          playerId,
          (playerExposures.get(playerId) || 0) + 1
        );
      }
    }
    
    const statistics = this.calculateStatistics(outcomes);
    
    return {
      lineup,
      outcomes,
      statistics,
      optimalExposures: playerExposures
    };
  }

  private simulateSingleOutcome(
    lineup: OptimizedLineup,
    correlationMatrix: number[][] | null,
    config: SimulationConfig,
    iteration: number
  ): SimulationOutcome {
    const playerPoints = new Map<string, number>();
    let totalPoints = 0;
    
    const randomNumbers = correlationMatrix
      ? this.generateCorrelatedRandomNumbers(correlationMatrix)
      : lineup.lineup.map(() => this.generateRandomNumber());
    
    lineup.lineup.forEach((slot, index) => {
      const projection = slot.player.projection;
      const randomValue = randomNumbers[index];
      
      let points = this.sampleFromDistribution(
        projection,
        randomValue,
        config.contestType
      );
      
      if (config.injurySimulation) {
        points = this.simulateInjuryRisk(points, slot.player);
      }
      
      if (config.weatherVariance && slot.player.weather) {
        points = this.simulateWeatherVariance(points, slot.player);
      }
      
      playerPoints.set(slot.player.id, points);
      totalPoints += points;
    });
    
    const percentileFinish = this.calculatePercentileFinish(
      totalPoints,
      config.contestType
    );
    
    return {
      iteration,
      totalPoints,
      playerPoints,
      percentileFinish,
      cashLine: percentileFinish >= 0.5,
      top10: percentileFinish >= 0.9,
      first: percentileFinish >= 0.99
    };
  }

  private generateCorrelatedRandomNumbers(correlationMatrix: number[][]): number[] {
    const n = correlationMatrix.length;
    const independent = Array(n).fill(0).map(() => this.generateRandomNumber());
    
    const cholesky = this.choleskyDecomposition(correlationMatrix);
    const correlated: number[] = Array(n).fill(0);
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        correlated[i] += cholesky[i][j] * independent[j];
      }
    }
    
    return correlated.map(v => this.normalCDF(v));
  }

  private choleskyDecomposition(matrix: number[][]): number[][] {
    const n = matrix.length;
    const L: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        
        for (let k = 0; k < j; k++) {
          sum += L[i][k] * L[j][k];
        }
        
        if (i === j) {
          L[i][j] = Math.sqrt(Math.max(0, matrix[i][i] - sum));
        } else {
          L[i][j] = L[j][j] !== 0 ? (matrix[i][j] - sum) / L[j][j] : 0;
        }
      }
    }
    
    return L;
  }

  private generateRandomNumber(): number {
    return Math.random();
  }

  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    
    const t = 1 / (1 + p * x);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;
    
    const y = 1 - ((a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) * Math.exp(-x * x));
    
    return 0.5 * (1 + sign * y);
  }

  private sampleFromDistribution(
    projection: Projection,
    randomValue: number,
    contestType: 'cash' | 'gpp'
  ): number {
    if (contestType === 'cash') {
      if (randomValue < 0.1) return projection.floor;
      if (randomValue < 0.25) return projection.q1;
      if (randomValue < 0.5) return projection.median;
      if (randomValue < 0.75) return projection.q3;
      if (randomValue < 0.9) return projection.ceiling;
      
      return projection.ceiling * (1 + (randomValue - 0.9) * 0.5);
    } else {
      if (randomValue < 0.05) return projection.floor * 0.5;
      if (randomValue < 0.15) return projection.floor;
      if (randomValue < 0.35) return projection.q1;
      if (randomValue < 0.5) return projection.median;
      if (randomValue < 0.65) return projection.q3;
      if (randomValue < 0.85) return projection.ceiling;
      if (randomValue < 0.95) return projection.ceiling * 1.5;
      
      return projection.ceiling * (2 + (randomValue - 0.95) * 10);
    }
  }

  private simulateInjuryRisk(points: number, player: PlayerProjection): number {
    const injuryProbability = this.calculateInjuryProbability(player);
    
    if (Math.random() < injuryProbability) {
      const severityRoll = Math.random();
      if (severityRoll < 0.3) {
        return 0;
      } else if (severityRoll < 0.6) {
        return points * 0.25;
      } else {
        return points * 0.5;
      }
    }
    
    return points;
  }

  private calculateInjuryProbability(player: PlayerProjection): number {
    let baseProbability = 0.05;
    
    if (player.player.status === 'questionable') {
      baseProbability = 0.25;
    } else if (player.player.status === 'doubtful') {
      baseProbability = 0.75;
    }
    
    if (player.player.practiceParticipation === 'DNP') {
      baseProbability *= 1.5;
    } else if (player.player.practiceParticipation === 'LP') {
      baseProbability *= 1.2;
    }
    
    return Math.min(baseProbability, 0.9);
  }

  private simulateWeatherVariance(points: number, player: PlayerProjection): number {
    if (!player.weather || player.weather.isDome) {
      return points;
    }
    
    const windVariance = player.weather.windSpeed > 20 ? 0.15 : 0.05;
    const precipVariance = player.weather.precipitation > 0.5 ? 0.1 : 0;
    const tempVariance = player.weather.temperature < 32 ? 0.05 : 0;
    
    const totalVariance = windVariance + precipVariance + tempVariance;
    const multiplier = 1 - (totalVariance * (Math.random() - 0.5));
    
    return points * multiplier;
  }

  private calculatePercentileFinish(points: number, contestType: 'cash' | 'gpp'): number {
    const distributions = contestType === 'cash'
      ? { mean: 120, std: 15 }
      : { mean: 115, std: 25 };
    
    const z = (points - distributions.mean) / distributions.std;
    return this.normalCDF(z);
  }

  private calculateStatistics(outcomes: SimulationOutcome[]): SimulationStatistics {
    const points = outcomes.map(o => o.totalPoints).sort((a, b) => a - b);
    const n = points.length;
    
    const mean = points.reduce((a, b) => a + b, 0) / n;
    const median = points[Math.floor(n / 2)];
    
    const variance = points.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / n;
    const std = Math.sqrt(variance);
    
    const percentiles = {
      p5: points[Math.floor(n * 0.05)],
      p25: points[Math.floor(n * 0.25)],
      p50: median,
      p75: points[Math.floor(n * 0.75)],
      p95: points[Math.floor(n * 0.95)]
    };
    
    const cashRate = outcomes.filter(o => o.cashLine).length / n;
    const top10Rate = outcomes.filter(o => o.top10).length / n;
    const winRate = outcomes.filter(o => o.first).length / n;
    
    const returns = points.map(p => (p - mean) / mean);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / n;
    const returnStd = Math.sqrt(
      returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / n
    );
    const sharpeRatio = returnStd > 0 ? avgReturn / returnStd : 0;
    
    const negativeReturns = returns.filter(r => r < 0);
    const downside = negativeReturns.length > 0
      ? Math.sqrt(negativeReturns.reduce((a, r) => a + r * r, 0) / negativeReturns.length)
      : 0.01;
    const sortino = downside > 0 ? avgReturn / downside : 0;
    
    const maxDrawdown = this.calculateMaxDrawdown(points);
    const calmar = maxDrawdown > 0 ? avgReturn / maxDrawdown : 0;
    
    const var95 = percentiles.p5;
    const cvar95 = points.slice(0, Math.floor(n * 0.05))
      .reduce((a, b) => a + b, 0) / Math.floor(n * 0.05);
    
    return {
      mean,
      median,
      std,
      min: points[0],
      max: points[n - 1],
      percentiles,
      cashRate,
      top10Rate,
      winRate,
      sharpeRatio,
      sortino,
      calmar,
      var95,
      cvar95
    };
  }

  private calculateMaxDrawdown(values: number[]): number {
    let maxDrawdown = 0;
    let peak = values[0];
    
    for (const value of values) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }

  private calculateOptimalExposures(
    results: SimulationResult[],
    config: SimulationConfig
  ): void {
    const allExposures = new Map<string, number[]>();
    
    for (const result of results) {
      for (const [playerId, exposure] of result.optimalExposures) {
        if (!allExposures.has(playerId)) {
          allExposures.set(playerId, []);
        }
        allExposures.get(playerId)!.push(exposure / config.iterations);
      }
    }
    
    for (const result of results) {
      result.optimalExposures.clear();
      for (const [playerId, exposures] of allExposures) {
        const avgExposure = exposures.reduce((a, b) => a + b, 0) / exposures.length;
        result.optimalExposures.set(playerId, avgExposure);
      }
    }
  }

  generateContestRecommendation(
    results: SimulationResult[]
  ): ContestRecommendation {
    const bestCashLineup = results.reduce((best, current) => 
      current.statistics.cashRate > best.statistics.cashRate ? current : best
    );
    
    const bestGPPLineup = results.reduce((best, current) => {
      const gppScore = (
        current.statistics.top10Rate * 0.5 +
        current.statistics.winRate * 0.3 +
        (current.statistics.max / 200) * 0.2
      );
      const bestScore = (
        best.statistics.top10Rate * 0.5 +
        best.statistics.winRate * 0.3 +
        (best.statistics.max / 200) * 0.2
      );
      return gppScore > bestScore ? current : best;
    });
    
    return {
      cashLineup: bestCashLineup.lineup,
      cashStats: {
        projectedPoints: bestCashLineup.statistics.mean,
        cashRate: bestCashLineup.statistics.cashRate,
        confidence: bestCashLineup.statistics.cashRate
      },
      gppLineup: bestGPPLineup.lineup,
      gppStats: {
        upside: bestGPPLineup.statistics.max,
        top10Rate: bestGPPLineup.statistics.top10Rate,
        winRate: bestGPPLineup.statistics.winRate
      },
      optimalExposures: this.mergeExposures(results)
    };
  }

  private mergeExposures(results: SimulationResult[]): Map<string, number> {
    const merged = new Map<string, number>();
    
    for (const result of results) {
      for (const [playerId, exposure] of result.optimalExposures) {
        merged.set(
          playerId,
          Math.max(merged.get(playerId) || 0, exposure)
        );
      }
    }
    
    return merged;
  }
}

interface ContestRecommendation {
  cashLineup: OptimizedLineup;
  cashStats: {
    projectedPoints: number;
    cashRate: number;
    confidence: number;
  };
  gppLineup: OptimizedLineup;
  gppStats: {
    upside: number;
    top10Rate: number;
    winRate: number;
  };
  optimalExposures: Map<string, number>;
}

export { SimulationConfig, SimulationResult, ContestRecommendation };