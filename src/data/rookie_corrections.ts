// Corrections for rookie status based on actual NFL draft years
// This overrides incorrect data from the CSV files

export const ROOKIE_CORRECTIONS = {
  // Players incorrectly marked as rookies (they're 2024 draft class, not 2025)
  notRookies: [
    'J.J. McCarthy',  // Drafted 2024 by Vikings
    'Bo Nix',         // Drafted 2024 by Broncos
  ],
  
  // Actual 2025 rookies who should have the badge
  actualRookies: [
    'Ashton Jeanty',
    'Tyler Warren', 
    'Colston Loveland',
    // Note: Most other 2025 rookies aren't in our player pool yet
    // as they haven't been drafted to NFL teams
  ],
  
  // Veterans who definitely should NOT be rookies (safety check)
  definitelyNotRookies: [
    'Kenneth Walker III',  // Drafted 2022
    'D.K. Metcalf',        // Drafted 2019
    'Brian Thomas Jr.',    // Drafted 2024
    'Marvin Harrison Jr.', // Drafted 2024
    'Travis Hunter',       // Drafted 2024
    'Tetairoa McMillan',   // Drafted 2024
    'TreVeyon Henderson',  // Not even drafted yet
    'Omarion Hampton',     // Not drafted yet
    'RJ Harvey',           // Not drafted yet
  ]
};

export function correctRookieStatus(player: any): boolean {
  const name = player.name;
  
  // Force these to NOT be rookies
  if (ROOKIE_CORRECTIONS.notRookies.includes(name) || 
      ROOKIE_CORRECTIONS.definitelyNotRookies.includes(name)) {
    return false;
  }
  
  // Force these TO BE rookies
  if (ROOKIE_CORRECTIONS.actualRookies.includes(name)) {
    return true;
  }
  
  // For everyone else, trust the CSV data
  return player.isRookie === true;
}