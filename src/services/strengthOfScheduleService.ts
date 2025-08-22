/**
 * Strength of Schedule Service
 * 
 * Analyzes 2025 NFL strength of schedule data to identify:
 * - Players with favorable playoff schedules
 * - Early season advantages
 * - Buy-low opportunities based on difficult early schedules
 */

import { ExtendedPlayer } from './pprAnalyzer';
import sosData from '../../canonical_data/strength_of_schedule/sos_2025.csv?raw';
import { parseCSV } from '../utils/csvParser';

interface TeamSchedule {
  team: string;
  weeklyRanks: number[]; // 1-32 ranking for each week (1 = easiest, 32 = hardest)
  seasonRank: number;
  playoffRank: number; // Weeks 15-17
  firstFourRank: number; // Weeks 1-4
  lastFourRank: number; // Weeks 14-17
  fantasyPlayoffRank: number; // Weeks 15-16 (most leagues)
  byeWeek: number;
}

class StrengthOfScheduleService {
  private scheduleData: Map<string, TeamSchedule> = new Map();
  private isInitialized = false;
  
  constructor() {
    this.initialize();
  }
  
  private initialize() {
    try {
      const rows = parseCSV(sosData);
    
    // Skip header row
    rows.slice(1).forEach(row => {
      const teamAbbr = this.mapTeamName(row.Offense || row.offense || row[0]);
      if (!teamAbbr) return;
      
      // Parse weekly rankings (columns 1-17 are weeks)
      const weeklyRanks: number[] = [];
      for (let week = 1; week <= 17; week++) {
        const value = row[week.toString()];
        if (value && value !== '') {
          // Convert SOS value to rank (lower value = easier schedule)
          weeklyRanks.push(parseFloat(value) || 0);
        } else {
          weeklyRanks.push(0); // Bye week
        }
      }
      
      // Find bye week (week with no value)
      const byeWeek = weeklyRanks.findIndex(rank => rank === 0) + 1;
      
      // Calculate various schedule strengths
      const seasonRank = this.parseRank(row['Season SOS']);
      const playoffRank = this.parseRank(row['Playoffs SOS']);
      
      // Calculate first 4 weeks average (excluding bye)
      const firstFour = weeklyRanks.slice(0, 4).filter(r => r > 0);
      const firstFourAvg = firstFour.length > 0 
        ? firstFour.reduce((a, b) => a + b, 0) / firstFour.length 
        : 16;
      
      // Calculate last 4 weeks average (weeks 14-17)
      const lastFour = weeklyRanks.slice(13, 17).filter(r => r > 0);
      const lastFourAvg = lastFour.length > 0
        ? lastFour.reduce((a, b) => a + b, 0) / lastFour.length
        : 16;
      
      // Calculate fantasy playoff weeks (15-16)
      const fantasyPlayoff = weeklyRanks.slice(14, 16).filter(r => r > 0);
      const fantasyPlayoffAvg = fantasyPlayoff.length > 0
        ? fantasyPlayoff.reduce((a, b) => a + b, 0) / fantasyPlayoff.length
        : 16;
      
      this.scheduleData.set(teamAbbr, {
        team: teamAbbr,
        weeklyRanks,
        seasonRank,
        playoffRank,
        firstFourRank: this.convertToRank(firstFourAvg),
        lastFourRank: this.convertToRank(lastFourAvg),
        fantasyPlayoffRank: this.convertToRank(fantasyPlayoffAvg),
        byeWeek
      });
    });
    
    this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize SOS service:', error);
      this.isInitialized = false;
    }
  }
  
  private parseRank(value: string | undefined): number {
    if (!value) return 16; // Default to middle
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 16 : this.convertToRank(parsed);
  }
  
