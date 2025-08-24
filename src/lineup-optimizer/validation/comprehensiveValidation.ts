/**
 * Comprehensive Validation Suite
 * Production-grade testing for all optimizer components
 */

import { PlayerProjection, LineupRequirements } from '../domain/typesCorrected';
import { TruncatedNormal, fitTNFromQuantiles } from '../stats/truncatedNormalCorrected';
import { fitTNAnalytic } from '../stats/truncatedNormalGradient';
import { validateCorrelationMatrix, nearestPSD } from '../stats/nearestPSD';
import { latentFactorModel } from '../stats/factorsCorrected';
import { gaussianCopulaSample } from '../stats/copulaSampler';
import { KBestDP } from '../core/kBestDPCorrected';
import { oracleArgmaxWinProbability } from '../core/enumerationCorrected';
import { LineupOptimizer } from '../core/optimizerCorrected';
import { calculateWinProbability } from '../core/winProbabilityEnhanced';
import { EnhancedOpponentProjection } from '../stats/jointSimulation';
import { SobolSequence, compareConvergence } from '../utils/sobol';
import { crpsFromSamples, reliabilityBins, expectedCalibrationError } from '../eval/calibrationCorrected';

/**
 * Validation result structure
 */
export interface ValidationResult {
  component: string;
  tests: Array<{
    name: string;
    passed: boolean;
    details?: string;
    metrics?: Record<string, number>;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
}

/**
 * Comprehensive validation runner
 */
export class ValidationSuite {
  private results: ValidationResult[] = [];
  
  /**
   * Run all validations
   */
  async runAll(): Promise<{
    results: ValidationResult[];
    overallSummary: {
      components: number;
      totalTests: number;
      totalPassed: number;
      totalFailed: number;
      overallPassRate: number;
    };
  }> {
    // Clear previous results
    this.results = [];
    
    // Run component validations
    await this.validateTruncatedNormal();
    await this.validateCorrelationMatrix();
    await this.validateCopulaSampling();
    await this.validateDynamicProgramming();
    await this.validateWinProbability();
    await this.validateQuasiMonteCarlo();
    await this.validateCalibration();
    await this.validateEndToEnd();
    
    // Calculate overall summary
    const overallSummary = {
      components: this.results.length,
      totalTests: this.results.reduce((s, r) => s + r.summary.total, 0),
      totalPassed: this.results.reduce((s, r) => s + r.summary.passed, 0),
      totalFailed: this.results.reduce((s, r) => s + r.summary.failed, 0),
      overallPassRate: 0
    };
    
    overallSummary.overallPassRate = overallSummary.totalTests > 0
      ? overallSummary.totalPassed / overallSummary.totalTests
      : 0;
    
    return {
      results: this.results,
      overallSummary
    };
  }
  
