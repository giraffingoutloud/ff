/**
 * Main data loader for canonical data integration
 */

import * as path from 'path';
import { 
  parseQBSOS, 
  parsePowerRatings, 
  parseHistoricalStats, 
  parseADP, 
  parseOffenseProjections,
  parseKickerProjections,
  parseDSTProjections
} from './parsers';
import { 
  CanonicalPlayer, 
  PlayerContext,
  TeamPowerRating,
  QBStrengthOfSchedule,
  HistoricalStats,
  ADPData,
  OffenseProjection,
  KickerProjection,
  DSTProjection
} from './types';

export class CanonicalDataLoader {
  private basePath: string;
  private qbSOS: Map<string, QBStrengthOfSchedule>;
  private teamPowerRatings: Map<string, TeamPowerRating>;
  private historical2024: Map<string, HistoricalStats>;
  private historical2023: Map<string, HistoricalStats>;
  private dstHistorical2024: Map<string, HistoricalStats>;
  private dstHistorical2023: Map<string, HistoricalStats>;
  private adpData: Map<string, ADPData>;
  private offenseProjections: Map<string, OffenseProjection>;
  private kickerProjections: Map<string, KickerProjection>;
  private dstProjections: Map<string, DSTProjection>;
  private players: Map<string, CanonicalPlayer>;
  
  constructor(basePath: string = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data') {
    this.basePath = basePath;
    this.qbSOS = new Map();
    this.teamPowerRatings = new Map();
    this.historical2024 = new Map();
    this.historical2023 = new Map();
    this.dstHistorical2024 = new Map();
    this.dstHistorical2023 = new Map();
    this.adpData = new Map();
    this.offenseProjections = new Map();
    this.kickerProjections = new Map();
    this.dstProjections = new Map();
    this.players = new Map();
  }
  
  /**
   * Load all canonical data files
   */
  async loadAll(): Promise<void> {
    console.log('Loading canonical data...');
    
    // Load base data
    this.loadPowerRatings();
    this.loadQBSOS();
    this.loadHistoricalStats();
    this.loadADP();
    this.loadProjections();
    
    // Build player database
    this.buildPlayerDatabase();
    
    // Add context to all players
    this.enrichPlayersWithContext();
    
    console.log(`Loaded ${this.players.size} players with projections and context`);
  }
  
  private loadPowerRatings(): void {
    try {
      const nflPath = path.join(this.basePath, 'other/nfl-power-ratings.csv');
      this.teamPowerRatings = parsePowerRatings(nflPath);
      console.log(`Loaded ${this.teamPowerRatings.size} team power ratings`);
    } catch (e) {
      console.error('Failed to load power ratings:', e);
    }
  }
  
  private loadQBSOS(): void {
    try {
      const sosPath = path.join(this.basePath, 'other/qb-fantasy-sos.csv');
      this.qbSOS = parseQBSOS(sosPath);
      console.log(`Loaded ${this.qbSOS.size} QB SOS entries`);
    } catch (e) {
      console.error('Failed to load QB SOS:', e);
    }
  }
  
