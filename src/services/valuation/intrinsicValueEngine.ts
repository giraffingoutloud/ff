/**
 * Intrinsic Value Engine
 * Calculates pure player value based on projections and league context
 * Completely independent of market sentiment (no ADP/AAV)
 */

import { Player, Position } from '../../types';
import { ReplacementLevelCalculator } from './replacementLevelCalculator';
import { MarginalValueCurve } from './marginalValueCurve';
import { LeagueSettings, defaultLeagueSettings } from './leagueSettings';

export interface IntrinsicValue {
  player: Player;
  projectedPoints: number;
  replacementLevel: number;
  vorp: number;                // Value Over Replacement Player
  rawDollarValue: number;       // Before constraints
  constrainedValue: number;     // After budget normalization
  percentOfBudget: number;      // As % of team budget
  positionRank: number;         // Rank within position
  overallRank: number;          // Rank across all positions
  tier: 'elite' | 'starter' | 'bench' | 'waiver';
}

export interface ValueDistribution {
  mean: number;
  median: number;
  stdev: number;
  topTierThreshold: number;
  valueTierThreshold: number;
  budgetCheck: boolean;  // True if sum equals league budget
}

export class IntrinsicValueEngine {
  private replacementCalculator: ReplacementLevelCalculator;
  private marginalCurve: MarginalValueCurve;
  private leagueSettings: LeagueSettings;
  private cachedValues: Map<string, IntrinsicValue> = new Map();

  constructor(leagueSettings: LeagueSettings = defaultLeagueSettings) {
    this.leagueSettings = leagueSettings;
    this.replacementCalculator = new ReplacementLevelCalculator(leagueSettings);
    this.marginalCurve = new MarginalValueCurve(leagueSettings);
  }

  /**
   * Calculate intrinsic value for a single player
   * Based purely on projected points and league context
   */
  calculateValue(player: Player, allPlayers: Player[]): IntrinsicValue {
    // Missing data fallbacks
    const projectedPoints = this.getProjectedPointsWithFallback(player);
    
    // Get replacement level for position
    const replacementLevel = this.replacementCalculator.getReplacementLevel(
      player.position,
      allPlayers
    );

    // Calculate VORP (Value Over Replacement Player)
    const vorp = Math.max(0, projectedPoints - replacementLevel);

    // Apply marginal value curve to convert VORP to dollars
    const rawDollarValue = this.marginalCurve.vorpToDollars(vorp, player.position);

    // These will be updated after normalization
    let constrainedValue = rawDollarValue;
    let percentOfBudget = (constrainedValue / this.leagueSettings.budget) * 100;

    // Calculate ranks
    const positionRank = this.calculatePositionRank(player, allPlayers);
    const overallRank = this.calculateOverallRank(player, allPlayers);
    
    // Determine tier
    const tier = this.determineTier(vorp, player.position, allPlayers);

    return {
      player,
      projectedPoints,
      replacementLevel,
      vorp,
      rawDollarValue,
      constrainedValue,
      percentOfBudget,
      positionRank,
      overallRank,
      tier
    };
  }

  /**
   * Calculate values for all players with budget normalization
   * Ensures sum equals total league budget
   */
  calculateAllValues(players: Player[]): IntrinsicValue[] {
    // Clear cache for fresh calculation
    this.cachedValues.clear();

    // First pass: calculate raw values
    const rawValues = players.map(player => this.calculateValue(player, players));

    // Apply bench discounts BEFORE sorting
    const discountedValues = this.applyBenchDiscounts(rawValues, players);

    // Sort by discounted raw value descending
    discountedValues.sort((a, b) => b.rawDollarValue - a.rawDollarValue);

    // Normalize ONLY the draftable pool
    const normalizedValues = this.normalizeToLeagueBudget(discountedValues);

    // Cache the results
    normalizedValues.forEach(value => {
      const cacheKey = `${value.player.id}-${value.player.projectedPoints}`;
      this.cachedValues.set(cacheKey, value);
    });

    return normalizedValues;
  }

