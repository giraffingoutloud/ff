import {
  Player,
  PlayerProjection,
  GameInfo,
  WeatherConditions,
  PowerRanking,
  PracticePattern,
  UsageMetrics
} from '../types';

/**
 * Reasoning Engine for generating human-readable explanations
 * Addresses critique: Factual, sourced, deduplicated explanations
 */
export class ReasoningEngine {
  private readonly MAX_REASONS = 4; // Limit reasons to avoid overwhelming users

  /**
   * Explain a start/sit decision with factual, sourced reasoning
   */
  explainDecision(
    player: PlayerProjection,
    decision: 'start' | 'sit' | 'flex',
    context: {
      alternatives?: PlayerProjection[];
      leagueAvg?: number;
      positionRank?: number;
      usageMetrics?: UsageMetrics;
      powerRanking?: PowerRanking;
      practicePattern?: PracticePattern;
    }
  ): {
    summary: string;
    reasons: string[];
    confidence: number;
    dataQuality: string;
  } {
    const reasons = this.generateReasons(player, decision, context);
    const dedupedReasons = this.deduplicateReasons(reasons);
    const topReasons = dedupedReasons.slice(0, this.MAX_REASONS);
    
    const summary = this.generateSummary(
      player.player,
      decision,
      topReasons,
      context.alternatives
    );
    
    const dataQuality = this.assessDataQuality(player, context);
    
    return {
      summary,
      reasons: topReasons,
      confidence: player.projection.confidence,
      dataQuality
    };
  }

