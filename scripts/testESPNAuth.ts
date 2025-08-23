#!/usr/bin/env tsx

/**
 * Test ESPN authentication
 */

import { config } from 'dotenv';
import axios from 'axios';

// Load environment variables
config({ path: '.env.local' });

async function testAuth() {
  const leagueId = '1307390768';
  const year = 2024;
  const swid = process.env.ESPN_SWID;
  const espn_s2 = process.env.ESPN_S2;
  
  console.log('Testing ESPN Authentication...\n');
  console.log('Credentials:');
  console.log(`SWID: ${swid?.substring(0, 20)}...`);
  console.log(`espn_s2 (first 30 chars): ${espn_s2?.substring(0, 30)}...`);
  console.log(`espn_s2 length: ${espn_s2?.length}`);
  
  // URL decode the espn_s2 if needed
  const decodedS2 = espn_s2 ? decodeURIComponent(espn_s2) : '';
  console.log(`\nDecoded espn_s2 (first 30): ${decodedS2.substring(0, 30)}...`);
  console.log(`Decoded length: ${decodedS2.length}`);
  
  // Test basic API call
  const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}`;
  
  console.log(`\nTesting URL: ${url}`);
  
  try {
    // Test without auth
    console.log('\n1. Testing without authentication...');
    const response1 = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      validateStatus: () => true
    });
    console.log(`   Status: ${response1.status}`);
    console.log(`   Content-Type: ${response1.headers['content-type']}`);
    console.log(`   Data type: ${typeof response1.data}`);
    if (typeof response1.data === 'string') {
      console.log(`   HTML response (login page): ${response1.data.substring(0, 100)}...`);
    } else if (response1.data?.teams) {
      console.log(`   ✓ Got league data! Teams: ${response1.data.teams?.length}`);
    }
    
    // Test with auth
    console.log('\n2. Testing with authentication...');
    const response2 = await axios.get(url, {
      headers: {
        'Cookie': `SWID=${swid}; espn_s2=${decodedS2}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      validateStatus: () => true
    });
    console.log(`   Status: ${response2.status}`);
    console.log(`   Content-Type: ${response2.headers['content-type']}`);
    console.log(`   Data type: ${typeof response2.data}`);
    if (typeof response2.data === 'string') {
      console.log(`   HTML response: ${response2.data.substring(0, 100)}...`);
    } else if (response2.data?.teams) {
      console.log(`   ✓ Got league data! Teams: ${response2.data.teams?.length}`);
      console.log(`   League name: ${response2.data.settings?.name}`);
    }
    
    // Test with different view parameter
    console.log('\n3. Testing with view parameters...');
    const response3 = await axios.get(url, {
      params: {
        view: ['mDraftDetail', 'mSettings', 'mTeam']
      },
      headers: {
        'Cookie': `SWID=${swid}; espn_s2=${decodedS2}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      validateStatus: () => true
    });
    console.log(`   Status: ${response3.status}`);
    if (response3.data?.draftDetail) {
      console.log(`   ✓ Got draft data! Picks: ${response3.data.draftDetail?.picks?.length}`);
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testAuth().catch(console.error);