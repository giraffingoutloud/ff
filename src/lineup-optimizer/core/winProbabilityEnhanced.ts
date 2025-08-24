/**
 * Enhanced Win Probability with Joint Simulation
 * Production-ready with all advanced features
 */

import { PlayerProjection } from '../domain/typesCorrected';
import { EnhancedOpponentProjection, jointWinProbability } from '../stats/jointSimulation';
import { monteCarloWinProbabilityEarlyStop } from './winProbabilityCorrected';

/**
 * Production win probability calculation
 * Automatically uses joint simulation when opponent starters available
 */
export function calculateWinProbability(
  lineup: PlayerProjection[],
  opponent: EnhancedOpponentProjection,
  options?: {
    method?: 'auto' | 'joint' | 'independent' | 'analytic';
    simulations?: number;
    targetSE?: number;
    minSims?: number;
    useQMC?: boolean;
    crossCorrelation?: number;
    seed?: number;
  }
): {
  winProbability: number;
  expectedMargin: number;
  marginStd: number;
  confidence: {
    lower: number;
    upper: number;
    level: number;
  };
  diagnostics: {
    method: string;
    simulations: number;
    standardError: number;
    correlationRealized?: number;
    convergenceTime?: number;
  };
} {
  const method = options?.method ?? 'auto';
  const sims = options?.simulations ?? 10000;
  const targetSE = options?.targetSE ?? 0.005;
  const minSims = options?.minSims ?? 1000;
  const useQMC = options?.useQMC ?? false;
  const crossCorr = options?.crossCorrelation ?? 0.15;
  const seed = options?.seed ?? Date.now();
  
  const startTime = Date.now();
  
  // Determine method
  const useJoint = method === 'joint' || 
                   (method === 'auto' && opponent.starters !== undefined);
  
  let result: {
    winProbability: number;
    expectedMargin: number;
    marginStd: number;
    standardError: number;
    actualSims: number;
    correlationRealized?: number;
  };
  
  if (useJoint && opponent.starters) {
    // Joint simulation with shared factors
    const jointResult = jointWinProbability(
      lineup,
      opponent,
      sims,
      {
        crossCorrelation: crossCorr,
        useQMC,
        seed,
        targetSE,
        minSims
      }
    );
    
    result = {
      winProbability: jointResult.winProbability,
      expectedMargin: jointResult.expectedMargin,
      marginStd: jointResult.marginStd,
      standardError: jointResult.standardError,
      actualSims: jointResult.actualSims,
      correlationRealized: jointResult.correlationRealized
    };
  } else {
    // Independent simulation
    const mcResult = monteCarloWinProbabilityEarlyStop(
      lineup,
      opponent,
      sims,
      targetSE,
      minSims,
      seed
    );
    
    result = {
      winProbability: mcResult.winProbability,
      expectedMargin: mcResult.expectedMargin,
      marginStd: mcResult.marginStd,
      standardError: mcResult.mcStdErr,
      actualSims: mcResult.sims
    };
  }
  
  // Calculate confidence interval
  const z = 1.96; // 95% confidence
  const confLower = Math.max(0, result.winProbability - z * result.standardError);
  const confUpper = Math.min(1, result.winProbability + z * result.standardError);
  
  const elapsed = Date.now() - startTime;
  
  return {
    winProbability: result.winProbability,
    expectedMargin: result.expectedMargin,
    marginStd: result.marginStd,
    confidence: {
      lower: confLower,
      upper: confUpper,
      level: 0.95
    },
    diagnostics: {
      method: useJoint ? 'joint' : 'independent',
      simulations: result.actualSims,
      standardError: result.standardError,
      correlationRealized: result.correlationRealized,
      convergenceTime: elapsed
    }
  };
}

/**
 * Batch win probability calculation
 * Efficient for evaluating multiple lineups
 */
export function batchWinProbability(
  lineups: PlayerProjection[][],
  opponent: EnhancedOpponentProjection,
  options?: {
    parallel?: boolean;
    sharedSeed?: boolean;
    targetSE?: number;
    useQMC?: boolean;
  }
): Array<{
  lineup: PlayerProjection[];
  winProbability: number;
  expectedMargin: number;
}> {
  const results: Array<{
    lineup: PlayerProjection[];
    winProbability: number;
    expectedMargin: number;
  }> = [];
  
  const baseSeed = options?.sharedSeed ? 42 : Date.now();
  
  for (let i = 0; i < lineups.length; i++) {
    const seed = options?.sharedSeed ? baseSeed : baseSeed + i;
    
    const result = calculateWinProbability(
      lineups[i],
      opponent,
      {
        simulations: 5000, // Reduced for batch
        targetSE: options?.targetSE ?? 0.01,
        useQMC: options?.useQMC ?? false,
        seed
      }
    );
    
    results.push({
      lineup: lineups[i],
      winProbability: result.winProbability,
      expectedMargin: result.expectedMargin
    });
  }
  
  return results;
}

