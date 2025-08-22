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

function loadAllPlayersWithValues(): Player[] {
  const players: Player[] = [];
  const playerMap = new Map<string, Player>();
  
  // Load from ADP file first (has auction values)
  const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
  const adpContent = fs.readFileSync(adpPath, 'utf-8');
  const adpRecords = parse(adpContent, { columns: true });
  
  for (const record of adpRecords) {
    const projectedPoints = parseFloat(record['Projected Points']) || 0;
    const auctionValue = parseFloat(record['Auction Value']) || 1;
    const position = record['Position']?.toUpperCase();
    
    if (projectedPoints > 0 && auctionValue > 0 && position) {
      playerMap.set(record['Full Name'], {
        name: record['Full Name'],
        team: record['Team Abbreviation'],
        position: position,
        projectedPoints: projectedPoints,
        auctionValue: auctionValue,
        valueRatio: projectedPoints / auctionValue
      });
    }
  }
  
  // Load K and DST from projections
  const projectionFiles = [
    { file: 'k_projections_2025.csv', position: 'K' },
    { file: 'dst_projections_2025.csv', position: 'DST' }
  ];
  
  for (const { file, position } of projectionFiles) {
    const filePath = path.join('/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/projections', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const records = parse(content, { columns: true });
      
      // Get top 15 at each position
      const topPlayers = records
        .filter((r: any) => parseFloat(r.fantasyPoints) > 0)
        .sort((a: any, b: any) => parseFloat(b.fantasyPoints) - parseFloat(a.fantasyPoints))
        .slice(0, 15);
      
      for (const record of topPlayers) {
        const points = parseFloat(record.fantasyPoints);
        // Estimate auction values: $1-5 for K, $1-8 for DST based on tier
        let value = 1;
        if (position === 'K') {
          if (points > 145) value = 3;
          else if (points > 135) value = 2;
        } else if (position === 'DST') {
          if (points > 115) value = 5;
          else if (points > 105) value = 3;
          else if (points > 95) value = 2;
        }
        
        playerMap.set(record.playerName, {
          name: record.playerName,
          team: record.teamName,
          position: position,
          projectedPoints: points,
          auctionValue: value,
          valueRatio: points / value
        });
      }
    }
  }
  
  return Array.from(playerMap.values());
}

