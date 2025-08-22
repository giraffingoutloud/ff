import Dexie, { Table } from 'dexie';
import { Player, CVSComponents, DraftedPlayer, PlayerNews } from '../types';

interface PlayerRecord extends Player {
  isDrafted?: boolean;
}

interface DraftRecord {
  id?: number;
  playerId: string;
  teamId: string;
  purchasePrice: number;
  draftPosition: number;
  timestamp: Date;
}

interface CVSRecord {
  playerId: string;
  pps: number;
  var: number;
  con: number;
  ups: number;
  sos: number;
  trd: number;
  inj: number;
  calculatedAt: Date;
}

class FantasyDatabase extends Dexie {
  players!: Table<PlayerRecord>;
  draftHistory!: Table<DraftRecord>;
  cvsComponents!: Table<CVSRecord>;
  playerNews!: Table<PlayerNews>;

  constructor() {
    super('FantasyDraftDB');
    
    this.version(1).stores({
      players: 'id, name, position, team, cvsScore, isDrafted',
      draftHistory: '++id, playerId, teamId, draftPosition',
      cvsComponents: 'playerId',
      playerNews: '++id, playerId, date'
    });
  }
}

const db = new FantasyDatabase();

// Player CRUD operations
export const playerDB = {
  async getAll(): Promise<Player[]> {
    return await db.players
      .where('isDrafted')
      .notEqual(1)
      .reverse()
      .sortBy('cvsScore');
  },

  async getByPosition(position: string): Promise<Player[]> {
    return await db.players
      .where('position')
      .equals(position)
      .filter(p => !p.isDrafted)
      .reverse()
      .sortBy('cvsScore');
  },

  async getById(id: string): Promise<Player | undefined> {
    return await db.players.get(id);
  },

  async search(query: string): Promise<Player[]> {
    const lowerQuery = query.toLowerCase();
    return await db.players
      .filter(p => 
        !p.isDrafted && 
        (p.name.toLowerCase().includes(lowerQuery) || 
         p.team.toLowerCase().includes(lowerQuery))
      )
      .limit(20)
      .reverse()
      .sortBy('cvsScore');
  },

  async upsert(player: Player): Promise<void> {
    await db.players.put({ ...player, isDrafted: false });
  },

  async bulkUpsert(players: Player[]): Promise<void> {
    await db.players.bulkPut(players.map(p => ({ ...p, isDrafted: false })));
  },

  async updateCVS(playerId: string, cvsScore: number, components: CVSComponents): Promise<void> {
    await db.transaction('rw', db.players, db.cvsComponents, async () => {
      await db.players.update(playerId, { cvsScore });
      await db.cvsComponents.put({
        playerId,
        ...components,
        calculatedAt: new Date()
      });
    });
  },
};

// Draft operations
export const draftDB = {
  async draftPlayer(playerId: string, teamId: string, price: number): Promise<void> {
    await db.transaction('rw', db.players, db.draftHistory, async () => {
      // Mark player as drafted
      await db.players.update(playerId, { isDrafted: true });
      
      // Get current draft position
      const count = await db.draftHistory.count();
      
      // Add to draft history
      await db.draftHistory.add({
        playerId,
        teamId,
        purchasePrice: price,
        draftPosition: count + 1,
        timestamp: new Date()
      });
    });
  },

  async undoLastDraft(): Promise<void> {
    await db.transaction('rw', db.players, db.draftHistory, async () => {
      // Get last draft entry
      const lastDraft = await db.draftHistory
        .orderBy('draftPosition')
        .reverse()
        .first();
      
      if (lastDraft) {
        // Mark player as undrafted
        await db.players.update(lastDraft.playerId, { isDrafted: false });
        
        // Remove from draft history
        await db.draftHistory.delete(lastDraft.id!);
      }
    });
  },

  async getDraftHistory(): Promise<DraftedPlayer[]> {
    const drafts = await db.draftHistory.toArray();
    const draftedPlayers: DraftedPlayer[] = [];
    
    for (const draft of drafts) {
      const player = await db.players.get(draft.playerId);
      if (player) {
        draftedPlayers.push({
          ...player,
          purchasePrice: draft.purchasePrice,
          purchasedBy: draft.teamId,
          draftPosition: draft.draftPosition,
          timestamp: draft.timestamp
        });
      }
    }
    
    return draftedPlayers.sort((a, b) => b.draftPosition - a.draftPosition);
  },

  async clearDraft(): Promise<void> {
    await db.transaction('rw', db.players, db.draftHistory, async () => {
      // Mark all players as undrafted
      await db.players.toCollection().modify({ isDrafted: false });
      
      // Clear draft history
      await db.draftHistory.clear();
    });
  },
};

// News operations
export const newsDB = {
  async addNews(news: PlayerNews): Promise<void> {
    await db.playerNews.add(news);
  },

  async getPlayerNews(playerId: string): Promise<PlayerNews[]> {
    return await db.playerNews
      .where('playerId')
      .equals(playerId)
      .reverse()
      .sortBy('date');
  },
};

export { db };