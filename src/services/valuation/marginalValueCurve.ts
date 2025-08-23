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
   * Convert VORP to dollar value using position-specific curves
   */
  vorpToDollars(vorp: number, position: Position): number {
    if (vorp <= 0) return 0;
    
    const curve = this.getPositionCurve(position);
    
    // LINEAR conversion to avoid double-counting scarcity
    // Scarcity is already baked into VORP via replacement level
    // value = base * (vorp / scale)
    const rawValue = curve.base * (vorp / curve.scale);
    
    // Apply position-specific adjustments
    const adjustedValue = this.applyPositionAdjustments(rawValue, position);
    
    return Math.max(0, adjustedValue);
  }

  /**
   * Get position-specific curve parameters
   * These create different value distributions by position
   */
  private getPositionCurve(position: Position): CurveParameters {
    // LINEAR curves (no exponent) - scarcity already in VORP
    const curves: Record<Position, CurveParameters> = {
      QB: {
        base: 15,
        exponent: 1.0,  // LINEAR - no exponential
        scale: 100      // $15 per 100 VORP
      },
      RB: {
        base: 18,
        exponent: 1.0,  // LINEAR
        scale: 80       // $18 per 80 VORP
      },
      WR: {
        base: 19,       // FURTHER INCREASED for higher elite values
        exponent: 1.0,  // LINEAR
        scale: 72       // FURTHER DECREASED for steeper slope ($19 per 72 VORP)
      },
      TE: {
        base: 14,
        exponent: 1.0,  // LINEAR
        scale: 60       // $14 per 60 VORP
      },
      K: {
        base: 2,
        exponent: 1.0,  // LINEAR
        scale: 20       // $2 per 20 VORP
      },
      DST: {
        base: 3,
        exponent: 1.0,  // LINEAR
        scale: 25       // $3 per 25 VORP
      }
    };
    
    // Adjust curves for league settings
    const baseCurve = curves[position];
    
    // SuperFlex adjustment - increase QB value
    if (this.leagueSettings.isSuperFlex && position === 'QB') {
      return {
        ...baseCurve,
        base: baseCurve.base * 1.4,
        exponent: baseCurve.exponent * 1.1
      };
    }
    
    // TE Premium adjustment
    if (this.leagueSettings.isTEPremium && position === 'TE') {
      return {
        ...baseCurve,
        base: baseCurve.base * 1.3,
        exponent: baseCurve.exponent * 0.95 // Slightly flatter, more TEs valuable
      };
    }
    
    return baseCurve;
  }

  /**
   * Apply position-specific value adjustments
   * Uses soft caps that scale with league settings
   */
  private applyPositionAdjustments(rawValue: number, position: Position): number {
    let value = rawValue;
    
    // Soft caps that scale with league settings
    const budgetPerTeam = this.leagueSettings.budget;
    
    // Base cap percentages of team budget
    const baseCaps: Record<Position, number> = {
      QB: this.leagueSettings.isSuperFlex ? 0.30 : 0.20,  // 30% SF, 20% normal
      RB: 0.35,  // 35% of budget max
      WR: 0.34,  // INCREASED to 34% for elite WRs
      TE: this.leagueSettings.isTEPremium ? 0.28 : 0.22,  // 28% TEP, 22% normal
      K: 0.015,  // 1.5% of budget
      DST: 0.025 // 2.5% of budget
    };
    
    const softCap = budgetPerTeam * baseCaps[position];
    
    // Apply soft cap with diminishing returns rather than hard cutoff
    if (value > softCap) {
      // Logarithmic dampening past the cap
      const excess = value - softCap;
      const dampened = Math.log(1 + excess) * 5; // Diminishing returns
      value = softCap + dampened;
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