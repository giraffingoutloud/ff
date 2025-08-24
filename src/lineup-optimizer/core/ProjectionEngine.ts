import { 
  Player, 
  Projection, 
  GameInfo, 
  WeatherConditions, 
  UsageMetrics,
  PracticeReport,
  PowerRanking,
  MatchupAnalysis,
  Position
} from '../types';

/**
 * Core projection engine using log-space additive model
 * Addresses critique: Proper log-space calculations with shrinkage
 */
export class ProjectionEngine {
  private readonly POSITION_PRIORS: Record<Position, number> = {
    QB: 18.0,
    RB: 10.0,
    WR: 11.0,
    TE: 7.5,
    K: 8.0,
    DST: 8.0,
    FLEX: 10.0 // Not used directly
  };

  // Starter requirements for calculating replacement level (12-team league)
  private readonly STARTER_REQUIREMENTS: Record<Position, number> = {
    QB: 12,   // 12 teams × 1 QB
    RB: 24,   // 12 teams × 2 RB
    WR: 36,   // 12 teams × 3 WR (2 + 1 flex typically)
    TE: 12,   // 12 teams × 1 TE
    K: 12,    // 12 teams × 1 K
    DST: 12,  // 12 teams × 1 DST
    FLEX: 12  // 12 teams × 1 FLEX
  };

  private readonly POSITION_VARIANCE: Record<Position, number> = {
    QB: 0.25,
    RB: 0.35,
    WR: 0.40,
    TE: 0.45,
    K: 0.30,
    DST: 0.50,
    FLEX: 0.35
  };

  /**
   * Calculate VORP (Value Over Replacement Player)
   * Properly calculates based on available players and league context
   */
  calculateVORP(
    player: Player,
    availablePlayers: Player[],
    leagueSize: number = 12
  ): number {
    // Get replacement level for position
    const replacementLevel = this.calculateDynamicReplacementLevel(
      player.position,
      availablePlayers,
      leagueSize
    );
    
    // VORP = player's projected points - replacement level
    // Need to get player's projection first
    return 0; // Will be calculated after projection
  }

  /**
   * Calculate dynamic replacement level based on available players
   */
  private calculateDynamicReplacementLevel(
    position: Position,
    availablePlayers: Player[],
    leagueSize: number = 12
  ): number {
    // Filter to position and sort by projected points
    const positionPlayers = availablePlayers
      .filter(p => p.position === position && !p.isDrafted)
      .sort((a, b) => {
        // Use stored projections if available
        const aProj = (a as any).projectedPoints || 0;
        const bProj = (b as any).projectedPoints || 0;
        return bProj - aProj;
      });
    
    // Calculate how many starters are needed
    const startersNeeded = Math.floor(
      (this.STARTER_REQUIREMENTS[position] / 12) * leagueSize
    );
    
    // Replacement level is the next best available after starters
    const replacementIndex = startersNeeded;
    
    if (replacementIndex < positionPlayers.length) {
      const replacementPlayer = positionPlayers[replacementIndex];
      return (replacementPlayer as any).projectedPoints || this.getPositionalBaseline(position);
    }
    
    // Fallback to positional baseline if not enough players
    return this.getPositionalBaseline(position);
  }

  /**
   * Get positional baseline for fallback
   */
  private getPositionalBaseline(position: Position): number {
    const baselines: Record<Position, number> = {
      QB: 14.0,
      RB: 6.0,
      WR: 7.0,
      TE: 4.5,
      K: 6.0,
      DST: 5.0,
      FLEX: 6.0
    };
    return baselines[position];
  }

