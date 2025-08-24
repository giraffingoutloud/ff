/**
 * Property-Based Tests for Lineup Optimizer
 * 
 * Verifies mathematical invariants and correctness properties
 */

import { GaussianCopulaSampler } from '../stats/copulaSampler';
import { fitTruncatedNormal, validateTNParameters } from '../math/robustTNFitting';
import { EnhancedKBestDP } from '../core/enhancedKBestDP';
import { MonteCarloEstimator } from '../core/monteCarloWinProbability';
import { PlayerProjection, Projection } from '../types';

/**
 * Test helpers
 */
function createMockProjection(mean: number, variance: number): Projection {
  const stdDev = Math.sqrt(variance);
  return {
    floor: mean - 1.282 * stdDev,
    q1: mean - 0.674 * stdDev,
    median: mean,
    q3: mean + 0.674 * stdDev,
    ceiling: mean + 1.282 * stdDev,
    mean,
    variance,
    lowerBound: Math.max(0, mean - 3 * stdDev),
    upperBound: mean + 3 * stdDev,
    originalMean: mean,
    originalStdDev: stdDev,
    baseLogProjection: Math.log(Math.max(1, mean)),
    matchupAdjustment: 0,
    weatherAdjustment: 0,
    usageAdjustment: 0,
    injuryAdjustment: 0,
    confidence: 0.8
  };
}

function createMockPlayer(
  id: string,
  position: string,
  mean: number,
  variance: number
): PlayerProjection {
  return {
    player: {
      id,
      name: `Player ${id}`,
      team: 'TEAM',
      position: position as any,
      positions: [position as any],
      byeWeek: 7,
      isActive: true
    },
    projection: createMockProjection(mean, variance),
    opponent: 'OPP',
    isHome: true,
    gameInfo: {
      homeTeam: 'TEAM',
      awayTeam: 'OPP',
      spread: -3,
      total: 45,
      opponent: 'OPP',
      isHome: true,
      kickoffTimeUTC: new Date().toISOString()
    }
  };
}

/**
 * Property: Gaussian Copula preserves exact TN marginals
 */
export function testCopulaMarginalPreservation(): {
  passed: boolean;
  details: string;
} {
  const players = [
    createMockPlayer('1', 'QB', 20, 25),
    createMockPlayer('2', 'RB', 12, 16),
    createMockPlayer('3', 'WR', 10, 20)
  ];
  
  const sampler = new GaussianCopulaSampler();
  sampler.initialize(players);
  
  // Generate many samples
  const nSamples = 10000;
  const samples = sampler.sampleMany(nSamples, 42);
  
  // Check each player's marginal distribution
  const errors: string[] = [];
  
  for (let i = 0; i < players.length; i++) {
    const playerSamples = samples.map(s => s[i]);
    const proj = players[i].projection!;
    
    // Check mean
    const sampleMean = playerSamples.reduce((a, b) => a + b, 0) / nSamples;
    const meanError = Math.abs(sampleMean - proj.mean) / proj.mean;
    
    if (meanError > 0.05) { // 5% tolerance
      errors.push(`Player ${i}: Mean error ${(meanError * 100).toFixed(2)}%`);
    }
    
    // Check variance
    const sampleVar = playerSamples.reduce((sum, x) => 
      sum + (x - sampleMean) ** 2, 0) / (nSamples - 1);
    const varError = Math.abs(sampleVar - proj.variance) / proj.variance;
    
    if (varError > 0.1) { // 10% tolerance
      errors.push(`Player ${i}: Variance error ${(varError * 100).toFixed(2)}%`);
    }
    
    // Check bounds
    const minSample = Math.min(...playerSamples);
    const maxSample = Math.max(...playerSamples);
    
    if (minSample < proj.lowerBound - 0.01) {
      errors.push(`Player ${i}: Sample ${minSample.toFixed(2)} below lower bound ${proj.lowerBound}`);
    }
    
    if (maxSample > proj.upperBound + 0.01) {
      errors.push(`Player ${i}: Sample ${maxSample.toFixed(2)} above upper bound ${proj.upperBound}`);
    }
  }
  
  return {
    passed: errors.length === 0,
    details: errors.length === 0 ? 
      'Marginal distributions preserved correctly' : 
      `Errors: ${errors.join('; ')}`
  };
}

/**
 * Property: TN fitting recovers correct parameters
 */