function findOptimalFullBudgetTeam(players: Player[], budget: number = 200) {
  // Use dynamic programming approach to get as close to $200 as possible
  // while maximizing points
  
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  const requirements = {
    QB: { min: 1, max: 2 },
    RB: { min: 2, max: 6 },
    WR: { min: 2, max: 6 },
    TE: { min: 1, max: 3 },
    K: { min: 1, max: 1 },
    DST: { min: 1, max: 1 }
  };
  
  // Sort players by projected points (we want the best players)
  const sortedPlayers = [...players].sort((a, b) => b.projectedPoints - a.projectedPoints);
  
  // Try to build a team that spends exactly or nearly $200
  let bestTeam: Player[] = [];
  let bestPoints = 0;
  let bestSpent = 0;
  
  // Strategy: Allocate budget proportionally based on typical auction strategies
  const targetAllocations = {
    'Elite': 140,    // Top tier players (3-4 studs)
    'Middle': 45,    // Mid-tier starters
    'Value': 15      // Cheap fills
  };
  
  // Get elite players first
  const elitePlayers = sortedPlayers.filter(p => p.auctionValue >= 30);
  const midPlayers = sortedPlayers.filter(p => p.auctionValue >= 10 && p.auctionValue < 30);
  const valuePlayers = sortedPlayers.filter(p => p.auctionValue < 10);
  
  // Build team with balanced approach
  const team: Player[] = [];
  let spent = 0;
  const positionCounts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  
  // Phase 1: Get 2-3 elite players (studs and scrubs strategy)
  let eliteCount = 0;
  for (const player of elitePlayers) {
    if (eliteCount >= 3) break;
    if (team.length >= 16) break;
    
    const pos = player.position;
    if (positionCounts[pos] < requirements[pos].max) {
      if (spent + player.auctionValue <= budget - (16 - team.length - 1)) {
        team.push(player);
        spent += player.auctionValue;
        positionCounts[pos]++;
        eliteCount++;
      }
    }
  }
  
  // Phase 2: Fill required positions with mid-tier players
  for (const pos of positions) {
    while (positionCounts[pos] < requirements[pos].min && team.length < 16) {
      const available = midPlayers
        .filter(p => p.position === pos && !team.includes(p))
        .sort((a, b) => b.projectedPoints - a.projectedPoints);
      
      if (available.length > 0) {
        const player = available[0];
        if (spent + player.auctionValue <= budget) {
          team.push(player);
          spent += player.auctionValue;
          positionCounts[pos]++;
        } else {
          // Try a cheaper option
          const cheaperOptions = valuePlayers
            .filter(p => p.position === pos && !team.includes(p))
            .sort((a, b) => b.projectedPoints - a.projectedPoints);
          
          if (cheaperOptions.length > 0) {
            team.push(cheaperOptions[0]);
            spent += cheaperOptions[0].auctionValue;
            positionCounts[pos]++;
          }
        }
      }
    }
  }
  
  // Phase 3: Use remaining budget on best available players
  while (team.length < 16 && spent < budget) {
    const remaining = budget - spent;
    const spotsLeft = 16 - team.length;
    const avgPerSpot = remaining / spotsLeft;
    
    // Find best player we can afford
    const available = sortedPlayers
      .filter(p => !team.includes(p))
      .filter(p => {
        const pos = p.position;
        return positionCounts[pos] < requirements[pos].max;
      });
    
    // Try to find player close to average remaining budget per spot
    let bestPlayer = available.find(p => 
      p.auctionValue <= remaining - (spotsLeft - 1) &&
      p.auctionValue >= avgPerSpot - 10 &&
      p.auctionValue <= avgPerSpot + 10
    );
    
    if (!bestPlayer && available.length > 0) {
      // Just get the best player we can afford
      bestPlayer = available.find(p => p.auctionValue <= remaining - (spotsLeft - 1));
    }
    
    if (bestPlayer) {
      team.push(bestPlayer);
      spent += bestPlayer.auctionValue;
      positionCounts[bestPlayer.position]++;
    } else {
      // Fill with $1 players
      const dollarPlayers = available.filter(p => p.auctionValue === 1);
      if (dollarPlayers.length > 0) {
        team.push(dollarPlayers[0]);
        spent += 1;
        positionCounts[dollarPlayers[0].position]++;
      } else {
        break;
      }
    }
  }
  
  // If we still have budget left and spots, upgrade players
  if (spent < budget && team.length === 16) {
    const upgradeBudget = budget - spent;
    
    // Find upgrade opportunities
    for (let i = 0; i < team.length; i++) {
      const currentPlayer = team[i];
      const betterPlayers = sortedPlayers
        .filter(p => 
          p.position === currentPlayer.position &&
          p.projectedPoints > currentPlayer.projectedPoints &&
          p.auctionValue <= currentPlayer.auctionValue + upgradeBudget &&
          !team.includes(p)
        );
      
      if (betterPlayers.length > 0) {
        const upgrade = betterPlayers[0];
        const extraCost = upgrade.auctionValue - currentPlayer.auctionValue;
        
        if (extraCost <= upgradeBudget) {
          team[i] = upgrade;
          spent += extraCost;
          break;
        }
      }
    }
  }
  
  const totalPoints = team.reduce((sum, p) => sum + p.projectedPoints, 0);
  
  return {
    roster: team,
    totalCost: spent,
    totalPoints: totalPoints
  };
}

// Main execution
const players = loadAllPlayersWithValues();
console.log(`\nLoaded ${players.length} players\n`);

const result = findOptimalFullBudgetTeam(players, 200);

// Organize for display
const starters: Array<{ player: Player, role: string }> = [];
const bench: Player[] = [];
const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
let flexUsed = false;

