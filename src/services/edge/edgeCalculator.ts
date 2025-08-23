/**
 * Edge Calculator
 * Identifies value opportunities by comparing intrinsic value to market price
 * The key to winning auction drafts: finding positive edge
 */

import { Player } from '../../types';
import { IntrinsicValue } from '../valuation/intrinsicValueEngine';
import { MarketPrice } from '../market/marketPriceModel';

export interface PlayerEdge {
  player: Player;
  intrinsicValue: number;
  marketPrice: number;
  edge: number;                 // intrinsicValue - marketPrice
  edgePercent: number;          // edge / marketPrice * 100
  confidence: number;           // Confidence in edge calculation
  confidenceWeightedEdge: number; // edge × confidence for tie-breaking
  recommendation: 'strong-buy' | 'buy' | 'hold' | 'avoid' | 'strong-avoid';
  reasoning: string[];          // Why this recommendation
}

export interface EdgeOpportunity {
  type: 'value' | 'trap' | 'fair';
  players: PlayerEdge[];
  totalEdge: number;
  avgEdgePercent: number;
}

export class EdgeCalculator {
  // Percentage-based thresholds (context-aware)
  private readonly STRONG_BUY_PERCENT = 20;  // 20%+ edge
  private readonly BUY_PERCENT = 8;          // 8%+ edge
  private readonly AVOID_PERCENT = -8;       // -8% edge
  private readonly STRONG_AVOID_PERCENT = -15; // -15% edge

  /**
   * Calculate edge for a single player
   */
  calculateEdge(
    intrinsicValue: IntrinsicValue,
    marketPrice: MarketPrice
  ): PlayerEdge {
    const value = intrinsicValue.constrainedValue;
    const price = marketPrice.predictedPrice;
    const edge = value - price;
    const edgePercent = price > 0 ? (edge / price) * 100 : 0;
    
    // Combine confidences
    const confidence = marketPrice.confidence * 0.8; // Market price confidence matters more
    
    // Determine recommendation
    const recommendation = this.getRecommendation(edge, edgePercent, value, price);
    
    // Generate reasoning
    const reasoning = this.generateReasoning(
      intrinsicValue,
      marketPrice,
      edge,
      edgePercent,
      recommendation
    );
    
    // Calculate confidence-weighted edge for tie-breaking
    const confidenceWeightedEdge = edge * confidence;
    
    return {
      player: intrinsicValue.player,
      intrinsicValue: value,
      marketPrice: price,
      edge,
      edgePercent,
      confidence,
      confidenceWeightedEdge,
      recommendation,
      reasoning
    };
  }

  /**
   * Calculate edges for multiple players
   */
  calculateMultipleEdges(
    intrinsicValues: IntrinsicValue[],
    marketPrices: MarketPrice[]
  ): PlayerEdge[] {
    const edges: PlayerEdge[] = [];
    
    // Create price map for quick lookup
    const priceMap = new Map<string, MarketPrice>();
    marketPrices.forEach(mp => priceMap.set(mp.player.id, mp));
    
    // Calculate edge for each player with both value and price
    intrinsicValues.forEach(iv => {
      const marketPrice = priceMap.get(iv.player.id);
      if (marketPrice) {
        edges.push(this.calculateEdge(iv, marketPrice));
      }
    });
    
    return edges.sort((a, b) => b.edge - a.edge);
  }

  /**
   * Get recommendation based on edge
   * Uses tiered percentage thresholds that adjust by price range
   */
  private getRecommendation(
    edge: number,
    edgePercent: number,
    value: number,
    price: number
  ): 'strong-buy' | 'buy' | 'hold' | 'avoid' | 'strong-avoid' {
    // Define thresholds by price tier
    let thresholds: {
      strongBuy: number;
      buy: number;
      avoid: number;
      strongAvoid: number;
    };
    
    // Price tier thresholds
    if (price <= 3) {
      // Cheap players ($1-3): Need higher percentage to matter
      thresholds = {
        strongBuy: 30,    // +30% edge
        buy: 15,          // +15% edge
        avoid: -15,       // -15% edge
        strongAvoid: -30  // -30% edge
      };
    } else if (price <= 30) {
      // Mid-range players ($4-30): Standard thresholds
      thresholds = {
        strongBuy: 20,    // +20% edge
        buy: 8,           // +8% edge
        avoid: -8,        // -8% edge
        strongAvoid: -20  // -20% edge
      };
    } else {
      // Expensive players ($30+): Lower percentage is significant
      thresholds = {
        strongBuy: 15,    // +15% edge
        buy: 6,           // +6% edge
        avoid: -6,        // -6% edge
        strongAvoid: -15  // -15% edge
      };
    }
    
    // Apply thresholds
    if (edgePercent >= thresholds.strongBuy) return 'strong-buy';
    if (edgePercent >= thresholds.buy) return 'buy';
    if (edgePercent <= thresholds.strongAvoid) return 'strong-avoid';
    if (edgePercent <= thresholds.avoid) return 'avoid';
    
    return 'hold';
  }

