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

function loadPlayers(): Player[] {
  const players: Player[] = [];
  
  // Load ADP data with auction values
  const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
  const adpContent = fs.readFileSync(adpPath, 'utf-8');
  const adpRecords = parse(adpContent, { columns: true });
  
  for (const record of adpRecords) {
    const auctionValue = parseFloat(record['Auction Value']) || 1;
    const projectedPoints = parseFloat(record['Projected Points']) || 0;
    
    if (auctionValue > 0 && projectedPoints > 0) {
      players.push({
        name: record['Full Name'],
        team: record['Team Abbreviation'],
        position: record['Position'].toUpperCase(),
        projectedPoints: projectedPoints,
        auctionValue: auctionValue,
        valueRatio: projectedPoints / auctionValue
      });
    }
  }
  
  // Load DST and K from projection files
  const dstPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections/dst_projections_2025.csv';
  const kPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections/k_projections_2025.csv';
  
  for (const [filePath, position] of [[dstPath, 'DST'], [kPath, 'K']]) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const records = parse(content, { columns: true });
      
      for (const record of records) {
        const auctionValue = parseFloat(record.auctionValue) || 1;
        const projectedPoints = parseFloat(record.fantasyPoints) || 0;
        
        if (auctionValue > 0 && projectedPoints > 0) {
          players.push({
            name: record.playerName,
            team: record.teamName,
            position: position,
            projectedPoints: projectedPoints,
            auctionValue: auctionValue,
            valueRatio: projectedPoints / auctionValue
          });
        }
      }
    }
  }
  
  return players;
}

function findOptimalTeam(players: Player[], budget: number = 200): { roster: Player[], totalCost: number, totalPoints: number } {
  // Sort by value ratio (points per dollar)
  const sortedPlayers = [...players].sort((a, b) => b.valueRatio - a.valueRatio);
  
  const roster: Player[] = [];
  const positionCounts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
    FLEX: 0
  };
  
  const requirements = {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    K: 1,
    DST: 1
  };
  
  let remainingBudget = budget;
  let spotsRemaining = 16;
  
  // Strategy: Allocate budget more aggressively for top players
  // Reserve $1 per remaining spot to ensure we can fill roster
  
  // First pass: Get elite players at key positions
  for (const player of sortedPlayers) {
    if (roster.length >= 16) break;
    
    const minReserve = spotsRemaining - 1; // Reserve $1 for each remaining spot
    
    if (player.auctionValue <= remainingBudget - minReserve) {
      let canAdd = false;
      
      // Check if we need this position
      if (player.position in requirements) {
        if (positionCounts[player.position] < requirements[player.position as keyof typeof requirements]) {
          canAdd = true;
          positionCounts[player.position]++;
        } else if (['RB', 'WR', 'TE'].includes(player.position) && positionCounts.FLEX < 1) {
          canAdd = true;
          positionCounts.FLEX++;
        } else if (roster.length < 16) {
          // Can add as bench
          canAdd = true;
        }
      }
      
      if (canAdd) {
        roster.push(player);
        remainingBudget -= player.auctionValue;
        spotsRemaining--;
      }
    }
  }
  
  // Fill any remaining spots with $1 players
  if (roster.length < 16) {
    const cheapPlayers = sortedPlayers.filter(p => 
      p.auctionValue === 1 && 
      !roster.includes(p)
    );
    
    for (const player of cheapPlayers) {
      if (roster.length >= 16) break;
      if (remainingBudget >= player.auctionValue) {
        roster.push(player);
        remainingBudget -= player.auctionValue;
      }
    }
  }
  
  const totalCost = budget - remainingBudget;
  const totalPoints = roster.reduce((sum, p) => sum + p.projectedPoints, 0);
  
  // Sort roster by position for display
  const positionOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  roster.sort((a, b) => {
    const aIndex = positionOrder.indexOf(a.position);
    const bIndex = positionOrder.indexOf(b.position);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return b.projectedPoints - a.projectedPoints;
  });
  
  return { roster, totalCost, totalPoints };
}

// Main execution
const players = loadPlayers();
console.log(`Loaded ${players.length} players with auction values`);

const result = findOptimalTeam(players, 200);

console.log('\n=== OPTIMAL 16-PLAYER FANTASY TEAM ($200 BUDGET) ===\n');
console.log('STRATEGY: Maximizing value (points per dollar) while meeting roster requirements\n');

