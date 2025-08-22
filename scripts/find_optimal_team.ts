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

function loadProjections(): Player[] {
  const players: Player[] = [];
  
  const projectionFiles = [
    'offense_projections_2025.csv',
    'qb_projections_2025.csv',
    'rb_projections_2025.csv',
    'wr_projections_2025.csv',
    'te_projections_2025.csv',
    'k_projections_2025.csv',
    'dst_projections_2025.csv'
  ];
  
  const processedNames = new Set<string>();
  
  for (const file of projectionFiles) {
    const filePath = path.join('/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections', file);
    if (fs.existsSync(filePath)) {
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const records = parse(csvContent, { columns: true });
      
      for (const record of records) {
        const name = record.playerName;
        if (!name || processedNames.has(name)) continue;
        
        processedNames.add(name);
        
        const position = record.position?.toUpperCase();
        if (!position) continue;
        
        players.push({
          name: record.playerName,
          team: record.teamName,
          position: position,
          projectedPoints: parseFloat(record.fantasyPoints) || 0,
          auctionValue: parseFloat(record.auctionValue) || 1
        });
      }
    }
  }
  
  return players.sort((a, b) => b.projectedPoints - a.projectedPoints);
}

function findOptimalTeam(players: Player[], budget: number = 200): { roster: Player[], totalCost: number, totalPoints: number } {
  const positions = {
    QB: { required: 1, selected: [] as Player[] },
    RB: { required: 2, selected: [] as Player[] },
    WR: { required: 2, selected: [] as Player[] },
    TE: { required: 1, selected: [] as Player[] },
    K: { required: 1, selected: [] as Player[] },
    DST: { required: 1, selected: [] as Player[] },
    FLEX: { required: 1, selected: [] as Player[] },
    BENCH: { required: 7, selected: [] as Player[] }
  };
  
  let remainingBudget = budget;
  const selectedPlayers = new Set<string>();
  
  // Sort by value (points per dollar)
  const playersByValue = [...players].sort((a, b) => {
    const valueA = a.projectedPoints / Math.max(a.auctionValue, 1);
    const valueB = b.projectedPoints / Math.max(b.auctionValue, 1);
    return valueB - valueA;
  });
  
  // Fill required positions first
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
    const posPlayers = playersByValue.filter(p => 
      p.position === pos && 
      !selectedPlayers.has(p.name) && 
      p.auctionValue <= remainingBudget - (16 - selectedPlayers.size)
    );
    
    const needed = positions[pos as keyof typeof positions].required;
    for (let i = 0; i < needed && i < posPlayers.length; i++) {
      const player = posPlayers[i];
      positions[pos as keyof typeof positions].selected.push(player);
      selectedPlayers.add(player.name);
      remainingBudget -= player.auctionValue;
    }
  }
  
  // Fill FLEX (RB/WR/TE)
  const flexEligible = playersByValue.filter(p => 
    ['RB', 'WR', 'TE'].includes(p.position) && 
    !selectedPlayers.has(p.name) && 
    p.auctionValue <= remainingBudget - (16 - selectedPlayers.size)
  );
  
  if (flexEligible.length > 0) {
    const flexPlayer = flexEligible[0];
    positions.FLEX.selected.push(flexPlayer);
    selectedPlayers.add(flexPlayer.name);
    remainingBudget -= flexPlayer.auctionValue;
  }
  
  // Fill bench with best value players
  const benchEligible = playersByValue.filter(p => 
    !selectedPlayers.has(p.name) && 
    p.auctionValue <= remainingBudget - (16 - selectedPlayers.size - 7)
  );
  
  for (let i = 0; i < 7 && i < benchEligible.length; i++) {
    const player = benchEligible[i];
    positions.BENCH.selected.push(player);
    selectedPlayers.add(player.name);
    remainingBudget -= player.auctionValue;
  }
  
  // Compile full roster
  const roster: Player[] = [];
  for (const [posName, posData] of Object.entries(positions)) {
    for (const player of posData.selected) {
      roster.push(player);
    }
  }
  
  const totalCost = budget - remainingBudget;
  const totalPoints = roster.reduce((sum, p) => sum + p.projectedPoints, 0);
  
  return { roster, totalCost, totalPoints };
}

// Main execution
const players = loadProjections();
const result = findOptimalTeam(players, 200);

console.log('\n=== OPTIMAL 16-PLAYER FANTASY TEAM ($200 BUDGET) ===\n');
console.log('STARTING LINEUP:');
console.log('Position | Player Name | Team | Projected Points | Value | Running Total');
console.log('---------|-------------|------|------------------|-------|---------------');

let runningTotal = 0;
let lineupCount = 0;
const starters = result.roster.slice(0, 9);
const bench = result.roster.slice(9);

for (const player of starters) {
  runningTotal += player.auctionValue;
  const position = lineupCount < 8 ? 
    (lineupCount === 0 ? 'QB' :
     lineupCount <= 2 ? `RB${lineupCount}` :
     lineupCount <= 4 ? `WR${lineupCount-2}` :
     lineupCount === 5 ? 'TE' :
     lineupCount === 6 ? 'FLEX' :
     lineupCount === 7 ? 'K' : 'DST') : 'DST';
  
  console.log(`${position.padEnd(8)} | ${player.name.padEnd(25).substring(0, 25)} | ${player.team.padEnd(4)} | ${player.projectedPoints.toFixed(1).padStart(16)} | $${player.auctionValue.toString().padStart(4)} | $${runningTotal.toString().padStart(3)}`);
  lineupCount++;
}

console.log('\nBENCH:');
console.log('Position | Player Name | Team | Projected Points | Value | Running Total');
console.log('---------|-------------|------|------------------|-------|---------------');

for (const player of bench) {
  runningTotal += player.auctionValue;
  console.log(`${player.position.padEnd(8)} | ${player.name.padEnd(25).substring(0, 25)} | ${player.team.padEnd(4)} | ${player.projectedPoints.toFixed(1).padStart(16)} | $${player.auctionValue.toString().padStart(4)} | $${runningTotal.toString().padStart(3)}`);
}

console.log('\n' + '='.repeat(80));
console.log(`TOTAL COST: $${result.totalCost}`);
console.log(`REMAINING BUDGET: $${200 - result.totalCost}`);
console.log(`TOTAL PROJECTED POINTS: ${result.totalPoints.toFixed(1)}`);
console.log('='.repeat(80));