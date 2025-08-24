import { Player, PlayerProjection, GameInfo } from '../types';
import { DataPipeline } from '../data/DataPipeline';
import { errorHandler, DataValidator } from '../utils/ErrorHandler';
import { NameNormalizer } from '../../services/nameNormalizer';
import { playerService } from '../../services/espn/playerService';
import { csvDataLoader } from '../../services/espn/csvDataLoader';

export class MainAppIntegration {
  private dataPipeline: DataPipeline;
  private nameNormalizer: NameNormalizer;
  private playerCache: Map<string, any> = new Map();

  constructor() {
    this.dataPipeline = new DataPipeline();
    this.nameNormalizer = new NameNormalizer();
  }

  async syncWithDraftOptimizer(): Promise<PlayerProjection[]> {
    try {
      const draftPlayers = await this.loadDraftOptimizerData();
      
      const canonicalPlayers = await csvDataLoader.loadAllPlayerData();
      
      const sleeperUpdates = await playerService.getPlayers();
      
      const mergedProjections = this.mergeAllDataSources(
        draftPlayers,
        canonicalPlayers,
        sleeperUpdates
      );
      
      console.log(`Synced ${mergedProjections.length} players from main app`);
      
      return mergedProjections;
    } catch (error) {
      errorHandler.handleError(error as Error, {
        context: 'MainAppIntegration.syncWithDraftOptimizer'
      });
      throw error;
    }
  }

  private async loadDraftOptimizerData(): Promise<any[]> {
    try {
      const players = await csvDataLoader.getPlayersWithProjections();
      
      for (const player of players) {
        const normalizedName = this.nameNormalizer.normalize(player.name);
        this.playerCache.set(normalizedName, player);
        
        const variations = this.nameNormalizer.generateVariations(player.name);
        for (const variation of variations) {
          this.playerCache.set(variation, player);
        }
      }
      
      return players;
    } catch (error) {
      console.error('Failed to load draft optimizer data:', error);
      return [];
    }
  }

  private mergeAllDataSources(
    draftPlayers: any[],
    canonicalData: any[],
    sleeperData: any[]
  ): PlayerProjection[] {
    const projections: PlayerProjection[] = [];
    const processedIds = new Set<string>();
    
    for (const canonical of canonicalData) {
      if (!canonical.name || !canonical.team || !canonical.position) continue;
      
      const normalizedName = this.nameNormalizer.normalize(canonical.name);
      
      const draftPlayer = this.playerCache.get(normalizedName);
      const sleeperPlayer = this.findSleeperPlayer(normalizedName, sleeperData);
      
      const player: Player = {
        id: sleeperPlayer?.player_id || canonical.id || `canonical_${normalizedName}`,
        name: canonical.name,
        team: canonical.team,
        position: this.normalizePosition(canonical.position),
        status: sleeperPlayer?.injury_status || 'healthy',
        injuryDetails: sleeperPlayer?.injury_notes,
        practiceParticipation: this.parsePracticeStatus(sleeperPlayer?.practice_participation),
        projectedPoints: canonical.projectedPoints || draftPlayer?.projectedPoints || 0,
        salary: draftPlayer?.salary || 0,
        ownership: draftPlayer?.ownership || 0,
        adp: draftPlayer?.adp,
        auctionValue: draftPlayer?.auctionValue,
        tier: draftPlayer?.tier
      };
      
      if (processedIds.has(player.id)) continue;
      processedIds.add(player.id);
      
      const projection = this.createProjection(
        canonical,
        draftPlayer,
        sleeperPlayer
      );
      
      const gameInfo = this.extractGameInfo(canonical, draftPlayer);
      
      try {
        DataValidator.validatePlayerProjection({
          player,
          projection,
          gameInfo
        });
        
        projections.push({
          player,
          projection,
          gameInfo,
          weather: null,
          vorp: 0
        });
      } catch (validationError) {
        console.warn(`Skipping invalid player ${player.name}:`, validationError);
      }
    }
    
    for (const draftPlayer of draftPlayers) {
      const normalizedName = this.nameNormalizer.normalize(draftPlayer.name);
      const playerId = `draft_${normalizedName}`;
      
      if (processedIds.has(playerId)) continue;
      
      const player: Player = {
        id: playerId,
        name: draftPlayer.name,
        team: draftPlayer.team || 'FA',
        position: this.normalizePosition(draftPlayer.position),
        status: 'healthy',
        projectedPoints: draftPlayer.projectedPoints || 0,
        salary: draftPlayer.salary || 0,
        ownership: draftPlayer.ownership || 0,
        adp: draftPlayer.adp,
        auctionValue: draftPlayer.auctionValue,
        tier: draftPlayer.tier
      };
      
      const projection = this.createDefaultProjection(draftPlayer);
      
      try {
        DataValidator.validatePlayerProjection({
          player,
          projection,
          gameInfo: this.getDefaultGameInfo()
        });
        
        projections.push({
          player,
          projection,
          gameInfo: this.getDefaultGameInfo(),
          weather: null,
          vorp: 0
        });
        
        processedIds.add(playerId);
      } catch (validationError) {
        console.warn(`Skipping invalid draft player ${player.name}:`, validationError);
      }
    }
    
    return projections;
  }

