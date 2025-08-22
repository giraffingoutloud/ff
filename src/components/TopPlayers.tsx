import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Star } from 'lucide-react';
import { Player, Position } from '../types';

interface TopPlayersProps {
  players: Player[];
  onSelectPlayer: (player: Player) => void;
}

export const TopPlayers: React.FC<TopPlayersProps> = ({ players, onSelectPlayer }) => {
  const [selectedPosition, setSelectedPosition] = useState<Position | 'ALL'>('ALL');
  
  const positions: (Position | 'ALL')[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];
  
  const filteredPlayers = selectedPosition === 'ALL' 
    ? players.slice(0, 15)
    : players.filter(p => p.position === selectedPosition).slice(0, 10);

  const getValueIndicator = (player: Player) => {
    const expectedValue = player.adp * 2; // Simplified calculation
    const recommendedBid = player.auctionValue || 0; // Only use real auction values
    const difference = expectedValue - recommendedBid;
    
    if (difference > 10) {
      return { icon: TrendingUp, color: 'text-green-600', label: 'Undervalued' };
    } else if (difference < -10) {
      return { icon: TrendingDown, color: 'text-red-600', label: 'Overvalued' };
    }
    return { icon: Minus, color: 'text-gray-400', label: 'Fair Value' };
  };

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      QB: 'bg-red-100 text-red-800',
      RB: 'bg-blue-100 text-blue-800',
      WR: 'bg-green-100 text-green-800',
      TE: 'bg-purple-100 text-purple-800',
      K: 'bg-gray-100 text-gray-800',
      DST: 'bg-orange-100 text-orange-800',
    };
    return colors[position] || 'bg-gray-100 text-gray-800';
  };

  const getInjuryIcon = (status?: string) => {
    if (!status || status === 'Healthy') return null;
    
    const colors: Record<string, string> = {
      'Questionable': 'text-yellow-500',
      'Doubtful': 'text-orange-500',
      'Out': 'text-red-500',
      'IR': 'text-red-700',
    };
    
    return (
      <AlertCircle className={`w-4 h-4 ${colors[status] || 'text-gray-500'}`} />
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <h2 className="text-xl font-bold mb-4">Top Available Players</h2>
      
      <div className="flex space-x-2 mb-4 overflow-x-auto">
        {positions.map(pos => (
          <button
            key={pos}
            onClick={() => setSelectedPosition(pos)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              selectedPosition === pos
                ? 'bg-draft-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredPlayers.map((player, index) => {
          const valueIndicator = getValueIndicator(player);
          const ValueIcon = valueIndicator.icon;
          const recommendedBid = player.auctionValue || 0; // Only use real auction values
          
          return (
            <div
              key={player.id}
              onClick={() => onSelectPlayer(player)}
              className="p-3 rounded-lg border border-gray-200 hover:border-draft-primary hover:shadow-md cursor-pointer transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-bold text-gray-500 w-6">
                    {index + 1}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getPositionColor(player.position)}`}>
                    {player.position}
                  </span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="font-semibold text-gray-900">{player.name}</p>
                      {getInjuryIcon(player.injuryStatus)}
                      {player.cvsScore > 85 && (
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{player.team} • Bye: {player.byeWeek}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="font-bold text-draft-primary">${recommendedBid}</p>
                    <div className="flex items-center space-x-1">
                      <ValueIcon className={`w-3 h-3 ${valueIndicator.color}`} />
                      <p className="text-xs text-gray-500">CVS: {player.cvsScore}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};