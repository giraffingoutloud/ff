import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface Player {
  name: string;
  team: string;
  position: string;
  projectedPoints: number;
  auctionValue: number;
  valueRatio: number;
}

function loadPlayersFromADP(): Player[] {
  const players: Player[] = [];
  
  // Load from ADP file which has the most complete auction values
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
        auctionValue: auctionValue,
        valueRatio: projectedPoints / auctionValue
      });
    }
  }
  
  // Add K and DST from projection files
  const kPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections/k_projections_2025.csv';
  const dstPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections/dst_projections_2025.csv';
  
  // Top kickers
  if (fs.existsSync(kPath)) {
    const content = fs.readFileSync(kPath, 'utf-8');
    const records = parse(content, { columns: true });
    const topKickers = records
      .map((r: any) => ({
        name: r.playerName,
        team: r.teamName,
        position: 'K',
        projectedPoints: parseFloat(r.fantasyPoints) || 0,
        auctionValue: Math.max(1, Math.floor(parseFloat(r.fantasyPoints) / 40)) // Estimate $1-4 for kickers
      }))
      .filter((k: any) => k.projectedPoints > 100)
      .sort((a: any, b: any) => b.projectedPoints - a.projectedPoints)
      .slice(0, 20);
    
    for (const kicker of topKickers) {
      players.push({
        ...kicker,
        valueRatio: kicker.projectedPoints / kicker.auctionValue
      });
    }
  }
  
  // Top DSTs
  if (fs.existsSync(dstPath)) {
    const content = fs.readFileSync(dstPath, 'utf-8');
    const records = parse(content, { columns: true });
    const topDSTs = records
      .map((r: any) => ({
        name: r.playerName,
        team: r.teamName,
        position: 'DST',
        projectedPoints: parseFloat(r.fantasyPoints) || 0,
        auctionValue: Math.max(1, Math.floor(parseFloat(r.fantasyPoints) / 35)) // Estimate $1-5 for DSTs
      }))
      .filter((d: any) => d.projectedPoints > 80)
      .sort((a: any, b: any) => b.projectedPoints - a.projectedPoints)
      .slice(0, 20);
    
    for (const dst of topDSTs) {
      players.push({
        ...dst,
        valueRatio: dst.projectedPoints / dst.auctionValue
      });
    }
  }
  
  return players;
}

function findBalancedOptimalTeam(players: Player[], budget: number = 200) {
  // Budget allocation strategy (typical for competitive leagues)
  const targetSpend = {
    QB: 15,    // 1 solid QB
    RB: 80,    // 2-3 good RBs (premium position)
    WR: 70,    // 2-3 good WRs
    TE: 15,    // 1 solid TE
    K: 2,      // Cheap kicker
    DST: 3,    // Cheap defense
    BENCH: 15  // Remaining for bench
  };
  
  const roster: Player[] = [];
  let remainingBudget = budget;
  
  // Get players by position sorted by value ratio
  const getPositionPlayers = (pos: string) => 
    players.filter(p => p.position === pos && !roster.some(r => r.name === p.name))
           .sort((a, b) => b.valueRatio - a.valueRatio);
  
  // 1. Get QB (1 starter)
  const qbs = getPositionPlayers('QB');
  const affordableQBs = qbs.filter(q => q.auctionValue <= 25 && q.auctionValue >= 10);
  if (affordableQBs.length > 0) {
    roster.push(affordableQBs[0]);
    remainingBudget -= affordableQBs[0].auctionValue;
  } else if (qbs.length > 0) {
    roster.push(qbs[0]);
    remainingBudget -= qbs[0].auctionValue;
  }
  
  // 2. Get RBs (2 starters + 1 flex candidate)
  const rbs = getPositionPlayers('RB');
  let rbCount = 0;
  for (const rb of rbs) {
    if (rbCount >= 3) break;
    if (rb.auctionValue <= remainingBudget - (15 - roster.length) && rb.auctionValue >= 15) {
      roster.push(rb);
      remainingBudget -= rb.auctionValue;
      rbCount++;
    }
  }
  // Fill remaining RB spots with value picks
  while (rbCount < 2) {
    const valueRBs = getPositionPlayers('RB').filter(r => r.auctionValue <= 10);
    if (valueRBs.length > 0) {
      roster.push(valueRBs[0]);
      remainingBudget -= valueRBs[0].auctionValue;
      rbCount++;
    } else break;
  }
  
  // 3. Get WRs (2 starters + potential flex)
  const wrs = getPositionPlayers('WR');
  let wrCount = 0;
  for (const wr of wrs) {
    if (wrCount >= 3) break;
    if (wr.auctionValue <= remainingBudget - (15 - roster.length) && wr.auctionValue >= 15) {
      roster.push(wr);
      remainingBudget -= wr.auctionValue;
      wrCount++;
    }
  }
  // Fill remaining WR spots with value picks
  while (wrCount < 2) {
    const valueWRs = getPositionPlayers('WR').filter(w => w.auctionValue <= 10);
    if (valueWRs.length > 0) {
      roster.push(valueWRs[0]);
      remainingBudget -= valueWRs[0].auctionValue;
      wrCount++;
    } else break;
  }
  
  // 4. Get TE (1 starter)
  const tes = getPositionPlayers('TE');
  const affordableTEs = tes.filter(t => t.auctionValue <= 20 && t.auctionValue >= 5);
  if (affordableTEs.length > 0) {
    roster.push(affordableTEs[0]);
    remainingBudget -= affordableTEs[0].auctionValue;
  } else if (tes.length > 0) {
    roster.push(tes[0]);
    remainingBudget -= tes[0].auctionValue;
  }
  
  // 5. Get K and DST (cheap options)
  const kickers = getPositionPlayers('K');
  if (kickers.length > 0) {
    const cheapK = kickers.find(k => k.auctionValue <= 3) || kickers[0];
    roster.push(cheapK);
    remainingBudget -= cheapK.auctionValue;
  }
  
  const dsts = getPositionPlayers('DST');
  if (dsts.length > 0) {
    const cheapDST = dsts.find(d => d.auctionValue <= 5) || dsts[0];
    roster.push(cheapDST);
    remainingBudget -= cheapDST.auctionValue;
  }
  
  // 6. Fill remaining spots with best value players
  while (roster.length < 16 && remainingBudget > 0) {
    const remaining = players
      .filter(p => !roster.some(r => r.name === p.name))
      .sort((a, b) => b.valueRatio - a.valueRatio);
    
    const affordable = remaining.filter(p => p.auctionValue <= remainingBudget);
    if (affordable.length > 0) {
      roster.push(affordable[0]);
      remainingBudget -= affordable[0].auctionValue;
    } else {
      break;
    }
  }
  
  return {
    roster,
    totalCost: budget - remainingBudget,
    totalPoints: roster.reduce((sum, p) => sum + p.projectedPoints, 0)
  };
}

