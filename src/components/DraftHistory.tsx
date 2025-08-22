import React from 'react';
import { Clock, User, Undo, Check } from 'lucide-react';
import { useDraftStore } from '../store/draftStore';
import { format } from 'date-fns';

export const DraftHistory: React.FC = () => {
  const { draftHistory, undoDraft } = useDraftStore();

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      QB: 'bg-red-900/30 text-red-400',
      RB: 'bg-green-900/30 text-green-400',
      WR: 'bg-blue-900/30 text-blue-400',
      TE: 'bg-orange-900/30 text-orange-400',
      K: 'bg-violet-900/30 text-violet-400',
      DST: 'bg-gray-900/30 text-gray-400',
    };
    return colors[position] || 'bg-gray-900/30 text-gray-400';
  };

  if (draftHistory.length === 0) {
    return (
      <div className="text-center py-8 text-dark-text-secondary">
        <Clock className="w-8 h-8 mx-auto mb-2 text-dark-text-tertiary" />
        <p className="text-sm font-medium">No players drafted yet</p>
        <p className="text-xs mt-1">Draft history will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-dark-text flex items-center gap-1">
          <Check className="w-3 h-3 text-white" />
          Recent Picks
        </h3>
        {draftHistory.length > 0 && (
          <button
            onClick={undoDraft}
            className="flex items-center space-x-1 text-xs text-dark-text-secondary hover:text-dark-primary transition-colors"
          >
            <Undo className="w-3 h-3" />
            <span>Undo</span>
          </button>
        )}
      </div>

      <div className="space-y-1 max-h-96 overflow-y-auto">
        {draftHistory.slice(-5).reverse().map((player, index) => (
          <div
            key={`${player.id}-${player.timestamp}`}
            className="p-2 bg-dark-bg rounded border border-dark-border"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2">
                <span className="text-xs font-bold text-dark-text-tertiary">
                  #{player.draftPosition}
                </span>
                <div>
                  <div className="flex items-center space-x-1 mb-1">
                    <span className={`px-1 py-0.5 rounded text-xs font-semibold ${getPositionColor(player.position)}`}>
                      {player.position}
                    </span>
                    <p className="text-xs font-semibold text-dark-text">{player.name}</p>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-dark-text-secondary">
                    <span className="flex items-center">
                      <User className="w-2 h-2 mr-1" />
                      {player.purchasedBy === 'my-team' ? 'My Team' : player.purchasedBy.replace('team-', 'Team ')}
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-2 h-2 mr-1" />
                      {format(new Date(player.timestamp), 'h:mm a')}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-sm font-bold text-dark-primary">${player.purchasePrice}</p>
                <p className="text-[10px] text-dark-text-tertiary">CVS: {player.cvsScore}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};