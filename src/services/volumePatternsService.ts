/**
 * Volume Patterns Service
 * 
 * Analyzes 2023-2024 historical data to identify:
 * - Players with consistent volume
 * - Late-season surgers from 2024
 * - Target/carry share trends
 * - PPR floor plays
 */

import { ExtendedPlayer } from './pprAnalyzer';
import { parseCSV } from '../utils/csvParser';

// Import 2024 data (most recent/relevant)
import receiving2024 from '../../canonical_data/historical_stats/fantasy-stats-receiving_rushing_2024.csv?raw';
import receiving2023 from '../../canonical_data/historical_stats/fantasy-stats-receiving_rushing_2023.csv?raw';
import passing2024 from '../../canonical_data/historical_stats/fantasy-stats-passing_2024.csv?raw';

interface WeeklyVolume {
  week: number;
  targets?: number;
  receptions?: number;
  carries?: number;
  touches: number; // carries + receptions
  yards: number;
  tds: number;
}

interface PlayerVolume {
  playerName: string;
  position: string;
  team: string;
  totalTargets: number;
  totalReceptions: number;
  totalCarries: number;
  totalTouches: number;
  gamesPlayed: number;
  
  // Per game averages
  targetsPerGame: number;
  receptionsPerGame: number;
  carriesPerGame: number;
  touchesPerGame: number;
  
  // Consistency metrics (null when weekly data unavailable)
  targetConsistency: number | null;
  touchConsistency: number | null;
  pprFloorScore: number; // Consistent PPR points
  
  // Trend analysis
  firstHalfAvg: number; // Weeks 1-9 touches/game
  secondHalfAvg: number; // Weeks 10-18 touches/game
  lastFourAvg: number; // Last 4 weeks touches/game
  momentumScore: number; // Positive = ascending, negative = descending
  
  // Role metrics
  redZoneShare: number; // % of team RZ touches
  targetShare: number; // % of team targets
  rushShare: number; // % of team rush attempts
  
  weeklyData: WeeklyVolume[];
}

class VolumePatternsService {
  private playerVolumes2024: Map<string, PlayerVolume> = new Map();
  private playerVolumes2023: Map<string, PlayerVolume> = new Map();
  private isInitialized = false;
  
  constructor() {
    this.initialize();
  }
  
  private initialize() {
    try {
      // Parse 2024 data (most important for trends)
      this.parseSeasonData(receiving2024, 2024);
      this.parseSeasonData(receiving2023, 2023);
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Volume Patterns service:', error);
      this.isInitialized = false;
    }
  }
  
  private parseSeasonData(csvData: string, year: number) {
    const rows = parseCSV(csvData);
    const volumeMap = year === 2024 ? this.playerVolumes2024 : this.playerVolumes2023;
    
    // Group by player
    const playerStats = new Map<string, any[]>();
    
    rows.forEach(row => {
      const playerName = row.player || row.Player || row.Name;
      if (!playerName || playerName === 'player' || playerName === 'Player') return; // Skip headers
      
      // For this data, we don't have weekly breakdowns, just season totals
      // So we'll treat each row as a season summary
      if (!playerStats.has(playerName)) {
        playerStats.set(playerName, [row]);
      }
    });
    
    // Process each player's season
    playerStats.forEach((weeks, playerName) => {
      const volume = this.calculatePlayerVolume(playerName, weeks);
      if (volume && volume.gamesPlayed >= 6) { // Minimum 6 games for relevance
        volumeMap.set(playerName.toLowerCase(), volume);
      }
    });
  }
  
