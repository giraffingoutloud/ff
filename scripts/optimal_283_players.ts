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
  isRookie: string;
  dataStatus: string;
}

function loadValidPlayers(): Player[] {
  const players: Player[] = [];
  
  // Load from the actual ADP file used by the app
  const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
  const adpContent = fs.readFileSync(adpPath, 'utf-8');
  const adpRecords = parse(adpContent, { columns: true });
  
  for (const record of adpRecords) {
    const auctionValueStr = record['Auction Value'];
    const projectedPoints = parseFloat(record['Projected Points']) || 0;
    const dataStatus = record['Data Status'];
    
    // Skip invalid entries
    if (auctionValueStr === 'N/A' || auctionValueStr === null || auctionValueStr === '') continue;
    if (dataStatus === 'Insufficient Data') continue;
    if (projectedPoints <= 0) continue;
    
    const auctionValue = parseFloat(auctionValueStr);
    if (isNaN(auctionValue) || auctionValue <= 0) continue;
    
    const position = record['Position']?.toUpperCase();
    if (!position) continue;
    
    players.push({
      rank: parseInt(record['Overall Rank']) || 999,
      name: record['Full Name'],
      team: record['Team Abbreviation'],
      position: position,
      projectedPoints: projectedPoints,
      auctionValue: auctionValue,
      isRookie: record['Is Rookie'],
      dataStatus: dataStatus
    });
  }
  
  return players;
}

function buildOptimalTeam(players: Player[], budget: number = 200) {
  // Requirements: 2 QB, 4 RB, 4 WR, 2 TE, 1 K, 1 DST, 2 FLEX = 16 total
  
  // Sort by value (points per dollar)
  const byValue = [...players].sort((a, b) => {
    const valueA = a.projectedPoints / a.auctionValue;
    const valueB = b.projectedPoints / b.auctionValue;
    return valueB - valueA;
  });
  
  // Also organize by position
  const byPosition: Record<string, Player[]> = {};
  for (const p of players) {
    if (!byPosition[p.position]) byPosition[p.position] = [];
    byPosition[p.position].push(p);
  }
  
  // Sort each position by projected points
  for (const pos in byPosition) {
    byPosition[pos].sort((a, b) => b.projectedPoints - a.projectedPoints);
  }
  
  const roster: Player[] = [];
  const used = new Set<string>();
  let spent = 0;
  
  // Strategy: Stars and Scrubs
  // Get 2-3 elite players, then fill with value
  
  // 1. Get one elite RB or WR ($40+)
  const elites = [...(byPosition.RB || []), ...(byPosition.WR || [])]
    .filter(p => p.auctionValue >= 40 && p.auctionValue <= 60)
    .slice(0, 10);
  
  if (elites.length > 0) {
    const elite = elites[0];
    roster.push(elite);
    used.add(elite.name);
    spent += elite.auctionValue;
  }
  
  // 2. Get another strong RB/WR ($25-40)
  const strong = [...(byPosition.RB || []), ...(byPosition.WR || [])]
    .filter(p => !used.has(p.name) && p.auctionValue >= 25 && p.auctionValue < 40)
    .slice(0, 10);
  
  if (strong.length > 0) {
    roster.push(strong[0]);
    used.add(strong[0].name);
    spent += strong[0].auctionValue;
  }
  
  // 3. Get QBs - one decent ($10-20), one cheap ($1-5)
  const qbs = byPosition.QB || [];
  const goodQB = qbs.find(q => !used.has(q.name) && q.auctionValue >= 10 && q.auctionValue <= 25);
  if (goodQB) {
    roster.push(goodQB);
    used.add(goodQB.name);
    spent += goodQB.auctionValue;
  }
  
  const cheapQB = qbs.find(q => !used.has(q.name) && q.auctionValue <= 7);
  if (cheapQB) {
    roster.push(cheapQB);
    used.add(cheapQB.name);
    spent += cheapQB.auctionValue;
  }
  
  // 4. Fill RBs (need 2 more minimum)
  const rbsNeeded = Math.max(0, 4 - roster.filter(p => p.position === 'RB').length);
  const availableRBs = (byPosition.RB || []).filter(p => !used.has(p.name));
  
  for (let i = 0; i < rbsNeeded && i < availableRBs.length; i++) {
    const budget = (200 - spent) / (16 - roster.length);
    const rb = availableRBs.find(r => r.auctionValue <= budget + 10) || availableRBs[i];
    if (rb) {
      roster.push(rb);
      used.add(rb.name);
      spent += rb.auctionValue;
    }
  }
  
  // 5. Fill WRs (need 2 more minimum)
  const wrsNeeded = Math.max(0, 4 - roster.filter(p => p.position === 'WR').length);
  const availableWRs = (byPosition.WR || []).filter(p => !used.has(p.name));
  
  for (let i = 0; i < wrsNeeded && i < availableWRs.length; i++) {
    const budget = (200 - spent) / (16 - roster.length);
    const wr = availableWRs.find(w => w.auctionValue <= budget + 10) || availableWRs[i];
    if (wr) {
      roster.push(wr);
      used.add(wr.name);
      spent += wr.auctionValue;
    }
  }
  
  // 6. Get TEs (need 2)
  const tes = (byPosition.TE || []).filter(p => !used.has(p.name));
  for (let i = 0; i < 2 && i < tes.length; i++) {
    const budget = (200 - spent) / (16 - roster.length);
    const te = tes.find(t => t.auctionValue <= budget + 5) || tes[i];
    if (te) {
      roster.push(te);
      used.add(te.name);
      spent += te.auctionValue;
    }
  }
  
  // 7. Get K and DST (cheapest available)
  const kickers = (byPosition.K || []).filter(p => !used.has(p.name));
  const dsts = (byPosition.DST || []).filter(p => !used.has(p.name));
  
  if (kickers.length > 0) {
    // Find best value kicker under $3
    const k = kickers.find(k => k.auctionValue <= 3) || kickers[kickers.length - 1];
    if (k) {
      roster.push(k);
      used.add(k.name);
      spent += k.auctionValue;
    }
  }
  
  if (dsts.length > 0) {
    // Find best value DST under $5
    const d = dsts.find(d => d.auctionValue <= 5) || dsts[dsts.length - 1];
    if (d) {
      roster.push(d);
      used.add(d.name);
      spent += d.auctionValue;
    }
  }
  
  // 8. Fill remaining spots (FLEX) with best available
  const spotsLeft = 16 - roster.length;
  if (spotsLeft > 0) {
    const flexEligible = [...(byPosition.RB || []), ...(byPosition.WR || []), ...(byPosition.TE || [])]
      .filter(p => !used.has(p.name))
      .sort((a, b) => {
        const valueA = a.projectedPoints / a.auctionValue;
        const valueB = b.projectedPoints / b.auctionValue;
        return valueB - valueA;
      });
    
    for (let i = 0; i < spotsLeft && i < flexEligible.length; i++) {
      const remainingBudget = 200 - spent;
      const remainingSpots = spotsLeft - i;
      const maxSpend = remainingBudget - (remainingSpots - 1); // Save $1 per remaining spot
      
      const player = flexEligible.find(p => p.auctionValue <= maxSpend) || 
                     flexEligible.find(p => p.auctionValue <= remainingBudget);
      
      if (player) {
        roster.push(player);
        used.add(player.name);
        spent += player.auctionValue;
        flexEligible.splice(flexEligible.indexOf(player), 1);
      }
    }
  }
  
  return { roster, spent, points: roster.reduce((sum, p) => sum + p.projectedPoints, 0) };
}

