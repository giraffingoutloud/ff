/**
 * ESPN Fantasy Football Data Fetcher
 * Downloads league data including auction draft results
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const ESPN_API_BASE = 'https://fantasy.espn.com/apis/v3/games/ffl';
const DATA_DIR = path.join(process.cwd(), 'espn_data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface ESPNConfig {
  leagueId: string;
  year?: number;
  swid?: string; // ESPN session ID (for private leagues)
  espn_s2?: string; // ESPN auth cookie (for private leagues)
}

interface DraftPick {
  playerId: number;
  playerName?: string;
  teamId: number;
  bidAmount: number;
  pickNumber: number;
  nominatingTeamId?: number;
  autoDraftTypeId?: number;
  keeper?: boolean;
}

interface Transaction {
  type: string;
  date: number;
  teamId: number;
  playerId?: number;
  bidAmount?: number;
  status?: string;
}

export class ESPNDataFetcher {
  private leagueId: string;
  private year: number;
  private cookies?: { swid?: string; espn_s2?: string };
  private headers: any;
  
  constructor(config: ESPNConfig) {
    this.leagueId = config.leagueId;
    this.year = config.year || new Date().getFullYear();
    
    // Set up authentication for private leagues
    if (config.swid && config.espn_s2) {
      // URL decode the espn_s2 cookie if needed
      const decodedS2 = decodeURIComponent(config.espn_s2);
      
      this.cookies = {
        swid: config.swid,
        espn_s2: decodedS2
      };
      
      this.headers = {
        'Cookie': `SWID=${config.swid}; espn_s2=${decodedS2}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
    } else {
      this.headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
    }
  }
  
  /**
   * Save data to file
   */
  private saveData(filename: string, data: any): void {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  ✓ Saved: ${filename}`);
  }
  
  /**
   * Make request to ESPN API
   */
  private async makeRequest(endpoint: string, params: any = {}): Promise<any> {
    const url = `${ESPN_API_BASE}/seasons/${this.year}/segments/0/leagues/${this.leagueId}${endpoint}`;
    
    try {
      const response = await axios.get(url, {
        params,
        headers: this.headers
      });
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.error('  ✗ Authentication required. Please provide SWID and espn_s2 cookies.');
        console.error('    To get these: Open ESPN Fantasy in browser → F12 → Application → Cookies');
      } else if (error.response?.status === 404) {
        console.error(`  ✗ League ${this.leagueId} not found or not accessible`);
      } else {
        console.error(`  ✗ Failed to fetch ${endpoint}:`, error.message);
      }
      return null;
    }
  }
  
  /**
   * Fetch league settings and info
   */
  async fetchLeagueInfo(): Promise<any> {
    console.log('\n📊 Fetching League Information...');
    
    const data = await this.makeRequest('', {
      view: ['mSettings', 'mTeam', 'mRoster']
    });
    
    if (data) {
      this.saveData(`league_${this.leagueId}_${this.year}_info.json`, data);
      
      // Extract key info
      const settings = data.settings;
      if (settings) {
        console.log(`  League: ${settings.name}`);
        console.log(`  Teams: ${data.teams?.length || 0}`);
        console.log(`  Scoring: ${settings.scoringSettings?.scoringType}`);
        console.log(`  Draft Type: ${settings.draftSettings?.type === 'AUCTION' ? 'Auction' : 'Snake'}`);
        
        if (settings.draftSettings?.type === 'AUCTION') {
          console.log(`  Budget: $${settings.acquisitionSettings?.acquisitionBudget || 200}`);
        }
      }
    }
    
    return data;
  }
  
  /**
   * Fetch draft results (including auction prices!)
   */
  async fetchDraftResults(): Promise<DraftPick[]> {
    console.log('\n💰 Fetching Draft Results...');
    
    const data = await this.makeRequest('', {
      view: ['mDraftDetail']
    });
    
    if (!data) return [];
    
    const draftPicks: DraftPick[] = [];
    
    // Extract draft picks
    if (data.draftDetail?.picks) {
      for (const pick of data.draftDetail.picks) {
        draftPicks.push({
          playerId: pick.playerId,
          teamId: pick.teamId,
          bidAmount: pick.bidAmount || 0, // This is the auction price!
          pickNumber: pick.overallPickNumber,
          nominatingTeamId: pick.nominatingTeamId,
          autoDraftTypeId: pick.autoDraftTypeId,
          keeper: pick.keeper || false
        });
      }
      
      this.saveData(`draft_${this.leagueId}_${this.year}.json`, draftPicks);
      
      // Calculate statistics for auction drafts
      const auctionPicks = draftPicks.filter(p => p.bidAmount > 0);
      if (auctionPicks.length > 0) {
        console.log(`  ✓ Found ${auctionPicks.length} auction picks`);
        
        const totalSpent = auctionPicks.reduce((sum, p) => sum + p.bidAmount, 0);
        const avgPrice = totalSpent / auctionPicks.length;
        const maxPrice = Math.max(...auctionPicks.map(p => p.bidAmount));
        
        console.log(`  Total spent: $${totalSpent}`);
        console.log(`  Average price: $${avgPrice.toFixed(2)}`);
        console.log(`  Max price: $${maxPrice}`);
      }
    }
    
    return draftPicks;
  }
  
  /**
   * Fetch all transactions (trades, waivers, etc.)
   */
  async fetchTransactions(): Promise<Transaction[]> {
    console.log('\n📝 Fetching Transactions...');
    
    const data = await this.makeRequest('', {
      view: ['mTransactions2']
    });
    
    if (!data) return [];
    
    const transactions: Transaction[] = [];
    
    if (data.transactions) {
      for (const trans of data.transactions) {
        transactions.push({
          type: trans.type,
          date: trans.proposedDate || trans.processDate,
          teamId: trans.teamId,
          bidAmount: trans.bidAmount,
          status: trans.status
        });
      }
      
      this.saveData(`transactions_${this.leagueId}_${this.year}.json`, transactions);
      console.log(`  ✓ Found ${transactions.length} transactions`);
    }
    
    return transactions;
  }
  
  /**
   * Fetch player pool with projections
   */
  async fetchPlayers(): Promise<any> {
    console.log('\n👥 Fetching Player Pool...');
    
    const data = await this.makeRequest('', {
      view: ['kona_player_info'],
      'scoringPeriodId': 0,
      'x-fantasy-filter': JSON.stringify({
        players: {
          limit: 500,
          sortPercOwned: { sortPriority: 1, sortAsc: false }
        }
      })
    });
    
    if (data?.players) {
      this.saveData(`players_${this.leagueId}_${this.year}.json`, data.players);
      console.log(`  ✓ Found ${data.players.length} players`);
    }
    
    return data?.players || [];
  }
  
  /**
   * Fetch current rosters
   */
  async fetchRosters(): Promise<any> {
    console.log('\n📋 Fetching Current Rosters...');
    
    const data = await this.makeRequest('', {
      view: ['mRoster', 'mTeam']
    });
    
    if (data?.teams) {
      this.saveData(`rosters_${this.leagueId}_${this.year}.json`, data.teams);
      console.log(`  ✓ Found ${data.teams.length} team rosters`);
    }
    
    return data?.teams || [];
  }
  
  /**
   * Fetch free agents
   */
  async fetchFreeAgents(): Promise<any> {
    console.log('\n🆓 Fetching Free Agents...');
    
    const data = await this.makeRequest('', {
      view: ['kona_player_info'],
      'scoringPeriodId': 0,
      'x-fantasy-filter': JSON.stringify({
        players: {
          filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
          limit: 200,
          sortPercOwned: { sortPriority: 1, sortAsc: false }
        }
      })
    });
    
    if (data?.players) {
      this.saveData(`freeagents_${this.leagueId}_${this.year}.json`, data.players);
      console.log(`  ✓ Found ${data.players.length} free agents`);
    }
    
    return data?.players || [];
  }
  
  /**
   * Master function to download all data
   */
  async downloadAllData(): Promise<void> {
    console.log('========================================');
    console.log('ESPN Fantasy Football Data Download');
    console.log('========================================');
    console.log(`League ID: ${this.leagueId}`);
    console.log(`Season: ${this.year}`);
    console.log(`Authentication: ${this.cookies ? 'Private league' : 'Public access'}\n`);
    
    // Fetch all data
    const leagueInfo = await this.fetchLeagueInfo();
    
    if (!leagueInfo) {
      console.error('\n❌ Could not access league. Please check:');
      console.error('1. League ID is correct');
      console.error('2. League is public OR you provided valid cookies');
      console.error('3. League exists for the specified year');
      return;
    }
    
    const draftPicks = await this.fetchDraftResults();
    const transactions = await this.fetchTransactions();
    const players = await this.fetchPlayers();
    const rosters = await this.fetchRosters();
    const freeAgents = await this.fetchFreeAgents();
    
    // Create summary
    const summary = {
      leagueId: this.leagueId,
      year: this.year,
      downloadDate: new Date().toISOString(),
      leagueName: leagueInfo.settings?.name,
      draftType: leagueInfo.settings?.draftSettings?.type,
      teamCount: leagueInfo.teams?.length || 0,
      draftPicksCount: draftPicks.length,
      auctionPicksCount: draftPicks.filter(p => p.bidAmount > 0).length,
      transactionsCount: transactions.length,
      playersCount: players.length,
      freeAgentsCount: freeAgents.length
    };
    
    this.saveData(`summary_${this.leagueId}_${this.year}.json`, summary);
    
    console.log('\n========================================');
    console.log('✅ Download Complete!');
    console.log('========================================');
    console.log(`All data saved to: ${DATA_DIR}`);
    
    if (draftPicks.filter(p => p.bidAmount > 0).length > 0) {
      console.log('\n🎉 Auction draft data found! You can now analyze:');
      console.log('  • Actual prices paid for players');
      console.log('  • Inflation patterns throughout the draft');
      console.log('  • Position-specific spending trends');
      console.log('  • Team budget allocation strategies');
    }
  }
  
  /**
   * Analyze auction draft for insights
   */
  async analyzeDraft(): Promise<void> {
    console.log('\n📊 Analyzing Auction Draft Data...');
    
    const draftFile = path.join(DATA_DIR, `draft_${this.leagueId}_${this.year}.json`);
    
    if (!fs.existsSync(draftFile)) {
      console.log('No draft data found. Run downloadAllData() first.');
      return;
    }
    
    const draftPicks: DraftPick[] = JSON.parse(fs.readFileSync(draftFile, 'utf-8'));
    const auctionPicks = draftPicks.filter(p => p.bidAmount > 0);
    
    if (auctionPicks.length === 0) {
      console.log('No auction picks found in draft data.');
      return;
    }
    
    // Calculate inflation curve
    const totalBudget = 200 * 12; // Assuming $200 per team, 12 teams
    const totalPicks = auctionPicks.length;
    let cumulativeSpent = 0;
    const inflationPoints: any[] = [];
    
    auctionPicks.forEach((pick, index) => {
      cumulativeSpent += pick.bidAmount;
      const expectedSpent = (totalBudget * (index + 1)) / totalPicks;
      const inflationRate = cumulativeSpent / expectedSpent;
      
      inflationPoints.push({
        pickNumber: index + 1,
        bidAmount: pick.bidAmount,
        cumulativeSpent,
        expectedSpent,
        inflationRate
      });
    });
    
    // Key insights
    const early = inflationPoints.slice(0, 30);
    const middle = inflationPoints.slice(30, 90);
    const late = inflationPoints.slice(90);
    
    const analysis = {
      totalPicks: auctionPicks.length,
      totalSpent: cumulativeSpent,
      averagePrice: cumulativeSpent / auctionPicks.length,
      maxPrice: Math.max(...auctionPicks.map(p => p.bidAmount)),
      earlyInflation: early.length > 0 ? early[early.length - 1].inflationRate : 1,
      middleInflation: middle.length > 0 ? middle[middle.length - 1].inflationRate : 1,
      lateInflation: late.length > 0 ? late[late.length - 1].inflationRate : 1,
      inflationCurve: inflationPoints
    };
    
    this.saveData(`draft_analysis_${this.leagueId}_${this.year}.json`, analysis);
    
    console.log('\nDraft Analysis Results:');
    console.log(`  Total auction picks: ${analysis.totalPicks}`);
    console.log(`  Total spent: $${analysis.totalSpent}`);
    console.log(`  Average price: $${analysis.averagePrice.toFixed(2)}`);
    console.log(`  Max price: $${analysis.maxPrice}`);
    console.log(`  Early draft inflation: ${((analysis.earlyInflation - 1) * 100).toFixed(1)}%`);
    console.log(`  Middle draft inflation: ${((analysis.middleInflation - 1) * 100).toFixed(1)}%`);
    console.log(`  Late draft inflation: ${((analysis.lateInflation - 1) * 100).toFixed(1)}%`);
  }
}

export default ESPNDataFetcher;