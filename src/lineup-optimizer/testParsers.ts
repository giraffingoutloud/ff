/**
 * Test data parsers
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  parseQBSOS,
  parsePowerRatings,
  parseHistoricalStats,
  parseADP,
  parseOffenseProjections
} from './data/parsers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function testParsers() {
  console.log('=== Testing Data Parsers ===\n');
  
  const dataPath = path.join(__dirname, '../../canonical_data');
  
  try {
    // Test QB SOS parser
    console.log('1. Testing QB SOS parser...');
    const qbPath = path.join(dataPath, 'other/qb-fantasy-sos.csv');
    const qbsos = parseQBSOS(qbPath);
    console.log(`   ✓ Loaded ${qbsos.length} QB SOS entries`);
    if (qbsos.length > 0) {
      const sample = qbsos[0];
      console.log(`   Sample: ${sample.name} (${sample.team}) - Overall: ${sample.ovr}`);
    }
    
    // Test Power Ratings parser
    console.log('\n2. Testing Power Ratings parser...');
    const powerPath = path.join(dataPath, 'other/nfl-power-ratings.csv');
    const power = parsePowerRatings(powerPath);
    console.log(`   ✓ Loaded ${power.length} team power ratings`);
    if (power.length > 0) {
      const sample = power[0];
      console.log(`   Sample: ${sample.team} - Offense: ${sample.offenseRating}, Defense: ${sample.defenseRating}`);
    }
    
    // Test Historical Stats parser
    console.log('\n3. Testing Historical Stats parser...');
    const statsPath = path.join(dataPath, 'historical_stats/fantasy-stats-passing_2024.csv');
    const stats = parseHistoricalStats(statsPath);
    console.log(`   ✓ Loaded ${stats.length} historical stats`);
    if (stats.length > 0) {
      const sample = stats[0];
      console.log(`   Sample: ${sample.player} - Points: ${sample.fantasyPoints}, Games: ${sample.games}`);
    }
    
    // Test ADP parser
    console.log('\n4. Testing ADP parser...');
    const adpPath = path.join(dataPath, 'adp/adp0_2025.csv');
    const adp = parseADP(adpPath);
    console.log(`   ✓ Loaded ${adp.length} ADP entries`);
    if (adp.length > 0) {
      const sample = adp[0];
      console.log(`   Sample: ${sample.name} (${sample.position}) - ADP: ${sample.adp}, Value: $${sample.auctionValue}`);
    }
    
    // Test Offense Projections parser
    console.log('\n5. Testing Offense Projections parser...');
    const projPath = path.join(dataPath, 'projections/offense_projections_2025.csv');
    const proj = parseOffenseProjections(projPath);
    console.log(`   ✓ Loaded ${proj.length} projections`);
    if (proj.length > 0) {
      const sample = proj[0];
      console.log(`   Sample: ${sample.name} (${sample.position}) - Points: ${sample.points}, Team: ${sample.team}`);
    }
    
    // Check position distribution
    const positions = new Map<string, number>();
    proj.forEach(p => {
      positions.set(p.position, (positions.get(p.position) || 0) + 1);
    });
    console.log('\n   Position distribution:');
    positions.forEach((count, pos) => {
      console.log(`     ${pos}: ${count} players`);
    });
    
    console.log('\n=== All Parsers Working ✓ ===');
    
  } catch (error) {
    console.error('\n❌ Parser test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
testParsers();