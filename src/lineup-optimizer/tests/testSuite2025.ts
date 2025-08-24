/**
 * Comprehensive Test Suite for 2025-2026 Season
 * Property tests, oracle verification, and calibration
 */

import { TruncatedNormal, fitTNFromQuantiles } from '../stats/truncatedNormalRobust';
import { RNG } from '../utils/rng';
import { lhsNormals, compareLHSvsMC } from '../utils/latinHypercube';
import { buildLatentFactorWeights, simulateTotalsCopulaTN } from '../stats/simulators2025';
import { PlayerProjection, PlayerInfo, GameInfo, Position, ESPN_PPR_2025 } from '../domain/typesCorrected';
import { LineupOptimizer2025 } from '../core/optimizer2025';
import { opponentLeagueFallback } from '../core/opponent2025';
import { oracleArgmaxWinProbability } from '../core/enumerationCorrected';
import { crpsFromSamples, reliabilityBins, expectedCalibrationError } from '../eval/calibrationCorrected';

/**
 * Kolmogorov-Smirnov test statistic
 */
function ksStatistic(samples: number[], cdf: (x: number) => number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  let d = 0;
  
  for (let i = 0; i < n; i++) {
    const F = cdf(sorted[i]);
    const dPlus = (i + 1) / n - F;
    const dMinus = F - i / n;
    d = Math.max(d, Math.abs(dPlus), Math.abs(dMinus));
  }
  
  return d;
}

/**
 * Create test player
 */
function mkPlayer(
  id: string,
  name: string,
  team: string,
  position: Position,
  tn: TruncatedNormal
): PlayerProjection {
  const info: PlayerInfo = {
    id,
    name,
    team,
    position,
    status: 'HEALTHY'
  };
  
  const game: GameInfo = {
    gameId: 'G1',
    kickoffTimeUTC: '2025-09-07T17:00:00Z',
    homeTeam: team,
    awayTeam: 'OPP'
  };
  
  return {
    player: info,
    game,
    tn,
    mean: tn.mean(),
    sd: Math.sqrt(tn.variance()),
    lower: tn.a,
    upper: tn.b
  };
}

/**
 * Property Tests
 */