// Main execution
const players = loadPlayersFromADP();
console.log(`\nLoaded ${players.length} players with auction values\n`);

const result = findBalancedOptimalTeam(players, 200);

// Organize roster for display
const starters: Array<{player: Player, role: string}> = [];
const bench: Player[] = [];

// Identify starters
const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
let flexFilled = false;

for (const player of result.roster.sort((a, b) => b.projectedPoints - a.projectedPoints)) {
  let assigned = false;
  
  if (player.position === 'QB' && counts.QB < 1) {
    starters.push({ player, role: 'QB' });
    counts.QB++;
    assigned = true;
  } else if (player.position === 'RB' && counts.RB < 2) {
    starters.push({ player, role: `RB${counts.RB + 1}` });
    counts.RB++;
    assigned = true;
  } else if (player.position === 'WR' && counts.WR < 2) {
    starters.push({ player, role: `WR${counts.WR + 1}` });
    counts.WR++;
    assigned = true;
  } else if (player.position === 'TE' && counts.TE < 1) {
    starters.push({ player, role: 'TE' });
    counts.TE++;
    assigned = true;
  } else if (player.position === 'K' && counts.K < 1) {
    starters.push({ player, role: 'K' });
    counts.K++;
    assigned = true;
  } else if (player.position === 'DST' && counts.DST < 1) {
    starters.push({ player, role: 'DST' });
    counts.DST++;
    assigned = true;
  } else if (!flexFilled && ['RB', 'WR', 'TE'].includes(player.position)) {
    starters.push({ player, role: 'FLEX' });
    flexFilled = true;
    assigned = true;
  }
  
  if (!assigned) {
    bench.push(player);
  }
}

// Sort starters by position order
const posOrder = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX', 'K', 'DST'];
starters.sort((a, b) => posOrder.indexOf(a.role) - posOrder.indexOf(b.role));

console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
console.log('║         OPTIMAL BALANCED 16-PLAYER FANTASY TEAM ($200 AUCTION BUDGET)           ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════╝\n');

console.log('STARTING LINEUP:');
console.log('┌─────────┬────────────────────────────────┬──────┬────────┬───────┬─────────────┐');
console.log('│ Pos     │ Player Name                    │ Team │ Points │ Value │ Total Spent │');
console.log('├─────────┼────────────────────────────────┼──────┼────────┼───────┼─────────────┤');

let runningTotal = 0;
for (const { player, role } of starters) {
  runningTotal += player.auctionValue;
  console.log(`│ ${role.padEnd(7)} │ ${player.name.padEnd(30)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ $${runningTotal.toString().padStart(10)} │`);
}
console.log('└─────────┴────────────────────────────────┴──────┴────────┴───────┴─────────────┘\n');

if (bench.length > 0) {
  console.log('BENCH:');
  console.log('┌─────────┬────────────────────────────────┬──────┬────────┬───────┬─────────────┐');
  console.log('│ Pos     │ Player Name                    │ Team │ Points │ Value │ Total Spent │');
  console.log('├─────────┼────────────────────────────────┼──────┼────────┼───────┼─────────────┤');
  
  for (const player of bench) {
    runningTotal += player.auctionValue;
    console.log(`│ ${player.position.padEnd(7)} │ ${player.name.padEnd(30)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ $${runningTotal.toString().padStart(10)} │`);
  }
  console.log('└─────────┴────────────────────────────────┴──────┴────────┴───────┴─────────────┘\n');
}

console.log('═══════════════════════════════════════════════════════════════════════════════════');
console.log(`TOTAL SPENT:            $${result.totalCost}`);
console.log(`REMAINING BUDGET:       $${200 - result.totalCost}`);
console.log(`TOTAL PROJECTED POINTS: ${result.totalPoints.toFixed(1)}`);
console.log(`POINTS PER DOLLAR:      ${(result.totalPoints / result.totalCost).toFixed(2)}`);
console.log('═══════════════════════════════════════════════════════════════════════════════════');