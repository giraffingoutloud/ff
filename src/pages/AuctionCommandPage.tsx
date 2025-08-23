import React, { useEffect } from 'react';
import { X } from 'lucide-react';
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
        <div className="flex items-center justify-end mb-4">
          <button
            onClick={() => window.close()}
            className="p-2 hover:bg-dark-bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <Dashboard />
      </div>
    </div>
  );
};