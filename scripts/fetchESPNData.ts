#!/usr/bin/env tsx

/**
 * Fetch ESPN Fantasy Football League Data
 * Run with: npm run fetch:espn
 */

import { config } from 'dotenv';
import { ESPNDataFetcher } from '../src/services/espn/espnDataFetcher';
import * as readline from 'readline';

// Load environment variables
config({ path: '.env.local' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('========================================');
  console.log('ESPN Fantasy Football Data Fetcher');
  console.log('========================================\n');
  
  try {
    // Get league information from user
    const leagueId = await question('Enter your ESPN League ID: ');
    
    if (!leagueId) {
      console.error('League ID is required!');
      process.exit(1);
    }
    
    const yearStr = await question('Enter the year (default: 2024): ') || '2024';
    const year = parseInt(yearStr);
    
    console.log('\nIs your league private? (requires authentication)');
    const isPrivate = (await question('Private league? (y/n): ')).toLowerCase() === 'y';
    
    let swid, espn_s2;
    
    if (isPrivate) {
      console.log('\n📝 To get authentication cookies:');
      console.log('1. Open ESPN Fantasy in your browser');
      console.log('2. Log in to your account');
      console.log('3. Open Developer Tools (F12)');
      console.log('4. Go to Application/Storage → Cookies');
      console.log('5. Find "SWID" and "espn_s2" cookies\n');
      
      swid = await question('Enter SWID cookie value: ');
      espn_s2 = await question('Enter espn_s2 cookie value: ');
    }
    
    rl.close();
    
    console.log('\n========================================');
    console.log('Starting Download...');
    console.log('========================================');
    
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
    rl.close();
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error(error);
  rl.close();
  process.exit(1);
});