/**
 * Yahoo Fantasy Football Data Fetcher
 * Downloads and saves all available fantasy data for analysis
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto-js';

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
  accessToken?: string;
  accessTokenSecret?: string;
}

export class YahooDataFetcher {
  private oauth: OAuth;
  private token: { key: string; secret: string } | null = null;
  private axios: AxiosInstance;
  
  constructor(config: YahooConfig) {
    // Initialize OAuth 1.0a (Yahoo still uses this for Fantasy)
    this.oauth = new OAuth({
      consumer: {
        key: config.clientId,
        secret: config.clientSecret
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.HmacSHA1(base_string, key).toString(crypto.enc.Base64);
      }
    });
    
    if (config.accessToken && config.accessTokenSecret) {
      this.token = {
        key: config.accessToken,
        secret: config.accessTokenSecret
      };
    }
    
    this.axios = axios.create({
      baseURL: YAHOO_API_BASE,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }
  
  /**
   * Save data to file for offline analysis
   */
  private saveData(filename: string, data: any): void {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`Saved: ${filename}`);
  }
  
  /**
   * Make authenticated request to Yahoo API
   */
  private async makeRequest(endpoint: string): Promise<any> {
    if (!this.token) {
      throw new Error('Not authenticated. Please set access token.');
    }
    
    const url = `${YAHOO_API_BASE}${endpoint}`;
    const request_data = {
      url: url,
      method: 'GET'
    };
    
    const headers = this.oauth.toHeader(
      this.oauth.authorize(request_data, this.token)
    );
    
    try {
      const response = await axios.get(url, {
        headers: {
          ...headers,
          'Accept': 'application/json'
        }
      });
      return response.data;
    } catch (error: any) {
      console.error(`Failed to fetch ${endpoint}:`, error.message);
      throw error;
    }
  }
  
  /**
   * STEP 1: Get all user's leagues (current and historical)
   */
  async fetchUserLeagues(years: number[] = [2024, 2023, 2022]): Promise<any[]> {
    const allLeagues: any[] = [];
    
    for (const year of years) {
      try {
        console.log(`Fetching ${year} leagues...`);
        const data = await this.makeRequest(`/users;use_login=1/games;game_keys=nfl.${year}/leagues`);
        
        if (data?.fantasy_content?.users?.[0]?.user?.[1]?.games) {
          const games = data.fantasy_content.users[0].user[1].games;
          for (const game of games) {
            if (game.game?.[1]?.leagues) {
              allLeagues.push(...game.game[1].leagues);
            }
          }
        }
        
        this.saveData(`leagues_${year}.json`, data);
      } catch (error) {
        console.error(`Could not fetch ${year} leagues:`, error);
      }
    }
    
    this.saveData('all_leagues.json', allLeagues);
    return allLeagues;
  }
  
  /**
   * STEP 2: Fetch complete draft results for a league
   * THIS IS THE GOLD - Actual auction prices!
   */
  async fetchDraftResults(leagueKey: string): Promise<any> {
    console.log(`Fetching draft results for ${leagueKey}...`);
    
    try {
      const data = await this.makeRequest(`/league/${leagueKey}/draftresults`);
      this.saveData(`draft_${leagueKey.replace(/\./g, '_')}.json`, data);
      
      // Also fetch with player details
      const detailedData = await this.makeRequest(
        `/league/${leagueKey}/draftresults/players`
      );
      this.saveData(`draft_detailed_${leagueKey.replace(/\./g, '_')}.json`, detailedData);
      
      return data;
    } catch (error) {
      console.error(`Failed to fetch draft for ${leagueKey}:`, error);
      return null;
    }
  }
  
  /**
   * STEP 3: Fetch all transactions (shows bidding wars, waiver claims)
   */
  async fetchTransactions(leagueKey: string): Promise<any> {
    console.log(`Fetching transactions for ${leagueKey}...`);
    
    try {
      const data = await this.makeRequest(`/league/${leagueKey}/transactions`);
      this.saveData(`transactions_${leagueKey.replace(/\./g, '_')}.json`, data);
      return data;
    } catch (error) {
      console.error(`Failed to fetch transactions for ${leagueKey}:`, error);
      return null;
    }
  }
  
  /**
   * STEP 4: Fetch league settings and scoring
   */
  async fetchLeagueSettings(leagueKey: string): Promise<any> {
    console.log(`Fetching settings for ${leagueKey}...`);
    
    try {
      const settings = await this.makeRequest(`/league/${leagueKey}/settings`);
      const scoring = await this.makeRequest(`/league/${leagueKey}/scoreboard`);
      const standings = await this.makeRequest(`/league/${leagueKey}/standings`);
      
      const combined = { settings, scoring, standings };
      this.saveData(`settings_${leagueKey.replace(/\./g, '_')}.json`, combined);
      return combined;
    } catch (error) {
      console.error(`Failed to fetch settings for ${leagueKey}:`, error);
      return null;
    }
  }
  
  /**
   * STEP 5: Fetch all players with ownership and cost data
   */
  async fetchPlayersWithCosts(leagueKey: string): Promise<any> {
    console.log(`Fetching player costs for ${leagueKey}...`);
    
    try {
      // Get all players in the league with their costs
      const data = await this.makeRequest(
        `/league/${leagueKey}/players;start=0;count=400/stats;type=season/ownership`
      );
      this.saveData(`players_${leagueKey.replace(/\./g, '_')}.json`, data);
      return data;
    } catch (error) {
      console.error(`Failed to fetch players for ${leagueKey}:`, error);
      return null;
    }
  }
  
  /**
   * STEP 6: Fetch team rosters with costs
   */
  async fetchAllTeamRosters(leagueKey: string): Promise<any> {
    console.log(`Fetching all team rosters for ${leagueKey}...`);
    
    try {
      const teams = await this.makeRequest(`/league/${leagueKey}/teams/roster`);
      this.saveData(`rosters_${leagueKey.replace(/\./g, '_')}.json`, teams);
      return teams;
    } catch (error) {
      console.error(`Failed to fetch rosters for ${leagueKey}:`, error);
      return null;
    }
  }
  
  /**
   * MASTER FUNCTION: Download everything!
   */
  async downloadAllData(): Promise<void> {
    console.log('Starting comprehensive Yahoo data download...');
    console.log('This will fetch all available fantasy data for analysis.');
    
    try {
      // 1. Get all leagues (current and historical)
      const leagues = await this.fetchUserLeagues([2024, 2023, 2022, 2021, 2020]);
      console.log(`Found ${leagues.length} total leagues`);
      
      // 2. For each league, download everything
      for (const league of leagues) {
        const leagueKey = league.league_key || league[0]?.league_key;
        if (!leagueKey) continue;
        
        console.log(`\nProcessing league: ${leagueKey}`);
        console.log('=' . repeat(50));
        
        // Get all data for this league
        await this.fetchDraftResults(leagueKey);
        await this.fetchTransactions(leagueKey);
        await this.fetchLeagueSettings(leagueKey);
        await this.fetchPlayersWithCosts(leagueKey);
        await this.fetchAllTeamRosters(leagueKey);
        
        // Rate limiting - Yahoo has strict limits
        await this.sleep(2000); // 2 second delay between leagues
      }
      
      // 3. Get current season player pool with projections
      await this.fetchCurrentPlayerPool();
      
      // 4. Get historical player stats
      await this.fetchHistoricalStats();
      
      console.log('\n' + '=' . repeat(50));
      console.log('Data download complete!');
      console.log(`All data saved to: ${DATA_DIR}`);
      
    } catch (error) {
      console.error('Failed to download data:', error);
    }
  }
  
  /**
   * Fetch current NFL player pool with projections
   */
  async fetchCurrentPlayerPool(): Promise<any> {
    console.log('Fetching current player pool...');
    
    try {
      // Get top 400 players for current season
      const data = await this.makeRequest(
        '/players;start=0;count=400;sort=AR;season=2024/stats;type=season'
      );
      this.saveData('player_pool_2024.json', data);
      return data;
    } catch (error) {
      console.error('Failed to fetch player pool:', error);
      return null;
    }
  }
  
  /**
   * Fetch historical stats for trend analysis
   */
  async fetchHistoricalStats(): Promise<any> {
    console.log('Fetching historical stats...');
    
    const years = [2023, 2022, 2021];
    const allStats: any = {};
    
    for (const year of years) {
      try {
        const data = await this.makeRequest(
          `/players;start=0;count=200;sort=AR;season=${year}/stats;type=season`
        );
        allStats[year] = data;
        this.saveData(`historical_stats_${year}.json`, data);
      } catch (error) {
        console.error(`Failed to fetch ${year} stats:`, error);
      }
    }
    
    this.saveData('all_historical_stats.json', allStats);
    return allStats;
  }
  
  /**
   * Helper: Sleep function for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Analyze downloaded data for insights
   */
  async analyzeDownloadedData(): Promise<void> {
    console.log('\nAnalyzing downloaded data...');
    console.log('=' . repeat(50));
    
    // Read all draft files
    const draftFiles = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('draft_') && f.endsWith('.json'));
    
    const auctionPrices: any[] = [];
    
    for (const file of draftFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
      // Extract auction prices from draft data
      // Structure depends on Yahoo's response format
      if (data?.fantasy_content?.league?.[1]?.draft_results) {
        auctionPrices.push(...data.fantasy_content.league[1].draft_results);
      }
    }
    
    // Calculate statistics
    const stats = {
      totalDrafts: draftFiles.length,
      totalPicks: auctionPrices.length,
      avgSpendByPosition: this.calculateAvgByPosition(auctionPrices),
      inflationByDraftPosition: this.calculateInflationCurve(auctionPrices),
      scarcityPremiums: this.calculateScarcityPremiums(auctionPrices)
    };
    
    this.saveData('analysis_summary.json', stats);
    console.log('Analysis complete. Summary saved to analysis_summary.json');
  }
  
  private calculateAvgByPosition(prices: any[]): any {
    // Group by position and calculate averages
    const byPosition: any = {};
    // Implementation depends on data structure
    return byPosition;
  }
  
  private calculateInflationCurve(prices: any[]): any {
    // Calculate spending velocity through draft
    return {};
  }
  
  private calculateScarcityPremiums(prices: any[]): any {
    // Calculate premiums when positions become scarce
    return {};
  }
}

// Usage script
export async function fetchAllYahooData() {
  // Load credentials from environment
  const config: YahooConfig = {
    clientId: process.env.YAHOO_CLIENT_ID || '',
    clientSecret: process.env.YAHOO_CLIENT_SECRET || '',
    // These need to be obtained through OAuth flow
    accessToken: process.env.YAHOO_ACCESS_TOKEN || '',
    accessTokenSecret: process.env.YAHOO_ACCESS_TOKEN_SECRET || ''
  };
  
  const fetcher = new YahooDataFetcher(config);
  
  // Download everything
  await fetcher.downloadAllData();
  
  // Analyze what we got
  await fetcher.analyzeDownloadedData();
}

export default YahooDataFetcher;