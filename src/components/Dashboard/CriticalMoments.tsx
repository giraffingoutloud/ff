/**
 * Critical Moments Component
 * Alerts for important draft situations requiring immediate attention
 */

import React from 'react';
import { CriticalMoment } from '../../services/dashboard/dashboardDataService';

interface CriticalMomentsProps {
  moments: CriticalMoment[];
}

export const CriticalMoments: React.FC<CriticalMomentsProps> = ({ moments }) => {
  const getUrgencyClass = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'border-l-red-500 bg-red-900/20';
      case 'medium':
        return 'border-l-yellow-500 bg-yellow-900/20';
      case 'low':
        return 'border-l-blue-500 bg-blue-900/20';
      default:
        return 'border-l-gray-500 bg-gray-900/20';
    }
  };
  
  const getIcon = (type: string) => {
    switch (type) {
      case 'last-elite':
        return '👑';
      case 'scarcity-cliff':
        return '📉';
      case 'value-run':
        return '🔥';
      case 'budget-pressure':
        return '💰';
      default:
        return '⚠️';
    }
  };
  
  const getSeverityIcon = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return '🚨';
      case 'medium':
        return '🔥';
      case 'low':
        return '💡';
      default:
        return '⚠️';
    }
  };
  
  if (moments.length === 0) {
    return (
      <section className="bg-gray-800 border border-gray-600 rounded-md p-4">
        <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
          <span className="text-yellow-400 animate-pulse">⚠️</span>
          CRITICAL MOMENTS
        </h3>
        <div className="text-sm text-gray-500">No critical situations detected</div>
      </section>
    );
  }
  
  return (
    <section className="bg-gray-800 border border-gray-600 rounded-md p-4">
      <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
        <span className="text-yellow-400 animate-pulse">⚠️</span>
        CRITICAL MOMENTS
      </h3>
      
      <div className="space-y-2">
        {moments.slice(0, 3).map((moment, idx) => (
          <div
            key={idx}
            className={`bg-gray-900 rounded p-3 border-l-4 transition-all ${
              getUrgencyClass(moment.urgency)
            } ${moment.urgency === 'high' ? 'animate-pulse' : ''}`}
            role={moment.urgency === 'high' ? 'alert' : undefined}
          >
            <div className="flex items-start gap-2 mb-1">
              <span className="text-lg">{getSeverityIcon(moment.urgency)}</span>
              <div className="flex-1">
                <div className="font-bold text-sm text-gray-200">
                  {moment.message}
                </div>
                {moment.position !== 'ALL' && (
                  <span className="text-xs bg-gray-700 px-2 py-0.5 rounded mt-1 inline-block">
                    {moment.position}
                  </span>
                )}
              </div>
            </div>
            
            {/* Action recommendation */}
            <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <span>→</span>
              <span>
                {moment.type === 'last-elite' && 'Act within 3-5 picks or lose tier'}
                {moment.type === 'scarcity-cliff' && 'Prioritize this position now'}
                {moment.type === 'value-run' && 'Consider pivoting to other positions'}
                {moment.type === 'budget-pressure' && 'Focus on value plays only'}
              </span>
            </div>
            
            {/* Affected players preview */}
            {moment.affectedPlayers.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-700">
                <div className="flex flex-wrap gap-1">
                  {moment.affectedPlayers.slice(0, 3).map(player => (
                    <span
                      key={player.id}
                      className="text-xs bg-gray-800 px-2 py-0.5 rounded text-cyan-400"
                    >
                      {player.name}
                    </span>
                  ))}
                  {moment.affectedPlayers.length > 3 && (
                    <span className="text-xs text-gray-500">
                      +{moment.affectedPlayers.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {moments.length > 3 && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          {moments.length - 3} more alerts...
        </div>
      )}
    </section>
  );
};