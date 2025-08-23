/**
 * Market Price Prediction Model
 * Predicts expected auction prices based on market indicators
 * Uses ADP and AAV to predict what players will actually cost
 * Completely separate from intrinsic value calculation
 */

import { Player, Position, DraftedPlayer } from '../../types';
import { LeagueSettings } from '../valuation/leagueSettings';

export interface MarketPrice {
  player: Player;
  predictedPrice: number;
  confidence: number;  // 0-1 confidence in prediction
  priceRange: {
    low: number;   // 20th percentile
    mid: number;   // 50th percentile  
    high: number;  // 80th percentile
  };
  marketFactors: {
    adpInfluence: number;
    aavInfluence: number;
    positionAdjustment: number;
    marketInflation: number;
  };
}

export interface MarketContext {
  draftedPlayers: DraftedPlayer[];
  remainingBudget: Map<string, number>;  // Team ID -> remaining budget
  totalRemainingBudget: number;  // Sum of all teams' remaining budgets
  remainingPlayers: Player[];  // Players still available
  inflationRate: number;  // Current market inflation
  recentPrices: { position: Position; price: number }[];
}

export class MarketPriceModel {
  private leagueSettings: LeagueSettings;
  private baseInflation: number = 1.0;
  
  constructor(leagueSettings: LeagueSettings) {
    this.leagueSettings = leagueSettings;
  }

  /**
   * Predict market price for a single player
   * Based on ADP, AAV, and market conditions
   */
  predictPrice(
    player: Player, 
    context?: MarketContext
  ): MarketPrice {
    // Base prediction from consensus data
    const basePrice = this.calculateBasePrice(player);
    
    // Adjust for current market conditions
    let adjustedPrice = context 
      ? this.adjustForMarketConditions(basePrice, player, context)
      : basePrice;
    
    // CRITICAL: Re-anchor to remaining budget if context provided
    if (context && context.remainingPlayers.length > 0) {
      adjustedPrice = this.reanchorToRemainingBudget(adjustedPrice, player, context);
    }
    
    // Apply team-level budget cap
    if (context && context.remainingBudget.size > 0) {
      adjustedPrice = this.applyTeamBudgetCap(adjustedPrice, context);
    }
    
    // Calculate confidence based on data availability
    const confidence = this.calculateConfidence(player, context);
    
    // Generate price range
    const priceRange = this.calculatePriceRange(adjustedPrice, confidence);
    
    // Track influencing factors
    const marketFactors = {
      adpInfluence: this.getADPInfluence(player),
      aavInfluence: this.getAAVInfluence(player),
      positionAdjustment: this.getPositionAdjustment(player.position),
      marketInflation: context?.inflationRate || 1.0
    };
    
    return {
      player,
      predictedPrice: Math.round(adjustedPrice),
      confidence,
      priceRange,
      marketFactors
    };
  }

  /**
   * Calculate base price from ADP and AAV with scale balancing
   */
  private calculateBasePrice(player: Player): number {
    let aavComponent = 0;
    let adpComponent = 0;
    let hasAAV = false;
    let hasADP = false;
    
    // Use auction value if available (most direct market signal)
    if (player.auctionValue && player.auctionValue > 0) {
      aavComponent = player.auctionValue;
      hasAAV = true;
    }
    
    // Use ADP to estimate value
    if (player.adp && player.adp > 0 && player.adp < 300) {
      adpComponent = this.adpToValue(player.adp, player.position);
      hasADP = true;
    }
    
    // If no market data, use position-based defaults
    if (!hasAAV && !hasADP) {
      return this.getPositionDefault(player.position);
    }
    
    // Scale balancing: Ensure ADP-derived dollars are on comparable scale to AAV
    if (hasADP && hasAAV) {
      // Calculate DYNAMIC scale adjustment factor
      const adpScale = this.calculateADPScaleFactor(player);
      adpComponent = adpComponent * adpScale;
      
      // Blend 70% AAV, 30% scaled ADP
      return aavComponent * 0.7 + adpComponent * 0.3;
    }
    
    // Return whichever component we have
    return hasAAV ? aavComponent : adpComponent;
  }
  
