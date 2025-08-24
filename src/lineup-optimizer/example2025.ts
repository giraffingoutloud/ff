/**
 * Example Usage for ESPN 2025-2026 Fantasy Football Lineup Optimizer
 */

import { PlayerProjection, PlayerInfo, GameInfo, ESPN_PPR_2025 } from './domain/typesCorrected';
import { TruncatedNormal } from './stats/truncatedNormalRobust';
import { LineupOptimizer2025 } from './core/optimizer2025';
import { opponentFromRoster, opponentLeagueFallback } from './core/opponent2025';
import { adjustForInjury } from './stats/injuryModeling';

/**
 * Example: Create a player projection
 */
function createPlayerProjection(
  id: string,
  name: string,
  team: string,
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST',
  mean: number,
  sd: number,
  status: PlayerInfo['status'] = 'HEALTHY'
): PlayerProjection {
  // Position-specific bounds
  const bounds = {
    QB: { a: 0, b: 60 },
    RB: { a: 0, b: 50 },
    WR: { a: 0, b: 55 },
    TE: { a: 0, b: 40 },
    K: { a: 0, b: 25 },
    DST: { a: -10, b: 35 }
  };
  
  const { a, b } = bounds[position];
  const tn = new TruncatedNormal(mean, sd, a, b);
  
  const player: PlayerInfo = { id, name, team, position, status };
  const game: GameInfo = {
    gameId: `G${id}`,
    kickoffTimeUTC: '2025-09-07T17:00:00Z',
    homeTeam: team,
    awayTeam: 'OPP'
  };
  
  let projection: PlayerProjection = {
    player,
    game,
    tn,
    mean: tn.mean(),
    sd: Math.sqrt(tn.variance()),
    lower: a,
    upper: b
  };
  
  // Adjust for injury if needed
  if (status !== 'HEALTHY') {
    projection = adjustForInjury(projection);
  }
  
  return projection;
}

/**
 * Example: Build a sample roster
 */
function buildSampleRoster(): PlayerProjection[] {
  return [
    // Quarterbacks
    createPlayerProjection('QB1', 'Josh Allen', 'BUF', 'QB', 22, 6),
    createPlayerProjection('QB2', 'Jalen Hurts', 'PHI', 'QB', 20, 5),
    
    // Running Backs
    createPlayerProjection('RB1', 'Christian McCaffrey', 'SF', 'RB', 18, 5),
    createPlayerProjection('RB2', 'Austin Ekeler', 'LAC', 'RB', 14, 4),
    createPlayerProjection('RB3', 'Tony Pollard', 'DAL', 'RB', 12, 4, 'QUESTIONABLE'),
    createPlayerProjection('RB4', 'Rhamondre Stevenson', 'NE', 'RB', 10, 3),
    
    // Wide Receivers
    createPlayerProjection('WR1', 'Tyreek Hill', 'MIA', 'WR', 16, 5),
    createPlayerProjection('WR2', 'Stefon Diggs', 'BUF', 'WR', 14, 4),
    createPlayerProjection('WR3', 'CeeDee Lamb', 'DAL', 'WR', 13, 4),
    createPlayerProjection('WR4', 'A.J. Brown', 'PHI', 'WR', 12, 4),
    createPlayerProjection('WR5', 'Chris Olave', 'NO', 'WR', 10, 3, 'DOUBTFUL'),
    
    // Tight Ends
    createPlayerProjection('TE1', 'Travis Kelce', 'KC', 'TE', 11, 3),
    createPlayerProjection('TE2', 'Mark Andrews', 'BAL', 'TE', 9, 3),
    
    // Kickers
    createPlayerProjection('K1', 'Justin Tucker', 'BAL', 'K', 9, 2),
    
    // Defense
    createPlayerProjection('DST1', 'Buffalo Bills', 'BUF', 'DST', 10, 4),
    
    // Bench
    createPlayerProjection('B1', 'Dameon Pierce', 'HOU', 'RB', 8, 3)
  ];
}

/**
 * Example: Optimize lineup for Week 1
 */