  private calculatePlayerVolume(playerName: string, seasonRows: any[]): PlayerVolume | null {
    if (seasonRows.length === 0) return null;
    
    // For season totals, we only have one row per player
    const row = seasonRows[0];
    
    // Parse the data using the actual column names
    const targets = parseInt(row.recTarg || row.targets || '0');
    const receptions = parseInt(row.recRec || row.receptions || '0');
    const carries = parseInt(row.rushCarries || row.carries || '0');
    const games = parseInt(row.games || '0');
    const recYards = parseInt(row.recYds || '0');
    const rushYards = parseInt(row.rushYds || '0');
    const recTDs = parseInt(row.recTds || '0');
    const rushTDs = parseInt(row.rushTds || '0');
    
    if (games === 0) return null;
    
    const totalTargets = targets;
    const totalReceptions = receptions;
    const totalCarries = carries;
    const totalYards = recYards + rushYards;
    const totalTDs = recTDs + rushTDs;
    
    // We only have season totals, not weekly data
    // Don't create fake data - use actual season totals only
    const weeklyData: WeeklyVolume[] = [];
    // We'll only store one entry with the season totals
    weeklyData.push({
      week: 0, // 0 indicates season total, not a specific week
      targets: targets,
      receptions: receptions,
      carries: carries,
      touches: receptions + carries,
      yards: totalYards,
      tds: totalTDs
    });
    
    const gamesPlayed = games;
    if (gamesPlayed === 0) return null;
    
    // Calculate per-game averages
    const targetsPerGame = totalTargets / gamesPlayed;
    const receptionsPerGame = totalReceptions / gamesPlayed;
    const carriesPerGame = totalCarries / gamesPlayed;
    const touchesPerGame = (totalReceptions + totalCarries) / gamesPlayed;
    
    // We only have season totals, not weekly data, so we cannot calculate consistency
    // Using null to indicate no data available (UI should handle appropriately)
    const targetConsistency = null;
    const touchConsistency = null;
    
    // Calculate PPR floor based on per-game averages
    const pprFloorScore = receptionsPerGame + (totalYards / games) * 0.1 + (totalTDs / games) * 6;
    
    // For season totals, we'll use per-game averages
    // Since canonical data is season totals, not weekly breakdowns
    const firstHalfAvg = touchesPerGame;
    const secondHalfAvg = touchesPerGame;
    const lastFourAvg = touchesPerGame;
    
    // Calculate momentum score from year-over-year comparison if possible
    // This will be properly calculated when comparing 2023 vs 2024 data
    let momentumScore = 0; // Default neutral if no comparison data
    
    // Get position and team from the row
    const position = row.position || row.Position || '';
    const team = row.team || row.Team || '';
    
    return {
      playerName,
      position,
      team,
      totalTargets,
      totalReceptions,
      totalCarries,
      totalTouches: totalReceptions + totalCarries,
      gamesPlayed,
      targetsPerGame,
      receptionsPerGame,
      carriesPerGame,
      touchesPerGame,
      targetConsistency,
      touchConsistency,
      pprFloorScore,
      firstHalfAvg,
      secondHalfAvg,
      lastFourAvg,
      momentumScore,
      redZoneShare: 0, // Would need team data to calculate
      targetShare: 0, // Would need team data to calculate
      rushShare: 0, // Would need team data to calculate
      weeklyData
    };
  }
  
  private calculateConsistency(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = (stdDev / mean) * 100;
    
    // Convert to 0-100 score where 100 is most consistent
    return Math.max(0, Math.min(100, 100 - coefficientOfVariation));
  }
  
  private calculatePPRFloor(weeklyData: WeeklyVolume[]): number {
    // Calculate the 25th percentile of weekly PPR points
    const pprPoints = weeklyData.map(w => {
      const recPoints = (w.receptions || 0) * 1; // 1 point per reception
      const yardPoints = w.yards * 0.1;
      const tdPoints = w.tds * 6;
      return recPoints + yardPoints + tdPoints;
    }).sort((a, b) => a - b);
    
    if (pprPoints.length === 0) return 0;
    
    const percentile25Index = Math.floor(pprPoints.length * 0.25);
    return pprPoints[percentile25Index];
  }
  