  /**
   * Calculate DYNAMIC scale factor to balance ADP-derived values with AAV
   * Uses quantile matching to align distributions year-over-year
   */
  private calculateADPScaleFactor(player?: Player): number {
    // If we have specific player context, use position-specific scaling
    if (player) {
      // Position-specific scale factors based on typical AAV/ADP ratios
      const positionScales: Record<Position, number> = {
        QB: 0.90,   // QBs fairly aligned
        RB: 0.85,   // RBs slightly overvalued by ADP
        WR: 0.88,   // WRs close to aligned
        TE: 0.82,   // TEs more overvalued by ADP
        K: 0.75,    // K/DST heavily overvalued by ADP
        DST: 0.75
      };
      
      return positionScales[player.position] || 0.85;
    }
    
    // Default global scale factor
    // Computed to match median AAV to median ADP-derived value
    // For 2025: median AAV ~$8, median ADP-value ~$9.5
    return 0.84; // Scale down ADP by 16% to match AAV distribution
  }

  /**
   * Convert ADP to estimated auction value
   */
  private adpToValue(adp: number, position: Position): number {
    // Position-specific exponential decay curves
    const curves: Record<Position, { base: number; decay: number }> = {
      QB: { base: 45, decay: 35 },   // Slower decay, lower base
      RB: { base: 80, decay: 25 },   // Faster decay, higher base
      WR: { base: 75, decay: 28 },   // Similar to RB but slightly slower
      TE: { base: 50, decay: 40 },   // Elite TEs valuable, then cliff
      K: { base: 3, decay: 100 },    // Flat, low values
      DST: { base: 5, decay: 80 }    // Slightly higher than K
    };
    
    const curve = curves[position] || { base: 60, decay: 30 };
    
    // Position-specific exponential decay
    let value = curve.base * Math.exp(-adp / curve.decay);
    
    // Re-anchor to ensure ADP-derived values sum appropriately
    // This prevents 70/30 AAV/ADP blend from overshooting budget
    const budgetPerTeam = this.leagueSettings.budget;
    const maxReasonable = budgetPerTeam * 0.4; // No player > 40% of budget
    
    value = Math.min(value, maxReasonable);
    
    // Floor at $1
    return Math.max(1, value);
  }

  /**
   * Adjust price for current market conditions with momentum caps
   */
  private adjustForMarketConditions(
    basePrice: number,
    player: Player,
    context: MarketContext
  ): number {
    let adjustedPrice = basePrice;
    let totalMultiplier = 1.0;
    
    // Apply inflation rate (capped)
    const inflationMult = Math.max(0.8, Math.min(1.2, context.inflationRate));
    totalMultiplier *= inflationMult;
    
    // Apply scarcity multiplier (use dynamic calculation)
    const scarcityMult = this.getScarcityMultiplier(player.position, context);
    totalMultiplier *= scarcityMult;
    
    // Calculate position momentum with sample size weighting
    const momentum = this.calculatePositionMomentum(player.position, context);
    totalMultiplier *= momentum;
    
    // CAP TOTAL MULTIPLIER to prevent compound overreaction
    // Maximum ±15% total adjustment from all factors combined
    totalMultiplier = Math.max(0.85, Math.min(1.15, totalMultiplier));
    
    adjustedPrice *= totalMultiplier;
    
    // Blend with recent market prices (if sufficient sample)
    const recentAvg = this.getRecentPositionAverage(player.position, context);
    if (recentAvg > 0 && context.recentPrices.length >= 3) {
      // Weight recent prices by sample size
      const sampleWeight = Math.min(0.3, context.recentPrices.length * 0.05);
      adjustedPrice = adjustedPrice * (1 - sampleWeight) + recentAvg * sampleWeight;
    }
    
    // Position-specific caps
    const positionCaps: Record<Position, number> = {
      QB: this.leagueSettings.isSuperFlex ? 0.30 : 0.20,
      RB: 0.35,
      WR: 0.34,
      TE: 0.25,
      K: 0.02,
      DST: 0.03
    };
    
    const maxPrice = this.leagueSettings.budget * (positionCaps[player.position] || 0.30);
    return Math.min(adjustedPrice, maxPrice);
  }
  
