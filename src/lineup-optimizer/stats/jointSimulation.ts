/**
 * Joint Simulation with Shared Latent Factors
 * Cross-lineup correlation for realistic head-to-head simulation
 */

import { PlayerProjection } from '../domain/typesCorrected';
import { TruncatedNormal } from './truncatedNormalCorrected';
import { normalCDF, normalInvCDF } from '../utils/normal';
import { RNG } from '../utils/rng';
import { SobolSequence, RandomizedSobol } from '../utils/sobol';

/**
 * Joint simulation result
 */
export interface JointSimulationResult {
  lineupTotals: number[];
  opponentTotals: number[];
  playerSamples: Map<string, number[]>;
  correlationRealized: number;
  method: 'monte-carlo' | 'quasi-monte-carlo';
}

/**
 * Enhanced opponent projection with starters
 */
export interface EnhancedOpponentProjection {
  mean: number;
  variance: number;
  starters?: PlayerProjection[];
}

/**
 * Joint simulation with shared latent factors
 * Handles cross-lineup correlation when opponent starters are known
 */
export class JointSimulator {
  private rng: RNG;
  private useQMC: boolean;
  private sobol?: SobolSequence;
  
  constructor(seed = 42, useQMC = false) {
    this.rng = new RNG(seed);
    this.useQMC = useQMC;
  }
  
  /**
   * Simulate joint totals with copula and shared factors
   */
  simulateJoint(
    lineup: PlayerProjection[],
    opponent: EnhancedOpponentProjection,
    nSims: number,
    crossCorrelation = 0.15
  ): JointSimulationResult {
    // If opponent starters unknown, fall back to independent
    if (!opponent.starters) {
      return this.simulateIndependent(lineup, opponent, nSims);
    }
    
    // Build joint player list
    const allPlayers = [...lineup, ...opponent.starters];
    const n = allPlayers.length;
    const lineupSize = lineup.length;
    
    // Initialize QMC if requested
    if (this.useQMC && !this.sobol) {
      this.sobol = new RandomizedSobol(n + 1, this.rng.nextInt()); // +1 for shared factor
    }
    
    // Build correlation structure with shared latent factor
    const { L, sharedIdx } = this.buildJointFactorStructure(
      lineup,
      opponent.starters,
      crossCorrelation
    );
    
    // Simulate
    const lineupTotals: number[] = [];
    const opponentTotals: number[] = [];
    const playerSamples = new Map<string, number[]>();
    
    for (let sim = 0; sim < nSims; sim++) {
      // Generate latent variables
      const Z = this.generateLatentVariables(n + 1); // +1 for shared factor
      
      // Apply factor structure
      const U = this.applyFactorStructure(Z, L, sharedIdx);
      
      // Transform to truncated normals
      const samples = allPlayers.map((p, i) => {
        const tn = new TruncatedNormal(p.mean, p.sd, p.floor, p.ceiling);
        return tn.quantile(U[i]);
      });
      
      // Record samples
      samples.forEach((s, i) => {
        const pid = allPlayers[i].player.id;
        if (!playerSamples.has(pid)) {
          playerSamples.set(pid, []);
        }
        playerSamples.get(pid)!.push(s);
      });
      
      // Calculate totals
      const lineupTotal = samples.slice(0, lineupSize).reduce((a, b) => a + b, 0);
      const opponentTotal = samples.slice(lineupSize).reduce((a, b) => a + b, 0);
      
      lineupTotals.push(lineupTotal);
      opponentTotals.push(opponentTotal);
    }
    
    // Calculate realized correlation
    const correlationRealized = this.calculateCorrelation(lineupTotals, opponentTotals);
    
    return {
      lineupTotals,
      opponentTotals,
      playerSamples,
      correlationRealized,
      method: this.useQMC ? 'quasi-monte-carlo' : 'monte-carlo'
    };
  }
  