// Sort by points to identify starters
const sortedRoster = [...result.roster].sort((a, b) => b.projectedPoints - a.projectedPoints);

for (const player of sortedRoster) {
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
  } else if (!flexUsed && ['RB', 'WR', 'TE'].includes(player.position)) {
    starters.push({ player, role: 'FLEX' });
    flexUsed = true;
    assigned = true;
  }
  
  if (!assigned) {
    bench.push(player);
  }
}

// Sort starters by position
const posOrder = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE', 'FLEX', 'K', 'DST'];
starters.sort((a, b) => posOrder.indexOf(a.role) - posOrder.indexOf(b.role));

console.log('╔════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║        OPTIMAL TEAM USING FULL $200 BUDGET - MAXIMIZE TOTAL POINTS               ║');
console.log('╚════════════════════════════════════════════════════════════════════════════════════╝\n');

console.log('STARTING LINEUP:');
console.log('┌─────────┬──────────────────────────────────┬──────┬────────┬───────┬─────────────┐');
console.log('│ Pos     │ Player Name                      │ Team │ Points │ Value │ Running Tot │');
console.log('├─────────┼──────────────────────────────────┼──────┼────────┼───────┼─────────────┤');

let runningTotal = 0;
for (const { player, role } of starters) {
  runningTotal += player.auctionValue;
  console.log(`│ ${role.padEnd(7)} │ ${player.name.padEnd(32)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ $${runningTotal.toString().padStart(10)} │`);
}
console.log('└─────────┴──────────────────────────────────┴──────┴────────┴───────┴─────────────┘\n');

if (bench.length > 0) {
  console.log('BENCH:');
  console.log('┌─────────┬──────────────────────────────────┬──────┬────────┬───────┬─────────────┐');
  console.log('│ Pos     │ Player Name                      │ Team │ Points │ Value │ Running Tot │');
  console.log('├─────────┼──────────────────────────────────┼──────┼────────┼───────┼─────────────┤');
  
  for (const player of bench) {
    runningTotal += player.auctionValue;
    console.log(`│ ${player.position.padEnd(7)} │ ${player.name.padEnd(32)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ $${runningTotal.toString().padStart(10)} │`);
  }
  console.log('└─────────┴──────────────────────────────────┴──────┴────────┴───────┴─────────────┘\n');
}

// Position breakdown
const posBreakdown: Record<string, { count: number, spent: number, points: number }> = {};
for (const player of result.roster) {
  if (!posBreakdown[player.position]) {
    posBreakdown[player.position] = { count: 0, spent: 0, points: 0 };
  }
  posBreakdown[player.position].count++;
  posBreakdown[player.position].spent += player.auctionValue;
  posBreakdown[player.position].points += player.projectedPoints;
}

console.log('SPENDING BY POSITION:');
console.log('┌──────────┬───────┬────────┬────────────┬──────────┐');
console.log('│ Position │ Count │ Spent  │ Avg $/Player│ Points   │');
console.log('├──────────┼───────┼────────┼────────────┼──────────┤');
for (const [pos, data] of Object.entries(posBreakdown)) {
  const avg = (data.spent / data.count).toFixed(1);
  console.log(`│ ${pos.padEnd(8)} │ ${data.count.toString().padStart(5)} │ $${data.spent.toString().padStart(5)} │ $${avg.padStart(10)} │ ${data.points.toFixed(1).padStart(8)} │`);
}
console.log('└──────────┴───────┴────────┴────────────┴──────────┘\n');

console.log('═══════════════════════════════════════════════════════════════════════════════════');
console.log(`TOTAL SPENT:            $${result.totalCost} / $200`);
console.log(`REMAINING BUDGET:       $${200 - result.totalCost}`);
console.log(`TOTAL PROJECTED POINTS: ${result.totalPoints.toFixed(1)}`);
console.log(`POINTS PER DOLLAR:      ${(result.totalPoints / result.totalCost).toFixed(2)}`);
console.log('═══════════════════════════════════════════════════════════════════════════════════');