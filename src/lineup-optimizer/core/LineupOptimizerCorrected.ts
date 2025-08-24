/**
 * Corrected Lineup Optimizer
 * 
 * Complete implementation with all expert review fixes:
 * - Gaussian copula for exact TN marginals
 * - Enhanced k-best DP with diversity
 * - Monte Carlo win probability with SE
 * - Robust TN parameter fitting
 * - UTC-only temporal constraints
 */

import { 
  PlayerProjection, 
  OptimizedLineup, 
  OpponentProjection,
  LineupRequirements 
} from '../types';
import { EnhancedKBestDP, Candidate } from './enhancedKBestDP';
import { MonteCarloEstimator, analyticWinProbability, determineStrategy } from './monteCarloWinProbability';
import { filterEligible, validateLineup } from '../services/timeConstraints';
import { fitTNFromFantasyQuantiles } from '../math/robustTNFitting';

/**
 * Optimizer configuration
 */
export interface OptimizerConfig {
  K?: number;                      // K-best parameter
  maxSimulations?: number;         // Max MC simulations
  minSimulations?: number;         // Min MC simulations
  targetSE?: number;               // Target standard error
  week?: number;                   // NFL week
  year?: number;                   // Season year
  nowUTC?: Date;                  // Current time UTC
  lockedPlayers?: Set<string>;    // Must-start players
  excludedPlayers?: Set<string>;  // Excluded players
  diversityTarget?: number;        // Lineup diversity target
  verbose?: boolean;               // Debug output
}

/**
 * Corrected Lineup Optimizer
 */
export class LineupOptimizerCorrected {
  private dpEngine: EnhancedKBestDP;
  private mcEstimator: MonteCarloEstimator;
  private config: Required<OptimizerConfig>;
  
  constructor(config: OptimizerConfig = {}) {
    this.config = {
      K: config.K ?? 50,
      maxSimulations: config.maxSimulations ?? 50000,
      minSimulations: config.minSimulations ?? 1000,
      targetSE: config.targetSE ?? 0.005,
      week: config.week ?? 1,
      year: config.year ?? 2024,
      nowUTC: config.nowUTC ?? new Date(),
      lockedPlayers: config.lockedPlayers ?? new Set(),
      excludedPlayers: config.excludedPlayers ?? new Set(),
      diversityTarget: config.diversityTarget ?? 0.3,
      verbose: config.verbose ?? false
    };
    
    this.dpEngine = new EnhancedKBestDP(this.config.K);
    this.mcEstimator = new MonteCarloEstimator();
  }
  
  /**
   * Main optimization entry point
   */
  optimizeLineup(
    roster: PlayerProjection[],
    opponent: OpponentProjection
  ): OptimizedLineup {
    const startTime = Date.now();
    
    if (this.config.verbose) {
      console.log(`Starting optimization with ${roster.length} players`);
    }
    
    // Step 1: Prepare projections with proper TN parameters
    const preparedRoster = this.prepareProjections(roster);
    
    // Step 2: Filter eligible players
    const eligible = this.filterPlayers(preparedRoster);
    
    if (eligible.length < 10) {
      throw new Error(`Only ${eligible.length} eligible players, need at least 10`);
    }
    
    // Step 3: Determine strategy based on quick assessment
    const strategy = this.determineInitialStrategy(eligible, opponent);
    
    if (this.config.verbose) {
      console.log(`Using strategy: ${strategy}`);
    }
    
    // Step 4: Generate diverse candidates
    const candidates = this.generateCandidates(eligible, strategy);
    
    if (this.config.verbose) {
      console.log(`Generated ${candidates.length} unique candidates`);
    }
    
    // Step 5: Apply constraints
    const validCandidates = this.applyConstraints(candidates);
    
    if (validCandidates.length === 0) {
      throw new Error('No valid lineups found with constraints');
    }
    
    if (this.config.verbose) {
      console.log(`${validCandidates.length} candidates pass constraints`);
    }
    
    // Step 6: Evaluate via Monte Carlo
    const bestLineup = this.evaluateCandidates(validCandidates, opponent);
    
    // Step 7: Build final result
    const result = this.buildResult(bestLineup, roster);
    
    const elapsed = Date.now() - startTime;
    if (this.config.verbose) {
      console.log(`Optimization completed in ${elapsed}ms`);
      console.log(`Win probability: ${(result.winProbability * 100).toFixed(1)}%`);
    }
    
    return result;
  }
  
