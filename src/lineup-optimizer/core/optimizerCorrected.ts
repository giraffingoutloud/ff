/**
 * Corrected End-to-End Lineup Optimizer
 * DP diversity → analytical screen → MC with early stopping
 */

import { PlayerProjection, LineupRequirements, OptimizedLineup, OpponentProjection, ESPN_PPR_2025 } from '../domain/typesCorrected';
import { KBestDP } from './kBestDPCorrected';
import { analyticWinProbability, monteCarloWinProbabilityEarlyStop } from './winProbabilityCorrected';

// Use ESPN 2025 as default (WR=2)
export const DEFAULT_REQS: LineupRequirements = ESPN_PPR_2025;

export class LineupOptimizer {
  constructor(
    private K: number = 50, 
    private maxCandidates: number = 2000
  ) {}

  /**
   * Quick mean/variance ignoring correlations (for screening)
   */
  private quickMeanVar(lineup: PlayerProjection[]) {
    const mean = lineup.reduce((s, p) => s + p.mean, 0);
    const var_ = lineup.reduce((s, p) => s + p.sd * p.sd, 0);
    return { mean, var_ };
  }

  /**
   * Main optimization entry point
   */
  optimize(
    roster: PlayerProjection[],
    opponent: OpponentProjection,
    options?: { 
      sims?: number; 
      targetSE?: number; 
      underdogBias?: number;
      reqs?: LineupRequirements;
    }
  ): OptimizedLineup {
    const sims = options?.sims ?? 12000;
    const targetSE = options?.targetSE ?? 0.006;
    const underdogBias = options?.underdogBias ?? 0.0;
    const reqs = options?.reqs ?? DEFAULT_REQS;

    // Step 1: Generate diverse candidates via k-best DP
    const dp = new KBestDP(this.K, this.maxCandidates);
    const candidates = dp.generateDiverseCandidates(roster, reqs, underdogBias);

    // Step 2: Screen candidates using analytical win probability
    const screened = candidates.map(c => {
      const { mean, var_ } = this.quickMeanVar(c.players);
      const wp = analyticWinProbability(mean, var_, opponent.mean, opponent.variance);
      return { c, screenWp: wp, mean, var_ };
    })
    .sort((a, b) => b.screenWp - a.screenWp)
    .slice(0, this.maxCandidates);

    // Step 3: Evaluate top candidates via Monte Carlo
    let best = null as null | {
      players: PlayerProjection[];
      wp: number;
      mc: ReturnType<typeof monteCarloWinProbabilityEarlyStop>;
    };
    
    for (const s of screened) {
      const mc = monteCarloWinProbabilityEarlyStop(
        s.c.players, 
        opponent, 
        sims, 
        targetSE, 
        600, 
        1337
      );
      
      if (!best || mc.winProbability > best.wp) {
        best = { 
          players: s.c.players, 
          wp: mc.winProbability, 
          mc 
        };
      }
    }
    
    if (!best) throw new Error('No viable candidate');

    // Step 4: Build final result
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
      winProbability: best.mc.winProbability,
      expectedMargin: best.mc.expectedMargin,
      marginStdDev: best.mc.marginStd,
      percentiles: { 
        p5: best.mc.p5, 
        p25: best.mc.p25, 
        p50: best.mc.p50, 
        p75: best.mc.p75, 
        p95: best.mc.p95 
      },
      diagnostics: {
        analyticWinProb: analytic,
        lineupMean, 
        lineupVar,
        oppMean: opponent.mean, 
        oppVar: opponent.variance,
        sims: best.mc.sims,
        mcStdErr: best.mc.mcStdErr,
        candidatesEvaluated: screened.length
      }
    };
  }
}