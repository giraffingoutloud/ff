/**
 * Data types for canonical data ingestion
 */

export interface QBStrengthOfSchedule {
  ovr: number;
  name: string;
  team: string;
  weeks: Map<number, number | null>;  // Week number -> difficulty ranking (1-32 scale, lower is harder)
}

export interface TeamPowerRating {
  team: string;
  pointSpreadRating: number;
  qbRating: number;
  sosToDate: number | null;
  sosRemaining: number;
  projectedWins: number;
  playoffProb: number;
  divisionProb: number;
  confChampProb: number;
  superBowlProb: number;
}

export interface HistoricalStats {
  player: string;
  team: string;
  position: string;
  games: number;
  fantasyPoints: number;
  passYds?: number;
  passTd?: number;
  passInt?: number;
  rushYds?: number;
  rushTd?: number;
  recYds?: number;
  recTd?: number;
  receptions?: number;
  targets?: number;
  // DST specific
  sacks?: number;
  interceptions?: number;
  fumbles?: number;
  tds?: number;
  safeties?: number;
  pointsAllowed?: number;
}

export interface ADPData {
  rank: number;
  player: string;
  position: string;
  team: string;
  adp: number;
  bestPick: number;
  worstPick: number;
  rosteredPct: number;
}

export interface OffenseProjection {
  rank: number;
  playerName: string;
  teamName: string;
  position: string;
  byeWeek: number;
  games: number;
  fantasyPoints: number;
  auctionValue: number;
  // Passing
  passComp: number;
  passAtt: number;
  passYds: number;
  passTd: number;
  passInt: number;
  // Rushing
  rushAtt: number;
  rushYds: number;
  rushTd: number;
  // Receiving
  recvTargets: number;
  recvReceptions: number;
  recvYds: number;
  recvTd: number;
  // Misc
  fumbles: number;
  fumblesLost: number;
  twoPt: number;
}

export interface KickerProjection {
  rank: number;
  playerName: string;
  teamName: string;
  byeWeek: number;
  games: number;
  fantasyPoints: number;
  fgMade: number;
  fgAtt: number;
  fgPct: number;
  patMade: number;
  patAtt: number;
}

export interface DSTProjection {
  teamName: string;
  byeWeek: number;
  games: number;
  fantasyPoints: number;
  sacks: number;
  interceptions: number;
  fumRecoveries: number;
  touchdowns: number;
  safeties: number;
  pointsAllowed: number;
  yardsAllowed: number;
}

export interface PlayerContext {
  teamPower: number;       // Team's power rating
  qbPower: number;         // QB's power rating (for pass catchers)
  sosWeekly: number | null; // This week's SOS difficulty
  sosSeason: number;       // Season average SOS
  historicalMean: number;  // Historical fantasy points per game
  historicalGames: number; // Games played in historical data
  projectedPoints: number; // Raw projection
  marketAdp: number;       // Market consensus ADP
  marketUncertainty: number; // Std dev derived from ADP range
}

export interface CanonicalPlayer {
  id: string;
  name: string;
  team: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';
  byeWeek: number;
  projection: OffenseProjection | KickerProjection | DSTProjection;
  historical2024?: HistoricalStats;
  historical2023?: HistoricalStats;
  adp?: ADPData;
  context?: PlayerContext;
}