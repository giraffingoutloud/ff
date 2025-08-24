/**
 * Win Probability Calculator
 * Calculates P(our_score > opponent_score) using proper statistical methods
 */
export class WinProbabilityCalculator {
  /**
   * Calculate win probability analytically (fast approximation)
   */
  calculateWinProbability(
    ourMean: number,
    ourVariance: number,
    oppMean: number,
    oppVariance: number
  ): number {
    // P(our_score > opp_score) = P(our_score - opp_score > 0)
    // Difference of independent normals is normal
    const diffMean = ourMean - oppMean;
    const diffVariance = ourVariance + oppVariance;
    const diffStdDev = Math.sqrt(diffVariance);
    
    if (diffStdDev === 0) {
      return diffMean > 0 ? 1 : 0;
    }
    
    // Standardize to get P(Z > -diffMean/diffStdDev)
    const z = diffMean / diffStdDev;
    return this.normalCDF(z);
  }
  
  /**
   * Monte Carlo simulation for win probability with correlations
   */
  simulateWinProbability(
    lineupScores: number[][],  // From CorrelationModel.simulateCorrelatedOutcomes
    oppMean: number,
    oppVariance: number,
    numSims: number = 10000
  ): {
    winProbability: number;
    expectedMargin: number;
    marginStdDev: number;
    percentiles: Record<string, number>;
  } {
    const margins: number[] = [];
    let wins = 0;
    
    const oppStdDev = Math.sqrt(oppVariance);
    
    for (let i = 0; i < Math.min(numSims, lineupScores.length); i++) {
      // Sum lineup scores
      const ourScore = lineupScores[i].reduce((sum, score) => sum + score, 0);
      
      // Sample opponent score
      const oppZ = this.randomNormal();
      const oppScore = oppMean + oppStdDev * oppZ;
      
      // Calculate margin
      const margin = ourScore - oppScore;
      margins.push(margin);
      
      if (margin > 0) wins++;
    }
    
    // Calculate statistics
    const winProbability = wins / margins.length;
    const expectedMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
    
    const variance = margins.reduce((sum, m) => 
      sum + Math.pow(m - expectedMargin, 2), 0) / margins.length;
    const marginStdDev = Math.sqrt(variance);
    
    // Calculate percentiles
    margins.sort((a, b) => a - b);
    const percentiles = {
      p5: this.getPercentile(margins, 0.05),
      p10: this.getPercentile(margins, 0.10),
      p25: this.getPercentile(margins, 0.25),
      p50: this.getPercentile(margins, 0.50),
      p75: this.getPercentile(margins, 0.75),
      p90: this.getPercentile(margins, 0.90),
      p95: this.getPercentile(margins, 0.95)
    };
    
    return {
      winProbability,
      expectedMargin,
      marginStdDev,
      percentiles
    };
  }
  
  /**
   * Determine optimal strategy based on matchup
   */
  getOptimalStrategy(
    currentWinProb: number,
    marginOfVictory: number
  ): 'floor' | 'ceiling' | 'balanced' {
    // If we're heavy favorites (>70% win prob), play it safe
    if (currentWinProb > 0.70) {
      return 'floor';
    }
    
    // If we're heavy underdogs (<30% win prob), need upside
    if (currentWinProb < 0.30) {
      return 'ceiling';
    }
    
    // Close matchup - balanced approach
    return 'balanced';
  }
  
  /**
   * Calculate required score to achieve target win probability
   */
  calculateRequiredScore(
    targetWinProb: number,
    oppMean: number,
    oppStdDev: number
  ): number {
    // Inverse of win probability calculation
    // We need P(our_score > opp_score) = targetWinProb
    
    // Using normal approximation
    const z = this.normalQuantile(targetWinProb);
    
    // our_score ~ N(μ, σ²), opp_score ~ N(oppMean, oppStdDev²)
    // For simplicity, assume our σ ≈ 0.2 * μ (typical CV)
    // This gives us: μ - oppMean = z * sqrt(0.04μ² + oppStdDev²)
    
    // Solve quadratic equation for μ
    const a = 1 - 0.04 * z * z;
    const b = -2 * oppMean;
    const c = oppMean * oppMean - z * z * oppStdDev * oppStdDev;
    
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      // No solution - target probability not achievable
      return oppMean + 2 * oppStdDev; // Return a high target
    }
    
    const mu = (-b + Math.sqrt(discriminant)) / (2 * a);
    return mu;
  }
  
  /**
   * Standard normal CDF
   */
  private normalCDF(z: number): number {
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.39894228;
    
    // Handle edge cases
    if (z === 0) return 0.5;
    if (z < -6) return 0;
    if (z > 6) return 1;
    
    const absZ = Math.abs(z);
    const t = 1.0 / (1.0 + p * absZ);
    const prob = 1.0 - c * Math.exp(-absZ * absZ / 2.0) * t * 
      (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
    
    return z >= 0 ? prob : 1.0 - prob;
  }
  
  /**
   * Inverse normal CDF
   */
  private normalQuantile(p: number): number {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    
    // Simplified approximation for common range
    if (p < 0.5) {
      const t = Math.sqrt(-2 * Math.log(p));
      return -(2.515517 + 0.802853 * t + 0.010328 * t * t) /
             (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
    } else {
      const t = Math.sqrt(-2 * Math.log(1 - p));
      return (2.515517 + 0.802853 * t + 0.010328 * t * t) /
             (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
    }
  }
  
  /**
   * Generate standard normal random variable
   */
  private randomNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  /**
   * Get percentile from sorted array
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    const index = percentile * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }
}