/**
 * Additional free data sources for cross-referencing player data
 * Note: Most sports APIs require paid subscriptions
 */

export class AdditionalDataSources {
  /**
   * ESPN Fantasy API - Public endpoint (limited data)
   * No API key required for basic fantasy data
   */
  async fetchESPNData() {
    try {
      // ESPN's public fantasy endpoint - provides player news and updates
      const response = await fetch(
        'https://fantasy.espn.com/apis/v3/games/ffl/seasons/2025/players?view=players_wl',
        {
          headers: {
            'x-fantasy-filter': JSON.stringify({
              players: {
                limit: 1000,
                sortPercOwned: { sortAsc: false }
              }
            })
          }
        }
      );
      
      if (!response.ok) {
        console.warn('[ESPN API] Failed to fetch data:', response.status);
        return null;
      }
      
      const data = await response.json();
      console.log('[ESPN API] Fetched player data');
      return data;
    } catch (error) {
      console.warn('[ESPN API] Error fetching data:', error);
      return null;
    }
  }

  /**
   * Pro Football Reference - No official API but has CSV exports
   * Note: Web scraping their site violates TOS
   */
  getPFRDataInfo() {
    console.log('[PFR] Pro Football Reference provides CSV downloads at:');
    console.log('https://www.pro-football-reference.com/');
    console.log('But no free API available - manual downloads only');
    return null;
  }

  /**
   * NFL.com Fantasy API - Very limited public access
   */
  async fetchNFLData() {
    try {
      // NFL.com has some public endpoints but very limited
      const response = await fetch(
        'https://api.nfl.com/fantasy/v2/players/stats?season=2025&week=1',
        { mode: 'no-cors' } // Will likely be blocked by CORS
      );
      
      console.log('[NFL API] Note: NFL.com API is heavily restricted');
      return null;
    } catch (error) {
      console.warn('[NFL API] Expected CORS error - API not publicly accessible:', error);
      return null;
    }
  }

  /**
   * Yahoo Sports API - Requires OAuth authentication
   */
  getYahooDataInfo() {
    console.log('[Yahoo API] Requires OAuth2 authentication');
    console.log('Free tier available but needs user login flow');
    console.log('Documentation: https://developer.yahoo.com/fantasysports/guide/');
    return null;
  }

  /**
   * MySportsFeeds - Has free tier but requires registration
   */
  getMySportsFeedsInfo() {
    console.log('[MySportsFeeds] Free tier available with registration');
    console.log('Limited to 250 API calls per month on free tier');
    console.log('Requires API key from: https://www.mysportsfeeds.com/');
    return null;
  }

  /**
   * Summary of findings
   */
  logDataSourceSummary() {
    console.log('\n=== Free Fantasy Football Data Sources ===');
    console.log('✅ Sleeper API - Fully free, no auth required (currently using)');
    console.log('⚠️  ESPN Fantasy - Limited public data, CORS issues');
    console.log('❌ NFL.com - Heavily restricted, CORS blocked');
    console.log('🔐 Yahoo Fantasy - Free but requires OAuth flow');
    console.log('🔑 MySportsFeeds - Free tier needs registration (250 calls/month)');
    console.log('📊 Pro Football Reference - CSV downloads only, no API');
    console.log('\nConclusion: Sleeper remains the best free, unrestricted option');
    console.log('Most other sources require authentication, have CORS issues, or charge fees\n');
  }
}

export const additionalDataSources = new AdditionalDataSources();