async function optimizeWeek1Lineup() {
  console.log('=== ESPN 2025-2026 Lineup Optimizer Example ===\n');
  
  // 1. Load your roster
  const myRoster = buildSampleRoster();
  console.log(`Roster size: ${myRoster.length} players`);
  console.log(`Injured players: ${myRoster.filter(p => p.player.status !== 'HEALTHY').length}\n`);
  
  // 2. Model opponent (two options)
  
  // Option A: If you know opponent's roster
  const opponentRoster = buildSampleRoster(); // In reality, load opponent's actual roster
  const opponent = opponentFromRoster(opponentRoster, ESPN_PPR_2025);
  console.log(`Opponent projection: ${opponent.mean.toFixed(1)} ± ${Math.sqrt(opponent.variance).toFixed(1)} points`);
  
  // Option B: Use league average
  // const opponent = opponentLeagueFallback(125, 25); // 125 ± 25 points
  
  // 3. Optimize lineup
  const optimizer = new LineupOptimizer2025();
  
  console.log('\nOptimizing lineup...');
  const result = optimizer.optimize(myRoster, opponent, {
    reqs: ESPN_PPR_2025,     // 2 WR for 2025!
    sims: 10000,              // Number of simulations
    targetSE: 0.005,          // Target standard error
    useLHS: true,             // Use Latin Hypercube Sampling
    underdogBias: 0.0         // Set > 0 if you're projected to lose
  });
  
  // 4. Display results
  console.log('\n=== OPTIMAL LINEUP ===');
  console.log('Position | Player | Team | Proj | Status');
  console.log('---------|--------|------|------|-------');
  
  const posCounts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, FLEX: 0 };
  
  for (const player of result.starters) {
    const pos = player.player.position;
    
    // Determine if it's a FLEX play
    let displayPos = pos;
    if (pos === 'RB' && posCounts.RB >= 2) displayPos = 'FLEX' as any;
    else if (pos === 'WR' && posCounts.WR >= 2) displayPos = 'FLEX' as any;
    else if (pos === 'TE' && posCounts.TE >= 1) displayPos = 'FLEX' as any;
    
    if (displayPos === 'FLEX') {
      posCounts.FLEX++;
    } else {
      posCounts[pos]++;
    }
    
    console.log(
      `${displayPos.padEnd(8)} | ${player.player.name.substring(0, 6).padEnd(6)} | ${player.player.team.padEnd(4)} | ${player.mean.toFixed(1).padStart(4)} | ${player.player.status}`
    );
  }
  
  // 5. Display win probability
  console.log('\n=== PROJECTIONS ===');
  console.log(`Win Probability: ${(result.winProbability * 100).toFixed(1)}%`);
  console.log(`Expected Score: ${result.diagnostics.lineupMean.toFixed(1)} points`);
  console.log(`Expected Margin: ${result.expectedMargin > 0 ? '+' : ''}${result.expectedMargin.toFixed(1)} points`);
  console.log(`Standard Dev: ${result.marginStdDev.toFixed(1)} points`);
  
  console.log('\n=== PERCENTILES ===');
  console.log(`5th:  ${result.percentiles.p5.toFixed(1)} points`);
  console.log(`25th: ${result.percentiles.p25.toFixed(1)} points`);
  console.log(`50th: ${result.percentiles.p50.toFixed(1)} points`);
  console.log(`75th: ${result.percentiles.p75.toFixed(1)} points`);
  console.log(`95th: ${result.percentiles.p95.toFixed(1)} points`);
  
  // 6. Validate lineup
  const validation = optimizer.validateLineup(result.starters, ESPN_PPR_2025);
  if (!validation.valid) {
    console.error('\n⚠️ WARNING: Invalid lineup!');
    console.error(validation.errors.join('\n'));
  } else {
    console.log('\n✓ Lineup is valid for ESPN 2025-2026 (2 WR, 1 FLEX)');
  }
  
  // 7. Show bench
  console.log('\n=== BENCH ===');
  for (const player of result.bench) {
    console.log(`${player.player.position} | ${player.player.name} | ${player.mean.toFixed(1)} pts`);
  }
  
  console.log('\n=== DIAGNOSTICS ===');
  console.log(`Candidates evaluated: ${result.diagnostics.candidatesEvaluated}`);
  console.log(`Simulations run: ${result.diagnostics.sims}`);
  console.log(`MC Standard Error: ${result.diagnostics.mcStdErr.toFixed(4)}`);
  console.log(`Analytic Win Prob: ${(result.diagnostics.analyticWinProb * 100).toFixed(1)}%`);
}

// Run the example
optimizeWeek1Lineup().catch(console.error);