  private loadHistoricalStats(): void {
    // Load 2024 stats
    try {
      const pass2024 = path.join(this.basePath, 'historical_stats/fantasy-stats-passing_2024.csv');
      const passStats = parseHistoricalStats(pass2024);
      passStats.forEach((v, k) => this.historical2024.set(k, v));
    } catch (e) {
      console.error('Failed to load 2024 passing stats:', e);
    }
    
    try {
      const recRush2024 = path.join(this.basePath, 'historical_stats/fantasy-stats-receiving_rushing_2024.csv');
      const rrStats = parseHistoricalStats(recRush2024);
      rrStats.forEach((v, k) => {
        const existing = this.historical2024.get(k);
        if (existing) {
          Object.assign(existing, v);
        } else {
          this.historical2024.set(k, v);
        }
      });
    } catch (e) {
      console.error('Failed to load 2024 receiving/rushing stats:', e);
    }
    
    try {
      const dst2024 = path.join(this.basePath, 'historical_stats/fantasy-stats-dst_2024.csv');
      this.dstHistorical2024 = parseHistoricalStats(dst2024, true);
    } catch (e) {
      console.error('Failed to load 2024 DST stats:', e);
    }
    
    // Load 2023 stats (same process)
    try {
      const pass2023 = path.join(this.basePath, 'historical_stats/fantasy-stats-passing_2023.csv');
      const passStats = parseHistoricalStats(pass2023);
      passStats.forEach((v, k) => this.historical2023.set(k, v));
    } catch (e) {
      console.error('Failed to load 2023 passing stats:', e);
    }
    
    try {
      const recRush2023 = path.join(this.basePath, 'historical_stats/fantasy-stats-receiving_rushing_2023.csv');
      const rrStats = parseHistoricalStats(recRush2023);
      rrStats.forEach((v, k) => {
        const existing = this.historical2023.get(k);
        if (existing) {
          Object.assign(existing, v);
        } else {
          this.historical2023.set(k, v);
        }
      });
    } catch (e) {
      console.error('Failed to load 2023 receiving/rushing stats:', e);
    }
    
    try {
      const dst2023 = path.join(this.basePath, 'historical_stats/fantasy-stats-dst_2023.csv');
      this.dstHistorical2023 = parseHistoricalStats(dst2023, true);
    } catch (e) {
      console.error('Failed to load 2023 DST stats:', e);
    }
    
    console.log(`Loaded ${this.historical2024.size} 2024 player stats`);
    console.log(`Loaded ${this.historical2023.size} 2023 player stats`);
  }
  
  private loadADP(): void {
    try {
      const adp4Path = path.join(this.basePath, 'adp/adp4_2025.txt');
      this.adpData = parseADP(adp4Path);
      console.log(`Loaded ${this.adpData.size} ADP entries`);
    } catch (e) {
      console.error('Failed to load ADP data:', e);
    }
    
    // Also try to load adp5 and merge
    try {
      const adp5Path = path.join(this.basePath, 'adp/adp5_2025.txt');
      const adp5 = parseADP(adp5Path);
      
      // Merge, preferring adp4 but averaging ADPs
      adp5.forEach((v, k) => {
        const existing = this.adpData.get(k);
        if (existing) {
          existing.adp = (existing.adp + v.adp) / 2;
        } else {
          this.adpData.set(k, v);
        }
      });
    } catch (e) {
      // adp5 is optional
    }
  }
  
  private loadProjections(): void {
    // Load offense projections
    try {
      const offPath = path.join(this.basePath, 'projections/offense_projections_2025.csv');
      this.offenseProjections = parseOffenseProjections(offPath);
      console.log(`Loaded ${this.offenseProjections.size} offense projections`);
    } catch (e) {
      console.error('Failed to load offense projections:', e);
    }
    
    // Load kicker projections
    try {
      const kickPath = path.join(this.basePath, 'projections/k_projections_2025.csv');
      this.kickerProjections = parseKickerProjections(kickPath);
      console.log(`Loaded ${this.kickerProjections.size} kicker projections`);
    } catch (e) {
      console.error('Failed to load kicker projections:', e);
    }
    
    // Load DST projections
    try {
      const dstPath = path.join(this.basePath, 'projections/dst_projections_2025.csv');
      this.dstProjections = parseDSTProjections(dstPath);
      console.log(`Loaded ${this.dstProjections.size} DST projections`);
    } catch (e) {
      console.error('Failed to load DST projections:', e);
    }
  }
  
