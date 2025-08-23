/**
 * Comprehensive Yahoo Fantasy Data Fetcher
 * Downloads ALL available data using 2-legged OAuth
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

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

export class YahooComprehensiveFetcher {
  private oauth: OAuth;
  private requestCount = 0;
  private successCount = 0;
  private failureCount = 0;
  
  constructor(config: YahooConfig) {
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
  
  private saveData(filename: string, data: any): void {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  ✓ Saved: ${filename}`);
    this.successCount++;
  }
  
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
    
    this.requestCount++;
    
    try {
      const response = await axios.get(fullUrl, {
        headers: {
          ...headers,
          'Accept': format === 'json' ? 'application/json' : 'application/xml'
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error: any) {
      this.failureCount++;
      if (error.response) {
        console.log(`  ✗ ${endpoint} - Status ${error.response.status}`);
      } else {
        console.log(`  ✗ ${endpoint} - ${error.message}`);
      }
      return null;
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async fetchAllGames() {
    console.log('\n📊 Fetching Game Information...');
    
    // Current game
    const currentGame = await this.makeRequest('/game/nfl', 'json');
    if (currentGame) {
      this.saveData('game_nfl_current.json', currentGame);
      
      // Extract current game key
      const gameKey = currentGame.fantasy_content?.game?.[0]?.game_key;
      console.log(`  Current season game key: ${gameKey}`);
    }
    
    // Try different game key formats for historical data
    const historicalFormats = [
      { year: 2024, keys: ['449', 'nfl.2024', '423'] },
      { year: 2023, keys: ['423', 'nfl.2023', '406'] },
      { year: 2022, keys: ['406', 'nfl.2022', '390'] },
      { year: 2021, keys: ['390', 'nfl.2021', '380'] },
      { year: 2020, keys: ['380', 'nfl.2020', '371'] },
    ];
    
    for (const { year, keys } of historicalFormats) {
      for (const key of keys) {
        const data = await this.makeRequest(`/game/${key}`, 'json');
        if (data) {
          this.saveData(`game_${year}_${key}.json`, data);
          break; // Found working key for this year
        }
      }
      await this.sleep(500);
    }
  }
  
  async fetchAllMetadata() {
    console.log('\n📋 Fetching All Metadata...');
    
    const metadataEndpoints = [
      '/game/nfl/stat_categories',
      '/game/nfl/position_types', 
      '/game/nfl/roster_positions',
      '/game/nfl/game_weeks',
      '/game/nfl/stat_modifiers',
      '/game/nfl/game_weeks',
    ];
    
    // Try with different game keys
    const gameKeys = ['461', '449', '423', '406', '390', '380'];
    
    for (const endpoint of metadataEndpoints) {
      // Try current season first
      let data = await this.makeRequest(endpoint, 'json');
      if (data) {
        const filename = `metadata${endpoint.replace(/\//g, '_')}.json`;
        this.saveData(filename, data);
      }
      
      // Try with specific game keys
      for (const gameKey of gameKeys) {
        const specificEndpoint = endpoint.replace('nfl', gameKey);
        data = await this.makeRequest(specificEndpoint, 'json');
        if (data) {
          const filename = `metadata_${gameKey}${specificEndpoint.replace(/\//g, '_')}.json`;
          this.saveData(filename, data);
        }
      }
      
      await this.sleep(500);
    }
  }
  
  async fetchPlayers() {
    console.log('\n👥 Fetching Player Data...');
    
    // Different query formats to try
    const queryFormats = [
      // By position
      '/players;position=QB;sort=OR;count=50',
      '/players;position=RB;sort=OR;count=50',
      '/players;position=WR;sort=OR;count=50',
      '/players;position=TE;sort=OR;count=30',
      '/players;position=K;sort=OR;count=20',
      '/players;position=DEF;sort=OR;count=20',
      
      // By status
      '/players;status=A;sort=OR;count=100', // Active players
      '/players;status=FA;sort=OR;count=50', // Free agents
      
      // Search specific players
      '/players;search=mahomes',
      '/players;search=mccaffrey',
      '/players;search=jefferson',
      '/players;search=kelce',
      
      // With stats
      '/players;position=QB;sort=PTS;count=25/stats',
      '/players;position=RB;sort=PTS;count=25/stats',
      
      // Different sort options
      '/players;sort=AR;count=100', // By average rank
      '/players;sort=OR;count=100', // By overall rank
      '/players;sort=PTS;count=100', // By points
    ];
    
    for (const query of queryFormats) {
      const data = await this.makeRequest(query, 'json');
      if (data) {
        const filename = `players${query.replace(/[;\/=]/g, '_')}.json`;
        this.saveData(filename, data);
      }
      await this.sleep(1000); // Rate limiting
    }
  }
  
  async fetchLeagues() {
    console.log('\n🏆 Fetching League Data...');
    
    // Try different league formats
    const leagueQueries = [
      '/leagues;league_keys=nfl.l.public',
      '/leagues;league_keys=423.l.public',
      '/leagues;league_keys=449.l.public',
      '/league/nfl.l.public',
      '/league/423.l.public',
    ];
    
    for (const query of leagueQueries) {
      const data = await this.makeRequest(query, 'json');
      if (data) {
        const filename = `leagues${query.replace(/[;\/=\.]/g, '_')}.json`;
        this.saveData(filename, data);
      }
      await this.sleep(500);
    }
  }
  
  async fetchTransactions() {
    console.log('\n💰 Fetching Transaction Types...');
    
    const transactionEndpoints = [
      '/game/nfl/transaction_types',
      '/game/449/transaction_types',
      '/game/423/transaction_types',
    ];
    
    for (const endpoint of transactionEndpoints) {
      const data = await this.makeRequest(endpoint, 'json');
      if (data) {
        const filename = `transactions${endpoint.replace(/\//g, '_')}.json`;
        this.saveData(filename, data);
      }
      await this.sleep(500);
    }
  }
  
  async fetchTeams() {
    console.log('\n🏈 Fetching NFL Teams...');
    
    // Try to get NFL team data
    const teamQueries = [
      '/game/nfl/teams',
      '/teams;team_keys=nfl.t.1,nfl.t.2,nfl.t.3',
      '/teams;team_codes=buf,mia,ne,nyj', // AFC East
      '/teams;team_codes=dal,nyg,phi,was', // NFC East
    ];
    
    for (const query of teamQueries) {
      const data = await this.makeRequest(query, 'json');
      if (data) {
        const filename = `teams${query.replace(/[;\/=,\.]/g, '_')}.json`;
        this.saveData(filename, data);
      }
      await this.sleep(500);
    }
  }
  
  async fetchDraftData() {
    console.log('\n📝 Fetching Draft Information...');
    
    const draftQueries = [
      '/game/nfl/draft_rounds',
      '/game/nfl/draft_positions',
      '/game/449/draft_rounds',
      '/game/423/draft_rounds',
    ];
    
    for (const query of draftQueries) {
      const data = await this.makeRequest(query, 'json');
      if (data) {
        const filename = `draft${query.replace(/\//g, '_')}.json`;
        this.saveData(filename, data);
      }
      await this.sleep(500);
    }
  }
  
  async fetchResources() {
    console.log('\n📚 Fetching Resources & Links...');
    
    const resourceEndpoints = [
      '/game/nfl/resources',
      '/game/nfl/rules',
      '/game/nfl/settings',
    ];
    
    for (const endpoint of resourceEndpoints) {
      const data = await this.makeRequest(endpoint, 'json');
      if (data) {
        const filename = `resources${endpoint.replace(/\//g, '_')}.json`;
        this.saveData(filename, data);
      }
      await this.sleep(500);
    }
  }
  
  async fetchCollections() {
    console.log('\n📦 Fetching Player Collections...');
    
    // Try collection queries
    const collections = [
      '/players/collection;position=QB',
      '/players/collection;position=RB',
      '/players/collection;position=WR',
      '/players/collection;position=TE',
      '/players/collection;status=IR', // Injured reserve
      '/players/collection;status=O',  // Out
      '/players/collection;status=Q',  // Questionable
    ];
    
    for (const query of collections) {
      const data = await this.makeRequest(query, 'json');
      if (data) {
        const filename = `collection${query.replace(/[;\/=]/g, '_')}.json`;
        this.saveData(filename, data);
      }
      await this.sleep(1000);
    }
  }
  
  async downloadEverything() {
    console.log('========================================');
    console.log('🚀 Comprehensive Yahoo Data Download');
    console.log('========================================');
    console.log('Attempting to download ALL available data...\n');
    
    const startTime = Date.now();
    
    // Download all categories
    await this.fetchAllGames();
    await this.fetchAllMetadata();
    await this.fetchPlayers();
    await this.fetchLeagues();
    await this.fetchTransactions();
    await this.fetchTeams();
    await this.fetchDraftData();
    await this.fetchResources();
    await this.fetchCollections();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log('\n========================================');
    console.log('📊 Download Summary');
    console.log('========================================');
    console.log(`Total requests made: ${this.requestCount}`);
    console.log(`Successful downloads: ${this.successCount}`);
    console.log(`Failed requests: ${this.failureCount}`);
    console.log(`Success rate: ${((this.successCount / this.requestCount) * 100).toFixed(1)}%`);
    console.log(`Time elapsed: ${duration} seconds`);
    console.log(`\nAll data saved to: ${DATA_DIR}`);
    
    // List all downloaded files
    const files = fs.readdirSync(DATA_DIR);
    const totalSize = files.reduce((sum, file) => {
      const stat = fs.statSync(path.join(DATA_DIR, file));
      return sum + stat.size;
    }, 0);
    
    console.log(`\nTotal files downloaded: ${files.length}`);
    console.log(`Total data size: ${(totalSize / 1024).toFixed(1)} KB`);
    
    // Show file categories
    const categories = {
      game: files.filter(f => f.startsWith('game_')).length,
      metadata: files.filter(f => f.startsWith('metadata')).length,
      players: files.filter(f => f.startsWith('players')).length,
      leagues: files.filter(f => f.startsWith('leagues')).length,
      teams: files.filter(f => f.startsWith('teams')).length,
      draft: files.filter(f => f.startsWith('draft')).length,
      collections: files.filter(f => f.startsWith('collection')).length,
      other: files.filter(f => !f.match(/^(game_|metadata|players|leagues|teams|draft|collection)/)).length
    };
    
    console.log('\nFiles by category:');
    Object.entries(categories).forEach(([cat, count]) => {
      if (count > 0) {
        console.log(`  ${cat}: ${count} files`);
      }
    });
    
    return {
      requestCount: this.requestCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      duration,
      files: files.length,
      totalSize
    };
  }
}

export default YahooComprehensiveFetcher;