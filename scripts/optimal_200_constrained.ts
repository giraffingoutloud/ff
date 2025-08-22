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

function loadPlayers(): Player[] {
  const players: Player[] = [];
  
  // Load ADP data
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
  
  // Add some K and DST options
  players.push(
    { name: 'Harrison Butker', team: 'KC', position: 'K', projectedPoints: 145, auctionValue: 2 },
    { name: 'Jake Elliott', team: 'PHI', position: 'K', projectedPoints: 140, auctionValue: 1 },
    { name: 'Tyler Bass', team: 'BUF', position: 'K', projectedPoints: 138, auctionValue: 1 },
    { name: 'Bills DST', team: 'BUF', position: 'DST', projectedPoints: 120, auctionValue: 3 },
    { name: 'Cowboys DST', team: 'DAL', position: 'DST', projectedPoints: 115, auctionValue: 2 },
    { name: 'Steelers DST', team: 'PIT', position: 'DST', projectedPoints: 110, auctionValue: 1 }
  );
  
  return players;
}

function buildConstrainedTeam(players: Player[]): any {
  const BUDGET = 200;
  const ROSTER_SIZE = 16;
  
  // Position requirements
  const requirements = {
    QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DST: 1
    // Plus 2 FLEX (RB/WR/TE)
  };
  
  // Group players by position
  const byPos: Record<string, Player[]> = {};
  for (const p of players) {
    if (!byPos[p.position]) byPos[p.position] = [];
    byPos[p.position].push(p);
  }
  
  // Sort each position by value (points per dollar)
  for (const pos in byPos) {
    byPos[pos].sort((a, b) => {
      const valueA = a.projectedPoints / a.auctionValue;
      const valueB = b.projectedPoints / b.auctionValue;
      return valueB - valueA;
    });
  }
  
  // Build team with budget constraint
  const roster: Player[] = [];
  const used = new Set<string>();
  let totalSpent = 0;
  
  // Average per spot with 16 players: $12.50
  // Strategy: Mix of stars and value picks
  
  // Step 1: Allocate budget targets
  const budgetTargets = {
    studs: 100,    // 2-3 elite players
    starters: 70,  // 5-6 solid starters
    value: 30      // 7-8 cheap players
  };
  
  // Get 2 elite players (RB or WR) - the foundation
  const elites = [...(byPos.RB || []), ...(byPos.WR || [])]
    .filter(p => p.auctionValue >= 35 && p.auctionValue <= 60)
    .sort((a, b) => b.projectedPoints - a.projectedPoints)
    .slice(0, 5);
  
  let eliteCount = 0;
  for (const elite of elites) {
    if (eliteCount >= 2) break;
    if (totalSpent + elite.auctionValue <= 100) {
      roster.push(elite);
      used.add(elite.name);
      totalSpent += elite.auctionValue;
      eliteCount++;
    }
  }
  
  // Step 2: Fill required positions with mix of values
  
  // QBs - 1 good, 1 cheap
  const qbs = (byPos.QB || []).filter(p => !used.has(p.name));
  const qb1 = qbs.find(q => q.auctionValue >= 10 && q.auctionValue <= 20);
  if (qb1) {
    roster.push(qb1);
    used.add(qb1.name);
    totalSpent += qb1.auctionValue;
  }
  
  const qb2 = qbs.find(q => !used.has(q.name) && q.auctionValue <= 5);
  if (qb2) {
    roster.push(qb2);
    used.add(qb2.name);
    totalSpent += qb2.auctionValue;
  }
  
  // Fill remaining RBs (need 2-3 more depending on elites)
  const rbCount = roster.filter(p => p.position === 'RB').length;
  const rbsNeeded = 4 - rbCount;
  const rbs = (byPos.RB || []).filter(p => !used.has(p.name));
  
  for (let i = 0; i < rbsNeeded; i++) {
    const budget = (BUDGET - totalSpent) / (ROSTER_SIZE - roster.length);
    const rb = rbs.find(r => r.auctionValue <= budget + 5 && r.auctionValue >= 5);
    if (rb) {
      roster.push(rb);
      used.add(rb.name);
      totalSpent += rb.auctionValue;
      rbs.splice(rbs.indexOf(rb), 1);
    }
  }
  
  // Fill remaining WRs
  const wrCount = roster.filter(p => p.position === 'WR').length;
  const wrsNeeded = 4 - wrCount;
  const wrs = (byPos.WR || []).filter(p => !used.has(p.name));
  
  for (let i = 0; i < wrsNeeded; i++) {
    const budget = (BUDGET - totalSpent) / (ROSTER_SIZE - roster.length);
    const wr = wrs.find(w => w.auctionValue <= budget + 5 && w.auctionValue >= 5);
    if (wr) {
      roster.push(wr);
      used.add(wr.name);
      totalSpent += wr.auctionValue;
      wrs.splice(wrs.indexOf(wr), 1);
    }
  }
  
  // Get 2 TEs
  const tes = (byPos.TE || []).filter(p => !used.has(p.name));
  for (let i = 0; i < 2; i++) {
    const budget = (BUDGET - totalSpent) / (ROSTER_SIZE - roster.length);
    const te = tes.find(t => t.auctionValue <= budget + 3);
    if (te) {
      roster.push(te);
      used.add(te.name);
      totalSpent += te.auctionValue;
      tes.splice(tes.indexOf(te), 1);
    }
  }
  
  // Get cheap K and DST
  const kicker = (byPos.K || []).find(k => !used.has(k.name) && k.auctionValue <= 2);
  if (kicker) {
    roster.push(kicker);
    used.add(kicker.name);
    totalSpent += kicker.auctionValue;
  }
  
  const dst = (byPos.DST || []).find(d => !used.has(d.name) && d.auctionValue <= 2);
  if (dst) {
    roster.push(dst);
    used.add(dst.name);
    totalSpent += dst.auctionValue;
  }
  
  // Fill FLEX spots with remaining budget
  const spotsLeft = ROSTER_SIZE - roster.length;
  const budgetLeft = BUDGET - totalSpent;
  
  if (spotsLeft > 0) {
    const flexPool = [...(byPos.RB || []), ...(byPos.WR || []), ...(byPos.TE || [])]
      .filter(p => !used.has(p.name))
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    
    for (let i = 0; i < spotsLeft; i++) {
      const maxSpend = budgetLeft - (spotsLeft - i - 1); // Save $1 for each remaining spot
      const flex = flexPool.find(p => p.auctionValue <= maxSpend);
      
      if (flex) {
        roster.push(flex);
        used.add(flex.name);
        totalSpent += flex.auctionValue;
        flexPool.splice(flexPool.indexOf(flex), 1);
      }
    }
  }
  
  return {
    roster,
    spent: totalSpent,
    points: roster.reduce((sum, p) => sum + p.projectedPoints, 0)
  };
}

