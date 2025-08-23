import React, { useEffect } from 'react';
import Dashboard from '../components/Dashboard/Dashboard';
import { useDraftStore } from '../store/draftStore';
import '../index.css';

export const AuctionCommandPage: React.FC = () => {
  const { players, teams, draftHistory, myTeamId, setPlayers } = useDraftStore();
  
  useEffect(() => {
    // Sync data from localStorage if opening in a new window
    if (players.length === 0) {
      const storedPlayers = localStorage.getItem('ff_players');
      const storedTeams = localStorage.getItem('ff_teams');
      const storedHistory = localStorage.getItem('ff_draftHistory');
      const storedUserTeamId = localStorage.getItem('ff_userTeamId');
      
      if (storedPlayers) {
        const parsedPlayers = JSON.parse(storedPlayers);
        setPlayers(parsedPlayers);
      }
      
      // TODO: Also sync teams, history, and userTeamId to the stores if needed
    }
  }, [players.length, setPlayers]);

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text-primary p-4">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-dark-text-primary">
            Auction Draft Command Center
          </h1>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Close Window
          </button>
        </div>
        <Dashboard />
      </div>
    </div>
  );
};