console.log('STARTING LINEUP:');
console.log('Position | Player Name                | Team | Points | Value | $/Point | Total');
console.log('---------|----------------------------|------|--------|-------|---------|-------');

let runningTotal = 0;
let starterCount = 0;
const positionsFilled = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, FLEX: 0 };

for (const player of result.roster) {
  let isStarter = false;
  let displayPos = player.position;
  
  if (player.position === 'QB' && positionsFilled.QB < 1) {
    isStarter = true;
    positionsFilled.QB++;
  } else if (player.position === 'RB' && positionsFilled.RB < 2) {
    isStarter = true;
    displayPos = `RB${positionsFilled.RB + 1}`;
    positionsFilled.RB++;
  } else if (player.position === 'WR' && positionsFilled.WR < 2) {
    isStarter = true;
    displayPos = `WR${positionsFilled.WR + 1}`;
    positionsFilled.WR++;
  } else if (player.position === 'TE' && positionsFilled.TE < 1) {
    isStarter = true;
    positionsFilled.TE++;
  } else if (player.position === 'K' && positionsFilled.K < 1) {
    isStarter = true;
    positionsFilled.K++;
  } else if (player.position === 'DST' && positionsFilled.DST < 1) {
    isStarter = true;
    positionsFilled.DST++;
  } else if (['RB', 'WR', 'TE'].includes(player.position) && positionsFilled.FLEX < 1 && starterCount < 8) {
    isStarter = true;
    displayPos = 'FLEX';
    positionsFilled.FLEX++;
  }
  
  if (isStarter) {
    runningTotal += player.auctionValue;
    const pointsPerDollar = (player.projectedPoints / player.auctionValue).toFixed(2);
    console.log(`${displayPos.padEnd(8)} | ${player.name.padEnd(26)} | ${player.team.padEnd(4)} | ${player.projectedPoints.toFixed(1).padStart(6)} | $${player.auctionValue.toString().padStart(4)} | ${pointsPerDollar.padStart(7)} | $${runningTotal.toString().padStart(3)}`);
    starterCount++;
  }
}

console.log('\nBENCH:');
console.log('Position | Player Name                | Team | Points | Value | $/Point | Total');
console.log('---------|----------------------------|------|--------|-------|---------|-------');

for (const player of result.roster) {
  let isBench = true;
  
  if (player.position === 'QB' && positionsFilled.QB > 0) {
    positionsFilled.QB--;
    isBench = false;
  } else if (player.position === 'RB' && positionsFilled.RB > 0) {
    positionsFilled.RB--;
    isBench = false;
  } else if (player.position === 'WR' && positionsFilled.WR > 0) {
    positionsFilled.WR--;
    isBench = false;
  } else if (player.position === 'TE' && positionsFilled.TE > 0) {
    positionsFilled.TE--;
    isBench = false;
  } else if (player.position === 'K' && positionsFilled.K > 0) {
    positionsFilled.K--;
    isBench = false;
  } else if (player.position === 'DST' && positionsFilled.DST > 0) {
    positionsFilled.DST--;
    isBench = false;
  } else if (positionsFilled.FLEX > 0) {
    positionsFilled.FLEX--;
    isBench = false;
  }
  
  if (isBench || starterCount >= 9) {
    runningTotal += player.auctionValue;
    const pointsPerDollar = (player.projectedPoints / player.auctionValue).toFixed(2);
    console.log(`${player.position.padEnd(8)} | ${player.name.padEnd(26)} | ${player.team.padEnd(4)} | ${player.projectedPoints.toFixed(1).padStart(6)} | $${player.auctionValue.toString().padStart(4)} | ${pointsPerDollar.padStart(7)} | $${runningTotal.toString().padStart(3)}`);
  }
}

console.log('\n' + '='.repeat(85));
console.log(`TOTAL COST: $${result.totalCost}`);
console.log(`REMAINING BUDGET: $${200 - result.totalCost}`);
console.log(`TOTAL PROJECTED POINTS: ${result.totalPoints.toFixed(1)}`);
console.log(`AVERAGE POINTS PER DOLLAR: ${(result.totalPoints / result.totalCost).toFixed(2)}`);
console.log('='.repeat(85));