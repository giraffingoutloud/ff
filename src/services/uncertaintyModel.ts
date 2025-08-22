/**
 * Uncertainty Modeling for Fantasy Predictions
 * Provides prediction intervals and confidence levels
 */

import { Player, PlayerEvaluation } from '../types';
import * as actualData2024 from '../data/actuals/2024.json';

interface PredictionInterval {
  lower: number;
  median: number;
  upper: number;
  confidence: number;
}

interface UncertaintyFactors {
  injuryRisk: number;
  ageVariance: number;
  experienceVariance: number;
  teamSituationVolatility: number;
  historicalConsistency: number;
  projectionConfidence: number;
}

interface PlayerUncertainty {
  player: Player;
  pointEstimate: number;
  predictionInterval: PredictionInterval;
  uncertaintyFactors: UncertaintyFactors;
  volatilityScore: number;
  floorScore: number;
  ceilingScore: number;
  bustProbability: number;
  boomProbability: number;
}

export class UncertaintyModel {
  private historicalVariance: Map<string, number>;
  private positionVolatility: Map<string, number>;

  constructor() {
    this.historicalVariance = new Map();
    this.positionVolatility = new Map([
      ['QB', 0.15],  // 15% standard deviation
      ['RB', 0.25],  // 25% - high variance
      ['WR', 0.22],  // 22% - moderate-high variance
      ['TE', 0.28],  // 28% - highest variance
      ['K', 0.30],   // 30% - very high variance
      ['DST', 0.35]  // 35% - extremely high variance
    ]);
    
    this.loadHistoricalVariance();
  }

  /**
   * Load historical variance from actual data
   */
  private loadHistoricalVariance(): void {
    if (actualData2024 && actualData2024.players) {
      Object.entries(actualData2024.players).forEach(([playerId, data]) => {
        // Calculate variance based on games played vs expected
        const gamesPlayed = data.gamesPlayed || 17;
        const variance = (17 - gamesPlayed) / 17 * 0.3; // 30% max variance
        this.historicalVariance.set(playerId, variance);
      });
    }
  }

  /**
   * Calculate uncertainty for a player
   */
  calculateUncertainty(player: Player, evaluation?: PlayerEvaluation): PlayerUncertainty {
    const uncertaintyFactors = this.calculateUncertaintyFactors(player);
    const volatilityScore = this.calculateVolatility(player, uncertaintyFactors);
    const pointEstimate = evaluation?.cvsScore || player.projectedPoints;
    
    // Calculate prediction interval using quantile regression approximation
    const predictionInterval = this.calculatePredictionInterval(
      pointEstimate,
      volatilityScore,
      player.position
    );
    
    // Calculate floor and ceiling
    const floorScore = this.calculateFloor(player, predictionInterval);
    const ceilingScore = this.calculateCeiling(player, predictionInterval);
    
    // Calculate boom/bust probabilities
    const bustProbability = this.calculateBustProbability(player, uncertaintyFactors);
    const boomProbability = this.calculateBoomProbability(player, uncertaintyFactors);
    
    return {
      player,
      pointEstimate,
      predictionInterval,
      uncertaintyFactors,
      volatilityScore,
      floorScore,
      ceilingScore,
      bustProbability,
      boomProbability
    };
  }

  /**
   * Calculate uncertainty factors
   */
  private calculateUncertaintyFactors(player: Player): UncertaintyFactors {
    return {
      injuryRisk: this.calculateInjuryRisk(player),
      ageVariance: this.calculateAgeVariance(player),
      experienceVariance: this.calculateExperienceVariance(player),
      teamSituationVolatility: this.calculateTeamVolatility(player),
      historicalConsistency: this.calculateHistoricalConsistency(player),
      projectionConfidence: this.calculateProjectionConfidence(player)
    };
  }

  /**
   * Calculate injury risk factor
   */
  private calculateInjuryRisk(player: Player): number {
    let risk = 0;
    
    // Current injury status
    switch (player.injuryStatus) {
      case 'Healthy': risk = 0.1; break;
      case 'Questionable': risk = 0.3; break;
      case 'Doubtful': risk = 0.5; break;
      case 'Out': risk = 0.8; break;
      case 'IR': risk = 1.0; break;
      default: risk = 0.1;
    }
    
    // Age-based injury risk
    if (player.position === 'RB' && player.age >= 28) {
      risk += 0.3;
    } else if (player.age >= 32) {
      risk += 0.2;
    }
    
    // Historical injury variance
    const historicalVar = this.historicalVariance.get(
      this.normalizePlayerId(player.name)
    );
    if (historicalVar) {
      risk += historicalVar;
    }
    
    return Math.min(1, risk);
  }