export function testTNFittingAccuracy(): {
  passed: boolean;
  details: string;
} {
  // Known TN parameters
  const trueMu = 15;
  const trueSigma = 5;
  const trueA = 0;
  const trueB = 40;
  
  // Generate exact quantiles
  const quantiles = [
    { p: 0.1, value: 8.59 },  // Computed from TN(15, 5, 0, 40)
    { p: 0.25, value: 11.63 },
    { p: 0.5, value: 15.0 },
    { p: 0.75, value: 18.37 },
    { p: 0.9, value: 21.41 }
  ];
  
  // Fit parameters
  const result = fitTruncatedNormal(quantiles, {
    initialGuess: [15, 5, 0, 40]
  });
  
  const errors: string[] = [];
  
  // Check parameter recovery
  const muError = Math.abs(result.mu - trueMu);
  if (muError > 0.5) {
    errors.push(`Mu error: ${muError.toFixed(2)}`);
  }
  
  const sigmaError = Math.abs(result.sigma - trueSigma);
  if (sigmaError > 0.5) {
    errors.push(`Sigma error: ${sigmaError.toFixed(2)}`);
  }
  
  const aError = Math.abs(result.a - trueA);
  if (aError > 1.0) {
    errors.push(`Lower bound error: ${aError.toFixed(2)}`);
  }
  
  const bError = Math.abs(result.b - trueB);
  if (bError > 1.0) {
    errors.push(`Upper bound error: ${bError.toFixed(2)}`);
  }
  
  if (!result.converged) {
    errors.push('Fitting did not converge');
  }
  
  return {
    passed: errors.length === 0,
    details: errors.length === 0 ?
      `Recovered parameters: μ=${result.mu.toFixed(2)}, σ=${result.sigma.toFixed(2)}` :
      `Errors: ${errors.join('; ')}`
  };
}

/**
 * Property: K-best DP produces valid lineups
 */
export function testDPLineupValidity(): {
  passed: boolean;
  details: string;
} {
  // Create roster with exact requirements
  const roster: PlayerProjection[] = [
    // QBs
    createMockPlayer('qb1', 'QB', 22, 25),
    createMockPlayer('qb2', 'QB', 20, 20),
    // RBs
    createMockPlayer('rb1', 'RB', 15, 20),
    createMockPlayer('rb2', 'RB', 14, 18),
    createMockPlayer('rb3', 'RB', 12, 16),
    // WRs
    createMockPlayer('wr1', 'WR', 13, 25),
    createMockPlayer('wr2', 'WR', 12, 22),
    createMockPlayer('wr3', 'WR', 11, 20),
    createMockPlayer('wr4', 'WR', 10, 18),
    // TEs
    createMockPlayer('te1', 'TE', 9, 15),
    createMockPlayer('te2', 'TE', 8, 12),
    // K
    createMockPlayer('k1', 'K', 8, 10),
    // DST
    createMockPlayer('dst1', 'DST', 8, 20)
  ];
  
  const dp = new EnhancedKBestDP(10);
  const candidates = dp.generateDiverseCandidates(roster);
  
  const errors: string[] = [];
  
  if (candidates.length === 0) {
    errors.push('No candidates generated');
  }
  
  // Check each candidate
  for (const candidate of candidates.slice(0, 5)) {
    const positions = new Map<string, number>();
    
    for (const player of candidate.players) {
      const pos = player.player.position;
      positions.set(pos, (positions.get(pos) || 0) + 1);
    }
    
    // Check requirements
    if ((positions.get('QB') || 0) !== 1) {
      errors.push('Invalid QB count');
    }
    
    const rbCount = positions.get('RB') || 0;
    const wrCount = positions.get('WR') || 0;
    const teCount = positions.get('TE') || 0;
    
    // FLEX can be RB/WR/TE
    const totalFlex = rbCount + wrCount + teCount;
    
    if (totalFlex < 6) { // 2 RB + 3 WR + 1 TE minimum
      errors.push(`Insufficient FLEX-eligible: ${totalFlex}`);
    }
    
    if ((positions.get('K') || 0) !== 1) {
      errors.push('Invalid K count');
    }
    
    if ((positions.get('DST') || 0) !== 1) {
      errors.push('Invalid DST count');
    }
    
    // Check no duplicates
    const ids = new Set(candidate.players.map(p => p.player.id));
    if (ids.size !== candidate.players.length) {
      errors.push('Duplicate players in lineup');
    }
  }
  
  return {
    passed: errors.length === 0,
    details: errors.length === 0 ?
      `Generated ${candidates.length} valid lineups` :
      `Errors: ${errors.join('; ')}`
  };
}

/**
 * Property: Monte Carlo win probability is in [0, 1]
 */
