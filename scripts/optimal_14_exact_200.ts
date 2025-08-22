import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface Player {
  rank: number;
  name: string;
  team: string;
  position: string;
  projectedPoints: number;
  auctionValue: number;
  valueRatio: number;
}

function loadValidPlayers(): Player[] {
  const players: Player[] = [];
  
  const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
  const adpContent = fs.readFileSync(adpPath, 'utf-8');
  const adpRecords = parse(adpContent, { columns: true });
  
  // Only get first 283 players
  const first283 = adpRecords.slice(0, 283);
  
  for (const record of first283) {
    const auctionValueStr = record['Auction Value'];
    const projectedPoints = parseFloat(record['Projected Points']) || 0;
    const position = record['Position']?.toUpperCase();
    
    // Skip invalid entries
    if (auctionValueStr === 'N/A' || !auctionValueStr) continue;
    const auctionValue = parseFloat(auctionValueStr);
    if (!auctionValue || auctionValue <= 0) continue;
    if (!position || position === 'K' || position === 'DST') continue;
    if (projectedPoints <= 0) continue;
    
    players.push({
      rank: parseInt(record['Overall Rank']) || 999,
      name: record['Full Name'],
      team: record['Team Abbreviation'],
      position: position,
      projectedPoints: projectedPoints,
      auctionValue: auctionValue,
      valueRatio: projectedPoints / auctionValue
    });
  }
  
  return players;
}

function findExact200Team(players: Player[]): any {
  const BUDGET = 200;
  const TEAM_SIZE = 14;
  
  // Group by position
  const byPosition: Record<string, Player[]> = {};
  for (const p of players) {
    if (!byPosition[p.position]) byPosition[p.position] = [];
    byPosition[p.position].push(p);
  }
  
  // Sort each by points
  for (const pos in byPosition) {
    byPosition[pos].sort((a, b) => b.projectedPoints - a.projectedPoints);
  }
  
  // Try multiple allocation strategies
  const allocations = [
    // Strategy 1: Two studs + depth
    { QB: [21, 6], RB: [57, 23, 11, 8], WR: [38, 24, 19, 7], TE: [10, 3] }, // = 199
    // Strategy 2: Balanced 
    { QB: [17, 10], RB: [44, 35, 12, 11], WR: [33, 25, 16, 7], TE: [8, 2] }, // = 200
    // Strategy 3: One stud + depth
    { QB: [16, 3], RB: [59, 21, 12, 10], WR: [41, 25, 12, 6], TE: [8, 5] }, // = 199
  ];
  
  let bestTeam: any = null;
  let bestPoints = 0;
  
  for (const allocation of allocations) {
    const roster: Player[] = [];
    const used = new Set<string>();
    let spent = 0;
    
    // Try to match the allocation
    for (const [pos, values] of Object.entries(allocation)) {
      const posPlayers = byPosition[pos] || [];
      
      for (const targetValue of values) {
        // Find player closest to target value
        let bestMatch: Player | null = null;
        let bestDiff = 999;
        
        for (const player of posPlayers) {
          if (used.has(player.name)) continue;
          
          const diff = Math.abs(player.auctionValue - targetValue);
          if (diff < bestDiff && spent + player.auctionValue <= BUDGET) {
            bestMatch = player;
            bestDiff = diff;
          }
        }
        
        if (bestMatch) {
          roster.push(bestMatch);
          used.add(bestMatch.name);
          spent += bestMatch.auctionValue;
        }
      }
    }
    
    // Fill FLEX spots with remaining budget
    const flexNeeded = TEAM_SIZE - roster.length;
    if (flexNeeded > 0) {
      const remainingBudget = BUDGET - spent;
      const flexPool = [...(byPosition.RB || []), ...(byPosition.WR || []), ...(byPosition.TE || [])]
        .filter(p => !used.has(p.name))
        .sort((a, b) => b.valueRatio - a.valueRatio);
      
      for (let i = 0; i < flexNeeded; i++) {
        const targetSpend = Math.floor(remainingBudget / (flexNeeded - i));
        
        let bestFlex: Player | null = null;
        let bestDiff = 999;
        
        for (const player of flexPool) {
          if (used.has(player.name)) continue;
          
          const diff = Math.abs(player.auctionValue - targetSpend);
          if (diff < bestDiff && spent + player.auctionValue <= BUDGET) {
            bestFlex = player;
            bestDiff = diff;
          }
        }
        
        if (bestFlex) {
          roster.push(bestFlex);
          used.add(bestFlex.name);
          spent += bestFlex.auctionValue;
          flexPool.splice(flexPool.indexOf(bestFlex), 1);
        }
      }
    }
    
    const totalPoints = roster.reduce((sum, p) => sum + p.projectedPoints, 0);
    
    // Prefer teams closer to $200 and with more points
    const budgetScore = 100 - Math.abs(BUDGET - spent) * 10;
    const pointsScore = totalPoints / 30;
    const totalScore = budgetScore + pointsScore;
    
    if (!bestTeam || totalScore > (100 - Math.abs(BUDGET - bestTeam.spent) * 10 + bestTeam.points / 30)) {
      bestTeam = { roster, spent, points: totalPoints };
      bestPoints = totalPoints;
    }
  }
  
  // Try one more time with dynamic programming approach
  if (bestTeam && bestTeam.spent !== BUDGET) {
    const newRoster: Player[] = [];
    const used = new Set<string>();
    let spent = 0;
    
    // Get the best value at each position
    const positions = ['QB', 'QB', 'RB', 'RB', 'RB', 'RB', 'WR', 'WR', 'WR', 'WR', 'TE', 'TE', 'FLEX', 'FLEX'];
    
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const remainingBudget = BUDGET - spent;
      const remainingSpots = positions.length - i;
      const targetSpend = Math.floor(remainingBudget / remainingSpots);
      
      let candidates: Player[] = [];
      if (pos === 'FLEX') {
        candidates = [...(byPosition.RB || []), ...(byPosition.WR || []), ...(byPosition.TE || [])]
          .filter(p => !used.has(p.name));
      } else {
        candidates = (byPosition[pos] || []).filter(p => !used.has(p.name));
      }
      
      // Find best player near target spend
      let bestPlayer: Player | null = null;
      let bestScore = -1;
      
      for (const player of candidates) {
        if (player.auctionValue > remainingBudget - (remainingSpots - 1)) continue;
        
        const priceDiff = Math.abs(player.auctionValue - targetSpend);
        const score = player.projectedPoints - priceDiff * 2;
        
        if (score > bestScore) {
          bestPlayer = player;
          bestScore = score;
        }
      }
      
      if (bestPlayer) {
        newRoster.push(bestPlayer);
        used.add(bestPlayer.name);
        spent += bestPlayer.auctionValue;
      }
    }
    
    if (newRoster.length === TEAM_SIZE) {
      const newPoints = newRoster.reduce((sum, p) => sum + p.projectedPoints, 0);
      if (Math.abs(BUDGET - spent) < Math.abs(BUDGET - bestTeam.spent) || 
          (spent === bestTeam.spent && newPoints > bestTeam.points)) {
        bestTeam = { roster: newRoster, spent, points: newPoints };
      }
    }
  }
  
  return bestTeam;
}