// Main
const players = loadPlayers();
const team = buildConstrainedTeam(players);

// Organize roster by position
const positions: Record<string, Player[]> = {
  QB: [], RB: [], WR: [], TE: [], FLEX: [], K: [], DST: []
};

const maxCounts = { QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DST: 1 };
const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };

// Sort roster by points to assign best players to starting spots
team.roster.sort((a, b) => b.projectedPoints - a.projectedPoints);

for (const player of team.roster) {
  const pos = player.position;
  
  if (counts[pos as keyof typeof counts] < maxCounts[pos as keyof typeof maxCounts]) {
    positions[pos].push(player);
    counts[pos as keyof typeof counts]++;
  } else if (['RB', 'WR', 'TE'].includes(pos)) {
    positions.FLEX.push(player);
  }
}

console.log('\n╔════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║   OPTIMAL $200 FANTASY TEAM - 16 PLAYERS (2 QB, 4 RB, 4 WR, 2 TE, 1 K, 1 DST, 2 FLEX)  ║');
console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝\n');

// Display each position group
const groups = [
  { name: 'QUARTERBACKS', key: 'QB', count: 2 },
  { name: 'RUNNING BACKS', key: 'RB', count: 4 },
  { name: 'WIDE RECEIVERS', key: 'WR', count: 4 },
  { name: 'TIGHT ENDS', key: 'TE', count: 2 },
  { name: 'FLEX POSITIONS', key: 'FLEX', count: 2 },
  { name: 'KICKER', key: 'K', count: 1 },
  { name: 'DEFENSE/ST', key: 'DST', count: 1 }
];

let runningSpent = 0;
let runningPoints = 0;

for (const group of groups) {
  const players = positions[group.key];
  if (players.length === 0) continue;
  
  console.log(`${group.name} (${players.length}/${group.count}):`);
  console.log('┌────────────────────────────────────┬──────┬────────┬───────┐');
  console.log('│ Player Name                        │ Team │ Points │ Cost  │');
  console.log('├────────────────────────────────────┼──────┼────────┼───────┤');
  
  let groupSpent = 0;
  let groupPoints = 0;
  
  for (const player of players) {
    console.log(`│ ${player.name.padEnd(34)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │`);
    groupSpent += player.auctionValue;
    groupPoints += player.projectedPoints;
  }
  
  runningSpent += groupSpent;
  runningPoints += groupPoints;
  
  console.log('├────────────────────────────────────┼──────┼────────┼───────┤');
  console.log(`│ Subtotal                           │      │ ${groupPoints.toFixed(1).padStart(6)} │ $${groupSpent.toString().padStart(4)} │`);
  console.log('└────────────────────────────────────┴──────┴────────┴───────┘\n');
}

// Display warnings if roster incomplete
const totalPlayers = Object.values(positions).reduce((sum, arr) => sum + arr.length, 0);
if (totalPlayers < 16) {
  console.log(`⚠️  WARNING: Only ${totalPlayers}/16 roster spots filled\n`);
}

console.log('════════════════════════════════════════════════════════════════════════════');
console.log(`ROSTER SIZE:            ${totalPlayers} / 16 players`);
console.log(`TOTAL SPENT:            $${team.spent} / $200`);
console.log(`REMAINING BUDGET:       $${200 - team.spent}`);
console.log(`TOTAL PROJECTED POINTS: ${team.points.toFixed(1)}`);
console.log(`POINTS PER DOLLAR:      ${(team.points / team.spent).toFixed(2)}`);
console.log('════════════════════════════════════════════════════════════════════════════');