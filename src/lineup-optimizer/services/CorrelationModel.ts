import { PlayerProjection } from '../types';

/**
 * Correlation Model with Variance Decomposition
 * Xi = μi + σ_shock,i * Si + σ_resid,i * εi
 * where Si is the shared team shock, εi is individual noise
 */
export class CorrelationModel {
  private readonly SHOCK_RATIOS: Record<string, number> = {
    'QB': 0.35,   // 35% of variance from team shock
    'WR': 0.30,   // 30% from team shock
    'TE': 0.25,   // 25% from team shock
    'RB': 0.20,   // 20% from team shock (more game-script independent)
    'K': 0.15,    // 15% from team shock
    'DST': 0.10   // 10% from team shock (negatively correlated with opposing offense)
  };
  
  /**
   * Decompose variance into shock and residual components
   */
  decomposeVariance(
    player: PlayerProjection
  ): { shockVariance: number; residualVariance: number } {
    // Calculate variance from stdDev if variance is not provided
    const totalVariance = player.projection.variance || 
                         (player.projection.stdDev ? player.projection.stdDev * player.projection.stdDev : 
                          Math.pow((player.projection.ceiling - player.projection.floor) / 4, 2));
    
    const shockRatio = this.SHOCK_RATIOS[player.player.position] || 0.2;
    
    const shockVariance = totalVariance * shockRatio;
    const residualVariance = totalVariance * (1 - shockRatio);
    
    return { shockVariance, residualVariance };
  }
  
