/**
 * K-best Dynamic Programming with diversity sweeps
 * Maintains top K candidates per state with deduplication
 */
import { PlayerProjection, Position } from '../types';

export interface DPState {
  q: number;  // QB count [0,1]
  r: number;  // RB count [0,2]
  w: number;  // WR count [0,3]
  t: number;  // TE count [0,1]
  f: number;  // FLEX count [0,1]
  k: number;  // K count [0,1]
  d: number;  // DST count [0,1]
}

export interface Candidate {
  bitmask: bigint;              // Bitmask of selected players
  players: PlayerProjection[];  // Selected players
  value: number;                // DP value (scalarized objective)
  state: DPState;               // Current state
}

export interface LineupRequirements {
  QB: 1;
  RB: 2;
  WR: 3;
  TE: 1;
  FLEX: 1;
  K: 1;
  DST: 1;
}

export class KBestDP {
  constructor(private K: number = 50) {}
  
  /**
   * Encode state as string key
   */
  private encodeState(s: DPState): string {
    return `${s.q},${s.r},${s.w},${s.t},${s.f},${s.k},${s.d}`;
  }
  
  /**
   * Initial empty state
   */
  private initialState(): DPState {
    return { q: 0, r: 0, w: 0, t: 0, f: 0, k: 0, d: 0 };
  }
  
  /**
   * Check if state is terminal (complete lineup)
   */
  private isTerminal(s: DPState): boolean {
    return s.q === 1 && s.r === 2 && s.w === 3 && 
           s.t === 1 && s.f === 1 && s.k === 1 && s.d === 1;
  }
  
  /**
   * Check if can add player to primary position
   */
  private canAddPrimary(state: DPState, pos: Position): boolean {
    switch (pos) {
      case 'QB': return state.q < 1;
      case 'RB': return state.r < 2;
      case 'WR': return state.w < 3;
      case 'TE': return state.t < 1;
      case 'K':  return state.k < 1;
      case 'DST': return state.d < 1;
      default: return false;
    }
  }
  
  /**
   * Check if can add player to FLEX
   */
  private canAddFlex(state: DPState, pos: Position): boolean {
    return (pos === 'RB' || pos === 'WR' || pos === 'TE') && state.f < 1;
  }
  
  /**
   * Add player to primary position
   */
  private addPrimary(state: DPState, pos: Position): DPState {
    const s = { ...state };
    switch (pos) {
      case 'QB': s.q++; break;
      case 'RB': s.r++; break;
      case 'WR': s.w++; break;
      case 'TE': s.t++; break;
      case 'K': s.k++; break;
      case 'DST': s.d++; break;
    }
    return s;
  }
  
  /**
   * Add player to FLEX
   */
  private addFlex(state: DPState): DPState {
    return { ...state, f: state.f + 1 };
  }
  
  /**
   * Sort and trim candidates to top K
   */
  private sortAndTrim(arr: Candidate[]): Candidate[] {
    arr.sort((a, b) => b.value - a.value);
    if (arr.length > this.K) {
      arr.length = this.K;
    }
    return arr;
  }
  
  /**
   * Map player IDs to bit indices
   */
  private computeBitIndices(players: PlayerProjection[]): Map<string, number> {
    const map = new Map<string, number>();
    players.forEach((p, idx) => map.set(p.player.id, idx));
    return map;
  }
  
