import React, { useState } from 'react';
import { X, TrendingUp, AlertCircle, DollarSign, User } from 'lucide-react';
import { Player, Team } from '../types';
import { getPlayerValue, getBidRange } from '../utils/valueCalculator';

interface PlayerModalProps {
  player: Player;
  onDraft: (teamId: string, price: number) => void;
  onClose: () => void;
  teams: Team[];
}

export const PlayerModal: React.FC<PlayerModalProps> = ({ player, onDraft, onClose, teams }) => {
  const [selectedTeam, setSelectedTeam] = useState('my-team');
  const playerValue = getPlayerValue(player);
  const [bidAmount, setBidAmount] = useState(playerValue > 0 ? playerValue : 1);

  const handleDraft = () => {
    if (bidAmount > 0 && selectedTeam) {
      onDraft(selectedTeam, bidAmount);
    }
  };

  const selectedTeamData = teams.find(t => t.id === selectedTeam);
  const maxBid = selectedTeamData 
    ? selectedTeamData.budget - selectedTeamData.spentBudget - (16 - selectedTeamData.roster.length - 1)
    : 0;

  const getInjuryColor = (status?: string) => {
    if (!status || status === 'Healthy') return 'text-green-600';
    const colors: Record<string, string> = {
      'Questionable': 'text-yellow-600',
      'Doubtful': 'text-orange-600',
      'Out': 'text-red-600',
      'IR': 'text-red-800',
    };
    return colors[status] || 'text-gray-600';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{player.name}</h2>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-sm font-medium text-gray-600">{player.team}</span>
                <span className="text-sm text-gray-500">•</span>
                <span className="text-sm font-medium text-gray-600">{player.position}</span>
                <span className="text-sm text-gray-500">•</span>
                <span className="text-sm font-medium text-gray-600">Bye: Week {player.byeWeek}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600 mb-1">CVS Score</p>
              <p className="text-2xl font-bold text-draft-primary">{player.cvsScore}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600 mb-1">Projected Points</p>
              <p className="text-2xl font-bold">{player.projectedPoints}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600 mb-1">ADP</p>
              <p className="text-2xl font-bold">{Number(player.adp).toFixed(1)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-600 mb-1">Health Status</p>
              <p className={`text-lg font-bold ${getInjuryColor(player.injuryStatus)}`}>
                {player.injuryStatus || 'Healthy'}
              </p>
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-blue-900">Recommendation</h3>
            </div>
            <p className="text-sm text-blue-800">
              Recommended bid: {playerValue > 0 ? (
                <><span className="font-bold">${getBidRange(player).min}</span> - 
                <span className="font-bold">${getBidRange(player).max}</span></>
              ) : (
                <span className="font-bold">N/A (no auction value data)</span>
              )}
            </p>
            <p className="text-sm text-blue-700 mt-1">
              This player is projected to outperform their ADP by {Math.round((player.cvsScore - player.adp) / player.adp * 100)}%
            </p>
          </div>

          {/* Draft Controls */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Team
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-draft-primary"
              >
                {teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name} (${team.budget - team.spentBudget} remaining)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bid Amount
              </label>
              <div className="flex items-center space-x-3">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Math.min(parseInt(e.target.value) || 0, maxBid))}
                    min="1"
                    max={maxBid}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-draft-primary"
                  />
                </div>
                <button
                  onClick={() => setBidAmount(Math.max(1, bidAmount - 1))}
                  className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  -
                </button>
                <button
                  onClick={() => setBidAmount(Math.min(maxBid, bidAmount + 1))}
                  className="px-3 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                >
                  +
                </button>
              </div>
              {bidAmount > maxBid && (
                <p className="text-sm text-red-600 mt-1">
                  <AlertCircle className="inline w-4 h-4 mr-1" />
                  Exceeds maximum bid of ${maxBid}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={handleDraft}
              disabled={bidAmount > maxBid || bidAmount < 1}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                bidAmount <= maxBid && bidAmount >= 1
                  ? 'bg-draft-primary text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Draft for ${bidAmount}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};