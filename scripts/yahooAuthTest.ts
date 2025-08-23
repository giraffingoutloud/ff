#!/usr/bin/env tsx

/**
 * Comprehensive Yahoo API Authentication Test
 * Tests both OAuth 1.0a and OAuth 2.0 approaches
 */

import { config } from 'dotenv';
import axios from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

config({ path: '.env.local' });

const CLIENT_ID = process.env.YAHOO_CLIENT_ID!;
const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET!;

console.log('========================================');
console.log('Yahoo API Authentication Test');
console.log('========================================\n');

console.log('Credentials:');
console.log(`Client ID: ${CLIENT_ID.substring(0, 20)}...`);
console.log(`Client Secret: ${CLIENT_SECRET.substring(0, 10)}...`);
console.log();

// Test 1: Direct API call with OAuth 1.0a signature
async function testOAuth1Direct() {
  console.log('Test 1: Direct Fantasy API call with OAuth 1.0a');
  console.log('-------------------------------------------------');
  
  const oauth = new OAuth({
    consumer: {
      key: CLIENT_ID,
      secret: CLIENT_SECRET
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string: string, key: string) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    }
  });
  
  const url = 'https://fantasysports.yahooapis.com/fantasy/v2/game/nfl';
  const request_data = {
    url: url,
    method: 'GET'
  };
  
  try {
    // Without token (app-only auth)
    const headers = oauth.toHeader(oauth.authorize(request_data));
    
    console.log('Request headers:', JSON.stringify(headers, null, 2));
    
    const response = await axios.get(url, {
      headers: {
        ...headers,
        'Accept': 'application/json'
      },
      validateStatus: () => true
    });
    
    console.log(`Response status: ${response.status}`);
    if (response.status === 200) {
      console.log('✓ Success! OAuth 1.0a app authentication works');
      console.log('Response preview:', JSON.stringify(response.data).substring(0, 200));
    } else if (response.status === 401) {
      console.log('✗ Authentication failed');
      console.log('Error:', response.data);
      console.log('\nThis likely means user authentication is required (3-legged OAuth)');
    }
  } catch (error: any) {
    console.log('✗ Request failed:', error.message);
  }
  console.log();
}

// Test 2: Check OAuth endpoints
async function testOAuthEndpoints() {
  console.log('Test 2: OAuth Endpoint Discovery');
  console.log('---------------------------------');
  
  const endpoints = [
    // OAuth 1.0a endpoints
    { url: 'https://api.login.yahoo.com/oauth/v2/get_request_token', version: '1.0a' },
    { url: 'https://api.login.yahoo.com/oauth/v2/get_token', version: '1.0a' },
    
    // OAuth 2.0 endpoints
    { url: 'https://api.login.yahoo.com/oauth2/request_auth', version: '2.0' },
    { url: 'https://api.login.yahoo.com/oauth2/get_token', version: '2.0' },
    
    // Alternative paths
    { url: 'https://auth.login.yahoo.com/oauth/v2/get_request_token', version: '1.0a alt' },
    { url: 'https://login.yahoo.com/oauth/v2/get_request_token', version: '1.0a alt2' }
  ];
  
  for (const { url, version } of endpoints) {
    try {
      const response = await axios.head(url, {
        validateStatus: () => true,
        timeout: 3000
      });
      console.log(`[${version}] ${url}`);
      console.log(`  Status: ${response.status} ${response.status === 405 ? '(Method not allowed - endpoint exists!)' : ''}`);
    } catch (error: any) {
      console.log(`[${version}] ${url}`);
      console.log(`  Error: ${error.code || error.message}`);
    }
  }
  console.log();
}

// Test 3: Try to get request token with OAuth 1.0a
async function testOAuth1RequestToken() {
  console.log('Test 3: OAuth 1.0a Request Token');
  console.log('---------------------------------');
  
  const oauth = new OAuth({
    consumer: {
      key: CLIENT_ID,
      secret: CLIENT_SECRET
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string: string, key: string) {
      return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    }
  });
  
  const callback_url = 'http://localhost:8080/callback';
  
  // Try different request token URLs
  const urls = [
    'https://api.login.yahoo.com/oauth/v2/get_request_token',
    'https://api.login.yahoo.com/oauth/v2/get_request_token',
  ];
  
  for (const url of urls) {
    console.log(`\nTrying: ${url}`);
    
    const request_data = {
      url: url,
      method: 'POST',
      data: {
        oauth_callback: callback_url
      }
    };
    
    const headers = oauth.toHeader(oauth.authorize(request_data));
    
    try {
      // Try POST with callback in body
      const response = await axios.post(url, null, {
        headers: headers,
        params: {
          oauth_callback: callback_url
        },
        validateStatus: () => true
      });
      
      console.log(`  POST Status: ${response.status}`);
      if (response.data) {
        console.log(`  Response: ${JSON.stringify(response.data).substring(0, 200)}`);
      }
    } catch (error: any) {
      console.log(`  POST Error: ${error.message}`);
    }
    
    try {
      // Try GET with callback in query
      const getUrl = `${url}?oauth_callback=${encodeURIComponent(callback_url)}`;
      const get_request_data = {
        url: getUrl,
        method: 'GET'
      };
      
      const getHeaders = oauth.toHeader(oauth.authorize(get_request_data));
      
      const response = await axios.get(getUrl, {
        headers: getHeaders,
        validateStatus: () => true
      });
      
      console.log(`  GET Status: ${response.status}`);
      if (response.data) {
        console.log(`  Response: ${JSON.stringify(response.data).substring(0, 200)}`);
      }
    } catch (error: any) {
      console.log(`  GET Error: ${error.message}`);
    }
  }
}

// Run all tests
async function runTests() {
  await testOAuth1Direct();
  await testOAuthEndpoints();
  await testOAuth1RequestToken();
  
  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================');
  console.log('\nBased on the tests above:');
  console.log('1. If OAuth 1.0a direct API calls work -> Use 2-legged OAuth (app-only)');
  console.log('2. If request token endpoints return 405 -> They exist but need correct method');
  console.log('3. If OAuth 2.0 endpoints return valid status -> Use OAuth 2.0 flow');
  console.log('\nRecommendation will be provided based on results.');
}

runTests().catch(console.error);