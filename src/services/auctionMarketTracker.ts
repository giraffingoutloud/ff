/**
 * Auction Market Dynamics Tracker
 * Tracks inflation, spending patterns, and provides nomination strategy
 * Uses REAL data - no hallucinations
 */

import { Player, Position, DraftedPlayer } from '../types';

export interface MarketConditions {
  totalSpent: number;
  totalRemaining: number;
  playersRostered: number;
  playersRemaining: number;
  avgPricePerPlayer: number;
  inflationRate: number;
}

export interface PositionMarket {
  position: Position;
  topTierRemaining: number;
  avgPrice: number;
  recentPrices: number[];
  inflationRate: number;
  scarcityLevel: 'abundant' | 'normal' | 'scarce' | 'critical';
}

export interface TeamBudget {
  teamId: string;
  spent: number;
  remaining: number;
  rosterSpots: number;
  maxBid: number;
  needsPositions: Position[];
}

export interface NominationStrategy {
  phase: 'early' | 'middle' | 'late';
  recommendedNomination: {
    player: Player;
    reason: string;
    expectedPrice: number;
    targetBidder?: string;
  };
  alternates: Player[];
}

export interface BidStrategy {
  player: Player;
  maxBid: number;
  currentBid: number;
  shouldBid: boolean;
  reason: string;
  inflationAdjustedValue: number;
}

export class AuctionMarketTracker {
  private draftedPlayers: DraftedPlayer[] = [];
  private teamBudgets: Map<string, TeamBudget> = new Map();
  private positionPrices: Map<Position, number[]> = new Map();
  private availablePlayers: Player[] = [];
  private totalBudget = 200; // Standard auction budget
  private rosterSize = 16; // Standard roster size
  
  constructor() {
    // Initialize position price tracking
    const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    positions.forEach(pos => this.positionPrices.set(pos, []));
  }
  