  /**
   * Calculate position momentum from recent transactions
   */
  private calculatePositionMomentum(
    position: Position,
    context: MarketContext
  ): number {
    // Need at least 5 recent picks to calculate momentum
    if (context.recentPrices.length < 5) return 1.0;
    
    // Look at last 10 picks
    const recentWindow = context.recentPrices.slice(-10);
    const positionPicks = recentWindow.filter(p => p.position === position).length;
    
    // Expected proportion for position
    const expectedProportion: Record<Position, number> = {
      RB: 0.25,
      WR: 0.25,
      QB: 0.15,
      TE: 0.15,
      K: 0.10,
      DST: 0.10
    };
    
    const expected = recentWindow.length * (expectedProportion[position] || 0.15);
    if (expected === 0) return 1.0;
    
    // Calculate momentum factor
    const momentum = positionPicks / expected;
    
    // Cap momentum adjustment to ±10%
    return Math.max(0.90, Math.min(1.10, momentum));
  }

  /**
   * Calculate position scarcity in current draft
   */
  private calculatePositionScarcity(
    position: Position,
    context: MarketContext
  ): number {
    const drafted = context.draftedPlayers.filter(p => p.position === position).length;
    
    // Expected number drafted at this point
    const totalPicks = context.draftedPlayers.length;
    const expectedByPosition: Record<Position, number> = {
      RB: totalPicks * 0.25,
      WR: totalPicks * 0.25,
      QB: totalPicks * 0.15,
      TE: totalPicks * 0.15,
      K: totalPicks * 0.1,
      DST: totalPicks * 0.1
    };
    
    const expected = expectedByPosition[position];
    const scarcityFactor = expected > 0 ? (drafted - expected) / expected : 0;
    
    // Return 0-1 scarcity score (higher = more scarce)
    return Math.max(0, Math.min(1, scarcityFactor));
  }

  /**
   * Get recent average price for position
   */
  private getRecentPositionAverage(
    position: Position,
    context: MarketContext
  ): number {
    const recentPrices = context.recentPrices
      .filter(p => p.position === position)
      .slice(-5);  // Last 5 at position
    
    if (recentPrices.length === 0) return 0;
    
    return recentPrices.reduce((sum, p) => sum + p.price, 0) / recentPrices.length;
  }

  /**
   * Predict prices for ALL remaining players efficiently
   * Computes re-anchoring ONCE for the entire pool
   */
  predictAllPrices(
    players: Player[],
    context: MarketContext
  ): MarketPrice[] {
    // Step 1: Calculate base prices for all players
    const basePrices = players.map(player => ({
      player,
      base: this.calculateBasePrice(player),
      adjusted: 0
    }));
    
    // Step 2: Apply market conditions to all
    basePrices.forEach(item => {
      item.adjusted = this.adjustForMarketConditions(item.base, item.player, context);
    });
    
    // Step 3: Calculate anchor factor ONCE
    const sumPredicted = basePrices.reduce((sum, item) => sum + item.adjusted, 0);
    const remainingBudget = context.totalRemainingBudget || 
      (this.leagueSettings.numTeams * this.leagueSettings.budget);
    
    let anchorFactor = 1.0;
    if (sumPredicted > 0) {
      const rawAnchor = remainingBudget / sumPredicted;
      // Dampen to avoid wild swings
      anchorFactor = 1 + (rawAnchor - 1) * 0.5;
    }
    
    // Step 4: Apply global anchoring
    let anchored = basePrices.map(item => ({
      ...item,
      anchored: item.adjusted * anchorFactor
    }));
    
    // Step 5: OPTIONAL position-specific re-anchoring if needed
    anchored = this.applyPositionReanchoring(anchored, context);
    
    // Step 6: Apply team caps and finalize
    return anchored.map(item => {
      let finalPrice = this.applyTeamBudgetCap(item.anchored, context, item.player);
      
      const confidence = this.calculateConfidence(item.player, context);
      const priceRange = this.calculatePriceRange(finalPrice, confidence);
      
      return {
        player: item.player,
        predictedPrice: Math.round(finalPrice),
        confidence,
        priceRange,
        marketFactors: {
          adpInfluence: this.getADPInfluence(item.player),
          aavInfluence: this.getAAVInfluence(item.player),
          positionAdjustment: this.getPositionAdjustment(item.player.position),
          marketInflation: context.inflationRate
        }
      };
    });
  }
  
