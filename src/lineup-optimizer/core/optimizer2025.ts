/**
 * Three-Stage Optimizer for ESPN 2025-2026
 * DP + Analytic Screen + MC with Early Stopping
 */

import { 
  PlayerProjection, 
  LineupRequirements, 
  OptimizedLineup, 
  OpponentProjection, 
  ESPN_PPR_2025 
} from '../domain/typesCorrected';
import { KBestDP } from './kBestDPCorrected';
import { 
  analyticWinProbability, 
  monteCarloWinProbabilityEarlyStop, 
  monteCarloJointWinProbabilityEarlyStop 
} from './winProbabilityCorrected';

export class LineupOptimizer2025 {
  constructor(
    private K: number = 50,
    private maxCandidates: number = 2000
  ) {}
  
  private quickMeanVar(lineup: PlayerProjection[]) {
    const mean = lineup.reduce((s, p) => s + p.mean, 0);
    const var_ = lineup.reduce((s, p) => s + p.sd * p.sd, 0);
    return { mean, var_ };
  }
  
  optimize(
    roster: PlayerProjection[],
    opponent: OpponentProjection,
    options?: {
      sims?: number;
      targetSE?: number;
      underdogBias?: number;
      reqs?: LineupRequirements;
      useLHS?: boolean;
    }
  ): OptimizedLineup {
    const sims = options?.sims ?? 12000;
    const targetSE = options?.targetSE ?? 0.006;
    const underdogBias = options?.underdogBias ?? 0.0;
    const reqs = options?.reqs ?? ESPN_PPR_2025; // Default WR=2 for 2025
    const useLHS = options?.useLHS ?? true;
    
    // Stage 1: Generate diverse candidates via k-best DP
    const dp = new KBestDP(this.K, this.maxCandidates);
    const lambdas = [-0.5, -0.25, 0, 0.25, 0.5];
    const candidates = dp.generateDiverseCandidates(roster, reqs, underdogBias, lambdas);
    
    if (candidates.length === 0) {
      throw new Error('No valid lineups found. Check roster and requirements.');
    }
    
    // Stage 2: Analytical screening
    const screened = candidates
      .map(c => {
        const { mean, var_ } = this.quickMeanVar(c.players);
        const wp = analyticWinProbability(mean, var_, opponent.mean, opponent.variance);
        return { c, screenWp: wp, mean, var_ };
      })
      .sort((a, b) => b.screenWp - a.screenWp)
      .slice(0, this.maxCandidates);
    
    // Stage 3: Monte Carlo evaluation with early stopping
    let best: null | {
      players: PlayerProjection[];
      wp: number;
      sims: number;
      mcStdErr: number;
      expectedMargin: number;
      marginStd: number;
      p5: number;
      p25: number;
      p50: number;
      p75: number;
      p95: number;
    } = null;
    
    // Check if we can use joint simulation
    const canJoint = Array.isArray(opponent.starters) && opponent.starters!.length > 0;
    
    for (const s of screened) {
      const mc = canJoint
        ? monteCarloJointWinProbabilityEarlyStop(
            s.c.players, 
            opponent.starters!, 
            sims, 
            targetSE, 
            600, 
            1337
          )
        : monteCarloWinProbabilityEarlyStop(
            s.c.players, 
            opponent, 
            sims, 
            targetSE, 
            600, 
            1337,
            useLHS
          );
      
      if (!best || mc.winProbability > best.wp) {
        best = {
          players: s.c.players,
          wp: mc.winProbability,
          sims: mc.sims,
          mcStdErr: mc.mcStdErr,
          expectedMargin: mc.expectedMargin,
          marginStd: mc.marginStd,
          p5: mc.p5,
          p25: mc.p25,
          p50: mc.p50,
          p75: mc.p75,
          p95: mc.p95
        };
      }
    }
    
    if (!best) {
      throw new Error('No viable candidate found');
    }
    
    // Build final result
    const starters = best.players;
    const bench = roster.filter(p => !starters.includes(p));
    const { mean: lineupMean, var_: lineupVar } = this.quickMeanVar(starters);
    const analytic = analyticWinProbability(
      lineupMean, 
      lineupVar, 
      opponent.mean, 
      opponent.variance
    );
    
    return {
      starters,
      bench,
      winProbability: best.wp,
      expectedMargin: best.expectedMargin,
      marginStdDev: best.marginStd,
      percentiles: {
        p5: best.p5,
        p25: best.p25,
        p50: best.p50,
        p75: best.p75,
        p95: best.p95
      },
      diagnostics: {
        analyticWinProb: analytic,
        lineupMean,
        lineupVar,
        oppMean: opponent.mean,
        oppVar: opponent.variance,
        sims: best.sims,
        mcStdErr: best.mcStdErr,
        candidatesEvaluated: screened.length
      }
    };
  }
  
  /**
   * Validate lineup meets requirements
   */
  validateLineup(
    lineup: PlayerProjection[],
    reqs: LineupRequirements = ESPN_PPR_2025
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    // Count positions
    const counts = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0
    };
    
    for (const p of lineup) {
      counts[p.player.position]++;
    }
    
    // Check fixed positions
    if (counts.QB !== reqs.QB) {
      errors.push(`QB: expected ${reqs.QB}, got ${counts.QB}`);
    }
    if (counts.K !== reqs.K) {
      errors.push(`K: expected ${reqs.K}, got ${counts.K}`);
    }
    if (counts.DST !== reqs.DST) {
      errors.push(`DST: expected ${reqs.DST}, got ${counts.DST}`);
    }
    
    // Check skill positions (must account for FLEX)
    const totalSkill = counts.RB + counts.WR + counts.TE;
    const expectedSkill = reqs.RB + reqs.WR + reqs.TE + reqs.FLEX;
    
    if (totalSkill !== expectedSkill) {
      errors.push(`Skill positions: expected ${expectedSkill}, got ${totalSkill}`);
    }
    
    // Check minimums
    if (counts.RB < reqs.RB) {
      errors.push(`RB: need at least ${reqs.RB}, got ${counts.RB}`);
    }
    if (counts.WR < reqs.WR) {
      errors.push(`WR: need at least ${reqs.WR}, got ${counts.WR}`);
    }
    if (counts.TE < reqs.TE) {
      errors.push(`TE: need at least ${reqs.TE}, got ${counts.TE}`);
    }
    
    // Check total (9 starters in ESPN standard)
    if (lineup.length !== 9) {
      errors.push(`Total players: expected 9, got ${lineup.length}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}