/**
 * Yahoo OAuth 2.0 Authentication Handler
 * Updated implementation for Yahoo Fantasy Sports API
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { createServer } from 'http';
import { parse } from 'url';
import { exec } from 'child_process';
import crypto from 'crypto';

// Yahoo OAuth 2.0 endpoints
const YAHOO_AUTH_BASE = 'https://api.login.yahoo.com/oauth2';
const YAHOO_AUTHORIZE_URL = `${YAHOO_AUTH_BASE}/request_auth`;
const YAHOO_TOKEN_URL = `${YAHOO_AUTH_BASE}/get_token`;
const CALLBACK_URL = 'http://localhost:8080/callback';

interface YahooTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  xoauth_yahoo_guid?: string;
}

export class YahooAuthV2Handler {
  private clientId: string;
  private clientSecret: string;
  private accessToken: YahooTokens | null = null;
  
  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }
  
  /**
   * Generate code verifier and challenge for PKCE
   */
  private generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    
    return { verifier, challenge };
  }
  
  /**
   * Step 1: Generate authorization URL
   */
  getAuthorizationUrl(): { url: string; state: string; verifier: string } {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = this.generatePKCE();
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: CALLBACK_URL,
      response_type: 'code',
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope: 'fspt-r' // Fantasy Sports Read scope
    });
    
    const authUrl = `${YAHOO_AUTHORIZE_URL}?${params.toString()}`;
    
    console.log('Authorization URL generated.');
    console.log('Please visit this URL to authorize the application:');
    console.log(authUrl);
    
    return { url: authUrl, state, verifier };
  }
  
  /**
   * Step 2: Start local server to receive callback
   */
  async waitForCallback(expectedState: string): Promise<{ code: string; state: string }> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const urlParts = parse(req.url || '', true);
        
        if (urlParts.pathname === '/callback') {
          const code = urlParts.query.code as string;
          const state = urlParts.query.state as string;
          const error = urlParts.query.error as string;
          
          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error(`Authorization failed: ${error}`));
            return;
          }
          
          if (state !== expectedState) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Security Error</h1>
                  <p>State mismatch. Please try again.</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error('State mismatch - possible CSRF attack'));
            return;
          }
          
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
          resolve({ code, state });
        }
      });
      
      server.listen(8080, () => {
        console.log('Waiting for authorization callback on http://localhost:8080...');
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authorization timeout'));
      }, 300000);
    });
  }
  
  /**
   * Step 3: Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, verifier: string): Promise<YahooTokens> {
    console.log('Exchanging authorization code for access token...');
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: CALLBACK_URL,
      code_verifier: verifier,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });
    
    try {
      const response = await axios.post(YAHOO_TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      });
      
      const tokens = response.data as YahooTokens;
      this.accessToken = tokens;
      
      console.log('Access token obtained successfully!');
      
      // Save tokens to file for future use
      this.saveTokens(tokens);
      
      return tokens;
    } catch (error: any) {
      console.error('Failed to get access token:', error.response?.data || error.message);
      throw error;
    }
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<YahooTokens> {
    console.log('Refreshing access token...');
    
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret
    });
    
    try {
      const response = await axios.post(YAHOO_TOKEN_URL, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        }
      });
      
      const tokens = response.data as YahooTokens;
      this.accessToken = tokens;
      
      // Save updated tokens
      this.saveTokens(tokens);
      
      return tokens;
    } catch (error: any) {
      console.error('Failed to refresh token:', error.response?.data || error.message);
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
        
        // Check if token needs refresh (you might want to track expiry)
        // For now, we'll just use it
        this.accessToken = savedTokens;
        return savedTokens;
      }
      
      // Step 1: Generate authorization URL
      const { url, state, verifier } = this.getAuthorizationUrl();
      this.openBrowser(url);
      
      // Step 2: Wait for callback with authorization code
      const { code } = await this.waitForCallback(state);
      
      // Step 3: Exchange code for access token
      const tokens = await this.exchangeCodeForToken(code, verifier);
      
      console.log('\nAuthentication complete!');
      console.log('Tokens saved to yahoo_tokens_v2.json');
      
      return tokens;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }
  
  /**
   * Make authenticated API request
   */
  async makeApiRequest(endpoint: string): Promise<any> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please call authenticate() first.');
    }
    
    try {
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${this.accessToken.access_token}`,
          'Accept': 'application/json'
        }
      });
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401 && this.accessToken.refresh_token) {
        // Try to refresh token
        console.log('Token expired, refreshing...');
        await this.refreshAccessToken(this.accessToken.refresh_token);
        
        // Retry request
        const response = await axios.get(endpoint, {
          headers: {
            'Authorization': `Bearer ${this.accessToken.access_token}`,
            'Accept': 'application/json'
          }
        });
        
        return response.data;
      }
      
      throw error;
    }
  }
  
  /**
   * Save tokens to file
   */
  private saveTokens(tokens: YahooTokens): void {
    const tokenPath = path.join(process.cwd(), 'yahoo_tokens_v2.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    
    // Also update .env.local
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf-8');
      
      // Add or update tokens
      if (!envContent.includes('YAHOO_ACCESS_TOKEN=')) {
        envContent += `\n# Yahoo Access Token (OAuth 2.0)\n`;
        envContent += `YAHOO_ACCESS_TOKEN=${tokens.access_token}\n`;
        if (tokens.refresh_token) {
          envContent += `YAHOO_REFRESH_TOKEN=${tokens.refresh_token}\n`;
        }
      } else {
        envContent = envContent.replace(
          /YAHOO_ACCESS_TOKEN=.*/,
          `YAHOO_ACCESS_TOKEN=${tokens.access_token}`
        );
        if (tokens.refresh_token) {
          if (envContent.includes('YAHOO_REFRESH_TOKEN=')) {
            envContent = envContent.replace(
              /YAHOO_REFRESH_TOKEN=.*/,
              `YAHOO_REFRESH_TOKEN=${tokens.refresh_token}`
            );
          } else {
            envContent += `YAHOO_REFRESH_TOKEN=${tokens.refresh_token}\n`;
          }
        }
      }
      
      fs.writeFileSync(envPath, envContent);
    }
  }
  
  /**
   * Load saved tokens
   */
  private loadTokens(): YahooTokens | null {
    const tokenPath = path.join(process.cwd(), 'yahoo_tokens_v2.json');
    
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

export default YahooAuthV2Handler;