  /**
   * Build joint factor structure with shared latent variable
   */
  private buildJointFactorStructure(
    lineup: PlayerProjection[],
    oppStarters: PlayerProjection[],
    crossCorr: number
  ): { L: number[][]; sharedIdx: number } {
    const n = lineup.length + oppStarters.length;
    const sharedIdx = n; // Shared factor is last
    
    // Initialize loading matrix
    const L: number[][] = Array(n).fill(null).map(() => Array(n + 1).fill(0));
    
    // Within-lineup correlations
    this.addWithinLineupCorrelations(L, lineup, 0, sharedIdx);
    
    // Within-opponent correlations
    this.addWithinLineupCorrelations(L, oppStarters, lineup.length, sharedIdx);
    
    // Cross-lineup correlation via shared factor
    const sharedLoading = Math.sqrt(crossCorr);
    for (let i = 0; i < n; i++) {
      L[i][sharedIdx] = sharedLoading;
    }
    
    // Ensure unit variance
    for (let i = 0; i < n; i++) {
      const rowSum = L[i].reduce((s, l) => s + l * l, 0);
      const residual = Math.sqrt(Math.max(0, 1 - rowSum));
      L[i][i] = residual; // Diagonal for idiosyncratic component
    }
    
    return { L, sharedIdx };
  }
  
  /**
   * Add within-lineup correlations
   */
  private addWithinLineupCorrelations(
    L: number[][],
    players: PlayerProjection[],
    offset: number,
    sharedIdx: number
  ): void {
    // Team-based correlations
    const teams = new Map<string, number[]>();
    players.forEach((p, i) => {
      const team = p.player.team;
      if (!teams.has(team)) teams.set(team, []);
      teams.get(team)!.push(offset + i);
    });
    
    // Add team factor loadings
    teams.forEach((indices, team) => {
      if (indices.length < 2) return;
      
      const teamFactor = 0.1; // Same-team correlation
      const loading = Math.sqrt(teamFactor);
      
      // Use a dedicated factor for this team
      const factorIdx = n + 1 + Array.from(teams.keys()).indexOf(team);
      
      for (const i of indices) {
        if (factorIdx < L[0].length) {
          L[i][factorIdx] = loading;
        }
      }
    });
    
    // QB-pass catcher stacking
    const qbIdx = players.findIndex(p => p.player.position === 'QB');
    if (qbIdx >= 0) {
      const qbTeam = players[qbIdx].player.team;
      players.forEach((p, i) => {
        if (i !== qbIdx && 
            p.player.team === qbTeam && 
            ['WR', 'TE'].includes(p.player.position)) {
          // Stack correlation via shared factor
          const stackLoading = Math.sqrt(0.05);
          // Would need another factor dimension for this
        }
      });
    }
  }
  
  /**
   * Generate latent variables (MC or QMC)
   */
  private generateLatentVariables(dim: number): number[] {
    if (this.useQMC && this.sobol) {
      const u = this.sobol.next();
      // Expand to required dimension if needed
      while (u.length < dim) {
        u.push(this.rng.uniform());
      }
      return u.slice(0, dim).map(ui => normalInvCDF(ui));
    } else {
      return Array(dim).fill(0).map(() => this.rng.normal());
    }
  }
  