  /**
   * Apply bench discounts based on position and starter status
   */
  private applyBenchDiscounts(values: IntrinsicValue[], allPlayers: Player[]): IntrinsicValue[] {
    // Calculate starter cutoffs
    const starterCutoffs = this.calculateStarterCutoffs(values);
    
    return values.map(value => {
      const isBench = this.isBenchPlayer(value, starterCutoffs);
      
      // Position-specific bench discounts
      const benchDiscounts: Record<Position, number> = {
        QB: 0.35,   // QB bench rarely starts
        RB: 0.70,   // RB bench has high injury/start likelihood
        WR: 0.55,   // WR bench moderate start likelihood
        TE: 0.50,   // TE bench occasional starts
        K: 0.20,    // K bench almost never needed
        DST: 0.20   // DST bench rarely needed
      };
      
      const discount = isBench ? benchDiscounts[value.player.position] || 0.5 : 1.0;
      
      return {
        ...value,
        rawDollarValue: value.rawDollarValue * discount,
        tier: isBench && value.tier === 'starter' ? 'bench' as const : value.tier
      };
    });
  }

  /**
   * Normalize values so sum equals total league budget
   * Uses iterative water-filling algorithm to handle $1 floors properly
   */
  private normalizeToLeagueBudget(values: IntrinsicValue[]): IntrinsicValue[] {
    const totalBudget = this.leagueSettings.numTeams * this.leagueSettings.budget;
    const draftableCount = this.leagueSettings.numTeams * this.leagueSettings.rosterSize;

    // CRITICAL: Only normalize the draftable pool
    const draftablePlayers = values.slice(0, draftableCount);
    const undraftablePlayers = values.slice(draftableCount);

    // WATER-FILLING ALGORITHM with explicit terms
    // F = forced-to-$1 players, S = scalable players (raw > 1)
    let F = new Set<number>();  // Indices of players forced to $1
    let iteration = 0;
    const maxIterations = 10;
    
    while (iteration < maxIterations) {
      iteration++;
      
      // Calculate sets
      let S_indices: number[] = [];  // Scalable players
      let sumExcess = 0;  // Sum of (raw - 1) for scalable players
      
      draftablePlayers.forEach((value, idx) => {
        if (!F.has(idx) && value.rawDollarValue > 1) {
          S_indices.push(idx);
          sumExcess += value.rawDollarValue - 1;
        }
      });
      
      const S = S_indices.length;  // Count of scalable players
      
      if (S === 0) break; // All players at $1
      
      // Water-filling formula: s = (Budget - N) / Σ(raw_i - 1)
      // where N = |F| + |S| = total players needing at least $1
      const N = F.size + S;
      const scaleFactor = (totalBudget - N) / sumExcess;
      
      // Apply scaling and check for new $1 players
      let newOnes = false;
      const tempValues = draftablePlayers.map((value, idx) => {
        if (F.has(idx)) {
          return 1;
        }
        
        // val_i = 1 + s*(raw_i - 1) for scalable players
        const scaledValue = 1 + (value.rawDollarValue - 1) * scaleFactor;
        
        if (scaledValue <= 1) {
          F.add(idx);
          newOnes = true;
          return 1;
        }
        
        return scaledValue;
      });
      
      if (!newOnes) {
        // Converged - apply exact rounding to match budget exactly
        // Keep fractional values internally
        const fractionalValues = draftablePlayers.map((value, idx) => ({
          index: idx,
          value: value,
          fractional: tempValues[idx],
          integer: Math.floor(tempValues[idx]),
          remainder: tempValues[idx] - Math.floor(tempValues[idx])
        }));
        
        // Sum integer parts
        let integerSum = fractionalValues.reduce((sum, v) => sum + v.integer, 0);
        let dollarsToDistribute = totalBudget - integerSum;
        
        // Sort by remainder descending to distribute extra dollars
        fractionalValues.sort((a, b) => b.remainder - a.remainder);
        
        // Assign extra dollars to players with largest remainders
        const finalValues = new Map<number, number>();
        fractionalValues.forEach((v, i) => {
          if (i < dollarsToDistribute) {
            finalValues.set(v.index, v.integer + 1);
          } else {
            finalValues.set(v.index, v.integer);
          }
        });
        
        // Create normalized values with exact budget match
        const normalized = draftablePlayers.map((value, idx) => {
          const finalValue = Math.max(1, finalValues.get(idx) || 1);
          
          return {
            ...value,
            constrainedValue: finalValue,
            percentOfBudget: (finalValue / this.leagueSettings.budget) * 100,
            tier: F.has(idx) ? 'waiver' as const : value.tier
          };
        });

        // Undraftable players get $0 value
        const undrafted = undraftablePlayers.map(value => ({
          ...value,
          constrainedValue: 0,
          percentOfBudget: 0,
          tier: 'waiver' as const
        }));

        // Verify budget constraint
        const finalSum = normalized.reduce((sum, v) => sum + v.constrainedValue, 0);
        const budgetDiff = Math.abs(finalSum - totalBudget);
        
        if (budgetDiff > 1) {
          console.warn(`Budget constraint not met. Sum: $${finalSum}, Target: $${totalBudget}, Diff: $${budgetDiff}`);
        }

        return [...normalized, ...undrafted];
      }
    }
    
    // Fallback if max iterations reached
    console.warn('Water-filling did not converge');
    return values;
  }