  /**
   * Prepare projections with proper TN parameters
   */
  private prepareProjections(roster: PlayerProjection[]): PlayerProjection[] {
    return roster.map(player => {
      const proj = player.projection;
      if (!proj) {
        return player;
      }
      
      // Ensure we have proper TN parameters
      if (!proj.originalMean || !proj.originalStdDev) {
        // Fit TN from quantiles
        const fitted = fitTNFromFantasyQuantiles(
          proj.floor,
          proj.median,
          proj.ceiling,
          player.player.position
        );
        
        return {
          ...player,
          projection: {
            ...proj,
            originalMean: fitted.mu,
            originalStdDev: fitted.sigma,
            lowerBound: fitted.lowerBound,
            upperBound: fitted.upperBound,
            mean: fitted.mean,
            variance: fitted.variance
          }
        };
      }
      
      return player;
    });
  }
  
  /**
   * Filter players based on eligibility
   */
  private filterPlayers(roster: PlayerProjection[]): PlayerProjection[] {
    // Apply temporal constraints
    let eligible = filterEligible(
      roster,
      this.config.week,
      this.config.nowUTC,
      this.config.year
    );
    
    // Apply exclusions
    eligible = eligible.filter(p => 
      !this.config.excludedPlayers.has(p.player.id)
    );
    
    // Ensure we have required positions
    const positionCounts = new Map<string, number>();
    for (const p of eligible) {
      const pos = p.player.position;
      positionCounts.set(pos, (positionCounts.get(pos) || 0) + 1);
    }
    
    const requirements: LineupRequirements = {
      QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DST: 1, BENCH: 6
    };
    
    // Check minimum requirements (considering FLEX)
    const rbCount = positionCounts.get('RB') || 0;
    const wrCount = positionCounts.get('WR') || 0;
    const teCount = positionCounts.get('TE') || 0;
    const flexEligible = rbCount + wrCount + teCount;
    
    if ((positionCounts.get('QB') || 0) < requirements.QB) {
      throw new Error('Not enough eligible QBs');
    }
    if ((positionCounts.get('K') || 0) < requirements.K) {
      throw new Error('Not enough eligible Ks');
    }
    if ((positionCounts.get('DST') || 0) < requirements.DST) {
      throw new Error('Not enough eligible DSTs');
    }
    if (flexEligible < requirements.RB + requirements.WR + requirements.TE + requirements.FLEX) {
      throw new Error('Not enough FLEX-eligible players');
    }
    
    return eligible;
  }
  
  /**
   * Determine initial strategy
   */
  private determineInitialStrategy(
    eligible: PlayerProjection[],
    opponent: OpponentProjection
  ): 'floor' | 'balanced' | 'ceiling' {
    // Quick estimate of lineup strength
    const topPlayers = eligible
      .sort((a, b) => (b.projection?.mean || 0) - (a.projection?.mean || 0))
      .slice(0, 10);
    
    const lineupMean = topPlayers.reduce((sum, p) => 
      sum + (p.projection?.mean || 0), 0);
    
    const lineupVar = topPlayers.reduce((sum, p) => 
      sum + (p.projection?.variance || 0), 0);
    
    // Analytical win probability
    const winProb = analyticWinProbability(
      lineupMean,
      lineupVar,
      opponent.mean,
      opponent.variance
    );
    
    return determineStrategy(winProb);
  }
  
