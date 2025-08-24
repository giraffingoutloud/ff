/**
 * Corrected Time Services
 * UTC-only handling to avoid timezone ambiguity
 */

import { PlayerProjection } from '../domain/typesCorrected';

/**
 * Check if player's game has started
 */
export function isLocked(p: PlayerProjection, nowUTC: Date): boolean {
  const k = new Date(p.game.kickoffTimeUTC).getTime();
  return k <= nowUTC.getTime();
}

/**
 * Filter roster for eligible players
 */
export function filterEligible(
  roster: PlayerProjection[],
  week: number,
  byeWeeks: Map<string, number>,
  nowUTC: Date,
  locked: Set<string>,
  excluded: Set<string>
): PlayerProjection[] {
  return roster.filter(p => {
    // Excluded players
    if (excluded.has(p.player.id)) return false;
    
    // Locked players must be included
    if (locked.has(p.player.id)) return true;
    
    // Bye week check
    if (byeWeeks.get(p.player.team) === week) return false;
    
    // Injury status
    if (p.player.status === 'OUT') return false;
    
    // Game lock check
    return !isLocked(p, nowUTC);
  });
}