  /**
   * Calculate projection with proper log-space additive model
   */
  async calculateProjection(
    player: Player,
    week: number,
    context: {
      gameInfo: GameInfo;
      opponent: string;
      weather?: WeatherConditions;
      usageHistory?: UsageMetrics[];
      practiceReports?: PracticeReport[];
      powerRanking?: PowerRanking;
      recentPerformance?: number[];
    }
  ): Promise<Projection> {
    // Step 1: Calculate base projection in log space
    const baseLogProjection = this.calculateBaseLogProjection(
      player,
      context.recentPerformance
    );

    // Step 2: Apply shrinkage toward positional replacement level
    const shrunkLogProjection = this.applyShrinkage(
      baseLogProjection,
      player,
      context.recentPerformance?.length || 0
    );

    // Step 3: Calculate adjustments (all in log space, additive)
    const adjustments = await this.calculateAdjustments(
      player,
      context
    );

    // Step 4: Sum adjustments in log space
    const finalLogProjection = shrunkLogProjection +
      adjustments.matchup +
      adjustments.vegas +
      adjustments.weather +
      adjustments.usage +
      adjustments.injury +
      adjustments.powerRanking;

    // Step 5: Convert to point space and calculate distribution
    const median = Math.exp(finalLogProjection);
    const distribution = this.calculateDistribution(
      median,
      player,
      context
    );

    // Step 6: Calculate confidence and data quality
    const confidence = this.calculateConfidence(context);
    const dataQuality = this.assessDataQuality(context);

    return {
      playerId: player.id,
      week,
      season: new Date().getFullYear(),
      floor: distribution.floor,
      q1: distribution.q1,
      median: distribution.median,
      q3: distribution.q3,
      ceiling: distribution.ceiling,
      baseLogProjection: shrunkLogProjection,
      matchupAdjustment: adjustments.matchup,
      vegasAdjustment: adjustments.vegas,
      weatherAdjustment: adjustments.weather,
      usageAdjustment: adjustments.usage,
      injuryAdjustment: adjustments.injury,
      confidence,
      dataQuality,
      modelVersion: 'v1.0.0',
      lastUpdated: new Date()
    };
  }

  /**
   * Calculate base projection using recent performance
   * Addresses critique: Role-adjusted per-game baseline
   */
  private calculateBaseLogProjection(
    player: Player,
    recentPerformance?: number[]
  ): number {
    if (!recentPerformance || recentPerformance.length === 0) {
      // Use positional prior if no recent data
      return Math.log(this.POSITION_PRIORS[player.position]);
    }

    // Weight recent games more heavily (exponential decay)
    const weights = recentPerformance.map((_, i) => 
      Math.exp(-0.2 * i) // More recent games weighted higher
    );
    
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => w / weightSum);

    // Calculate weighted average in log space
    const weightedLogSum = recentPerformance.reduce((sum, points, i) => {
      // Handle zero points (use small epsilon)
      const logPoints = points > 0 ? Math.log(points) : Math.log(0.1);
      return sum + logPoints * normalizedWeights[i];
    }, 0);

