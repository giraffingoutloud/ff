/**
 * Value calculation utilities
 * Provides consistent value/bid calculations across the app
 * Uses calibrated auction values based on expert consensus
 */

import { Player } from '../types';
import { dynamicCVSCalculator } from '../services/dynamicCVSCalculator';
import auctionValues from '../config/auction_values.json';

/**
 * Get the recommended bid value for a player
 * Uses calibrated auction values based on:
 * - Expert consensus from FantasyPros, ESPN, Yahoo, RotoWire
 * - 12-team PPR league with $200 budget
 * - Position scarcity and replacement levels
 */
export function getPlayerValue(player: Player): number {
  // Only return real auction values from CSV
  // If no auction value, return 0 (UI should display as "N/A")
  if (player.auctionValue && player.auctionValue > 0) {
    return player.auctionValue;
  }
  
  // No auction value in our data - return 0
  // The UI should check for 0 and display "N/A" or "--"
  return 0;
}

/**
 * Calculate auction value from CVS score
 * Based on verified auction strategies
 */
function calculateValueFromCVS(player: Player): number {
  const cvs = player.cvsScore || 50;
  const budget = 200;
  
  let baseValue = 0;
  
  // Elite tier (CVS 85+): $30-55
  if (cvs >= 85) {
    const cvsRange = 100 - 85;
    const dollarRange = 55 - 30;
    const cvsDiff = cvs - 85;
    baseValue = 30 + (cvsDiff / cvsRange) * dollarRange;
  }
  // Tier 1 (CVS 70-84): $15-30
  else if (cvs >= 70) {
    const cvsRange = 84 - 70;
    const dollarRange = 30 - 15;
    const cvsDiff = cvs - 70;
    baseValue = 15 + (cvsDiff / cvsRange) * dollarRange;
  }
  // Tier 2 (CVS 55-69): $8-15
  else if (cvs >= 55) {
    const cvsRange = 69 - 55;
    const dollarRange = 15 - 8;
    const cvsDiff = cvs - 55;
    baseValue = 8 + (cvsDiff / cvsRange) * dollarRange;
  }
  // Tier 3 (CVS 40-54): $3-8
  else if (cvs >= 40) {
    const cvsRange = 54 - 40;
    const dollarRange = 8 - 3;
    const cvsDiff = cvs - 40;
    baseValue = 3 + (cvsDiff / cvsRange) * dollarRange;
  }
  // Tier 4 (CVS 25-39): $1-3
  else if (cvs >= 25) {
    const cvsRange = 39 - 25;
    const dollarRange = 3 - 1;
    const cvsDiff = cvs - 25;
    baseValue = 1 + (cvsDiff / cvsRange) * dollarRange;
  }
  // Tier 5 (CVS <25): $1
  else {
    baseValue = 1;
  }
  
  // Apply position adjustments
  baseValue = applyPositionAdjustments(player, baseValue);
  
  // Round and constrain
  baseValue = Math.round(baseValue);
  baseValue = Math.max(1, baseValue);
  baseValue = Math.min(60, baseValue); // Cap at 30% of budget
  
  return baseValue;
}

/**
 * Apply position-specific value adjustments
 * Based on expert consensus and statistical thresholds
 */
function applyPositionAdjustments(player: Player, value: number): number {
  if (player.position === 'QB') {
    // QBs generally overvalued - cap at $25 unless elite dual-threat
    // Elite = top 3 by projected points AND rushing capability
    const isEliteDualThreat = player.projectedPoints >= 370 && player.adp <= 40;
    if (!isEliteDualThreat) {
      value = Math.min(25, value * 0.85);
    }
  }
  
  if (player.position === 'RB') {
    // RBs get premium due to scarcity
    if (player.adp <= 24) {
      value *= 1.1;
    }
  }
  
  if (player.position === 'TE') {
    // Only elite TEs worth paying for
    // Elite = top 4 by projected points OR ADP < 50
    const isEliteTE = player.projectedPoints >= 180 || player.adp < 50;
    if (!isEliteTE) {
      value = Math.min(12, value * 0.7);
    }
  }
  
  if (player.position === 'K') {
    // Never pay more than $1-2 for kicker
    value = Math.min(2, value);
  }
  
  return value;
}

/**
 * Get a bid range for a player (min-max)
 */
export function getBidRange(player: Player): { min: number; max: number } {
  const value = getPlayerValue(player);
  return {
    min: Math.max(1, Math.round(value * 0.85)), // 15% below recommended
    max: Math.round(value * 1.15) // 15% above recommended
  };
}

/**
 * Format value for display
 */
export function formatValue(value: number): string {
  return `$${value}`;
}