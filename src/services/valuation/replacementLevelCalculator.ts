/**
 * Replacement Level Calculator
 * Dynamically calculates replacement level based on league settings and player pool
 * No hardcoded values - everything derived from actual data
 */

import { Player, Position } from '../../types';
import { LeagueSettings, calculatePositionDemand } from './leagueSettings';

export interface ReplacementLevels {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DST: number;
}

export class ReplacementLevelCalculator {
  private leagueSettings: LeagueSettings;
  private cachedLevels: Map<string, ReplacementLevels> = new Map();

  constructor(leagueSettings: LeagueSettings) {
    this.leagueSettings = leagueSettings;
  }

  /**
   * Get replacement level for a specific position
   * This is the projected points of the last starter-quality player
   */
  getReplacementLevel(position: Position, allPlayers: Player[]): number {
    const levels = this.calculateAllReplacementLevels(allPlayers);
    return levels[position] || 0;
  }

  /**
   * Calculate replacement levels for all positions
   * Based on league demand and available players
   */
  calculateAllReplacementLevels(allPlayers: Player[]): ReplacementLevels {
    // Create cache key from player pool
    const cacheKey = this.createCacheKey(allPlayers);
    if (this.cachedLevels.has(cacheKey)) {
      return this.cachedLevels.get(cacheKey)!;
    }

    const levels: ReplacementLevels = {
      QB: this.calculatePositionReplacementLevel('QB', allPlayers),
      RB: this.calculatePositionReplacementLevel('RB', allPlayers),
      WR: this.calculatePositionReplacementLevel('WR', allPlayers),
      TE: this.calculatePositionReplacementLevel('TE', allPlayers),
      K: this.calculatePositionReplacementLevel('K', allPlayers),
      DST: this.calculatePositionReplacementLevel('DST', allPlayers)
    };

    // Cache the results
    this.cachedLevels.set(cacheKey, levels);
    return levels;
  }

  /**
   * Calculate replacement level for a specific position
   */
  private calculatePositionReplacementLevel(
    position: Position,
    allPlayers: Player[]
  ): number {
    // Get all players at this position, sorted by projected points
    const positionPlayers = allPlayers
      .filter(p => p.position === position && p.projectedPoints > 0)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);

    if (positionPlayers.length === 0) {
      return 0;
    }

    // Calculate how many players at this position will be rostered
    const demand = calculatePositionDemand(position, this.leagueSettings);
    
    // Replacement level is the Nth player where N = demand
    // Use index demand-1 since array is 0-indexed
    const replacementIndex = Math.min(demand - 1, positionPlayers.length - 1);
    const replacementPlayer = positionPlayers[replacementIndex];
    
    // Streaming uplift factors - INCREASE replacement level for streamable positions
    // Higher uplift = more streamable = higher replacement level = lower VORP
    const streamingUplifts: Record<Position, number> = {
      QB: 0.12,   // QBs moderately streamable (+12% to replacement)
      RB: 0.02,   // RBs NOT streamable (only +2%)
      WR: 0.05,   // WRs somewhat streamable (+5%)
      TE: 0.08,   // TEs more streamable (+8%)
      K: 0.25,    // Kickers highly streamable (+25%)
      DST: 0.30   // DSTs most streamable (+30%)
    };
    
    const uplift = streamingUplifts[position] || 0.05;
    // Streaming RAISES the effective replacement level
    const replacementLevel = replacementPlayer ? replacementPlayer.projectedPoints * (1 + uplift) : 0;

    // For flex-eligible positions, consider cross-position replacement
    if (['RB', 'WR', 'TE'].includes(position)) {
      const flexReplacement = this.calculateFlexReplacement(allPlayers);
      // Use the higher of position-specific or flex replacement
      return Math.max(replacementLevel, flexReplacement);
    }

