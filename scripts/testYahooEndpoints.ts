#!/usr/bin/env tsx

/**
 * Test Yahoo API endpoints to verify correct URLs
 */

import axios from 'axios';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function testEndpoints() {
  console.log('Testing Yahoo API Endpoints...\n');
  
  const endpoints = [
    'https://api.login.yahoo.com/oauth/v2/get_request_token',
    'https://api.login.yahoo.com/oauth2/get_request_token',
    'https://api.yahoo.com/oauth/v2/get_request_token',
    'https://fantasysports.yahooapis.com/fantasy/v2/game/nfl'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint}`);
      const response = await axios.get(endpoint, {
        validateStatus: () => true,
        timeout: 5000
      });
      console.log(`  Status: ${response.status}`);
      console.log(`  Headers: ${JSON.stringify(response.headers['www-authenticate'] || 'none')}`);
    } catch (error: any) {
      console.log(`  Error: ${error.message}`);
    }
    console.log();
  }
  
  console.log('\nCredentials Check:');
  console.log(`Client ID: ${process.env.YAHOO_CLIENT_ID ? '✓ Found' : '✗ Missing'}`);
  console.log(`Client Secret: ${process.env.YAHOO_CLIENT_SECRET ? '✓ Found' : '✗ Missing'}`);
  
  if (process.env.YAHOO_CLIENT_ID) {
    console.log(`\nClient ID format: ${process.env.YAHOO_CLIENT_ID.substring(0, 10)}...`);
    console.log(`Looks like OAuth 1.0a format: ${process.env.YAHOO_CLIENT_ID.includes('dj0yJmk=') ? 'Yes' : 'No'}`);
  }
}

testEndpoints().catch(console.error);