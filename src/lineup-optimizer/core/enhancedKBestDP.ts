/**
 * Enhanced K-Best Dynamic Programming with Diversity
 * 
 * Generates diverse lineup candidates through:
 * - Multiple objective weight sweeps
 * - Jittered player values
 * - Position-specific diversity
 * - Global complexity caps
 */

import { PlayerProjection, LineupRequirements } from '../types';

/**
 * DP State representation
 */
interface DPState {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  K: number;
  DST: number;
}

/**
 * Candidate lineup
 */
export interface Candidate {
  players: PlayerProjection[];
  score: number;
  bitmask: bigint; // For deduplication
  state: DPState;
}

/**
 * State key for memoization
 */
function stateKey(state: DPState): string {
  return `${state.QB}_${state.RB}_${state.WR}_${state.TE}_${state.FLEX}_${state.K}_${state.DST}`;
}

/**
 * Check if state satisfies requirements
 */
function isComplete(state: DPState, reqs: LineupRequirements): boolean {
  return state.QB >= reqs.QB &&
         state.RB >= reqs.RB &&
         state.WR >= reqs.WR &&
         state.TE >= reqs.TE &&
         state.FLEX >= reqs.FLEX &&
         state.K >= reqs.K &&
         state.DST >= reqs.DST;
}

/**
 * Enhanced K-Best DP with diversity mechanisms
 */
export class EnhancedKBestDP {
  private K: number;
  private globalCapacity: number;
  private requirements: LineupRequirements = {
    QB: 1,
    RB: 2,
    WR: 3,
    TE: 1,
    FLEX: 1,
    K: 1,
    DST: 1,
    BENCH: 6
  };
  
  constructor(K: number = 50, globalCapacity: number = 100000) {
    this.K = K;
    this.globalCapacity = globalCapacity;
  }
  
  /**
   * Generate diverse candidates via multiple strategies
   */
  generateDiverseCandidates(
    players: PlayerProjection[],
    strategies: Array<{
      meanWeight: number;
      ceilingWeight: number;
      jitterStd: number;
      label: string;
    }> = [
      { meanWeight: 1.0, ceilingWeight: 0.0, jitterStd: 0.0, label: 'mean' },
      { meanWeight: 0.7, ceilingWeight: 0.3, jitterStd: 0.0, label: 'balanced' },
      { meanWeight: 0.3, ceilingWeight: 0.7, jitterStd: 0.0, label: 'ceiling' },
      { meanWeight: 1.0, ceilingWeight: 0.0, jitterStd: 0.5, label: 'mean_jitter' },
      { meanWeight: 0.5, ceilingWeight: 0.5, jitterStd: 1.0, label: 'mixed_jitter' }
    ]
  ): Candidate[] {
    const allCandidates: Candidate[] = [];
    const seen = new Set<string>(); // Deduplication by bitmask
    
    for (const strategy of strategies) {
      // Apply strategy-specific scoring
      const scoredPlayers = this.applyStrategy(players, strategy);
      
      // Run k-best DP
      const candidates = this.kBestDP(scoredPlayers);
      
      // Add unique candidates
      for (const candidate of candidates) {
        const key = candidate.bitmask.toString();
        if (!seen.has(key)) {
          seen.add(key);
          allCandidates.push(candidate);
        }
      }
      
      // Check global capacity
      if (allCandidates.length >= this.globalCapacity) {
        console.warn(`Global capacity ${this.globalCapacity} reached`);
        break;
      }
    }
    
    // Sort by expected score and return top candidates
    allCandidates.sort((a, b) => b.score - a.score);
    
    return allCandidates.slice(0, Math.min(this.K * 3, allCandidates.length));
  }
  
  /**
   * Apply scoring strategy to players
   */
  private applyStrategy(
    players: PlayerProjection[],
    strategy: {
      meanWeight: number;
      ceilingWeight: number;
      jitterStd: number;
    }
  ): Array<PlayerProjection & { dpScore: number; index: number }> {
    return players.map((p, index) => {
      const proj = p.projection;
      if (!proj) {
        return { ...p, dpScore: 0, index };
      }
      
      // Base score from weighted mean/ceiling
      const baseScore = strategy.meanWeight * proj.mean + 
                       strategy.ceilingWeight * proj.ceiling;
      
      // Add jitter if specified
      let jitter = 0;
      if (strategy.jitterStd > 0) {
        // Simple normal approximation via Box-Muller
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        jitter = z * strategy.jitterStd * Math.sqrt(proj.variance);
      }
      
      return {
        ...p,
        dpScore: baseScore + jitter,
        index
      };
    });
  }
  