  private findSleeperPlayer(normalizedName: string, sleeperData: any[]): any {
    return sleeperData.find(player => {
      const sleeperNormalized = this.nameNormalizer.normalize(
        player.full_name || `${player.first_name} ${player.last_name}`
      );
      return sleeperNormalized === normalizedName;
    });
  }

  private normalizePosition(position: string): Player['position'] {
    const normalized = position.toUpperCase();
    
    const positionMap: Record<string, Player['position']> = {
      'QB': 'QB',
      'RB': 'RB',
      'WR': 'WR',
      'TE': 'TE',
      'DST': 'DST',
      'D/ST': 'DST',
      'DEF': 'DST',
      'K': 'K',
      'PK': 'K'
    };
    
    return positionMap[normalized] || 'WR';
  }

  private parsePracticeStatus(status?: string): 'FP' | 'LP' | 'DNP' | undefined {
    if (!status) return undefined;
    
    const normalized = status.toUpperCase();
    if (normalized.includes('FULL')) return 'FP';
    if (normalized.includes('LIMITED')) return 'LP';
    if (normalized.includes('DNP') || normalized.includes('DID NOT')) return 'DNP';
    
    return undefined;
  }

  private createProjection(
    canonical: any,
    draftPlayer: any,
    sleeperPlayer: any
  ): any {
    const basePoints = canonical.projectedPoints || 
                      draftPlayer?.projectedPoints || 
                      0;
    
    const variance = basePoints * 0.15;
    
    return {
      floor: Math.max(0, basePoints - variance * 2),
      q1: Math.max(0, basePoints - variance),
      median: basePoints,
      q3: basePoints + variance,
      ceiling: basePoints + variance * 2,
      baseLogProjection: Math.log(Math.max(1, basePoints)),
      matchupAdjustment: 0,
      usageAdjustment: 0,
      trendAdjustment: 0,
      weatherAdjustment: 0,
      injuryAdjustment: sleeperPlayer?.injury_status ? -0.1 : 0,
      confidence: 0.7,
      variance: variance,
      components: {
        passingYards: canonical.passingYards || 0,
        passingTDs: canonical.passingTDs || 0,
        rushingYards: canonical.rushingYards || 0,
        rushingTDs: canonical.rushingTDs || 0,
        receptions: canonical.receptions || 0,
        receivingYards: canonical.receivingYards || 0,
        receivingTDs: canonical.receivingTDs || 0,
        interceptions: canonical.interceptions || 0
      }
    };
  }

  private createDefaultProjection(draftPlayer: any): any {
    const basePoints = draftPlayer.projectedPoints || 0;
    const variance = basePoints * 0.2;
    
    return {
      floor: Math.max(0, basePoints - variance * 2),
      q1: Math.max(0, basePoints - variance),
      median: basePoints,
      q3: basePoints + variance,
      ceiling: basePoints + variance * 2,
      baseLogProjection: Math.log(Math.max(1, basePoints)),
      matchupAdjustment: 0,
      usageAdjustment: 0,
      trendAdjustment: 0,
      weatherAdjustment: 0,
      injuryAdjustment: 0,
      confidence: 0.5,
      variance: variance,
      components: {}
    };
  }

  private extractGameInfo(canonical: any, draftPlayer: any): GameInfo {
    return {
      opponent: canonical.opponent || 'UNK',
      isHome: canonical.isHome ?? true,
      gameTime: canonical.gameTime ? new Date(canonical.gameTime) : new Date(),
      spread: canonical.spread || 0,
      total: canonical.total || 45,
      impliedPoints: canonical.impliedPoints || 22.5,
      oppDefenseRank: canonical.oppDefenseRank || draftPlayer?.oppRank || 16,
      oppPaceRank: 16,
      homeTeam: canonical.homeTeam || canonical.team || 'UNK',
      awayTeam: canonical.awayTeam || canonical.opponent || 'UNK'
    };
  }

  private getDefaultGameInfo(): GameInfo {
    return {
      opponent: 'UNK',
      isHome: true,
      gameTime: new Date(),
      spread: 0,
      total: 45,
      impliedPoints: 22.5,
      oppDefenseRank: 16,
      oppPaceRank: 16,
      homeTeam: 'UNK',
      awayTeam: 'UNK'
    };
  }

  async exportLineupToDraftOptimizer(lineup: any): Promise<void> {
    try {
      const exportData = {
        week: lineup.week,
        lineup: lineup.lineup.map((slot: any) => ({
          playerId: slot.player.id,
          playerName: slot.player.name,
          position: slot.position,
          projectedPoints: slot.projectedPoints,
          actualPoints: slot.actualPoints
        })),
        totalProjected: lineup.projectedPoints.total,
        totalActual: lineup.actualPoints,
        timestamp: new Date().toISOString()
      };
      
      console.log('Lineup exported to draft optimizer:', exportData);
      
    } catch (error) {
      errorHandler.handleError(error as Error, {
        context: 'MainAppIntegration.exportLineupToDraftOptimizer'
      });
    }
  }

  clearCache(): void {
    this.playerCache.clear();
  }
}

export const mainAppIntegration = new MainAppIntegration();