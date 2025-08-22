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

function loadAllPlayers(): Player[] {
  const players: Player[] = [];
  const processedNames = new Set<string>();
  
  // Load from ADP file
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
      processedNames.add(record['Full Name']);
    }
  }
  
  // Load K and DST from projection files
  const kPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections/k_projections_2025.csv';
  const dstPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections/dst_projections_2025.csv';
  
  // Load kickers
  if (fs.existsSync(kPath)) {
    const content = fs.readFileSync(kPath, 'utf-8');
    const records = parse(content, { columns: true });
    
    const topKickers = records
      .filter((r: any) => !processedNames.has(r.playerName))
      .map((r: any) => ({
        name: r.playerName,
        team: r.teamName,
        position: 'K',
        projectedPoints: parseFloat(r.fantasyPoints) || 0,
        auctionValue: parseFloat(r.auctionValue) || 1
      }))
      .filter((k: any) => k.projectedPoints > 100)
      .sort((a: any, b: any) => b.projectedPoints - a.projectedPoints)
      .slice(0, 15);
    
    players.push(...topKickers);
  }
  
  // Load DSTs
  if (fs.existsSync(dstPath)) {
    const content = fs.readFileSync(dstPath, 'utf-8');
    const records = parse(content, { columns: true });
    
    const topDSTs = records
      .filter((r: any) => !processedNames.has(r.playerName))
      .map((r: any) => ({
        name: r.playerName,
        team: r.teamName,
        position: 'DST',
        projectedPoints: parseFloat(r.fantasyPoints) || 0,
        auctionValue: parseFloat(r.auctionValue) || 1
      }))
      .filter((d: any) => d.projectedPoints > 80)
      .sort((a: any, b: any) => b.projectedPoints - a.projectedPoints)
      .slice(0, 15);
    
    players.push(...topDSTs);
  }
  
  return players;
}