  private calculateMomentum(weeklyData: WeeklyVolume[]): number {
    if (weeklyData.length < 4) return 0;
    
    // Compare last 4 weeks to first 4 weeks
    const firstFour = weeklyData.slice(0, 4);
    const lastFour = weeklyData.slice(-4);
    
    const firstAvg = firstFour.reduce((sum, w) => sum + w.touches, 0) / firstFour.length;
    const lastAvg = lastFour.reduce((sum, w) => sum + w.touches, 0) / lastFour.length;
    
    // Calculate percentage change
    if (firstAvg === 0) return 0;
    return ((lastAvg - firstAvg) / firstAvg) * 100;
  }
  
  /**
   * Get players with most consistent volume (PPR floor plays)
   */
  getConsistentVolumePlayers(players: ExtendedPlayer[]): ExtendedPlayer[] {
    if (!this.isInitialized) {
      console.warn('Volume Patterns Service not initialized');
      return [];
    }
    
    // Debug: Check if we have any volume data
    if (this.playerVolumes2024.size === 0) {
      console.warn('No 2024 volume data available');
      return [];
    }
    
    return players
      .map(player => {
        // Try different name formats
        let volume2024 = this.playerVolumes2024.get(player.name.toLowerCase());
        if (!volume2024) {
          // Try without suffixes like Jr., III, etc.
          const simpleName = player.name.replace(/ (Jr\.|III|II|IV|Sr\.)$/i, '').toLowerCase();
          volume2024 = this.playerVolumes2024.get(simpleName);
        }
        if (!volume2024) return null;
        
        // Since we don't have consistency data, use volume metrics only
        const consistencyScore = 50; // Default neutral since we can't calculate
        const volumeScore = volume2024.touchesPerGame * 10; // Weight touches
        const totalScore = consistencyScore + volumeScore + volume2024.pprFloorScore;
        
        return {
          player,
          volume: volume2024,
          score: totalScore
        };
      })
      .filter(item => 
        item !== null && 
        item.volume.touchesPerGame >= 5 // Minimum volume threshold (lowered)
        // Cannot filter by consistency since we don't have weekly data
      )
      .sort((a, b) => b!.score - a!.score)
      .map(item => item!.player);
  }
  
  /**
   * Get players who surged late in 2024 season
   */
  getLateSurgers(players: ExtendedPlayer[]): ExtendedPlayer[] {
    if (!this.isInitialized) return [];
    // Since we don't have weekly data, we'll show high-touch players as "surgers"
    // These are players who had significant volume in 2024
    return players
      .map(player => {
        let volume2024 = this.playerVolumes2024.get(player.name.toLowerCase());
        if (!volume2024) {
          const simpleName = player.name.replace(/ (Jr\.|III|II|IV|Sr\.)$/i, '').toLowerCase();
          volume2024 = this.playerVolumes2024.get(simpleName);
        }
        if (!volume2024) return null;
        
        return {
          player,
          volume: volume2024,
          // Use touches per game as a proxy for surge potential
          surgePotential: volume2024.touchesPerGame
        };
      })
      .filter(item => 
        item !== null && 
        item.volume.touchesPerGame >= 8 && // Good volume
        item.volume.gamesPlayed >= 8 // Played enough games to show consistency
      )
      .sort((a, b) => b!.surgePotential - a!.surgePotential)
      .map(item => item!.player);
  }
  
  /**
   * Get boring but reliable volume plays
   */
  getVolumeHogs(players: ExtendedPlayer[]): ExtendedPlayer[] {
    if (!this.isInitialized) return [];
    return players
      .map(player => {
        let volume2024 = this.playerVolumes2024.get(player.name.toLowerCase());
        if (!volume2024) {
          const simpleName = player.name.replace(/ (Jr\.|III|II|IV|Sr\.)$/i, '').toLowerCase();
          volume2024 = this.playerVolumes2024.get(simpleName);
        }
        if (!volume2024) return null;
        
        return {
          player,
          volume: volume2024
        };
      })
      .filter(item => 
        item !== null && 
        item.volume.touchesPerGame >= 10 && // High volume (lowered)
        item.volume.gamesPlayed >= 6 // Durability (lowered)
      )
      .sort((a, b) => b!.volume.touchesPerGame - a!.volume.touchesPerGame)
      .map(item => item!.player);
  }
  
