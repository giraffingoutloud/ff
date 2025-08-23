/**
 * Yahoo Fantasy Football Data Fetcher - Simplified Version
 * Uses 2-legged OAuth 1.0a (app-only authentication)
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

// Yahoo API Configuration
const YAHOO_API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';
const DATA_DIR = path.join(process.cwd(), 'yahoo_data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface YahooConfig {
  clientId: string;
  clientSecret: string;
}

export class YahooDataFetcherSimple {
  private oauth: OAuth;
  
  constructor(config: YahooConfig) {
    // Initialize OAuth 1.0a for 2-legged auth (app-only)
    this.oauth = new OAuth({
      consumer: {
        key: config.clientId,
        secret: config.clientSecret
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string: string, key: string) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      }
    });
  }
  
  /**
   * Parse XML response to JSON
   * Yahoo returns XML by default
   */
  private parseXMLToJSON(xml: string): any {
    // For now, we'll save the raw XML and note that we need an XML parser
    // In production, you'd use a library like xml2js
    return { raw_xml: xml };
  }
  
  /**
   * Save data to file for offline analysis
   */
  private saveData(filename: string, data: any): void {
    const filepath = path.join(DATA_DIR, filename);
    
    // If it's XML data, save as .xml
    if (typeof data === 'string' && data.startsWith('<?xml')) {
      fs.writeFileSync(filepath.replace('.json', '.xml'), data);
      console.log(`Saved: ${filename.replace('.json', '.xml')}`);
    } else {
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`Saved: ${filename}`);
    }
  }
  
  /**
   * Make authenticated request to Yahoo API
   */
  async makeRequest(endpoint: string, format: string = 'json'): Promise<any> {
    const url = `${YAHOO_API_BASE}${endpoint}`;
    const formatParam = format === 'json' ? '?format=json' : '';
    const fullUrl = url + formatParam;
    
    const request_data = {
      url: fullUrl,
      method: 'GET'
    };
    
    const headers = this.oauth.toHeader(
      this.oauth.authorize(request_data)
    );
    
    try {
      console.log(`Fetching: ${endpoint}`);
      const response = await axios.get(fullUrl, {
        headers: {
          ...headers,
          'Accept': format === 'json' ? 'application/json' : 'application/xml'
        }
      });
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.error(`Authentication failed for ${endpoint}`);
        console.error('This endpoint may require user authentication (3-legged OAuth)');
      } else {
        console.error(`Failed to fetch ${endpoint}:`, error.message);
      }
      throw error;
    }
  }
  
  /**
   * STEP 1: Get available games/seasons
   */
  async fetchAvailableGames(): Promise<any> {
    console.log('Fetching available NFL seasons...');
    
    try {
      // Get NFL game info
      const data = await this.makeRequest('/game/nfl', 'json');
      this.saveData('nfl_game_info.json', data);
      
      // Also get historical games
      const years = [2024, 2023, 2022, 2021, 2020];
      for (const year of years) {
        try {
          const yearData = await this.makeRequest(`/game/nfl.${year}`, 'json');
          this.saveData(`nfl_game_${year}.json`, yearData);
        } catch (error) {
          console.log(`Could not fetch ${year} data`);
        }
      }
      
      return data;
    } catch (error) {
      console.error('Failed to fetch games:', error);
      return null;
    }
  }
  
  /**
   * STEP 2: Get public league data
   * Note: Private league data requires user authentication
   */
  async fetchPublicLeagues(): Promise<any> {
    console.log('Fetching public league data...');
    
    try {
      // Try to get public league samples
      const leagueIds = [
        '423.l.public',  // Example public league format
      ];
      
      for (const leagueId of leagueIds) {
        try {
          const data = await this.makeRequest(`/league/${leagueId}`, 'json');
          this.saveData(`league_${leagueId.replace(/\./g, '_')}.json`, data);
        } catch (error) {
          console.log(`Could not fetch league ${leagueId}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to fetch public leagues:', error);
      return null;
    }
  }
  
  /**
   * STEP 3: Get player pool with stats
   */
  async fetchPlayerPool(year: number = 2024): Promise<any> {
    console.log(`Fetching ${year} player pool...`);
    
    try {
      // Get top players
      // Note: Player queries might need specific formatting
      const endpoints = [
        `/players;game_keys=nfl.${year};start=0;count=25`,
        `/players;game_keys=nfl.${year};position=QB;start=0;count=10`,
        `/players;game_keys=nfl.${year};position=RB;start=0;count=15`,
        `/players;game_keys=nfl.${year};position=WR;start=0;count=15`,
        `/players;game_keys=nfl.${year};position=TE;start=0;count=10`,
      ];
      
      const allPlayers: any[] = [];
      
      for (const endpoint of endpoints) {
        try {
          const data = await this.makeRequest(endpoint, 'json');
          this.saveData(`players_${endpoint.replace(/[\/;=]/g, '_')}.json`, data);
          allPlayers.push(data);
          
          // Rate limiting
          await this.sleep(1000);
        } catch (error) {
          console.log(`Could not fetch: ${endpoint}`);
        }
      }
      
      return allPlayers;
    } catch (error) {
      console.error('Failed to fetch player pool:', error);
      return null;
    }
  }
  
  /**
   * STEP 4: Get metadata and settings
   */
  async fetchMetadata(): Promise<any> {
    console.log('Fetching metadata...');
    
    try {
      const endpoints = [
        '/game/nfl/stat_categories',
        '/game/nfl/position_types',
        '/game/nfl/roster_positions',
        '/game/nfl/game_weeks',
      ];
      
      for (const endpoint of endpoints) {
        try {
          const data = await this.makeRequest(endpoint, 'json');
          const filename = `metadata_${endpoint.replace(/\//g, '_')}.json`;
          this.saveData(filename, data);
        } catch (error) {
          console.log(`Could not fetch: ${endpoint}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to fetch metadata:', error);
      return null;
    }
  }
  
  /**
   * Helper: Sleep function for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * MASTER FUNCTION: Download what's available with app-only auth
   */
  async downloadAvailableData(): Promise<void> {
    console.log('Starting Yahoo Fantasy data download...');
    console.log('Note: This uses app-only authentication.');
    console.log('Private league data requires user authentication.\n');
    
    try {
      // 1. Get game/season info
      await this.fetchAvailableGames();
      
      // 2. Try public leagues
      await this.fetchPublicLeagues();
      
      // 3. Get player data
      await this.fetchPlayerPool(2024);
      await this.fetchPlayerPool(2023);
      
      // 4. Get metadata
      await this.fetchMetadata();
      
      console.log('\n========================================');
      console.log('Data download complete!');
      console.log(`All data saved to: ${DATA_DIR}`);
      console.log('\nNote: For private league data (draft results, transactions, etc.),');
      console.log('you will need to implement 3-legged OAuth with user authentication.');
      
    } catch (error) {
      console.error('Failed to download data:', error);
    }
  }
  
  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing Yahoo API connection...');
      const data = await this.makeRequest('/game/nfl', 'json');
      console.log('✓ Connection successful!');
      
      // Try to parse the response
      if (data.fantasy_content) {
        console.log('✓ Valid Fantasy API response received');
        const game = data.fantasy_content.game?.[0];
        if (game) {
          console.log(`  Game: ${game.name} (${game.game_key})`);
          console.log(`  Season: ${game.season}`);
          console.log(`  Code: ${game.code}`);
        }
      }
      
      return true;
    } catch (error: any) {
      console.error('✗ Connection failed:', error.message);
      return false;
    }
  }
}

export default YahooDataFetcherSimple;