  private buildPlayerDatabase(): void {
    // Process offense projections
    this.offenseProjections.forEach((proj, name) => {
      if (proj.position === 'QB' || proj.position === 'RB' || 
          proj.position === 'WR' || proj.position === 'TE') {
        const player: CanonicalPlayer = {
          id: `${proj.teamName}_${name.replace(/\s+/g, '_')}`,
          name: name,
          team: proj.teamName,
          position: proj.position as any,
          byeWeek: proj.byeWeek,
          projection: proj,
          historical2024: this.historical2024.get(name),
          historical2023: this.historical2023.get(name),
          adp: this.adpData.get(name)
        };
        this.players.set(name, player);
      }
    });
    
    // Process kickers
    this.kickerProjections.forEach((proj, name) => {
      const player: CanonicalPlayer = {
        id: `${proj.teamName}_${name.replace(/\s+/g, '_')}`,
        name: name,
        team: proj.teamName,
        position: 'K',
        byeWeek: proj.byeWeek,
        projection: proj,
        adp: this.adpData.get(name)
      };
      this.players.set(name, player);
    });
    
    // Process DSTs
    this.dstProjections.forEach((proj, team) => {
      const player: CanonicalPlayer = {
        id: `${team}_DST`,
        name: `${team} DST`,
        team: team,
        position: 'DST',
        byeWeek: proj.byeWeek,
        projection: proj,
        historical2024: this.dstHistorical2024.get(team),
        historical2023: this.dstHistorical2023.get(team),
        adp: this.adpData.get(`${team} DST`)
      };
      this.players.set(`${team} DST`, player);
    });
  }
  
  private enrichPlayersWithContext(): void {
    this.players.forEach((player, name) => {
      const teamPower = this.teamPowerRatings.get(player.team);
      
      // Calculate historical baseline
      let historicalMean = 0;
      let historicalGames = 0;
      
      if (player.historical2024) {
        historicalMean += player.historical2024.fantasyPoints;
        historicalGames += player.historical2024.games;
      }
      if (player.historical2023) {
        historicalMean += player.historical2023.fantasyPoints * 0.7; // Weight prior year less
        historicalGames += player.historical2023.games * 0.7;
      }
      
      if (historicalGames > 0) {
        historicalMean = historicalMean / historicalGames;
      }
      
      // Get QB power for pass catchers
      let qbPower = 0;
      if (teamPower && (player.position === 'WR' || player.position === 'TE')) {
        qbPower = teamPower.qbRating;
      }
      
      // Get QB SOS for QBs
      let sosWeekly: number | null = null;
      let sosSeason = 0;
      
      if (player.position === 'QB') {
        const qbSos = this.qbSOS.get(name);
        if (qbSos) {
          // For now, use week 1 as example (would be parameterized in real usage)
          sosWeekly = qbSos.weeks.get(1) || null;
          sosSeason = qbSos.ovr;
        }
      }
      
      // Calculate market uncertainty from ADP range
      let marketUncertainty = 3; // Default uncertainty
      if (player.adp) {
        const range = player.adp.worstPick - player.adp.bestPick;
        marketUncertainty = range / 6; // Assume range covers ~6 std devs
      }
      
      // Get projected points
      let projectedPoints = 0;
      if ('fantasyPoints' in player.projection) {
        projectedPoints = player.projection.fantasyPoints;
      }
      
      player.context = {
        teamPower: teamPower?.pointSpreadRating || 0,
        qbPower,
        sosWeekly,
        sosSeason,
        historicalMean,
        historicalGames,
        projectedPoints,
        marketAdp: player.adp?.adp || 200,
        marketUncertainty
      };
    });
  }
  
  /**
   * Get all players for lineup optimization
   */
  getPlayers(): CanonicalPlayer[] {
    return Array.from(this.players.values());
  }
  
  /**
   * Get specific player by name
   */
  getPlayer(name: string): CanonicalPlayer | undefined {
    return this.players.get(name);
  }
  
  /**
   * Get players by position
   */
  getPlayersByPosition(position: string): CanonicalPlayer[] {
    return Array.from(this.players.values()).filter(p => p.position === position);
  }
  
  /**
   * Get team power rating
   */
  getTeamPower(team: string): TeamPowerRating | undefined {
    return this.teamPowerRatings.get(team);
  }
  
  /**
   * Get QB SOS for a specific week
   */
  getQBSOS(qbName: string, week: number): number | null {
    const sos = this.qbSOS.get(qbName);
    return sos ? (sos.weeks.get(week) || null) : null;
  }
}