import { PowerRanking, Player } from '../types';

/**
 * Power Rankings Analyzer
 * Analyzes player momentum and breakout potential using EWMA and orthogonalization
 * Addresses critique: Prevents double-counting with matchup adjustments
 */
export class PowerRankingsAnalyzer {
  private readonly EWMA_ALPHA = 0.3; // Exponential weighting factor
  private readonly BREAKOUT_THRESHOLD = 0.25; // 25% improvement for breakout
  private readonly MOMENTUM_WINDOW = 3; // Weeks to consider for momentum

  /**
   * Analyze player momentum from power rankings history
   */
  analyzeMomentum(
    player: Player,
    rankings: PowerRanking[],
    includeBreakoutDetection: boolean = true
  ): {
    momentum: number;
    trend: 'rising' | 'falling' | 'stable';
    ewmaScore: number;
    breakoutProbability: number;
    confidence: number;
    analysis: string[];
  } {
    if (rankings.length === 0) {
      return {
        momentum: 0,
        trend: 'stable',
        ewmaScore: 50,
        breakoutProbability: 0,
        confidence: 0,
        analysis: ['Insufficient ranking data']
      };
    }

    // Sort by week (most recent first)
    const sortedRankings = [...rankings].sort((a, b) => b.week - a.week);
    
    // Calculate EWMA (Exponentially Weighted Moving Average)
    const ewmaScore = this.calculateEWMA(sortedRankings);
    
    // Calculate season average
    const seasonAvg = this.calculateSeasonAverage(sortedRankings);
    
    // Calculate momentum (relative to season average)
    const momentum = (ewmaScore - seasonAvg) / (seasonAvg || 1);
    
    // Determine trend
    const trend = this.determineTrend(sortedRankings, momentum);
    
    // Calculate breakout probability if requested
    let breakoutProbability = 0;
    if (includeBreakoutDetection) {
      breakoutProbability = this.calculateBreakoutProbability(
        sortedRankings,
        momentum,
        player
      );
    }
    
    // Calculate confidence based on data quality
    const confidence = this.calculateConfidence(sortedRankings);
    
    // Generate analysis insights
    const analysis = this.generateAnalysis(
      player,
      sortedRankings,
      momentum,
      trend,
      breakoutProbability
    );

    return {
      momentum,
      trend,
      ewmaScore,
      breakoutProbability,
      confidence,
      analysis
    };
  }

  /**
   * Calculate EWMA with proper weighting
   */
  private calculateEWMA(rankings: PowerRanking[]): number {
    if (rankings.length === 0) return 50;
    
    let ewma = rankings[0].powerScore;
    let weightSum = 1.0;
    
    // Process from oldest to newest for proper EWMA calculation
    const reversed = [...rankings].reverse();
    
    for (let i = 1; i < Math.min(reversed.length, 6); i++) {
      const weight = Math.pow(1 - this.EWMA_ALPHA, i);
      ewma = this.EWMA_ALPHA * reversed[i].powerScore + (1 - this.EWMA_ALPHA) * ewma;
      weightSum += weight;
    }
    
    return ewma;
  }

  /**
   * Calculate season average
   */
  private calculateSeasonAverage(rankings: PowerRanking[]): number {
    if (rankings.length === 0) return 50;
    
    const sum = rankings.reduce((acc, r) => acc + r.powerScore, 0);
    return sum / rankings.length;
  }

  /**
   * Determine trend based on recent rankings
   */
  private determineTrend(
    rankings: PowerRanking[],
    momentum: number
  ): 'rising' | 'falling' | 'stable' {
    // Use explicit trend if available in recent ranking
    if (rankings[0]?.trend) {
      return rankings[0].trend;
    }
    
    // Calculate trend from momentum and recent changes
    if (rankings.length < 2) {
      return 'stable';
    }
    
    const recentWindow = rankings.slice(0, Math.min(3, rankings.length));
    const recentChange = recentWindow[0].powerScore - recentWindow[recentWindow.length - 1].powerScore;
    
    // Combine momentum and recent change
    if (momentum > 0.1 && recentChange > 5) {
      return 'rising';
    } else if (momentum < -0.1 && recentChange < -5) {
      return 'falling';
    }
    
    return 'stable';
  }

  /**
   * Calculate breakout probability
   */
  private calculateBreakoutProbability(
    rankings: PowerRanking[],
    momentum: number,
    player: Player
  ): number {
    let probability = 0;
    
    // Factor 1: Strong positive momentum (40% weight)
    if (momentum > this.BREAKOUT_THRESHOLD) {
      probability += 0.4 * Math.min(momentum / 0.5, 1);
    }
    
    // Factor 2: Consistent improvement (30% weight)
    const isImproving = this.checkConsistentImprovement(rankings);
    if (isImproving) {
      probability += 0.3;
    }
    
    // Factor 3: Recent spike (20% weight)
    if (rankings.length >= 2) {
      const recentSpike = rankings[0].powerScore - rankings[1].powerScore;
      if (recentSpike > 15) {
        probability += 0.2 * Math.min(recentSpike / 30, 1);
      }
    }
    
    // Factor 4: Position-specific factors (10% weight)
    probability += this.getPositionBreakoutBonus(player, rankings);
    
    // Cap at 1.0
    return Math.min(probability, 1.0);
  }