export async function runPropertyTests(): Promise<{
  passed: boolean;
  results: Array<{ test: string; passed: boolean; details?: string }>;
}> {
  const results: Array<{ test: string; passed: boolean; details?: string }> = [];
  
  // Test 1: TN marginal preservation (K-S test)
  {
    const tnA = new TruncatedNormal(12, 5, 0, 40);
    const rng = new RNG(99);
    const samplesA = Array.from({ length: 10000 }, () => tnA.sample(rng));
    const dA = ksStatistic(samplesA, x => tnA.cdf(x));
    
    const passed = dA < 0.03;
    results.push({
      test: 'TN marginal preservation',
      passed,
      details: `K-S statistic: ${dA.toFixed(4)}`
    });
  }
  
  // Test 2: TN fitting accuracy
  {
    const trueTN = new TruncatedNormal(15, 4, 0, 50);
    const quantiles = [
      { p: 0.10, x: trueTN.quantile(0.10) },
      { p: 0.50, x: trueTN.quantile(0.50) },
      { p: 0.90, x: trueTN.quantile(0.90) }
    ];
    
    const fit = fitTNFromQuantiles(quantiles, 0, 50);
    const muError = Math.abs(fit.tn.mu - trueTN.mu);
    const sigmaError = Math.abs(fit.tn.sigma - trueTN.sigma);
    
    const passed = muError < 0.1 && sigmaError < 0.1;
    results.push({
      test: 'TN parameter fitting',
      passed,
      details: `μ error: ${muError.toFixed(4)}, σ error: ${sigmaError.toFixed(4)}`
    });
  }
  
  // Test 3: PSD latent factor norms
  {
    const tn = new TruncatedNormal(10, 4, 0, 40);
    const p = mkPlayer('X', 'X', 'BUF', 'WR', tn);
    const q = mkPlayer('Y', 'Y', 'BUF', 'TE', tn);
    const r = mkPlayer('Z', 'Z', 'MIA', 'RB', tn);
    const { weights } = buildLatentFactorWeights([p, q, r]);
    
    const norms = weights.map(w => Math.hypot(...w));
    const allValid = norms.every(n => n <= 1 + 1e-9);
    
    results.push({
      test: 'PSD latent factor norms',
      passed: allValid,
      details: `Max norm: ${Math.max(...norms).toFixed(4)}`
    });
  }
  
  // Test 4: DP invariance to roster order (ESPN WR=2)
  {
    const roster: PlayerProjection[] = [
      mkPlayer('QB1', 'QB1', 'BUF', 'QB', new TruncatedNormal(18, 5, 0, 50)),
      mkPlayer('RB1', 'RB1', 'BUF', 'RB', new TruncatedNormal(12, 4, 0, 40)),
      mkPlayer('RB2', 'RB2', 'MIA', 'RB', new TruncatedNormal(11, 4, 0, 40)),
      mkPlayer('RB3', 'RB3', 'KC', 'RB', new TruncatedNormal(10, 4, 0, 40)),
      mkPlayer('WR1', 'WR1', 'BUF', 'WR', new TruncatedNormal(11, 3, 0, 45)),
      mkPlayer('WR2', 'WR2', 'MIA', 'WR', new TruncatedNormal(10, 3, 0, 45)),
      mkPlayer('WR3', 'WR3', 'KC', 'WR', new TruncatedNormal(9, 3, 0, 45)),
      mkPlayer('TE1', 'TE1', 'BUF', 'TE', new TruncatedNormal(8, 3, 0, 35)),
      mkPlayer('TE2', 'TE2', 'MIA', 'TE', new TruncatedNormal(7, 3, 0, 35)),
      mkPlayer('K1', 'K1', 'BUF', 'K', new TruncatedNormal(8, 3, 0, 20)),
      mkPlayer('DST1', 'DST1', 'BUF', 'DST', new TruncatedNormal(7, 5, -10, 30)),
      mkPlayer('B1', 'B1', 'BUF', 'WR', new TruncatedNormal(8, 3, 0, 45)),
      mkPlayer('B2', 'B2', 'BUF', 'RB', new TruncatedNormal(7, 3, 0, 40)),
      mkPlayer('B3', 'B3', 'BUF', 'TE', new TruncatedNormal(6, 3, 0, 35)),
      mkPlayer('QB2', 'QB2', 'KC', 'QB', new TruncatedNormal(14, 4, 0, 50))
    ];
    
    const optimizer = new LineupOptimizer2025();
    const opp = opponentLeagueFallback(125, 25);
    
    const res1 = optimizer.optimize(roster, opp, {
      sims: 5000,
      targetSE: 0.01,
      reqs: ESPN_PPR_2025
    });
    
    const shuffled = [...roster].sort(() => Math.random() - 0.5);
    const res2 = optimizer.optimize(shuffled, opp, {
      sims: 5000,
      targetSE: 0.01,
      reqs: ESPN_PPR_2025
    });
    
    const mask = (xs: PlayerProjection[]) => xs.map(p => p.player.id).sort().join(',');
    const passed = mask(res1.starters) === mask(res2.starters);
    
    results.push({
      test: 'DP roster order invariance',
      passed,
      details: passed ? 'Same lineup' : 'Different lineups'
    });
  }
  
  // Test 5: Lineup validity for ESPN 2025 (WR=2)
  {
    const roster = createSyntheticRoster();
    const optimizer = new LineupOptimizer2025();
    const opp = opponentLeagueFallback(125, 25);
    
    const result = optimizer.optimize(roster, opp, {
      sims: 3000,
      reqs: ESPN_PPR_2025
    });
    
    const validation = optimizer.validateLineup(result.starters, ESPN_PPR_2025);
    
    results.push({
      test: 'ESPN 2025 lineup validity',
      passed: validation.valid,
      details: validation.errors.join('; ') || 'Valid lineup'
    });
  }
  
  // Test 6: LHS variance reduction
  {
    const f = (x: number[]) => {
      // Simple test function: sum of squares
      return x.reduce((s, xi) => s + xi * xi, 0);
    };
    
    const comparison = compareLHSvsMC(f, 5, 2000, [500, 1000, 2000]);
    
    // LHS should have lower standard error
    const mcSE = comparison.mc[comparison.mc.length - 1].stderr;
    const lhsSE = comparison.lhs[comparison.lhs.length - 1].stderr;
    const passed = lhsSE < mcSE;
    
    results.push({
      test: 'LHS variance reduction',
      passed,
      details: `MC SE: ${mcSE.toFixed(4)}, LHS SE: ${lhsSE.toFixed(4)}`
    });
  }
  
  const allPassed = results.every(r => r.passed);
  
  return { passed: allPassed, results };
}

