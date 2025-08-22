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
  
  // Load from ADP
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
  
  // Add K and DST
  const kickers = [
    { name: 'Jake Bates', team: 'DET', position: 'K', projectedPoints: 150, auctionValue: 2 },
    { name: 'Harrison Butker', team: 'KC', position: 'K', projectedPoints: 145, auctionValue: 1 },
    { name: 'Justin Tucker', team: 'BAL', position: 'K', projectedPoints: 143, auctionValue: 1 }
  ];
  
  const dsts = [
    { name: 'Bills DST', team: 'BUF', position: 'DST', projectedPoints: 120, auctionValue: 3 },
    { name: '49ers DST', team: 'SF', position: 'DST', projectedPoints: 115, auctionValue: 2 },
    { name: 'Cowboys DST', team: 'DAL', position: 'DST', projectedPoints: 110, auctionValue: 1 }
  ];
  
  players.push(...kickers, ...dsts);
  
  return players;
}

function buildExact200Team(players: Player[]) {
  // Target: 2 QB, 4 RB, 4 WR, 2 TE, 1 K, 1 DST, 2 FLEX = 16 total
  const TARGET_BUDGET = 200;
  
  // Sort by position
  const byPos: Record<string, Player[]> = {
    QB: [], RB: [], WR: [], TE: [], K: [], DST: []
  };
  
  for (const p of players) {
    if (byPos[p.position]) {
      byPos[p.position].push(p);
    }
  }
  
  // Sort each by points/value ratio
  for (const pos in byPos) {
    byPos[pos].sort((a, b) => {
      const ratioA = a.projectedPoints / a.auctionValue;
      const ratioB = b.projectedPoints / b.auctionValue;
      return ratioB - ratioA;
    });
  }
  
  const roster: Player[] = [];
  const used = new Set<string>();
  let spent = 0;
  
  // Budget allocation strategy for exactly $200
  // Core positions: ~$180
  // Bench/Flex: ~$20
  
  // 1. Get one elite RB or WR ($40-50)
  const elites = [...byPos.RB, ...byPos.WR]
    .filter(p => p.auctionValue >= 40 && p.auctionValue <= 60)
    .sort((a, b) => b.projectedPoints - a.projectedPoints);
  
  if (elites.length > 0) {
    roster.push(elites[0]);
    used.add(elites[0].name);
    spent += elites[0].auctionValue;
  }
  
  // 2. Get 2 QBs - one good ($15-20), one cheap ($5-10)
  const goodQB = byPos.QB.find(q => 
    !used.has(q.name) && q.auctionValue >= 15 && q.auctionValue <= 25
  );
  if (goodQB) {
    roster.push(goodQB);
    used.add(goodQB.name);
    spent += goodQB.auctionValue;
  }
  
  const cheapQB = byPos.QB.find(q => 
    !used.has(q.name) && q.auctionValue >= 3 && q.auctionValue <= 10
  );
  if (cheapQB) {
    roster.push(cheapQB);
    used.add(cheapQB.name);
    spent += cheapQB.auctionValue;
  }
  
  // 3. Fill RBs (need 3 more + potential flex)
  const rbsNeeded = 3;
  const remainingRBBudget = 60;
  const rbs = byPos.RB.filter(p => !used.has(p.name));
  
  // Get mix of mid-tier RBs
  for (let i = 0; i < rbsNeeded && i < rbs.length; i++) {
    const maxSpend = Math.floor(remainingRBBudget / (rbsNeeded - i));
    const rb = rbs.find(r => r.auctionValue <= maxSpend && r.auctionValue >= 10);
    
    if (rb) {
      roster.push(rb);
      used.add(rb.name);
      spent += rb.auctionValue;
      rbs.splice(rbs.indexOf(rb), 1);
    }
  }
  
  // 4. Fill WRs (need 3-4 more)
  const wrsNeeded = roster.filter(p => p.position === 'WR').length === 0 ? 4 : 3;
  const remainingWRBudget = 50;
  const wrs = byPos.WR.filter(p => !used.has(p.name));
  
  for (let i = 0; i < wrsNeeded && i < wrs.length; i++) {
    const maxSpend = Math.floor(remainingWRBudget / (wrsNeeded - i));
    const wr = wrs.find(w => w.auctionValue <= maxSpend && w.auctionValue >= 8);
    
    if (wr) {
      roster.push(wr);
      used.add(wr.name);
      spent += wr.auctionValue;
      wrs.splice(wrs.indexOf(wr), 1);
    }
  }
  
  // 5. Get 2 TEs
  const tes = byPos.TE.filter(p => !used.has(p.name));
  for (let i = 0; i < 2 && i < tes.length; i++) {
    const te = tes.find(t => t.auctionValue <= 15 && t.auctionValue >= 5);
    if (te) {
      roster.push(te);
      used.add(te.name);
      spent += te.auctionValue;
      tes.splice(tes.indexOf(te), 1);
    }
  }
  
  // 6. Get K and DST (cheap)
  const kicker = byPos.K.find(k => !used.has(k.name) && k.auctionValue <= 2);
  if (kicker) {
    roster.push(kicker);
    used.add(kicker.name);
    spent += kicker.auctionValue;
  }
  
  const dst = byPos.DST.find(d => !used.has(d.name) && d.auctionValue <= 3);
  if (dst) {
    roster.push(dst);
    used.add(dst.name);
    spent += dst.auctionValue;
  }
  
  // 7. Fill remaining spots (FLEX and any missing) with best available
  const targetRoster = 16;
  const spotsLeft = targetRoster - roster.length;
  const budgetLeft = TARGET_BUDGET - spent;
  
  if (spotsLeft > 0 && budgetLeft > 0) {
    const flexEligible = [...byPos.RB, ...byPos.WR, ...byPos.TE]
      .filter(p => !used.has(p.name))
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    
    for (let i = 0; i < spotsLeft && i < flexEligible.length; i++) {
      const maxForSpot = Math.floor(budgetLeft / (spotsLeft - i));
      
      // Find best player we can afford
      let best = flexEligible.find(p => p.auctionValue <= maxForSpot);
      
      // If we have extra budget, get a better player
      if (budgetLeft > spotsLeft * 5) {
        const better = flexEligible.find(p => 
          p.auctionValue > maxForSpot && 
          p.auctionValue <= budgetLeft - (spotsLeft - i - 1)
        );
        if (better) best = better;
      }
      
      if (best) {
        roster.push(best);
        used.add(best.name);
        spent += best.auctionValue;
        flexEligible.splice(flexEligible.indexOf(best), 1);
      }
    }
  }
  
  // If under budget and have 16 players, try to upgrade
  if (roster.length === 16 && spent < TARGET_BUDGET) {
    const upgradeAmount = TARGET_BUDGET - spent;
    
    // Find the weakest link
    const weakest = roster.sort((a, b) => a.projectedPoints - b.projectedPoints)[0];
    const betterOptions = players.filter(p => 
      !used.has(p.name) &&
      p.position === weakest.position &&
      p.projectedPoints > weakest.projectedPoints &&
      p.auctionValue <= weakest.auctionValue + upgradeAmount
    ).sort((a, b) => b.projectedPoints - a.projectedPoints);
    
    if (betterOptions.length > 0) {
      const idx = roster.indexOf(weakest);
      spent = spent - weakest.auctionValue + betterOptions[0].auctionValue;
      roster[idx] = betterOptions[0];
    }
  }
  
  return { roster, spent, points: roster.reduce((sum, p) => sum + p.projectedPoints, 0) };
}

