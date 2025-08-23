import { create } from 'zustand';
import { Player, Team, DraftedPlayer, DraftSettings } from '../types';
import { draftDB } from '../services/database';

export interface TeamBudget {
  remaining: number;
  maxBid: number;
}

export interface DraftState {
  // Core data
  players: Player[];
  teams: Team[];
  myTeam: Team;
  draftHistory: DraftedPlayer[];
  
  // Market context
  draftedPlayers: Set<string>;
  teamBudgets: Map<string, TeamBudget>;
  teamRosters: Map<string, string[]>;
  myTeamId: string;
  
  // UI state
  selectedPlayer: Player | null;
  
  // Settings
  settings: DraftSettings;
  
  // Actions
  setPlayers: (players: Player[]) => void;
  draftPlayer: (playerId: string, teamId: string, price: number) => Promise<void>;
  undoDraft: () => Promise<void>;
  selectPlayer: (player: Player | null) => void;
  initializeDraft: (settings: DraftSettings) => void;
}

// Create initial teams
const createInitialTeams = (): Team[] => {
  const teams: Team[] = [];
  for (let i = 0; i < 12; i++) {
    teams.push({
      id: i === 0 ? 'my-team' : `team-${i + 1}`,
      name: i === 0 ? 'My Team' : `Team ${i + 1}`,
      owner: i === 0 ? 'User' : `Owner ${i + 1}`,
      budget: 200,
      spentBudget: 0,
      roster: [],
      needs: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE'],
    });
  }
  return teams;
};

