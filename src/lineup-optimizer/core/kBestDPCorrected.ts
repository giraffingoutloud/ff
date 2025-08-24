/**
 * Corrected K-Best Dynamic Programming
 * Proper FLEX state tracking and diversity mechanisms
 */

import { PlayerProjection, DPState, Candidate, Position, LineupRequirements, ESPN_PPR_2025 } from '../domain/typesCorrected';

export class KBestDP {
  constructor(
    private K: number = 50, 
    private maxGlobal: number = 4000
  ) {}

  private initial(): DPState { 
    return { q: 0, r: 0, w: 0, t: 0, f: 0, k: 0, d: 0 }; 
  }
  
  private encode(s: DPState): string { 
    return `${s.q},${s.r},${s.w},${s.t},${s.f},${s.k},${s.d}`; 
  }
  
  /**
   * Check if state is terminal (valid complete lineup)
   */
  private isTerminal(s: DPState, reqs: LineupRequirements): boolean {
    return s.q === reqs.QB && s.r === reqs.RB && s.w === reqs.WR && 
           s.t === reqs.TE && s.f === reqs.FLEX && s.k === reqs.K && s.d === reqs.DST;
  }
  
  /**
   * Can add player to primary position slot?
   */
  private canAddPrimary(s: DPState, pos: Position, reqs: LineupRequirements): boolean {
    switch (pos) {
      case 'QB': return s.q < reqs.QB;
      case 'RB': return s.r < reqs.RB;
      case 'WR': return s.w < reqs.WR;
      case 'TE': return s.t < reqs.TE;
      case 'K':  return s.k < reqs.K;
      case 'DST': return s.d < reqs.DST;
    }
  }
  
  /**
   * Can add player to FLEX slot?
   */
  private canAddFlex(s: DPState, pos: Position, reqs: LineupRequirements): boolean {
    return (pos === 'RB' || pos === 'WR' || pos === 'TE') && (s.f < reqs.FLEX);
  }
  
  /**
   * Add player to primary position
   */
  private addPrimary(s: DPState, pos: Position): DPState {
    const n = { ...s };
    switch (pos) {
      case 'QB': n.q++; break; 
      case 'RB': n.r++; break; 
      case 'WR': n.w++; break;
      case 'TE': n.t++; break; 
      case 'K': n.k++; break; 
      case 'DST': n.d++; break;
    }
    return n;
  }
  
  /**
   * Add player to FLEX slot
   */
  private addFlex(s: DPState): DPState { 
    return { ...s, f: s.f + 1 }; 
  }
  
  /**
   * Sort and trim to K best
   */
  private sortTrim(arr: Candidate[]): Candidate[] { 
    arr.sort((a, b) => b.value - a.value); 
    if (arr.length > this.K) arr.length = this.K; 
    return arr; 
  }

  /**
   * Create player index map for bitmask tracking
   */
  private bitIndex(players: PlayerProjection[]): Map<string, number> {
    const m = new Map<string, number>();
    players.forEach((p, idx) => m.set(p.player.id, idx));
    return m;
  }
  
