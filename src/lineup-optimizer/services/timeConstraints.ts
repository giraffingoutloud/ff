/**
 * Temporal Constraints with UTC-only handling
 * No timezone ambiguity - all times in UTC
 */
import { PlayerProjection } from '../types';

/**
 * 2024 NFL Bye Weeks
 */
const BYE_WEEKS_2024 = new Map<string, number>([
  // Week 5
  ['DET', 5], ['LAC', 5], ['PHI', 5], ['TEN', 5],
  // Week 6
  ['KC', 6], ['LAR', 6], ['MIA', 6], ['MIN', 6],
  // Week 7
  ['CHI', 7], ['DAL', 7],
  // Week 9
  ['CLE', 9], ['GB', 9], ['LV', 9], ['SEA', 9],
  // Week 10
  ['NE', 10], ['PIT', 10],
  // Week 11
  ['ARI', 11], ['CAR', 11], ['NYG', 11], ['TB', 11],
  // Week 12
  ['ATL', 12], ['BUF', 12], ['CIN', 12], ['JAX', 12], ['NO', 12], ['NYJ', 12],
  // Week 13
  ['BAL', 13], ['DEN', 13], ['HOU', 13], ['IND', 13], ['WAS', 13],
  // Week 14
  ['SF', 14]
]);

/**
 * Check if player is locked (game already started)
 */
export function isLocked(
  p: PlayerProjection,
  nowUTC: Date
): boolean {
  // Get kickoff time from various possible fields
  const kickoffStr = p.gameInfo?.kickoffTimeUTC || 
                     p.gameInfo?.gameTime?.toISOString() ||
                     p.gameInfo?.kickoffTime?.toISOString();
  
  if (!kickoffStr) {
    // No kickoff time, assume not locked
    return false;
  }
  
  const kickoff = new Date(kickoffStr);
  return kickoff.getTime() <= nowUTC.getTime();
}

/**
 * Check if player is on bye
 */
export function isOnBye(
  player: PlayerProjection,
  week: number,
  year: number = 2024
): boolean {
  // Use 2024 bye weeks for now
  // In production, load from external source per year
  if (year !== 2024) {
    console.warn(`Bye week data not available for ${year}, using 2024`);
  }
  
  const teamBye = BYE_WEEKS_2024.get(player.player.team);
  return teamBye === week;
}

/**
 * Filter eligible players (not on bye, not OUT, not locked)
 */
export function filterEligible(
  roster: PlayerProjection[],
  week: number,
  nowUTC: Date,
  year: number = 2024
): PlayerProjection[] {
  return roster.filter(p => {
    // Check bye week
    if (isOnBye(p, week, year)) {
      return false;
    }
    
    // Check injury status
    if (p.player.status === 'out' || p.player.status === 'ir') {
      return false;
    }
    
    // Check if locked (game started)
    if (isLocked(p, nowUTC)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Get game day from kickoff time
 */
export function getGameDay(
  kickoffTimeUTC: string | Date | undefined
): 'THU' | 'SUN' | 'MON' | 'SAT' | 'TUE' | 'WED' | null {
  if (!kickoffTimeUTC) return null;
  
  const kickoff = new Date(kickoffTimeUTC);
  const utcDay = kickoff.getUTCDay();
  
  switch (utcDay) {
    case 0: return 'SUN';
    case 1: return 'MON';
    case 2: return 'TUE';
    case 3: return 'WED';
    case 4: return 'THU';
    case 5: return 'SAT'; // Rare but happens
    case 6: return 'SAT';
    default: return null;
  }
}

/**
 * Group players by game timing
 */
export function groupByGameTime(
  players: PlayerProjection[]
): {
  thursday: PlayerProjection[];
  saturday: PlayerProjection[];
  sunday: PlayerProjection[];
  monday: PlayerProjection[];
  other: PlayerProjection[];
} {
  const groups = {
    thursday: [] as PlayerProjection[],
    saturday: [] as PlayerProjection[],
    sunday: [] as PlayerProjection[],
    monday: [] as PlayerProjection[],
    other: [] as PlayerProjection[]
  };
  
  for (const player of players) {
    const kickoff = player.gameInfo?.kickoffTimeUTC || 
                   player.gameInfo?.gameTime?.toISOString();
    const day = getGameDay(kickoff);
    
    switch (day) {
      case 'THU':
        groups.thursday.push(player);
        break;
      case 'SAT':
        groups.saturday.push(player);
        break;
      case 'SUN':
        groups.sunday.push(player);
        break;
      case 'MON':
        groups.monday.push(player);
        break;
      default:
        groups.other.push(player);
    }
  }
  
  return groups;
}

/**
 * Find replacement candidates for a player
 * Must play at same time or later
 */
export function findReplacements(
  player: PlayerProjection,
  bench: PlayerProjection[],
  nowUTC: Date
): PlayerProjection[] {
  const playerKickoff = player.gameInfo?.kickoffTimeUTC || 
                       player.gameInfo?.gameTime?.toISOString();
  
  if (!playerKickoff) {
    // No kickoff time, can't determine replacements
    return [];
  }
  
  const playerTime = new Date(playerKickoff).getTime();
  
  return bench.filter(b => {
    // Must be same position or FLEX-eligible
    const samePosition = b.player.position === player.player.position;
    const flexEligible = player.player.position === 'FLEX' &&
                        ['RB', 'WR', 'TE'].includes(b.player.position);
    
    if (!samePosition && !flexEligible) {
      return false;
    }
    
    // Must not be locked
    if (isLocked(b, nowUTC)) {
      return false;
    }
    
    // Must play at same time or later
    const benchKickoff = b.gameInfo?.kickoffTimeUTC || 
                        b.gameInfo?.gameTime?.toISOString();
    
    if (!benchKickoff) {
      return false;
    }
    
    const benchTime = new Date(benchKickoff).getTime();
    return benchTime >= playerTime;
  })
  .sort((a, b) => {
    // Sort by projected points descending
    const aPoints = a.projection?.mean || a.projection?.median || 0;
    const bPoints = b.projection?.mean || b.projection?.median || 0;
    return bPoints - aPoints;
  });
}

/**
 * Validate lineup for temporal constraints
 */
export function validateLineup(
  lineup: PlayerProjection[],
  week: number,
  nowUTC: Date,
  year: number = 2024
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const player of lineup) {
    // Check bye week
    if (isOnBye(player, week, year)) {
      errors.push(`${player.player.name} (${player.player.team}) is on bye week ${week}`);
    }
    
    // Check if locked
    if (isLocked(player, nowUTC)) {
      warnings.push(`${player.player.name}'s game has already started`);
    }
    
    // Check injury status
    if (player.player.status === 'doubtful') {
      warnings.push(`${player.player.name} is doubtful to play`);
    } else if (player.player.status === 'questionable') {
      warnings.push(`${player.player.name} is questionable`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get NFL week number from date
 * Week 1 starts on first Thursday of September
 */
export function getNFLWeek(
  date: Date,
  year: number = 2024
): number {
  // Simplified calculation
  // In production, use official NFL calendar
  const seasonStart = new Date(Date.UTC(year, 8, 5)); // Sept 5, 2024
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = Math.floor((date.getTime() - seasonStart.getTime()) / msPerWeek);
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}