  /**
   * Calculate position rank based on VORP
   */
  private calculatePositionRank(player: Player, allPlayers: Player[]): number {
    const positionPlayers = allPlayers
      .filter(p => p.position === player.position)
      .map(p => ({
        player: p,
        vorp: Math.max(0, p.projectedPoints - this.replacementCalculator.getReplacementLevel(p.position, allPlayers))
      }))
      .sort((a, b) => b.vorp - a.vorp);

    const rank = positionPlayers.findIndex(p => p.player.id === player.id) + 1;
    return rank > 0 ? rank : 999;
  }

  /**
   * Calculate overall rank based on intrinsic value
   */
  private calculateOverallRank(player: Player, allPlayers: Player[]): number {
    const allValues = allPlayers
      .map(p => ({
        player: p,
        value: this.marginalCurve.vorpToDollars(
          Math.max(0, p.projectedPoints - this.replacementCalculator.getReplacementLevel(p.position, allPlayers)),
          p.position
        )
      }))
      .sort((a, b) => b.value - a.value);

    const rank = allValues.findIndex(v => v.player.id === player.id) + 1;
    return rank > 0 ? rank : 999;
  }

  /**
   * Determine player tier based on VORP and position
   */
  private determineTier(
    vorp: number, 
    position: Position, 
    allPlayers: Player[]
  ): 'elite' | 'starter' | 'bench' | 'waiver' {
    const positionPlayers = allPlayers
      .filter(p => p.position === position)
      .map(p => Math.max(0, p.projectedPoints - this.replacementCalculator.getReplacementLevel(position, allPlayers)))
      .sort((a, b) => b - a);

    const percentile = this.getPercentile(vorp, positionPlayers);

    if (percentile >= 90) return 'elite';
    if (percentile >= 60) return 'starter';
    if (percentile >= 20) return 'bench';
    return 'waiver';
  }