/**
 * Oracle Tests
 */
export async function runOracleTests(): Promise<{
  passed: boolean;
  results: Array<{ test: string; passed: boolean; details?: string }>;
}> {
  const results: Array<{ test: string; passed: boolean; details?: string }> = [];
  
  const trials = 3;
  let recovered = 0;
  let totalWpDiff = 0;
  
  for (let t = 0; t < trials; t++) {
    const roster = createSmallRoster(); // Small for oracle feasibility
    const opp = opponentLeagueFallback(125, 25);
    const optimizer = new LineupOptimizer2025(50, 2000);
    
    const ours = optimizer.optimize(roster, opp, {
      sims: 6000,
      targetSE: 0.008,
      reqs: ESPN_PPR_2025
    });
    
    const oracle = oracleArgmaxWinProbability(
      roster,
      ESPN_PPR_2025,
      opp,
      3000
    );
    
    const mask = (xs: PlayerProjection[]) => xs.map(p => p.player.id).sort().join(',');
    const exact = mask(ours.starters) === mask(oracle.best);
    const wpDiff = Math.abs(ours.winProbability - oracle.pwin);
    
    totalWpDiff += wpDiff;
    
    if (exact || wpDiff < 0.01) {
      recovered++;
    }
    
    results.push({
      test: `Oracle trial ${t + 1}`,
      passed: exact || wpDiff < 0.01,
      details: `WP diff: ${wpDiff.toFixed(4)}, Exact: ${exact}`
    });
  }
  
  const recoveryRate = recovered / trials;
  const avgWpDiff = totalWpDiff / trials;
  
  results.push({
    test: 'Oracle recovery summary',
    passed: recoveryRate >= 0.67,
    details: `Recovery: ${(recoveryRate * 100).toFixed(1)}%, Avg WP diff: ${avgWpDiff.toFixed(4)}`
  });
  
  const allPassed = recoveryRate >= 0.67;
  
  return { passed: allPassed, results };
}

/**
 * Calibration Tests
 */
export async function runCalibrationTests(): Promise<{
  passed: boolean;
  results: Array<{ test: string; passed: boolean; details?: string }>;
}> {
  const results: Array<{ test: string; passed: boolean; details?: string }> = [];
  
  // Test 1: CRPS calculation
  {
    const samples = [90, 95, 100, 105, 110];
    const observed = 102;
    const crps = crpsFromSamples(samples, observed);
    
    const passed = crps > 0 && crps < 20;
    results.push({
      test: 'CRPS calculation',
      passed,
      details: `CRPS: ${crps.toFixed(2)}`
    });
  }
  
  // Test 2: Reliability binning and ECE
  {
    const pred = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const obs = [false, false, true, false, true, true, true, true, true];
    
    const bins = reliabilityBins(pred, obs, 3);
    const ece = expectedCalibrationError(bins, pred.length);
    
    const passed = ece >= 0 && ece <= 1;
    results.push({
      test: 'ECE calculation',
      passed,
      details: `ECE: ${ece.toFixed(3)}`
    });
  }
  
  const allPassed = results.every(r => r.passed);
  
  return { passed: allPassed, results };
}

/**
 * Create synthetic roster for testing
 */