  /**
   * Validate Truncated Normal implementation
   */
  private async validateTruncatedNormal(): Promise<void> {
    const tests: Array<{
      name: string;
      passed: boolean;
      details?: string;
      metrics?: Record<string, number>;
    }> = [];
    
    // Test 1: Quantile monotonicity
    {
      const tn = new TruncatedNormal(100, 20, 0, 200);
      const quantiles = [0.1, 0.25, 0.5, 0.75, 0.9];
      const values = quantiles.map(p => tn.quantile(p));
      
      const isMonotonic = values.every((v, i) => 
        i === 0 || v >= values[i - 1]
      );
      
      tests.push({
        name: 'Quantile monotonicity',
        passed: isMonotonic,
        details: `Values: ${values.map(v => v.toFixed(2)).join(', ')}`
      });
    }
    
    // Test 2: Parameter fitting accuracy
    {
      const trueMu = 100, trueSigma = 20;
      const a = 0, b = 200;
      const tn = new TruncatedNormal(trueMu, trueSigma, a, b);
      
      const quantiles = [
        { p: 0.25, x: tn.quantile(0.25) },
        { p: 0.5, x: tn.quantile(0.5) },
        { p: 0.75, x: tn.quantile(0.75) }
      ];
      
      const fit = fitTNFromQuantiles(quantiles, a, b);
      const muError = Math.abs(fit.mu - trueMu);
      const sigmaError = Math.abs(fit.sigma - trueSigma);
      
      tests.push({
        name: 'Parameter fitting accuracy',
        passed: muError < 0.1 && sigmaError < 0.1,
        metrics: {
          muError,
          sigmaError,
          iterations: fit.iterations
        }
      });
    }
    
    // Test 3: Analytic vs numeric gradients
    {
      const quantiles = [
        { p: 0.25, x: 85 },
        { p: 0.75, x: 115 }
      ];
      
      const numericFit = fitTNFromQuantiles(quantiles, 0, 200);
      const analyticFit = fitTNAnalytic(quantiles, 0, 200);
      
      const muDiff = Math.abs(numericFit.mu - analyticFit.mu);
      const sigmaDiff = Math.abs(numericFit.sigma - analyticFit.sigma);
      
      tests.push({
        name: 'Analytic gradient consistency',
        passed: muDiff < 1 && sigmaDiff < 1,
        metrics: {
          muDiff,
          sigmaDiff
        }
      });
    }
    
    // Test 4: Boundary behavior
    {
      const tn = new TruncatedNormal(50, 30, 0, 100);
      const sample = tn.sample({ uniform: () => 0.5, normal: () => 0 } as any);
      const inBounds = sample >= 0 && sample <= 100;
      
      tests.push({
        name: 'Boundary constraint satisfaction',
        passed: inBounds,
        details: `Sample: ${sample.toFixed(2)}`
      });
    }
    
    this.addResult('TruncatedNormal', tests);
  }
  
  /**
   * Validate correlation matrix operations
   */
  private async validateCorrelationMatrix(): Promise<void> {
    const tests: Array<{
      name: string;
      passed: boolean;
      details?: string;
      metrics?: Record<string, number>;
    }> = [];
    
    // Test 1: PSD preservation in factor model
    {
      const Sigma = latentFactorModel(10, 2, 0.7);
      const validation = validateCorrelationMatrix(Sigma, false);
      
      tests.push({
        name: 'Factor model PSD',
        passed: validation.valid,
        details: validation.issues.join('; ')
      });
    }
    
    // Test 2: Nearest PSD projection
    {
      // Create non-PSD matrix
      const badCorr = [
        [1.0, 0.9, 0.9],
        [0.9, 1.0, -0.9],
        [0.9, -0.9, 1.0]
      ];
      
      const validation = validateCorrelationMatrix(badCorr, true);
      const repaired = validation.repaired!;
      const repairedValidation = validateCorrelationMatrix(repaired, false);
      
      tests.push({
        name: 'Nearest PSD repair',
        passed: !validation.valid && repairedValidation.valid,
        metrics: {
          frobeniusDistance: validation.repairedDistance
        }
      });
    }
    
    // Test 3: Higham algorithm convergence
    {
      const A = [
        [1.0, 0.8, 0.7],
        [0.8, 1.0, 0.95],
        [0.7, 0.95, 1.0]
      ];
      
      const result = nearestPSD(A);
      
      tests.push({
        name: 'Higham convergence',
        passed: result.converged && result.iterations < 20,
        metrics: {
          iterations: result.iterations,
          frobenius: result.frobenius
        }
      });
    }
    
    this.addResult('CorrelationMatrix', tests);
  }
  