  /**
   * Get player's 2024 volume pattern
   */
  getPlayerVolumePattern(player: ExtendedPlayer): PlayerVolume | undefined {
    let volume = this.playerVolumes2024.get(player.name.toLowerCase());
    if (!volume) {
      const simpleName = player.name.replace(/ (Jr\.|III|II|IV|Sr\.)$/i, '').toLowerCase();
      volume = this.playerVolumes2024.get(simpleName);
    }
    return volume;
  }
  
  /**
   * Compare 2023 vs 2024 volume for trend analysis
   */
  getYearOverYearTrend(player: ExtendedPlayer): {
    trend: string;
    touchesChange: number;
    targetsChange: number;
    roleChange: string;
  } {
    const volume2024 = this.playerVolumes2024.get(player.name.toLowerCase());
    const volume2023 = this.playerVolumes2023.get(player.name.toLowerCase());
    
    if (!volume2024 || !volume2023) {
      return {
        trend: 'Unknown',
        touchesChange: 0,
        targetsChange: 0,
        roleChange: 'Unknown'
      };
    }
    
    const touchesChange = volume2024.touchesPerGame - volume2023.touchesPerGame;
    const targetsChange = volume2024.targetsPerGame - volume2023.targetsPerGame;
    
    let trend = 'Stable';
    if (touchesChange > 3) trend = 'Ascending';
    else if (touchesChange < -3) trend = 'Declining';
    
    let roleChange = 'Same Role';
    if (targetsChange > 2) roleChange = 'Increased Passing Work';
    else if (volume2024.carriesPerGame - volume2023.carriesPerGame > 3) roleChange = 'Increased Rushing Work';
    else if (touchesChange < -3) roleChange = 'Reduced Role';
    
    return {
      trend,
      touchesChange,
      targetsChange,
      roleChange
    };
  }
  
  /**
   * Get volume data for a specific player (for CVS calculation)
   * Returns most recent season data if available with momentum calculated from YoY
   */
  getPlayerVolumeData(playerName: string): PlayerVolume | null {
    if (!this.isInitialized) return null;
    
    // Try 2024 data first (most recent)
    let volumeData = this.playerVolumes2024.get(playerName);
    const volume2023 = this.playerVolumes2023.get(playerName);
    
    // If we have both years, calculate real momentum from canonical data
    if (volumeData && volume2023) {
      // Calculate year-over-year percentage change for meaningful comparison
      // This accounts for different baseline usage levels
      const prevTouches = volume2023.touchesPerGame;
      const currTouches = volumeData.touchesPerGame;
      
      let percentChange = 0;
      if (prevTouches > 0) {
        // Calculate percentage change: ((new - old) / old) * 100
        percentChange = ((currTouches - prevTouches) / prevTouches) * 100;
      } else if (currTouches > 0) {
        // If player had 0 touches in 2023 but has touches in 2024, that's +100% (max increase)
        percentChange = 100;
      }
      
      // For PPR leagues, also consider target share changes
      const prevTargets = volume2023.targetsPerGame;
      const currTargets = volumeData.targetsPerGame;
      let targetPercentChange = 0;
      
      if (prevTargets > 0) {
        targetPercentChange = ((currTargets - prevTargets) / prevTargets) * 100;
      } else if (currTargets > 0) {
        targetPercentChange = 100;
      }
      
      // Weighted average: 70% touches, 30% targets (since PPR league)
      // This gives appropriate weight to receiving work in PPR scoring
      const momentum = (percentChange * 0.7) + (targetPercentChange * 0.3);
      
      // Cap at -100 to 100 (representing -100% to +100% change)
      volumeData.momentumScore = Math.max(-100, Math.min(100, momentum));
    }
    
    // Fallback to 2023 if no 2024 data
    if (!volumeData) {
      volumeData = this.playerVolumes2023.get(playerName);
      // No momentum calculation possible with only one year
    }
    
    return volumeData || null;
  }
}

export const volumePatternsService = new VolumePatternsService();