  private convertToRank(sosValue: number): number {
    // Convert SOS value to 1-32 rank
    // Lower SOS value = easier schedule = better rank (closer to 1)
    // This is simplified - in reality we'd rank all teams
    if (sosValue <= 2) return Math.floor(sosValue * 2) + 1; // 1-5 (very easy)
    if (sosValue <= 4) return Math.floor(sosValue * 2) + 3; // 6-11 (easy)
    if (sosValue <= 6) return Math.floor(sosValue * 2) + 5; // 12-17 (average)
    if (sosValue <= 8) return Math.floor(sosValue * 2) + 7; // 18-23 (hard)
    return Math.min(32, Math.floor(sosValue * 2) + 9); // 24-32 (very hard)
  }
  
  private mapTeamName(teamStr: string): string {
    // Map full team names or abbreviations to standard 3-letter codes
    const mappings: Record<string, string> = {
      'ARZ': 'ARI', 'ARI': 'ARI', 'Cardinals': 'ARI', 'Arizona': 'ARI',
      'ATL': 'ATL', 'Falcons': 'ATL', 'Atlanta': 'ATL',
      'BLT': 'BAL', 'BAL': 'BAL', 'Ravens': 'BAL', 'Baltimore': 'BAL',
      'BUF': 'BUF', 'Bills': 'BUF', 'Buffalo': 'BUF',
      'CAR': 'CAR', 'Panthers': 'CAR', 'Carolina': 'CAR',
      'CHI': 'CHI', 'Bears': 'CHI', 'Chicago': 'CHI',
      'CIN': 'CIN', 'Bengals': 'CIN', 'Cincinnati': 'CIN',
      'CLV': 'CLE', 'CLE': 'CLE', 'Browns': 'CLE', 'Cleveland': 'CLE',
      'DAL': 'DAL', 'Cowboys': 'DAL', 'Dallas': 'DAL',
      'DEN': 'DEN', 'Broncos': 'DEN', 'Denver': 'DEN',
      'DET': 'DET', 'Lions': 'DET', 'Detroit': 'DET',
      'GB': 'GB', 'Packers': 'GB', 'Green Bay': 'GB',
      'HST': 'HOU', 'HOU': 'HOU', 'Texans': 'HOU', 'Houston': 'HOU',
      'IND': 'IND', 'Colts': 'IND', 'Indianapolis': 'IND',
      'JAX': 'JAX', 'JAC': 'JAX', 'Jaguars': 'JAX', 'Jacksonville': 'JAX',
      'KC': 'KC', 'Chiefs': 'KC', 'Kansas City': 'KC',
      'LA': 'LAR', 'LAR': 'LAR', 'Rams': 'LAR', 'Los Angeles Rams': 'LAR',
      'LAC': 'LAC', 'Chargers': 'LAC', 'Los Angeles Chargers': 'LAC',
      'LV': 'LV', 'Raiders': 'LV', 'Las Vegas': 'LV',
      'MIA': 'MIA', 'Dolphins': 'MIA', 'Miami': 'MIA',
      'MIN': 'MIN', 'Vikings': 'MIN', 'Minnesota': 'MIN',
      'NE': 'NE', 'Patriots': 'NE', 'New England': 'NE',
      'NO': 'NO', 'Saints': 'NO', 'New Orleans': 'NO',
      'NYG': 'NYG', 'Giants': 'NYG', 'New York Giants': 'NYG',
      'NYJ': 'NYJ', 'Jets': 'NYJ', 'New York Jets': 'NYJ',
      'PHI': 'PHI', 'Eagles': 'PHI', 'Philadelphia': 'PHI',
      'PIT': 'PIT', 'Steelers': 'PIT', 'Pittsburgh': 'PIT',
      'SEA': 'SEA', 'Seahawks': 'SEA', 'Seattle': 'SEA',
      'SF': 'SF', '49ers': 'SF', 'San Francisco': 'SF',
      'TB': 'TB', 'Buccaneers': 'TB', 'Tampa Bay': 'TB',
      'TEN': 'TEN', 'Titans': 'TEN', 'Tennessee': 'TEN',
      'WAS': 'WAS', 'Commanders': 'WAS', 'Washington': 'WAS'
    };
    
    return mappings[teamStr] || teamStr;
  }
  