  /**
   * Hash player ID for deterministic jitter
   */
  private hashId(id: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < id.length; i++) { 
      h ^= id.charCodeAt(i); 
      h = Math.imul(h, 16777619); 
    }
    return (h >>> 0) / 2 ** 32;
  }

  /**
   * Core DP optimization with given value function
   */
  optimizeCandidates(
    roster: PlayerProjection[],
    reqs: LineupRequirements,
    valueFn: (p: PlayerProjection) => number
  ): Candidate[] {
    const idxMap = this.bitIndex(roster);
    const base = this.initial();
    const dp = new Map<string, Candidate[]>();
    dp.set(this.encode(base), [{ 
      bitmask: 0n, 
      players: [], 
      value: 0, 
      state: base 
    }]);

    // Process each player
    for (const player of roster) {
      const next = new Map<string, Candidate[]>();
      
      for (const [key, list] of dp.entries()) {
        for (const cand of list) {
          // Keep existing candidate
          if (!next.has(key)) next.set(key, []);
          next.get(key)!.push(cand);
          
          // Check if player already used
          const idx = idxMap.get(player.player.id)!;
          const used = ((cand.bitmask >> BigInt(idx)) & 1n) === 1n;
          if (used) continue;
          
          const pos = player.player.position;

          // Try adding to primary position
          if (this.canAddPrimary(cand.state, pos, reqs)) {
            const ns = this.addPrimary(cand.state, pos);
            const nkey = this.encode(ns);
            const nmask = cand.bitmask | (1n << BigInt(idx));
            const nval = cand.value + valueFn(player);
            const nplayers = [...cand.players, player];
            
            if (!next.has(nkey)) next.set(nkey, []);
            next.get(nkey)!.push({ 
              bitmask: nmask, 
              players: nplayers, 
              value: nval, 
              state: ns 
            });
          }
          
          // Try adding to FLEX
          if (this.canAddFlex(cand.state, pos, reqs)) {
            const ns = this.addFlex(cand.state);
            const nkey = this.encode(ns);
            const nmask = cand.bitmask | (1n << BigInt(idx));
            const nval = cand.value + valueFn(player);
            const nplayers = [...cand.players, player];
            
            if (!next.has(nkey)) next.set(nkey, []);
            next.get(nkey)!.push({ 
              bitmask: nmask, 
              players: nplayers, 
              value: nval, 
              state: ns 
            });
          }
        }
      }
      
      // Deduplicate and trim per state
      const merged = new Map<string, Candidate[]>();
      for (const [k, arr] of next.entries()) {
        const bestByMask = new Map<bigint, Candidate>();
        for (const c of arr) {
          const prev = bestByMask.get(c.bitmask);
          if (!prev || c.value > prev.value) {
            bestByMask.set(c.bitmask, c);
          }
        }
        merged.set(k, this.sortTrim(Array.from(bestByMask.values())));
      }
      
      dp.clear();
      for (const [k, arr] of merged.entries()) {
        dp.set(k, arr);
      }

      // Global capacity management
      const total = Array.from(dp.values()).reduce((s, a) => s + a.length, 0);
      if (total > this.maxGlobal) {
        const states = Array.from(dp.entries());
        states.sort((a, b) => 
          (b[1][0]?.value ?? -Infinity) - (a[1][0]?.value ?? -Infinity)
        );
        dp.clear();
        for (let i = 0; i < Math.min(states.length, Math.ceil(this.maxGlobal / this.K)); i++) {
          dp.set(states[i][0], states[i][1]);
        }
      }
    }

    // Extract terminal states
    const terminals: Candidate[] = [];
    for (const [k, arr] of dp.entries()) {
      const parts = k.split(',').map(Number);
      const s: DPState = { 
        q: parts[0], r: parts[1], w: parts[2], 
        t: parts[3], f: parts[4], k: parts[5], d: parts[6] 
      };
      if (this.isTerminal(s, reqs)) {
        terminals.push(...arr);
      }
    }
    
    // Final deduplication
    const bestByMask = new Map<bigint, Candidate>();
    for (const c of terminals) {
      const prev = bestByMask.get(c.bitmask);
      if (!prev || c.value > prev.value) {
        bestByMask.set(c.bitmask, c);
      }
    }
    
    const out = Array.from(bestByMask.values()).sort((a, b) => b.value - a.value);
    if (out.length > this.maxGlobal) out.length = this.maxGlobal;
    
    return out;
  }

  /**
   * Generate diverse candidates via multiple value functions
   */
  generateDiverseCandidates(
    roster: PlayerProjection[],
    reqs: LineupRequirements,
    underdogBias: number,
    lambdas: number[] = [-0.5, -0.25, 0, 0.25, 0.5]
  ): Candidate[] {
    const all = new Map<bigint, Candidate>();
    
    // Adjust lambdas based on underdog bias
    const adj = lambdas.map(x => x + 0.3 * underdogBias);
    
    for (const lambda of adj) {
      // Value function with mean/sd tradeoff and deterministic jitter
      const valueFn = (p: PlayerProjection) => 
        p.mean + lambda * p.sd + 1e-6 * this.hashId(p.player.id);
      
      const cands = this.optimizeCandidates(roster, reqs, valueFn);
      
      // Keep best per bitmask across all strategies
      for (const c of cands) {
        const prev = all.get(c.bitmask);
        if (!prev || c.value > prev.value) {
          all.set(c.bitmask, c);
        }
      }
    }
    
    return Array.from(all.values());
  }
}