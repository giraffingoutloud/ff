/**
 * Complete Lineup Optimizer with all fixes
 * Uses k-best DP, factor correlations, and MC win probability
 */
import { PlayerProjection, OptimizedLineup, OpponentProjection } from '../types';
import { KBestDP, Candidate } from './kBestDP';
import { lineupMeanAndVariance } from '../stats/factorCorrelation';
import { analyticWinProbability, monteCarloWinProbability, determineStrategy } from './winProbability';
import { filterEligible, validateLineup } from '../services/timeConstraints';

export interface OptimizerOptions {
  K?: number;                // K-best parameter (default 50)
  monteCarloSims?: number;   // MC simulations (default 10000)
  week?: number;             // NFL week
  nowUTC?: Date;            // Current time for lock detection
  lockedPlayers?: Set<string>;
  excludedPlayers?: Set<string>;
}

export class LineupOptimizerFixed {
  private K: number;
  
  constructor(K: number = 50) {
    this.K = K;
  }
  
  /**
   * Main optimization entry point
   */
  optimizeLineup(
    roster: PlayerProjection[],
    opponent: OpponentProjection,
    options: OptimizerOptions = {}
  ): OptimizedLineup {
    const {
      K = this.K,
      monteCarloSims = 10000,
      week = 1,
      nowUTC = new Date(),
      lockedPlayers = new Set<string>(),
      excludedPlayers = new Set<string>()
    } = options;
    
    // Filter eligible players
    let eligible = filterEligible(roster, week, nowUTC);
    
    // Apply locked/excluded constraints
    eligible = eligible.filter(p => !excludedPlayers.has(p.player.id));
    
    // Determine strategy based on quick opponent assessment
    const rosterMean = eligible.reduce((sum, p) => 
      sum + (p.projection?.mean || p.projection?.median || 0), 0
    ) / 10; // Rough lineup mean
    
    const quickWinProb = analyticWinProbability(
      rosterMean * 10,  // Rough lineup total
      625,              // Typical variance (25²)
      opponent.mean,
      opponent.variance
    );
    
    const strategy = determineStrategy(quickWinProb);
    const underdogBias = strategy === 'ceiling' ? 0.5 : 
                         strategy === 'floor' ? -0.5 : 0;
    
    // Generate diverse candidates via k-best DP
    const dp = new KBestDP(K);
    const candidates = dp.generateDiverseCandidates(eligible, underdogBias);
    
    // Handle locked players constraint
    const validCandidates = this.applyLockedConstraints(candidates, lockedPlayers);
    
    if (validCandidates.length === 0) {
      throw new Error('No valid lineups found with constraints');
    }
    
    // Evaluate each candidate via Monte Carlo
    let bestResult: {
      candidate: Candidate;
      mcResult: ReturnType<typeof monteCarloWinProbability>;
      analyticWP: number;
      lineupMean: number;
      lineupVar: number;
    } | null = null;
    
    for (const candidate of validCandidates) {
      // Quick analytical screen
      const { mean, variance } = lineupMeanAndVariance(candidate.players);
      const analyticWP = analyticWinProbability(mean, variance, opponent.mean, opponent.variance);
      
      // Full MC evaluation
      const mcResult = monteCarloWinProbability(
        candidate.players,
        opponent,
        monteCarloSims,
        12345 + validCandidates.indexOf(candidate) // Vary seed
      );
      
      // Select by MC win probability
      if (!bestResult || mcResult.winProbability > bestResult.mcResult.winProbability) {
        bestResult = {
          candidate,
          mcResult,
          analyticWP,
          lineupMean: mean,
          lineupVar: variance
        };
      }
    }
    
    if (!bestResult) {
      throw new Error('Failed to evaluate candidates');
    }
    
    // Build final lineup
    const starters = bestResult.candidate.players;
    const starterIds = new Set(starters.map(p => p.player.id));
    const bench = roster
      .filter(p => !starterIds.has(p.player.id))
      .sort((a, b) => {
        const aMean = a.projection?.mean || 0;
        const bMean = b.projection?.mean || 0;
        return bMean - aMean;
      })
      .slice(0, 6); // 6 bench spots
    
    // Validate lineup
    const validation = validateLineup(starters, week, nowUTC);
    
    return {
      starters,
      bench,
      winProbability: bestResult.mcResult.winProbability,
      expectedMargin: bestResult.mcResult.expectedMargin,
      marginStdDev: bestResult.mcResult.marginStd,
      percentiles: {
        p5: bestResult.mcResult.p5,
        p25: bestResult.mcResult.p25,
        p50: bestResult.mcResult.p50,
        p75: bestResult.mcResult.p75,
        p95: bestResult.mcResult.p95
      },
      diagnostics: {
        analyticWinProb: bestResult.analyticWP,
        lineupMean: bestResult.lineupMean,
        lineupVar: bestResult.lineupVar,
        oppMean: opponent.mean,
        oppVar: opponent.variance,
        sims: monteCarloSims,
        strategy,
        candidatesEvaluated: validCandidates.length,
        validation
      }
    } as OptimizedLineup;
  }
  
  /**
   * Apply locked player constraints
   */
  private applyLockedConstraints(
    candidates: Candidate[],
    lockedPlayers: Set<string>
  ): Candidate[] {
    if (lockedPlayers.size === 0) {
      return candidates;
    }
    
    return candidates.filter(candidate => {
      // Check if all locked players are in the lineup
      for (const lockedId of lockedPlayers) {
        const hasPlayer = candidate.players.some(p => p.player.id === lockedId);
        if (!hasPlayer) {
          return false;
        }
      }
      return true;
    });
  }
  
  /**
   * Optimize with multiple opponent scenarios
   */
  optimizeRobust(
    roster: PlayerProjection[],
    opponentScenarios: Array<{ projection: OpponentProjection; weight: number }>,
    options: OptimizerOptions = {}
  ): OptimizedLineup {
    // Weighted average of opponent projections
    let totalWeight = 0;
    let weightedMean = 0;
    let weightedSecondMoment = 0;
    
    for (const scenario of opponentScenarios) {
      const w = scenario.weight;
      totalWeight += w;
      weightedMean += w * scenario.projection.mean;
      weightedSecondMoment += w * (scenario.projection.variance + 
                                   scenario.projection.mean * scenario.projection.mean);
    }
    
    const avgMean = weightedMean / totalWeight;
    const avgVariance = weightedSecondMoment / totalWeight - avgMean * avgMean;
    
    // Create mixture opponent
    const mixtureOpponent: OpponentProjection = {
      mean: avgMean,
      variance: avgVariance,
      percentiles: {
        p10: avgMean - 1.282 * Math.sqrt(avgVariance),
        p25: avgMean - 0.674 * Math.sqrt(avgVariance),
        p50: avgMean,
        p75: avgMean + 0.674 * Math.sqrt(avgVariance),
        p90: avgMean + 1.282 * Math.sqrt(avgVariance)
      },
      sample: () => {
        // Sample from mixture
        const r = Math.random();
        let cumWeight = 0;
        let chosen = opponentScenarios[0].projection;
        
        for (const scenario of opponentScenarios) {
          cumWeight += scenario.weight / totalWeight;
          if (r <= cumWeight) {
            chosen = scenario.projection;
            break;
          }
        }
        
        return chosen.sample();
      }
    };
    
    return this.optimizeLineup(roster, mixtureOpponent, options);
  }
}