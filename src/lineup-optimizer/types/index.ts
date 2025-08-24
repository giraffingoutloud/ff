// Core types for the lineup optimizer system

export interface Player {
  id: string;
  espnId?: string;
  sleeperId?: string;
  name: string;
  team: string;
  position: Position;
  positions: Position[]; // Multi-position eligibility
  injuryStatus?: InjuryStatus;
  byeWeek: number;
  isActive: boolean;
  status?: 'healthy' | 'questionable' | 'doubtful' | 'out' | 'ir';
  injuryDetails?: string;
  practiceParticipation?: 'FP' | 'LP' | 'DNP';
  projectedPoints?: number;
  salary?: number;
  ownership?: number;
}

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'FLEX';

export type InjuryStatus = 'HEALTHY' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'IR';

export interface GameInfo {
  gameId?: string;
  week?: number;
  season?: number;
  homeTeam: string;
  awayTeam: string;
  kickoffTimeUTC?: string;  // ISO string in UTC
  kickoffTime?: Date;       // Legacy compatibility
  gameTime?: Date;          // Legacy compatibility
  stadiumId?: string;
  spread: number;
  total: number;
  homeImpliedTotal?: number;
  awayImpliedTotal?: number;
  impliedPoints?: number;
  isPrimetime?: boolean;
  isDivisional?: boolean;
  opponent: string;
  isHome: boolean;
  oppDefenseRank?: number;
  oppPaceRank?: number;
}

export interface Projection {
  playerId?: string;
  week?: number;
  season?: number;
  // Distribution quantiles
  floor: number;      // 10th percentile
  q1: number;        // 25th percentile  
  median: number;    // 50th percentile
  q3: number;        // 75th percentile
  ceiling: number;   // 90th percentile
  // Distribution parameters
  mean: number;       // Mean of truncated normal
  variance: number;   // Variance in points²
  lowerBound: number; // Truncation lower bound
  upperBound: number; // Truncation upper bound
  originalMean: number; // Mean before truncation
  originalStdDev: number; // StdDev before truncation
  // Adjustments (in log space)
  baseLogProjection: number;
  matchupAdjustment: number;
  vegasAdjustment?: number;
  weatherAdjustment: number;
  usageAdjustment: number;
  injuryAdjustment: number;
  trendAdjustment?: number;
  components?: Record<string, number>;
  // Meta
  confidence: number; // 0-1
  dataQuality?: number; // 0-1
  modelVersion?: string;
  lastUpdated?: Date;
}

export interface UsageMetrics {
  playerId: string;
  week: number;
  season: number;
  snapPercent: number;
  routeParticipation: number;
  targetShare: number;
  airYardsShare: number;
  wopr: number; // Weighted Opportunity Rating
  redZoneTouches: number;
  carries: number;
  targets: number;
  yardsPerRouteRun?: number;
  aDOT?: number; // Average Depth of Target
}

export interface WeatherConditions {
  gameId: string;
  temperature: number;
  windSpeed: number; // Sustained, not gusts
  windGusts?: number;
  precipitation: number; // Probability 0-1
  precipitationAmount?: number; // Inches
  isDome: boolean;
  isRetractableClosed?: boolean;
  wetBulbTemp?: number;
  forecastConfidence: number;
  asOf: Date;
}

export interface PracticeReport {
  playerId: string;
  week: number;
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
  status: 'DNP' | 'LIMITED' | 'FULL';
  injuryDesignation?: string;
  isVeteranRest: boolean;
  gameDay: 'SUN' | 'MON' | 'THU' | 'SAT'; // For context
}

export interface PowerRanking {
  playerId: string;
  week: number;
  season: number;
  powerScore: number; // 0-100
  rankChange: number; // Week over week
  trend: 'rising' | 'falling' | 'stable';
  momentum: number; // EWMA-based
  breakoutProbability?: number;
}

export interface LineupRequirements {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number; // RB/WR/TE
  K: number;
  DST: number;
  BENCH: number;
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
    p95: number;
  };
  diagnostics?: {
    analyticWinProb: number;
    lineupMean: number;
    lineupVar: number;
    oppMean: number;
    oppVar: number;
    sims: number;
    strategy?: string;
    candidatesEvaluated?: number;
    validation?: {
      valid: boolean;
      errors: string[];
      warnings: string[];
    };
  };
}

export interface OpponentProjection {
  mean: number;
  variance: number;
  percentiles: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  sample: () => number;  // Sampling function
}

export interface CorrelationStructure {
  teams: Map<string, PlayerProjection[]>;
  correlationMatrix: number[][];
  teamShockVariances: Map<string, number>;
}

export interface PlayerProjection {
  player: Player;
  projection: Projection;
  opponent: string;
  isHome: boolean;
  gameInfo: GameInfo;
  weather?: WeatherConditions;
  practiceStatus?: PracticePattern;
}

export interface PracticePattern {
  pattern: string; // e.g., "DNP-DNP-LP"
  playProbability: number;
  expectedEfficiency: number;
  confidence: number;
}

export interface LineupReasoning {
  playerId: string;
  decision: 'start' | 'sit' | 'flex';
  reasons: string[];
  confidence: number;
  alternativeOptions?: Player[];
}

export interface MatchupAnalysis {
  defensiveRank: number;
  pointsAllowedToPosition: number;
  expectedPlays: number;
  passRate: number;
  historicalPerformance?: number;
  specificAdvantages: string[];
  logAdjustment: number; // Final adjustment in log space
}

export interface VegasImpact {
  impliedTotal: number;
  gameScript: 'highScoring' | 'blowout' | 'shootout' | 'defensive' | 'normal';
  positionAdjustments: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    K: number;
    DST: number;
  };
}

export interface CorrelationMatrix {
  players: string[]; // Player IDs
  matrix: number[][]; // Correlation coefficients
  gameContext: 'normal' | 'shootout' | 'blowout';
}

export interface SimulationResult {
  lineup: OptimizedLineup;
  iterations: number;
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  winProbability: number;
  bustProbability: number; // Below threshold
  boomProbability: number; // Above threshold
}

export interface BacktestResult {
  week: number;
  season: number;
  projectedPoints: number;
  actualPoints: number;
  mae: number;
  percentileActual: number; // Where actual fell in distribution
  decisions: {
    correct: number;
    incorrect: number;
    accuracy: number;
  };
}

export interface DataQualityMetrics {
  completeness: number; // 0-1
  recency: number; // 0-1
  consistency: number; // 0-1
  overall: number; // 0-1
  missingFields: string[];
  staleData: string[];
}