  /**
   * Apply factor structure Z -> U
   */
  private applyFactorStructure(
    Z: number[],
    L: number[][],
    sharedIdx: number
  ): number[] {
    const n = L.length;
    const X: number[] = Array(n).fill(0);
    
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < Z.length && j < L[i].length; j++) {
        sum += L[i][j] * Z[j];
      }
      X[i] = normalCDF(sum);
    }
    
    return X;
  }
  
  /**
   * Fallback to independent simulation
   */
  private simulateIndependent(
    lineup: PlayerProjection[],
    opponent: EnhancedOpponentProjection,
    nSims: number
  ): JointSimulationResult {
    const lineupTotals: number[] = [];
    const opponentTotals: number[] = [];
    const playerSamples = new Map<string, number[]>();
    
    // Create opponent distribution
    const oppMean = opponent.mean;
    const oppStd = Math.sqrt(opponent.variance);
    
    for (let sim = 0; sim < nSims; sim++) {
      // Sample lineup
      let lineupTotal = 0;
      for (const p of lineup) {
        const tn = new TruncatedNormal(p.mean, p.sd, p.floor, p.ceiling);
        const sample = tn.sample(this.rng);
        lineupTotal += sample;
        
        if (!playerSamples.has(p.player.id)) {
          playerSamples.set(p.player.id, []);
        }
        playerSamples.get(p.player.id)!.push(sample);
      }
      
      // Sample opponent (normal approximation)
      const opponentTotal = oppMean + oppStd * this.rng.normal();
      
      lineupTotals.push(lineupTotal);
      opponentTotals.push(Math.max(0, opponentTotal));
    }
    
    return {
      lineupTotals,
      opponentTotals,
      playerSamples,
      correlationRealized: 0,
      method: this.useQMC ? 'quasi-monte-carlo' : 'monte-carlo'
    };
  }
  
  /**
   * Calculate sample correlation
   */
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      cov += dx * dy;
      vx += dx * dx;
      vy += dy * dy;
    }
    
    if (vx === 0 || vy === 0) return 0;
    return cov / Math.sqrt(vx * vy);
  }
}

/**
 * Win probability with joint simulation
 */
export function jointWinProbability(
  lineup: PlayerProjection[],
  opponent: EnhancedOpponentProjection,
  nSims: number,
  options?: {
    crossCorrelation?: number;
    useQMC?: boolean;
    seed?: number;
    targetSE?: number;
    minSims?: number;
  }
): {
  winProbability: number;
  expectedMargin: number;
  marginStd: number;
  standardError: number;
  actualSims: number;
  method: 'monte-carlo' | 'quasi-monte-carlo';
  correlationRealized: number;
} {
  const crossCorr = options?.crossCorrelation ?? 0.15;
  const useQMC = options?.useQMC ?? false;
  const seed = options?.seed ?? 42;
  const targetSE = options?.targetSE ?? 0.01;
  const minSims = options?.minSims ?? 500;
  
  const simulator = new JointSimulator(seed, useQMC);
  
  // Run initial batch
  const batchSize = Math.max(minSims, 1000);
  let totalSims = 0;
  let wins = 0;
  let marginSum = 0;
  let marginSum2 = 0;
  
  const allLineupTotals: number[] = [];
  const allOpponentTotals: number[] = [];
  
  while (totalSims < nSims) {
    const simsToRun = Math.min(batchSize, nSims - totalSims);
    
    const result = simulator.simulateJoint(
      lineup,
      opponent,
      simsToRun,
      crossCorr
    );
    
    for (let i = 0; i < simsToRun; i++) {
      const margin = result.lineupTotals[i] - result.opponentTotals[i];
      if (margin > 0) wins++;
      marginSum += margin;
      marginSum2 += margin * margin;
    }
    
    allLineupTotals.push(...result.lineupTotals);
    allOpponentTotals.push(...result.opponentTotals);
    
    totalSims += simsToRun;
    
    // Check convergence
    if (totalSims >= minSims) {
      const p = wins / totalSims;
      const se = Math.sqrt(p * (1 - p) / totalSims);
      if (se < targetSE) break;
    }
  }
  
  const winProb = wins / totalSims;
  const expMargin = marginSum / totalSims;
  const marginVar = (marginSum2 / totalSims) - expMargin * expMargin;
  const marginStd = Math.sqrt(Math.max(0, marginVar));
  const se = Math.sqrt(winProb * (1 - winProb) / totalSims);
  
  const correlationRealized = simulator['calculateCorrelation'](
    allLineupTotals,
    allOpponentTotals
  );
  
  return {
    winProbability: winProb,
    expectedMargin: expMargin,
    marginStd,
    standardError: se,
    actualSims: totalSims,
    method: useQMC ? 'quasi-monte-carlo' : 'monte-carlo',
    correlationRealized
  };
}