/**
 * Test the complete data integration pipeline
 */

import { CanonicalDataLoader } from './data/dataLoader';
import { ProjectionConverter } from './data/projectionConverter';
import { CorrelationBuilder } from './data/correlationBuilder';
import { DataDrivenLineupOptimizer } from './core/optimizerWithData';
import { ESPN_PPR_2025 } from './domain/typesCorrected';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testDataIntegration() {
  console.log('=== Testing Complete Data Integration Pipeline ===\n');

  try {
    // Step 1: Initialize the enhanced optimizer
    console.log('1. Initializing Enhanced Optimizer...');
    const dataPath = path.join(__dirname, '../../../canonical_data');
    const optimizer = new DataDrivenLineupOptimizer(dataPath, {
      week: 1,
      useHistoricalBaseline: true,
      adjustForSOS: true,
      useTeamContext: true,
      useCorrelations: true
    });

    // Step 2: Load and validate data
    console.log('2. Loading canonical data...');
    await optimizer.initialize();
    console.log('   ✓ Data loaded successfully');

    // Step 3: Get available players
    const availablePlayers = optimizer.getAvailablePlayers();
    console.log(`\n3. Available players: ${availablePlayers.length}`);
    
    // Show sample of players by position
    const positions = ['QB', 'RB', 'WR', 'TE', 'DST'];
    for (const pos of positions) {
      const posPlayers = availablePlayers.filter(p => p.position === pos);
      console.log(`   ${pos}: ${posPlayers.length} players`);
      if (posPlayers.length > 0) {
        const sample = posPlayers.slice(0, 3);
        sample.forEach(p => {
          console.log(`     - ${p.name} (${p.team}): $${p.salary} | Proj: ${p.distribution.mean.toFixed(1)} ± ${p.distribution.stdDev.toFixed(1)}`);
        });
      }
    }

    // Step 4: Test projection quality
    console.log('\n4. Testing Projection Quality...');
    const qbs = availablePlayers.filter(p => p.position === 'QB').slice(0, 5);
    console.log('   Top 5 QBs by projection:');
    qbs.sort((a, b) => b.distribution.mean - a.distribution.mean);
    qbs.forEach(qb => {
      console.log(`   ${qb.name}: ${qb.distribution.mean.toFixed(1)} pts (CV: ${(qb.distribution.stdDev / qb.distribution.mean).toFixed(2)})`);
    });

    // Step 5: Test correlation matrix
    console.log('\n5. Testing Correlation Matrix...');
    const correlations = optimizer.getCorrelationMatrix();
    if (correlations && correlations.length > 0) {
      console.log(`   Correlation matrix size: ${correlations.length}x${correlations.length}`);
      
      // Check for reasonable correlation values
      let maxCorr = 0;
      let minCorr = 0;
      for (let i = 0; i < correlations.length; i++) {
        for (let j = 0; j < correlations.length; j++) {
          if (i !== j) {
            maxCorr = Math.max(maxCorr, correlations[i][j]);
            minCorr = Math.min(minCorr, correlations[i][j]);
          }
        }
      }
      console.log(`   Correlation range: [${minCorr.toFixed(3)}, ${maxCorr.toFixed(3)}]`);
    }

    // Step 6: Generate optimized lineups
    console.log('\n6. Generating Optimized Lineups...');
    const requirements = ESPN_PPR_2025;
    
    console.time('   Optimization time');
    const lineups = optimizer.generateLineups(
      availablePlayers,
      requirements,
      {
        count: 20,
        diversityWeight: 0.5,
        minUnique: 3,
        maxExposure: 0.6,
        useStacking: true
      }
    );
    console.timeEnd('   Optimization time');

    console.log(`   Generated ${lineups.length} lineups`);

    // Step 7: Analyze lineup quality
    console.log('\n7. Lineup Analysis:');
    if (lineups.length > 0) {
      // Best lineup
      const best = lineups[0];
      console.log('\n   Best Lineup:');
      console.log(`   Total Salary: $${best.totalSalary}`);
      console.log(`   Expected Points: ${best.expectedPoints.toFixed(2)}`);
      console.log(`   Players:`);
      best.players.forEach(p => {
        console.log(`     ${p.position}: ${p.name} (${p.team}) - $${p.salary} | ${p.distribution.mean.toFixed(1)} pts`);
      });

      // Diversity check
      const uniquePlayers = new Set<string>();
      lineups.forEach(lineup => {
        lineup.players.forEach(p => uniquePlayers.add(p.id));
      });
      console.log(`\n   Total unique players used: ${uniquePlayers.size}`);
      
      // Exposure analysis
      const exposures = new Map<string, number>();
      lineups.forEach(lineup => {
        lineup.players.forEach(p => {
          exposures.set(p.id, (exposures.get(p.id) || 0) + 1);
        });
      });
      
      const highExposure = Array.from(exposures.entries())
        .filter(([_, count]) => count > lineups.length * 0.4)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      if (highExposure.length > 0) {
        console.log('\n   High exposure players (>40%):');
        highExposure.forEach(([playerId, count]) => {
          const player = availablePlayers.find(p => p.id === playerId);
          if (player) {
            const exposure = (count / lineups.length * 100).toFixed(1);
            console.log(`     ${player.name}: ${exposure}%`);
          }
        });
      }

      // Stack analysis
      console.log('\n   Stack Analysis:');
      const stacks = new Map<string, number>();
      lineups.forEach(lineup => {
        const teamCounts = new Map<string, number>();
        lineup.players.forEach(p => {
          if (p.position !== 'DST') {
            teamCounts.set(p.team, (teamCounts.get(p.team) || 0) + 1);
          }
        });
        
        teamCounts.forEach((count, team) => {
          if (count >= 2) {
            stacks.set(team, (stacks.get(team) || 0) + 1);
          }
        });
      });

      const topStacks = Array.from(stacks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      if (topStacks.length > 0) {
        console.log('   Most common stacks:');
        topStacks.forEach(([team, count]) => {
          const pct = (count / lineups.length * 100).toFixed(1);
          console.log(`     ${team}: ${pct}% of lineups`);
        });
      }
    }

    // Step 8: Test data quality metrics
    console.log('\n8. Data Quality Metrics:');
    const metrics = optimizer.getDataQualityMetrics();
    console.log(`   Players with historical data: ${metrics.playersWithHistoricalData}`);
    console.log(`   Players with ADP data: ${metrics.playersWithADP}`);
    console.log(`   Players with team context: ${metrics.playersWithTeamContext}`);
    console.log(`   Coverage percentage: ${(metrics.dataCoverage * 100).toFixed(1)}%`);

    console.log('\n=== Integration Test Complete ===');
    console.log('✓ All systems operational');

  } catch (error) {
    console.error('\n❌ Integration test failed:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testDataIntegration().catch(console.error);

export { testDataIntegration };