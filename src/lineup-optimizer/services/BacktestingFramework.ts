import { PlayerProjection, OptimizedLineup, BacktestResult } from '../types';
import { LineupOptimizer } from '../core/LineupOptimizer';
import { ProjectionEngine } from '../core/ProjectionEngine';
import { DatabaseConnection } from '../data/DatabaseConnection';
import { DataPipeline } from '../data/DataPipeline';
import { CalibrationTracker } from './CalibrationTracker';

interface BacktestConfig {
  startWeek: number;
  endWeek: number;
  season: number;
  strategies: Array<'floor' | 'ceiling' | 'balanced'>;
  leagueSize: number;
  rosterRequirements: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    FLEX: number;
    DST: number;
    K: number;
  };
}

interface WeeklyBacktestResult {
  week: number;
  strategy: 'floor' | 'ceiling' | 'balanced';
  projectedPoints: number;
  actualPoints: number;
  percentileFinish: number;
  lineup: OptimizedLineup;
  calibrationMetrics: {
    mae: number;
    bias: number;
    hitRate: number;
  };
}

interface BacktestSummary {
  strategy: string;
  totalWeeks: number;
  avgProjectedPoints: number;
  avgActualPoints: number;
  avgError: number;
  winRate: number;
  top3Rate: number;
  consistencyScore: number;
  sharpeRatio: number;
  maxDrawdown: number;
  calibrationScore: number;
  weeklyResults: WeeklyBacktestResult[];
}

export class BacktestingFramework {
  private lineupOptimizer: LineupOptimizer;
  private projectionEngine: ProjectionEngine;
  private database: DatabaseConnection;
  private dataPipeline: DataPipeline;
  private calibrationTracker: CalibrationTracker;

  constructor() {
    this.lineupOptimizer = new LineupOptimizer();
    this.projectionEngine = new ProjectionEngine();
    this.database = new DatabaseConnection();
    this.dataPipeline = new DataPipeline();
    this.calibrationTracker = new CalibrationTracker();
  }

  async runBacktest(config: BacktestConfig): Promise<Map<string, BacktestSummary>> {
    await this.database.initialize();
    
    const results = new Map<string, BacktestSummary>();
    
    for (const strategy of config.strategies) {
      const weeklyResults: WeeklyBacktestResult[] = [];
      
      for (let week = config.startWeek; week <= config.endWeek; week++) {
        console.log(`Backtesting ${strategy} strategy for week ${week}...`);
        
        try {
          const weekResult = await this.backtestWeek(
            week,
            config.season,
            strategy,
            config.leagueSize,
            config.rosterRequirements
          );
          
          weeklyResults.push(weekResult);
        } catch (error) {
          console.error(`Failed to backtest week ${week}:`, error);
        }
      }
      
      const summary = this.calculateSummary(strategy, weeklyResults);
      results.set(strategy, summary);
    }
    
    await this.generateReport(results, config);
    
    return results;
  }

  private async backtestWeek(
    week: number,
    season: number,
    strategy: 'floor' | 'ceiling' | 'balanced',
    leagueSize: number,
    requirements: any
  ): Promise<WeeklyBacktestResult> {
    const projections = await this.loadHistoricalProjections(week, season);
    
    for (const proj of projections) {
      const enhancedProjection = await this.projectionEngine.enhanceProjection(
        proj.player,
        proj.projection,
        proj.gameInfo
      );
      proj.projection = enhancedProjection;
      
      this.calibrationTracker.recordPrediction(
        proj.player.id,
        week,
        enhancedProjection
      );
    }
    
    const optimizedLineup = this.lineupOptimizer.optimizeLineup(
      projections,
      strategy,
      requirements,
      [],
      []
    );
    
    const actualPoints = await this.calculateActualPoints(
      optimizedLineup,
      week,
      season
    );
    
    const calibrationMetrics = await this.calculateCalibrationMetrics(
      optimizedLineup,
      week,
      season
    );
    
    const percentileFinish = await this.calculatePercentileFinish(
      actualPoints,
      week,
      season,
      leagueSize
    );
    
    return {
      week,
      strategy,
      projectedPoints: optimizedLineup.projectedPoints.total,
      actualPoints,
      percentileFinish,
      lineup: optimizedLineup,
      calibrationMetrics
    };
  }

