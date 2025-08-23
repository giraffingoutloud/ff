import { ExtendedPlayer } from './pprAnalyzer';
import { Position } from '../types';
import { badgeDataService } from './badgeDataService';

interface FilterOptions {
  searchQuery: string;
  selectedPositions: Set<Position>;
  showOnlyAvailable: boolean;
  selectedBadges: Set<string>;
  tableViewMode: 'ALL' | 'BUYS' | 'TRAPS';
  improvedEvaluations: any[];
}

interface BadgeCache {
  [playerId: string]: {
    [badge: string]: boolean;
  };
}

class OptimizedFilterService {
  private badgeCache: BadgeCache = {};
  private lastCacheReset = Date.now();
  private CACHE_TTL = 60000; // 1 minute cache
  
  // Pre-calculate badge values and cache them
  private getCachedBadge(player: ExtendedPlayer, badge: string): boolean {
    // Reset cache periodically
    if (Date.now() - this.lastCacheReset > this.CACHE_TTL) {
      this.badgeCache = {};
      this.lastCacheReset = Date.now();
    }
    
    if (!this.badgeCache[player.id]) {
      this.badgeCache[player.id] = {};
    }
    
    if (this.badgeCache[player.id][badge] !== undefined) {
      return this.badgeCache[player.id][badge];
    }
    
    // Calculate and cache
    const hasBadge = this.calculateBadge(player, badge);
    this.badgeCache[player.id][badge] = hasBadge;
    return hasBadge;
  }
  
  private calculateBadge(player: ExtendedPlayer, badge: string): boolean {
    switch(badge) {
      case 'overvalued':
        return (player.auctionValue ?? 0) >= 10 && player.cvsScore < ((player.auctionValue ?? 0) * 2.5);
      case 'sleeper':
        return player.adp > 100 && player.adp < 200 && player.projectedPoints > 120;
      case 'hot':
        return (player.trending || 0) > 3000;
      case 'trending':
        return (player.trending || 0) > 1500 && (player.trending || 0) <= 3000;
      case 'rising':
        return (player.trending || 0) > 500 && (player.trending || 0) <= 1500;
      case 'injury':
        return player.injuryStatus !== undefined && player.injuryStatus !== 'Healthy';
      case 'value':
        return player.adp > 36 && player.adp < 150 && (
          (player.position === 'QB' && player.projectedPoints > 240) ||
          (player.position === 'RB' && player.projectedPoints > 180) ||
          (player.position === 'WR' && player.projectedPoints > 200) ||
          (player.position === 'TE' && player.projectedPoints > 140)
        );
      case 'pprstud':
        return (player.receptions || 0) >= 75;
      case 'bustrisk':
        return player.adp < 50 && player.adp > 0 && (
          (player.position === 'RB' && player.projectedPoints < 215) ||
          (player.position === 'WR' && player.projectedPoints < 230) ||
          (player.position === 'QB' && player.projectedPoints < 300) ||
          (player.position === 'TE' && player.projectedPoints < 195)
        );
      case 'consistent':
        return badgeDataService.isConsistentProducer(player.name);
      case 'rzmonster':
        return badgeDataService.isRedZoneMonster(player.name);
      case 'volume':
        return badgeDataService.isVolumeKing(player.name);
      default:
        return false;
    }
  }
  
  // Optimized filter that processes all conditions in a single pass
  filterPlayers(players: ExtendedPlayer[], options: FilterOptions): ExtendedPlayer[] {
    const {
      searchQuery,
      selectedPositions,
      showOnlyAvailable,
      selectedBadges,
      tableViewMode,
      improvedEvaluations
    } = options;
    
    // Pre-process search query once
    const searchLower = searchQuery.toLowerCase();
    const hasSearch = searchQuery.length > 0;
    const hasPositionFilter = selectedPositions.size > 0;
    const hasBadgeFilter = selectedBadges.size > 0;
    
    // Create evaluation lookup map for O(1) access instead of O(n) find
    const evaluationMap = new Map(
      improvedEvaluations.map(e => [e.id, e])
    );
    
    return players.filter(player => {
      // Early returns for most common filters (fastest checks first)
      
      // 1. Availability check (fastest)
      if (showOnlyAvailable && player.isDrafted) return false;
      
      // 2. Position check (fast set lookup)
      if (hasPositionFilter && !selectedPositions.has(player.position)) return false;
      
      // 3. Search check (only if search exists)
      if (hasSearch && !player.name.toLowerCase().includes(searchLower)) return false;
      
      // 4. Badge check (use cache)
      if (hasBadgeFilter) {
        let matchesBadge = false;
        for (const badge of selectedBadges) {
          if (this.getCachedBadge(player, badge)) {
            matchesBadge = true;
            break;
          }
        }
        if (!matchesBadge) return false;
      }
      
      // 5. View mode filter (BUYS/TRAPS) - most expensive, do last
      if (tableViewMode !== 'ALL') {
        const playerEval = evaluationMap.get(player.id);
        if (!playerEval) return false;
        
        if (tableViewMode === 'BUYS') {
          return playerEval.valueRecommendation === 'strong-buy' || 
                 (playerEval.edge && playerEval.edge > 15 && 
                  playerEval.edgePercent && playerEval.edgePercent > 25);
        } else if (tableViewMode === 'TRAPS') {
          return playerEval.valueRecommendation === 'strong-avoid' || 
                 (playerEval.edge && playerEval.edge < -5 && 
                  playerEval.edgePercent && playerEval.edgePercent < -10);
        }
      }
      
      return true;
    });
  }
  
  // Clear cache when data changes significantly
  clearCache() {
    this.badgeCache = {};
    this.lastCacheReset = Date.now();
  }
}

export const optimizedFilterService = new OptimizedFilterService();