/**
 * Quick Start Example - Ready to Run!
 * 
 * Usage: npx tsx src/lineup-optimizer/quickstart.ts
 */

import { LineupOptimizer2025 } from './core/optimizer2025';
import { PlayerProjection, ESPN_PPR_2025, PlayerInfo, GameInfo } from './domain/typesCorrected';
import { TruncatedNormal } from './stats/truncatedNormalCorrected';
import { opponentLeagueFallback } from './core/opponent2025';

// Helper to create a player
function player(
  name: string,
  team: string,
  position: string,
  projPts: number,
  stdDev: number,
  status: PlayerInfo['status'] = 'HEALTHY'
): PlayerProjection {
  const id = `${position}_${name.replace(/\s+/g, '_')}`;
  
  // Position-specific bounds
  const bounds: Record<string, {a: number, b: number}> = {
    QB: { a: 0, b: 60 },
    RB: { a: 0, b: 50 },
    WR: { a: 0, b: 55 },
    TE: { a: 0, b: 40 },
    K: { a: 0, b: 25 },
    DST: { a: -10, b: 35 }
  };
  
  const { a, b } = bounds[position];
  const tn = new TruncatedNormal(projPts, stdDev, a, b);
  
  const playerInfo: PlayerInfo = { id, name, team, position, status };
  const game: GameInfo = {
    gameId: `G${id}`,
    kickoffTimeUTC: '2025-09-07T17:00:00Z',
    homeTeam: team,
    awayTeam: 'OPP'
  };
  
  return {
    player: playerInfo,
    game,
    tn,
    mean: tn.mean(),
    sd: Math.sqrt(tn.variance()),
    lower: a,
    upper: b
  };
}

async function runQuickStart() {
  console.log('===========================================');
  console.log('   ESPN Fantasy Football Lineup Optimizer  ');
  console.log('        Quick Start Example                ');
  console.log('===========================================\n');

  // YOUR ROSTER - Edit these with your actual players!
  const myRoster: PlayerProjection[] = [
    // === QUARTERBACKS ===
    player('Josh Allen', 'BUF', 'QB', 24, 6),
    player('Dak Prescott', 'DAL', 'QB', 20, 5),
    
    // === RUNNING BACKS ===
    player('Christian McCaffrey', 'SF', 'RB', 20, 5),
    player('Saquon Barkley', 'PHI', 'RB', 16, 4),
    player('Tony Pollard', 'TEN', 'RB', 12, 4, 'QUESTIONABLE'), // Injured
    player('Javonte Williams', 'DEN', 'RB', 10, 3),
    
    // === WIDE RECEIVERS ===
    player('Tyreek Hill', 'MIA', 'WR', 18, 5),
    player('CeeDee Lamb', 'DAL', 'WR', 16, 4),
    player('A.J. Brown', 'PHI', 'WR', 15, 4),
    player('Calvin Ridley', 'TEN', 'WR', 12, 3),
    player('Chris Olave', 'NO', 'WR', 11, 3, 'DOUBTFUL'), // Injured
    
    // === TIGHT ENDS ===
    player('Travis Kelce', 'KC', 'TE', 12, 3),
    player('Mark Andrews', 'BAL', 'TE', 10, 3),
    
    // === KICKER ===
    player('Justin Tucker', 'BAL', 'K', 9, 2),
    
    // === DEFENSE ===
    player('Dallas Cowboys', 'DAL', 'DST', 8, 3),
    player('Buffalo Bills', 'BUF', 'DST', 10, 4)
  ];

  console.log(`📊 Your Roster: ${myRoster.length} players`);
  console.log(`🤕 Injured: ${myRoster.filter(p => p.player.status !== 'HEALTHY').map(p => p.player.name).join(', ')}\n`);

  // OPPONENT'S PROJECTED SCORE - Edit based on your matchup
  const opponentMean = 125;  // Their projected points
  const opponentStdDev = 20; // Their uncertainty
  const opponent = opponentLeagueFallback(opponentMean, opponentStdDev);

  console.log(`🎯 Opponent projection: ${opponentMean} ± ${opponentStdDev} points\n`);

  // Initialize the optimizer
  const optimizer = new LineupOptimizer2025();

  // Find the best lineup
  console.log('🔄 Optimizing lineup...\n');
  const result = optimizer.optimize(
    myRoster,
    opponent,
    { reqs: ESPN_PPR_2025 }
  );

  // Display the optimal lineup
  console.log('✨ OPTIMAL LINEUP FOR THIS WEEK:');
  console.log('================================');
  console.log('Pos  | Player  | Team | Points | Status');
  console.log('-----|---------|------|--------|--------');
  
  let totalProjected = 0;
  result.starters.forEach(p => {
    const status = p.player.status === 'HEALTHY' ? '✓' : '⚠️';
    console.log(
      `${p.player.position.padEnd(4)} | ${p.player.name.substring(0,7).padEnd(7)} | ${p.player.team.padEnd(4)} | ${
        p.mean.toFixed(1).padStart(6)
      } | ${status}`
    );
    totalProjected += p.mean;
  });

  console.log('================================');
  console.log(`TOTAL PROJECTED: ${totalProjected.toFixed(1)} points\n`);

  // Show win probability
  const winPct = (result.winProbability * 100).toFixed(1);
  const marginStr = result.expectedMargin > 0 
    ? `+${result.expectedMargin.toFixed(1)}` 
    : result.expectedMargin.toFixed(1);

  console.log('📈 PROJECTIONS:');
  console.log(`   Win Probability: ${winPct}%`);
  console.log(`   Expected Margin: ${marginStr} points`);
  console.log(`   Your Score: ${totalProjected.toFixed(1)} ± ${result.marginStdDev.toFixed(1)}`);
  console.log(`   Opponent: ${opponentMean} ± ${opponentStdDev}\n`);

  // Show confidence levels
  if (result.winProbability > 0.6) {
    console.log('✅ Strong favorite - lineup looks great!');
  } else if (result.winProbability > 0.5) {
    console.log('👍 Slight favorite - competitive matchup');
  } else if (result.winProbability > 0.4) {
    console.log('⚔️ Toss-up game - every point matters');
  } else {
    console.log('🎲 Underdog - might need some luck');
  }

  // Show who's on the bench
  const starters = new Set(result.starters.map(p => p.player.id));
  const bench = result.bench;
  
  if (bench.length > 0) {
    console.log('\n📋 BENCH:');
    bench.forEach(p => {
      const status = p.player.status === 'HEALTHY' ? '' : ` (${p.player.status})`;
      console.log(`   ${p.player.position} | ${p.player.name.substring(0,7)} | ${p.mean.toFixed(1)} pts${status}`);
    });
  }

  // Validation check
  const validation = optimizer.validateLineup(result.starters, ESPN_PPR_2025);
  if (!validation.valid) {
    console.log('\n⚠️ WARNING - Lineup issues:');
    validation.errors.forEach(e => console.log(`   - ${e}`));
  } else {
    console.log('\n✅ Lineup is valid for ESPN PPR!');
  }

  console.log('\n===========================================');
  console.log('         Good luck this week! 🏈           ');
  console.log('===========================================');
}

// Run it!
runQuickStart().catch(console.error);