  /**
   * Calculate starter cutoffs per position
   * INCLUDES flex allocations for accurate starter/bench classification
   */
  private calculateStarterCutoffs(players: IntrinsicValue[]): Map<Position, number> {
    const cutoffs = new Map<Position, number>();
    
    // Get position players sorted by VORP
    const rbPlayers = players.filter(p => p.player.position === 'RB').sort((a, b) => b.vorp - a.vorp);
    const wrPlayers = players.filter(p => p.player.position === 'WR').sort((a, b) => b.vorp - a.vorp);
    const tePlayers = players.filter(p => p.player.position === 'TE').sort((a, b) => b.vorp - a.vorp);
    const qbPlayers = players.filter(p => p.player.position === 'QB').sort((a, b) => b.vorp - a.vorp);
    const kPlayers = players.filter(p => p.player.position === 'K').sort((a, b) => b.vorp - a.vorp);
    const dstPlayers = players.filter(p => p.player.position === 'DST').sort((a, b) => b.vorp - a.vorp);
    
    // Initialize with required starters
    const starterCounts: Record<Position, number> = {
      QB: this.leagueSettings.rosterRequirements.QB.min * this.leagueSettings.numTeams,
      RB: this.leagueSettings.rosterRequirements.RB.min * this.leagueSettings.numTeams,
      WR: this.leagueSettings.rosterRequirements.WR.min * this.leagueSettings.numTeams,
      TE: this.leagueSettings.rosterRequirements.TE.min * this.leagueSettings.numTeams,
      K: this.leagueSettings.rosterRequirements.K.min * this.leagueSettings.numTeams,
      DST: this.leagueSettings.rosterRequirements.DST.min * this.leagueSettings.numTeams
    };
    
    // Allocate flex slots optimally (same algorithm as replacement level)
    const flexSlots = (this.leagueSettings.rosterRequirements.FLEX?.count || 0) * this.leagueSettings.numTeams;
    
    for (let i = 0; i < flexSlots; i++) {
      // Get next best at each flex-eligible position
      const nextRB = rbPlayers[starterCounts.RB]?.vorp || 0;
      const nextWR = wrPlayers[starterCounts.WR]?.vorp || 0;
      const nextTE = tePlayers[starterCounts.TE]?.vorp || 0;
      const nextQB = this.leagueSettings.isSuperFlex 
        ? (qbPlayers[starterCounts.QB]?.vorp || 0)
        : 0;
      
      // Allocate to highest VORP
      const maxNext = Math.max(nextRB, nextWR, nextTE, nextQB);
      
      if (maxNext <= 0) break;
      
      if (nextQB === maxNext && this.leagueSettings.isSuperFlex) {
        starterCounts.QB++;
      } else if (nextRB === maxNext) {
        starterCounts.RB++;
      } else if (nextWR === maxNext) {
        starterCounts.WR++;
      } else if (nextTE === maxNext) {
        starterCounts.TE++;
      }
    }
    
    // Set cutoffs at the last starter for each position
    cutoffs.set('QB', qbPlayers[starterCounts.QB - 1]?.vorp || 0);
    cutoffs.set('RB', rbPlayers[starterCounts.RB - 1]?.vorp || 0);
    cutoffs.set('WR', wrPlayers[starterCounts.WR - 1]?.vorp || 0);
    cutoffs.set('TE', tePlayers[starterCounts.TE - 1]?.vorp || 0);
    cutoffs.set('K', kPlayers[starterCounts.K - 1]?.vorp || 0);
    cutoffs.set('DST', dstPlayers[starterCounts.DST - 1]?.vorp || 0);
    
    return cutoffs;
  }
  
  /**
   * Check if player is bench quality
   */
  private isBenchPlayer(value: IntrinsicValue, starterCutoffs: Map<Position, number>): boolean {
    const cutoff = starterCutoffs.get(value.player.position) || 0;
    return value.vorp < cutoff * 0.8; // 80% of starter cutoff = bench
  }

  /**
   * Get percentile rank of a value in a sorted array
   */
  private getPercentile(value: number, sortedArray: number[]): number {
    const index = sortedArray.findIndex(v => v <= value);
    if (index === -1) return 0;
    return ((sortedArray.length - index) / sortedArray.length) * 100;
  }

