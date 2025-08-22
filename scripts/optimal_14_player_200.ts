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
  valueRatio: number;
}

function loadValidPlayers(): Player[] {
  const players: Player[] = [];
  
  const adpPath = '/mnt/c/Users/giraf/Documents/projects/ff/canonical_data/adp/adp0_2025.csv';
  const adpContent = fs.readFileSync(adpPath, 'utf-8');
  const adpRecords = parse(adpContent, { columns: true });
  
  // Only get first 283 players (the ones shown in UI)
  const first283 = adpRecords.slice(0, 283);
  
  for (const record of first283) {
    const auctionValueStr = record['Auction Value'];
    const projectedPoints = parseFloat(record['Projected Points']) || 0;
    const position = record['Position']?.toUpperCase();
    
    // Skip N/A values and invalid entries
    if (auctionValueStr === 'N/A' || !auctionValueStr) continue;
    const auctionValue = parseFloat(auctionValueStr);
    if (!auctionValue || auctionValue <= 0) continue;
    if (!position || position === 'K' || position === 'DST') continue;
    if (projectedPoints <= 0) continue;
    
    players.push({
      rank: parseInt(record['Overall Rank']) || 999,
      name: record['Full Name'],
      team: record['Team Abbreviation'],
      position: position,
      projectedPoints: projectedPoints,
      auctionValue: auctionValue,
      valueRatio: projectedPoints / auctionValue
    });
  }
  
  return players;
}

function buildOptimal14Team(players: Player[], targetBudget: number = 200): any {
  // Requirements: 2 QB, 4 RB, 4 WR, 2 TE, 2 FLEX = 14 total
  const TEAM_SIZE = 14;
  
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
  
  // Try different spending strategies to get close to $200
  const strategies = [
    { elite: 2, mid: 6, value: 6 },  // Balanced
    { elite: 3, mid: 4, value: 7 },  // Stars and scrubs
    { elite: 1, mid: 8, value: 5 },  // Depth
  ];
  
  let bestTeam: any = null;
  let closestTo200 = 0;
  
  for (const strategy of strategies) {
    const roster: Player[] = [];
    const used = new Set<string>();
    let spent = 0;
    
    // 1. Get elite players (>$35)
    const elites = [...players]
      .filter(p => p.auctionValue >= 35)
      .sort((a, b) => b.projectedPoints - a.projectedPoints)
      .slice(0, 10);
    
    for (let i = 0; i < strategy.elite && i < elites.length; i++) {
      if (spent + elites[i].auctionValue <= targetBudget - (TEAM_SIZE - roster.length - 1)) {
        roster.push(elites[i]);
        used.add(elites[i].name);
        spent += elites[i].auctionValue;
      }
    }
    
    // 2. Fill positions with requirements
    const requirements = [
      { pos: 'QB', needed: 2 },
      { pos: 'RB', needed: 4 },
      { pos: 'WR', needed: 4 },
      { pos: 'TE', needed: 2 }
    ];
    
    for (const req of requirements) {
      const current = roster.filter(p => p.position === req.pos).length;
      const needed = req.needed - current;
      
      if (needed > 0) {
        const available = (byPosition[req.pos] || [])
          .filter(p => !used.has(p.name))
          .slice(0, 20); // Top 20 at position
        
        for (let i = 0; i < needed && i < available.length; i++) {
          const remainingBudget = targetBudget - spent;
          const remainingSpots = TEAM_SIZE - roster.length;
          const avgPerSpot = remainingBudget / remainingSpots;
          
          // Find player close to average remaining budget
          let player = available.find(p => 
            p.auctionValue >= avgPerSpot - 10 && 
            p.auctionValue <= avgPerSpot + 10
          );
          
          if (!player) {
            player = available.find(p => p.auctionValue <= remainingBudget - (remainingSpots - 1));
          }
          
          if (player) {
            roster.push(player);
            used.add(player.name);
            spent += player.auctionValue;
            available.splice(available.indexOf(player), 1);
          }
        }
      }
    }
    
    // 3. Fill FLEX spots
    const flexNeeded = TEAM_SIZE - roster.length;
    if (flexNeeded > 0) {
      const flexEligible = [...(byPosition.RB || []), ...(byPosition.WR || []), ...(byPosition.TE || [])]
        .filter(p => !used.has(p.name))
        .sort((a, b) => b.valueRatio - a.valueRatio);
      
      for (let i = 0; i < flexNeeded && i < flexEligible.length; i++) {
        const remainingBudget = targetBudget - spent;
        const remainingSpots = TEAM_SIZE - roster.length;
        
        // Try to spend remaining budget evenly
        const targetSpend = remainingBudget / remainingSpots;
        
        let player = flexEligible.find(p => 
          p.auctionValue >= targetSpend - 5 && 
          p.auctionValue <= targetSpend + 5
        );
        
        if (!player && remainingBudget > remainingSpots) {
          player = flexEligible.find(p => p.auctionValue <= remainingBudget - (remainingSpots - 1));
        }
        
        if (player) {
          roster.push(player);
          used.add(player.name);
          spent += player.auctionValue;
        }
      }
    }
    
    // Check if this is closer to $200
    if (Math.abs(targetBudget - spent) < Math.abs(targetBudget - closestTo200)) {
      bestTeam = { roster, spent, points: roster.reduce((sum, p) => sum + p.projectedPoints, 0) };
      closestTo200 = spent;
    }
    
    // If we're under budget and have 14 players, try to upgrade
    if (roster.length === TEAM_SIZE && spent < targetBudget - 5) {
      const upgradeAmount = targetBudget - spent;
      
      // Find cheapest player to replace
      const sortedByValue = [...roster].sort((a, b) => a.auctionValue - b.auctionValue);
      
      for (const weakPlayer of sortedByValue) {
        const betterOptions = players.filter(p => 
          !used.has(p.name) &&
          p.position === weakPlayer.position &&
          p.projectedPoints > weakPlayer.projectedPoints &&
          p.auctionValue <= weakPlayer.auctionValue + upgradeAmount
        ).sort((a, b) => b.projectedPoints - a.projectedPoints);
        
        if (betterOptions.length > 0) {
          const upgrade = betterOptions[0];
          const idx = roster.indexOf(weakPlayer);
          const newSpent = spent - weakPlayer.auctionValue + upgrade.auctionValue;
          
          if (newSpent <= targetBudget) {
            roster[idx] = upgrade;
            used.delete(weakPlayer.name);
            used.add(upgrade.name);
            spent = newSpent;
            
            if (Math.abs(targetBudget - spent) < Math.abs(targetBudget - closestTo200)) {
              bestTeam = { roster, spent, points: roster.reduce((sum, p) => sum + p.projectedPoints, 0) };
              closestTo200 = spent;
            }
            break;
          }
        }
      }
    }
  }
  
  return bestTeam;
}