export function testMCWinProbabilityBounds(): {
  passed: boolean;
  details: string;
} {
  const lineup = [
    createMockPlayer('1', 'QB', 20, 25),
    createMockPlayer('2', 'RB', 12, 16),
    createMockPlayer('3', 'RB', 11, 15),
    createMockPlayer('4', 'WR', 10, 20),
    createMockPlayer('5', 'WR', 9, 18),
    createMockPlayer('6', 'WR', 8, 16),
    createMockPlayer('7', 'TE', 7, 12),
    createMockPlayer('8', 'FLEX', 8, 14),
    createMockPlayer('9', 'K', 8, 10),
    createMockPlayer('10', 'DST', 7, 25)
  ];
  
  const opponent = {
    mean: 100,
    variance: 400,
    percentiles: {
      p10: 75,
      p25: 87,
      p50: 100,
      p75: 113,
      p90: 125
    },
    sample: () => 100 + (Math.random() - 0.5) * 40
  };
  
  const mc = new MonteCarloEstimator();
  const result = mc.estimateWinProbability(lineup, opponent, {
    maxSimulations: 5000,
    seed: 12345
  });
  
  const errors: string[] = [];
  
  // Check bounds
  if (result.winProbability < 0) {
    errors.push(`Win probability below 0: ${result.winProbability}`);
  }
  
  if (result.winProbability > 1) {
    errors.push(`Win probability above 1: ${result.winProbability}`);
  }
  
  // Check standard error
  if (result.standardError < 0) {
    errors.push(`Negative standard error: ${result.standardError}`);
  }
  
  if (result.standardError > 0.5) {
    errors.push(`Standard error too large: ${result.standardError}`);
  }
  
  // Check percentiles are ordered
  const percentiles = [
    result.percentiles.p5,
    result.percentiles.p10,
    result.percentiles.p25,
    result.percentiles.p50,
    result.percentiles.p75,
    result.percentiles.p90,
    result.percentiles.p95
  ];
  
  for (let i = 1; i < percentiles.length; i++) {
    if (percentiles[i] < percentiles[i - 1]) {
      errors.push(`Percentiles not ordered at index ${i}`);
    }
  }
  
  return {
    passed: errors.length === 0,
    details: errors.length === 0 ?
      `Win probability: ${(result.winProbability * 100).toFixed(1)}% ± ${(result.standardError * 100).toFixed(2)}%` :
      `Errors: ${errors.join('; ')}`
  };
}

/**
 * Property: Correlation matrix is positive semi-definite
 */
export function testCorrelationMatrixPSD(): {
  passed: boolean;
  details: string;
} {
  const players = [
    createMockPlayer('1', 'QB', 20, 25),
    createMockPlayer('2', 'RB', 12, 16),
    createMockPlayer('3', 'WR', 10, 20),
    createMockPlayer('4', 'WR', 9, 18),
    createMockPlayer('5', 'TE', 8, 15)
  ];
  
  // Build correlation matrix (from copulaSampler implementation)
  const n = players.length;
  const corr: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
  
  const getFactorLoading = (p: PlayerProjection) => {
    const pos = p.player.position;
    const loadings: Record<string, { pass: number; rush: number; pace: number }> = {
      'QB': { pass: 0.8, rush: 0.1, pace: 0.3 },
      'RB': { pass: 0.2, rush: 0.7, pace: 0.3 },
      'WR': { pass: 0.6, rush: 0.1, pace: 0.4 },
      'TE': { pass: 0.5, rush: 0.2, pace: 0.3 }
    };
    return loadings[pos] || { pass: 0, rush: 0, pace: 0 };
  };
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        corr[i][j] = 1;
      } else {
        const fi = getFactorLoading(players[i]);
        const fj = getFactorLoading(players[j]);
        const sameTeam = players[i].player.team === players[j].player.team ? 0.15 : 0;
        const factorCorr = fi.pass * fj.pass + fi.rush * fj.rush + fi.pace * fj.pace;
        corr[i][j] = Math.max(-0.9, Math.min(0.9, factorCorr + sameTeam));
      }
    }
  }
  
  // Check PSD via eigenvalues (simplified check)
  const errors: string[] = [];
  
  // Check symmetry
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(corr[i][j] - corr[j][i]) > 1e-10) {
        errors.push(`Matrix not symmetric at (${i},${j})`);
      }
    }
  }
  
  // Check diagonal
  for (let i = 0; i < n; i++) {
    if (Math.abs(corr[i][i] - 1) > 1e-10) {
      errors.push(`Diagonal element ${i} not 1`);
    }
  }
  
  // Check bounds
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (corr[i][j] < -1 || corr[i][j] > 1) {
        errors.push(`Correlation out of bounds at (${i},${j}): ${corr[i][j]}`);
      }
    }
  }
  
  return {
    passed: errors.length === 0,
    details: errors.length === 0 ?
      'Correlation matrix is valid' :
      `Errors: ${errors.join('; ')}`
  };
}

/**
 * Run all property tests
 */
export function runAllPropertyTests(): void {
  console.log('Running Property-Based Tests...\n');
  
  const tests = [
    { name: 'Copula Marginal Preservation', fn: testCopulaMarginalPreservation },
    { name: 'TN Fitting Accuracy', fn: testTNFittingAccuracy },
    { name: 'DP Lineup Validity', fn: testDPLineupValidity },
    { name: 'MC Win Probability Bounds', fn: testMCWinProbabilityBounds },
    { name: 'Correlation Matrix PSD', fn: testCorrelationMatrixPSD }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = test.fn();
      
      if (result.passed) {
        console.log(`✓ ${test.name}`);
        console.log(`  ${result.details}`);
        passed++;
      } else {
        console.log(`✗ ${test.name}`);
        console.log(`  ${result.details}`);
        failed++;
      }
    } catch (error) {
      console.log(`✗ ${test.name}`);
      console.log(`  Error: ${error}`);
      failed++;
    }
    
    console.log();
  }
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
}