// Main execution
const players = loadAllPlayers();
const result = buildExact200Team(players);

// Categorize roster
const categorized = {
  QB: [] as Player[],
  RB: [] as Player[],
  WR: [] as Player[],
  TE: [] as Player[],
  K: [] as Player[],
  DST: [] as Player[],
  FLEX: [] as Player[]
};

const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };

// Sort by points to identify best players for starting spots
const sorted = [...result.roster].sort((a, b) => b.projectedPoints - a.projectedPoints);

for (const player of sorted) {
  const pos = player.position;
  
  if (pos === 'QB' && counts.QB < 2) {
    categorized.QB.push(player);
    counts.QB++;
  } else if (pos === 'RB' && counts.RB < 4) {
    categorized.RB.push(player);
    counts.RB++;
  } else if (pos === 'WR' && counts.WR < 4) {
    categorized.WR.push(player);
    counts.WR++;
  } else if (pos === 'TE' && counts.TE < 2) {
    categorized.TE.push(player);
    counts.TE++;
  } else if (pos === 'K' && counts.K < 1) {
    categorized.K.push(player);
    counts.K++;
  } else if (pos === 'DST' && counts.DST < 1) {
    categorized.DST.push(player);
    counts.DST++;
  } else if (['RB', 'WR', 'TE'].includes(pos)) {
    categorized.FLEX.push(player);
  }
}

console.log('\n╔══════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║       OPTIMAL $200 TEAM (2 QB, 4 RB, 4 WR, 2 TE, 1 K, 1 DST, 2 FLEX) - 16 PLAYERS        ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝\n');

// Display roster
const positions = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DST'];
let totalDisplayed = 0;

for (const pos of positions) {
  const players = categorized[pos as keyof typeof categorized];
  if (players.length === 0) continue;
  
  const posName = pos === 'FLEX' ? 'FLEX POSITIONS' : 
                  pos === 'DST' ? 'DEFENSE/ST' :
                  pos === 'K' ? 'KICKER' :
                  pos === 'QB' ? 'QUARTERBACKS' :
                  pos === 'RB' ? 'RUNNING BACKS' :
                  pos === 'WR' ? 'WIDE RECEIVERS' :
                  'TIGHT ENDS';
  
  console.log(`${posName}:`);
  console.log('┌───┬──────────────────────────────────┬──────┬────────┬───────┐');
  console.log('│ # │ Player Name                      │ Team │ Points │ Cost  │');
  console.log('├───┼──────────────────────────────────┼──────┼────────┼───────┤');
  
  players.forEach((player, idx) => {
    totalDisplayed++;
    console.log(`│ ${(idx + 1).toString().padStart(1)} │ ${player.name.padEnd(32)} │ ${player.team.padEnd(4)} │ ${player.projectedPoints.toFixed(1).padStart(6)} │ $${player.auctionValue.toString().padStart(4)} │`);
  });
  
  const subtotal = players.reduce((sum, p) => sum + p.auctionValue, 0);
  const subPoints = players.reduce((sum, p) => sum + p.projectedPoints, 0);
  console.log('├───┼──────────────────────────────────┼──────┼────────┼───────┤');
  console.log(`│   │ Subtotal (${players.length} players)              │      │ ${subPoints.toFixed(1).padStart(6)} │ $${subtotal.toString().padStart(4)} │`);
  console.log('└───┴──────────────────────────────────┴──────┴────────┴───────┘\n');
}

console.log('══════════════════════════════════════════════════════════════════════════════');
console.log(`TOTAL ROSTER SIZE:      ${result.roster.length} / 16 players`);
console.log(`TOTAL SPENT:            $${result.spent} / $200`);
console.log(`REMAINING BUDGET:       $${200 - result.spent}`);
console.log(`TOTAL PROJECTED POINTS: ${result.points.toFixed(1)}`);
console.log(`POINTS PER DOLLAR:      ${(result.points / result.spent).toFixed(2)}`);
console.log('══════════════════════════════════════════════════════════════════════════════');