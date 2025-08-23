#!/usr/bin/env tsx

/**
 * Download ALL available Yahoo Fantasy data
 * Run with: npm run fetch:yahoo:all
 */

import { config } from 'dotenv';
import { YahooComprehensiveFetcher } from '../src/services/yahoo/yahooComprehensiveFetcher';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('========================================');
  console.log('Yahoo Fantasy Comprehensive Data Fetcher');
  console.log('========================================\n');
  
  // Check for credentials
  if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
    console.error('ERROR: Yahoo API credentials not found in .env.local');
    process.exit(1);
  }
  
  console.log('✓ Credentials found');
  console.log(`  Client ID: ${process.env.YAHOO_CLIENT_ID.substring(0, 20)}...`);
  console.log(`  Client Secret: ${process.env.YAHOO_CLIENT_SECRET.substring(0, 10)}...`);
  console.log();
  
  try {
    // Create fetcher
    const fetcher = new YahooComprehensiveFetcher({
      clientId: process.env.YAHOO_CLIENT_ID,
      clientSecret: process.env.YAHOO_CLIENT_SECRET
    });
    
    // Download everything
    const stats = await fetcher.downloadEverything();
    
    // Create summary report
    const dataDir = path.join(process.cwd(), 'yahoo_data');
    const summaryPath = path.join(dataDir, 'download_summary.json');
    
    const summary = {
      downloadDate: new Date().toISOString(),
      stats,
      credentials: {
        clientId: process.env.YAHOO_CLIENT_ID?.substring(0, 20) + '...',
      },
      files: fs.readdirSync(dataDir).map(file => {
        const stat = fs.statSync(path.join(dataDir, file));
        return {
          name: file,
          size: stat.size,
          modified: stat.mtime
        };
      })
    };
    
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('\n✅ Download complete!');
    console.log(`Summary saved to: ${summaryPath}`);
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);