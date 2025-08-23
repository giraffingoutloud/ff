#!/usr/bin/env tsx

/**
 * Fetch ESPN Fantasy Football League Data - Automated version
 * Run with: npm run fetch:espn:auto
 */

import { config } from 'dotenv';
import { ESPNDataFetcher } from '../src/services/espn/espnDataFetcher';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('========================================');
  console.log('ESPN Fantasy Football Data Fetcher');
  console.log('========================================\n');
  
  // Get league ID from command line or environment
  const leagueId = process.argv[2] || process.env.ESPN_LEAGUE_ID || '1307390768';
  const year = parseInt(process.argv[3] || process.env.ESPN_YEAR || '2024');
  const swid = process.argv[4] || process.env.ESPN_SWID;
  const espn_s2 = process.argv[5] || process.env.ESPN_S2;
  
  console.log(`League ID: ${leagueId}`);
  console.log(`Year: ${year}`);
  console.log(`Private League: ${swid ? 'Yes' : 'No (Public)'}`);
  
  console.log('\n========================================');
  console.log('Starting Download...');
  console.log('========================================');
  
  try {
    // Create fetcher
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
    console.log('\nNext steps:');
    console.log('1. Check the espn_data/ folder for downloaded files');
    console.log('2. Review draft_analysis_*.json for auction insights');
    console.log('3. Use this data to improve the inflation model');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error(error);
  process.exit(1);
});