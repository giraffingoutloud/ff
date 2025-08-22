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
  // Group by position
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
  
  // Strategy for $200 budget with 16 players
  // Average: $12.50 per player
  // But we'll spend more on stars
  
  // 1. Get 2 elite players (RB/WR) - ~$100 total
  const elites = [...(byPosition.RB || []).slice(0, 5), ...(byPosition.WR || []).slice(0, 5)]
    .filter(p => p.auctionValue >= 40)
    .sort((a, b) => b.projectedPoints - a.projectedPoints);
  
  for (let i = 0; i < 2 && i < elites.length; i++) {
    if (spent + elites[i].auctionValue <= 110) {
      roster.push(elites[i]);
      used.add(elites[i].name);
      spent += elites[i].auctionValue;
    }
  }
  
  // 2. Get 2 QBs - one good, one cheap
  const qbs = (byPosition.QB || []).filter(p => !used.has(p.name));
  
  // Good QB ($15-25)
  let qb1 = qbs.find(q => q.auctionValue >= 15 && q.auctionValue <= 25);
  if (!qb1) qb1 = qbs.find(q => q.auctionValue >= 10 && q.auctionValue <= 30);
  if (qb1 && spent + qb1.auctionValue <= 150) {
    roster.push(qb1);
    used.add(qb1.name);
    spent += qb1.auctionValue;
  }
  
  // Cheap QB ($1-10)
  const qb2 = qbs.find(q => !used.has(q.name) && q.auctionValue <= 10);
  if (qb2 && spent + qb2.auctionValue <= 170) {
    roster.push(qb2);
    used.add(qb2.name);
    spent += qb2.auctionValue;
  }
  
  // 3. Fill remaining RBs (need 4 total)
  const rbCount = roster.filter(p => p.position === 'RB').length;
  const rbsNeeded = 4 - rbCount;
  const rbs = (byPosition.RB || []).filter(p => !used.has(p.name));
  
  for (let i = 0; i < rbsNeeded && i < rbs.length; i++) {
    const remainingBudget = budget - spent;
    const remainingSpots = 16 - roster.length;
    const avgBudget = remainingBudget / remainingSpots;
    
    // Find RB in reasonable price range
    const rb = rbs.find(r => !used.has(r.name) && r.auctionValue <= avgBudget + 10) || 
               rbs.find(r => !used.has(r.name));
    
    if (rb && spent + rb.auctionValue <= budget - (remainingSpots - 1)) {
      roster.push(rb);
      used.add(rb.name);
      spent += rb.auctionValue;
    }
  }
  
  // 4. Fill remaining WRs (need 4 total)
  const wrCount = roster.filter(p => p.position === 'WR').length;
  const wrsNeeded = 4 - wrCount;
  const wrs = (byPosition.WR || []).filter(p => !used.has(p.name));
  
  for (let i = 0; i < wrsNeeded && i < wrs.length; i++) {
    const remainingBudget = budget - spent;
    const remainingSpots = 16 - roster.length;
    const avgBudget = remainingBudget / remainingSpots;
    
    const wr = wrs.find(w => !used.has(w.name) && w.auctionValue <= avgBudget + 10) ||
               wrs.find(w => !used.has(w.name));
    
    if (wr && spent + wr.auctionValue <= budget - (remainingSpots - 1)) {
      roster.push(wr);
      used.add(wr.name);
      spent += wr.auctionValue;
    }
  }
  
  // 5. Get 2 TEs
  const tes = (byPosition.TE || []).filter(p => !used.has(p.name));
  
  for (let i = 0; i < 2 && i < tes.length; i++) {
    const remainingBudget = budget - spent;
    const remainingSpots = 16 - roster.length;
    
    const te = tes.find(t => !used.has(t.name) && t.auctionValue <= 15) ||
               tes.find(t => !used.has(t.name));
    
    if (te && spent + te.auctionValue <= budget - (remainingSpots - 1)) {
      roster.push(te);
      used.add(te.name);
      spent += te.auctionValue;
    }
  }
  
  // 6. Get K and DST (cheap)
  const kickers = (byPosition.K || []).filter(p => !used.has(p.name));
  const dsts = (byPosition.DST || []).filter(p => !used.has(p.name));
  
  // Best value kicker
  if (kickers.length > 0) {
    const k = kickers[0]; // They're sorted by points
    if (k && spent + k.auctionValue <= budget - (16 - roster.length - 1)) {
      roster.push(k);
      used.add(k.name);
      spent += k.auctionValue;
    }
  }
  
  // Best value DST
  if (dsts.length > 0) {
    const d = dsts[0];
    if (d && spent + d.auctionValue <= budget - (16 - roster.length - 1)) {
      roster.push(d);
      used.add(d.name);
      spent += d.auctionValue;
    }
  }
  
  // 7. Fill FLEX spots with best available
  const spotsLeft = 16 - roster.length;
  if (spotsLeft > 0) {
    const flexPool = [...(byPosition.RB || []), ...(byPosition.WR || []), ...(byPosition.TE || [])]
      .filter(p => !used.has(p.name))
      .sort((a, b) => {
        const valueA = a.projectedPoints / a.auctionValue;
        const valueB = b.projectedPoints / b.auctionValue;
        return valueB - valueA;
      });
    
    for (let i = 0; i < spotsLeft && i < flexPool.length; i++) {
      const remainingBudget = budget - spent;
      const player = flexPool.find(p => p.auctionValue <= remainingBudget);
      
      if (player) {
        roster.push(player);
        used.add(player.name);
        spent += player.auctionValue;
      }
    }
  }
  
  return { roster, spent, points: roster.reduce((sum, p) => sum + p.projectedPoints, 0) };
}

