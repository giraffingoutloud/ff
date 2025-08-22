/**
 * Real-time Data Service
 * 
 * ONLY fetches real-time updates from Sleeper API:
 * - Injury status
 * - Team changes (trades)
 * - Player news
 * - Trending players
 * 
 * NEVER fetches base player data - that comes from canonical_data ONLY
 */

import { Player } from '../types';

// Configuration for update frequency
export const UPDATE_CONFIG = {
  // How often to fetch updates (in milliseconds)
  INJURY_UPDATE_INTERVAL: 5 * 60 * 1000, // 5 minutes
  NEWS_UPDATE_INTERVAL: 10 * 60 * 1000, // 10 minutes
  TRENDING_UPDATE_INTERVAL: 15 * 60 * 1000, // 15 minutes
  
  // Enable/disable specific updates
  FETCH_INJURIES: true,
  FETCH_NEWS: true,
  FETCH_TRENDING: true,
  
  // API endpoints
  SLEEPER_BASE_URL: 'https://api.sleeper.app/v1',
};

interface SleeperPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string;
  position?: string;
  injury_status?: string;
  injury_notes?: string;
  news_updated?: string;
}

interface PlayerUpdate {
  name: string;
  team?: string;
  injuryStatus?: string;
  injuryNotes?: string;
  newsUpdated?: Date;
  trending?: number;
}

/**
 * Service for fetching ONLY real-time updates
 * Base player data MUST come from canonical sources
 */
export class RealtimeDataService {
  private updateTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private lastUpdateTime: Map<string, Date> = new Map();
  
  /**
   * Start periodic updates for real-time data
   */
  startPeriodicUpdates(onUpdate: (updates: Map<string, PlayerUpdate>) => void) {
    console.log('=== STARTING REAL-TIME UPDATES ===');
    console.log('Update intervals:');
    console.log(`  - Injuries: ${UPDATE_CONFIG.INJURY_UPDATE_INTERVAL / 1000}s`);
    console.log(`  - News: ${UPDATE_CONFIG.NEWS_UPDATE_INTERVAL / 1000}s`);
    console.log(`  - Trending: ${UPDATE_CONFIG.TRENDING_UPDATE_INTERVAL / 1000}s`);
    
    // Make service available globally for debugging
    (window as any).realtimeDataService = this;
    (window as any).testInjuryUpdate = async () => {
      const updates = await this.fetchInjuryUpdates();
      console.log('Manual injury update test:', updates);
      onUpdate(updates);
      return updates;
    };
    
    // Schedule injury updates
    if (UPDATE_CONFIG.FETCH_INJURIES) {
      this.scheduleUpdate('injuries', UPDATE_CONFIG.INJURY_UPDATE_INTERVAL, async () => {
        const updates = await this.fetchInjuryUpdates();
        onUpdate(updates);
      });
    }
    
    // Schedule news updates
    if (UPDATE_CONFIG.FETCH_NEWS) {
      this.scheduleUpdate('news', UPDATE_CONFIG.NEWS_UPDATE_INTERVAL, async () => {
        const updates = await this.fetchNewsUpdates();
        onUpdate(updates);
      });
    }
    
    // Schedule trending updates
    if (UPDATE_CONFIG.FETCH_TRENDING) {
      this.scheduleUpdate('trending', UPDATE_CONFIG.TRENDING_UPDATE_INTERVAL, async () => {
        const updates = await this.fetchTrendingPlayers();
        onUpdate(updates);
      });
    }
  }
  
  /**
   * Stop all periodic updates
   */
  stopPeriodicUpdates() {
    console.log('Stopping real-time updates...');
    this.updateTimers.forEach(timer => clearInterval(timer));
    this.updateTimers.clear();
  }
  
  /**
   * Schedule a periodic update
   */
  private scheduleUpdate(key: string, interval: number, callback: () => Promise<void>) {
    // Clear existing timer if any
    const existingTimer = this.updateTimers.get(key);
    if (existingTimer) {
      clearInterval(existingTimer);
    }
    
    // Run immediately
    callback().catch(error => {
      console.error(`Failed to fetch ${key}:`, error);
    });
    
    // Then schedule periodic updates
    const timer = setInterval(() => {
      callback().catch(error => {
        console.error(`Failed to fetch ${key}:`, error);
      });
    }, interval);
    
    this.updateTimers.set(key, timer);
  }
  