  /**
   * Calculate correlation matrix for a lineup
   */
  calculateCorrelationMatrix(lineup: PlayerProjection[]): number[][] {
    const n = lineup.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          matrix[i][j] = this.calculatePairwiseCorrelation(lineup[i], lineup[j]);
        }
      }
    }
    
    return matrix;
  }
  
  /**
   * Calculate pairwise correlation between two players
   */
  private calculatePairwiseCorrelation(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): number {
    // Same team correlation
    if (player1.player.team === player2.player.team) {
      return this.calculateSameTeamCorrelation(player1, player2);
    }
    
    // Opposing team correlation (negative for DST vs offense)
    if (this.areOpponents(player1, player2)) {
      return this.calculateOpponentCorrelation(player1, player2);
    }
    
    // Same game correlation (game environment effects)
    if (this.inSameGame(player1, player2)) {
      return this.calculateGameEnvironmentCorrelation(player1, player2);
    }
    
    // Independent
    return 0;
  }
  
  /**
   * Calculate correlation for players on same team
   */
  private calculateSameTeamCorrelation(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): number {
    const var1 = this.decomposeVariance(player1);
    const var2 = this.decomposeVariance(player2);
    
    // Correlation = Cov(X1, X2) / (σ1 * σ2)
    // Cov(X1, X2) = σ_shock,1 * σ_shock,2 (same shock S)
    const covariance = Math.sqrt(var1.shockVariance * var2.shockVariance);
    
    // Get variance with fallback calculation
    const variance1 = player1.projection.variance || 
                     (player1.projection.stdDev ? player1.projection.stdDev * player1.projection.stdDev : 
                      Math.pow((player1.projection.ceiling - player1.projection.floor) / 4, 2));
    const variance2 = player2.projection.variance || 
                     (player2.projection.stdDev ? player2.projection.stdDev * player2.projection.stdDev : 
                      Math.pow((player2.projection.ceiling - player2.projection.floor) / 4, 2));
    
    const std1 = Math.sqrt(variance1);
    const std2 = Math.sqrt(variance2);
    
    let correlation = covariance / (std1 * std2);
    
    // Position-specific adjustments
    const pos1 = player1.player.position;
    const pos2 = player2.player.position;
    
    // QB-pass catcher stack bonus
    if (pos1 === 'QB' && ['WR', 'TE'].includes(pos2) ||
        pos2 === 'QB' && ['WR', 'TE'].includes(pos1)) {
      correlation *= 1.2; // 20% boost for stacking
    }
    
    // RB-RB negative correlation (competing for touches)
    if (pos1 === 'RB' && pos2 === 'RB') {
      correlation *= -0.5; // Negative correlation
    }
    
    return Math.max(-1, Math.min(1, correlation));
  }
  
  /**
   * Calculate correlation for opposing players
   */
  private calculateOpponentCorrelation(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): number {
    // DST vs opposing offense
    if (player1.player.position === 'DST' || player2.player.position === 'DST') {
      return -0.15; // Negative correlation
    }
    
    // QBs in shootout
    if (player1.player.position === 'QB' && player2.player.position === 'QB') {
      const total = player1.gameInfo.total;
      if (total > 50) {
        return 0.10; // Positive in high-scoring games
      }
    }
    
    return 0;
  }
  
  /**
   * Calculate correlation from game environment
   */
  private calculateGameEnvironmentCorrelation(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): number {
    // Kickers in same game (similar scoring environment)
    if (player1.player.position === 'K' && player2.player.position === 'K') {
      return 0.05;
    }
    
    // General game flow correlation
    return 0.02;
  }
  
  /**
   * Check if players are opponents
   */
  private areOpponents(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): boolean {
    return player1.gameInfo.opponent === player2.player.team &&
           player2.gameInfo.opponent === player1.player.team;
  }
  
  /**
   * Check if players are in same game
   */
  private inSameGame(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): boolean {
    const teams1 = [player1.gameInfo.homeTeam, player1.gameInfo.awayTeam];
    const teams2 = [player2.gameInfo.homeTeam, player2.gameInfo.awayTeam];
    
    return teams1.some(t => teams2.includes(t));
  }
  
  /**
   * Simulate correlated outcomes using Cholesky decomposition
   */
  simulateCorrelatedOutcomes(
    lineup: PlayerProjection[],
    numSims: number = 10000
  ): number[][] {
    const n = lineup.length;
    const correlationMatrix = this.calculateCorrelationMatrix(lineup);
    const L = this.choleskyDecomposition(correlationMatrix);
    
    const simulations: number[][] = [];
    
    for (let sim = 0; sim < numSims; sim++) {
      // Generate independent standard normals
      const Z: number[] = [];
      for (let i = 0; i < n; i++) {
        Z.push(this.randomNormal());
      }
      
      // Transform to correlated normals: X = L * Z
      const X: number[] = [];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j <= i; j++) {
          sum += L[i][j] * Z[j];
        }
        X.push(sum);
      }
      
      // Transform to player scores
      const scores: number[] = [];
      for (let i = 0; i < n; i++) {
        const player = lineup[i];
        const mean = player.projection.mean;
        const stdDev = Math.sqrt(player.projection.variance);
        
        // Apply truncation bounds
        let score = mean + stdDev * X[i];
        score = Math.max(player.projection.lowerBound, 
                        Math.min(player.projection.upperBound, score));
        
        scores.push(score);
      }
      
      simulations.push(scores);
    }
    
    return simulations;
  }
  
  /**
   * Cholesky decomposition for correlation matrix
   */
  private choleskyDecomposition(matrix: number[][]): number[][] {
    const n = matrix.length;
    const L: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = 0;
        
        if (i === j) {
          // Diagonal elements
          for (let k = 0; k < j; k++) {
            sum += L[j][k] * L[j][k];
          }
          L[i][j] = Math.sqrt(Math.max(0, matrix[i][j] - sum));
        } else {
          // Off-diagonal elements
          for (let k = 0; k < j; k++) {
            sum += L[i][k] * L[j][k];
          }
          L[i][j] = L[j][j] > 0 ? (matrix[i][j] - sum) / L[j][j] : 0;
        }
      }
    }
    
    return L;
  }
  
  /**
   * Generate standard normal random variable
   */
  private randomNormal(): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  /**
   * Calculate lineup variance accounting for correlations
   */
  calculateLineupVariance(
    lineup: PlayerProjection[],
    correlationMatrix: number[][]
  ): number {
    const n = lineup.length;
    let variance = 0;
    
    // Var(ΣXi) = ΣVar(Xi) + 2ΣΣCov(Xi,Xj)
    for (let i = 0; i < n; i++) {
      // Get variance with fallback calculation
      const varianceI = lineup[i].projection.variance || 
                       (lineup[i].projection.stdDev ? lineup[i].projection.stdDev * lineup[i].projection.stdDev : 
                        Math.pow((lineup[i].projection.ceiling - lineup[i].projection.floor) / 4, 2));
      variance += varianceI;
      
      for (let j = i + 1; j < n; j++) {
        const varianceJ = lineup[j].projection.variance || 
                         (lineup[j].projection.stdDev ? lineup[j].projection.stdDev * lineup[j].projection.stdDev : 
                          Math.pow((lineup[j].projection.ceiling - lineup[j].projection.floor) / 4, 2));
        
        const std1 = Math.sqrt(varianceI);
        const std2 = Math.sqrt(varianceJ);
        const covariance = correlationMatrix[i][j] * std1 * std2;
        variance += 2 * covariance;
      }
    }
    
    return variance;
  }
}