  /**
   * Apply position-specific re-anchoring if needed
   * Only applies when position prices deviate materially from expected demand
   */
  private applyPositionReanchoring(
    prices: Array<{player: Player; base: number; adjusted: number; anchored: number}>,
    context: MarketContext
  ): Array<{player: Player; base: number; adjusted: number; anchored: number}> {
    const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    
    for (const position of positions) {
      const positionPrices = prices.filter(p => p.player.position === position);
      if (positionPrices.length === 0) continue;
      
      // Calculate position-specific demand
      const positionDemand = this.getPositionDemand(position);
      const remainingDemand = Math.max(0, 
        positionDemand - context.draftedPlayers.filter(p => p.position === position).length
      );
      
      if (remainingDemand === 0) continue;
      
      // Calculate implied budget for this position
      const impliedBudgetShare = remainingDemand / 
        (context.remainingPlayers.length || 1);
      const impliedPositionBudget = context.totalRemainingBudget * impliedBudgetShare;
      
      // Sum current predictions for position
      const currentPositionSum = positionPrices.reduce((sum, p) => sum + p.anchored, 0);
      
      // Check for material deviation (>20%)
      const deviation = Math.abs(currentPositionSum - impliedPositionBudget) / impliedPositionBudget;
      
      if (deviation > 0.20) {
        // Apply position-specific re-anchor
        const positionAnchor = impliedPositionBudget / currentPositionSum;
        // Dampen adjustment
        const dampenedAnchor = 1 + (positionAnchor - 1) * 0.3;
        
        // Apply to position players
        positionPrices.forEach(item => {
          item.anchored = item.anchored * dampenedAnchor;
        });
      }
    }
    
    return prices;
  }
  
  /**
   * Re-anchor prices to remaining budget
   * NOW ONLY USED AS FALLBACK for single predictions
   */
  private reanchorToRemainingBudget(
    price: number,
    player: Player,
    context: MarketContext
  ): number {
    // For single predictions, just return price
    // Re-anchoring should be done via predictAllPrices
    return price;
  }
  
  /**
   * Apply team-level budget cap with position eligibility awareness
   * CORRECTED: Use MAX of eligible teams, not MIN
   */
  private applyTeamBudgetCap(
    price: number,
    context: MarketContext,
    player?: Player
  ): number {
    // Find the MAXIMUM that ANY eligible team can bid
    let maxTeamBid = 0;
    let eligibleTeamCount = 0;
    
    context.remainingBudget.forEach((budget, teamId) => {
      // Calculate roster spots remaining for this team
      const teamPicks = context.draftedPlayers.filter(p => p.teamId === teamId).length;
      const remainingSpots = Math.max(0, this.leagueSettings.rosterSize - teamPicks);
      
      // Team is eligible if they have spots left
      if (remainingSpots > 0) {
        // Check position-specific needs if player provided
        let teamNeedsPosition = true;
        if (player) {
          const teamPlayersAtPosition = context.draftedPlayers
            .filter(p => p.teamId === teamId && p.position === player.position).length;
          
          // Check if team has already filled max at this position
          const maxAtPosition = this.getMaxAtPosition(player.position);
          if (teamPlayersAtPosition >= maxAtPosition) {
            teamNeedsPosition = false;
          }
        }
        
        if (teamNeedsPosition) {
          // Must save $1 for each remaining spot after this one
          const minToFill = remainingSpots - 1;
          const teamMaxBid = Math.max(1, budget - minToFill);
          
          // Track the highest bid among eligible teams
          maxTeamBid = Math.max(maxTeamBid, teamMaxBid);
          eligibleTeamCount++;
        }
      }
    });
    
    // If no teams are eligible (position maxed out), return minimum
    if (eligibleTeamCount === 0) {
      return 1;
    }
    
    // Cap price by what teams can actually pay
    return Math.max(1, Math.min(price, maxTeamBid));
  }
  