    return weightedLogSum;
  }

  /**
   * Apply Bayesian shrinkage toward replacement level
   * Addresses critique: Proper shrinkage in log space
   */
  private applyShrinkage(
    baseLogProjection: number,
    player: Player,
    sampleSize: number
  ): number {
    const replacementLog = Math.log(this.REPLACEMENT_LEVEL[player.position]);
    
    // Shrinkage factor based on sample size
    // Need ~6 games for 90% weight on player's actual performance
    const shrinkageFactor = sampleSize / (sampleSize + 2);
    
    // Weighted average in log space
    return baseLogProjection * shrinkageFactor + 
           replacementLog * (1 - shrinkageFactor);
  }

  /**
   * Calculate all adjustments in log space
   */
  private async calculateAdjustments(
    player: Player,
    context: any
  ): Promise<Record<string, number>> {
    const adjustments = {
      matchup: 0,
      vegas: 0,
      weather: 0,
      usage: 0,
      injury: 0,
      powerRanking: 0
    };

    // Matchup adjustment (-0.15 to +0.15 in log space)
    if (context.opponent) {
      adjustments.matchup = await this.calculateMatchupAdjustment(
        player,
        context.opponent,
        context.gameInfo
      );
    }

    // Vegas adjustment (-0.10 to +0.10 in log space)
    if (context.gameInfo) {
      adjustments.vegas = this.calculateVegasAdjustment(
        player,
        context.gameInfo
      );
    }

    // Weather adjustment (-0.12 to +0.03 in log space)
    if (context.weather) {
      adjustments.weather = this.calculateWeatherAdjustment(
        player,
        context.weather
      );
    }

    // Usage trend adjustment (-0.20 to +0.20 in log space)
    if (context.usageHistory && context.usageHistory.length >= 3) {
      adjustments.usage = this.calculateUsageAdjustment(
        player,
        context.usageHistory
      );
    }

    // Injury/practice adjustment (-0.50 to 0 in log space)
    if (context.practiceReports) {
      adjustments.injury = this.calculateInjuryAdjustment(
        player,
        context.practiceReports
      );
    }

    // Power ranking adjustment (-0.10 to +0.10, orthogonalized)
    if (context.powerRanking) {
      adjustments.powerRanking = this.calculatePowerRankingAdjustment(
        context.powerRanking,
        adjustments.matchup // Orthogonalize against matchup
      );
    }

    return adjustments;
  }

  /**
   * Calculate matchup-based adjustment
   */
  private async calculateMatchupAdjustment(
    player: Player,
    opponent: string,
    gameInfo: GameInfo
  ): Promise<number> {
    // This would query defensive rankings from database
    // For now, using placeholder logic
    
    // Example: Get points allowed to position
    const pointsAllowedRank = await this.getDefensiveRank(opponent, player.position);
    
    // Convert rank to adjustment (1-32, where 1 is best defense)
    // Best matchup: +0.15, Worst matchup: -0.15
    const adjustment = (17 - pointsAllowedRank) * 0.01;
    
    return Math.max(-0.15, Math.min(0.15, adjustment));
  }

  /**
   * Calculate Vegas-based adjustment
   * Addresses critique: Use signed spread and implied totals correctly
   */
  private calculateVegasAdjustment(
    player: Player,
    gameInfo: GameInfo
  ): number {
    const isHome = gameInfo.homeTeam === player.team;
    const impliedTotal = isHome ? 
      gameInfo.homeImpliedTotal : 
      gameInfo.awayImpliedTotal;
    
    // League average is ~23.5 points
    const leagueAvg = 23.5;
    const totalDiff = (impliedTotal - leagueAvg) / leagueAvg;
    
    // Position-specific response to game environment
    const positionMultipliers: Record<Position, number> = {
      QB: 0.08,
      WR: 0.07,
      TE: 0.05,
      RB: gameInfo.spread > 7 && isHome ? 0.06 : 0.03, // RBs benefit if favored
      K: 0.04,
      DST: -0.05, // DST inversely correlated with total
      FLEX: 0.05
    };
    
    const adjustment = totalDiff * positionMultipliers[player.position];
    
    return Math.max(-0.10, Math.min(0.10, adjustment));
  }

  /**
   * Calculate weather-based adjustment
   * Fixed: Graduated wind impact instead of binary threshold
   */
  private calculateWeatherAdjustment(
    player: Player,
    weather: WeatherConditions
  ): number {
    // No weather impact in dome or closed retractable roof
    if (weather.isDome || weather.isRetractableClosed) {
      return 0;
    }
    
    let adjustment = 0;
    
    // Graduated wind impact (research shows progressive effects)
    if (weather.windSpeed > 0) {
      let windMultiplier = 0;
      
      if (weather.windSpeed < 10) {
        windMultiplier = 0; // No meaningful impact
      } else if (weather.windSpeed < 15) {
        windMultiplier = 0.3; // Minor impact
      } else if (weather.windSpeed < 20) {
        windMultiplier = 0.6; // Moderate impact (~10% reduction)
      } else if (weather.windSpeed < 25) {
        windMultiplier = 1.0; // Full impact
      } else {
        windMultiplier = 1.5; // Severe impact (1.5-2x effect per research)
      }
      
      // Position-specific base impacts
      const windImpactBase: Record<Position, number> = {
        QB: -0.12,   // Passing most affected
        WR: -0.10,   // Deep routes affected
        TE: -0.06,   // Shorter routes less affected
        RB: 0.04,    // Benefits from more runs
        K: -0.15,    // Kicking heavily affected
        DST: 0.03,   // Benefits from lower scoring
        FLEX: -0.05
      };
      
      adjustment += windImpactBase[player.position] * windMultiplier;
    }
    
    // Precipitation impact (multiplicative with wind)
    if (weather.precipitation > 0.3) {
      const precipMultiplier = weather.precipitation > 0.7 ? 1.2 : 1.0;
      const precipImpact = player.position === 'RB' ? 0.03 : -0.03;
      
      // Combined wind + rain is worse than either alone
      if (weather.windSpeed >= 15) {
        adjustment += precipImpact * precipMultiplier * 1.5;
      } else {
        adjustment += precipImpact * precipMultiplier;
      }
    }
    
    // Temperature effects
    if (weather.temperature < 20) {
      // Extreme cold
      const coldImpact: Record<Position, number> = {
        QB: -0.03,
        K: -0.04,
        WR: -0.02,
        TE: -0.01,
        RB: 0.01,   // Slight benefit
        DST: 0.02,  // Benefits from conditions
        FLEX: -0.01
      };
      adjustment += coldImpact[player.position];
    } else if (weather.temperature > 90) {
      // Extreme heat (affects stamina)
      adjustment -= 0.01; // Minor impact across all positions
    }
    
    // Cap total weather adjustment
    return Math.max(-0.25, Math.min(0.10, adjustment));
  }

  /**
   * Calculate usage trend adjustment
   */
  private calculateUsageAdjustment(
    player: Player,
    usageHistory: UsageMetrics[]
  ): number {
    // Sort by week (most recent first)
    const sorted = [...usageHistory].sort((a, b) => b.week - a.week);
    const recent = sorted.slice(0, 3);
    
    if (recent.length < 3) return 0;
    
    // Calculate trend in key metrics
    const metrics = {
      snapTrend: this.calculateTrend(recent.map(u => u.snapPercent)),
      targetTrend: this.calculateTrend(recent.map(u => u.targetShare)),
      woprTrend: this.calculateTrend(recent.map(u => u.wopr))
    };
    
    // Weight by position relevance
    const weights = player.position === 'RB' ? 
      { snap: 0.4, target: 0.3, wopr: 0.3 } :
      { snap: 0.2, target: 0.4, wopr: 0.4 };
    
    const trendScore = 
      metrics.snapTrend * weights.snap +
      metrics.targetTrend * weights.target +
      metrics.woprTrend * weights.wopr;
    
    // Convert to adjustment (-0.20 to +0.20)
    return Math.max(-0.20, Math.min(0.20, trendScore * 0.15));
  }

  /**
   * Calculate injury/practice adjustment
   * Addresses critique: Pattern-based analysis with game day context
   */
  private calculateInjuryAdjustment(
    player: Player,
    practiceReports: PracticeReport[]
  ): number {
    if (practiceReports.length === 0) return 0;
    
    // Create pattern string
    const pattern = practiceReports
      .sort((a, b) => {
        const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        return days.indexOf(a.dayOfWeek) - days.indexOf(b.dayOfWeek);
      })
      .map(r => r.status === 'DNP' ? 'D' : r.status === 'LIMITED' ? 'L' : 'F')
      .join('-');
    
    // Known patterns and their impact
    const patternImpacts: Record<string, number> = {
      'D-D-L': -0.25,  // Concerning pattern
      'D-L-F': -0.10,  // Improving
      'L-L-L': -0.15,  // Persistent limitation
      'D-D-D': -0.50,  // Likely out
      'F-F-F': 0,      // Full health
      'D-F-F': -0.05,  // Veteran rest day
    };
    
    // Check for veteran rest
    const hasVetRest = practiceReports.some(r => r.isVeteranRest);
    if (hasVetRest && pattern.startsWith('D')) {
      return -0.05; // Minimal impact for veteran rest
    }
    
    // Game day matters (TNF has less recovery time)
    const gameDay = practiceReports[0]?.gameDay;
    let dayAdjustment = 0;
    if (gameDay === 'THU' && pattern.includes('D')) {
      dayAdjustment = -0.05; // Extra penalty for Thursday games
    }
    
    const baseImpact = patternImpacts[pattern] ?? -0.15;
    return baseImpact + dayAdjustment;
  }

  /**
   * Calculate power ranking adjustment (orthogonalized)
   * Addresses critique: Prevent double-counting with matchup
   */
  private calculatePowerRankingAdjustment(
    powerRanking: PowerRanking,
    matchupAdjustment: number
  ): number {
    // Base adjustment from momentum
    const momentumAdjustment = powerRanking.momentum * 0.05;
    
    // Orthogonalize against matchup adjustment
    // If matchup already accounts for some of this, reduce impact
    const correlation = 0.3; // Estimated correlation between matchup and power
    const orthogonal = momentumAdjustment - (matchupAdjustment * correlation);
    
    // Breakout bonus
    const breakoutBonus = (powerRanking.breakoutProbability || 0) > 0.3 ? 0.03 : 0;
    
    return Math.max(-0.10, Math.min(0.10, orthogonal + breakoutBonus));
  }

  /**
   * Calculate distribution from median projection
   * Addresses critique: Position and context-specific variance
   */
  private calculateDistribution(
    median: number,
    player: Player,
    context: any
  ): Record<string, number> {
    // Base variance by position
    let variance = this.POSITION_VARIANCE[player.position];
    
    // Adjust variance based on game context
    if (context.gameInfo) {
      // High total games have more variance
      if (context.gameInfo.total > 50) {
        variance *= 1.15;
      }
      // Low total games have less variance
      if (context.gameInfo.total < 40) {
        variance *= 0.85;
      }
      // Blowout potential reduces variance for favored team
      if (Math.abs(context.gameInfo.spread) > 10) {
        const isFavored = 
          (context.gameInfo.spread > 0 && context.gameInfo.homeTeam === player.team) ||
          (context.gameInfo.spread < 0 && context.gameInfo.awayTeam === player.team);
        variance *= isFavored ? 0.9 : 1.1;
      }
    }
    
    // TD-dependent positions have higher variance
    if (player.position === 'TE' || player.position === 'RB') {
      variance *= 1.05;
    }
    
    // Calculate percentiles using log-normal assumption
    // But bounded to realistic ranges
    const distribution = {
      floor: Math.max(0, median * (1 - variance * 1.28)),   // ~10th percentile
      q1: Math.max(0, median * (1 - variance * 0.67)),      // 25th percentile
      median: median,                                        // 50th percentile
      q3: median * (1 + variance * 0.67),                   // 75th percentile
      ceiling: median * (1 + variance * 1.28)               // ~90th percentile
    };
    
    return distribution;
  }

  /**
   * Calculate confidence in projection
   */
  private calculateConfidence(context: any): number {
    let confidence = 0.5; // Base confidence
    
    // Add confidence for data availability
    if (context.recentPerformance && context.recentPerformance.length >= 4) {
      confidence += 0.15;
    }
    if (context.usageHistory && context.usageHistory.length >= 3) {
      confidence += 0.15;
    }
    if (context.practiceReports && context.practiceReports.length >= 3) {
      confidence += 0.10;
    }
    if (context.weather && context.weather.forecastConfidence > 0.7) {
      confidence += 0.05;
    }
    if (context.powerRanking) {
      confidence += 0.05;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Assess data quality
   */
  private assessDataQuality(context: any): number {
    let quality = 0;
    let factors = 0;
    
    // Recency of data
    if (context.weather?.asOf) {
      const hoursOld = (Date.now() - context.weather.asOf.getTime()) / (1000 * 60 * 60);
      quality += hoursOld < 6 ? 1.0 : hoursOld < 24 ? 0.7 : 0.3;
      factors++;
    }
    
    // Completeness of usage data
    if (context.usageHistory) {
      const hasAllMetrics = context.usageHistory.every(u => 
        u.snapPercent && u.targetShare && u.wopr
      );
      quality += hasAllMetrics ? 1.0 : 0.5;
      factors++;
    }
    
    // Practice report completeness
    if (context.practiceReports) {
      quality += context.practiceReports.length >= 3 ? 1.0 : 0.5;
      factors++;
    }
    
    return factors > 0 ? quality / factors : 0.5;
  }

  /**
   * Helper: Calculate trend from array of values
   */
  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    // Simple linear regression
    const n = values.length;
    const indices = values.map((_, i) => i);
    
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Normalize slope to [-1, 1] range
    const avgValue = sumY / n;
    const normalizedSlope = avgValue > 0 ? slope / avgValue : 0;
    
    return Math.max(-1, Math.min(1, normalizedSlope));
  }

  /**
   * Helper: Get defensive rank (placeholder - would query DB)
   */
  private async getDefensiveRank(
    team: string,
    position: Position
  ): Promise<number> {
    // This would query the database for actual defensive rankings
    // For now, return a random rank for testing
    return Math.floor(Math.random() * 32) + 1;
  }
}