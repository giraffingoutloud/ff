import { Player, PlayerProjection } from '../types';

/**
 * Manages game timing constraints for lineup decisions
 * Handles Thursday/Sunday/Monday timing and bye weeks
 */
export class GameTimingManager {
  private currentWeek: number;
  private currentYear: number;
  private byeWeeks: Map<string, number> = new Map();
  
  constructor(week: number, year: number = 2024) {
    this.currentWeek = week;
    this.currentYear = year;
    this.initializeByeWeeks(year);
  }
  
  /**
   * 2024 NFL Bye Weeks by team
   */
  private initializeByeWeeks(year: number): void {
    // Week 5 byes
    ['DET', 'LAC', 'PHI', 'TEN'].forEach(team => this.byeWeeks.set(team, 5));
    
    // Week 6 byes
    ['KC', 'LAR', 'MIA', 'MIN'].forEach(team => this.byeWeeks.set(team, 6));
    
    // Week 7 byes
    ['CHI', 'DAL'].forEach(team => this.byeWeeks.set(team, 7));
    
    // Week 9 byes
    ['CLE', 'GB', 'LV', 'SEA'].forEach(team => this.byeWeeks.set(team, 9));
    
    // Week 10 byes
    ['NE', 'PIT'].forEach(team => this.byeWeeks.set(team, 10));
    
    // Week 11 byes
    ['ARI', 'CAR', 'NYG', 'TB'].forEach(team => this.byeWeeks.set(team, 11));
    
    // Week 12 byes
    ['ATL', 'BUF', 'CIN', 'JAX', 'NO', 'NYJ'].forEach(team => this.byeWeeks.set(team, 12));
    
    // Week 13 byes
    ['BAL', 'DEN', 'HOU', 'IND', 'WAS'].forEach(team => this.byeWeeks.set(team, 13));
    
    // Week 14 byes
    ['SF'].forEach(team => this.byeWeeks.set(team, 14));
  }
  
  /**
   * Check if player is on bye this week
   */
  isOnBye(player: Player): boolean {
    const teamBye = this.byeWeeks.get(player.team);
    return teamBye === this.currentWeek;
  }
  
  /**
   * Filter out players on bye week
   */
  filterByeWeekPlayers(players: PlayerProjection[]): PlayerProjection[] {
    return players.filter(p => !this.isOnBye(p.player));
  }
  
  /**
   * Get game day for player (Thursday/Sunday/Monday)
   */
  getGameDay(player: Player, gameTime?: Date): 'THU' | 'SUN' | 'MON' | 'BYE' {
    if (this.isOnBye(player)) return 'BYE';
    
    if (!gameTime) return 'SUN'; // Default to Sunday
    
    // Convert to UTC for consistent day calculation
    const utcTime = new Date(gameTime.toISOString());
    const day = utcTime.getUTCDay();
    
    if (day === 4) return 'THU';  // Thursday
    if (day === 1) return 'MON';  // Monday
    return 'SUN';  // Sunday (0) or other
  }
  
  /**
   * Get locked players (games already started)
   */
  getLockedPlayers(
    players: PlayerProjection[],
    currentTime: Date = new Date()
  ): Set<string> {
    const locked = new Set<string>();
    const currentUTC = currentTime.getTime();
    
    for (const player of players) {
      const gameTime = player.gameInfo?.gameTime || player.gameInfo?.kickoffTime;
      if (gameTime) {
        const gameUTC = new Date(gameTime).getTime();
        if (gameUTC <= currentUTC) {
          locked.add(player.player.id);
        }
      }
    }
    
    return locked;
  }
  
  /**
   * Group players by game time for decision ordering
   */
  groupByGameTime(players: PlayerProjection[]): {
    thursday: PlayerProjection[];
    sunday: PlayerProjection[];
    monday: PlayerProjection[];
    bye: PlayerProjection[];
  } {
    const groups = {
      thursday: [] as PlayerProjection[],
      sunday: [] as PlayerProjection[],
      monday: [] as PlayerProjection[],
      bye: [] as PlayerProjection[]
    };
    
    for (const player of players) {
      const gameTime = player.gameInfo?.gameTime || player.gameInfo?.kickoffTime;
      const gameDay = this.getGameDay(
        player.player, 
        gameTime
      );
      
      switch (gameDay) {
        case 'THU':
          groups.thursday.push(player);
          break;
        case 'MON':
          groups.monday.push(player);
          break;
        case 'BYE':
          groups.bye.push(player);
          break;
        default:
          groups.sunday.push(player);
      }
    }
    
    return groups;
  }
  
  /**
   * Generate contingency plan for game-time decisions
   */
  generateContingencyPlan(
    primaryLineup: PlayerProjection[],
    benchPlayers: PlayerProjection[],
    uncertainPlayers: Set<string>
  ): Map<string, PlayerProjection[]> {
    const contingencies = new Map<string, PlayerProjection[]>();
    
    for (const playerId of uncertainPlayers) {
      const player = primaryLineup.find(p => p.player.id === playerId);
      if (!player) continue;
      
      // Find best replacement from bench at same position
      const replacements = benchPlayers
        .filter(b => {
          // Same position or FLEX eligible
          if (b.player.position === player.player.position) return true;
          if (player.player.position === 'FLEX') {
            return ['RB', 'WR', 'TE'].includes(b.player.position);
          }
          return false;
        })
        .filter(b => {
          // Must play at same time or later
          const playerTime = player.gameInfo?.gameTime || player.gameInfo?.kickoffTime;
          const replacementTime = b.gameInfo?.gameTime || b.gameInfo?.kickoffTime;
          const playerDay = this.getGameDay(player.player, playerTime);
          const replacementDay = this.getGameDay(b.player, replacementTime);
          
          if (playerDay === 'THU') return replacementDay === 'THU';
          if (playerDay === 'SUN') return ['SUN', 'MON'].includes(replacementDay);
          return replacementDay === 'MON';
        })
        .sort((a, b) => b.projection.median - a.projection.median)
        .slice(0, 2); // Top 2 replacements
      
      contingencies.set(playerId, replacements);
    }
    
    return contingencies;
  }
  
  /**
   * Check if lineup is valid (no bye week players)
   */
  validateLineup(
    lineup: PlayerProjection[],
    currentTime: Date = new Date()
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const currentUTC = currentTime.getTime();
    
    for (const player of lineup) {
      // Check bye week
      if (this.isOnBye(player.player)) {
        errors.push(`${player.player.name} is on bye week ${this.currentWeek}`);
      }
      
      // Check if game already started
      const gameTime = player.gameInfo?.gameTime || player.gameInfo?.kickoffTime;
      if (gameTime) {
        const gameUTC = new Date(gameTime).getTime();
        if (gameUTC <= currentUTC) {
          warnings.push(`${player.player.name}'s game has already started`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Get next game week start time (Tuesday 4 AM ET in UTC)
   */
  getWeekStartTime(week: number): Date {
    // NFL week starts Tuesday at 4 AM ET
    const seasonStart = new Date(Date.UTC(this.currentYear, 8, 3)); // Early September
    const weekOffset = (week - 1) * 7 * 24 * 60 * 60 * 1000;
    const weekStart = new Date(seasonStart.getTime() + weekOffset);
    
    // Adjust to Tuesday 4 AM ET (9 AM UTC)
    weekStart.setUTCHours(9, 0, 0, 0);
    while (weekStart.getUTCDay() !== 2) { // Tuesday
      weekStart.setDate(weekStart.getDate() + 1);
    }
    
    return weekStart;
  }
}