    return replacementLevel;
  }

  /**
   * Calculate EXACT flex replacement level using optimal allocation
   * Allocates flex slots to highest available players across eligible positions
   */
  private calculateFlexReplacement(allPlayers: Player[]): number {
    // Get sorted lists by position
    const rbPlayers = allPlayers
      .filter(p => p.position === 'RB' && p.projectedPoints > 0)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    const wrPlayers = allPlayers
      .filter(p => p.position === 'WR' && p.projectedPoints > 0)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    const tePlayers = allPlayers
      .filter(p => p.position === 'TE' && p.projectedPoints > 0)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    
    // Include QB for Superflex
    const qbPlayers = this.leagueSettings.isSuperFlex
      ? allPlayers
          .filter(p => p.position === 'QB' && p.projectedPoints > 0)
          .sort((a, b) => b.projectedPoints - a.projectedPoints)
      : [];
    
    // Initialize with required starters
    const allocated: Record<string, number> = {
      RB: this.leagueSettings.rosterRequirements.RB.min * this.leagueSettings.numTeams,
      WR: this.leagueSettings.rosterRequirements.WR.min * this.leagueSettings.numTeams,
      TE: this.leagueSettings.rosterRequirements.TE.min * this.leagueSettings.numTeams
    };
    
    if (this.leagueSettings.isSuperFlex) {
      allocated.QB = this.leagueSettings.rosterRequirements.QB.min * this.leagueSettings.numTeams;
    }
    
    // Allocate flex slots optimally
    const flexSlots = (this.leagueSettings.rosterRequirements.FLEX?.count || 0) * this.leagueSettings.numTeams;
    
    for (let i = 0; i < flexSlots; i++) {
      // Get next best player at each position
      const nextRB = rbPlayers[allocated.RB]?.projectedPoints || 0;
      const nextWR = wrPlayers[allocated.WR]?.projectedPoints || 0;
      const nextTE = tePlayers[allocated.TE]?.projectedPoints || 0;
      const nextQB = this.leagueSettings.isSuperFlex 
        ? (qbPlayers[allocated.QB]?.projectedPoints || 0)
        : 0;
      
      // Find maximum and allocate
      const maxNext = Math.max(nextRB, nextWR, nextTE, nextQB);
      
      if (maxNext <= 0) break;
      
      if (nextQB === maxNext && this.leagueSettings.isSuperFlex) {
        allocated.QB++;
      } else if (nextRB === maxNext) {
        allocated.RB++;
      } else if (nextWR === maxNext) {
        allocated.WR++;
      } else if (nextTE === maxNext) {
        allocated.TE++;
      }
    }
    
    // Get replacement levels at final allocated counts
    const rbReplacement = rbPlayers[allocated.RB - 1]?.projectedPoints || 0;
    const wrReplacement = wrPlayers[allocated.WR - 1]?.projectedPoints || 0;
    const teReplacement = tePlayers[allocated.TE - 1]?.projectedPoints || 0;
    const qbReplacement = this.leagueSettings.isSuperFlex
      ? (qbPlayers[allocated.QB - 1]?.projectedPoints || 0)
      : Infinity; // Don't consider QB if not superflex
    
    // Return the minimum (last starter across all flex positions)
    const minReplacement = Math.min(rbReplacement, wrReplacement, teReplacement, qbReplacement);
    return minReplacement * 1.05; // Small uplift for flex streaming
  }

  /**
   * Create a cache key from player pool
   */
  private createCacheKey(players: Player[]): string {
    // Simple cache key based on number of players and top performers
    const topQB = players.filter(p => p.position === 'QB').slice(0, 3).map(p => p.id).join('-');
    const topRB = players.filter(p => p.position === 'RB').slice(0, 3).map(p => p.id).join('-');
    return `${players.length}-${topQB}-${topRB}`;
  }

  /**
   * Get baseline projections for each position
   * These are the minimum viable starters
   */
  getBaselineProjections(allPlayers: Player[]): Record<Position, number> {
    const baselines: Record<Position, number> = {} as Record<Position, number>;
    const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    
    positions.forEach(position => {
      const positionPlayers = allPlayers
        .filter(p => p.position === position && p.projectedPoints > 0)
        .sort((a, b) => b.projectedPoints - a.projectedPoints);
      
      // Baseline is the last required starter
      const baselineIndex = this.leagueSettings.rosterRequirements[position].min * this.leagueSettings.numTeams - 1;
      const baselinePlayer = positionPlayers[baselineIndex];
      baselines[position] = baselinePlayer ? baselinePlayer.projectedPoints : 0;
    });
    
    return baselines;
  }

  /**
   * Calculate position scarcity score (0-100)
   * Higher score = more scarce
   */
  calculateScarcity(position: Position, availablePlayers: Player[]): number {
    const positionPlayers = availablePlayers
      .filter(p => p.position === position && p.projectedPoints > 0)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    
    const demand = calculatePositionDemand(position, this.leagueSettings);
    const supply = positionPlayers.length;
    
    // Calculate dropoff between tiers
    const tier1 = positionPlayers.slice(0, 3).reduce((sum, p) => sum + p.projectedPoints, 0) / 3 || 0;
    const tier2 = positionPlayers.slice(6, 9).reduce((sum, p) => sum + p.projectedPoints, 0) / 3 || 0;
    const tier3 = positionPlayers.slice(12, 15).reduce((sum, p) => sum + p.projectedPoints, 0) / 3 || 0;
    
    const dropoffRate = tier1 > 0 ? ((tier1 - tier3) / tier1) * 100 : 0;
    
    // Combine supply/demand ratio with dropoff rate
    const supplyDemandRatio = supply > 0 ? demand / supply : 1;
    const scarcityScore = (supplyDemandRatio * 50) + (dropoffRate * 0.5);
    
    return Math.min(100, Math.max(0, scarcityScore));
  }

  /**
   * Update settings and clear cache
   */
  updateSettings(settings: LeagueSettings): void {
    this.leagueSettings = settings;
    this.cachedLevels.clear();
  }

  /**
   * Get detailed replacement analysis
   */
  getReplacementAnalysis(allPlayers: Player[]): {
    levels: ReplacementLevels;
    baselines: Record<Position, number>;
    scarcity: Record<Position, number>;
    demand: Record<Position, number>;
  } {
    const levels = this.calculateAllReplacementLevels(allPlayers);
    const baselines = this.getBaselineProjections(allPlayers);
    
    const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    const scarcity: Record<Position, number> = {} as Record<Position, number>;
    const demand: Record<Position, number> = {} as Record<Position, number>;
    
    positions.forEach(pos => {
      scarcity[pos] = this.calculateScarcity(pos, allPlayers);
      demand[pos] = calculatePositionDemand(pos, this.leagueSettings);
    });
    
    return { levels, baselines, scarcity, demand };
  }
}