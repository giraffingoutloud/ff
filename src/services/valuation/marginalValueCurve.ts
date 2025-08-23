/**
 * Marginal Value Curve
 * Converts VORP (Value Over Replacement Player) to dollar values
 * Uses exponential curves to reflect that elite players are worth exponentially more
 */

import { Position } from '../../types';
import { LeagueSettings } from './leagueSettings';

export interface CurveParameters {
  base: number;      // Base multiplier
  exponent: number;  // Exponential factor (higher = steeper curve)
  scale: number;     // Scaling factor for VORP
}

export class MarginalValueCurve {
  private leagueSettings: LeagueSettings;
  private totalLeagueBudget: number;
  
  constructor(leagueSettings: LeagueSettings) {
    this.leagueSettings = leagueSettings;
    this.totalLeagueBudget = leagueSettings.numTeams * leagueSettings.budget;
  }

  /**
   * Convert VORP to dollar value using non-linear position-specific curves
   */
  vorpToDollars(vorp: number, position: Position): number {
    if (vorp <= 0) return 0;
    
    const curve = this.getPositionCurve(position);
    
    // NON-LINEAR conversion captures exponential value of elite players
    // value = base + (vorp/scale)^exponent * scale
    // For exponent > 1.0, this creates increasing returns for higher VORP
    const normalizedVorp = vorp / curve.scale;
    const rawValue = curve.base + Math.pow(normalizedVorp, curve.exponent) * curve.scale;
    
    // Apply position-specific adjustments (lighter touch with natural curve dampening)
    const adjustedValue = this.applyPositionAdjustments(rawValue, position);
    
    return Math.max(0, adjustedValue);
  }

  /**
   * Get position-specific curve parameters
   * Non-linear curves capture exponential value of elite players
   */
  private getPositionCurve(position: Position): CurveParameters {
    // NON-LINEAR curves - elite players provide exponential value
    const curves: Record<Position, CurveParameters> = {
      QB: {
        base: 15,
        exponent: 1.1,   // Slight curve - elite QBs matter but position is deep
        scale: 100       // $15 per 100 VORP at base
      },
      RB: {
        base: 18,
        exponent: 1.25,  // Strong curve - elite RBs are league-winners
        scale: 80        // $18 per 80 VORP at base
      },
      WR: {
        base: 19,
        exponent: 1.15,  // Moderate curve - depth exists but elite WRs dominate
        scale: 72        // $19 per 72 VORP at base
      },
      TE: {
        base: 14,
        exponent: 1.3,   // Steepest curve - massive tier cliff at TE
        scale: 60        // $14 per 60 VORP at base
      },
      K: {
        base: 2,
        exponent: 1.0,   // Linear - kickers truly fungible
        scale: 20        // $2 per 20 VORP
      },
      DST: {
        base: 3,
        exponent: 1.05,  // Nearly linear - mostly streamable
        scale: 25        // $3 per 25 VORP at base
      }
    };
    
    // Adjust curves for league settings
    const baseCurve = curves[position];
    
    // SuperFlex adjustment - increase QB value and curve
    if (this.leagueSettings.isSuperFlex && position === 'QB') {
      return {
        ...baseCurve,
        base: baseCurve.base * 1.4,
        exponent: Math.min(1.3, baseCurve.exponent * 1.15) // More curve in SF
      };
    }
    
    // TE Premium adjustment
    if (this.leagueSettings.isTEPremium && position === 'TE') {
      return {
        ...baseCurve,
        base: baseCurve.base * 1.3,
        exponent: Math.max(1.2, baseCurve.exponent * 0.92) // Slightly flatter in TEP, more TEs viable
      };
    }
    
    return baseCurve;
  }

