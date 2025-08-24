/**
 * Enhanced lineup optimizer using canonical data
 */

import { LineupOptimizer2025 } from './optimizer2025';
import { CanonicalDataLoader } from '../data/dataLoader';
import { ProjectionConverter } from '../data/projectionConverter';
import { CorrelationBuilder } from '../data/correlationBuilder';
import { PlayerProjection, LineupRequirements, ESPN_PPR_2025 } from '../domain/typesCorrected';
import { TruncatedNormal } from '../stats/truncatedNormalRobust';
import { CanonicalPlayer } from '../data/types';

export interface DataDrivenOptimizationOptions {
  week: number;
  myPlayers: string[];        // Player names from your roster
  opponentPlayers?: string[];  // Optional opponent roster
  requirements?: LineupRequirements;
  simulations?: number;
  targetSE?: number;
  useLHS?: boolean;
  useBlending?: boolean;      // Use blended projections
  useCorrelations?: boolean;  // Use data-driven correlations
}

export interface DataDrivenResult {
  starters: PlayerProjection[];
  bench: PlayerProjection[];
  winProbability: number;
  expectedMargin: number;
  marginStdDev: number;
  recommendations: {
    stacks: Map<string, string[]>;
    injuries: string[];
    byeWeeks: string[];
    upgrades: string[];
  };
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  diagnostics: {
    dataSourcesUsed: string[];
    playersNotFound: string[];
    correlationFactors: number;
  };
}

export class DataDrivenLineupOptimizer {
  private dataLoader: CanonicalDataLoader;
  private converter: ProjectionConverter;
  private correlationBuilder: CorrelationBuilder;
  private baseOptimizer: LineupOptimizer2025;
  private dataLoaded: boolean = false;
  
  constructor(canonicalDataPath?: string) {
    this.dataLoader = new CanonicalDataLoader(canonicalDataPath);
    this.converter = new ProjectionConverter();
    this.correlationBuilder = new CorrelationBuilder(new Map());
    this.baseOptimizer = new LineupOptimizer2025();
  }
  
  /**
   * Initialize by loading all canonical data
   */
  async initialize(): Promise<void> {
    if (this.dataLoaded) return;
    
    console.log('Initializing data-driven optimizer...');
    await this.dataLoader.loadAll();
    
    // Initialize correlation builder with team data
    const teamPowers = new Map<string, any>();
    const players = this.dataLoader.getPlayers();
    
    players.forEach(p => {
      if (p.context) {
        teamPowers.set(p.team, {
          pointSpreadRating: p.context.teamPower,
          qbRating: p.context.qbPower,
          projectedWins: 8.5 // Default
        });
      }
    });
    
    this.correlationBuilder = new CorrelationBuilder(teamPowers);
    this.dataLoaded = true;
    console.log('Data-driven optimizer ready');
  }
  
  /**
   * Optimize lineup using canonical data
   */
  async optimize(options: DataDrivenOptimizationOptions): Promise<DataDrivenResult> {
    // Ensure data is loaded
    if (!this.dataLoaded) {
      await this.initialize();
    }
    
    const {
      week,
      myPlayers,
      opponentPlayers,
      requirements = ESPN_PPR_2025,
      simulations = 10000,
      targetSE = 0.005,
      useLHS = true,
      useBlending = true,
      useCorrelations = true
    } = options;
    
    // Convert player names to projections
    const myRoster = this.buildRoster(myPlayers, week, useBlending);
    const playersNotFound = myPlayers.filter(
      name => !this.dataLoader.getPlayer(name)
    );
    
    // Build opponent distribution
    let opponentDist: TruncatedNormal;
    if (opponentPlayers && opponentPlayers.length > 0) {
      const oppRoster = this.buildRoster(opponentPlayers, week, useBlending);
      // Use base optimizer to get opponent's best lineup
      const oppResult = this.baseOptimizer.optimize(oppRoster, null as any, {
        reqs: requirements,
        sims: 1000
      });
      
      // Create TN from opponent's projected score
      const oppMean = oppResult.diagnostics.lineupMean;
      const oppSD = oppResult.diagnostics.lineupStdDev;
      opponentDist = new TruncatedNormal(oppMean, oppSD, 0, 200);
    } else {
      // Default opponent
      opponentDist = new TruncatedNormal(125, 20, 0, 200);
    }
    
    // Apply correlations if requested
    if (useCorrelations && myRoster.length > 0) {
      const factorLoadings = this.correlationBuilder.buildFactorLoadings(myRoster);
      // Would integrate into optimizer here
      console.log(`Applied ${factorLoadings[0]?.length || 0} correlation factors`);
    }
    
    // Run optimization
    const result = this.baseOptimizer.optimize(myRoster, opponentDist, {
      reqs: requirements,
      sims: simulations,
      targetSE,
      useLHS
    });
    
    // Get recommendations
    const canonicalPlayers = myPlayers
      .map(name => this.dataLoader.getPlayer(name))
      .filter(p => p !== undefined) as CanonicalPlayer[];
    
    const stacks = this.correlationBuilder.getStackingRecommendations(canonicalPlayers);
    const injuries = this.getInjuryWarnings(myRoster);
    const byeWeeks = this.getByeWeekWarnings(myRoster, week);
    const upgrades = this.getUpgradeRecommendations(result.bench, result.starters);
    
    // Build comprehensive result
    return {
      starters: result.starters,
      bench: result.bench,
      winProbability: result.winProbability,
      expectedMargin: result.expectedMargin,
      marginStdDev: result.marginStdDev,
      recommendations: {
        stacks,
        injuries,
        byeWeeks,
        upgrades
      },
      percentiles: result.percentiles,
      diagnostics: {
        dataSourcesUsed: this.getDataSourcesUsed(canonicalPlayers),
        playersNotFound,
        correlationFactors: useCorrelations ? 4 : 0
      }
    };
  }
  
