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

function loadAllPlayers(): Player[] {
  const players: Player[] = [];
  const playerMap = new Map<string, Player>();
  
  // First load all projection files to get complete player list with positions
  const projectionFiles = [
    { file: 'qb_projections_2025.csv', defaultPos: 'QB' },
    { file: 'rb_projections_2025.csv', defaultPos: 'RB' },
    { file: 'wr_projections_2025.csv', defaultPos: 'WR' },
    { file: 'te_projections_2025.csv', defaultPos: 'TE' },
    { file: 'k_projections_2025.csv', defaultPos: 'K' },
    { file: 'dst_projections_2025.csv', defaultPos: 'DST' }
  ];
  
  for (const { file, defaultPos } of projectionFiles) {
    const filePath = path.join('/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const records = parse(content, { columns: true });
      
      for (const record of records) {
        const name = record.playerName;
        if (!name) continue;
        
        const position = record.position?.toUpperCase() || defaultPos;
        const projectedPoints = parseFloat(record.fantasyPoints) || 0;
        const auctionValue = parseFloat(record.auctionValue) || 1;
        
        if (!playerMap.has(name) && projectedPoints > 0) {
          playerMap.set(name, {
            name,
            team: record.teamName || '',
            position,
            projectedPoints,
            auctionValue,
            valueRatio: projectedPoints / Math.max(auctionValue, 1)
          });
        }
      }
    }
  }
  
  // Now update with auction values from ADP file
  const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
  if (fs.existsSync(adpPath)) {
    const adpContent = fs.readFileSync(adpPath, 'utf-8');
    const adpRecords = parse(adpContent, { columns: true });
    
    for (const record of adpRecords) {
      const name = record['Full Name'];
      const auctionValue = parseFloat(record['Auction Value']) || 1;
      
      if (playerMap.has(name) && auctionValue > 0) {
        const player = playerMap.get(name)!;
        player.auctionValue = auctionValue;
        player.valueRatio = player.projectedPoints / auctionValue;
      }
    }
  }
  
  return Array.from(playerMap.values());
}

function findOptimalTeamGreedy(players: Player[], budget: number = 200): { roster: Player[], totalCost: number, totalPoints: number } {
  // Filter out invalid players and sort by value ratio
  const validPlayers = players.filter(p => 
    p.projectedPoints > 0 && 
    p.auctionValue > 0 &&
    p.position && 
    ['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(p.position)
  ).sort((a, b) => b.valueRatio - a.valueRatio);
  
  const roster: Player[] = [];
  const requirements = {
    QB: { min: 1, max: 2, current: 0 },
    RB: { min: 2, max: 5, current: 0 },
    WR: { min: 2, max: 5, current: 0 },
    TE: { min: 1, max: 2, current: 0 },
    K: { min: 1, max: 1, current: 0 },
    DST: { min: 1, max: 1, current: 0 }
  };
  
  let remainingBudget = budget;
  let flexFilled = false;
  
  // Phase 1: Fill minimum requirements with best value players
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const) {
    const posPlayers = validPlayers.filter(p => 
      p.position === pos && 
      !roster.includes(p)
    );
    
    const needed = requirements[pos].min;
    let filled = 0;
    
    for (const player of posPlayers) {
      if (filled >= needed) break;
      if (roster.length >= 16) break;
      
      const spotsLeft = 16 - roster.length;
      const minReserve = spotsLeft - 1; // Reserve $1 for remaining spots
      
      if (player.auctionValue <= remainingBudget - minReserve) {
        roster.push(player);
        remainingBudget -= player.auctionValue;
        requirements[pos].current++;
        filled++;
      }
    }
  }
  
  // Phase 2: Fill FLEX with best available RB/WR/TE
  if (!flexFilled && roster.length < 16) {
    const flexEligible = validPlayers.filter(p => 
      ['RB', 'WR', 'TE'].includes(p.position) && 
      !roster.includes(p)
    );
    
    for (const player of flexEligible) {
      if (flexFilled) break;
      if (roster.length >= 16) break;
      
      const spotsLeft = 16 - roster.length;
      const minReserve = spotsLeft - 1;
      
      if (player.auctionValue <= remainingBudget - minReserve) {
        roster.push(player);
        remainingBudget -= player.auctionValue;
        flexFilled = true;
      }
    }
  }
  
  // Phase 3: Fill bench with best value players respecting max limits
  const benchCandidates = validPlayers.filter(p => !roster.includes(p));
  
  for (const player of benchCandidates) {
    if (roster.length >= 16) break;
    
    const posReq = requirements[player.position as keyof typeof requirements];
    if (posReq.current >= posReq.max) continue;
    
    const spotsLeft = 16 - roster.length;
    const minReserve = Math.max(0, spotsLeft - 1);
    
    if (player.auctionValue <= remainingBudget - minReserve) {
      roster.push(player);
      remainingBudget -= player.auctionValue;
      posReq.current++;
    }
  }
  
  // If still need players, add cheapest available
  if (roster.length < 16) {
    const remaining = benchCandidates
      .filter(p => !roster.includes(p))
      .sort((a, b) => a.auctionValue - b.auctionValue);
    
    for (const player of remaining) {
      if (roster.length >= 16) break;
      if (player.auctionValue <= remainingBudget) {
        roster.push(player);
        remainingBudget -= player.auctionValue;
      }
    }
  }
  
  const totalCost = budget - remainingBudget;
  const totalPoints = roster.reduce((sum, p) => sum + p.projectedPoints, 0);
  
  return { roster, totalCost, totalPoints };
}

