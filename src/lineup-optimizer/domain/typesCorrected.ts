/**
 * ESPN 2025-2026 Fantasy Football Domain Types
 * Corrected for ESPN 12-team PPR with proper roster requirements
 */

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';

export interface PlayerInfo {
  id: string;
  name: string;
  team: string;
  position: Position;
  status: 'HEALTHY' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'GTD' | 'IR';
}

export interface GameInfo {
  gameId: string;
  kickoffTimeUTC: string; // ISO 8601 UTC only
  homeTeam: string;
  awayTeam: string;
}

export interface PlayerProjection {
  player: PlayerInfo;
  game: GameInfo;
  tn: import('../stats/truncatedNormalCorrected').TruncatedNormal;
  mean: number;
  sd: number;
  lower: number;
  upper: number;
}

export interface LineupRequirements { 
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  K: number;
  DST: number;
}

// ESPN 2025-2026 PPR Default: WR=2 (not 3!)
export const ESPN_PPR_2025: LineupRequirements = {
  QB: 1,
  RB: 2,
  WR: 2,  // ESPN default is 2 WR, not 3
  TE: 1,
  FLEX: 1,
  K: 1,
  DST: 1
};

export interface DPState { 
  q: number; // QB count
  r: number; // RB count
  w: number; // WR count
  t: number; // TE count
  f: number; // FLEX count
  k: number; // K count
  d: number; // DST count
}

export interface Candidate { 
  bitmask: bigint; 
  players: PlayerProjection[]; 
  value: number; 
  state: DPState; 
}

export interface OpponentProjection {
  mean: number;
  variance: number;
  sample: () => number;
  starters?: PlayerProjection[]; // For joint simulation
}

export interface OptimizedLineup {
  starters: PlayerProjection[];
  bench: PlayerProjection[];
  winProbability: number;
  expectedMargin: number;
  marginStdDev: number;
  percentiles: { 
    p5: number; 
    p25: number; 
    p50: number; 
    p75: number; 
    p95: number 
  };
  diagnostics: {
    analyticWinProb: number;
    lineupMean: number;
    lineupVar: number;
    oppMean: number;
    oppVar: number;
    sims: number;
    mcStdErr: number;
    candidatesEvaluated: number;
  };
}