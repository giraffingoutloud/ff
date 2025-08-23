#!/usr/bin/env tsx

/**
 * Simple Yahoo Fantasy Data Fetcher
 * Uses 2-legged OAuth (app-only) to fetch available data
 */

import { config } from 'dotenv';
import { YahooDataFetcherSimple } from '../src/services/yahoo/yahooDataFetcherSimple';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
config({ path: '.env.local' });

async function main() {
  console.log('========================================');
  console.log('Yahoo Fantasy Data Fetcher (App-Only)');
  console.log('========================================\n');
  
  // Check for credentials
  if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
    console.error('ERROR: Yahoo API credentials not found in .env.local');
    console.error('Please ensure YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET are set.');
    process.exit(1);
  }
  
  console.log('✓ Credentials found');
  console.log(`  Client ID: ${process.env.YAHOO_CLIENT_ID.substring(0, 20)}...`);
  console.log();
  
  try {
    // Create fetcher
    const fetcher = new YahooDataFetcherSimple({
      clientId: process.env.YAHOO_CLIENT_ID,
      clientSecret: process.env.YAHOO_CLIENT_SECRET
    });
    
    // Test connection first
    console.log('Testing connection...');
    const connected = await fetcher.testConnection();
    
    if (!connected) {
      console.error('\n✗ Could not connect to Yahoo Fantasy API');
      console.error('Please check your credentials and try again.');
      process.exit(1);
    }
    
    console.log('\n========================================');
    console.log('Starting Data Download');
    console.log('========================================\n');
    
    // Download all available data
    await fetcher.downloadAvailableData();
    
    // Create data directory path
    const dataDir = path.join(process.cwd(), 'yahoo_data');
    
    console.log('\n========================================');
    console.log('✓ Download Complete!');
    console.log('========================================');
    console.log(`\nData saved to: ${dataDir}`);
    console.log('\nWhat we downloaded:');
    console.log('  • NFL game/season information');
    console.log('  • Player pool data');
    console.log('  • Statistical categories');
    console.log('  • Position and roster metadata');
    console.log('\nLimitations:');
    console.log('  • Private league data requires user authentication');
    console.log('  • Draft results need 3-legged OAuth');
    console.log('  • Transaction history needs user auth');
    
    // List downloaded files
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      console.log(`\n${files.length} files downloaded:`);
      files.slice(0, 10).forEach(file => {
        const stat = fs.statSync(path.join(dataDir, file));
        console.log(`  • ${file} (${(stat.size / 1024).toFixed(1)} KB)`);
      });
      if (files.length > 10) {
        console.log(`  ... and ${files.length - 10} more files`);
      }
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);