  /**
   * Check for consistent improvement pattern
   */
  private checkConsistentImprovement(rankings: PowerRanking[]): boolean {
    if (rankings.length < 3) return false;
    
    const window = rankings.slice(0, Math.min(4, rankings.length));
    let improvements = 0;
    
    for (let i = 0; i < window.length - 1; i++) {
      if (window[i].powerScore > window[i + 1].powerScore) {
        improvements++;
      }
    }
    
    return improvements >= window.length - 2; // Allow one down week
  }

  /**
   * Position-specific breakout bonuses
   */
  private getPositionBreakoutBonus(
    player: Player,
    rankings: PowerRanking[]
  ): number {
    if (rankings.length === 0) return 0;
    
    const currentScore = rankings[0].powerScore;
    
    // Young players have higher breakout potential
    // (Would need age data in real implementation)
    
    // Position-specific thresholds
    switch (player.position) {
      case 'WR':
        // WRs can breakout suddenly with target share changes
        return currentScore > 70 ? 0.1 : 0.05;
      
      case 'RB':
        // RBs breakout with volume changes
        if (currentScore > 65 && rankings[0].trend === 'rising') {
          return 0.1;
        }
        return 0.03;
      
      case 'TE':
        // TEs have delayed breakouts
        if (currentScore > 60 && this.checkConsistentImprovement(rankings)) {
          return 0.15;
        }
        return 0.02;
      
      case 'QB':
        // QBs are more stable
        return currentScore > 75 ? 0.05 : 0.02;
      
      default:
        return 0;
    }
  }