  /**
   * Validate copula sampling
   */
  private async validateCopulaSampling(): Promise<void> {
    const tests: Array<{
      name: string;
      passed: boolean;
      details?: string;
      metrics?: Record<string, number>;
    }> = [];
    
    // Test 1: Marginal preservation
    {
      const lineup: PlayerProjection[] = [
        {
          player: { id: '1', name: 'QB1', position: 'QB', team: 'TB', status: 'ACTIVE' },
          mean: 20,
          sd: 5,
          floor: 0,
          ceiling: 50,
          tn: new TruncatedNormal(20, 5, 0, 50),
          game: { kickoffTimeUTC: '2024-09-08T17:00:00Z' }
        },
        {
          player: { id: '2', name: 'WR1', position: 'WR', team: 'TB', status: 'ACTIVE' },
          mean: 15,
          sd: 4,
          floor: 0,
          ceiling: 40,
          tn: new TruncatedNormal(15, 4, 0, 40),
          game: { kickoffTimeUTC: '2024-09-08T17:00:00Z' }
        }
      ];
      
      const samples = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(gaussianCopulaSample(lineup, 42 + i));
      }
      
      const qb_mean = samples.reduce((s, x) => s + x[0], 0) / samples.length;
      const wr_mean = samples.reduce((s, x) => s + x[1], 0) / samples.length;
      
      const qb_error = Math.abs(qb_mean - 20);
      const wr_error = Math.abs(wr_mean - 15);
      
      tests.push({
        name: 'Copula marginal preservation',
        passed: qb_error < 1 && wr_error < 1,
        metrics: {
          qb_error,
          wr_error
        }
      });
    }
    
    // Test 2: Correlation induction
    {
      // Same lineup as above (same team)
      const lineup: PlayerProjection[] = [
        {
          player: { id: '1', name: 'QB1', position: 'QB', team: 'TB', status: 'ACTIVE' },
          mean: 20,
          sd: 5,
          floor: 0,
          ceiling: 50,
          tn: new TruncatedNormal(20, 5, 0, 50),
          game: { kickoffTimeUTC: '2024-09-08T17:00:00Z' }
        },
        {
          player: { id: '2', name: 'WR1', position: 'WR', team: 'TB', status: 'ACTIVE' },
          mean: 15,
          sd: 4,
          floor: 0,
          ceiling: 40,
          tn: new TruncatedNormal(15, 4, 0, 40),
          game: { kickoffTimeUTC: '2024-09-08T17:00:00Z' }
        }
      ];
      
      const samples = [];
      for (let i = 0; i < 1000; i++) {
        samples.push(gaussianCopulaSample(lineup, 42 + i));
      }
      
      // Calculate correlation
      const n = samples.length;
      const mx = samples.reduce((s, x) => s + x[0], 0) / n;
      const my = samples.reduce((s, x) => s + x[1], 0) / n;
      
      let cov = 0, vx = 0, vy = 0;
      for (const [x, y] of samples) {
        const dx = x - mx;
        const dy = y - my;
        cov += dx * dy;
        vx += dx * dx;
        vy += dy * dy;
      }
      
      const corr = cov / Math.sqrt(vx * vy);
      
      tests.push({
        name: 'Same-team correlation',
        passed: corr > 0.05, // Should have positive correlation
        metrics: {
          correlation: corr
        }
      });
    }
    
    this.addResult('CopulaSampling', tests);
  }
  
