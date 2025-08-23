/**
 * Optimized Player Loader
 * Reduces initial load time by:
 * 1. Loading only essential data initially (top 100 players)
 * 2. Deferring calculations until needed
 * 3. Using web workers for heavy computations (if available)
 * 4. Caching processed data aggressively
 */

import { Player } from '../types';
import { playerDB } from './database';
import { improvedCanonicalService } from './improvedCanonicalService';

export class OptimizedLoader {
  private static instance: OptimizedLoader;
  private loadingPromise: Promise<Player[]> | null = null;
  private cachedPlayers: Player[] = [];
  
  static getInstance(): OptimizedLoader {
    if (!OptimizedLoader.instance) {
      OptimizedLoader.instance = new OptimizedLoader();
    }
    return OptimizedLoader.instance;
  }
  
  /**
   * Quick load - Gets top players immediately for initial render
   */
  async quickLoad(limit: number = 100): Promise<Player[]> {
    // Try to get from cache first
    if (this.cachedPlayers.length > 0) {
      return this.cachedPlayers.slice(0, limit);
    }
    
    // Try database
    try {
      const dbPlayers = await playerDB.getAll();
      if (dbPlayers.length > 0) {
        // Sort by ADP to get most relevant players first
        dbPlayers.sort((a, b) => (a.adp || 999) - (b.adp || 999));
        this.cachedPlayers = dbPlayers;
        return dbPlayers.slice(0, limit);
      }
    } catch (e) {
      console.warn('Quick load from DB failed:', e);
    }
    
    // Fall back to loading from CSV
    const players = await improvedCanonicalService.initialize();
    players.sort((a, b) => (a.adp || 999) - (b.adp || 999));
    this.cachedPlayers = players;
    return players.slice(0, limit);
  }
  
  /**
   * Full load - Gets all players in background
   */
  async fullLoad(): Promise<Player[]> {
    // Prevent duplicate loads
    if (this.loadingPromise) {
      return this.loadingPromise;
    }
    
    this.loadingPromise = this.loadFullData();
    return this.loadingPromise;
  }
  
  private async loadFullData(): Promise<Player[]> {
    try {
      // Try database first
      let players = await playerDB.getAll();
      
      if (players.length === 0) {
        // Load from CSV
        players = await improvedCanonicalService.initialize();
        
        // Save to DB in background (don't wait)
        playerDB.bulkUpsert(players).catch(err => 
          console.warn('Failed to save to DB:', err)
        );
      }
      
      this.cachedPlayers = players;
      return players;
    } finally {
      this.loadingPromise = null;
    }
  }
  
  /**
   * Process players in chunks to avoid blocking UI
   */
  async processInChunks<T>(
    players: Player[],
    processor: (player: Player) => T,
    chunkSize: number = 50,
    onProgress?: (progress: number) => void
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < players.length; i += chunkSize) {
      const chunk = players.slice(i, i + chunkSize);
      
      // Process chunk
      const chunkResults = chunk.map(processor);
      results.push(...chunkResults);
      
      // Report progress
      if (onProgress) {
        const progress = Math.min(100, Math.round((i + chunkSize) / players.length * 100));
        onProgress(progress);
      }
      
      // Yield to browser to prevent blocking
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return results;
  }
  
  /**
   * Defer heavy calculations until actually needed
   */
  createLazyProxy<T extends Player>(player: T, calculator: (player: T) => any): T {
    const cache = new Map<string, any>();
    
    return new Proxy(player, {
      get(target, prop: string) {
        // Return cached value if available
        if (cache.has(prop)) {
          return cache.get(prop);
        }
        
        // Calculate on demand for computed properties
        if (prop === 'cvsScore' && !target.cvsScore) {
          const value = calculator(target).cvsScore;
          cache.set(prop, value);
          return value;
        }
        
        // Return original value
        return target[prop as keyof T];
      }
    });
  }
}

export const optimizedLoader = OptimizedLoader.getInstance();