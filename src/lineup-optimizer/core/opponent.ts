/**
 * Opponent Modeling
 * Uses same DP and correlation model for symmetry
 */
import { OpponentProjection, PlayerProjection } from '../types';
import { KBestDP } from './kBestDP';
import { lineupMeanAndVariance } from '../stats/factorCorrelation';
import { RNG } from '../utils/random';

/**
 * Model opponent from their roster using same pipeline
 */
export function opponentFromRoster(
  roster: PlayerProjection[],
  K: number = 50
): OpponentProjection {
  // Run DP to get optimal lineup by mean
  const dp = new KBestDP(K);
  const valueFn = (p: PlayerProjection) => {
    return p.projection?.mean || p.projection?.median || 0;
  };
  
  const candidates = dp.optimizeCandidates(roster, valueFn);
  
  // Use best-by-mean candidate
  const lineup = candidates[0]?.players || roster.slice(0, 10);
  
  // Calculate mean and variance with correlations
  const { mean, variance } = lineupMeanAndVariance(lineup);
  
  // Create sampling function
  const rng = new RNG(987654321);
  
  return {
    mean,
    variance,
    percentiles: calculatePercentiles(mean, Math.sqrt(variance)),
    sample: () => {
      // Sample from normal, bounded to reasonable range
      const x = mean + Math.sqrt(variance) * rng.normal();
      return Math.max(50, Math.min(250, x));
    }
  };
}

/**
 * Fallback: league average model
 */
export function opponentLeagueAverage(
  leagueSize: number = 12,
  scoring: 'PPR' | 'HALF_PPR' | 'STANDARD' = 'PPR'
): OpponentProjection {
  // Historical averages by scoring type
  const LEAGUE_AVERAGES = {
    'PPR': { mean: 125, sd: 25 },
    'HALF_PPR': { mean: 115, sd: 23 },
    'STANDARD': { mean: 105, sd: 20 }
  };
  
  const base = LEAGUE_AVERAGES[scoring];
  
  // Adjust for league depth
  const depthMultiplier = 1 - (leagueSize - 10) * 0.02;
  const mean = base.mean * depthMultiplier;
  const sd = base.sd;
  const variance = sd * sd;
  
  const rng = new RNG(424242);
  
  return {
    mean,
    variance,
    percentiles: calculatePercentiles(mean, sd),
    sample: () => {
      const x = mean + sd * rng.normal();
      return Math.max(50, Math.min(250, x));
    }
  };
}

/**
 * Model with partial information (known starters)
 */
export function opponentWithPartialInfo(
  knownStarters: PlayerProjection[],
  leagueSize: number = 12,
  scoring: 'PPR' | 'HALF_PPR' | 'STANDARD' = 'PPR'
): OpponentProjection {
  // Calculate known portion with correlations
  const { mean: knownMean, variance: knownVar } = lineupMeanAndVariance(knownStarters);
  
  // Estimate total from league average
  const fullEstimate = opponentLeagueAverage(leagueSize, scoring);
  
  // Known starters typically represent 65% of total score
  const knownWeight = 0.65;
  const unknownWeight = 1 - knownWeight;
  
  // Extrapolate total
  const totalMean = knownMean / knownWeight;
  
  // Combine variances (assuming independence between known and unknown)
  const unknownVar = fullEstimate.variance * unknownWeight;
  const totalVar = knownVar + unknownVar;
  
  const rng = new RNG(555555);
  
  return {
    mean: totalMean,
    variance: totalVar,
    percentiles: calculatePercentiles(totalMean, Math.sqrt(totalVar)),
    sample: () => {
      const x = totalMean + Math.sqrt(totalVar) * rng.normal();
      return Math.max(50, Math.min(250, x));
    }
  };
}

/**
 * Mixture model for uncertainty
 */
export function opponentMixture(
  scenarios: Array<{ projection: OpponentProjection; weight: number }>
): OpponentProjection {
  // Normalize weights
  const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
  const weights = scenarios.map(s => s.weight / totalWeight);
  
  // Calculate mixture moments
  let mean = 0;
  let secondMoment = 0;
  
  for (let i = 0; i < scenarios.length; i++) {
    const proj = scenarios[i].projection;
    const w = weights[i];
    mean += w * proj.mean;
    secondMoment += w * (proj.variance + proj.mean * proj.mean);
  }
  
  const variance = secondMoment - mean * mean;
  
  // Sampling from mixture
  const rng = new RNG(777777);
  
  return {
    mean,
    variance,
    percentiles: calculatePercentiles(mean, Math.sqrt(variance)),
    sample: () => {
      // Choose scenario
      const u = rng.next();
      let cumWeight = 0;
      let chosenScenario = scenarios[0].projection;
      
      for (let i = 0; i < scenarios.length; i++) {
        cumWeight += weights[i];
        if (u <= cumWeight) {
          chosenScenario = scenarios[i].projection;
          break;
        }
      }
      
      return chosenScenario.sample();
    }
  };
}

/**
 * Calculate percentiles assuming normal distribution
 */
function calculatePercentiles(
  mean: number,
  sd: number
): { p10: number; p25: number; p50: number; p75: number; p90: number } {
  return {
    p10: mean - 1.282 * sd,
    p25: mean - 0.674 * sd,
    p50: mean,
    p75: mean + 0.674 * sd,
    p90: mean + 1.282 * sd
  };
}