  /**
   * Generate diverse candidates
   */
  private generateCandidates(
    eligible: PlayerProjection[],
    baseStrategy: string
  ): Candidate[] {
    // Define strategies based on base strategy
    let strategies;
    
    if (baseStrategy === 'ceiling') {
      // Underdog - emphasize upside
      strategies = [
        { meanWeight: 0.3, ceilingWeight: 0.7, jitterStd: 0.0, label: 'ceiling' },
        { meanWeight: 0.2, ceilingWeight: 0.8, jitterStd: 0.5, label: 'ceiling_jitter' },
        { meanWeight: 0.4, ceilingWeight: 0.6, jitterStd: 1.0, label: 'ceiling_diverse' },
        { meanWeight: 0.5, ceilingWeight: 0.5, jitterStd: 0.0, label: 'balanced' },
        { meanWeight: 0.0, ceilingWeight: 1.0, jitterStd: 0.0, label: 'pure_ceiling' }
      ];
    } else if (baseStrategy === 'floor') {
      // Favorite - emphasize consistency
      strategies = [
        { meanWeight: 0.7, ceilingWeight: 0.3, jitterStd: 0.0, label: 'floor' },
        { meanWeight: 0.8, ceilingWeight: 0.2, jitterStd: 0.3, label: 'floor_jitter' },
        { meanWeight: 1.0, ceilingWeight: 0.0, jitterStd: 0.0, label: 'pure_mean' },
        { meanWeight: 0.6, ceilingWeight: 0.4, jitterStd: 0.5, label: 'floor_diverse' },
        { meanWeight: 0.5, ceilingWeight: 0.5, jitterStd: 0.0, label: 'balanced' }
      ];
    } else {
      // Balanced - mix of strategies
      strategies = [
        { meanWeight: 1.0, ceilingWeight: 0.0, jitterStd: 0.0, label: 'mean' },
        { meanWeight: 0.5, ceilingWeight: 0.5, jitterStd: 0.0, label: 'balanced' },
        { meanWeight: 0.3, ceilingWeight: 0.7, jitterStd: 0.0, label: 'ceiling' },
        { meanWeight: 0.7, ceilingWeight: 0.3, jitterStd: 0.5, label: 'mean_jitter' },
        { meanWeight: 0.5, ceilingWeight: 0.5, jitterStd: 1.0, label: 'diverse' }
      ];
    }
    
    // Generate candidates
    const candidates = this.dpEngine.generateDiverseCandidates(eligible, strategies);
    
    // Enhance positional diversity if needed
    if (this.config.diversityTarget > 0) {
      return this.dpEngine.enhancePositionalDiversity(
        candidates,
        this.config.diversityTarget
      );
    }
    
    return candidates;
  }
  
