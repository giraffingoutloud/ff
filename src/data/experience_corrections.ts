// Experience corrections for players with incorrect or missing data
// These are 2024 draft class players who should have 1 year experience in 2025

export const EXPERIENCE_CORRECTIONS: { [key: string]: number } = {
  // 2024 Draft Class (1 year experience in 2025)
  'Brian Thomas Jr.': 1,
  'Marvin Harrison Jr.': 1,
  'Malik Nabers': 1,
  'Rome Odunze': 1,
  'Brock Bowers': 1,
  'Ladd McConkey': 1,
  'Keon Coleman': 1,
  'Xavier Worthy': 1,
  'Ricky Pearsall': 1,
  'J.J. McCarthy': 1,
  'Bo Nix': 1,
  'Caleb Williams': 1,
  'Jayden Daniels': 1,
  'Drake Maye': 1,
  'Michael Penix Jr.': 1,
  'Jonathon Brooks': 1,
  'Trey Benson': 1,
  'Blake Corum': 1,
  'Ray Davis': 1,
  'Audric Estime': 1,
  'Jaylen Wright': 1,
  'MarShawn Lloyd': 1,
  'Isaiah Davis': 1,
  'Kimani Vidal': 1,
  
  // Add more as needed
};

export function correctPlayerExperience(player: { name: string, experience: number }): number {
  const correction = EXPERIENCE_CORRECTIONS[player.name];
  if (correction !== undefined) {
    return correction;
  }
  return player.experience || 0;
}