  /**
   * Validate dynamic programming
   */
  private async validateDynamicProgramming(): Promise<void> {
    const tests: Array<{
      name: string;
      passed: boolean;
      details?: string;
      metrics?: Record<string, number>;
    }> = [];
    
    // Create test roster
    const roster = this.createTestRoster();
    
    // Test 1: Constraint satisfaction
    {
      const dp = new KBestDP(10, 100);
      const candidates = dp.generateDiverseCandidates(roster, 0);
      
      const allValid = candidates.every(c => 
        this.validateLineupConstraints(c.players)
      );
      
      tests.push({
        name: 'DP constraint satisfaction',
        passed: allValid,
        details: `Generated ${candidates.length} candidates`
      });
    }
    
    // Test 2: Diversity with different lambdas
    {
      const dp = new KBestDP(10, 500);
      const candidates = dp.generateDiverseCandidates(roster, 0);
      
      // Check that different lambdas produce different lineups
      const uniqueLineups = new Set<string>();
      candidates.forEach(c => {
        const key = c.players.map(p => p.player.id).sort().join(',');
        uniqueLineups.add(key);
      });
      
      const diversityRatio = uniqueLineups.size / candidates.length;
      
      tests.push({
        name: 'DP lineup diversity',
        passed: diversityRatio > 0.5,
        metrics: {
          totalCandidates: candidates.length,
          uniqueLineups: uniqueLineups.size,
          diversityRatio
        }
      });
    }
    
    // Test 3: Oracle comparison (small roster)
    if (roster.length <= 15) {
      const dp = new KBestDP(50, 1000);
      const candidates = dp.generateDiverseCandidates(roster, 0);
      
      const opponent: EnhancedOpponentProjection = {
        mean: 110,
        variance: 625
      };
      
      const oracle = oracleArgmaxWinProbability(
        roster,
        { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DST: 1 },
        opponent,
        1000
      );
      
      // Check if DP found the oracle solution
      const foundOracle = candidates.some(c => {
        const key1 = c.players.map(p => p.player.id).sort().join(',');
        const key2 = oracle.best.map(p => p.player.id).sort().join(',');
        return key1 === key2;
      });
      
      tests.push({
        name: 'DP oracle coverage',
        passed: foundOracle,
        details: foundOracle ? 'Found oracle solution' : 'Missed oracle solution'
      });
    }
    
    this.addResult('DynamicProgramming', tests);
  }
  
  /**
   * Validate win probability calculations
   */
  private async validateWinProbability(): Promise<void> {
    const tests: Array<{
      name: string;
      passed: boolean;
      details?: string;
      metrics?: Record<string, number>;
    }> = [];
    
    const lineup = this.createTestLineup();
    const opponent: EnhancedOpponentProjection = {
      mean: 110,
      variance: 625
    };
    
    // Test 1: Convergence with increasing simulations
    {
      const results = [];
      for (const sims of [1000, 5000, 10000]) {
        const result = calculateWinProbability(lineup, opponent, {
          simulations: sims,
          seed: 42
        });
        results.push({
          sims,
          wp: result.winProbability,
          se: result.diagnostics.standardError
        });
      }
      
      // Standard error should decrease
      const seDecreasing = results.every((r, i) => 
        i === 0 || r.se <= results[i - 1].se
      );
      
      tests.push({
        name: 'MC convergence',
        passed: seDecreasing,
        metrics: {
          se_1000: results[0].se,
          se_5000: results[1].se,
          se_10000: results[2].se
        }
      });
    }
    
    // Test 2: Joint vs independent correlation
    {
      const oppWithStarters: EnhancedOpponentProjection = {
        ...opponent,
        starters: this.createTestLineup()
      };
      
      const independent = calculateWinProbability(lineup, opponent, {
        method: 'independent',
        simulations: 5000,
        seed: 42
      });
      
      const joint = calculateWinProbability(lineup, oppWithStarters, {
        method: 'joint',
        simulations: 5000,
        seed: 42
      });
      
      const hasCorrelation = joint.diagnostics.correlationRealized !== undefined &&
                           Math.abs(joint.diagnostics.correlationRealized) > 0.01;
      
      tests.push({
        name: 'Joint simulation correlation',
        passed: hasCorrelation,
        metrics: {
          correlationRealized: joint.diagnostics.correlationRealized || 0
        }
      });
    }
    
    this.addResult('WinProbability', tests);
  }
  