// Main execution
const validPlayers = loadValidPlayers();
console.log(`\n✓ Loaded ${validPlayers.length} valid players from first 283 in database\n`);

const team = buildOptimal14Team(validPlayers, 200);

if (!team) {
  console.log('Could not build a valid team');
  process.exit(1);
}

// Categorize roster
const categorized: Record<string, Player[]> = {
  QB: [], RB: [], WR: [], TE: [], FLEX: []
};

const maxCounts = { QB: 2, RB: 4, WR: 4, TE: 2 };
const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };

// Sort by projected points to assign best players to starting positions
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

console.log('╔═══════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║          OPTIMAL 14-PLAYER TEAM - MUST SPEND $200 (2QB/4RB/4WR/2TE/2FLEX)            ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════════════╝\n');

const groups = [
  { name: 'QUARTERBACKS', key: 'QB', required: 2 },
  { name: 'RUNNING BACKS', key: 'RB', required: 4 },
  { name: 'WIDE RECEIVERS', key: 'WR', required: 4 },
  { name: 'TIGHT ENDS', key: 'TE', required: 2 },
  { name: 'FLEX POSITIONS', key: 'FLEX', required: 2 }
];

for (const group of groups) {
  const players = categorized[group.key];
  if (players.length === 0) continue;
  
  console.log(`${group.name} (${players.length}/${group.required}):`);
  console.log('┌────────────────────────────────────┬──────┬────────┬───────┬──────────┐');
  console.log('│ Player Name                        │ Team │ Points │ Value │ Pts/$    │');
  console.log('├────────────────────────────────────┼──────┼────────┼───────┼──────────┤');
  
  for (const player of players) {
    const ptsPerDollar = (player.projectedPoints / player.auctionValue).toFixed(1);
    console.log(`│ ${player.name.padEnd(34)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │ ${ptsPerDollar.padStart(7)} │`);
  }
  
  const subtotal = players.reduce((sum, p) => sum + p.auctionValue, 0);
  const subPoints = players.reduce((sum, p) => sum + p.projectedPoints, 0);
  
  console.log('├────────────────────────────────────┼──────┼────────┼───────┼──────────┤');
  console.log(`│ Subtotal                           │      │ ${subPoints.toFixed(1).padStart(6)} │ $${subtotal.toString().padStart(4)} │          │`);
  console.log('└────────────────────────────────────┴──────┴────────┴───────┴──────────┘\n');
}

// Position breakdown
const posBreakdown: Record<string, { count: number, spent: number, points: number }> = {};
for (const player of team.roster) {
  if (!posBreakdown[player.position]) {
    posBreakdown[player.position] = { count: 0, spent: 0, points: 0 };
  }
  posBreakdown[player.position].count++;
  posBreakdown[player.position].spent += player.auctionValue;
  posBreakdown[player.position].points += player.projectedPoints;
}

console.log('SPENDING BY POSITION:');
console.log('┌──────────┬───────┬────────┬──────────┬──────────┐');
console.log('│ Position │ Count │ Spent  │ Avg Cost │ Points   │');
console.log('├──────────┼───────┼────────┼──────────┼──────────┤');

for (const [pos, data] of Object.entries(posBreakdown)) {
  const avg = (data.spent / data.count).toFixed(1);
  console.log(`│ ${pos.padEnd(8)} │ ${data.count.toString().padStart(5)} │ $${data.spent.toString().padStart(5)} │ $${avg.padStart(7)} │ ${data.points.toFixed(1).padStart(8)} │`);
}
console.log('└──────────┴───────┴────────┴──────────┴──────────┘\n');

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log(`ROSTER SIZE:            ${team.roster.length} / 14 players`);
console.log(`TOTAL SPENT:            $${team.spent} / $200 ${team.spent === 200 ? '✓ PERFECT!' : `(${team.spent > 200 ? 'over' : 'under'} by $${Math.abs(200 - team.spent)})`}`);
console.log(`TOTAL PROJECTED POINTS: ${team.points.toFixed(1)}`);
console.log(`POINTS PER DOLLAR:      ${(team.points / team.spent).toFixed(2)}`);
console.log('═══════════════════════════════════════════════════════════════════════════════');