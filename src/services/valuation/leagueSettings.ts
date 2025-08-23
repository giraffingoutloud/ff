/**
 * League Settings Configuration
 * Defines league structure for dynamic value calculation
 */

import { Position } from '../../types';

export interface RosterRequirements {
  QB: { min: number; max: number };
  RB: { min: number; max: number };
  WR: { min: number; max: number };
  TE: { min: number; max: number };
  K: { min: number; max: number };
  DST: { min: number; max: number };
  FLEX?: { positions: Position[]; count: number };
  SUPERFLEX?: { positions: Position[]; count: number };
  benchSpots: number;
}

export interface ScoringSettings {
  passingTD: number;
  passingYards: number; // points per yard
  passingInt: number;
  rushingTD: number;
  rushingYards: number;
  receivingTD: number;
  receivingYards: number;
  receptions: number; // PPR value: 0, 0.5, or 1
  interceptions: number;
  fumbles: number;
  twoPointConversion: number;
}

export interface LeagueSettings {
  // League structure
  numTeams: number;
  budget: number;
  rosterSize: number;
  
  // Roster requirements
  rosterRequirements: RosterRequirements;
  
  // Scoring system
  scoring: ScoringSettings;
  
  // League type flags
  isDynasty: boolean;
  isSuperFlex: boolean;
  isTEPremium: boolean;
  isAuction: boolean;
}

// Default settings for standard 12-team PPR auction league
export const defaultLeagueSettings: LeagueSettings = {
  numTeams: 12,
  budget: 200,
  rosterSize: 16,
  
  rosterRequirements: {
    QB: { min: 1, max: 3 },
    RB: { min: 2, max: 6 },
    WR: { min: 2, max: 6 },
    TE: { min: 1, max: 3 },
    K: { min: 1, max: 2 },
    DST: { min: 1, max: 2 },
    FLEX: { positions: ['RB', 'WR', 'TE'], count: 1 },
    benchSpots: 7  // CORRECTED: 7 bench spots for 16 total roster
  },
  
  scoring: {
    passingTD: 4,
    passingYards: 0.04, // 1 point per 25 yards
    passingInt: -2,
    rushingTD: 6,
    rushingYards: 0.1,  // 1 point per 10 yards
    receivingTD: 6,
    receivingYards: 0.1,
    receptions: 1,      // Full PPR
    interceptions: -2,
    fumbles: -2,
    twoPointConversion: 2
  },
  
  isDynasty: false,
  isSuperFlex: false,
  isTEPremium: false,
  isAuction: true
};

// Preset configurations
export const leaguePresets = {
  standard: defaultLeagueSettings,
  
  halfPPR: {
    ...defaultLeagueSettings,
    scoring: {
      ...defaultLeagueSettings.scoring,
      receptions: 0.5
    }
  },
  
  superFlex: {
    ...defaultLeagueSettings,
    isSuperFlex: true,
    rosterRequirements: {
      ...defaultLeagueSettings.rosterRequirements,
      QB: { min: 2, max: 4 },
      SUPERFLEX: { positions: ['QB', 'RB', 'WR', 'TE'], count: 1 }
    }
  },
  
  tePremium: {
    ...defaultLeagueSettings,
    isTEPremium: true,
    scoring: {
      ...defaultLeagueSettings.scoring,
      receptions: 1.5 // TEs get 1.5 PPR
    }
  },
  
  dynasty: {
    ...defaultLeagueSettings,
    isDynasty: true,
    rosterSize: 25, // Larger rosters for dynasty
    rosterRequirements: {
      ...defaultLeagueSettings.rosterRequirements,
      benchSpots: 15
    }
  }
};

/**
 * Calculate total roster spots needed for a position across the league
 */
export function calculatePositionDemand(
  position: Position,
  settings: LeagueSettings
): number {
  const requirements = settings.rosterRequirements;
  let demand = requirements[position].min * settings.numTeams;
  
  // Add flex demand
  if (requirements.FLEX && requirements.FLEX.positions.includes(position)) {
    // Assume flex spots are distributed proportionally
    const flexPositions = requirements.FLEX.positions.length;
    demand += (requirements.FLEX.count * settings.numTeams) / flexPositions;
  }
  
  // Add superflex demand for QBs
  if (settings.isSuperFlex && position === 'QB' && requirements.SUPERFLEX) {
    demand += requirements.SUPERFLEX.count * settings.numTeams * 0.5; // Assume 50% of superflex are QBs
  }
  
  // Add bench consideration (roughly 30% of bench for skill positions)
  if (['RB', 'WR', 'TE', 'QB'].includes(position)) {
    demand += settings.numTeams * requirements.benchSpots * 0.15;
  }
  
  return Math.round(demand);
}

/**
 * Check if current settings differ significantly from defaults
 */
export function isNonStandardLeague(settings: LeagueSettings): boolean {
  return (
    settings.numTeams !== 12 ||
    settings.budget !== 200 ||
    settings.isSuperFlex ||
    settings.isTEPremium ||
    settings.scoring.receptions !== 1
  );
}

/**
 * Get a descriptive name for the league format
 */
export function getLeagueFormatName(settings: LeagueSettings): string {
  const parts: string[] = [];
  
  parts.push(`${settings.numTeams}-team`);
  
  if (settings.scoring.receptions === 1) {
    parts.push('PPR');
  } else if (settings.scoring.receptions === 0.5) {
    parts.push('Half-PPR');
  } else if (settings.scoring.receptions === 0) {
    parts.push('Standard');
  }
  
  if (settings.isSuperFlex) {
    parts.push('SuperFlex');
  }
  
  if (settings.isTEPremium) {
    parts.push('TE-Premium');
  }
  
  if (settings.isDynasty) {
    parts.push('Dynasty');
  }
  
  if (settings.isAuction) {
    parts.push('Auction');
  }
  
  return parts.join(' ');
}