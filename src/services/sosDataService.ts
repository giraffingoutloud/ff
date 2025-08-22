/**
 * Strength of Schedule Data Service
 * Loads and provides SOS data from canonical CSV files
 */

import { Position } from '../types';

interface SOSData {
  team: string;
  weeklyScores: number[];
  seasonSOS: number;
  playoffsSOS: number;
  allSOS: number;
}

export class SOSDataService {
  private sosData: Map<string, SOSData> = new Map();
  private isInitialized = false;
  
  /**
   * Parse SOS CSV data and initialize the service
   */
  async initialize(csvContent: string): Promise<void> {
    if (this.isInitialized) return;
    
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = this.parseCSVLine(line);
      
      if (values.length < 24) continue;
      
      const team = values[0].replace(/"/g, '').trim();
      if (!team || team === 'Offense') continue;
      
      // Parse weekly scores (weeks 1-17)
      const weeklyScores: number[] = [];
      for (let week = 1; week <= 17; week++) {
        const value = values[week].replace(/"/g, '').trim();
        weeklyScores.push(value === '' ? 0 : parseFloat(value));
      }
      
      // Parse season and playoff SOS
      const seasonSOS = parseFloat(values[19]?.replace(/"/g, '').trim() || '0');
      const playoffsSOS = parseFloat(values[21]?.replace(/"/g, '').trim() || '0');
      const allSOS = parseFloat(values[23]?.replace(/"/g, '').trim() || '0');
      
      // Map SOS abbreviations to standard NFL abbreviations used in player data
      // The SOS CSV uses non-standard abbreviations that need mapping
      const teamMappings: Record<string, string[]> = {
        'ARZ': ['ARI', 'ARZ', 'AZ'],  // Arizona Cardinals
        'BLT': ['BAL', 'BLT'],         // Baltimore Ravens  
        'HST': ['HOU', 'HST'],         // Houston Texans
        'CLV': ['CLE', 'CLV'],         // Cleveland Browns
        'JAX': ['JAX', 'JAC'],         // Jacksonville Jaguars
        'LA': ['LAR', 'LA', 'LAR'],    // Los Angeles Rams
        'GB': ['GB', 'GBP'],           // Green Bay Packers
        'SF': ['SF', 'SFO'],           // San Francisco 49ers
        'NO': ['NO', 'NOS'],           // New Orleans Saints
        'NE': ['NE', 'NEP'],           // New England Patriots
        'KC': ['KC', 'KCC'],           // Kansas City Chiefs
        'TB': ['TB', 'TBB'],           // Tampa Bay Buccaneers
        'LV': ['LV', 'LVR', 'OAK'],    // Las Vegas Raiders (was Oakland)
        'WAS': ['WAS', 'WSH']          // Washington Commanders
      };
      
      // Store data with all possible abbreviations
      const teams = teamMappings[team] || [team];
      teams.forEach(t => {
        this.sosData.set(t, {
          team: t,
          weeklyScores,
          seasonSOS,
          playoffsSOS,
          allSOS
        });
      });
    }
    
    this.isInitialized = true;
    console.log(`Loaded SOS data for ${this.sosData.size} teams`);
  }
  
  /**
   * Parse a CSV line handling commas within quotes
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current) {
      values.push(current);
    }
    
    return values;
  }
  
  /**
   * Get SOS score for a team (0-100 scale where higher is easier)
   * Raw scores are 0-10, we convert to 0-100 for evaluation engine
   * Note: Only uses regular season SOS as fantasy ends with regular season
   */
  getTeamSOS(team: string): number | null {
    if (!this.isInitialized) {
      console.warn('SOS service not initialized');
      return null; // No fake default - return null if no data
    }
    
    const data = this.sosData.get(team.toUpperCase());
    if (!data) {
      // Team might be using different abbreviation, try common alternatives
      const alternativeTeams = {
        'ARI': 'ARZ', 'ARZ': 'ARI',
        'BAL': 'BLT', 'BLT': 'BAL',
        'CLE': 'CLV', 'CLV': 'CLE',
        'HOU': 'HST', 'HST': 'HOU',
        'JAX': 'JAC', 'JAC': 'JAX',
        'LAR': 'LA', 'LA': 'LAR'
      };
      const altTeam = alternativeTeams[team.toUpperCase()];
      if (altTeam) {
        const altData = this.sosData.get(altTeam);
        if (altData) {
          return this.calculateSOSScore(altData);
        }
      }
      console.warn(`No SOS data for team: ${team}`);
      return null; // No fake default - return null if no data
    }
    
    return this.calculateSOSScore(data);
  }
  
  /**
   * Calculate SOS score from data
   */
  private calculateSOSScore(data: SOSData): number {
    // Always use regular season SOS (fantasy ends with regular season)
    const rawScore = data.seasonSOS;
    
    // Convert from 0-10 scale to 0-100 scale
    // Note: In the data, lower values mean easier schedule
    // We want to return higher scores for easier schedules
    const normalizedScore = (10 - rawScore) * 10;
    
    return Math.max(0, Math.min(100, normalizedScore));
  }
  
  /**
   * Get SOS for specific weeks (useful for fantasy playoff weeks 15-17)
   */
  getWeeklySOS(team: string, weeks: number[]): number | null {
    if (!this.isInitialized) return null;
    
    const data = this.sosData.get(team.toUpperCase());
    if (!data) return null;
    
    let totalScore = 0;
    let validWeeks = 0;
    
    for (const week of weeks) {
      if (week >= 1 && week <= 17) {
        const weekScore = data.weeklyScores[week - 1];
        if (weekScore > 0) {
          totalScore += weekScore;
          validWeeks++;
        }
      }
    }
    
    if (validWeeks === 0) return null;
    
    const avgScore = totalScore / validWeeks;
    // Convert from 0-10 to 0-100 scale (inverted)
    return Math.max(0, Math.min(100, (10 - avgScore) * 10));
  }
  
  /**
   * Get position-specific SOS adjustments
   * Different positions are affected differently by opponent strength
   */
  getPositionAdjustedSOS(team: string, position: Position): number | null {
    const baseSOS = this.getTeamSOS(team);
    if (baseSOS === null) return null;
    
    // Position-specific multipliers for SOS impact
    const positionMultipliers: Record<Position, number> = {
      QB: 0.8,   // QBs less affected by opponent strength
      RB: 1.2,   // RBs most affected by defensive fronts
      WR: 1.0,   // WRs moderately affected
      TE: 0.9,   // TEs slightly less affected
      K: 0.7,    // Kickers least affected by opponent
      DST: 1.5   // DST most affected by opponent offense
    };
    
    const multiplier = positionMultipliers[position] || 1.0;
    
    // Adjust from middle point (50)
    const adjustment = (baseSOS - 50) * multiplier;
    return Math.max(0, Math.min(100, 50 + adjustment));
  }
  
  /**
   * Get all teams with their SOS rankings
   */
  getSOSRankings(): Array<{team: string, sos: number}> {
    const rankings: Array<{team: string, sos: number}> = [];
    
    // Get unique teams (avoid duplicates from mappings)
    const processedTeams = new Set<string>();
    
    this.sosData.forEach((data, team) => {
      // Skip alternate abbreviations
      if (team === 'ARZ' || team === 'BLT' || team === 'HST' || team === 'CLV' || team === 'JAC') {
        return;
      }
      
      if (!processedTeams.has(data.team)) {
        processedTeams.add(data.team);
        rankings.push({
          team: data.team,
          sos: this.getTeamSOS(data.team)
        });
      }
    });
    
    // Sort by SOS (higher is easier)
    return rankings.sort((a, b) => b.sos - a.sos);
  }
  
  /**
   * Get fantasy playoff weeks SOS (weeks 15-17)
   * This is different from NFL playoffs - these are fantasy playoff weeks
   */
  getFantasyPlayoffSOS(team: string): number {
    // Fantasy playoffs typically occur in weeks 15-17 of regular season
    return this.getWeeklySOS(team, [15, 16, 17]);
  }
  
  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton
export const sosDataService = new SOSDataService();