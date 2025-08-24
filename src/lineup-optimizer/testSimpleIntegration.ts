/**
 * Simple test for data integration
 */

import { DataDrivenLineupOptimizer } from './core/optimizerWithData';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testSimpleIntegration() {
  console.log('=== Testing Data Integration ===\n');

  try {
    // Step 1: Initialize optimizer with data path
    console.log('1. Initializing optimizer...');
    const dataPath = path.join(__dirname, '../../canonical_data');
    const optimizer = new DataDrivenLineupOptimizer(dataPath);

    // Step 2: Initialize data
    console.log('2. Loading data...');
    await optimizer.initialize();
    console.log('   ✓ Data loaded');

    // Step 3: Check available players by position
    console.log('\n3. Checking available players:');
    const positions = ['QB', 'RB', 'WR', 'TE'];
    
    for (const pos of positions) {
      const players = optimizer.getAvailablePlayersByPosition(pos);
      console.log(`   ${pos}: ${players.length} players`);
      
      // Show top 3 players
      if (players.length > 0) {
        const top3 = players
          .sort((a, b) => (b.projection?.points || 0) - (a.projection?.points || 0))
          .slice(0, 3);
        
        top3.forEach(p => {
          const pts = p.projection?.points || 0;
          const name = p.projection?.name || 'Unknown';
          console.log(`     - ${name}: ${pts.toFixed(1)} pts`);
        });
      }
    }

    // Step 4: Test optimization
    console.log('\n4. Running optimization...');
    const result = await optimizer.optimize({
      myRoster: [],
      opponentRoster: [],
      week: 1,
      useCorrelations: false
    });

    console.log(`   Generated ${result.lineups.length} lineups`);
    
    if (result.lineups.length > 0) {
      const best = result.lineups[0];
      console.log('\n   Best lineup:');
      console.log(`   Expected: ${best.expectedPoints.toFixed(1)} pts`);
      console.log(`   Players: ${best.players.length}`);
      
      best.players.forEach(p => {
        console.log(`     ${p.position}: ${p.name} - ${p.distribution.mean.toFixed(1)} pts`);
      });
    }

    // Step 5: Test lineup validation
    console.log('\n5. Testing lineup validation...');
    const testRoster = ['Josh Allen', 'Christian McCaffrey', 'Justin Jefferson'];
    const validation = optimizer.validateLineup(testRoster, 1);
    
    console.log(`   Valid: ${validation.valid}`);
    if (!validation.valid) {
      console.log(`   Errors: ${validation.errors.join(', ')}`);
    }
    if (validation.byeWeekConflicts.length > 0) {
      console.log(`   Bye conflicts: ${validation.byeWeekConflicts.join(', ')}`);
    }

    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Details:', error.message);
    }
    process.exit(1);
  }
}

// Run test
testSimpleIntegration().catch(console.error);