// Main execution
console.log('\nLoading player data...');
const players = loadAllPlayers();
console.log(`Loaded ${players.length} players\n`);

const result = findOptimalTeamGreedy(players, 200);

// Organize roster for display
const starters: Player[] = [];
const bench: Player[] = [];
const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
let flexUsed = false;

// Assign starters
for (const player of result.roster) {
  if (player.position === 'QB' && counts.QB < 1) {
    starters.push(player);
    counts.QB++;
  } else if (player.position === 'RB' && counts.RB < 2) {
    starters.push(player);
    counts.RB++;
  } else if (player.position === 'WR' && counts.WR < 2) {
    starters.push(player);
    counts.WR++;
  } else if (player.position === 'TE' && counts.TE < 1) {
    starters.push(player);
    counts.TE++;
  } else if (player.position === 'K' && counts.K < 1) {
    starters.push(player);
    counts.K++;
  } else if (player.position === 'DST' && counts.DST < 1) {
    starters.push(player);
    counts.DST++;
  } else if (!flexUsed && ['RB', 'WR', 'TE'].includes(player.position)) {
    starters.push({ ...player, position: 'FLEX' });
    flexUsed = true;
  } else {
    bench.push(player);
  }
}

console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║           OPTIMAL 16-PLAYER FANTASY TEAM ($200 AUCTION BUDGET)              ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

console.log('STARTING LINEUP:');
console.log('┌─────────┬────────────────────────────┬──────┬────────┬───────┬─────────────┐');
console.log('│ Pos     │ Player Name                │ Team │ Points │ Value │ Total Spent │');
console.log('├─────────┼────────────────────────────┼──────┼────────┼───────┼─────────────┤');

let runningTotal = 0;
for (const player of starters) {
  runningTotal += player.auctionValue;
  const displayPos = player.position === 'FLEX' ? 'FLEX' : player.position;
  console.log(`│ ${displayPos.padEnd(7)} │ ${player.name.padEnd(26)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ $${runningTotal.toString().padStart(10)} │`);
}
console.log('└─────────┴────────────────────────────┴──────┴────────┴───────┴─────────────┘\n');

console.log('BENCH:');
console.log('┌─────────┬────────────────────────────┬──────┬────────┬───────┬─────────────┐');
console.log('│ Pos     │ Player Name                │ Team │ Points │ Value │ Total Spent │');
console.log('├─────────┼────────────────────────────┼──────┼────────┼───────┼─────────────┤');

for (const player of bench) {
  runningTotal += player.auctionValue;
  console.log(`│ ${player.position.padEnd(7)} │ ${player.name.padEnd(26)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ $${runningTotal.toString().padStart(10)} │`);
}
console.log('└─────────┴────────────────────────────┴──────┴────────┴───────┴─────────────┘\n');

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log(`TOTAL SPENT:           $${result.totalCost}`);
console.log(`REMAINING BUDGET:      $${200 - result.totalCost}`);
console.log(`TOTAL PROJECTED POINTS: ${result.totalPoints.toFixed(1)}`);
console.log(`VALUE RATIO:           ${(result.totalPoints / result.totalCost).toFixed(2)} points per dollar`);
console.log('═══════════════════════════════════════════════════════════════════════════════');