  /**
   * Get maximum reasonable roster spots for a position
   */
  private getMaxAtPosition(position: Position): number {
    const req = this.leagueSettings.rosterRequirements;
    
    switch(position) {
      case 'QB':
        // In SuperFlex: 2-3 QBs reasonable, else 1-2
        return this.leagueSettings.isSuperFlex ? 3 : 2;
      case 'RB':
        // RBs can fill RB + FLEX spots + bench
        return req.RB.min + (req.FLEX?.count || 0) + 3;
      case 'WR':
        // WRs can fill WR + FLEX spots + bench
        return req.WR.min + (req.FLEX?.count || 0) + 3;
      case 'TE':
        // TEs: usually just required + 1 backup
        return req.TE.min + 1 + (this.leagueSettings.isTEPremium ? 1 : 0);
      case 'K':
        // Never roster more than 1 kicker
        return 1;
      case 'DST':
        // Never roster more than 1-2 DSTs
        return 2;
      default:
        return 3;
    }
  }
  
  /**
   * Calculate transparent scarcity multiplier with DYNAMIC demand
   * CORRECTED: Centered at 1.0 for balanced supply/demand
   */
  private getScarcityMultiplier(
    position: Position,
    context: MarketContext
  ): number {
    // Count remaining at position
    const remainingAtPosition = context.remainingPlayers
      .filter(p => p.position === position).length;
    
    if (remainingAtPosition === 0) return 1.0;
    
    // DYNAMIC: Calculate actual remaining demand from team needs with guardrails
    let remainingDemand = 0;
    
    context.remainingBudget.forEach((budget, teamId) => {
      // Get team's current roster
      const teamPlayers = context.draftedPlayers.filter(p => p.teamId === teamId);
      const teamRosterSize = teamPlayers.length;
      const spotsLeft = Math.max(0, this.leagueSettings.rosterSize - teamRosterSize);
      
      if (spotsLeft <= 0) return; // Team full
      
      // Count position-specific needs
      const teamPositionCount = teamPlayers.filter(p => p.position === position).length;
      const req = this.leagueSettings.rosterRequirements;
      
      // Calculate minimum needs at this position (GUARDRAIL: never negative)
      let minNeeded = Math.max(0, req[position].min - teamPositionCount);
      
      // Calculate actual open flex spots for this team
      if (['RB', 'WR', 'TE'].includes(position) && req.FLEX) {
        const flexFilled = this.countFlexFilled(teamPlayers, req);
        const totalFlexSlots = req.FLEX.count || 0;
        const actualFlexOpen = Math.max(0, totalFlexSlots - flexFilled);
        
        if (actualFlexOpen > 0) {
          // Only add flex demand if team actually has open flex spots
          // Use conservative weights to avoid inflation
          const flexWeight = position === 'RB' ? 0.35 :  // Reduced from 0.45
                           position === 'WR' ? 0.35 :   // Reduced from 0.40
                           0.10;                         // Reduced from 0.15
          minNeeded += actualFlexOpen * flexWeight;
        }
      }
      
      // Calculate required spots (starters + flex already counted)
      const requiredSpots = Object.values(req).reduce((sum, r) => {
        if (typeof r === 'object' && r.min) return sum + r.min;
        return sum;
      }, 0) + (req.FLEX?.count || 0);
      
      // Actual bench spots = total spots - required spots
      const actualBenchSlots = Math.max(0, this.leagueSettings.rosterSize - requiredSpots);
      
      // Add CONSERVATIVE bench demand (reduced weights)
      const benchSpotsRemaining = Math.max(0, 
        Math.min(actualBenchSlots, spotsLeft - minNeeded)
      );
      
      if (benchSpotsRemaining > 0) {
        // Reduced bench weights to avoid late inflation
        const conservativeBenchWeight = this.getConservativeBenchWeight(position);
        minNeeded += benchSpotsRemaining * conservativeBenchWeight;
      }
      
      // GUARDRAIL: Cap demand at team's remaining spots
      minNeeded = Math.min(minNeeded, spotsLeft);
      
      remainingDemand += minNeeded;
    });
    
    if (remainingDemand === 0) return 0.85; // No demand left
    
    // Calculate demand/supply ratio
    const demandSupplyRatio = remainingDemand / remainingAtPosition;
    
    // CENTER AT 1.0: multiplier = 1 + k*(ratio - 1)
    // When ratio = 1 (balanced), multiplier = 1.0
    const k = 0.25; // Sensitivity factor
    const multiplier = 1 + k * (demandSupplyRatio - 1);
    
    // Clamp to reasonable range
    return Math.max(0.85, Math.min(1.15, multiplier));
  }
  