function buildOptimalCustomRoster(players: Player[], budget: number = 200) {
  // Required roster composition
  const requirements = {
    QB: 2,
    RB: 4,
    WR: 4,
    TE: 2,
    K: 1,
    DST: 1,
    FLEX: 2  // Total 16 players
  };
  
  // Sort players by position and value
  const byPosition: Record<string, Player[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DST: []
  };
  
  for (const player of players) {
    if (byPosition[player.position]) {
      byPosition[player.position].push(player);
    }
  }
  
  // Sort each position by projected points
  for (const pos in byPosition) {
    byPosition[pos].sort((a, b) => b.projectedPoints - a.projectedPoints);
  }
  
  // Build roster using a balanced approach
  const roster: Player[] = [];
  let spent = 0;
  
  // Strategy: Allocate budget proportionally
  // With 16 spots and $200, average is $12.50 per player
  // But we'll spend more on skill positions and less on K/DST
  
  const targetAllocations = {
    QB: 30,   // $15 each for 2 QBs
    RB: 85,   // ~$21 each for 4 RBs (most important)
    WR: 65,   // ~$16 each for 4 WRs
    TE: 15,   // $7-8 each for 2 TEs
    K: 2,     // Cheap kicker
    DST: 3    // Cheap defense
  };
  
  // Function to get best available player within budget
  const getBestInBudget = (position: string, maxSpend: number, exclude: string[] = []): Player | null => {
    const available = byPosition[position].filter(p => 
      !exclude.includes(p.name) && 
      p.auctionValue <= maxSpend
    );
    
    if (available.length === 0) return null;
    
    // Find player closest to target spend but with good value
    const targetSpend = maxSpend * 0.8; // Aim for 80% of max to leave flexibility
    
    // Sort by a combination of points and how close to target spend
    available.sort((a, b) => {
      const aScore = a.projectedPoints - Math.abs(a.auctionValue - targetSpend) * 2;
      const bScore = b.projectedPoints - Math.abs(b.auctionValue - targetSpend) * 2;
      return bScore - aScore;
    });
    
    return available[0];
  };
  
  const selectedNames: string[] = [];
  
  // 1. Get 2 QBs - one good, one value
  const qb1 = getBestInBudget('QB', 20, selectedNames);
  if (qb1) {
    roster.push(qb1);
    spent += qb1.auctionValue;
    selectedNames.push(qb1.name);
  }
  
  const qb2 = getBestInBudget('QB', 10, selectedNames);
  if (qb2) {
    roster.push(qb2);
    spent += qb2.auctionValue;
    selectedNames.push(qb2.name);
  }
  
  // 2. Get 4 RBs - mix of studs and values
  // Get 1-2 studs
  const rb1 = getBestInBudget('RB', 45, selectedNames);
  if (rb1) {
    roster.push(rb1);
    spent += rb1.auctionValue;
    selectedNames.push(rb1.name);
  }
  
  const rb2 = getBestInBudget('RB', 35, selectedNames);
  if (rb2) {
    roster.push(rb2);
    spent += rb2.auctionValue;
    selectedNames.push(rb2.name);
  }
  
  // Get 2 value RBs
  for (let i = 0; i < 2; i++) {
    const rb = getBestInBudget('RB', 15, selectedNames);
    if (rb) {
      roster.push(rb);
      spent += rb.auctionValue;
      selectedNames.push(rb.name);
    }
  }
  
  // 3. Get 4 WRs - similar strategy
  const wr1 = getBestInBudget('WR', 40, selectedNames);
  if (wr1) {
    roster.push(wr1);
    spent += wr1.auctionValue;
    selectedNames.push(wr1.name);
  }
  
  const wr2 = getBestInBudget('WR', 25, selectedNames);
  if (wr2) {
    roster.push(wr2);
    spent += wr2.auctionValue;
    selectedNames.push(wr2.name);
  }
  
  for (let i = 0; i < 2; i++) {
    const wr = getBestInBudget('WR', 12, selectedNames);
    if (wr) {
      roster.push(wr);
      spent += wr.auctionValue;
      selectedNames.push(wr.name);
    }
  }
  
  // 4. Get 2 TEs
  for (let i = 0; i < 2; i++) {
    const te = getBestInBudget('TE', 10, selectedNames);
    if (te) {
      roster.push(te);
      spent += te.auctionValue;
      selectedNames.push(te.name);
    }
  }
  
  // 5. Get K and DST (cheap)
  const kicker = getBestInBudget('K', 3, selectedNames);
  if (kicker) {
    roster.push(kicker);
    spent += kicker.auctionValue;
    selectedNames.push(kicker.name);
  }
  
  const dst = getBestInBudget('DST', 5, selectedNames);
  if (dst) {
    roster.push(dst);
    spent += dst.auctionValue;
    selectedNames.push(dst.name);
  }
  
  // 6. Get 2 FLEX players with remaining budget
  const remainingBudget = budget - spent;
  const flexEligible = [...byPosition.RB, ...byPosition.WR, ...byPosition.TE]
    .filter(p => !selectedNames.includes(p.name))
    .sort((a, b) => b.projectedPoints - a.projectedPoints);
  
  for (let i = 0; i < 2 && i < flexEligible.length; i++) {
    const flexBudget = i === 0 ? Math.floor(remainingBudget * 0.6) : remainingBudget - (roster.length > 15 ? 0 : 1);
    const flex = flexEligible.find(p => p.auctionValue <= flexBudget);
    
    if (flex) {
      roster.push(flex);
      spent += flex.auctionValue;
      selectedNames.push(flex.name);
      flexEligible.splice(flexEligible.indexOf(flex), 1);
    }
  }
  
  // If we still have money and spots, upgrade players
  while (spent < budget - 5 && roster.length === 16) {
    const upgradeBudget = budget - spent;
    let upgraded = false;
    
    for (let i = 0; i < roster.length; i++) {
      const current = roster[i];
      const betterOptions = byPosition[current.position]
        .filter(p => 
          !selectedNames.includes(p.name) &&
          p.projectedPoints > current.projectedPoints &&
          p.auctionValue <= current.auctionValue + upgradeBudget
        );
      
      if (betterOptions.length > 0) {
        const upgrade = betterOptions[0];
        const extraCost = upgrade.auctionValue - current.auctionValue;
        
        roster[i] = upgrade;
        selectedNames[selectedNames.indexOf(current.name)] = upgrade.name;
        spent += extraCost;
        upgraded = true;
        break;
      }
    }
    
    if (!upgraded) break;
  }
  
  return { roster, spent, points: roster.reduce((sum, p) => sum + p.projectedPoints, 0) };
}

// Main execution
const players = loadAllPlayers();
console.log(`\nLoaded ${players.length} players\n`);

const result = buildOptimalCustomRoster(players, 200);

// Organize roster by position for display
const positionGroups: Record<string, Player[]> = {
  QB: [],
  RB: [],
  WR: [],
  TE: [],
  FLEX: [],
  K: [],
  DST: []
};

