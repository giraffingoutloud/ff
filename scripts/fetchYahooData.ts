#!/usr/bin/env tsx

/**
 * Script to authenticate with Yahoo and download all fantasy data
 * Run with: npm run fetch:yahoo
 */

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { YahooAuthHandler } from '../src/services/yahoo/yahooAuth';
import { YahooDataFetcher } from '../src/services/yahoo/yahooDataFetcher';
import { YahooDataAnalyzer } from '../src/services/yahoo/yahooDataAnalyzer';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('========================================');
  console.log('Yahoo Fantasy Data Downloader');
  console.log('========================================\n');
  
  // Check for credentials
  if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
    console.error('ERROR: Yahoo API credentials not found in .env.local');
    console.error('Please ensure YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET are set.');
    process.exit(1);
  }
  
  try {
    // Step 1: Authenticate
    console.log('STEP 1: Authentication');
    console.log('----------------------');
    
    const auth = new YahooAuthHandler(
      process.env.YAHOO_CLIENT_ID,
      process.env.YAHOO_CLIENT_SECRET
    );
    
    const tokens = await auth.authenticate();
    
    console.log('\n✓ Authentication successful!\n');
    
    // Step 2: Download data
    console.log('STEP 2: Downloading Fantasy Data');
    console.log('---------------------------------');
    console.log('This will download:');
    console.log('  • All your league draft results (with actual auction prices!)');
    console.log('  • Transaction history (bids, trades, waivers)');
    console.log('  • League settings and scoring');
    console.log('  • Player costs and ownership data');
    console.log('  • Team rosters with values');
    console.log('  • Historical stats for trend analysis\n');
    
    const fetcher = new YahooDataFetcher({
      clientId: process.env.YAHOO_CLIENT_ID,
      clientSecret: process.env.YAHOO_CLIENT_SECRET,
      accessToken: tokens.oauth_token,
      accessTokenSecret: tokens.oauth_token_secret
    });
    
    // Create data directory
    const dataDir = path.join(process.cwd(), 'yahoo_data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Download everything
    await fetcher.downloadAllData();
    
    // Step 3: Analyze
    console.log('\nSTEP 3: Data Analysis');
    console.log('---------------------');
    
    const analyzer = new YahooDataAnalyzer();
    analyzer.generateReport();
    
    console.log('\n========================================');
    console.log('✓ Data download complete!');
    console.log('========================================');
    console.log(`\nAll data saved to: ${dataDir}`);
    console.log('\nYou can now analyze the data to improve the inflation model.');
    console.log('\nKey files to examine:');
    console.log('  • draft_*.json - Actual auction prices paid');
    console.log('  • transactions_*.json - Bidding patterns');
    console.log('  • analysis_report.json - Statistical summary');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure your Yahoo app is configured for Fantasy Read access');
    console.error('2. Check that the callback URL is set to http://localhost:8080/callback');
    console.error('3. Try deleting yahoo_tokens.json and re-authenticating');
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);