  private async loadHistoricalProjections(
    week: number,
    season: number
  ): Promise<PlayerProjection[]> {
    const projections = await this.dataPipeline.loadAllData(week);
    
    for (const proj of projections) {
      const historical = await this.database.getHistoricalProjections(
        proj.player.id,
        5
      );
      
      if (historical.length > 0) {
        const trend = this.calculateTrend(historical);
        proj.projection.trendAdjustment = trend;
      }
    }
    
    return projections;
  }

  private calculateTrend(historical: any[]): number {
    if (historical.length < 2) return 0;
    
    const points = historical.map(h => h.median);
    let trend = 0;
    
    for (let i = 1; i < points.length; i++) {
      trend += (points[i] - points[i-1]) / points[i-1];
    }
    
    return trend / (points.length - 1);
  }

  private async calculateActualPoints(
    lineup: OptimizedLineup,
    week: number,
    season: number
  ): Promise<number> {
    let total = 0;
    
    for (const slot of lineup.lineup) {
      const actual = await this.getActualPoints(
        slot.player.id,
        week,
        season
      );
      total += actual;
    }
    
    return total;
  }

  private async getActualPoints(
    playerId: string,
    week: number,
    season: number
  ): Promise<number> {
    const result = await this.database.pool.query(`
      SELECT actual_points FROM actual_results
      WHERE player_id = $1 AND week = $2 AND season = $3
    `, [playerId, week, season]);
    
    return result.rows[0]?.actual_points || 0;
  }

  private async calculateCalibrationMetrics(
    lineup: OptimizedLineup,
    week: number,
    season: number
  ): Promise<any> {
    let totalMAE = 0;
    let totalBias = 0;
    let hits = 0;
    let count = 0;
    
    for (const slot of lineup.lineup) {
      const actual = await this.getActualPoints(
        slot.player.id,
        week,
        season
      );
      
      const projected = slot.projectedPoints;
      const mae = Math.abs(actual - projected);
      const bias = actual - projected;
      
      totalMAE += mae;
      totalBias += bias;
      
      if (actual >= slot.player.projection.q1 && 
          actual <= slot.player.projection.q3) {
        hits++;
      }
      
      count++;
      
      const calibrationResult = this.calibrationTracker.recordActual(
        slot.player.id,
        week,
        actual
      );
      
      await this.database.saveCalibrationResult(calibrationResult, week, season);
    }
    
    return {
      mae: totalMAE / count,
      bias: totalBias / count,
      hitRate: hits / count
    };
  }

  private async calculatePercentileFinish(
    actualPoints: number,
    week: number,
    season: number,
    leagueSize: number
  ): Promise<number> {
    const result = await this.database.pool.query(`
      SELECT COUNT(*) as better_teams
      FROM lineups
      WHERE week = $1 AND season = $2 AND actual_points > $3
    `, [week, season, actualPoints]);
    
    const betterTeams = result.rows[0]?.better_teams || 0;
    return 1 - (betterTeams / leagueSize);
  }

  private calculateSummary(
    strategy: string,
    weeklyResults: WeeklyBacktestResult[]
  ): BacktestSummary {
    if (weeklyResults.length === 0) {
      return {
        strategy,
        totalWeeks: 0,
        avgProjectedPoints: 0,
        avgActualPoints: 0,
        avgError: 0,
        winRate: 0,
        top3Rate: 0,
        consistencyScore: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        calibrationScore: 0,
        weeklyResults: []
      };
    }
    
    const projectedPoints = weeklyResults.map(r => r.projectedPoints);
    const actualPoints = weeklyResults.map(r => r.actualPoints);
    const errors = weeklyResults.map(r => Math.abs(r.actualPoints - r.projectedPoints));
    const percentiles = weeklyResults.map(r => r.percentileFinish);
    
    const avgProjected = this.average(projectedPoints);
    const avgActual = this.average(actualPoints);
    const avgError = this.average(errors);
    
    const winRate = percentiles.filter(p => p >= 0.92).length / percentiles.length;
    const top3Rate = percentiles.filter(p => p >= 0.75).length / percentiles.length;
    
    const consistency = 1 - (this.standardDeviation(actualPoints) / avgActual);
    
    const returns = actualPoints.map((a, i) => 
      i > 0 ? (a - actualPoints[i-1]) / actualPoints[i-1] : 0
    ).slice(1);
    
    const sharpeRatio = returns.length > 0 
      ? this.average(returns) / this.standardDeviation(returns)
      : 0;
    
    const maxDrawdown = this.calculateMaxDrawdown(actualPoints);
    
    const calibrationScores = weeklyResults.map(r => 
      1 - (r.calibrationMetrics.mae / r.projectedPoints)
    );
    const calibrationScore = this.average(calibrationScores);
    
    return {
      strategy,
      totalWeeks: weeklyResults.length,
      avgProjectedPoints: avgProjected,
      avgActualPoints: avgActual,
      avgError,
      winRate,
      top3Rate,
      consistencyScore: consistency,
      sharpeRatio,
      maxDrawdown,
      calibrationScore,
      weeklyResults
    };
  }