  /**
   * Validate Quasi-Monte Carlo
   */
  private async validateQuasiMonteCarlo(): Promise<void> {
    const tests: Array<{
      name: string;
      passed: boolean;
      details?: string;
      metrics?: Record<string, number>;
    }> = [];
    
    // Test 1: Sobol sequence uniformity
    {
      const sobol = new SobolSequence(2);
      const points = sobol.batch(1000);
      
      // Check that points are in [0,1]
      const allInBounds = points.every(p => 
        p.every(x => x >= 0 && x <= 1)
      );
      
      // Check distribution (should be roughly uniform)
      const grid = Array(10).fill(0).map(() => Array(10).fill(0));
      for (const [x, y] of points) {
        const i = Math.min(9, Math.floor(x * 10));
        const j = Math.min(9, Math.floor(y * 10));
        grid[i][j]++;
      }
      
      const expected = 1000 / 100; // 10 per cell
      const maxDeviation = Math.max(...grid.flat().map(c => 
        Math.abs(c - expected)
      ));
      
      tests.push({
        name: 'Sobol uniformity',
        passed: allInBounds && maxDeviation < 20,
        metrics: {
          maxDeviation
        }
      });
    }
    
    // Test 2: QMC vs MC convergence
    {
      // Simple integration test: integral of x^2 + y^2 over [-1,1]^2
      const f = (x: number[]) => x[0] * x[0] + x[1] * x[1];
      
      const comparison = compareConvergence(f, 2, 5000, [500, 1000, 2000, 5000]);
      
      // QMC should have lower error at 5000 samples
      const mcError = Math.abs(comparison.mc[comparison.mc.length - 1].mean - 2/3);
      const qmcError = Math.abs(comparison.qmc[comparison.qmc.length - 1].mean - 2/3);
      
      tests.push({
        name: 'QMC convergence advantage',
        passed: qmcError < mcError,
        metrics: {
          mcError,
          qmcError,
          improvement: mcError / qmcError
        }
      });
    }
    
    this.addResult('QuasiMonteCarlo', tests);
  }
  
  /**
   * Validate calibration metrics
   */
  private async validateCalibration(): Promise<void> {
    const tests: Array<{
      name: string;
      passed: boolean;
      details?: string;
      metrics?: Record<string, number>;
    }> = [];
    
    // Test 1: CRPS calculation
    {
      const samples = [90, 95, 100, 105, 110];
      const observed = 102;
      const crps = crpsFromSamples(samples, observed);
      
      // CRPS should be positive and reasonable
      tests.push({
        name: 'CRPS calculation',
        passed: crps > 0 && crps < 20,
        metrics: { crps }
      });
    }
    
    // Test 2: Reliability binning
    {
      const pred = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      const obs = [false, false, true, false, true, true, true, true, true];
      
      const bins = reliabilityBins(pred, obs, 3);
      const ece = expectedCalibrationError(bins, pred.length);
      
      tests.push({
        name: 'Calibration metrics',
        passed: ece >= 0 && ece <= 1,
        metrics: { ece }
      });
    }
    
    this.addResult('Calibration', tests);
  }
  
  /**
   * End-to-end integration test
   */
  private async validateEndToEnd(): Promise<void> {
    const tests: Array<{
      name: string;
      passed: boolean;
      details?: string;
      metrics?: Record<string, number>;
    }> = [];
    
    // Test 1: Full optimization pipeline
    {
      const roster = this.createTestRoster();
      const opponent: EnhancedOpponentProjection = {
        mean: 110,
        variance: 625
      };
      
      const optimizer = new LineupOptimizer(20, 100);
      
      try {
        const result = optimizer.optimize(roster, opponent, {
          sims: 2000,
          targetSE: 0.02
        });
        
        const validLineup = this.validateLineupConstraints(result.starters);
        const hasMetrics = result.winProbability > 0 && result.winProbability < 1;
        
        tests.push({
          name: 'End-to-end optimization',
          passed: validLineup && hasMetrics,
          metrics: {
            winProbability: result.winProbability,
            expectedMargin: result.expectedMargin,
            candidatesEvaluated: result.diagnostics.candidatesEvaluated
          }
        });
      } catch (error) {
        tests.push({
          name: 'End-to-end optimization',
          passed: false,
          details: `Error: ${error}`
        });
      }
    }
    
    this.addResult('EndToEnd', tests);
  }
  