  /**
   * Run k-best DP with given value function
   */
  optimizeCandidates(
    roster: PlayerProjection[],
    valueFn: (p: PlayerProjection) => number
  ): Candidate[] {
    const idxMap = this.computeBitIndices(roster);
    const initState = this.initialState();
    
    // Initialize DP table
    const dp = new Map<string, Candidate[]>();
    dp.set(this.encodeState(initState), [{
      bitmask: 0n,
      players: [],
      value: 0,
      state: initState
    }]);
    
    // Process each player
    for (const player of roster) {
      const next = new Map<string, Candidate[]>();
      
      // For each existing state and candidate
      for (const [key, list] of dp.entries()) {
        for (const cand of list) {
          // Option 1: Skip this player
          if (!next.has(key)) {
            next.set(key, []);
          }
          next.get(key)!.push(cand);
          
          // Check if player already selected
          const idx = idxMap.get(player.player.id)!;
          if (((cand.bitmask >> BigInt(idx)) & 1n) === 1n) {
            continue; // Player already in lineup
          }
          
          // Option 2: Add to primary position
          if (this.canAddPrimary(cand.state, player.player.position)) {
            const ns = this.addPrimary(cand.state, player.player.position);
            const nkey = this.encodeState(ns);
            const nmask = cand.bitmask | (1n << BigInt(idx));
            const nvalue = cand.value + valueFn(player);
            const nplayers = [...cand.players, player];
            
            if (!next.has(nkey)) {
              next.set(nkey, []);
            }
            next.get(nkey)!.push({
              bitmask: nmask,
              players: nplayers,
              value: nvalue,
              state: ns
            });
          }
          
          // Option 3: Add to FLEX (if eligible)
          if (this.canAddFlex(cand.state, player.player.position)) {
            const ns = this.addFlex(cand.state);
            const nkey = this.encodeState(ns);
            const nmask = cand.bitmask | (1n << BigInt(idx));
            const nvalue = cand.value + valueFn(player);
            const nplayers = [...cand.players, player];
            
            if (!next.has(nkey)) {
              next.set(nkey, []);
            }
            next.get(nkey)!.push({
              bitmask: nmask,
              players: nplayers,
              value: nvalue,
              state: ns
            });
          }
        }
      }
      
      // Deduplicate and trim to K per state
      const merged = new Map<string, Candidate[]>();
      
      for (const [k, arr] of next.entries()) {
        // Deduplicate by bitmask within state
        const bestByMask = new Map<bigint, Candidate>();
        for (const c of arr) {
          const prev = bestByMask.get(c.bitmask);
          if (!prev || c.value > prev.value) {
            bestByMask.set(c.bitmask, c);
          }
        }
        
        // Sort and trim to K
        const uniq = Array.from(bestByMask.values());
        merged.set(k, this.sortAndTrim(uniq));
      }
      
      // Update DP table
      dp.clear();
      for (const [k, arr] of merged.entries()) {
        dp.set(k, arr);
      }
    }
    
    // Collect terminal candidates
    const terminals: Candidate[] = [];
    for (const [k, arr] of dp.entries()) {
      const parts = k.split(',').map(Number);
      const s: DPState = {
        q: parts[0], r: parts[1], w: parts[2],
        t: parts[3], f: parts[4], k: parts[5], d: parts[6]
      };
      
      if (this.isTerminal(s)) {
        terminals.push(...arr);
      }
    }
    
    // Global deduplication by bitmask
    const bestByMask = new Map<bigint, Candidate>();
    for (const c of terminals) {
      const prev = bestByMask.get(c.bitmask);
      if (!prev || c.value > prev.value) {
        bestByMask.set(c.bitmask, c);
      }
    }
    
    // Return top K globally
    return Array.from(bestByMask.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, this.K);
  }
  
  /**
   * Generate diverse candidates via objective sweeps
   */
  generateDiverseCandidates(
    roster: PlayerProjection[],
    underdogBias: number = 0
  ): Candidate[] {
    // Generate value functions for diversity
    // underdogBias: -1 = heavy favorite, 0 = even, +1 = heavy underdog
    const lambdas = [-0.5, -0.25, 0, 0.25, 0.5].map(x => x + 0.3 * underdogBias);
    
    const allCandidates: Candidate[] = [];
    const byMask = new Map<bigint, Candidate>();
    
    for (const lambda of lambdas) {
      // Value function: mean + lambda * sd
      const valueFn = (p: PlayerProjection) => {
        const mean = p.projection?.mean || p.projection?.median || 0;
        const sd = p.projection ? Math.sqrt(p.projection.variance || 0) : 5;
        return mean + lambda * sd;
      };
      
      const candidates = this.optimizeCandidates(roster, valueFn);
      
      // Merge, keeping best value per bitmask
      for (const c of candidates) {
        const prev = byMask.get(c.bitmask);
        if (!prev || c.value > prev.value) {
          byMask.set(c.bitmask, c);
        }
      }
    }
    
    return Array.from(byMask.values());
  }
}