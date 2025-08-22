/**
 * Badge Data Service
 * Parses canonical data to provide badge-related metrics
 */

import { parseCSV } from '../utils/csvParser';
import { Player } from '../types';

// Import 2024 historical data for consistency and red zone analysis
import receiving2024 from '../../canonical_data/historical_stats/fantasy-stats-receiving_rushing_2024.csv?raw';

// Import 2025 projections for volume analysis
import rbProjections from '../../canonical_data/projections/rb_projections_2025.csv?raw';
import wrProjections from '../../canonical_data/projections/wr_projections_2025.csv?raw';
import teProjections from '../../canonical_data/projections/te_projections_2025.csv?raw';

interface PlayerHistoricalStats {
  playerName: string;
  games: number;
  fantasyPts: number;
  fantasyPtsPerGame: number;
  consistency: number; // Lower is more consistent
  // Red zone stats
  rzRecTarg: number;
  rzRecRec: number;
  rzRecTds: number;
  rzRushCarries: number;
  rzRushTds: number;
  totalRedZoneTouches: number;
  redZonePercentage: number; // % of total touches that were in red zone
  // Total touches
  totalTargets: number;
  totalCarries: number;
  totalTouches: number;
}

interface PlayerProjectedVolume {
  playerName: string;
  position: string;
  projectedTouches: number; // rushAtt + receptions
  rushAtt: number;
  receptions: number;
  targets: number;
}

