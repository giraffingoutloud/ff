import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface Player {
  name: string;
  team: string;
  position: string;
  projectedPoints: number;
  auctionValue: number;
}

// Load players with auction values
function loadPlayers(): Player[] {
  const players: Player[] = [];
  
  // Load from ADP
  const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
  const adpContent = fs.readFileSync(adpPath, 'utf-8');
  const adpRecords = parse(adpContent, { columns: true });
  
  for (const record of adpRecords) {
    const projectedPoints = parseFloat(record['Projected Points']) || 0;
    const auctionValue = parseFloat(record['Auction Value']) || 1;
    const position = record['Position']?.toUpperCase();
    
    if (projectedPoints > 0 && auctionValue > 0 && position) {
      players.push({
        name: record['Full Name'],
        team: record['Team Abbreviation'],
        position: position,
        projectedPoints: projectedPoints,
        auctionValue: auctionValue
      });
    }
  }
  
  // Add a few top K and DST manually based on typical values
  players.push(
    { name: 'Justin Tucker', team: 'BAL', position: 'K', projectedPoints: 145, auctionValue: 2 },
    { name: 'Harrison Butker', team: 'KC', position: 'K', projectedPoints: 142, auctionValue: 1 },
    { name: 'Jake Elliott', team: 'PHI', position: 'K', projectedPoints: 140, auctionValue: 1 },
    { name: 'Bills DST', team: 'BUF', position: 'DST', projectedPoints: 120, auctionValue: 3 },
    { name: 'Cowboys DST', team: 'DAL', position: 'DST', projectedPoints: 115, auctionValue: 2 },
    { name: '49ers DST', team: 'SF', position: 'DST', projectedPoints: 118, auctionValue: 2 }
  );
  
  return players;
}

// Build optimal team spending exactly or close to $200
function buildOptimal200Team(players: Player[]): { roster: Player[], spent: number, points: number } {
  // Typical balanced auction strategy
  const targetSpending = {
    studs: 150,     // 3-4 elite players ($35-50 each)
    starters: 40,   // 4-5 mid-tier starters ($8-12 each)  
    bench: 10       // 7-8 bench players ($1-2 each)
  };
  
  const roster: Player[] = [];
  let totalSpent = 0;
  
  // Sort by points
  const sortedByPoints = [...players].sort((a, b) => b.projectedPoints - a.projectedPoints);
  
  // Get top players at each position
  const topQB = sortedByPoints.filter(p => p.position === 'QB').slice(0, 15);
  const topRB = sortedByPoints.filter(p => p.position === 'RB').slice(0, 30);
  const topWR = sortedByPoints.filter(p => p.position === 'WR').slice(0, 30);
  const topTE = sortedByPoints.filter(p => p.position === 'TE').slice(0, 15);
  
  // Build a balanced team
  // Strategy: 2-3 studs, solid starters, cheap bench
  
  // Get 2 elite RBs or WRs (biggest impact positions)
  const eliteTargets = [...topRB.slice(0, 10), ...topWR.slice(0, 10)]
    .filter(p => p.auctionValue >= 30)
    .sort((a, b) => b.projectedPoints - a.projectedPoints)
    .slice(0, 3);
  
  for (const player of eliteTargets) {
    if (roster.length < 2 && totalSpent + player.auctionValue <= 130) {
      roster.push(player);
      totalSpent += player.auctionValue;
    }
  }
  
  // Get a good QB ($15-25 range)
  const solidQB = topQB.find(q => q.auctionValue >= 15 && q.auctionValue <= 25 && 
    !roster.some(r => r.name === q.name));
  if (solidQB && totalSpent + solidQB.auctionValue <= 170) {
    roster.push(solidQB);
    totalSpent += solidQB.auctionValue;
  }
  
  // Fill out starters with $10-20 players
  const midTier = sortedByPoints
    .filter(p => p.auctionValue >= 10 && p.auctionValue <= 25)
    .filter(p => !roster.some(r => r.name === p.name));
  
  // Need: more RBs, WRs, and a TE
  const positions = ['RB', 'RB', 'WR', 'WR', 'TE'];
  for (const pos of positions) {
    if (roster.length >= 9) break;
    
    const available = midTier.filter(p => p.position === pos);
    if (available.length > 0 && totalSpent + available[0].auctionValue <= 190) {
      roster.push(available[0]);
      totalSpent += available[0].auctionValue;
      midTier.splice(midTier.indexOf(available[0]), 1);
    }
  }
  
  // Add K and DST (cheap)
  roster.push({ name: 'Harrison Butker', team: 'KC', position: 'K', projectedPoints: 142, auctionValue: 1 });
  roster.push({ name: 'Cowboys DST', team: 'DAL', position: 'DST', projectedPoints: 115, auctionValue: 2 });
  totalSpent += 3;
  
  // Fill bench with remaining budget
  const remainingBudget = 200 - totalSpent;
  const spotsNeeded = 16 - roster.length;
  
  if (spotsNeeded > 0) {
    // Get value players
    const valuePlayers = sortedByPoints
      .filter(p => !roster.some(r => r.name === p.name))
      .filter(p => p.auctionValue <= remainingBudget / spotsNeeded + 5);
    
    for (let i = 0; i < spotsNeeded && i < valuePlayers.length; i++) {
      if (totalSpent + valuePlayers[i].auctionValue <= 200) {
        roster.push(valuePlayers[i]);
        totalSpent += valuePlayers[i].auctionValue;
      }
    }
  }
  
  const totalPoints = roster.reduce((sum, p) => sum + p.projectedPoints, 0);
  
  return { roster, spent: totalSpent, points: totalPoints };
}

