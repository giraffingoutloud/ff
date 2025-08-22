export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  age: number;
  experience: number;
  byeWeek: number;
  bye?: number; // Alias for byeWeek for compatibility
  adp: number; // Average Draft Position
  auctionValue?: number; // Auction draft dollar value
  projectedPoints: number;
  cvsScore: number; // Composite Value Score
  injuryStatus?: 'Healthy' | 'Questionable' | 'Doubtful' | 'Out' | 'IR' | 'PUP' | 'Suspended';
  injuryNotes?: string;
  news?: PlayerNews[];
  trending?: number; // Trending score from live data
  // PPR-specific stats (optional to maintain compatibility)
  rushAttempts?: number;
  rushYards?: number;
  rushTDs?: number;
  targets?: number;
  receptions?: number;
  receivingYards?: number;
  receivingTDs?: number;
  // Additional calculated fields
  pprValue?: number;
  targetShare?: number;
  catchRate?: number;
  // Data quality indicators
  isRookie?: boolean;
  dataStatus?: 'Complete' | 'Partial Data' | 'Insufficient Data' | 'Unknown';
  // Strength of Schedule (1-10, 1=easiest, 10=hardest)
  sos?: number;
}

export interface PlayerNews {
  id?: number;
  playerId?: string;
  date: Date;
  source: string;
  headline: string;
  content?: string; // News content/details
  impact: 'positive' | 'neutral' | 'negative';
}

export interface CVSComponents {
  pps: number; // Projected Performance Score
  var: number; // Value Above Replacement
  con: number; // Consistency Score
  ups: number; // Upside Score
  sos: number; // Strength of Schedule
  trd: number; // Trend Score
  inj: number; // Injury Risk Discount
}

export interface PlayerEvaluation extends Player {
  cvsComponents: CVSComponents;
  recommendedBid: number;
  marketValue: number;
  isUndervalued: boolean;
  positionRank: number;
  overallRank: number;
}

export interface Team {
  id: string;
  name: string;
  owner: string;
  budget: number;
  spentBudget: number;
  roster: DraftedPlayer[];
  needs: Position[];
}

export interface DraftedPlayer extends Player {
  purchasePrice: number;
  purchasedBy: string;
  draftPosition: number;
  timestamp: Date;
}

export interface RosterSlot {
  position: 'QB' | 'RB1' | 'RB2' | 'WR1' | 'WR2' | 'WR3' | 'TE' | 'FLEX' | 'K' | 'DST' | 'BENCH';
  player?: DraftedPlayer;
  isRequired: boolean;
}

export interface DraftSettings {
  leagueSize: number;
  budget: number;
  rosterSize: number;
  scoringType: 'PPR' | 'HalfPPR' | 'Standard';
  flexPositions: Position[];
}

export interface Recommendation {
  player: PlayerEvaluation;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  maxBid: number;
  minBid: number;
}

// Enhanced evaluation types
export interface EnhancedPlayerEvaluation extends PlayerEvaluation {
  advancedMetrics?: Partial<AdvancedMetrics>;
  opportunityScore?: number;
  systemFitScore?: number;
  scheduleScore?: number;
  injuryRisk?: number;
  marketInefficiency?: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  keyInsights?: string[];
}

// Advanced metrics interface
export interface AdvancedMetrics {
  targetShare?: number;
  redZoneShare?: number;
  snapCount?: number;
  touchShare?: number;
  airYards?: number;
  yardsPerTouch?: number;
  catchRate?: number;
  yac?: number;
  breakawayRate?: number;
  offensiveLineRank?: number;
  teamPassRate?: number;
  expectedGameScript?: number;
  qbUpgrade?: boolean;
  coachingChange?: boolean;
  depthChartPosition?: number;
  rookieThreat?: boolean;
  veteranCompetition?: number;
  injuredStarter?: boolean;
  consistencyScore?: number;
  boomBustRatio?: number;
  priorYearFinish?: number;
  careerTrajectory?: 'rising' | 'stable' | 'declining';
}