import React from 'react';
import { X, TrendingUp, TrendingDown, Minus, Star, AlertCircle, Trophy, Target, DollarSign, Activity } from 'lucide-react';
import { Player } from '../types';

interface DarkPlayerComparisonProps {
  players: Player[];
  onClose: () => void;
  onRemovePlayer?: (playerId: string) => void;
  isEmbedded?: boolean;
}

export const DarkPlayerComparison: React.FC<DarkPlayerComparisonProps> = ({ 
  players, 
  onClose,
  onRemovePlayer,
  isEmbedded = false 
}) => {
  if (players.length === 0) return null;

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      QB: 'bg-red-500/20 text-red-400 border-red-500/50',
      RB: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      WR: 'bg-green-500/20 text-green-400 border-green-500/50',
      TE: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
      K: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
      DST: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    };
    return colors[position] || 'bg-gray-500/20 text-gray-400';
  };

  const getValueIndicator = (value: number, otherValues: number[], higherIsBetter: boolean = true) => {
    const max = Math.max(...otherValues);
    const min = Math.min(...otherValues);
    
    if (otherValues.length === 1) return <Minus className="w-4 h-4 text-gray-500" />;
    
    if (higherIsBetter) {
      if (value === max) return <TrendingUp className="w-4 h-4 text-green-400" />;
      if (value === min) return <TrendingDown className="w-4 h-4 text-red-400" />;
    } else {
      if (value === min) return <TrendingUp className="w-4 h-4 text-green-400" />;
      if (value === max) return <TrendingDown className="w-4 h-4 text-red-400" />;
    }
    return <Minus className="w-4 h-4 text-gray-500" />;
  };

  const getInjuryIcon = (status?: string) => {
    if (!status || status === 'Healthy') return null;
    const colors: Record<string, string> = {
      'Questionable': 'text-yellow-400',
      'Doubtful': 'text-orange-400',
      'Out': 'text-red-400',
      'IR': 'text-red-600',
    };
    return <AlertCircle className={`w-4 h-4 ${colors[status] || 'text-gray-400'}`} />;
  };

  const statCategories = [
    { key: 'cvsScore', label: 'CVS Score', icon: <Trophy className="w-4 h-4" />, higherIsBetter: true },
    { key: 'projectedPoints', label: 'Projected Points', icon: <Target className="w-4 h-4" />, higherIsBetter: true },
    { key: 'adp', label: 'ADP', icon: <Activity className="w-4 h-4" />, higherIsBetter: false },
    { key: 'auctionValue', label: 'Auction Value', icon: <DollarSign className="w-4 h-4" />, higherIsBetter: true },
    { key: 'age', label: 'Age', icon: <Star className="w-4 h-4" />, higherIsBetter: false },
  ];

  if (isEmbedded) {
    return (
      <div className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {players.map(player => {
            const receptionPercentage = player.targets && player.targets > 0 ? 
              ((player.receptions || 0) / player.targets) * 100 : 0;
            
            return (
              <div key={player.id} className="bg-dark-bg rounded-lg border border-dark-border p-2">
                {/* Player Header */}
                <div className="mb-2 pb-2 border-b border-dark-border">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      <h3 className="font-bold text-dark-text text-xs">{player.name}</h3>
                      <p className="text-[10px] text-dark-text-secondary">{player.team}</p>
                    </div>
                    {onRemovePlayer && (
                      <button
                        onClick={() => onRemovePlayer(player.id)}
                        className="text-dark-text-secondary hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] font-bold px-0.5 py-0 rounded border ${getPositionColor(player.position)}`}>
                      {player.position}
                    </span>
                    {player.injuryStatus && player.injuryStatus !== 'Healthy' && (
                      <div className="flex items-center gap-1">
                        {getInjuryIcon(player.injuryStatus)}
                        <span className="text-[9px] text-dark-text-secondary">{player.injuryStatus}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-1">
                  {statCategories.map(stat => {
                    const value = player[stat.key as keyof Player] as number;
                    const otherValues = players
                      .filter(p => p.id !== player.id)
                      .map(p => p[stat.key as keyof Player] as number);
                    
                    return (
                      <div key={stat.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-dark-text-secondary">
                          <span className="text-[10px]">{stat.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-bold ${
                            stat.key === 'cvsScore' && value >= 80 ? 'text-green-400' :
                            stat.key === 'cvsScore' && value >= 60 ? 'text-yellow-400' :
                            'text-dark-text'
                          }`}>
                            {stat.key === 'auctionValue' && value === 0 ? 'N/A' :
                             stat.key === 'auctionValue' ? `$${Math.round(value)}` :
                             stat.key === 'adp' ? Number(value).toFixed(1) :
                             Math.round(value)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Additional PPR Stats if available */}
                  {('receptions' in player) && (
                    <div className="pt-2 mt-2 border-t border-dark-border space-y-1">
                      <div className="text-[9px] text-dark-text-secondary font-semibold">PPR STATS</div>
                      {['receptions', 'targets', 'receivingYards', 'receivingTDs'].map(key => {
                        const value = (player as any)[key];
                        if (value === undefined) return null;
                        
                        const label = key === 'receptions' ? 'Receptions' :
                                     key === 'targets' ? 'Targets' :
                                     key === 'receivingYards' ? 'Rec Yards' :
                                     'Rec TDs';
                        
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-[10px] text-dark-text-secondary">{label}</span>
                            <span className="text-[10px] font-medium text-dark-text">
                              {Math.round(value)}
                            </span>
                          </div>
                        );
                      })}
                      {/* Reception Percentage */}
                      {player.targets && player.targets > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-dark-text-secondary">Catch %</span>
                          <span className={`text-[10px] font-medium ${
                            receptionPercentage >= 70 ? 'text-green-400' :
                            receptionPercentage >= 60 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {receptionPercentage.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-dark-bg-secondary border border-dark-border rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-dark-bg-tertiary p-4 border-b border-dark-border flex items-center justify-between">
          <h2 className="text-xl font-bold text-dark-text flex items-center gap-2">
            <Trophy className="w-6 h-6 text-draft-primary" />
            Player Comparison
          </h2>
          <button
            onClick={onClose}
            className="text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-x-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {players.map(player => (
              <div key={player.id} className="bg-dark-bg rounded-lg border border-dark-border p-4">
                {/* Player Header */}
                <div className="mb-4 pb-3 border-b border-dark-border">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-bold text-dark-text text-lg">{player.name}</h3>
                      <p className="text-sm text-dark-text-secondary">{player.team}</p>
                    </div>
                    {onRemovePlayer && (
                      <button
                        onClick={() => onRemovePlayer(player.id)}
                        className="text-dark-text-secondary hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${getPositionColor(player.position)}`}>
                      {player.position}
                    </span>
                    {player.injuryStatus && player.injuryStatus !== 'Healthy' && (
                      <div className="flex items-center gap-1">
                        {getInjuryIcon(player.injuryStatus)}
                        <span className="text-xs text-dark-text-secondary">{player.injuryStatus}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-3">
                  {statCategories.map(stat => {
                    const value = player[stat.key as keyof Player] as number;
                    const otherValues = players
                      .filter(p => p.id !== player.id)
                      .map(p => p[stat.key as keyof Player] as number);
                    
                    return (
                      <div key={stat.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-dark-text-secondary">
                          {stat.icon}
                          <span className="text-sm">{stat.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${
                            stat.key === 'cvsScore' && value >= 80 ? 'text-green-400' :
                            stat.key === 'cvsScore' && value >= 60 ? 'text-yellow-400' :
                            'text-dark-text'
                          }`}>
                            {stat.key === 'auctionValue' && value === 0 ? 'N/A' :
                             stat.key === 'auctionValue' ? `$${Math.round(value)}` :
                             stat.key === 'adp' ? Number(value).toFixed(1) :
                             Math.round(value)}
                          </span>
                          {getValueIndicator(value, otherValues, stat.higherIsBetter)}
                        </div>
                      </div>
                    );
                  })}

                  {/* Additional PPR Stats if available */}
                  {('receptions' in player) && (
                    <div className="pt-3 mt-3 border-t border-dark-border space-y-2">
                      <div className="text-xs text-dark-text-secondary font-semibold">PPR STATS</div>
                      {['receptions', 'targets', 'receivingYards', 'receivingTDs'].map(key => {
                        const value = (player as any)[key];
                        if (value === undefined) return null;
                        
                        const label = key === 'receptions' ? 'Receptions' :
                                     key === 'targets' ? 'Targets' :
                                     key === 'receivingYards' ? 'Rec Yards' :
                                     'Rec TDs';
                        
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-sm text-dark-text-secondary">{label}</span>
                            <span className="text-sm font-medium text-dark-text">
                              {Math.round(value)}
                            </span>
                          </div>
                        );
                      })}
                      {/* Reception Percentage */}
                      {player.targets && player.targets > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-dark-text-secondary">Catch %</span>
                          <span className={`text-sm font-medium ${
                            ((player.receptions || 0) / player.targets) * 100 >= 70 ? 'text-green-400' :
                            ((player.receptions || 0) / player.targets) * 100 >= 60 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {(((player.receptions || 0) / player.targets) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};