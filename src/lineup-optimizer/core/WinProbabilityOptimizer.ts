import { PlayerProjection, OptimizedLineup, OpponentProjection } from '../types';
import { CorrelationModel } from '../services/CorrelationModel';
import { WinProbabilityCalculator } from './WinProbabilityCalculator';

/**
 * Win Probability Optimizer
 * Wrapper for win probability calculations with Monte Carlo simulation
 */
export class WinProbabilityOptimizer {
  private correlationModel: CorrelationModel;
  private winProbCalculator: WinProbabilityCalculator;
  
  constructor() {
    this.correlationModel = new CorrelationModel();
    this.winProbCalculator = new WinProbabilityCalculator();
  }
  /**
   * Calculate win probability using analytical approximation
   */
  calculateWinProbability(
    lineup: PlayerProjection[],
    opponentProjection: OpponentProjection
  ): number {
    // Calculate lineup statistics with correlations
    const correlationMatrix = this.correlationModel.calculateCorrelationMatrix(lineup);
    const ourMean = lineup.reduce((sum, p) => sum + p.projection.mean, 0);
    const ourVariance = this.correlationModel.calculateLineupVariance(lineup, correlationMatrix);
    
    return this.winProbCalculator.calculateWinProbability(
      ourMean,
      ourVariance,
      opponentProjection.mean,
      opponentProjection.variance
    );
  }
  
  /**
   * Determine optimal strategy based on win probability
   */
  getOptimalStrategy(
    currentWinProb: number,
    marginOfVictory: number
  ): 'floor' | 'ceiling' | 'balanced' {
    return this.winProbCalculator.getOptimalStrategy(currentWinProb, marginOfVictory);
  }
  
  /**
   * Calculate required score for target win probability
   */
  calculateRequiredScore(
    targetWinProb: number,
    opponentProjection: OpponentProjection
  ): number {
    return this.winProbCalculator.calculateRequiredScore(
      targetWinProb,
      opponentProjection.mean,
      Math.sqrt(opponentProjection.variance)
    );
  }
  
  /**
   * Monte Carlo simulation with proper correlation structure
   */
  simulateWinProbability(
    lineup: PlayerProjection[],
    opponentProjection: OpponentProjection,
    numSimulations: number = 10000
  ): {
    winProbability: number;
    expectedMargin: number;
    marginStdDev: number;
    percentiles: Record<string, number>;
  } {
    // Generate correlated outcomes
    const lineupScores = this.correlationModel.simulateCorrelatedOutcomes(
      lineup,
      numSimulations
    );
    
    return this.winProbCalculator.simulateWinProbability(
      lineupScores,
      opponentProjection.mean,
      opponentProjection.variance,
      numSimulations
    );
  }
}