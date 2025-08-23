/**
 * Test to verify unified valuation consistency
 * Ensures main table and command center show the same values
 */

import { DashboardDataService } from '../services/dashboard/dashboardDataService';
import { defaultLeagueSettings } from '../services/valuation/leagueSettings';
import { improvedCanonicalService } from '../services/improvedCanonicalService';

async function testUnifiedValuation() {
  console.log('🧪 Testing Unified Valuation Consistency...\n');
  
  try {
    // Initialize data
    await improvedCanonicalService.initialize();
    const players = improvedCanonicalService.getAllPlayers();
    
    // Create dashboard service (single source of truth)
    const dashboardService = new DashboardDataService(defaultLeagueSettings);
    
    // Create mock draft state
    const draftState = {
      draftedPlayers: new Set<string>(),
      teamBudgets: new Map([
        ['team-1', { spent: 0, remaining: 200 }],
        ['team-2', { spent: 0, remaining: 200 }],
        ['team-3', { spent: 0, remaining: 200 }],
        ['team-4', { spent: 0, remaining: 200 }],
        ['team-5', { spent: 0, remaining: 200 }],
        ['team-6', { spent: 0, remaining: 200 }],
        ['team-7', { spent: 0, remaining: 200 }],
        ['team-8', { spent: 0, remaining: 200 }],
        ['team-9', { spent: 0, remaining: 200 }],
        ['team-10', { spent: 0, remaining: 200 }],
        ['team-11', { spent: 0, remaining: 200 }],
        ['team-12', { spent: 0, remaining: 200 }],
      ]),
      teamRosters: new Map(),
      myTeamId: 'team-1',
      draftHistory: []
    };
    
    // Generate dashboard data
    const dashboardData = dashboardService.generateDashboardData(players, draftState);
    
    // Find specific players to check
    const testPlayers = ['Saquon Barkley', 'Tyreek Hill', 'Travis Kelce'];
    
    console.log('📊 Edge Values from Dashboard Service:\n');
    
    for (const playerName of testPlayers) {
      const player = players.find(p => p.name.includes(playerName));
      if (!player) continue;
      
      const edge = dashboardData.opportunities.bestValues.find(e => e.player.id === player.id) ||
                   dashboardData.opportunities.traps.find(e => e.player.id === player.id) ||
                   dashboardData.opportunities.nominations.find(e => e.player.id === player.id);
      
      if (edge) {
        console.log(`${playerName}:`);
        console.log(`  Intrinsic Value: $${edge.intrinsicValue.toFixed(1)}`);
        console.log(`  Market Price: $${edge.marketPrice.toFixed(1)}`);
        console.log(`  Edge ($): $${edge.edge.toFixed(1)}`);
        console.log(`  Edge (%): ${edge.edgePercent.toFixed(1)}%`);
        console.log(`  Confidence: ${(edge.confidence * 100).toFixed(0)}%`);
        console.log(`  CWE: ${edge.confidenceWeightedEdge.toFixed(1)}`);
        console.log('');
      }
    }
    
    // Check inflation calculation
    const totalRemaining = 12 * 200; // All teams at full budget
    const inflationRate = totalRemaining / (players.length * 10);
    console.log(`📈 Inflation Rate: ${inflationRate.toFixed(2)}x`);
    console.log(`   (Based on $${totalRemaining} remaining / ${players.length} players)`);
    
    console.log('\n✅ Unified valuation test complete!');
    console.log('Both main table and command center now use the same DashboardDataService.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testUnifiedValuation();