  /**
   * Generate factual reasons for the decision
   */
  private generateReasons(
    player: PlayerProjection,
    decision: 'start' | 'sit' | 'flex',
    context: any
  ): string[] {
    const reasons: string[] = [];
    
    // 1. Projection-based reasoning
    if (player.projection.median > 0) {
      const projStr = `Projected for ${player.projection.median.toFixed(1)} points`;
      if (context.leagueAvg) {
        const diff = player.projection.median - context.leagueAvg;
        if (Math.abs(diff) > 2) {
          reasons.push(`${projStr} (${diff > 0 ? '+' : ''}${diff.toFixed(1)} vs avg)`);
        } else {
          reasons.push(projStr);
        }
      } else {
        reasons.push(projStr);
      }
    }
    
    // 2. Matchup reasoning
    if (player.projection.matchupAdjustment) {
      const matchupImpact = player.projection.matchupAdjustment;
      if (Math.abs(matchupImpact) > 0.05) {
        const percentImpact = (Math.exp(matchupImpact) - 1) * 100;
        if (matchupImpact > 0) {
          reasons.push(`Favorable matchup vs ${player.opponent} (+${percentImpact.toFixed(0)}% projection boost)`);
        } else {
          reasons.push(`Tough matchup vs ${player.opponent} (${percentImpact.toFixed(0)}% projection hit)`);
        }
      }
    }
    
    // 3. Vegas/game environment reasoning
    if (player.gameInfo) {
      const impliedTotal = player.isHome ? 
        player.gameInfo.homeImpliedTotal : 
        player.gameInfo.awayImpliedTotal;
      
      if (impliedTotal > 27) {
        reasons.push(`High-scoring game environment (${impliedTotal.toFixed(1)} implied points)`);
      } else if (impliedTotal < 20) {
        reasons.push(`Low-scoring game expected (${impliedTotal.toFixed(1)} implied points)`);
      }
      
      if (Math.abs(player.gameInfo.spread) > 10) {
        const isFavored = (player.gameInfo.spread > 0 && player.isHome) || 
                         (player.gameInfo.spread < 0 && !player.isHome);
        if (isFavored) {
          reasons.push(`Heavy favorite (${Math.abs(player.gameInfo.spread).toFixed(1)} point spread)`);
        } else {
          reasons.push(`Heavy underdog (${Math.abs(player.gameInfo.spread).toFixed(1)} point spread)`);
        }
      }
    }
    
    // 4. Weather reasoning
    if (player.weather && !player.weather.isDome) {
      if (player.weather.windSpeed >= 15) {
        reasons.push(`⚠️ ${player.weather.windSpeed} mph winds expected (impacts passing game)`);
      }
      if (player.weather.precipitation > 0.5) {
        reasons.push(`⚠️ ${(player.weather.precipitation * 100).toFixed(0)}% chance of precipitation`);
      }
      if (player.weather.temperature < 20) {
        reasons.push(`⚠️ Extreme cold (${player.weather.temperature}°F) may impact performance`);
      }
    }
    
    // 5. Usage trend reasoning
    if (context.usageMetrics) {
      const usage = context.usageMetrics;
      if (usage.targetShare > 25) {
        reasons.push(`High target share (${usage.targetShare.toFixed(0)}% of team targets)`);
      }
      if (usage.wopr > 0.5) {
        reasons.push(`Elite opportunity share (WOPR: ${usage.wopr.toFixed(2)})`);
      }
      if (usage.redZoneTouches > 3) {
        reasons.push(`Red zone usage (${usage.redZoneTouches} RZ touches last game)`);
      }
      if (usage.snapPercent < 50 && decision === 'sit') {
        reasons.push(`Limited snap share (${usage.snapPercent.toFixed(0)}% of snaps)`);
      }
    }
    
    // 6. Power ranking/momentum reasoning
    if (context.powerRanking) {
      if (context.powerRanking.trend === 'rising' && context.powerRanking.momentum > 0.15) {
        reasons.push(`Rising in power rankings (+${(context.powerRanking.momentum * 100).toFixed(0)}% momentum)`);
      } else if (context.powerRanking.trend === 'falling' && context.powerRanking.momentum < -0.15) {
        reasons.push(`Declining performance (-${Math.abs(context.powerRanking.momentum * 100).toFixed(0)}% momentum)`);
      }
      if (context.powerRanking.breakoutProbability > 0.5) {
        reasons.push(`Breakout candidate (${(context.powerRanking.breakoutProbability * 100).toFixed(0)}% probability)`);
      }
    }
    
    // 7. Injury/practice reasoning
    if (context.practicePattern) {
      const pattern = context.practicePattern;
      if (pattern.playProbability < 0.7) {
        reasons.push(`⚠️ Injury concern (${(pattern.playProbability * 100).toFixed(0)}% play probability)`);
      } else if (pattern.expectedEfficiency < 0.85) {
        reasons.push(`May be limited if active (${(pattern.expectedEfficiency * 100).toFixed(0)}% expected efficiency)`);
      }
    }
    
    // 8. Floor/ceiling reasoning based on decision
    if (decision === 'start') {
      const floor = player.projection.floor;
      const ceiling = player.projection.ceiling;
      const median = player.projection.median;
      
      if (floor > median * 0.8) {
        reasons.push(`Safe floor (${floor.toFixed(1)} points minimum expected)`);
      }
      if (ceiling > median * 1.5) {
        reasons.push(`High ceiling potential (${ceiling.toFixed(1)} points possible)`);
      }
    }
    
    // 9. Position rank reasoning
    if (context.positionRank) {
      if (context.positionRank <= 12) {
        reasons.push(`Top-12 at position (#${context.positionRank} ranked)`);
      } else if (context.positionRank > 24 && decision === 'sit') {
        reasons.push(`Outside top-24 at position (#${context.positionRank} ranked)`);
      }
    }
    
    return reasons;
  }

  /**
   * Deduplicate similar reasons
   */
  private deduplicateReasons(reasons: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];
    