  /**
   * Calculate age-based variance
   */
  private calculateAgeVariance(player: Player): number {
    let variance = 0;
    
    // Young players have higher variance
    if (player.age <= 23) {
      variance = 0.3;
    } else if (player.age <= 25) {
      variance = 0.2;
    } else if (player.age <= 28) {
      variance = 0.1;
    } else if (player.age <= 31) {
      variance = 0.15;
    } else {
      variance = 0.25; // Older players more unpredictable
    }
    
    // Position-specific adjustments
    if (player.position === 'RB' && player.age >= 28) {
      variance += 0.2; // RB cliff adds uncertainty
    }
    
    return variance;
  }

  /**
   * Calculate experience-based variance
   */
  private calculateExperienceVariance(player: Player): number {
    if (player.experience === 1) {
      return 0.35; // Rookies highly uncertain
    } else if (player.experience === 2) {
      return 0.25; // Sophomores still variable
    } else if (player.experience <= 5) {
      return 0.15; // Establishing patterns
    } else if (player.experience <= 8) {
      return 0.10; // Prime consistency
    } else {
      return 0.20; // Veterans can decline suddenly
    }
  }

  /**
   * Calculate team situation volatility
   */
  private calculateTeamVolatility(player: Player): number {
    let volatility = 0.15; // Base volatility
    
    // Bad teams have more variance
    const badTeams = ['CAR', 'ARI', 'WAS', 'NYG'];
    const goodTeams = ['KC', 'BUF', 'SF', 'PHI'];
    
    if (badTeams.includes(player.team)) {
      volatility += 0.15;
    } else if (goodTeams.includes(player.team)) {
      volatility -= 0.05;
    }
    
    return volatility;
  }

  /**
   * Calculate historical consistency
   */
  private calculateHistoricalConsistency(player: Player): number {
    // In production, would use week-by-week data
    // For now, use position-based estimates
    const consistency = {
      'QB': 0.75,
      'RB': 0.60,
      'WR': 0.65,
      'TE': 0.55,
      'K': 0.45,
      'DST': 0.40
    };
    
    return consistency[player.position] || 0.5;
  }

  /**
   * Calculate projection confidence
   */
  private calculateProjectionConfidence(player: Player): number {
    let confidence = 0.7; // Base confidence
    
    // Elite players more predictable
    if (player.adp <= 10) {
      confidence += 0.15;
    } else if (player.adp <= 30) {
      confidence += 0.10;
    } else if (player.adp >= 100) {
      confidence -= 0.15;
    }
    
    // Established players more predictable
    if (player.experience >= 3 && player.experience <= 8) {
      confidence += 0.10;
    }
    
    return Math.min(0.95, confidence);
  }

  /**
   * Calculate overall volatility
   */
  private calculateVolatility(player: Player, factors: UncertaintyFactors): number {
    const weights = {
      injuryRisk: 0.25,
      ageVariance: 0.15,
      experienceVariance: 0.15,
      teamSituationVolatility: 0.15,
      historicalConsistency: -0.20, // Negative because high consistency reduces volatility
      projectionConfidence: -0.10   // Negative because high confidence reduces volatility
    };
    
    let volatility = 0;
    Object.entries(weights).forEach(([key, weight]) => {
      volatility += factors[key as keyof UncertaintyFactors] * weight;
    });
    
    // Add position-based volatility
    volatility += this.positionVolatility.get(player.position) || 0.2;
    
    return Math.max(0.1, Math.min(0.5, volatility));
  }

  /**
   * Calculate prediction interval using quantile regression
   */
  private calculatePredictionInterval(
    pointEstimate: number,
    volatility: number,
    position: string
  ): PredictionInterval {
    // Use position-specific standard deviation
    const stdDev = pointEstimate * (this.positionVolatility.get(position) || 0.2);
    
    // Adjust for overall volatility
    const adjustedStdDev = stdDev * (1 + volatility);
    
    // Calculate intervals (68-95-99.7 rule approximation)
    const confidence = 0.90; // 90% confidence interval
    const zScore = 1.645; // 90% confidence z-score
    
    return {
      lower: Math.max(0, pointEstimate - zScore * adjustedStdDev),
      median: pointEstimate,
      upper: pointEstimate + zScore * adjustedStdDev,
      confidence
    };
  }

  /**
   * Calculate floor (25th percentile outcome)
   */
  private calculateFloor(player: Player, interval: PredictionInterval): number {
    // Floor is roughly 25th percentile
    const floor = interval.median - (interval.median - interval.lower) * 0.5;
    
    // Adjust for player type
    if (player.adp <= 20) {
      // Elite players have higher floors
      return floor * 1.1;
    } else if (player.experience === 1) {
      // Rookies have lower floors
      return floor * 0.85;
    }
    
    return floor;
  }