const positionCounts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };

// Assign players to positions
for (const player of result.roster.sort((a, b) => b.projectedPoints - a.projectedPoints)) {
  const pos = player.position;
  
  if (pos === 'QB' && positionCounts.QB < 2) {
    positionGroups.QB.push(player);
    positionCounts.QB++;
  } else if (pos === 'RB' && positionCounts.RB < 4) {
    positionGroups.RB.push(player);
    positionCounts.RB++;
  } else if (pos === 'WR' && positionCounts.WR < 4) {
    positionGroups.WR.push(player);
    positionCounts.WR++;
  } else if (pos === 'TE' && positionCounts.TE < 2) {
    positionGroups.TE.push(player);
    positionCounts.TE++;
  } else if (pos === 'K' && positionCounts.K < 1) {
    positionGroups.K.push(player);
    positionCounts.K++;
  } else if (pos === 'DST' && positionCounts.DST < 1) {
    positionGroups.DST.push(player);
    positionCounts.DST++;
  } else if (['RB', 'WR', 'TE'].includes(pos)) {
    positionGroups.FLEX.push(player);
  }
}

console.log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║     OPTIMAL $200 TEAM - CUSTOM ROSTER (2 QB, 4 RB, 4 WR, 2 TE, 1 K, 1 DST, 2 FLEX)    ║');
console.log('╚════════════════════════════════════════════════════════════════════════════════════════╝\n');

let runningTotal = 0;

// Display each position group
const displayGroups = [
  { name: 'QUARTERBACKS', players: positionGroups.QB },
  { name: 'RUNNING BACKS', players: positionGroups.RB },
  { name: 'WIDE RECEIVERS', players: positionGroups.WR },
  { name: 'TIGHT ENDS', players: positionGroups.TE },
  { name: 'FLEX', players: positionGroups.FLEX },
  { name: 'KICKER', players: positionGroups.K },
  { name: 'DEFENSE', players: positionGroups.DST }
];

for (const group of displayGroups) {
  if (group.players.length === 0) continue;
  
  console.log(`${group.name}:`);
  console.log('┌───┬────────────────────────────────┬──────┬────────┬───────┬─────────────┐');
  console.log('│ # │ Player Name                    │ Team │ Points │ Value │ Running Tot │');
  console.log('├───┼────────────────────────────────┼──────┼────────┼───────┼─────────────┤');
  
  group.players.forEach((player, idx) => {
    runningTotal += player.auctionValue;
    console.log(`│ ${(idx + 1).toString().padStart(1)} │ ${player.name.padEnd(30)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ $${runningTotal.toString().padStart(10)} │`);
  });
  
  console.log('└───┴────────────────────────────────┴──────┴────────┴───────┴─────────────┘\n');
}

// Summary statistics
const positionSpending: Record<string, number> = {};
const positionPoints: Record<string, number> = {};

for (const [pos, players] of Object.entries(positionGroups)) {
  if (players.length > 0) {
    positionSpending[pos] = players.reduce((sum, p) => sum + p.auctionValue, 0);
    positionPoints[pos] = players.reduce((sum, p) => sum + p.projectedPoints, 0);
  }
}

console.log('SPENDING BREAKDOWN:');
console.log('┌──────────┬───────┬──────────┬──────────────┬──────────┐');
console.log('│ Position │ Count │ Total $  │ Avg $/Player │ Points   │');
console.log('├──────────┼───────┼──────────┼──────────────┼──────────┤');

for (const [pos, spent] of Object.entries(positionSpending)) {
  const count = positionGroups[pos].length;
  const avg = (spent / count).toFixed(1);
  const points = positionPoints[pos];
  console.log(`│ ${pos.padEnd(8)} │ ${count.toString().padStart(5)} │ $${spent.toString().padStart(7)} │ $${avg.padStart(11)} │ ${points.toFixed(1).padStart(8)} │`);
}

console.log('└──────────┴───────┴──────────┴──────────────┴──────────┘\n');

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log(`TOTAL SPENT:            $${result.spent} / $200`);
console.log(`REMAINING BUDGET:       $${200 - result.spent}`);
console.log(`TOTAL PROJECTED POINTS: ${result.points.toFixed(1)}`);
console.log(`POINTS PER DOLLAR:      ${(result.points / result.spent).toFixed(2)}`);
console.log(`ROSTER SIZE:            ${result.roster.length} players`);
console.log('═══════════════════════════════════════════════════════════════════════════════');