/**
 * Test script to verify dual ADP loading
 * - ESPN ADP from adp1_2025.csv
 * - Auction values from adp0_2025.csv
 */

import { improvedCanonicalService } from '../services/improvedCanonicalService';

async function testDualADP() {
  console.log('='.repeat(70));
  console.log('TESTING DUAL ADP LOADING');
  console.log('='.repeat(70));
  
  // Initialize service
  console.log('\nInitializing service...');
  const players = await improvedCanonicalService.initialize();
  
  console.log(`\nTotal players loaded: ${players.length}`);
  
  // Check some top players
  const topPlayers = ['Ja\'Marr Chase', 'Bijan Robinson', 'Justin Jefferson', 'CeeDee Lamb', 'Tyreek Hill'];
  
  console.log('\n' + '='.repeat(50));
  console.log('TOP PLAYER ADP & AUCTION VALUES:');
  console.log('='.repeat(50));
  console.log('Player Name         | ESPN ADP | Auction Value');
  console.log('-'.repeat(50));
  
  for (const name of topPlayers) {
    const player = players.find(p => p.name === name);
    if (player) {
      const adpStr = player.adp ? player.adp.toFixed(1) : 'N/A';
      const auctionStr = player.auctionValue ? `$${player.auctionValue}` : 'N/A';
      console.log(`${name.padEnd(18)} | ${adpStr.padStart(8)} | ${auctionStr.padStart(13)}`);
    } else {
      console.log(`${name.padEnd(18)} | NOT FOUND`);
    }
  }
  
  // Check distribution of ADPs
  const withESPNADP = players.filter(p => p.adp && p.adp > 0 && p.adp < 300).length;
  const withAuction = players.filter(p => p.auctionValue && p.auctionValue > 0).length;
  
  console.log('\n' + '='.repeat(50));
  console.log('DATA COVERAGE:');
  console.log('='.repeat(50));
  console.log(`Players with ESPN ADP (< 300): ${withESPNADP}`);
  console.log(`Players with Auction Values: ${withAuction}`);
  
  // Check if ESPN ADPs are different from generic ADPs
  // Load raw data to compare
  console.log('\n' + '='.repeat(50));
  console.log('VERIFYING ESPN-SPECIFIC ADP:');
  console.log('='.repeat(50));
  
  // Sample a few players to show difference
  const samplePlayers = players
    .filter(p => p.adp && p.adp > 0 && p.adp < 50)
    .slice(0, 5);
  
  console.log('Showing first 5 players with ADP < 50:');
  console.log('Player Name         | ESPN ADP | Position');
  console.log('-'.repeat(50));
  
  for (const player of samplePlayers) {
    console.log(`${player.name.padEnd(18)} | ${player.adp!.toFixed(1).padStart(8)} | ${player.position}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70));
}

// Run test
testDualADP().catch(console.error);