export const useDraftStore = create<DraftState>((set, get) => ({
  // Initial state
  players: [],
  teams: createInitialTeams(),
  myTeam: {
    id: 'my-team',
    name: 'My Team',
    owner: 'User',
    budget: 200,
    spentBudget: 0,
    roster: [],
    needs: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE'],
  },
  draftHistory: [],
  draftedPlayers: new Set<string>(),
  teamBudgets: new Map<string, TeamBudget>([
    ['my-team', { remaining: 200, maxBid: 190 }],
    ['team-2', { remaining: 200, maxBid: 190 }],
    ['team-3', { remaining: 200, maxBid: 190 }],
    ['team-4', { remaining: 200, maxBid: 190 }],
    ['team-5', { remaining: 200, maxBid: 190 }],
    ['team-6', { remaining: 200, maxBid: 190 }],
    ['team-7', { remaining: 200, maxBid: 190 }],
    ['team-8', { remaining: 200, maxBid: 190 }],
    ['team-9', { remaining: 200, maxBid: 190 }],
    ['team-10', { remaining: 200, maxBid: 190 }],
    ['team-11', { remaining: 200, maxBid: 190 }],
    ['team-12', { remaining: 200, maxBid: 190 }],
  ]),
  teamRosters: new Map<string, string[]>(),
  myTeamId: 'my-team',
  selectedPlayer: null,
  settings: {
    leagueSize: 12,
    budget: 200,
    rosterSize: 16,
    scoringType: 'PPR',
    flexPositions: ['RB', 'WR', 'TE'],
  },
  
  // Actions
  setPlayers: (players) => {
    console.log('setPlayers called with', players.length, 'players');
    if (players.length > 0) {
      console.log('First player:', players[0]);
    }
    set({ players });
  },
  
  draftPlayer: async (playerId, teamId, price) => {
    try {
      console.log('draftPlayer called with:', { playerId, teamId, price });
      const state = get();
      console.log('Current store has', state.players.length, 'players');
      
      // Try to find the player in the store
      let player = state.players.find(p => p.id === playerId);
      
      // If not found, check if we can find it in the window.__players (for debugging)
      if (!player && (window as any).__players) {
        console.log('Player not in store, checking window.__players');
        console.log('Looking for ID:', playerId);
        console.log('Available player IDs:', (window as any).__players.slice(0, 5).map((p: any) => p.id));
        player = (window as any).__players.find((p: any) => p.id === playerId);
        if (player) {
          console.log('Found player in window.__players, using that');
        } else {
          // Try to find by name as fallback
          const playerFromModal = (window as any).__lastDraftedPlayer;
          if (playerFromModal) {
            player = (window as any).__players.find((p: any) => p.name === playerFromModal.name);
            if (player) {
              console.log('Found player by name match:', player.name);
            }
          }
        }
      }
      
      if (!player) {
      console.error('Player not found with ID:', playerId);
      console.error('Total players in store:', state.players.length);
      if (state.players.length > 0) {
        console.error('Sample player IDs:', state.players.slice(0, 3).map(p => ({ id: p.id, name: p.name })));
      }
      // Don't throw error, just return to prevent blocking
      console.error('WARNING: Skipping draft due to player not found');
      return;
    }
      
      console.log('Found player:', player.name);
      
      const draftedPlayer: DraftedPlayer = {
      ...player,
      purchasePrice: price,
      purchasedBy: teamId,
      draftPosition: state.draftHistory.length + 1,
      timestamp: new Date(),
    };
      
      // Update database
      await draftDB.draftPlayer(playerId, teamId, price);
      
      set(state => {
        // Remove the player from the players array (whether found in store or window)
        const updatedPlayers = state.players.filter(p => p.id !== playerId);
        
        // Update market context
        const updatedDraftedPlayers = new Set(state.draftedPlayers);
        updatedDraftedPlayers.add(playerId);
        
        const updatedTeamBudgets = new Map(state.teamBudgets);
        const currentBudget = updatedTeamBudgets.get(teamId) || { remaining: 200, maxBid: 190 };
        const newRemaining = Math.max(0, currentBudget.remaining - price);
        const spotsRemaining = state.settings.rosterSize - (state.teamRosters.get(teamId)?.length || 0) - 1;
        const newMaxBid = Math.max(1, newRemaining - spotsRemaining);
        updatedTeamBudgets.set(teamId, { remaining: newRemaining, maxBid: newMaxBid });
        
        const updatedTeamRosters = new Map(state.teamRosters);
        const currentRoster = updatedTeamRosters.get(teamId) || [];
        updatedTeamRosters.set(teamId, [...currentRoster, playerId]);
        
        // Create a completely new teams array with new team objects
        const updatedTeams = state.teams.map(team => {
          if (team.id === teamId) {
            return {
              ...team,
              spentBudget: team.spentBudget + price,
              budget: team.budget, // Keep budget property
              roster: [...team.roster, draftedPlayer],
              needs: [...team.needs] // Create new array reference
            };
          }
          return { ...team }; // Create new object for other teams too
        });
        
        const updatedState = {
          players: updatedPlayers,
          draftHistory: [...state.draftHistory, draftedPlayer],
          teams: updatedTeams,
          draftedPlayers: updatedDraftedPlayers,
          teamBudgets: updatedTeamBudgets,
          teamRosters: updatedTeamRosters,
          myTeam: state.myTeam.id === teamId
            ? {
                ...state.myTeam,
                spentBudget: state.myTeam.spentBudget + price,
                roster: [...state.myTeam.roster, draftedPlayer],
                needs: [...state.myTeam.needs]
              }
            : { ...state.myTeam },
        };
        
        console.log('Updated team:', updatedState.teams.find(t => t.id === teamId));
        console.log('Updated myTeam:', updatedState.myTeam);
        console.log('Remaining players:', updatedState.players.length);
        console.log('All teams after update:', updatedState.teams.map(t => ({ id: t.id, spent: t.spentBudget, roster: t.roster.length })));
        
        return updatedState;
      });
    } catch (error) {
      console.error('Error in draftPlayer:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  },
  
  undoDraft: async () => {
    const state = get();
    const lastDrafted = state.draftHistory[state.draftHistory.length - 1];
    if (!lastDrafted) return;
    
    // Update database
    await draftDB.undoLastDraft();
    
    // Create a copy of the drafted player without the draft-specific fields
    const { purchasePrice, purchasedBy, draftPosition, timestamp, ...restoredPlayer } = lastDrafted;
    
    set(state => {
      // Update market context
      const updatedDraftedPlayers = new Set(state.draftedPlayers);
      updatedDraftedPlayers.delete(lastDrafted.id);
      
      const updatedTeamBudgets = new Map(state.teamBudgets);
      const currentBudget = updatedTeamBudgets.get(lastDrafted.purchasedBy) || { remaining: 0, maxBid: 0 };
      const newRemaining = currentBudget.remaining + lastDrafted.purchasePrice;
      const spotsRemaining = state.settings.rosterSize - (state.teamRosters.get(lastDrafted.purchasedBy)?.length || 0) + 1;
      const newMaxBid = Math.max(1, newRemaining - spotsRemaining);
      updatedTeamBudgets.set(lastDrafted.purchasedBy, { remaining: newRemaining, maxBid: newMaxBid });
      
      const updatedTeamRosters = new Map(state.teamRosters);
      const currentRoster = updatedTeamRosters.get(lastDrafted.purchasedBy) || [];
      updatedTeamRosters.set(lastDrafted.purchasedBy, currentRoster.filter(id => id !== lastDrafted.id));
      
      const updatedState = {
        players: [...state.players, restoredPlayer],
        draftHistory: state.draftHistory.slice(0, -1),
        draftedPlayers: updatedDraftedPlayers,
        teamBudgets: updatedTeamBudgets,
        teamRosters: updatedTeamRosters,
        teams: state.teams.map(team =>
          team.id === lastDrafted.purchasedBy
            ? {
                ...team,
                spentBudget: Math.max(0, team.spentBudget - lastDrafted.purchasePrice),
                roster: team.roster.filter(p => p.id !== lastDrafted.id),
                needs: [...team.needs]
              }
            : { ...team }
        ),
        myTeam: state.myTeam.id === lastDrafted.purchasedBy
          ? {
              ...state.myTeam,
              spentBudget: Math.max(0, state.myTeam.spentBudget - lastDrafted.purchasePrice),
              roster: state.myTeam.roster.filter(p => p.id !== lastDrafted.id),
              needs: [...state.myTeam.needs]
            }
          : { ...state.myTeam },
      };
      
      console.log('Undo complete - removed player:', lastDrafted.name, 'from team:', lastDrafted.purchasedBy);
      console.log('Updated teams after undo:', updatedState.teams.map(t => ({ id: t.id, spent: t.spentBudget, roster: t.roster.length })));
      
      return updatedState;
    });
  },
  
  selectPlayer: (player) => set({ selectedPlayer: player }),
  
  initializeDraft: (settings) => {
    const teams: Team[] = [];
    for (let i = 0; i < settings.leagueSize; i++) {
      teams.push({
        id: i === 0 ? 'my-team' : `team-${i + 1}`,
        name: i === 0 ? 'My Team' : `Team ${i + 1}`,
        owner: i === 0 ? 'User' : `Owner ${i + 1}`,
        budget: settings.budget,
        spentBudget: 0,
        roster: [],
        needs: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE'],
      });
    }
    
    set({ settings, teams });
  },
}))