  /**
   * Generate reasoning for recommendation
   */
  private generateReasoning(
    intrinsicValue: IntrinsicValue,
    marketPrice: MarketPrice,
    edge: number,
    edgePercent: number,
    recommendation: string
  ): string[] {
    const reasons: string[] = [];
    
    // Edge-based reasoning
    if (edge > 0) {
      reasons.push(`$${Math.round(edge)} positive edge (${Math.round(edgePercent)}% discount)`);
    } else if (edge < 0) {
      reasons.push(`$${Math.round(Math.abs(edge))} negative edge (${Math.round(Math.abs(edgePercent))}% premium)`);
    }
    
    // Tier-based reasoning
    if (intrinsicValue.tier === 'elite') {
      reasons.push('Elite tier player at position');
    } else if (intrinsicValue.tier === 'waiver') {
      reasons.push('Replacement-level player');
    }
    
    // VORP-based reasoning
    if (intrinsicValue.vorp > 100) {
      reasons.push(`High VORP (${Math.round(intrinsicValue.vorp)} points above replacement)`);
    } else if (intrinsicValue.vorp < 20) {
      reasons.push('Low value over replacement');
    }
    
    // Market factors
    if (marketPrice.marketFactors.marketInflation > 1.2) {
      reasons.push('Market is inflated');
    } else if (marketPrice.marketFactors.marketInflation < 0.85) {
      reasons.push('Market is deflated');
    }
    
    // Position rank
    if (intrinsicValue.positionRank <= 5) {
      reasons.push(`Top 5 at position (#${intrinsicValue.positionRank})`);
    }
    
    // Confidence
    if (marketPrice.confidence < 0.5) {
      reasons.push('Low confidence in market price prediction');
    }
    
    return reasons;
  }

  /**
   * Find top value opportunities
   */
  findValueOpportunities(
    edges: PlayerEdge[],
    minEdge: number = 3,
    limit: number = 20
  ): EdgeOpportunity {
    const valueEdges = edges
      .filter(e => e.edge >= minEdge)
      .sort((a, b) => b.edge - a.edge)
      .slice(0, limit);
    
    const totalEdge = valueEdges.reduce((sum, e) => sum + e.edge, 0);
    const avgEdgePercent = valueEdges.length > 0
      ? valueEdges.reduce((sum, e) => sum + e.edgePercent, 0) / valueEdges.length
      : 0;
    
    return {
      type: 'value',
      players: valueEdges,
      totalEdge,
      avgEdgePercent
    };
  }

  /**
   * Find overpriced players (traps)
   */
  findTraps(
    edges: PlayerEdge[],
    maxEdge: number = -3,
    limit: number = 20
  ): EdgeOpportunity {
    const trapEdges = edges
      .filter(e => e.edge <= maxEdge)
      .sort((a, b) => a.edge - b.edge)  // Most negative first
      .slice(0, limit);
    
    const totalEdge = trapEdges.reduce((sum, e) => sum + e.edge, 0);
    const avgEdgePercent = trapEdges.length > 0
      ? trapEdges.reduce((sum, e) => sum + e.edgePercent, 0) / trapEdges.length
      : 0;
    
    return {
      type: 'trap',
      players: trapEdges,
      totalEdge,
      avgEdgePercent
    };
  }