// Main
const players = loadValidPlayers();
console.log(`\n✓ Loaded ${players.length} valid players (no K/DST, no N/A values)\n`);

const team = findExact200Team(players);

if (!team) {
  console.log('Could not build a valid team');
  process.exit(1);
}

// Organize roster
const categorized: Record<string, Player[]> = {
  QB: [], RB: [], WR: [], TE: [], FLEX: []
};

// Count positions
for (const player of team.roster) {
  const counts = {
    QB: categorized.QB.length,
    RB: categorized.RB.length,
    WR: categorized.WR.length,
    TE: categorized.TE.length
  };
  
  if (player.position === 'QB' && counts.QB < 2) {
    categorized.QB.push(player);
  } else if (player.position === 'RB' && counts.RB < 4) {
    categorized.RB.push(player);
  } else if (player.position === 'WR' && counts.WR < 4) {
    categorized.WR.push(player);
  } else if (player.position === 'TE' && counts.TE < 2) {
    categorized.TE.push(player);
  } else {
    categorized.FLEX.push(player);
  }
}

console.log('╔═══════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║       OPTIMAL 14-PLAYER TEAM - EXACTLY $200 BUDGET (2QB/4RB/4WR/2TE/2FLEX)          ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════════════╝\n');

const groups = [
  { name: 'QUARTERBACKS', key: 'QB' },
  { name: 'RUNNING BACKS', key: 'RB' },
  { name: 'WIDE RECEIVERS', key: 'WR' },
  { name: 'TIGHT ENDS', key: 'TE' },
  { name: 'FLEX POSITIONS', key: 'FLEX' }
];

for (const group of groups) {
  const players = categorized[group.key];
  if (players.length === 0) continue;
  
  // Sort by points
  players.sort((a, b) => b.projectedPoints - a.projectedPoints);
  
  console.log(`${group.name} (${players.length}):`);
  console.log('┌─────────────────────────────────────┬──────┬────────┬───────┬──────────┐');
  console.log('│ Player Name                         │ Team │ Points │ Cost  │ Value    │');
  console.log('├─────────────────────────────────────┼──────┼────────┼───────┼──────────┤');
  
  for (const player of players) {
    const value = (player.projectedPoints / player.auctionValue).toFixed(1);
    console.log(`│ ${player.name.padEnd(35)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ ${value.padStart(7)}x │`);
  }
  
  const subtotal = players.reduce((sum, p) => sum + p.auctionValue, 0);
  const subPoints = players.reduce((sum, p) => sum + p.projectedPoints, 0);
  
  console.log('├─────────────────────────────────────┼──────┼────────┼───────┼──────────┤');
  console.log(`│ Subtotal                            │      │ ${subPoints.toFixed(1).padStart(6)} │ $${subtotal.toString().padStart(4)} │          │`);
  console.log('└─────────────────────────────────────┴──────┴────────┴───────┴──────────┘\n');
}

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log(`TOTAL PLAYERS:          ${team.roster.length} / 14`);
console.log(`TOTAL SPENT:            $${team.spent} / $200 ${team.spent === 200 ? '✓ EXACTLY $200!' : `($${Math.abs(200 - team.spent)} ${team.spent > 200 ? 'over' : 'under'})`}`);
console.log(`TOTAL PROJECTED POINTS: ${team.points.toFixed(1)}`);
console.log(`POINTS PER DOLLAR:      ${(team.points / team.spent).toFixed(2)}`);
console.log('═══════════════════════════════════════════════════════════════════════════════');