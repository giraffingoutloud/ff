// Manual age corrections for players with missing data (age=0)
// Based on actual player ages for 2025 season

export const AGE_CORRECTIONS: Record<string, number> = {
  // Players identified with age=0 that need correction
  'Kenneth Walker III': 24,     // Born Oct 2000
  'Brian Thomas Jr.': 22,       // Born Nov 2002  
  'Marvin Harrison Jr.': 22,    // Born Aug 2002
  'D.K. Metcalf': 27,          // Born Dec 1997
  'Michael Pittman Jr.': 27,    // Born Oct 1997
  'Travis Hunter': 21,          // Born May 2003
  'Tetairoa McMillan': 22,     // Born Mar 2003
  'TreVeyon Henderson': 22,     // Born Sep 2002
  'Omarion Hampton': 21,        // Born 2003
  'RJ Harvey': 21,              // Born 2003
  
  // Other known players who might have age issues
  'CeeDee Lamb': 26,            // Born Apr 1999
  'Justin Jefferson': 26,       // Born Jun 1999
  'Ja\'Marr Chase': 25,         // Born Mar 2000
  'Jaylen Waddle': 26,          // Born Nov 1998
  'Chris Olave': 25,            // Born Jun 2000
  'Garrett Wilson': 25,         // Born Jul 2000
  'Drake London': 24,           // Born Jul 2001
  'Treylon Burks': 25,          // Born Mar 2000
  'George Pickens': 24,         // Born Mar 2001
  'Jahan Dotson': 25,           // Born Mar 2000
  
  // Players flagged in validation report
  'Travis Etienne Jr.': 25,      // Born Jan 26, 1999
  'Michael Penix Jr.': 24,       // Born May 9, 2000  
  'Calvin Austin III': 25,       // Born March 24, 1999
  'Ollie Gordon II': 21,         // 2025 prospect (estimate)
  'Tre Harris': 22,              // 2025 prospect (estimate)
  'Andres Borregales': 24,       // Kicker (estimate)
};

export function correctPlayerAge(player: any): number {
  // First check manual corrections
  if (AGE_CORRECTIONS[player.name]) {
    return AGE_CORRECTIONS[player.name];
  }
  
  // If player has a valid age (not 0 or undefined), use it
  if (player.age && player.age > 0) {
    return player.age;
  }
  
  // For DST and K, age doesn't matter (return 0)
  if (player.position === 'DST' || player.position === 'K') {
    return 0;
  }
  
  // Default to 0 (unknown) if we can't determine age
  return 0;
}