class BadgeDataService {
  private historicalStats: Map<string, PlayerHistoricalStats> = new Map();
  private projectedVolumes: Map<string, PlayerProjectedVolume> = new Map();
  private volumePercentiles: { p80: number; p90: number } = { p80: 0, p90: 0 };
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      this.parseHistoricalData();
      this.parseProjectedVolumes();
      this.calculateVolumePercentiles();
      this.isInitialized = true;
      console.log('Badge Data Service initialized');
    } catch (error) {
      console.error('Failed to initialize Badge Data Service:', error);
      this.isInitialized = false;
    }
  }

  private parseHistoricalData() {
    const rows = parseCSV(receiving2024);
    
    rows.forEach(row => {
      const playerName = row.player || row.Player;
      if (!playerName || playerName === 'player') return;

      const games = parseInt(row.games || '0');
      if (games < 8) return; // Need sufficient games for consistency

      const fantasyPts = parseFloat(row.fantasyPts || '0');
      const fantasyPtsPerGame = parseFloat(row.ptsPerTouch || '0') * 
        (parseInt(row.recRec || '0') + parseInt(row.rushCarries || '0'));

      // Red zone stats
      const rzRecTarg = parseInt(row.rzRecTarg || '0');
      const rzRecRec = parseInt(row.rzRecRec || '0');
      const rzRecTds = parseInt(row.rzRecTds || '0');
      const rzRushCarries = parseInt(row.rzRushCarries || '0');
      const rzRushTds = parseInt(row.rzRushTds || '0');

      // Total touches
      const totalTargets = parseInt(row.recTarg || '0');
      const totalCarries = parseInt(row.rushCarries || '0');
      const totalReceptions = parseInt(row.recRec || '0');
      const totalTouches = totalReceptions + totalCarries;

      const totalRedZoneTouches = rzRecRec + rzRushCarries;
      const redZonePercentage = totalTouches > 0 ? (totalRedZoneTouches / totalTouches) * 100 : 0;

      // Calculate consistency (coefficient of variation proxy)
      // Using points per game as a simple consistency metric
      // Lower variance in PPG = more consistent
      const avgPPG = fantasyPts / games;
      // Without weekly data, use a heuristic: players with steady PPG tend to have lower variance
      // Elite players (high PPG) tend to be more consistent
      // More strict consistency thresholds
      const consistency = avgPPG > 18 ? 0.12 : avgPPG > 15 ? 0.18 : avgPPG > 12 ? 0.22 : avgPPG > 10 ? 0.28 : avgPPG > 8 ? 0.35 : 0.45;

      this.historicalStats.set(playerName.toLowerCase(), {
        playerName,
        games,
        fantasyPts,
        fantasyPtsPerGame: avgPPG,
        consistency,
        rzRecTarg,
        rzRecRec,
        rzRecTds,
        rzRushCarries,
        rzRushTds,
        totalRedZoneTouches,
        redZonePercentage,
        totalTargets,
        totalCarries,
        totalTouches
      });
    });
  }

  private parseProjectedVolumes() {
    // Parse RB projections
    const rbRows = parseCSV(rbProjections);
    rbRows.forEach(row => {
      const playerName = row.playerName || row.PlayerName;
      if (!playerName || playerName === 'playerName') return;

      const rushAtt = parseFloat(row.rushAtt || '0');
      const receptions = parseFloat(row.recvReceptions || '0');
      const targets = parseFloat(row.recvTargets || '0');

      this.projectedVolumes.set(playerName.toLowerCase(), {
        playerName,
        position: 'RB',
        projectedTouches: rushAtt + receptions,
        rushAtt,
        receptions,
        targets
      });
    });

    // Parse WR projections
    const wrRows = parseCSV(wrProjections);
    wrRows.forEach(row => {
      const playerName = row.playerName || row.PlayerName;
      if (!playerName || playerName === 'playerName') return;

      // Skip if already added as RB (some players appear in both)
      if (this.projectedVolumes.has(playerName.toLowerCase())) return;

      const rushAtt = parseFloat(row.rushAtt || '0');
      const receptions = parseFloat(row.recvReceptions || '0');
      const targets = parseFloat(row.recvTargets || '0');

      this.projectedVolumes.set(playerName.toLowerCase(), {
        playerName,
        position: 'WR',
        projectedTouches: rushAtt + receptions,
        rushAtt,
        receptions,
        targets
      });
    });

    // Parse TE projections
    const teRows = parseCSV(teProjections);
    teRows.forEach(row => {
      const playerName = row.playerName || row.PlayerName;
      if (!playerName || playerName === 'playerName') return;

      // Skip if already added as RB or WR (some players appear in multiple)
      if (this.projectedVolumes.has(playerName.toLowerCase())) return;

      const receptions = parseFloat(row.recvReceptions || '0');
      const targets = parseFloat(row.recvTargets || '0');

      this.projectedVolumes.set(playerName.toLowerCase(), {
        playerName,
        position: 'TE',
        projectedTouches: receptions,
        rushAtt: 0,
        receptions,
        targets
      });
    });
  }

  private calculateVolumePercentiles() {
    const touches = Array.from(this.projectedVolumes.values())
      .map(p => p.projectedTouches)
      .filter(t => t > 0)
      .sort((a, b) => a - b);

    if (touches.length === 0) return;

    const p80Index = Math.floor(touches.length * 0.80);
    const p90Index = Math.floor(touches.length * 0.90);

    this.volumePercentiles = {
      p80: touches[p80Index],
      p90: touches[p90Index]
    };

    console.log(`Volume percentiles - P80: ${this.volumePercentiles.p80}, P90: ${this.volumePercentiles.p90}`);
  }

  /**
   * Check if player is a "Consistent Producer" (low variance in 2024)
   */
  isConsistentProducer(playerName: string): boolean {
    const stats = this.historicalStats.get(playerName.toLowerCase());
    if (!stats) return false;

    // Consistency < 0.20 = very consistent (more strict)
    // Must have played at least 14 games (more strict)
    // Must average at least 10 PPG (more strict)
    return stats.games >= 14 && stats.consistency < 0.20 && stats.fantasyPtsPerGame >= 10;
  }

  /**
   * Check if player is a "RZ Monster" (high red zone percentage)
   */
  isRedZoneMonster(playerName: string): boolean {
    const stats = this.historicalStats.get(playerName.toLowerCase());
    if (!stats) return false;

    // Much stricter criteria for RZ Monster
    const highRedZonePercentage = stats.redZonePercentage >= 25; // 25%+ of touches in RZ (was 20%)
    const highRedZoneTouches = stats.totalRedZoneTouches >= 30; // 30+ RZ touches (was 18)
    const redZoneTDs = (stats.rzRecTds + stats.rzRushTds) >= 10; // 10+ RZ TDs (was 7)

    return (highRedZonePercentage || highRedZoneTouches) && redZoneTDs;
  }

  /**
   * Check if player is a "Volume King" (top 10% in projected touches)
   */
  isVolumeKing(playerName: string): boolean {
    const volume = this.projectedVolumes.get(playerName.toLowerCase());
    if (!volume) return false;

    // Top 10% = 90th percentile or higher (was top 20%)
    return volume.projectedTouches >= this.volumePercentiles.p90;
  }

  /**
   * Get all badge data for a player
   */
  getPlayerBadgeData(playerName: string): {
    consistentProducer: boolean;
    redZoneMonster: boolean;
    volumeKing: boolean;
  } {
    return {
      consistentProducer: this.isConsistentProducer(playerName),
      redZoneMonster: this.isRedZoneMonster(playerName),
      volumeKing: this.isVolumeKing(playerName)
    };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const badgeDataService = new BadgeDataService();