  private average(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private standardDeviation(values: number[]): number {
    const avg = this.average(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.average(squaredDiffs));
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

  private async generateReport(
    results: Map<string, BacktestSummary>,
    config: BacktestConfig
  ): Promise<void> {
    console.log('\n=== BACKTEST REPORT ===\n');
    console.log(`Season: ${config.season}`);
    console.log(`Weeks: ${config.startWeek} - ${config.endWeek}`);
    console.log(`League Size: ${config.leagueSize}`);
    console.log('\n');
    
    for (const [strategy, summary] of results) {
      console.log(`Strategy: ${strategy.toUpperCase()}`);
      console.log('------------------------');
      console.log(`Avg Projected: ${summary.avgProjectedPoints.toFixed(2)}`);
      console.log(`Avg Actual: ${summary.avgActualPoints.toFixed(2)}`);
      console.log(`Avg Error: ${summary.avgError.toFixed(2)} (${(summary.avgError / summary.avgProjectedPoints * 100).toFixed(1)}%)`);
      console.log(`Win Rate: ${(summary.winRate * 100).toFixed(1)}%`);
      console.log(`Top 3 Rate: ${(summary.top3Rate * 100).toFixed(1)}%`);
      console.log(`Consistency: ${(summary.consistencyScore * 100).toFixed(1)}%`);
      console.log(`Sharpe Ratio: ${summary.sharpeRatio.toFixed(3)}`);
      console.log(`Max Drawdown: ${(summary.maxDrawdown * 100).toFixed(1)}%`);
      console.log(`Calibration Score: ${(summary.calibrationScore * 100).toFixed(1)}%`);
      console.log('\n');
      
      console.log('Weekly Performance:');
      for (const week of summary.weeklyResults) {
        const diff = week.actualPoints - week.projectedPoints;
        const pct = (diff / week.projectedPoints * 100).toFixed(1);
        const sign = diff >= 0 ? '+' : '';
        console.log(`  Week ${week.week}: ${week.actualPoints.toFixed(1)} (${sign}${diff.toFixed(1)}, ${sign}${pct}%) - ${(week.percentileFinish * 100).toFixed(0)}th percentile`);
      }
      console.log('\n');
    }
    
    const bestStrategy = this.identifyBestStrategy(results);
    console.log(`RECOMMENDATION: ${bestStrategy.strategy} strategy`);
    console.log(`Reason: ${bestStrategy.reason}`);
  }

  private identifyBestStrategy(
    results: Map<string, BacktestSummary>
  ): { strategy: string; reason: string } {
    let bestStrategy = '';
    let bestScore = -Infinity;
    let bestReason = '';
    
    for (const [strategy, summary] of results) {
      const score = (
        summary.winRate * 0.3 +
        summary.top3Rate * 0.2 +
        summary.consistencyScore * 0.2 +
        (1 - summary.avgError / summary.avgProjectedPoints) * 0.15 +
        Math.min(summary.sharpeRatio / 2, 1) * 0.1 +
        (1 - summary.maxDrawdown) * 0.05
      );
      
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
        
        if (summary.winRate > 0.15) {
          bestReason = `Highest win rate (${(summary.winRate * 100).toFixed(1)}%)`;
        } else if (summary.consistencyScore > 0.8) {
          bestReason = `Most consistent performance (${(summary.consistencyScore * 100).toFixed(1)}%)`;
        } else if (summary.sharpeRatio > 1) {
          bestReason = `Best risk-adjusted returns (Sharpe: ${summary.sharpeRatio.toFixed(2)})`;
        } else {
          bestReason = `Best overall balance of performance metrics`;
        }
      }
    }
    
    return { strategy: bestStrategy, reason: bestReason };
  }
}

export default BacktestingFramework;