  /**
   * Get value distribution statistics
   */
  getValueDistribution(values: IntrinsicValue[]): ValueDistribution {
    const nonZeroValues = values.filter(v => v.constrainedValue > 0);
    
    if (nonZeroValues.length === 0) {
      return {
        mean: 0,
        median: 0,
        stdev: 0,
        topTierThreshold: 0,
        valueTierThreshold: 0,
        budgetCheck: false
      };
    }

    const sorted = [...nonZeroValues].sort((a, b) => b.constrainedValue - a.constrainedValue);
    
    const sum = sorted.reduce((total, v) => total + v.constrainedValue, 0);
    const mean = sum / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)]?.constrainedValue || 0;
    
    const variance = sorted.reduce((total, v) => 
      total + Math.pow(v.constrainedValue - mean, 2), 0
    ) / sorted.length;
    const stdev = Math.sqrt(variance);
    
    const targetBudget = this.leagueSettings.numTeams * this.leagueSettings.budget;
    const budgetCheck = Math.abs(sum - targetBudget) <= 1;
    
    return {
      mean,
      median,
      stdev,
      topTierThreshold: sorted[Math.floor(sorted.length * 0.1)]?.constrainedValue || 30,
      valueTierThreshold: sorted[Math.floor(sorted.length * 0.3)]?.constrainedValue || 10,
      budgetCheck
    };
  }

  /**
   * Update league settings and recalculate
   */
  updateSettings(settings: LeagueSettings): void {
    this.leagueSettings = settings;
    this.replacementCalculator = new ReplacementLevelCalculator(settings);
    this.marginalCurve = new MarginalValueCurve(settings);
    this.cachedValues.clear();
  }

  /**
   * Get current league settings
   */
  getSettings(): LeagueSettings {
    return this.leagueSettings;
  }

  /**
   * Get top players by position
   */
  getTopPlayersByPosition(
    values: IntrinsicValue[], 
    position: Position, 
    count: number = 10
  ): IntrinsicValue[] {
    return values
      .filter(v => v.player.position === position)
      .sort((a, b) => b.constrainedValue - a.constrainedValue)
      .slice(0, count);
  }

  /**
   * Get value tiers for display
   */
  getValueTiers(values: IntrinsicValue[]): {
    elite: IntrinsicValue[];
    starters: IntrinsicValue[];
    bench: IntrinsicValue[];
    waiver: IntrinsicValue[];
  } {
    return {
      elite: values.filter(v => v.tier === 'elite'),
      starters: values.filter(v => v.tier === 'starter'),
      bench: values.filter(v => v.tier === 'bench'),
      waiver: values.filter(v => v.tier === 'waiver')
    };
  }
  
  /**
   * Get projected points with fallback for missing data
   */
  private getProjectedPointsWithFallback(player: Player): number {
    // Primary: Use actual projected points if available
    if (player.projectedPoints && player.projectedPoints > 0) {
      return player.projectedPoints;
    }
    
    // Fallback 1: Use last year's points if available (scaled down 5%)
    if (player.lastYearPoints && player.lastYearPoints > 0) {
      return player.lastYearPoints * 0.95;
    }
    
    // Fallback 2: Use position averages for that rank
    const positionDefaults: Record<Position, number[]> = {
      // Top 36 QB projections (3 per team)
      QB: [380, 360, 340, 320, 300, 280, 260, 240, 220, 200, 180, 160,
           140, 120, 100, 80, 60, 40, 20, 10, 5, 0],
      // Top 60 RB projections (5 per team)  
      RB: [320, 280, 250, 220, 200, 180, 160, 140, 120, 100, 90, 80,
           70, 60, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0],
      // Top 72 WR projections (6 per team)
      WR: [300, 270, 240, 210, 190, 170, 150, 130, 110, 95, 85, 75,
           65, 55, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0],
      // Top 24 TE projections (2 per team)
      TE: [240, 200, 170, 140, 120, 100, 80, 60, 50, 40, 30, 20, 10, 5, 0],
      // Top 12 K projections (1 per team)
      K: [150, 145, 140, 135, 130, 125, 120, 115, 110, 105, 100, 95],
      // Top 12 DST projections (1 per team)
      DST: [160, 150, 140, 130, 120, 110, 100, 90, 80, 70, 60, 50]
    };
    
    // Use ADP rank if available to estimate projection
    if (player.adp && player.adp > 0) {
      const defaults = positionDefaults[player.position];
      if (defaults) {
        // Map ADP to position rank (rough estimate)
        const positionRank = Math.floor(player.adp / 3); // Approximate
        const index = Math.min(positionRank, defaults.length - 1);
        return defaults[index] || 0;
      }
    }
    
    // Final fallback: Return 0 (will result in 0 VORP and $0 value)
    return 0;
  }
}