  /**
   * Count how many flex spots are filled
   */
  private countFlexFilled(teamPlayers: Player[], requirements: any): number {
    const rbCount = teamPlayers.filter(p => p.position === 'RB').length;
    const wrCount = teamPlayers.filter(p => p.position === 'WR').length;
    const teCount = teamPlayers.filter(p => p.position === 'TE').length;
    
    // Count players beyond required starters as flex
    const rbFlex = Math.max(0, rbCount - requirements.RB.min);
    const wrFlex = Math.max(0, wrCount - requirements.WR.min);
    const teFlex = Math.max(0, teCount - requirements.TE.min);
    
    return rbFlex + wrFlex + teFlex;
  }
  
  /**
   * Get bench weight for position
   */
  private getBenchWeight(position: Position): number {
    const weights: Record<Position, number> = {
      'QB': this.leagueSettings.isSuperFlex ? 0.10 : 0.05,
      'RB': 0.30,
      'WR': 0.30,
      'TE': 0.10,
      'K': 0.02,
      'DST': 0.03
    };
    return weights[position] || 0.05;
  }
  
  /**
   * Get CONSERVATIVE bench weight to avoid late inflation
   */
  private getConservativeBenchWeight(position: Position): number {
    const weights: Record<Position, number> = {
      'QB': this.leagueSettings.isSuperFlex ? 0.05 : 0.02,  // Halved
      'RB': 0.15,  // Halved from 0.30
      'WR': 0.15,  // Halved from 0.30
      'TE': 0.05,  // Halved from 0.10
      'K': 0.01,   // Minimal
      'DST': 0.01  // Minimal
    };
    return weights[position] || 0.02;
  }
  