  /**
   * Calculate confidence in analysis
   */
  private calculateConfidence(rankings: PowerRanking[]): number {
    let confidence = 0.3; // Base confidence
    
    // More data = higher confidence
    if (rankings.length >= 6) {
      confidence += 0.3;
    } else if (rankings.length >= 4) {
      confidence += 0.2;
    } else if (rankings.length >= 2) {
      confidence += 0.1;
    }
    
    // Recent data = higher confidence
    if (rankings[0]) {
      const daysSinceUpdate = (Date.now() - new Date(rankings[0].week).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 7) {
        confidence += 0.2;
      } else if (daysSinceUpdate < 14) {
        confidence += 0.1;
      }
    }
    
    // Consistent trend = higher confidence
    const trendConsistency = this.calculateTrendConsistency(rankings);
    confidence += trendConsistency * 0.2;
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate how consistent the trend has been
   */
  private calculateTrendConsistency(rankings: PowerRanking[]): number {
    if (rankings.length < 3) return 0;
    
    const changes = [];
    for (let i = 0; i < rankings.length - 1; i++) {
      changes.push(rankings[i].powerScore - rankings[i + 1].powerScore);
    }
    
    // Calculate variance of changes
    const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance = changes.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / changes.length;
    
    // Lower variance = more consistent
    // Normalize to 0-1 (variance of 100 = 0, variance of 0 = 1)
    return Math.max(0, 1 - variance / 100);
  }

  /**
   * Generate human-readable analysis
   */
  private generateAnalysis(
    player: Player,
    rankings: PowerRanking[],
    momentum: number,
    trend: 'rising' | 'falling' | 'stable',
    breakoutProbability: number
  ): string[] {
    const analysis: string[] = [];
    
    // Trend analysis
    if (trend === 'rising') {
      const improvement = rankings[0].powerScore - (rankings[2]?.powerScore || rankings[0].powerScore);
      analysis.push(`Rising trend: +${improvement.toFixed(0)} points over ${Math.min(3, rankings.length)} weeks`);
    } else if (trend === 'falling') {
      const decline = (rankings[2]?.powerScore || rankings[0].powerScore) - rankings[0].powerScore;
      analysis.push(`Declining trend: -${decline.toFixed(0)} points over ${Math.min(3, rankings.length)} weeks`);
    } else {
      analysis.push('Stable performance in recent weeks');
    }
    
    // Momentum analysis
    if (Math.abs(momentum) > 0.2) {
      const percentChange = (momentum * 100).toFixed(0);
      analysis.push(`Momentum: ${momentum > 0 ? '+' : ''}${percentChange}% vs season average`);
    }
    
    // Breakout analysis
    if (breakoutProbability > 0.5) {
      analysis.push(`High breakout potential (${(breakoutProbability * 100).toFixed(0)}% probability)`);
    } else if (breakoutProbability > 0.3) {
      analysis.push(`Moderate breakout potential (${(breakoutProbability * 100).toFixed(0)}% probability)`);
    }
    
    // Recent performance
    if (rankings[0]) {
      const currentRank = rankings[0].powerScore;
      if (currentRank > 80) {
        analysis.push(`Elite performer: ${currentRank.toFixed(0)}/100 power score`);
      } else if (currentRank > 65) {
        analysis.push(`Strong performer: ${currentRank.toFixed(0)}/100 power score`);
      } else if (currentRank < 40) {
        analysis.push(`Struggling: ${currentRank.toFixed(0)}/100 power score`);
      }
    }
    
    // Position-specific insights
    analysis.push(...this.getPositionSpecificInsights(player, rankings, momentum));
    
    return analysis;
  }

  /**
   * Get position-specific insights
   */
  private getPositionSpecificInsights(
    player: Player,
    rankings: PowerRanking[],
    momentum: number
  ): string[] {
    const insights: string[] = [];
    
    if (!rankings[0]) return insights;
    
    switch (player.position) {
      case 'RB':
        if (momentum > 0.15) {
          insights.push('Possible increased workload or improved offensive line play');
        }
        if (rankings[0].powerScore > 70) {
          insights.push('Bell-cow back territory');
        }
        break;
      
      case 'WR':
        if (momentum > 0.2 && rankings[0].powerScore > 65) {
          insights.push('Target share likely increasing');
        }
        if (this.checkConsistentImprovement(rankings)) {
          insights.push('Building chemistry with QB');
        }
        break;
      
      case 'TE':
        if (momentum > 0.15 && rankings[0].powerScore > 60) {
          insights.push('Emerging as key target in offense');
        }
        break;
      
      case 'QB':
        if (momentum < -0.15) {
          insights.push('Possible offensive line or weapon concerns');
        }
        if (momentum > 0.1 && rankings[0].powerScore > 75) {
          insights.push('Hitting stride with offensive system');
        }
        break;
    }
    
    return insights;
  }

  /**
   * Orthogonalize power ranking adjustment against other factors
   * Prevents double-counting with matchup/usage adjustments
   */
  orthogonalizeAdjustment(
    powerRankingAdjustment: number,
    otherAdjustments: {
      matchup?: number;
      usage?: number;
      vegas?: number;
    }
  ): number {
    // Estimated correlations between power rankings and other factors
    const correlations = {
      matchup: 0.3,  // Power rankings partially reflect recent matchups
      usage: 0.5,    // Power rankings heavily influenced by usage
      vegas: 0.2     // Some correlation with team performance
    };
    
    let totalCorrelation = 0;
    let correlatedComponent = 0;
    
    if (otherAdjustments.matchup !== undefined) {
      correlatedComponent += otherAdjustments.matchup * correlations.matchup;
      totalCorrelation += correlations.matchup;
    }
    
    if (otherAdjustments.usage !== undefined) {
      correlatedComponent += otherAdjustments.usage * correlations.usage;
      totalCorrelation += correlations.usage;
    }
    
    if (otherAdjustments.vegas !== undefined) {
      correlatedComponent += otherAdjustments.vegas * correlations.vegas;
      totalCorrelation += correlations.vegas;
    }
    
    // Remove correlated component to get orthogonal adjustment
    const orthogonalAdjustment = powerRankingAdjustment - correlatedComponent;
    
    // Scale down if significant correlation detected
    if (totalCorrelation > 0.5) {
      return orthogonalAdjustment * (1 - totalCorrelation / 2);
    }
    
    return orthogonalAdjustment;
  }

  /**
   * Compare multiple players' momentum for start/sit decisions
   */
  comparePlayers(
    players: Array<{ player: Player; rankings: PowerRanking[] }>
  ): {
    rankings: Array<{
      player: Player;
      momentum: number;
      trend: 'rising' | 'falling' | 'stable';
      recommendation: 'start' | 'consider' | 'sit';
      reason: string;
    }>;
    bestPlay: Player | null;
  } {
    const analyzed = players.map(({ player, rankings }) => {
      const analysis = this.analyzeMomentum(player, rankings);
      
      // Generate recommendation based on momentum
      let recommendation: 'start' | 'consider' | 'sit';
      let reason: string;
      
      if (analysis.momentum > 0.2 && analysis.trend === 'rising') {
        recommendation = 'start';
        reason = 'Hot hand - riding positive momentum';
      } else if (analysis.momentum < -0.2 && analysis.trend === 'falling') {
        recommendation = 'sit';
        reason = 'Cold streak - wait for turnaround';
      } else if (analysis.breakoutProbability > 0.5) {
        recommendation = 'start';
        reason = 'Breakout candidate';
      } else {
        recommendation = 'consider';
        reason = 'Stable option - check matchup';
      }
      
      return {
        player,
        momentum: analysis.momentum,
        trend: analysis.trend,
        recommendation,
        reason
      };
    });
    
    // Sort by momentum
    analyzed.sort((a, b) => b.momentum - a.momentum);
    
    // Find best play
    const bestPlay = analyzed.find(a => a.recommendation === 'start')?.player || null;
    
    return {
      rankings: analyzed,
      bestPlay
    };
  }
}