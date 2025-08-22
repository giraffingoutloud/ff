import React, { useState, useEffect } from 'react';
import { Users, Edit2, Check, X } from 'lucide-react';
import { Team } from '../types';

interface LeagueStatusProps {
  teams: Team[];
}

export const LeagueStatus: React.FC<LeagueStatusProps> = ({ teams }) => {
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [tempName, setTempName] = useState('');

  // Load saved team names from localStorage on mount
  useEffect(() => {
    const savedNames = localStorage.getItem('fantasyTeamNames');
    if (savedNames) {
      setTeamNames(JSON.parse(savedNames));
    }
  }, []);

  const saveTeamName = (teamId: string, newName: string) => {
    const updated = { ...teamNames, [teamId]: newName };
    setTeamNames(updated);
    localStorage.setItem('fantasyTeamNames', JSON.stringify(updated));
    setEditingTeam(null);
  };

  const startEditing = (teamId: string, currentName: string) => {
    setEditingTeam(teamId);
    setTempName(teamNames[teamId] || currentName);
  };

  const cancelEditing = () => {
    setEditingTeam(null);
    setTempName('');
  };
  const sortedTeams = [...teams].sort((a, b) => 
    (b.budget - b.spentBudget) - (a.budget - a.spentBudget)
  );

  const getSpendingPace = (team: Team) => {
    const percentSpent = (team.spentBudget / team.budget) * 100;
    const percentRosterFilled = (team.roster.length / 16) * 100;
    
    if (percentSpent > percentRosterFilled + 10) {
      return { label: 'Aggressive', color: 'text-red-600' };
    } else if (percentSpent < percentRosterFilled - 10) {
      return { label: 'Conservative', color: 'text-green-600' };
    }
    return { label: 'Balanced', color: 'text-gray-600' };
  };

  return (
    <div className="bg-dark-bg-secondary rounded-lg shadow-lg p-4 border border-dark-border">
      <h2 className="text-xl font-bold mb-4 flex items-center text-dark-text">
        <Users className="w-5 h-5 mr-2" />
        League Status
      </h2>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {sortedTeams.map((team) => {
          const remainingBudget = team.budget - team.spentBudget;
          const pace = getSpendingPace(team);
          const isMyTeam = team.id === 'my-team';
          
          return (
            <div
              key={team.id}
              className={`p-3 rounded-lg border ${
                isMyTeam 
                  ? 'border-draft-primary bg-blue-900/20' 
                  : 'border-gray-700 bg-gray-800/50'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  {editingTeam === team.id ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="px-2 py-1 bg-dark-bg border border-dark-border rounded text-dark-text text-sm w-32"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveTeamName(team.id, tempName);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                      />
                      <button
                        onClick={() => saveTeamName(team.id, tempName)}
                        className="text-green-400 hover:text-green-300"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <p className={`font-semibold ${isMyTeam ? 'text-draft-primary' : 'text-gray-200'}`}>
                        {teamNames[team.id] || team.name}
                      </p>
                      {!isMyTeam && (
                        <button
                          onClick={() => startEditing(team.id, team.name)}
                          className="text-gray-400 hover:text-draft-warning"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-gray-400">
                    {team.roster.length}/16 players
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-dark-text">${remainingBudget}</p>
                  <p className={`text-xs ${pace.color}`}>{pace.label}</p>
                </div>
              </div>

              <div className="bg-gray-700 rounded-full h-2">
                <div
                  className={`${isMyTeam ? 'bg-draft-primary' : 'bg-gray-600'} rounded-full h-2 transition-all`}
                  style={{ width: `${(team.spentBudget / team.budget) * 100}%` }}
                />
              </div>

              {team.roster.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400 mb-1">Recent picks:</p>
                  <div className="flex flex-wrap gap-1">
                    {team.roster.slice(-3).map(player => (
                      <span
                        key={player.id}
                        className="text-xs bg-dark-bg px-2 py-1 rounded border border-gray-600 text-gray-300"
                      >
                        {player.position} ${player.purchasePrice}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700">
        <h3 className="text-sm font-semibold mb-2 text-dark-text">Market Trends</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Avg Remaining:</span>
            <span className="font-semibold text-dark-text">
              ${Math.round(teams.reduce((sum, t) => sum + (t.budget - t.spentBudget), 0) / teams.length)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Total Spent:</span>
            <span className="font-semibold text-dark-text">
              ${teams.reduce((sum, t) => sum + t.spentBudget, 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};