/**
 * Progressive refinement for interactive optimization
 */
export class ProgressiveWinProbability {
  private simsSoFar = 0;
  private wins = 0;
  private marginSum = 0;
  private marginSum2 = 0;
  private samples: number[] = [];
  
  constructor(
    private lineup: PlayerProjection[],
    private opponent: EnhancedOpponentProjection,
    private targetSE = 0.005
  ) {}
  
  /**
   * Run additional simulations
   */
  refine(additionalSims: number): {
    winProbability: number;
    standardError: number;
    converged: boolean;
  } {
    const result = calculateWinProbability(
      this.lineup,
      this.opponent,
      {
        simulations: additionalSims,
        minSims: additionalSims
      }
    );
    
    // Update running totals
    const newWins = Math.round(result.winProbability * additionalSims);
    this.wins += newWins;
    this.simsSoFar += additionalSims;
    
    this.marginSum += result.expectedMargin * additionalSims;
    this.marginSum2 += (result.marginStd * result.marginStd + 
                        result.expectedMargin * result.expectedMargin) * additionalSims;
    
    // Calculate current estimates
    const winProb = this.wins / this.simsSoFar;
    const se = Math.sqrt(winProb * (1 - winProb) / this.simsSoFar);
    const converged = se < this.targetSE;
    
    return {
      winProbability: winProb,
      standardError: se,
      converged
    };
  }
  
  /**
   * Get current estimate
   */
  getCurrentEstimate(): {
    winProbability: number;
    expectedMargin: number;
    marginStd: number;
    standardError: number;
    simulations: number;
  } {
    if (this.simsSoFar === 0) {
      return {
        winProbability: 0.5,
        expectedMargin: 0,
        marginStd: 0,
        standardError: 0.5,
        simulations: 0
      };
    }
    
    const winProb = this.wins / this.simsSoFar;
    const expMargin = this.marginSum / this.simsSoFar;
    const marginVar = (this.marginSum2 / this.simsSoFar) - expMargin * expMargin;
    const marginStd = Math.sqrt(Math.max(0, marginVar));
    const se = Math.sqrt(winProb * (1 - winProb) / this.simsSoFar);
    
    return {
      winProbability: winProb,
      expectedMargin: expMargin,
      marginStd,
      standardError: se,
      simulations: this.simsSoFar
    };
  }
}

/**
 * Sensitivity analysis for win probability
 */
export function sensitivityAnalysis(
  lineup: PlayerProjection[],
  opponent: EnhancedOpponentProjection,
  playerIndex: number,
  perturbations: number[] = [-0.2, -0.1, 0, 0.1, 0.2]
): {
  baseline: number;
  sensitivity: Array<{
    perturbation: number;
    winProbability: number;
    change: number;
  }>;
  elasticity: number;
} {
  // Baseline
  const baseline = calculateWinProbability(lineup, opponent, {
    simulations: 5000,
    targetSE: 0.01
  }).winProbability;
  
  const results: Array<{
    perturbation: number;
    winProbability: number;
    change: number;
  }> = [];
  
  for (const pert of perturbations) {
    // Create perturbed lineup
    const perturbedLineup = [...lineup];
    const player = { ...lineup[playerIndex] };
    player.mean *= (1 + pert);
    perturbedLineup[playerIndex] = player;
    
    const wp = calculateWinProbability(perturbedLineup, opponent, {
      simulations: 5000,
      targetSE: 0.01
    }).winProbability;
    
    results.push({
      perturbation: pert,
      winProbability: wp,
      change: wp - baseline
    });
  }
  
  // Calculate elasticity (% change in WP / % change in mean)
  const positiveResults = results.filter(r => r.perturbation > 0);
  const negativeResults = results.filter(r => r.perturbation < 0);
  
  let elasticity = 0;
  if (positiveResults.length > 0 && negativeResults.length > 0) {
    const avgPositive = positiveResults.reduce((s, r) => 
      s + (r.change / baseline) / r.perturbation, 0) / positiveResults.length;
    const avgNegative = negativeResults.reduce((s, r) => 
      s + (r.change / baseline) / r.perturbation, 0) / negativeResults.length;
    elasticity = (avgPositive + avgNegative) / 2;
  }
  
  return {
    baseline,
    sensitivity: results,
    elasticity
  };
}