function createSyntheticRoster(): PlayerProjection[] {
  const R: PlayerProjection[] = [];
  
  const tnRB = () => new TruncatedNormal(11 + Math.random() * 4, 4 + Math.random() * 2, 0, 40);
  const tnWR = () => new TruncatedNormal(10 + Math.random() * 5, 5 + Math.random() * 2, 0, 45);
  const tnTE = () => new TruncatedNormal(8 + Math.random() * 4, 4 + Math.random() * 2, 0, 35);
  const tnQB = () => new TruncatedNormal(18 + Math.random() * 6, 5 + Math.random() * 3, 0, 50);
  const tnK = () => new TruncatedNormal(8 + Math.random() * 3, 3 + Math.random() * 1, 0, 20);
  const tnD = () => new TruncatedNormal(7 + Math.random() * 6, 5 + Math.random() * 4, -10, 30);
  
  R.push(
    mkPlayer('QB1', 'QB1', 'BUF', 'QB', tnQB()),
    mkPlayer('QB2', 'QB2', 'KC', 'QB', tnQB()),
    mkPlayer('RB1', 'RB1', 'BUF', 'RB', tnRB()),
    mkPlayer('RB2', 'RB2', 'MIA', 'RB', tnRB()),
    mkPlayer('RB3', 'RB3', 'KC', 'RB', tnRB()),
    mkPlayer('RB4', 'RB4', 'SF', 'RB', tnRB()),
    mkPlayer('WR1', 'WR1', 'BUF', 'WR', tnWR()),
    mkPlayer('WR2', 'WR2', 'MIA', 'WR', tnWR()),
    mkPlayer('WR3', 'WR3', 'KC', 'WR', tnWR()),
    mkPlayer('WR4', 'WR4', 'SF', 'WR', tnWR()),
    mkPlayer('WR5', 'WR5', 'PHI', 'WR', tnWR()),
    mkPlayer('TE1', 'TE1', 'BUF', 'TE', tnTE()),
    mkPlayer('TE2', 'TE2', 'MIA', 'TE', tnTE()),
    mkPlayer('K1', 'K1', 'BUF', 'K', tnK()),
    mkPlayer('DST1', 'DST1', 'BUF', 'DST', tnD())
  );
  
  return R;
}

/**
 * Create small roster for oracle testing
 */
function createSmallRoster(): PlayerProjection[] {
  return [
    mkPlayer('QB1', 'QB1', 'BUF', 'QB', new TruncatedNormal(20, 5, 0, 50)),
    mkPlayer('RB1', 'RB1', 'BUF', 'RB', new TruncatedNormal(14, 4, 0, 40)),
    mkPlayer('RB2', 'RB2', 'MIA', 'RB', new TruncatedNormal(12, 4, 0, 40)),
    mkPlayer('RB3', 'RB3', 'KC', 'RB', new TruncatedNormal(10, 4, 0, 40)),
    mkPlayer('WR1', 'WR1', 'BUF', 'WR', new TruncatedNormal(13, 3, 0, 45)),
    mkPlayer('WR2', 'WR2', 'MIA', 'WR', new TruncatedNormal(11, 3, 0, 45)),
    mkPlayer('WR3', 'WR3', 'KC', 'WR', new TruncatedNormal(9, 3, 0, 45)),
    mkPlayer('TE1', 'TE1', 'BUF', 'TE', new TruncatedNormal(9, 3, 0, 35)),
    mkPlayer('TE2', 'TE2', 'MIA', 'TE', new TruncatedNormal(7, 3, 0, 35)),
    mkPlayer('K1', 'K1', 'BUF', 'K', new TruncatedNormal(8, 2, 0, 20)),
    mkPlayer('DST1', 'DST1', 'BUF', 'DST', new TruncatedNormal(8, 4, -10, 30)),
    mkPlayer('B1', 'B1', 'PHI', 'RB', new TruncatedNormal(8, 3, 0, 40)),
    mkPlayer('B2', 'B2', 'PHI', 'WR', new TruncatedNormal(7, 3, 0, 45))
  ];
}

/**
 * Run all tests
 */
export async function runAllTests(): Promise<void> {
  console.log('Running 2025-2026 Test Suite...\n');
  
  // Property tests
  console.log('Property Tests:');
  const propTests = await runPropertyTests();
  for (const result of propTests.results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`  [${status}] ${result.test}: ${result.details || ''}`);
  }
  console.log(`Property Tests: ${propTests.passed ? 'PASSED' : 'FAILED'}\n`);
  
  // Oracle tests
  console.log('Oracle Tests:');
  const oracleTests = await runOracleTests();
  for (const result of oracleTests.results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`  [${status}] ${result.test}: ${result.details || ''}`);
  }
  console.log(`Oracle Tests: ${oracleTests.passed ? 'PASSED' : 'FAILED'}\n`);
  
  // Calibration tests
  console.log('Calibration Tests:');
  const calibTests = await runCalibrationTests();
  for (const result of calibTests.results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`  [${status}] ${result.test}: ${result.details || ''}`);
  }
  console.log(`Calibration Tests: ${calibTests.passed ? 'PASSED' : 'FAILED'}\n`);
  
  // Overall
  const allPassed = propTests.passed && oracleTests.passed && calibTests.passed;
  console.log(`\nAll Tests: ${allPassed ? 'PASSED ✓' : 'FAILED ✗'}`);
  
  if (!allPassed) {
    process.exit(1);
  }
}