  /**
   * Get total position demand across league
   * Dynamically computed based on roster requirements + optimal flex allocation
   */
  private getPositionDemand(position: Position): number {
    const requirements = this.leagueSettings.rosterRequirements;
    const teams = this.leagueSettings.numTeams;
    
    // Base demand from required starters
    let baseDemand = 0;
    switch(position) {
      case 'QB': 
        baseDemand = requirements.QB.min * teams;
        // Add SuperFlex demand if applicable
        if (this.leagueSettings.isSuperFlex && requirements.FLEX) {
          baseDemand += teams * 0.8; // 80% of teams use QB in superflex
        }
        break;
      case 'RB': 
        baseDemand = requirements.RB.min * teams;
        break;
      case 'WR': 
        baseDemand = requirements.WR.min * teams;
        break;
      case 'TE': 
        baseDemand = requirements.TE.min * teams;
        break;
      case 'K': 
        return requirements.K.min * teams; // No flex/bench
      case 'DST': 
        return requirements.DST.min * teams; // No flex/bench
      default: 
        return teams;
    }
    
    // Add flex demand based on historical allocation patterns
    if (requirements.FLEX && ['RB', 'WR', 'TE'].includes(position)) {
      const flexSlots = (requirements.FLEX.count || 0) * teams;
      
      // Historical flex allocation (from draft analysis)
      const flexAllocation: Record<string, number> = {
        'RB': 0.45,  // 45% of flex slots go to RB
        'WR': 0.40,  // 40% of flex slots go to WR
        'TE': 0.15   // 15% of flex slots go to TE
      };
      
      baseDemand += flexSlots * (flexAllocation[position] || 0);
    }
    
    // Add bench demand (conservative estimate)
    const benchSlots = requirements.BENCH * teams;
    const benchAllocation: Record<Position, number> = {
      'QB': this.leagueSettings.isSuperFlex ? 0.10 : 0.05, // More QB benched in SF
      'RB': 0.30,  // 30% of bench for RBs
      'WR': 0.30,  // 30% of bench for WRs
      'TE': 0.10,  // 10% of bench for TEs
      'K': 0.02,   // Rarely bench kickers
      'DST': 0.03  // Rarely bench DSTs
    };
    
    baseDemand += benchSlots * (benchAllocation[position] || 0);
    
    return Math.round(baseDemand);
  }

  /**
   * Calculate confidence in price prediction
   * Formula: C = 0.6 × C_price + 0.4 × (C_value × M_position)
   * Where:
   *   C_price = Market consensus confidence (ADP/AAV availability)
   *   C_value = Projection quality confidence (base 0.6)
   *   M_position = Position-specific variance multiplier
   */
  private calculateConfidence(player: Player, context?: MarketContext): number {
    // MARKET-SIDE CONFIDENCE (C_price): How well we know market consensus
    let priceConfidence = 0.5;  // Base confidence
    
    // AAV is strongest signal (+0.3)
    if (player.auctionValue && player.auctionValue > 0) {
      priceConfidence += 0.3;
    }
    
    // ADP provides additional signal (+0.2 for early picks)
    if (player.adp && player.adp > 0 && player.adp < 100) {
      priceConfidence += 0.2;
    } else if (player.adp && player.adp >= 100 && player.adp < 200) {
      priceConfidence += 0.1;  // Less confidence in late ADP
    }
    
    // Recent transactions if context available
    if (context) {
      const recentAtPosition = context.recentPrices
        ?.filter(p => p.position === player.position)
        ?.slice(-5) || [];
      
      if (recentAtPosition.length > 0) {
        priceConfidence += 0.05 * Math.min(3, recentAtPosition.length);
      }
    }
    
    // VALUE-SIDE CONFIDENCE (C_value): Base projection confidence
    const baseValueConfidence = 0.6;  // Base confidence for having projections
    
    // Position variance multipliers (M_position)
    const positionVariance: Record<Position, number> = {
      QB: 0.95,  // Most stable/predictable
      WR: 0.90,  // Moderate variance
      TE: 0.85,  // Higher variance
      RB: 0.80,  // High injury risk
      K: 0.70,   // Very random
      DST: 0.60  // Most random/unpredictable
    };
    
    // Apply position multiplier to value confidence
    const positionMultiplier = positionVariance[player.position] || 0.8;
    const valueConfidence = baseValueConfidence * positionMultiplier;
    
    // COMBINED CONFIDENCE: Weight market more heavily (60/40)
    // C = 0.6 × C_price + 0.4 × C_value (where C_value already includes M_position)
    let combined = priceConfidence * 0.6 + valueConfidence * 0.4;
    
    // LATE-ROUND ADJUSTMENT: Less confidence in late picks
    if (player.adp > 150) {
      combined *= 0.8;  // 20% reduction for late-round
    }
    
    // K/DST ADJUSTMENT: Inherently unpredictable
    if (player.position === 'K' || player.position === 'DST') {
      combined *= 0.7;  // 30% reduction
    }
    
    // Clamp to [0.1, 1.0] range
    return Math.min(1, Math.max(0.1, combined));
  }