  /**
   * Helper: Create test roster
   */
  private createTestRoster(): PlayerProjection[] {
    const positions = [
      { pos: 'QB', count: 2, mean: 20, sd: 5 },
      { pos: 'RB', count: 4, mean: 12, sd: 4 },
      { pos: 'WR', count: 5, mean: 10, sd: 3 },
      { pos: 'TE', count: 2, mean: 8, sd: 3 },
      { pos: 'K', count: 1, mean: 8, sd: 2 },
      { pos: 'DST', count: 1, mean: 9, sd: 4 }
    ];
    
    const roster: PlayerProjection[] = [];
    let id = 1;
    
    for (const { pos, count, mean, sd } of positions) {
      for (let i = 0; i < count; i++) {
        const floor = 0;
        const ceiling = mean * 3;
        roster.push({
          player: {
            id: `${id++}`,
            name: `${pos}${i + 1}`,
            position: pos as any,
            team: 'TEAM',
            status: 'ACTIVE'
          },
          mean: mean + (Math.random() - 0.5) * 4,
          sd,
          floor,
          ceiling,
          tn: new TruncatedNormal(mean, sd, floor, ceiling),
          game: { kickoffTimeUTC: '2024-09-08T17:00:00Z' }
        });
      }
    }
    
    return roster;
  }
  
  /**
   * Helper: Create test lineup
   */
  private createTestLineup(): PlayerProjection[] {
    const roster = this.createTestRoster();
    return [
      roster.find(p => p.player.position === 'QB')!,
      ...roster.filter(p => p.player.position === 'RB').slice(0, 2),
      ...roster.filter(p => p.player.position === 'WR').slice(0, 3),
      roster.find(p => p.player.position === 'TE')!,
      roster.find(p => p.player.position === 'K')!,
      roster.find(p => p.player.position === 'DST')!,
      roster.filter(p => ['RB', 'WR', 'TE'].includes(p.player.position))[6]
    ].filter(Boolean);
  }
  
  /**
   * Helper: Validate lineup constraints
   */
  private validateLineupConstraints(lineup: PlayerProjection[]): boolean {
    if (lineup.length !== 10) return false;
    
    const counts = {
      QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0
    };
    
    for (const p of lineup) {
      counts[p.player.position as keyof typeof counts]++;
    }
    
    return counts.QB === 1 &&
           counts.RB >= 2 &&
           counts.WR >= 3 &&
           counts.TE >= 1 &&
           counts.K === 1 &&
           counts.DST === 1 &&
           (counts.RB + counts.WR + counts.TE) === 7;
  }
  
  /**
   * Add result to collection
   */
  private addResult(component: string, tests: any[]): void {
    const passed = tests.filter(t => t.passed).length;
    const total = tests.length;
    
    this.results.push({
      component,
      tests,
      summary: {
        total,
        passed,
        failed: total - passed,
        passRate: total > 0 ? passed / total : 0
      }
    });
  }
}

/**
 * Run validation and generate report
 */
export async function runValidationSuite(): Promise<string> {
  const suite = new ValidationSuite();
  const { results, overallSummary } = await suite.runAll();
  
  let report = '# Validation Suite Results\n\n';
  report += `## Overall Summary\n`;
  report += `- Components Tested: ${overallSummary.components}\n`;
  report += `- Total Tests: ${overallSummary.totalTests}\n`;
  report += `- Passed: ${overallSummary.totalPassed}\n`;
  report += `- Failed: ${overallSummary.totalFailed}\n`;
  report += `- Pass Rate: ${(overallSummary.overallPassRate * 100).toFixed(1)}%\n\n`;
  
  for (const result of results) {
    report += `## ${result.component}\n`;
    report += `Pass Rate: ${(result.summary.passRate * 100).toFixed(1)}% `;
    report += `(${result.summary.passed}/${result.summary.total})\n\n`;
    
    for (const test of result.tests) {
      const status = test.passed ? '✓' : '✗';
      report += `- [${status}] ${test.name}`;
      
      if (test.details) {
        report += ` - ${test.details}`;
      }
      
      if (test.metrics) {
        const metrics = Object.entries(test.metrics)
          .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(4) : v}`)
          .join(', ');
        report += ` (${metrics})`;
      }
      
      report += '\n';
    }
    report += '\n';
  }
  
  return report;
}