  /**
   * Apply locked player constraints
   */
  private applyConstraints(candidates: Candidate[]): Candidate[] {
    if (this.config.lockedPlayers.size === 0) {
      return candidates;
    }
    
    return candidates.filter(candidate => {
      const playerIds = new Set(candidate.players.map(p => p.player.id));
      
      // Check all locked players are included
      for (const lockedId of this.config.lockedPlayers) {
        if (!playerIds.has(lockedId)) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * Evaluate candidates via Monte Carlo
   */
  private evaluateCandidates(
    candidates: Candidate[],
    opponent: OpponentProjection
  ): {
    candidate: Candidate;
    mcResult: ReturnType<typeof this.mcEstimator.estimateWinProbability>;
  } {
    let bestResult = null;
    let bestWinProb = -1;
    
    // Evaluate each candidate
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      
      // Run MC simulation
      const mcResult = this.mcEstimator.estimateWinProbability(
        candidate.players,
        opponent,
        {
          maxSimulations: this.config.maxSimulations,
          minSimulations: this.config.minSimulations,
          targetSE: this.config.targetSE,
          seed: 12345 + i,
          verbose: false
        }
      );
      
      // Track best
      if (mcResult.winProbability > bestWinProb) {
        bestWinProb = mcResult.winProbability;
        bestResult = {
          candidate,
          mcResult
        };
      }
      
      // Early termination if we found a very strong lineup
      if (bestWinProb > 0.8 && mcResult.standardError < 0.01) {
        if (this.config.verbose) {
          console.log(`Early termination with ${(bestWinProb * 100).toFixed(1)}% win probability`);
        }
        break;
      }
    }
    
    if (!bestResult) {
      throw new Error('Failed to evaluate any candidates');
    }
    
    return bestResult;
  }
  
  /**
   * Build final optimized lineup result
   */
  private buildResult(
    best: {
      candidate: Candidate;
      mcResult: ReturnType<typeof this.mcEstimator.estimateWinProbability>;
    },
    fullRoster: PlayerProjection[]
  ): OptimizedLineup {
    const { candidate, mcResult } = best;
    
    // Identify starters
    const starters = candidate.players;
    const starterIds = new Set(starters.map(p => p.player.id));
    
    // Select bench players
    const bench = fullRoster
      .filter(p => !starterIds.has(p.player.id))
      .filter(p => !this.config.excludedPlayers.has(p.player.id))
      .sort((a, b) => {
        const aMean = a.projection?.mean || 0;
        const bMean = b.projection?.mean || 0;
        return bMean - aMean;
      })
      .slice(0, 6);
    
    // Validate lineup
    const validation = validateLineup(
      starters,
      this.config.week,
      this.config.nowUTC,
      this.config.year
    );
    
    // Calculate confidence interval
    const ci = this.mcEstimator.getConfidenceInterval(
      mcResult.winProbability,
      mcResult.standardError,
      0.95
    );
    
    return {
      starters,
      bench,
      winProbability: mcResult.winProbability,
      expectedMargin: mcResult.expectedMargin,
      marginStdDev: mcResult.marginStd,
      percentiles: {
        p5: mcResult.percentiles.p5,
        p25: mcResult.percentiles.p25,
        p50: mcResult.percentiles.p50,
        p75: mcResult.percentiles.p75,
        p95: mcResult.percentiles.p95
      },
      diagnostics: {
        analyticWinProb: analyticWinProbability(
          starters.reduce((sum, p) => sum + (p.projection?.mean || 0), 0),
          starters.reduce((sum, p) => sum + (p.projection?.variance || 0), 0),
          mcResult.expectedMargin + starters.reduce((sum, p) => sum + (p.projection?.mean || 0), 0),
          mcResult.marginStd ** 2
        ),
        lineupMean: starters.reduce((sum, p) => sum + (p.projection?.mean || 0), 0),
        lineupVar: starters.reduce((sum, p) => sum + (p.projection?.variance || 0), 0),
        oppMean: mcResult.expectedMargin + starters.reduce((sum, p) => sum + (p.projection?.mean || 0), 0),
        oppVar: mcResult.marginStd ** 2,
        sims: mcResult.simulations,
        strategy: determineStrategy(mcResult.winProbability),
        candidatesEvaluated: 1,
        validation,
        standardError: mcResult.standardError,
        confidenceInterval: ci,
        converged: mcResult.converged,
        convergenceReason: mcResult.convergenceReason
      }
    } as OptimizedLineup;
  }
  
  /**
   * Optimize with historical opponent data
   */
  optimizeWithHistory(
    roster: PlayerProjection[],
    opponentHistory: number[],
    options?: {
      robustness?: number; // Weight on worst-case scenarios
    }
  ): OptimizedLineup {
    const robustness = options?.robustness ?? 0.2;
    
    // Fit opponent distribution from history
    const oppMean = opponentHistory.reduce((a, b) => a + b, 0) / opponentHistory.length;
    const oppVar = opponentHistory.reduce((sum, x) => 
      sum + (x - oppMean) ** 2, 0) / (opponentHistory.length - 1);
    
    // Create percentiles
    const sorted = [...opponentHistory].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    
    // Build opponent model with robustness adjustment
    const opponent: OpponentProjection = {
      mean: oppMean + robustness * Math.sqrt(oppVar), // Adjust for robustness
      variance: oppVar * (1 + robustness),
      percentiles: {
        p10,
        p25: sorted[Math.floor(sorted.length * 0.25)],
        p50: sorted[Math.floor(sorted.length * 0.50)],
        p75: sorted[Math.floor(sorted.length * 0.75)],
        p90
      },
      sample: () => {
        // Sample from historical distribution
        const idx = Math.floor(Math.random() * opponentHistory.length);
        const base = opponentHistory[idx];
        
        // Add noise for robustness
        const noise = (Math.random() - 0.5) * 2 * Math.sqrt(oppVar) * robustness;
        
        return base + noise;
      }
    };
    
    return this.optimizeLineup(roster, opponent);
  }
}