  /**
   * Get players with best playoff schedules (weeks 15-17)
   */
  getPlayoffHeroes(players: ExtendedPlayer[]): ExtendedPlayer[] {
    if (!this.isInitialized) return [];
    return players
      .map(player => {
        const schedule = this.scheduleData.get(player.team);
        if (!schedule) return null;
        
        return {
          player,
          playoffRank: schedule.playoffRank,
          fantasyPlayoffRank: schedule.fantasyPlayoffRank
        };
      })
      .filter(item => item !== null && item.playoffRank <= 10) // Top 10 easiest
      .sort((a, b) => a!.playoffRank - b!.playoffRank)
      .map(item => item!.player);
  }
  
  /**
   * Get players with easiest first 4 weeks (fast starters)
   */
  getFastStarters(players: ExtendedPlayer[]): ExtendedPlayer[] {
    if (!this.isInitialized) return [];
    return players
      .map(player => {
        const schedule = this.scheduleData.get(player.team);
        if (!schedule) return null;
        
        return {
          player,
          firstFourRank: schedule.firstFourRank
        };
      })
      .filter(item => item !== null && item.firstFourRank <= 10)
      .sort((a, b) => a!.firstFourRank - b!.firstFourRank)
      .map(item => item!.player);
  }
  
  /**
   * Get players with tough early schedule but easy late (buy-low candidates)
   */
  getBuyLowSchedule(players: ExtendedPlayer[]): ExtendedPlayer[] {
    if (!this.isInitialized) return [];
    return players
      .map(player => {
        const schedule = this.scheduleData.get(player.team);
        if (!schedule) return null;
        
        const earlyDifficulty = schedule.firstFourRank;
        const lateDifficulty = schedule.lastFourRank;
        const improvement = earlyDifficulty - lateDifficulty; // Positive = gets easier
        
        return {
          player,
          improvement,
          earlyDifficulty,
          lateDifficulty
        };
      })
      .filter(item => 
        item !== null && 
        item.earlyDifficulty >= 20 && // Hard early schedule
        item.lateDifficulty <= 12 && // Easy late schedule
        item.improvement >= 10 // Significant improvement
      )
      .sort((a, b) => b!.improvement - a!.improvement)
      .map(item => item!.player);
  }
  
  /**
   * Get schedule difficulty for a specific team
   */
  getTeamSchedule(team: string): TeamSchedule | undefined {
    return this.scheduleData.get(team);
  }
  
  /**
   * Get schedule analysis for a player
   */
  getPlayerScheduleAnalysis(player: ExtendedPlayer): {
    seasonDifficulty: string;
    playoffDifficulty: string;
    firstFourDifficulty: string;
    trend: string;
    byeWeek: number;
  } {
    const schedule = this.scheduleData.get(player.team);
    if (!schedule) {
      return {
        seasonDifficulty: 'Unknown',
        playoffDifficulty: 'Unknown',
        firstFourDifficulty: 'Unknown',
        trend: 'Unknown',
        byeWeek: 0
      };
    }
    
    const getDifficultyLabel = (rank: number): string => {
      if (rank <= 8) return 'Very Easy';
      if (rank <= 12) return 'Easy';
      if (rank <= 20) return 'Average';
      if (rank <= 26) return 'Hard';
      return 'Very Hard';
    };
    
    const trend = schedule.firstFourRank > schedule.lastFourRank 
      ? 'Gets Easier' 
      : schedule.firstFourRank < schedule.lastFourRank 
        ? 'Gets Harder'
        : 'Consistent';
    
    return {
      seasonDifficulty: getDifficultyLabel(schedule.seasonRank),
      playoffDifficulty: getDifficultyLabel(schedule.playoffRank),
      firstFourDifficulty: getDifficultyLabel(schedule.firstFourRank),
      trend,
      byeWeek: schedule.byeWeek
    };
  }
}

export const sosService = new StrengthOfScheduleService();