  /**
   * Fetch injury updates ONLY
   */
  async fetchInjuryUpdates(): Promise<Map<string, PlayerUpdate>> {
    const updates = new Map<string, PlayerUpdate>();
    
    try {
      console.log('Fetching injury updates from Sleeper API...');
      const response = await fetch(`${UPDATE_CONFIG.SLEEPER_BASE_URL}/players/nfl`);
      
      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status}`);
      }
      
      const data = await response.json();
      let injuryCount = 0;
      
      Object.values(data as Record<string, SleeperPlayer>).forEach(player => {
        if (player.injury_status && player.injury_status !== 'Healthy') {
          const name = player.full_name || `${player.first_name} ${player.last_name}`;
          
          // Log first few injuries to see what data we're getting
          if (injuryCount < 3) {
            console.log(`Injury data for ${name}:`, {
              status: player.injury_status,
              notes: player.injury_notes,
              mapped: this.mapInjuryStatus(player.injury_status)
            });
          }
          
          updates.set(name, {
            name,
            injuryStatus: this.mapInjuryStatus(player.injury_status),
            injuryNotes: player.injury_notes
          });
          
          injuryCount++;
        }
      });
      
      console.log(`  ✓ Found ${injuryCount} injury updates`);
      this.lastUpdateTime.set('injuries', new Date());
    } catch (error) {
      console.error('Failed to fetch injury updates:', error);
    }
    
    return updates;
  }
  
  /**
   * Fetch news updates ONLY
   */
  async fetchNewsUpdates(): Promise<Map<string, PlayerUpdate>> {
    const updates = new Map<string, PlayerUpdate>();
    
    try {
      console.log('Fetching news updates from Sleeper API...');
      const response = await fetch(`${UPDATE_CONFIG.SLEEPER_BASE_URL}/players/nfl`);
      
      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status}`);
      }
      
      const data = await response.json();
      const now = Date.now();
      const newsThreshold = now - (24 * 60 * 60 * 1000); // Last 24 hours
      let newsCount = 0;
      
      Object.values(data as Record<string, SleeperPlayer>).forEach(player => {
        if (player.news_updated) {
          const newsTime = parseInt(player.news_updated);
          if (newsTime > newsThreshold) {
            const name = player.full_name || `${player.first_name} ${player.last_name}`;
            
            updates.set(name, {
              name,
              newsUpdated: new Date(newsTime)
            });
            
            newsCount++;
          }
        }
      });
      
      console.log(`  ✓ Found ${newsCount} recent news updates`);
      this.lastUpdateTime.set('news', new Date());
    } catch (error) {
      console.error('Failed to fetch news updates:', error);
    }
    
    return updates;
  }
  
  /**
   * Fetch trending players ONLY
   */
  async fetchTrendingPlayers(): Promise<Map<string, PlayerUpdate>> {
    const updates = new Map<string, PlayerUpdate>();
    
    try {
      console.log('Fetching trending players from Sleeper API...');
      const response = await fetch(`${UPDATE_CONFIG.SLEEPER_BASE_URL}/players/nfl/trending/add`);
      
      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Get player details for trending IDs
      const playerResponse = await fetch(`${UPDATE_CONFIG.SLEEPER_BASE_URL}/players/nfl`);
      const playerData = await playerResponse.json();
      
      Object.entries(data as Record<string, number>).forEach(([playerId, count]) => {
        const player = playerData[playerId];
        if (player) {
          const name = player.full_name || `${player.first_name} ${player.last_name}`;
          
          updates.set(name, {
            name,
            trending: count
          });
        }
      });
      
      console.log(`  ✓ Found ${updates.size} trending players`);
      this.lastUpdateTime.set('trending', new Date());
    } catch (error) {
      console.error('Failed to fetch trending players:', error);
    }
    
    return updates;
  }
  
  /**
   * Fetch team changes (trades) ONLY
   */
  async fetchTeamUpdates(playerNames: string[]): Promise<Map<string, PlayerUpdate>> {
    const updates = new Map<string, PlayerUpdate>();
    
    try {
      console.log('Checking for team changes...');
      const response = await fetch(`${UPDATE_CONFIG.SLEEPER_BASE_URL}/players/nfl`);
      
      if (!response.ok) {
        throw new Error(`Sleeper API error: ${response.status}`);
      }
      
      const data = await response.json();
      let tradeCount = 0;
      
      Object.values(data as Record<string, SleeperPlayer>).forEach(player => {
        const name = player.full_name || `${player.first_name} ${player.last_name}`;
        
        // Only check players we know about
        if (playerNames.includes(name) && player.team) {
          updates.set(name, {
            name,
            team: player.team
          });
          tradeCount++;
        }
      });
      
      console.log(`  ✓ Checked ${tradeCount} players for team changes`);
    } catch (error) {
      console.error('Failed to fetch team updates:', error);
    }
    
    return updates;
  }
  
  /**
   * Map Sleeper injury status to our format
   */
  private mapInjuryStatus(status?: string): string {
    if (!status) return 'Healthy';
    
    const statusMap: Record<string, string> = {
      'IR': 'IR',
      'Out': 'Out',
      'Doubtful': 'Doubtful',
      'Questionable': 'Questionable',
      'PUP': 'PUP',
      'Sus': 'Suspended',
      'NA': 'Healthy'
    };
    
    return statusMap[status] || status;
  }
  
  /**
   * Get last update time for a specific data type
   */
  getLastUpdateTime(type: 'injuries' | 'news' | 'trending'): Date | undefined {
    return this.lastUpdateTime.get(type);
  }
  
  /**
   * Update configuration (can be called at runtime)
   */
  updateConfig(config: Partial<typeof UPDATE_CONFIG>) {
    Object.assign(UPDATE_CONFIG, config);
    console.log('Updated real-time data configuration:', UPDATE_CONFIG);
  }
}

// Export singleton instance
export const realtimeDataService = new RealtimeDataService();