// Main
const players = loadPlayers();
const team = buildOptimal200Team(players);

// Organize roster
const starters: any[] = [];
const bench: any[] = [];

// Identify starters vs bench
const posCounts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, FLEX: 0 };

for (const player of team.roster) {
  let isStarter = false;
  let role = player.position;
  
  if (player.position === 'QB' && posCounts.QB < 1) {
    isStarter = true;
    posCounts.QB++;
  } else if (player.position === 'RB' && posCounts.RB < 2) {
    isStarter = true;
    role = `RB${posCounts.RB + 1}`;
    posCounts.RB++;
  } else if (player.position === 'WR' && posCounts.WR < 2) {
    isStarter = true;
    role = `WR${posCounts.WR + 1}`;
    posCounts.WR++;
  } else if (player.position === 'TE' && posCounts.TE < 1) {
    isStarter = true;
    posCounts.TE++;
  } else if (player.position === 'K' && posCounts.K < 1) {
    isStarter = true;
    posCounts.K++;
  } else if (player.position === 'DST' && posCounts.DST < 1) {
    isStarter = true;
    posCounts.DST++;
  } else if (posCounts.FLEX < 1 && ['RB', 'WR', 'TE'].includes(player.position)) {
    isStarter = true;
    role = 'FLEX';
    posCounts.FLEX++;
  }
  
  if (isStarter) {
    starters.push({ ...player, role });
  } else {
    bench.push(player);
  }
}

console.log('\n╔═══════════════════════════════════════════════════════════════════════════════════╗');
console.log('║              OPTIMAL FANTASY TEAM - FULL $200 BUDGET ALLOCATION                  ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════════╝\n');

console.log('STARTING LINEUP:');
console.log('┌─────────┬──────────────────────────────────┬──────┬────────┬───────┐');
console.log('│ Pos     │ Player                           │ Team │ Points │ Cost  │');
console.log('├─────────┼──────────────────────────────────┼──────┼────────┼───────┤');

let runningTotal = 0;
for (const player of starters) {
  runningTotal += player.auctionValue;
  console.log(`│ ${player.role.padEnd(7)} │ ${player.name.padEnd(32)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │`);
}

console.log('└─────────┴──────────────────────────────────┴──────┴────────┴───────┘\n');

if (bench.length > 0) {
  console.log('BENCH:');
  console.log('┌─────────┬──────────────────────────────────┬──────┬────────┬───────┐');
  console.log('│ Pos     │ Player                           │ Team │ Points │ Cost  │');
  console.log('├─────────┼──────────────────────────────────┼──────┼────────┼───────┤');
  
  for (const player of bench) {
    runningTotal += player.auctionValue;
    console.log(`│ ${player.position.padEnd(7)} │ ${player.name.padEnd(32)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │`);
  }
  
  console.log('└─────────┴──────────────────────────────────┴──────┴────────┴───────┘\n');
}

console.log('═══════════════════════════════════════════════════════════════════════');
console.log(`TOTAL SPENT:            $${team.spent} / $200`);
console.log(`REMAINING:              $${200 - team.spent}`);
console.log(`TOTAL PROJECTED POINTS: ${team.points.toFixed(1)}`);
console.log(`EFFICIENCY:             ${(team.points / team.spent).toFixed(2)} pts/$`);
console.log('═══════════════════════════════════════════════════════════════════════');