    for (const reason of reasons) {
      // Create a simplified key for deduplication
      const key = this.getReasonKey(reason);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(reason);
      }
    }
    
    // Sort by importance
    return this.sortReasonsByImportance(deduped);
  }

  /**
   * Get simplified key for reason deduplication
   */
  private getReasonKey(reason: string): string {
    // Extract the type of reason
    if (reason.includes('Projected')) return 'projection';
    if (reason.includes('matchup')) return 'matchup';
    if (reason.includes('scoring game')) return 'game-env';
    if (reason.includes('spread')) return 'spread';
    if (reason.includes('wind') || reason.includes('precipitation')) return 'weather';
    if (reason.includes('target share') || reason.includes('WOPR')) return 'usage';
    if (reason.includes('power rankings') || reason.includes('momentum')) return 'momentum';
    if (reason.includes('Injury')) return 'injury';
    if (reason.includes('floor') || reason.includes('ceiling')) return 'variance';
    if (reason.includes('ranked')) return 'rank';
    return reason;
  }

  /**
   * Sort reasons by importance
   */
  private sortReasonsByImportance(reasons: string[]): string[] {
    const priority: Record<string, number> = {
      'Injury': 1,
      'Projected': 2,
      'matchup': 3,
      'usage': 4,
      'game-env': 5,
      'momentum': 6,
      'weather': 7,
      'floor': 8,
      'rank': 9
    };
    
    return reasons.sort((a, b) => {
      const aPriority = Object.keys(priority).find(k => a.includes(k));
      const bPriority = Object.keys(priority).find(k => b.includes(k));
      
      const aScore = aPriority ? priority[aPriority] : 99;
      const bScore = bPriority ? priority[bPriority] : 99;
      
      return aScore - bScore;
    });
  }

  /**
   * Generate natural language summary
   */
  private generateSummary(
    player: Player,
    decision: 'start' | 'sit' | 'flex',
    reasons: string[],
    alternatives?: PlayerProjection[]
  ): string {
    const primaryReason = reasons[0] || 'Based on current projections';
    const secondaryReason = reasons[1] ? ` and ${reasons[1].toLowerCase()}` : '';
    
    switch (decision) {
      case 'start':
        return `Start ${player.name} with confidence. ${primaryReason}${secondaryReason}.`;
      
      case 'flex':
        const flexReason = reasons.find(r => r.includes('floor')) ? 
          'as a safe flex option' : 'as a high-upside flex play';
        return `${player.name} is a solid flex play. ${primaryReason}${secondaryReason}.`;
      
      case 'sit':
        if (alternatives && alternatives.length > 0) {
          const alt = alternatives[0].player.name;
          return `Sit ${player.name} this week. ${primaryReason}. Consider ${alt} instead.`;
        }
        return `${player.name} is risky this week. ${primaryReason}${secondaryReason}.`;
      
      default:
        return `${player.name}: ${primaryReason}`;
    }
  }

  /**
   * Assess data quality for transparency
   */
  private assessDataQuality(
    player: PlayerProjection,
    context: any
  ): string {
    const factors: string[] = [];
    
    if (player.projection.dataQuality > 0.8) {
      factors.push('High-quality data');
    } else if (player.projection.dataQuality > 0.6) {
      factors.push('Good data availability');
    } else {
      factors.push('Limited data');
    }
    
    if (context.practicePattern && context.practicePattern.confidence < 0.5) {
      factors.push('incomplete practice info');
    }
    
    if (player.weather && player.weather.forecastConfidence < 0.7) {
      factors.push('weather forecast uncertain');
    }
    
    if (!context.usageMetrics || !context.powerRanking) {
      factors.push('missing recent trends');
    }
    
    return factors.join(', ');
  }

  /**
   * Compare two players and explain the preference
   */
  comparePlayersExplanation(
    player1: PlayerProjection,
    player2: PlayerProjection,
    preference: 'player1' | 'player2' | 'tossup'
  ): {
    summary: string;
    advantages: { player1: string[]; player2: string[] };
    recommendation: string;
  } {
    const advantages = {
      player1: this.getPlayerAdvantages(player1, player2),
      player2: this.getPlayerAdvantages(player2, player1)
    };
    
    let summary: string;
    let recommendation: string;
    
    if (preference === 'player1') {
      summary = `${player1.player.name} is the better play over ${player2.player.name} this week.`;
      recommendation = `Start ${player1.player.name} with confidence.`;
    } else if (preference === 'player2') {
      summary = `${player2.player.name} edges out ${player1.player.name} for this week.`;
      recommendation = `Go with ${player2.player.name} for higher upside.`;
    } else {
      summary = `${player1.player.name} and ${player2.player.name} project similarly this week.`;
      recommendation = 'Either player is a reasonable choice. Consider your risk tolerance.';
    }
    
    return {
      summary,
      advantages,
      recommendation
    };
  }

  /**
   * Get advantages of one player over another
   */
  private getPlayerAdvantages(
    player: PlayerProjection,
    opponent: PlayerProjection
  ): string[] {
    const advantages: string[] = [];
    
    // Projection advantage
    if (player.projection.median > opponent.projection.median + 1) {
      const diff = player.projection.median - opponent.projection.median;
      advantages.push(`+${diff.toFixed(1)} projected points`);
    }
    
    // Matchup advantage
    if (player.projection.matchupAdjustment > opponent.projection.matchupAdjustment + 0.05) {
      advantages.push('Better matchup');
    }
    
    // Game environment advantage
    const playerTotal = player.isHome ? 
      player.gameInfo.homeImpliedTotal : 
      player.gameInfo.awayImpliedTotal;
    const oppTotal = opponent.isHome ? 
      opponent.gameInfo.homeImpliedTotal : 
      opponent.gameInfo.awayImpliedTotal;
    
    if (playerTotal > oppTotal + 3) {
      advantages.push(`Higher implied total (${playerTotal.toFixed(1)} vs ${oppTotal.toFixed(1)})`);
    }
    
    // Floor advantage
    if (player.projection.floor > opponent.projection.floor + 2) {
      advantages.push('Safer floor');
    }
    
    // Ceiling advantage
    if (player.projection.ceiling > opponent.projection.ceiling + 3) {
      advantages.push('Higher ceiling');
    }
    
    // Health advantage
    if (player.practiceStatus?.playProbability > 
        (opponent.practiceStatus?.playProbability || 1) + 0.1) {
      advantages.push('Healthier');
    }
    
    return advantages;
  }

  /**
   * Generate lineup-wide insights
   */
  generateLineupInsights(
    lineup: PlayerProjection[],
    benchPlayers: PlayerProjection[]
  ): string[] {
    const insights: string[] = [];
    
    // Overall projection
    const totalProjected = lineup.reduce((sum, p) => sum + p.projection.median, 0);
    insights.push(`Projected team total: ${totalProjected.toFixed(1)} points`);
    
    // Risk assessment
    const avgConfidence = lineup.reduce((sum, p) => sum + p.projection.confidence, 0) / lineup.length;
    if (avgConfidence > 0.7) {
      insights.push('High-confidence lineup with reliable projections');
    } else if (avgConfidence < 0.5) {
      insights.push('⚠️ Several players with uncertain projections');
    }
    
    // Correlation risk
    const sameGameStacks = this.findSameGameStacks(lineup);
    if (sameGameStacks.length > 0) {
      insights.push(`Correlated players from ${sameGameStacks.join(', ')} games`);
    }
    
    // Injury risk
    const injuryRisks = lineup.filter(p => 
      p.practiceStatus && p.practiceStatus.playProbability < 0.8
    );
    if (injuryRisks.length > 0) {
      insights.push(`⚠️ ${injuryRisks.length} players with injury concerns`);
    }
    
    // Weather impacts
    const weatherImpacted = lineup.filter(p => 
      p.weather && !p.weather.isDome && p.weather.windSpeed >= 15
    );
    if (weatherImpacted.length > 0) {
      insights.push(`${weatherImpacted.length} players in poor weather conditions`);
    }
    
    // Bench strength
    const strongBench = benchPlayers.filter(p => p.projection.median > 10);
    if (strongBench.length >= 2) {
      insights.push('Strong bench depth for pivots if needed');
    }
    
    return insights;
  }

  /**
   * Find same-game stacks in lineup
   */
  private findSameGameStacks(lineup: PlayerProjection[]): string[] {
    const gameGroups = new Map<string, number>();
    
    for (const player of lineup) {
      if (player.gameInfo) {
        const gameKey = `${player.gameInfo.homeTeam}@${player.gameInfo.awayTeam}`;
        gameGroups.set(gameKey, (gameGroups.get(gameKey) || 0) + 1);
      }
    }
    
    const stacks: string[] = [];
    for (const [game, count] of gameGroups.entries()) {
      if (count >= 2) {
        stacks.push(game);
      }
    }
    
    return stacks;
  }
}