  /**
   * Core k-best DP algorithm
   */
  private kBestDP(
    players: Array<PlayerProjection & { dpScore: number; index: number }>
  ): Candidate[] {
    // Sort by score for DP efficiency
    players.sort((a, b) => b.dpScore - a.dpScore);
    
    // Initialize DP table: state -> top K candidates
    const dp = new Map<string, Candidate[]>();
    
    // Initial state
    const initState: DPState = {
      QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DST: 0
    };
    
    dp.set(stateKey(initState), [{
      players: [],
      score: 0,
      bitmask: 0n,
      state: initState
    }]);
    
    // Track total states for complexity management
    let totalStates = 1;
    
    // Process each player
    for (const player of players) {
      const position = player.player.position;
      const newEntries: Array<[string, Candidate]> = [];
      
      // Consider adding this player to existing states
      for (const [key, candidates] of dp.entries()) {
        // Complexity check
        if (totalStates >= this.globalCapacity) {
          console.warn('Complexity cap reached in DP');
          break;
        }
        
        for (const candidate of candidates) {
          // Try adding as primary position
          const newStates = this.getNextStates(candidate, player);
          
          for (const newState of newStates) {
            if (this.isValidTransition(newState.state)) {
              const newKey = stateKey(newState.state);
              newEntries.push([newKey, newState]);
              totalStates++;
            }
          }
        }
      }
      
      // Merge new entries into DP table
      for (const [key, candidate] of newEntries) {
        if (!dp.has(key)) {
          dp.set(key, []);
        }
        
        const existing = dp.get(key)!;
        existing.push(candidate);
        
        // Keep only top K per state
        if (existing.length > this.K) {
          existing.sort((a, b) => b.score - a.score);
          dp.set(key, existing.slice(0, this.K));
        }
      }
    }
    
    // Extract complete lineups
    const completeCandidates: Candidate[] = [];
    
    for (const [key, candidates] of dp.entries()) {
      for (const candidate of candidates) {
        if (isComplete(candidate.state, this.requirements)) {
          completeCandidates.push(candidate);
        }
      }
    }
    
    // Sort and return top candidates
    completeCandidates.sort((a, b) => b.score - a.score);
    
    return completeCandidates.slice(0, this.K);
  }
  
  /**
   * Get possible next states when adding a player
   */
  private getNextStates(
    candidate: Candidate,
    player: PlayerProjection & { dpScore: number; index: number }
  ): Candidate[] {
    const results: Candidate[] = [];
    const pos = player.player.position;
    const playerBit = 1n << BigInt(player.index);
    
    // Check if player already in lineup
    if ((candidate.bitmask & playerBit) !== 0n) {
      return results;
    }
    
    // Try primary position
    if (this.canAddAtPosition(candidate.state, pos)) {
      const newState = { ...candidate.state };
      newState[pos as keyof DPState]++;
      
      results.push({
        players: [...candidate.players, player],
        score: candidate.score + player.dpScore,
        bitmask: candidate.bitmask | playerBit,
        state: newState
      });
    }
    
    // Try FLEX if eligible
    if (['RB', 'WR', 'TE'].includes(pos) && 
        this.canAddAtPosition(candidate.state, 'FLEX')) {
      const newState = { ...candidate.state };
      newState.FLEX++;
      
      results.push({
        players: [...candidate.players, player],
        score: candidate.score + player.dpScore,
        bitmask: candidate.bitmask | playerBit,
        state: newState
      });
    }
    
    return results;
  }
  
  /**
   * Check if we can add a player at position
   */
  private canAddAtPosition(state: DPState, position: string): boolean {
    const current = state[position as keyof DPState];
    const required = this.requirements[position as keyof LineupRequirements];
    
    // Special handling for FLEX
    if (position === 'FLEX') {
      // FLEX can have RB/WR/TE, check total
      const flexUsed = Math.max(0, 
        (state.RB - this.requirements.RB) +
        (state.WR - this.requirements.WR) +
        (state.TE - this.requirements.TE)
      );
      return state.FLEX + flexUsed < this.requirements.FLEX;
    }
    
    return current < required;
  }
  
  /**
   * Check if state transition is valid
   */
  private isValidTransition(state: DPState): boolean {
    // Don't exceed requirements
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const) {
      if (state[pos] > this.requirements[pos]) {
        return false;
      }
    }
    
    // FLEX constraint
    const flexFromOthers = Math.max(0,
      (state.RB - this.requirements.RB) +
      (state.WR - this.requirements.WR) +
      (state.TE - this.requirements.TE)
    );
    
    if (state.FLEX + flexFromOthers > this.requirements.FLEX) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Position-aware diversity enhancement
   */
  enhancePositionalDiversity(
    candidates: Candidate[],
    targetDiversity: number = 0.3
  ): Candidate[] {
    const enhanced: Candidate[] = [];
    const positionCounts = new Map<string, Map<string, number>>();
    
    // Initialize position tracking
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DST']) {
      positionCounts.set(pos, new Map());
    }
    
    for (const candidate of candidates) {
      // Calculate diversity score
      let diversityScore = 0;
      let totalPlayers = 0;
      
      for (const player of candidate.players) {
        const pos = player.player.position;
        const name = player.player.name;
        
        const posMap = positionCounts.get(pos)!;
        const count = posMap.get(name) || 0;
        
        // Penalize overused players
        diversityScore += 1 / (1 + count);
        totalPlayers++;
        
        // Update count
        posMap.set(name, count + 1);
      }
      
      diversityScore /= totalPlayers;
      
      // Accept candidate based on diversity
      if (diversityScore >= targetDiversity || Math.random() < diversityScore) {
        enhanced.push(candidate);
      }
      
      if (enhanced.length >= this.K) {
        break;
      }
    }
    
    return enhanced;
  }
}