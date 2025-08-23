/**
 * Yahoo OAuth Authentication Handler
 * Handles the OAuth 1.0a flow for Yahoo Fantasy Sports API
 */

import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { createServer } from 'http';
import { parse } from 'url';
import { exec } from 'child_process';

const YAHOO_REQUEST_TOKEN_URL = 'https://api.login.yahoo.com/oauth/v2/get_request_token';
const YAHOO_ACCESS_TOKEN_URL = 'https://api.login.yahoo.com/oauth/v2/get_token';
const YAHOO_AUTHORIZE_URL = 'https://api.login.yahoo.com/oauth/v2/request_auth';
const CALLBACK_URL = 'http://localhost:8080/callback';

interface YahooTokens {
  oauth_token: string;
  oauth_token_secret: string;
  oauth_verifier?: string;
  oauth_session_handle?: string;
}

export class YahooAuthHandler {
  private oauth: OAuth;
  private requestToken: YahooTokens | null = null;
  private accessToken: YahooTokens | null = null;
  
  constructor(clientId: string, clientSecret: string) {
    this.oauth = new OAuth({
      consumer: {
        key: clientId,
        secret: clientSecret
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string: string, key: string) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      }
    });
  }
  
  /**
   * Step 1: Get request token
   */
  async getRequestToken(): Promise<YahooTokens> {
    console.log('Step 1: Getting request token from Yahoo...');
    
    const request_data = {
      url: YAHOO_REQUEST_TOKEN_URL,
      method: 'POST',
      data: {
        oauth_callback: CALLBACK_URL
      }
    };
    
    const headers = this.oauth.toHeader(this.oauth.authorize(request_data));
    
    try {
      const response = await axios.post(YAHOO_REQUEST_TOKEN_URL, null, {
        headers: headers,
        params: {
          oauth_callback: CALLBACK_URL
        }
      });
      
      const tokens = this.parseOAuthResponse(response.data);
      this.requestToken = tokens;
      console.log('Request token obtained:', tokens.oauth_token);
      return tokens;
    } catch (error: any) {
      console.error('Failed to get request token:', error.response?.data || error.message);
      throw error;
    }
  }
  
  /**
   * Step 2: Generate authorization URL for user
   */
  getAuthorizationUrl(): string {
    if (!this.requestToken) {
      throw new Error('No request token available. Call getRequestToken() first.');
    }
    
    const authUrl = `${YAHOO_AUTHORIZE_URL}?oauth_token=${this.requestToken.oauth_token}`;
    console.log('Step 2: User authorization required.');
    console.log('Please visit this URL to authorize the application:');
    console.log(authUrl);
    
    return authUrl;
  }
  
  /**
   * Step 3: Start local server to receive callback
   */
  async waitForCallback(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const urlParts = parse(req.url || '', true);
        
        if (urlParts.pathname === '/callback') {
          const verifier = urlParts.query.oauth_verifier as string;
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the application.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
          
          server.close();
          resolve(verifier);
        }
      });
      
      server.listen(8080, () => {
        console.log('Step 3: Waiting for authorization callback on http://localhost:8080...');
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authorization timeout'));
      }, 300000);
    });
  }
  
  /**
   * Step 4: Exchange verifier for access token
   */
  async getAccessToken(verifier: string): Promise<YahooTokens> {
    if (!this.requestToken) {
      throw new Error('No request token available.');
    }
    
    console.log('Step 4: Exchanging verifier for access token...');
    
    const request_data = {
      url: YAHOO_ACCESS_TOKEN_URL,
      method: 'POST',
      data: {
        oauth_verifier: verifier
      }
    };
    
    const token = {
      key: this.requestToken.oauth_token,
      secret: this.requestToken.oauth_token_secret
    };
    
    const headers = this.oauth.toHeader(
      this.oauth.authorize(request_data, token)
    );
    
    try {
      const response = await axios.post(YAHOO_ACCESS_TOKEN_URL, null, {
        headers: headers,
        params: {
          oauth_verifier: verifier
        }
      });
      
      const tokens = this.parseOAuthResponse(response.data);
      this.accessToken = tokens;
      
      console.log('Access token obtained successfully!');
      console.log('Token:', tokens.oauth_token);
      console.log('Token Secret:', tokens.oauth_token_secret);
      
      // Save tokens to file for future use
      this.saveTokens(tokens);
      
      return tokens;
    } catch (error: any) {
      console.error('Failed to get access token:', error.response?.data || error.message);
      throw error;
    }
  }
  
  /**
   * Complete OAuth flow
   */
  async authenticate(): Promise<YahooTokens> {
    try {
      // Check if we have saved tokens
      const savedTokens = this.loadTokens();
      if (savedTokens) {
        console.log('Using saved access tokens');
        this.accessToken = savedTokens;
        return savedTokens;
      }
      
      // Step 1: Get request token
      await this.getRequestToken();
      
      // Step 2: Open browser for user authorization
      const authUrl = this.getAuthorizationUrl();
      this.openBrowser(authUrl);
      
      // Step 3: Wait for callback with verifier
      const verifier = await this.waitForCallback();
      
      // Step 4: Exchange for access token
      const accessTokens = await this.getAccessToken(verifier);
      
      console.log('\nAuthentication complete!');
      console.log('Tokens saved to yahoo_tokens.json');
      
      return accessTokens;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }
  
  /**
   * Parse OAuth response string
   */
  private parseOAuthResponse(responseString: string): YahooTokens {
    const params: any = {};
    const pairs = responseString.split('&');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      params[key] = decodeURIComponent(value);
    }
    
    return params as YahooTokens;
  }
  
  /**
   * Save tokens to file
   */
  private saveTokens(tokens: YahooTokens): void {
    const tokenPath = path.join(process.cwd(), 'yahoo_tokens.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    
    // Also update .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Add or update tokens
    if (!envContent.includes('YAHOO_ACCESS_TOKEN=')) {
      envContent += `\n# Yahoo Access Tokens (obtained via OAuth)\n`;
      envContent += `YAHOO_ACCESS_TOKEN=${tokens.oauth_token}\n`;
      envContent += `YAHOO_ACCESS_TOKEN_SECRET=${tokens.oauth_token_secret}\n`;
    } else {
      envContent = envContent.replace(
        /YAHOO_ACCESS_TOKEN=.*/,
        `YAHOO_ACCESS_TOKEN=${tokens.oauth_token}`
      );
      envContent = envContent.replace(
        /YAHOO_ACCESS_TOKEN_SECRET=.*/,
        `YAHOO_ACCESS_TOKEN_SECRET=${tokens.oauth_token_secret}`
      );
    }
    
    fs.writeFileSync(envPath, envContent);
  }
  
  /**
   * Load saved tokens
   */
  private loadTokens(): YahooTokens | null {
    const tokenPath = path.join(process.cwd(), 'yahoo_tokens.json');
    
    if (fs.existsSync(tokenPath)) {
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      return tokens;
    }
    
    return null;
  }
  
  /**
   * Open browser for authorization
   */
  private openBrowser(url: string): void {
    const platform = process.platform;
    let command: string;
    
    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }
    
    exec(command, (error) => {
      if (error) {
        console.error('Could not open browser automatically.');
        console.log('Please manually visit:', url);
      }
    });
  }
  
  /**
   * Get current access tokens
   */
  getTokens(): YahooTokens | null {
    return this.accessToken || this.loadTokens();
  }
}

export default YahooAuthHandler;