  /**
   * Calculate ceiling (75th percentile outcome)
   */
  private calculateCeiling(player: Player, interval: PredictionInterval): number {
    // Ceiling is roughly 75th percentile
    const ceiling = interval.median + (interval.upper - interval.median) * 0.5;
    
    // Adjust for player type
    if (player.age <= 25 && player.experience <= 3) {
      // Young players have higher ceilings
      return ceiling * 1.15;
    } else if (player.age >= 32) {
      // Older players have lower ceilings
      return ceiling * 0.9;
    }
    
    return ceiling;
  }

  /**
   * Calculate bust probability
   */
  private calculateBustProbability(player: Player, factors: UncertaintyFactors): number {
    let bustProb = 0.2; // Base 20% bust rate
    
    // Injury risk increases bust probability
    bustProb += factors.injuryRisk * 0.3;
    
    // Age factors
    if (player.position === 'RB' && player.age >= 28) {
      bustProb += 0.25;
    } else if (player.age >= 33) {
      bustProb += 0.15;
    }
    
    // Experience factors
    if (player.experience === 1) {
      bustProb += 0.15; // Rookie risk
    }
    
    // ADP factors (high picks bust less often)
    if (player.adp <= 10) {
      bustProb *= 0.6;
    } else if (player.adp >= 100) {
      bustProb *= 1.3;
    }
    
    return Math.min(0.8, bustProb);
  }

  /**
   * Calculate boom probability
   */
  private calculateBoomProbability(player: Player, factors: UncertaintyFactors): number {
    let boomProb = 0.25; // Base 25% boom rate
    
    // Youth increases boom probability
    if (player.age <= 25) {
      boomProb += 0.15;
    }
    
    // Sophomore leap
    if (player.experience === 2) {
      boomProb += 0.20;
    }
    
    // Elite talent
    if (player.adp <= 20) {
      boomProb += 0.15;
    }
    
    // Good team situation
    const eliteTeams = ['KC', 'BUF', 'SF', 'PHI', 'DAL'];
    if (eliteTeams.includes(player.team)) {
      boomProb += 0.10;
    }
    
    // Reduce for injury risk
    boomProb -= factors.injuryRisk * 0.2;
    
    return Math.max(0.05, Math.min(0.6, boomProb));
  }

  /**
   * Normalize player ID
   */
  private normalizePlayerId(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Generate uncertainty report
   */
  generateReport(players: Player[]): string {
    let report = '=== UNCERTAINTY ANALYSIS REPORT ===\n\n';
    
    const uncertainties = players.map(p => this.calculateUncertainty(p));
    
    // Most volatile players
    report += '--- HIGHEST VOLATILITY (RISKY) ---\n';
    uncertainties
      .sort((a, b) => b.volatilityScore - a.volatilityScore)
      .slice(0, 10)
      .forEach((u, i) => {
        report += `${i + 1}. ${u.player.name} (${u.player.position}): `;
        report += `${(u.volatilityScore * 100).toFixed(0)}% volatility\n`;
        report += `   Range: ${u.predictionInterval.lower.toFixed(0)}-${u.predictionInterval.upper.toFixed(0)}\n`;
        report += `   Bust risk: ${(u.bustProbability * 100).toFixed(0)}%\n`;
      });
    
    report += '\n--- LOWEST VOLATILITY (SAFE) ---\n';
    uncertainties
      .sort((a, b) => a.volatilityScore - b.volatilityScore)
      .slice(0, 10)
      .forEach((u, i) => {
        report += `${i + 1}. ${u.player.name} (${u.player.position}): `;
        report += `${(u.volatilityScore * 100).toFixed(0)}% volatility\n`;
        report += `   Floor: ${u.floorScore.toFixed(0)}, Ceiling: ${u.ceilingScore.toFixed(0)}\n`;
      });
    
    report += '\n--- BOOM CANDIDATES ---\n';
    uncertainties
      .sort((a, b) => b.boomProbability - a.boomProbability)
      .slice(0, 10)
      .forEach((u, i) => {
        report += `${i + 1}. ${u.player.name} (${u.player.position}): `;
        report += `${(u.boomProbability * 100).toFixed(0)}% boom chance\n`;
        report += `   Ceiling: ${u.ceilingScore.toFixed(0)} points\n`;
      });
    
    return report;
  }
}

export const uncertaintyModel = new UncertaintyModel();