// Main
const validPlayers = loadValidPlayers();
console.log(`\n✓ Loaded ${validPlayers.length} valid players from your database\n`);

// Show position breakdown
const posCounts: Record<string, number> = {};
for (const p of validPlayers) {
  posCounts[p.position] = (posCounts[p.position] || 0) + 1;
}
console.log('Available players by position:');
for (const [pos, count] of Object.entries(posCounts)) {
  console.log(`  ${pos}: ${count} players`);
}
console.log();

const team = buildOptimalTeam(validPlayers, 200);

// Categorize roster
const categorized: Record<string, Player[]> = {
  QB: [], RB: [], WR: [], TE: [], K: [], DST: [], FLEX: []
};

const maxCounts = { QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DST: 1 };
const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };

for (const player of team.roster) {
  const pos = player.position;
  
  if (pos in counts && counts[pos] < maxCounts[pos as keyof typeof maxCounts]) {
    categorized[pos].push(player);
    counts[pos]++;
  } else if (['RB', 'WR', 'TE'].includes(pos)) {
    categorized.FLEX.push(player);
  }
}

console.log('╔═══════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║         OPTIMAL $200 TEAM FROM YOUR DATABASE (16 PLAYERS: 2QB/4RB/4WR/2TE/1K/1DST/2FLEX)   ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════════════════╝\n');

const groups = [
  { name: 'QUARTERBACKS', key: 'QB', required: 2 },
  { name: 'RUNNING BACKS', key: 'RB', required: 4 },
  { name: 'WIDE RECEIVERS', key: 'WR', required: 4 },
  { name: 'TIGHT ENDS', key: 'TE', required: 2 },
  { name: 'FLEX POSITIONS', key: 'FLEX', required: 2 },
  { name: 'KICKER', key: 'K', required: 1 },
  { name: 'DEFENSE/ST', key: 'DST', required: 1 }
];

for (const group of groups) {
  const players = categorized[group.key];
  if (players.length === 0) continue;
  
  console.log(`${group.name} (${players.length}/${group.required}):`);
  console.log('┌──────────────────────────────────────┬──────┬────────┬───────┬──────────┐');
  console.log('│ Player Name                          │ Team │ Points │ Cost  │ Value    │');
  console.log('├──────────────────────────────────────┼──────┼────────┼───────┼──────────┤');
  
  for (const player of players) {
    const value = (player.projectedPoints / player.auctionValue).toFixed(1);
    console.log(`│ ${player.name.padEnd(36)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ ${value.padStart(7)} x │`);
  }
  
  const subtotal = players.reduce((sum, p) => sum + p.auctionValue, 0);
  const subPoints = players.reduce((sum, p) => sum + p.projectedPoints, 0);
  
  console.log('├──────────────────────────────────────┼──────┼────────┼───────┼──────────┤');
  console.log(`│ Subtotal                             │      │ ${subPoints.toFixed(1).padStart(6)} │ $${subtotal.toString().padStart(4)} │          │`);
  console.log('└──────────────────────────────────────┴──────┴────────┴───────┴──────────┘\n');
}

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log(`ROSTER SIZE:            ${team.roster.length} / 16 players`);
console.log(`TOTAL SPENT:            $${team.spent} / $200`);
console.log(`REMAINING BUDGET:       $${200 - team.spent}`);
console.log(`TOTAL PROJECTED POINTS: ${team.points.toFixed(1)}`);
console.log(`POINTS PER DOLLAR:      ${(team.points / team.spent).toFixed(2)}`);
console.log('═══════════════════════════════════════════════════════════════════════════════');