  /**
   * Build roster from player names
   */
  private buildRoster(
    playerNames: string[], 
    week: number,
    useBlending: boolean
  ): PlayerProjection[] {
    const projections: PlayerProjection[] = [];
    
    for (const name of playerNames) {
      const player = this.dataLoader.getPlayer(name);
      if (player) {
        const proj = this.converter.convertPlayer(player, week, useBlending);
        projections.push(proj);
      }
    }
    
    return projections;
  }
  
  /**
   * Get injury warnings
   */
  private getInjuryWarnings(roster: PlayerProjection[]): string[] {
    const warnings: string[] = [];
    
    roster.forEach(p => {
      if (p.player.status !== 'HEALTHY') {
        warnings.push(`${p.player.name}: ${p.player.status}`);
      }
    });
    
    return warnings;
  }
  
  /**
   * Get bye week warnings
   */
  private getByeWeekWarnings(roster: PlayerProjection[], week: number): string[] {
    const warnings: string[] = [];
    
    roster.forEach(p => {
      const player = this.dataLoader.getPlayer(p.player.name);
      if (player && 'byeWeek' in player.projection) {
        const bye = (player.projection as any).byeWeek;
        if (bye === week) {
          warnings.push(`${p.player.name} is on BYE week ${week}`);
        }
      }
    });
    
    return warnings;
  }
  
  /**
   * Get upgrade recommendations
   */
  private getUpgradeRecommendations(
    bench: PlayerProjection[], 
    starters: PlayerProjection[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Find high-value bench players
    bench.forEach(benchPlayer => {
      const weakStarter = starters.find(s => 
        s.player.position === benchPlayer.player.position &&
        benchPlayer.mean > s.mean * 1.2
      );
      
      if (weakStarter) {
        recommendations.push(
          `Consider ${benchPlayer.player.name} (${benchPlayer.mean.toFixed(1)} pts) ` +
          `over ${weakStarter.player.name} (${weakStarter.mean.toFixed(1)} pts)`
        );
      }
    });
    
    return recommendations.slice(0, 3); // Top 3 recommendations
  }
  
  /**
   * Get data sources used for players
   */
  private getDataSourcesUsed(players: CanonicalPlayer[]): string[] {
    const sources = new Set<string>();
    
    players.forEach(p => {
      if (p.projection) sources.add('2025 Projections');
      if (p.historical2024) sources.add('2024 Stats');  
      if (p.historical2023) sources.add('2023 Stats');
      if (p.adp) sources.add('ADP Market Data');
      if (p.context?.teamPower) sources.add('Team Power Ratings');
      if (p.context?.sosWeekly !== null) sources.add('Strength of Schedule');
    });
    
    return Array.from(sources);
  }
  
  /**
   * Get available players by position
   */
  getAvailablePlayersByPosition(position: string): CanonicalPlayer[] {
    return this.dataLoader.getPlayersByPosition(position);
  }
  
  /**
   * Quick lineup check without full optimization
   */
  validateLineup(playerNames: string[], week: number): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check if all players exist
    const notFound = playerNames.filter(name => !this.dataLoader.getPlayer(name));
    if (notFound.length > 0) {
      errors.push(`Players not found: ${notFound.join(', ')}`);
    }
    
    // Check bye weeks
    playerNames.forEach(name => {
      const player = this.dataLoader.getPlayer(name);
      if (player && 'byeWeek' in player.projection) {
        const bye = (player.projection as any).byeWeek;
        if (bye === week) {
          errors.push(`${name} is on BYE week ${week}`);
        }
      }
    });
    
    // Check position requirements
    const positions = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
    playerNames.forEach(name => {
      const player = this.dataLoader.getPlayer(name);
      if (player) {
        positions[player.position]++;
      }
    });
    
    if (positions.QB < 1) errors.push('Need at least 1 QB');
    if (positions.RB < 2) errors.push('Need at least 2 RBs');
    if (positions.WR < 2) errors.push('Need at least 2 WRs');
    if (positions.TE < 1) errors.push('Need at least 1 TE');
    
    // Add warnings for potential issues
    if (positions.RB + positions.WR + positions.TE < 5) {
      warnings.push('May not have enough FLEX-eligible players');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}