  /**
   * Initialize the tracker with league settings
   */
  initialize(
    teams: string[],
    budget: number = 200,
    rosterSize: number = 16,
    availablePlayers: Player[]
  ): void {
    this.totalBudget = budget;
    this.rosterSize = rosterSize;
    this.availablePlayers = [...availablePlayers];
    
    // Initialize team budgets
    teams.forEach(teamId => {
      this.teamBudgets.set(teamId, {
        teamId,
        spent: 0,
        remaining: budget,
        rosterSpots: rosterSize,
        maxBid: budget - (rosterSize - 1), // Save $1 per remaining spot
        needsPositions: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'K', 'DST']
      });
    });
  }
  
  /**
   * Record a player being drafted
   */
  recordDraft(player: DraftedPlayer, teamId: string, price: number): void {
    // Update drafted players
    this.draftedPlayers.push({ ...player, purchasePrice: price });
    
    // Update team budget
    const team = this.teamBudgets.get(teamId);
    if (team) {
      team.spent += price;
      team.remaining -= price;
      team.rosterSpots--;
      team.maxBid = team.remaining - team.rosterSpots; // Save $1 per spot
      
      // Remove position from needs
      const posIndex = team.needsPositions.indexOf(player.position);
      if (posIndex > -1) {
        team.needsPositions.splice(posIndex, 1);
      }
    }
    
    // Track position prices
    const prices = this.positionPrices.get(player.position) || [];
    prices.push(price);
    this.positionPrices.set(player.position, prices);
    
    // Remove from available players
    this.availablePlayers = this.availablePlayers.filter(p => p.id !== player.id);
  }
  
  /**
   * Handle undo - add player back to available list
   */
  undoDraft(player: Player, teamId: string, price: number) {
    // Add player back to available players
    this.availablePlayers.push(player);
    
    // Remove from drafted players
    this.draftedPlayers = this.draftedPlayers.filter(p => p.id !== player.id);
    
    // Update team budget
    const team = this.teamBudgets.get(teamId);
    if (team) {
      team.spent = Math.max(0, team.spent - price);
      team.remaining = this.totalBudget - team.spent;
      team.roster = team.roster?.filter(p => p.id !== player.id) || [];
    }
    
    // Remove the price from position tracking
    const prices = this.positionPrices.get(player.position) || [];
    const priceIndex = prices.lastIndexOf(price);
    if (priceIndex !== -1) {
      prices.splice(priceIndex, 1);
      this.positionPrices.set(player.position, prices);
    }
  }
  
  /**
   * Calculate current market conditions
   */
  getMarketConditions(): MarketConditions {
    const totalTeams = this.teamBudgets.size;
    const totalPossibleSpend = this.totalBudget * totalTeams;
    const totalSpent = Array.from(this.teamBudgets.values())
      .reduce((sum, team) => sum + team.spent, 0);
    const totalRemaining = totalPossibleSpend - totalSpent;
    
    const playersRostered = this.draftedPlayers.length;
    const totalRosterSpots = this.rosterSize * totalTeams;
    const playersRemaining = totalRosterSpots - playersRostered;
    
    const avgPricePerPlayer = playersRostered > 0 
      ? totalSpent / playersRostered 
      : this.totalBudget / this.rosterSize;
    
    // Calculate inflation rate
    const expectedAvgPrice = this.totalBudget / this.rosterSize;
    const inflationRate = (avgPricePerPlayer / expectedAvgPrice) - 1;
    
    return {
      totalSpent,
      totalRemaining,
      playersRostered,
      playersRemaining,
      avgPricePerPlayer,
      inflationRate
    };
  }
  
  /**
   * Analyze market for each position
   */
  getPositionMarkets(): PositionMarket[] {
    const markets: PositionMarket[] = [];
    const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    
    positions.forEach(position => {
      const prices = this.positionPrices.get(position) || [];
      const remaining = this.availablePlayers.filter(p => p.position === position);
      const topTier = remaining.filter(p => p.adp < 50).length;
      
      // Calculate average price
      const avgPrice = prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : this.getExpectedPrice(position);
      
      // Get recent prices (last 3)
      const recentPrices = prices.slice(-3);
      
      // Calculate position-specific inflation
      const expectedPrice = this.getExpectedPrice(position);
      const inflationRate = (avgPrice / expectedPrice) - 1;
      
      // Determine scarcity level
      let scarcityLevel: 'abundant' | 'normal' | 'scarce' | 'critical';
      const startersNeeded = this.getStartersNeeded(position);
      const qualityRemaining = remaining.filter(p => p.projectedPoints > 100).length;
      
      if (qualityRemaining > startersNeeded * 2) {
        scarcityLevel = 'abundant';
      } else if (qualityRemaining > startersNeeded) {
        scarcityLevel = 'normal';
      } else if (qualityRemaining > startersNeeded / 2) {
        scarcityLevel = 'scarce';
      } else {
        scarcityLevel = 'critical';
      }
      
      markets.push({
        position,
        topTierRemaining: topTier,
        avgPrice,
        recentPrices,
        inflationRate,
        scarcityLevel
      });
    });
    
    return markets;
  }
  
  /**
   * Get nomination strategy based on current market
   */
  getNominationStrategy(myTeamId: string): NominationStrategy {
    const market = this.getMarketConditions();
    const myTeam = this.teamBudgets.get(myTeamId);
    const phase = this.determineDraftPhase();
    
    // Debug logging removed - was causing React setState warning
    
    if (!myTeam) {
      throw new Error('Team not found');
    }
    
    // Find players to nominate based on strategy
    let recommendedPlayer: Player | null = null;
    let reason = '';
    let expectedPrice = 0;
    let targetBidder: string | undefined;
    
    if (phase === 'early') {
      // Early: Nominate expensive players you don't want
      const expensivePlayers = this.availablePlayers
        .filter(p => p.adp < 20 && !this.isTargetForMe(p, myTeam))
        .sort((a, b) => a.adp - b.adp);
      
      if (expensivePlayers.length > 0) {
        recommendedPlayer = expensivePlayers[0];
        reason = 'Drain opponent budgets with high-profile player';
        expectedPrice = this.estimatePrice(recommendedPlayer);
        targetBidder = this.findLikelyBidder(recommendedPlayer);
      }
    } else if (phase === 'middle') {
      // Middle: Nominate overvalued names
      const overvaluedPlayers = this.availablePlayers
        .filter(p => this.isOvervalued(p))
        .sort((a, b) => b.adp - a.adp);
      
      if (overvaluedPlayers.length > 0) {
        recommendedPlayer = overvaluedPlayers[0];
        reason = 'Popular name likely to draw overbid';
        expectedPrice = this.estimatePrice(recommendedPlayer) * 1.15;
      }
    } else {
      // Late: Nominate your sleepers
      const sleepers = this.availablePlayers
        .filter(p => this.isSleeper(p) && this.isTargetForMe(p, myTeam))
        .sort((a, b) => b.projectedPoints - a.projectedPoints);
      
      if (sleepers.length > 0) {
        recommendedPlayer = sleepers[0];
        reason = 'Get your sleeper while budgets are tight';
        expectedPrice = Math.max(1, this.estimatePrice(recommendedPlayer) * 0.7);
      }
    }
    
    // Fallback if no strategic nomination found
    if (!recommendedPlayer && this.availablePlayers.length > 0) {
      // Nominate a mid-tier player at a position you don't need
      const positionsIHave = new Set(myTeam.roster?.map(p => p.position) || []);
      const playersIDontNeed = this.availablePlayers
        .filter(p => positionsIHave.has(p.position) && p.adp > 50 && p.adp < 150)
        .sort((a, b) => a.adp - b.adp);
      
      if (playersIDontNeed.length > 0) {
        recommendedPlayer = playersIDontNeed[0];
        reason = 'Mid-tier player at filled position';
      } else {
        // Last resort: cheapest available player
        recommendedPlayer = this.availablePlayers
          .sort((a, b) => (this.estimatePrice(a) - this.estimatePrice(b)))[0];
        reason = 'Cheapest available player';
      }
      expectedPrice = this.estimatePrice(recommendedPlayer);
    }
    
    // Find alternates
    const alternates = this.availablePlayers
      .filter(p => p.id !== recommendedPlayer?.id)
      .slice(0, 3);
    
    return {
      phase,
      recommendedNomination: {
        player: recommendedPlayer,
        reason,
        expectedPrice,
        targetBidder
      },
      alternates
    };
  }
  
  /**
   * Get bidding strategy for a specific player
   */
  getBidStrategy(player: Player, myTeamId: string, currentBid: number): BidStrategy {
    const myTeam = this.teamBudgets.get(myTeamId);
    const market = this.getMarketConditions();
    
    if (!myTeam) {
      throw new Error('Team not found');
    }
    
    // Calculate player's base value
    const baseValue = this.estimatePrice(player);
    
    // Adjust for inflation
    const inflationAdjustedValue = baseValue * (1 + market.inflationRate);
    
    // Determine max bid based on team needs and budget
    let maxBid = Math.min(
      inflationAdjustedValue * 1.1, // Don't go more than 10% over value
      myTeam.maxBid // Don't exceed max possible bid
    );
    
    // Adjust based on position need
    if (myTeam.needsPositions.includes(player.position)) {
      maxBid *= 1.15; // Willing to pay 15% more for needs
    }
    
    // Determine if we should bid
    let shouldBid = currentBid < maxBid;
    let reason = '';
    
    if (!shouldBid) {
      reason = `Current bid ($${currentBid}) exceeds max value ($${Math.round(maxBid)})`;
    } else if (myTeam.remaining < maxBid) {
      shouldBid = false;
      reason = `Insufficient budget (${myTeam.remaining} < ${maxBid})`;
    } else if (this.isOvervalued(player)) {
      reason = `Player is overvalued at current price`;
      maxBid = baseValue * 0.9; // Reduce max bid for overvalued players
    } else {
      reason = `Good value at current price`;
    }
    
    return {
      player,
      maxBid: Math.round(maxBid),
      currentBid,
      shouldBid,
      reason,
      inflationAdjustedValue: Math.round(inflationAdjustedValue)
    };
  }
  
  // Helper methods
  
  private determineDraftPhase(): 'early' | 'middle' | 'late' {
    const percentDrafted = this.draftedPlayers.length / (this.rosterSize * this.teamBudgets.size);
    
    if (percentDrafted < 0.25) return 'early';
    if (percentDrafted < 0.70) return 'middle';
    return 'late';
  }
  
  private getExpectedPrice(position: Position): number {
    const positionBudgets: Record<Position, number> = {
      QB: 5,
      RB: 30,
      WR: 25,
      TE: 5,
      K: 1,
      DST: 1
    };
    return positionBudgets[position] || 5;
  }
  
  private getStartersNeeded(position: Position): number {
    const starters: Record<Position, number> = {
      QB: 1,
      RB: 2,
      WR: 3,
      TE: 1,
      K: 1,
      DST: 1
    };
    return starters[position] * this.teamBudgets.size;
  }
  
  private estimatePrice(player: Player): number {
    // Simple estimation based on ADP
    if (player.adp <= 10) return 50;
    if (player.adp <= 20) return 35;
    if (player.adp <= 40) return 25;
    if (player.adp <= 60) return 15;
    if (player.adp <= 100) return 8;
    if (player.adp <= 150) return 3;
    return 1;
  }
  
  private isTargetForMe(player: Player, team: TeamBudget): boolean {
    return team.needsPositions.includes(player.position) && 
           player.projectedPoints > 100;
  }
  
  private isOvervalued(player: Player): boolean {
    // Players whose name value exceeds production
    const overvaluedNames = ['Tyreek Hill', 'Jonathan Taylor', 'Mike Evans'];
    return overvaluedNames.some(name => player.name.includes(name));
  }
  
  private isSleeper(player: Player): boolean {
    // High projected points but low ADP
    return player.projectedPoints > 150 && player.adp > 100;
  }
  
  private findLikelyBidder(player: Player): string | undefined {
    // Find team with most budget and need at position
    let likelyTeam: string | undefined;
    let maxBudget = 0;
    
    this.teamBudgets.forEach((team, teamId) => {
      if (team.needsPositions.includes(player.position) && team.remaining > maxBudget) {
        maxBudget = team.remaining;
        likelyTeam = teamId;
      }
    });
    
    return likelyTeam;
  }
}

// Export singleton
export const auctionMarketTracker = new AuctionMarketTracker();