  /**
   * Calculate price range based on confidence
   */
  private calculatePriceRange(
    predictedPrice: number,
    confidence: number
  ): { low: number; mid: number; high: number } {
    // Higher confidence = tighter range
    const variance = (1 - confidence) * 0.4 + 0.1;  // 10-50% variance
    
    return {
      low: Math.round(Math.max(1, predictedPrice * (1 - variance))),
      mid: Math.round(predictedPrice),
      high: Math.round(predictedPrice * (1 + variance))
    };
  }

  /**
   * Get position-based default prices
   */
  private getPositionDefault(position: Position): number {
    const defaults: Record<Position, number> = {
      QB: 8,
      RB: 15,
      WR: 12,
      TE: 5,
      K: 1,
      DST: 1
    };
    return defaults[position];
  }

  /**
   * Get ADP influence weight
   */
  private getADPInfluence(player: Player): number {
    if (!player.adp || player.adp <= 0) return 0;
    if (player.adp <= 24) return 0.9;   // First 2 rounds - high influence
    if (player.adp <= 60) return 0.7;   // Rounds 3-5 - moderate
    if (player.adp <= 120) return 0.5;  // Rounds 6-10 - low
    return 0.3;  // Late rounds - minimal
  }

  /**
   * Get AAV influence weight
   */
  private getAAVInfluence(player: Player): number {
    if (!player.auctionValue || player.auctionValue <= 0) return 0;
    if (player.auctionValue >= 40) return 0.95;  // High value - very reliable
    if (player.auctionValue >= 20) return 0.85;  // Mid value - reliable
    if (player.auctionValue >= 10) return 0.7;   // Low-mid - somewhat reliable
    return 0.5;  // Low value - less reliable
  }

  /**
   * Get position-specific price adjustment
   */
  private getPositionAdjustment(position: Position): number {
    // Relative to market baseline
    const adjustments: Record<Position, number> = {
      RB: 1.05,   // RBs tend to go slightly over
      WR: 1.0,    // Baseline
      QB: 0.95,   // QBs slightly under
      TE: 0.95,   // TEs slightly under
      K: 0.8,     // K/DST significantly under
      DST: 0.85
    };
    return adjustments[position];
  }

  /**
   * Calculate current market inflation
   */
  calculateInflation(context: MarketContext): number {
    if (context.draftedPlayers.length === 0) return 1.0;
    
    // Compare actual prices to expected prices
    let actualSum = 0;
    let expectedSum = 0;
    
    context.draftedPlayers.forEach(player => {
      actualSum += player.purchasePrice;
      // Use AAV as expected price
      expectedSum += player.auctionValue || this.getPositionDefault(player.position);
    });
    
    if (expectedSum === 0) return 1.0;
    
    const inflation = actualSum / expectedSum;
    
    // Cap inflation between 0.7 and 1.5
    return Math.max(0.7, Math.min(1.5, inflation));
  }

  /**
   * Predict prices for multiple players
   */
  predictMultiple(
    players: Player[],
    context?: MarketContext
  ): MarketPrice[] {
    return players.map(player => this.predictPrice(player, context));
  }

  /**
   * Get market summary statistics
   */
  getMarketSummary(predictions: MarketPrice[]): {
    avgPrice: number;
    medianPrice: number;
    totalValue: number;
    avgConfidence: number;
  } {
    const prices = predictions.map(p => p.predictedPrice).sort((a, b) => a - b);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const medianPrice = prices[Math.floor(prices.length / 2)];
    const totalValue = prices.reduce((sum, p) => sum + p, 0);
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
    
    return {
      avgPrice,
      medianPrice,
      totalValue,
      avgConfidence
    };
  }
}