  /**
   * Find fairly priced players
   */
  findFairValue(
    edges: PlayerEdge[],
    tolerance: number = 2,
    limit: number = 20
  ): EdgeOpportunity {
    const fairEdges = edges
      .filter(e => Math.abs(e.edge) <= tolerance)
      .sort((a, b) => Math.abs(a.edge) - Math.abs(b.edge))  // Closest to 0 first
      .slice(0, limit);
    
    const totalEdge = fairEdges.reduce((sum, e) => sum + e.edge, 0);
    const avgEdgePercent = fairEdges.length > 0
      ? fairEdges.reduce((sum, e) => sum + e.edgePercent, 0) / fairEdges.length
      : 0;
    
    return {
      type: 'fair',
      players: fairEdges,
      totalEdge,
      avgEdgePercent
    };
  }

  /**
   * Get bid strategy for a player based on edge
   */
  getBidStrategy(edge: PlayerEdge, remainingBudget: number): {
    maxBid: number;
    targetBid: number;
    minBid: number;
    strategy: string;
  } {
    const { intrinsicValue, marketPrice, recommendation } = edge;
    
    let maxBid: number;
    let targetBid: number;
    let minBid: number;
    let strategy: string;
    
    switch (recommendation) {
      case 'strong-buy':
        // Willing to pay up to intrinsic value
        maxBid = Math.min(intrinsicValue, remainingBudget * 0.4);
        targetBid = Math.min(marketPrice + 2, maxBid);
        minBid = marketPrice - 3;
        strategy = 'Aggressively pursue - strong value opportunity';
        break;
        
      case 'buy':
        // Willing to pay slightly over market
        maxBid = Math.min(marketPrice + 3, intrinsicValue, remainingBudget * 0.3);
        targetBid = marketPrice;
        minBid = marketPrice - 5;
        strategy = 'Target at market price - good value if cheaper';
        break;
        
      case 'hold':
        // Only if falls below market
        maxBid = Math.min(marketPrice - 1, remainingBudget * 0.2);
        targetBid = marketPrice - 3;
        minBid = marketPrice - 5;
        strategy = 'Only bid if price drops below market';
        break;
        
      case 'avoid':
        // Only at significant discount
        maxBid = Math.min(intrinsicValue, remainingBudget * 0.15);
        targetBid = intrinsicValue - 2;
        minBid = 1;
        strategy = 'Avoid unless significant discount';
        break;
        
      case 'strong-avoid':
        // Do not bid
        maxBid = 0;
        targetBid = 0;
        minBid = 0;
        strategy = 'Do not bid - significantly overpriced';
        break;
        
      default:
        maxBid = marketPrice;
        targetBid = marketPrice - 2;
        minBid = 1;
        strategy = 'Evaluate based on draft flow';
    }
    
    return {
      maxBid: Math.round(Math.max(0, maxBid)),
      targetBid: Math.round(Math.max(0, targetBid)),
      minBid: Math.round(Math.max(0, minBid)),
      strategy
    };
  }

  /**
   * Get nomination strategy based on edges
   */
  getNominationStrategy(
    edges: PlayerEdge[],
    myNeeds: string[],
    opponentNeeds: Map<string, string[]>
  ): {
    priceEnforcers: PlayerEdge[];  // Nominate to make others pay
    valuePlays: PlayerEdge[];       // Your targets
    strategy: string;
  } {
    // Price enforcers: Popular players you don't want
    const priceEnforcers = edges
      .filter(e => 
        e.recommendation === 'avoid' || 
        e.recommendation === 'strong-avoid'
      )
      .filter(e => e.marketPrice >= 20)  // Only expensive players
      .sort((a, b) => b.marketPrice - a.marketPrice)
      .slice(0, 5);
    
    // Value plays: Your targets
    const valuePlays = edges
      .filter(e => 
        e.recommendation === 'buy' || 
        e.recommendation === 'strong-buy'
      )
      .filter(e => myNeeds.includes(e.player.position))
      .sort((a, b) => b.edge - a.edge)
      .slice(0, 5);
    
    let strategy = '';
    if (priceEnforcers.length > 0) {
      strategy = 'Nominate expensive players you don\'t want to drain opponent budgets';
    } else if (valuePlays.length > 0) {
      strategy = 'Nominate your value targets while budgets are available';
    } else {
      strategy = 'Nominate fairly priced players at positions you don\'t need';
    }
    
    return {
      priceEnforcers,
      valuePlays,
      strategy
    };
  }
}