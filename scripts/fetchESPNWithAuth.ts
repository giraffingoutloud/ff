#!/usr/bin/env tsx

/**
 * Fetch ESPN Fantasy Football League Data with Authentication
 */

import { config } from 'dotenv';
import { ESPNDataFetcher } from '../src/services/espn/espnDataFetcher';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('========================================');
  console.log('ESPN Fantasy Football Data Fetcher');
  console.log('========================================\n');
  
  const leagueId = '1307390768';
  const year = 2025;
  const swid = process.env.ESPN_SWID;
  const espn_s2 = process.env.ESPN_S2;
  
  console.log(`League ID: ${leagueId}`);
  console.log(`Year: ${year}`);
  console.log(`Authentication: ${swid ? '✓ Found' : '✗ Missing'}`);
  
  if (!swid || !espn_s2) {
    console.error('\n❌ ESPN authentication cookies not found in .env.local');
    console.error('Please ensure ESPN_SWID and ESPN_S2 are set.');
    process.exit(1);
  }
  
  console.log('\n========================================');
  console.log('Starting Download...');
  console.log('========================================');
  
  try {
    // Create fetcher with authentication
    const fetcher = new ESPNDataFetcher({
      leagueId,
      year,
      swid,
      espn_s2
    });
    
    // Download all data
    await fetcher.downloadAllData();
    
    // Analyze draft if auction data exists
    await fetcher.analyzeDraft();
    
    console.log('\n🎉 Success! Your ESPN league data has been downloaded.');
    console.log('\nCheck the espn_data/ folder for:');
    console.log('  • League settings and team info');
    console.log('  • Draft results with auction prices');
    console.log('  • Transaction history');
    console.log('  • Player pool and rosters');
    console.log('  • Draft analysis with inflation curves');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);