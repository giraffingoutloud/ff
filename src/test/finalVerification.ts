/**
 * Final verification that our valuation system uses correct data
 */

import { improvedCanonicalService } from '../services/improvedCanonicalService';
import { IntrinsicValueEngine } from '../services/valuation/intrinsicValueEngine';
import { MarketPriceModel } from '../services/valuation/marketPriceModel';
import { EdgeCalculator } from '../services/edge/edgeCalculator';
import { defaultLeagueSettings } from '../services/valuation/leagueSettings';

export async function verifyValuationSystem() {
  console.log('='.repeat(70));
  console.log('FINAL VERIFICATION: VALUATION SYSTEM ACCURACY');
  console.log('='.repeat(70));
  
  // Initialize data
  const players = await improvedCanonicalService.initialize();
  console.log(`\nLoaded ${players.length} players`);
  
  // Initialize valuation components
  const intrinsicEngine = new IntrinsicValueEngine(defaultLeagueSettings);
  const marketModel = new MarketPriceModel(defaultLeagueSettings);
  const edgeCalculator = new EdgeCalculator();
  
  // Test top players
  const testPlayers = ["Ja'Marr Chase", "Bijan Robinson", "Justin Jefferson"];
  
  console.log('\n' + '-'.repeat(50));
  console.log('PLAYER VALUATIONS:');
  console.log('-'.repeat(50));
  
  for (const name of testPlayers) {
    const player = players.find(p => p.name === name);
    if (!player) {
      console.log(`\n${name}: NOT FOUND`);
      continue;
    }
    
    console.log(`\n${name} (${player.position}):`);
    console.log(`  ESPN ADP: ${player.adp?.toFixed(2) || 'N/A'}`);
    console.log(`  Auction Value: $${player.auctionValue || 'N/A'}`);
    console.log(`  Projected Points: ${player.projectedPoints?.toFixed(1) || 'N/A'}`);
    
    // Calculate intrinsic value
    const intrinsicValue = intrinsicEngine.calculateValue(player, players);
    console.log(`  Intrinsic Value: $${intrinsicValue.dollarValue.toFixed(0)}`);
    console.log(`  VORP: ${intrinsicValue.vorp.toFixed(1)}`);
    
    // Calculate market price
    const marketContext = {
      draftedPlayers: [],
      remainingPlayers: players,
      remainingBudget: defaultLeagueSettings.budget * defaultLeagueSettings.numTeams,
      totalRemainingBudget: defaultLeagueSettings.budget * defaultLeagueSettings.numTeams,
      myRemainingBudget: defaultLeagueSettings.budget,
      averageRemainingBudget: defaultLeagueSettings.budget
    };
    
    const marketPrice = marketModel.predictPrice(player, marketContext);
    console.log(`  Market Price: $${marketPrice.price.toFixed(0)}`);
    console.log(`  Price Range: $${marketPrice.priceRange.min}-${marketPrice.priceRange.max}`);
    console.log(`  Confidence: ${(marketPrice.confidence * 100).toFixed(0)}%`);
    
    // Calculate edge
    const edge = edgeCalculator.calculateEdge(intrinsicValue, marketPrice);
    console.log(`  Edge: ${(edge.percentage * 100).toFixed(1)}%`);
    console.log(`  Recommendation: ${edge.recommendation}`);
    console.log(`  CWE Score: ${edge.confidenceWeightedEdge.toFixed(1)}`);
  }
  
  // Verify data sources
  console.log('\n' + '-'.repeat(50));
  console.log('DATA SOURCE VERIFICATION:');
  console.log('-'.repeat(50));
  
  const withESPNADP = players.filter(p => p.adp && p.adp > 0 && p.adp < 50).slice(0, 5);
  console.log('\nPlayers with ESPN ADP < 50:');
  withESPNADP.forEach(p => {
    console.log(`  ${p.name}: ADP ${p.adp?.toFixed(2)}, Auction $${p.auctionValue}`);
  });
  
  // Check for reasonable values
  const unreasonableADP = players.filter(p => p.adp && p.adp > 0 && p.adp < 1);
  if (unreasonableADP.length > 0) {
    console.log('\n⚠ WARNING: Found players with ADP < 1:');
    unreasonableADP.forEach(p => {
      console.log(`  ${p.name}: ${p.adp}`);
    });
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(70));
  
  return {
    totalPlayers: players.length,
    withADP: players.filter(p => p.adp && p.adp > 0 && p.adp < 500).length,
    withAuction: players.filter(p => p.auctionValue && p.auctionValue > 0).length
  };
}

// Make available globally for browser testing
if (typeof window !== 'undefined') {
  (window as any).verifyValuationSystem = verifyValuationSystem;
}