  /**
   * Apply position-specific value adjustments
   * Natural curve dampening from exponents replaces arbitrary soft caps
   */
  private applyPositionAdjustments(rawValue: number, position: Position): number {
    let value = rawValue;
    
    // Reality check based on historical auction data
    const budgetPerTeam = this.leagueSettings.budget;
    
    // Maximum realistic percentages from historical data
    // These are safety limits for extreme outliers only
    const maxRealistic: Record<Position, number> = {
      QB: this.leagueSettings.isSuperFlex ? 0.40 : 0.30,  // Elite QBs: 25-30% (40% SF)
      RB: 0.50,  // CMC has gone for 35-40% of budget, allow up to 50% for true outliers
      WR: 0.45,  // Jefferson/Chase can approach 35-40%
      TE: this.leagueSettings.isTEPremium ? 0.40 : 0.35,  // Kelce: 25-35%
      K: 0.03,   // Never more than 3%
      DST: 0.04  // Never more than 4%
    };
    
    const maxValue = budgetPerTeam * maxRealistic[position];
    
    // Only apply dampening at extreme values
    // The non-linear curve already provides natural diminishing returns
    if (value > maxValue) {
      // More gradual dampening - allow values to exceed soft max significantly
      const excess = value - maxValue;
      const dampingFactor = 50; // Increased to allow more excess value through
      const dampened = Math.sqrt(excess * dampingFactor); // Square root dampening instead of tanh
      value = maxValue + dampened;
    }
    
    return Math.max(0, value);
  }

  /**
   * Calculate the distribution of values across all positions
   * Used for normalizing to league budget
   */
  calculateValueDistribution(vorpValues: Map<string, number>): {
    total: number;
    byPosition: Record<Position, number>;
    topHeavy: boolean;
  } {
    let total = 0;
    const byPosition: Record<Position, number> = {
      QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0
    };
    
    vorpValues.forEach((vorp, playerId) => {
      // We'd need player position info here
      // For now, this is a placeholder
      const dollarValue = this.vorpToDollars(vorp, 'RB'); // Placeholder
      total += dollarValue;
    });
    
    // Check if distribution is top-heavy (top 20% have >50% of value)
    const sortedValues = Array.from(vorpValues.values()).sort((a, b) => b - a);
    const top20Count = Math.floor(sortedValues.length * 0.2);
    const top20Sum = sortedValues.slice(0, top20Count).reduce((sum, v) => sum + v, 0);
    const topHeavy = top20Sum > total * 0.5;
    
    return { total, byPosition, topHeavy };
  }

  /**
   * Get the inverse curve - dollars to expected VORP
   * Useful for setting expectations
   */
  dollarsToVorp(dollars: number, position: Position): number {
    const curve = this.getPositionCurve(position);
    
    if (dollars <= 0) return 0;
    
    // Inverse of LINEAR: value = base * (vorp / scale)
    // vorp = scale * (value / base)
    const vorp = curve.scale * (dollars / curve.base);
    
    return vorp;
  }

  /**
   * Calculate what percentile a VORP value represents
   */
  getVorpPercentile(vorp: number, position: Position, allVorps: number[]): number {
    const sorted = [...allVorps].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= vorp);
    
    if (index === -1) return 100; // Higher than all
    return (index / sorted.length) * 100;
  }

  /**
   * Adjust curve parameters based on market conditions
   * This allows for inflation/deflation adjustments
   */
  adjustForMarketConditions(inflationRate: number): void {
    // Inflation > 1 means prices are higher than expected
    // Adjust base values proportionally
    // This would modify the curves temporarily for current market
  }

  /**
   * Get recommended bid ranges based on VORP tiers
   */
  getValueTiers(position: Position): {
    elite: { minVorp: number; dollarRange: [number, number] };
    starter: { minVorp: number; dollarRange: [number, number] };
    bench: { minVorp: number; dollarRange: [number, number] };
  } {
    const curve = this.getPositionCurve(position);
    
    // Define VORP thresholds for tiers (position-specific)
    const thresholds = {
      QB: { elite: 120, starter: 60, bench: 20 },
      RB: { elite: 100, starter: 50, bench: 15 },
      WR: { elite: 90, starter: 45, bench: 15 },
      TE: { elite: 70, starter: 30, bench: 10 },
      K: { elite: 15, starter: 8, bench: 3 },
      DST: { elite: 20, starter: 10, bench: 5 }
    };
    
    const posThresholds = thresholds[position];
    
    return {
      elite: {
        minVorp: posThresholds.elite,
        dollarRange: [
          this.vorpToDollars(posThresholds.elite, position),
          this.vorpToDollars(posThresholds.elite * 1.5, position)
        ]
      },
      starter: {
        minVorp: posThresholds.starter,
        dollarRange: [
          this.vorpToDollars(posThresholds.starter, position),
          this.vorpToDollars(posThresholds.elite * 0.9, position)
        ]
      },
      bench: {
        minVorp: posThresholds.bench,
        dollarRange: [
          this.vorpToDollars(posThresholds.bench, position),
          this.vorpToDollars(posThresholds.starter * 0.9, position)
        ]
      }
    };
  }
}