// Main execution
const validPlayers = loadValidPlayers();
console.log(`\nLoaded ${validPlayers.length} valid players from the 283 in database\n`);

const team = buildOptimalTeam(validPlayers, 200);

// Categorize roster
const categorized: Record<string, Player[]> = {
  QB: [], RB: [], WR: [], TE: [], K: [], DST: [], FLEX: []
};

const maxCounts = { QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DST: 1 };
const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };

// Assign players to categories
team.roster.sort((a, b) => b.projectedPoints - a.projectedPoints);

for (const player of team.roster) {
  const pos = player.position;
  
  if (pos in counts && counts[pos] < maxCounts[pos as keyof typeof maxCounts]) {
    categorized[pos].push(player);
    counts[pos]++;
  } else if (['RB', 'WR', 'TE'].includes(pos)) {
    categorized.FLEX.push(player);
  }
}

console.log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║    OPTIMAL $200 TEAM FROM YOUR 283 PLAYERS (2 QB, 4 RB, 4 WR, 2 TE, 1 K, 1 DST, 2 FLEX) ║');
console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝\n');

const groups = [
  { name: 'QUARTERBACKS', key: 'QB' },
  { name: 'RUNNING BACKS', key: 'RB' },
  { name: 'WIDE RECEIVERS', key: 'WR' },
  { name: 'TIGHT ENDS', key: 'TE' },
  { name: 'FLEX POSITIONS', key: 'FLEX' },
  { name: 'KICKER', key: 'K' },
  { name: 'DEFENSE/ST', key: 'DST' }
];

let totalSpent = 0;
let totalPoints = 0;

for (const group of groups) {
  const players = categorized[group.key];
  if (players.length === 0) continue;
  
  console.log(`${group.name}:`);
  console.log('┌────────────────────────────────────┬──────┬────────┬───────┬────────┐');
  console.log('│ Player Name                        │ Team │ Points │ Cost  │ Status │');
  console.log('├────────────────────────────────────┼──────┼────────┼───────┼────────┤');
  
  for (const player of players) {
    const status = player.isRookie === 'Yes' ? 'Rookie' : '';
    console.log(`│ ${player.name.padEnd(34)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ ${status.padEnd(6)} │`);
    totalSpent += player.auctionValue;
    totalPoints += player.projectedPoints;
  }
  
  console.log('└────────────────────────────────────┴──────┴────────┴───────┴────────┘\n');
}

// Show summary
console.log('SUMMARY:');
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(`Roster Size:            ${team.roster.length} / 16 players`);
console.log(`Total Spent:            $${team.spent} / $200`);
console.log(`Remaining Budget:       $${200 - team.spent}`);
console.log(`Total Projected Points: ${team.points.toFixed(1)}`);
console.log(`Points Per Dollar:      ${(team.points / team.spent).toFixed(2)}`);
console.log('═══════════════════════════════════════════════════════════════════════════');

// Show position distribution
console.log('\nPOSITION DISTRIBUTION:');
const posDist: Record<string, number> = {};
for (const player of team.roster) {
  posDist[player.position] = (posDist[player.position] || 0) + 1;
}
for (const [pos, count] of Object.entries(posDist)) {
  console.log(`${pos}: ${count} players`);
}