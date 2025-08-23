/**
 * Critical Moments Component
 * Alerts for important draft situations requiring immediate attention
 * Also includes position scarcity visualization
 */

import React from 'react';
import { CriticalMoment, PositionScarcity as PositionScarcityData } from '../../services/dashboard/dashboardDataService';

interface CriticalMomentsProps {
  moments: CriticalMoment[];
  scarcity?: PositionScarcityData[];
}

export const CriticalMoments: React.FC<CriticalMomentsProps> = ({ moments, scarcity }) => {
  const getUrgencyClass = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'border-l-red-900/20 bg-red-900/20';
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
      <section className="bg-gray-800 border border-gray-600 rounded-md p-3">
        <h3 className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
          <span className="text-yellow-400 animate-pulse text-xs">⚠️</span>
          CRITICAL MOMENTS
        </h3>
        <div className="text-xs text-gray-500">No critical situations detected</div>
      </section>
    );
  }
  
  return (
    <section className="bg-gray-800 border border-gray-600 rounded-md p-3">
      <h3 className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
        <span className="text-yellow-400 animate-pulse text-xs">⚠️</span>
        CRITICAL MOMENTS
      </h3>
      
      <div className="space-y-2">
        {moments.slice(0, 3).map((moment, idx) => (
          <div
            key={idx}
            className={`bg-gray-900 rounded p-3 border-l-4 transition-all ${
              getUrgencyClass(moment.urgency)
            }`}
            role={moment.urgency === 'high' ? 'alert' : undefined}
          >
            <div className="flex items-start gap-2 mb-1">
              <span className="text-sm">{getSeverityIcon(moment.urgency)}</span>
              <div className="flex-1">
                <div className="font-bold text-xs text-gray-200">
                  {moment.message}
                </div>
                {moment.position !== 'ALL' && (
                  <span className="text-[10px] bg-gray-700 px-1.5 py-0.5 rounded mt-1 inline-block">
                    {moment.position}
                  </span>
                )}
              </div>
            </div>
            
            {/* Action recommendation */}
            <div className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
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
                      className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-cyan-400"
                    >
                      {player.name}
                    </span>
                  ))}
                  {moment.affectedPlayers.length > 3 && (
                    <span className="text-[10px] text-gray-500">
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
        <div className="mt-2 text-[10px] text-gray-500 text-center">
          {moments.length - 3} more alerts...
        </div>
      )}
      
      {/* Position Scarcity Section */}
      {scarcity && scarcity.length > 0 && (
        <>
          <div className="mt-4 pt-3 border-t border-gray-700">
            <h4 className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">POSITION SCARCITY</h4>
            
            <div className="space-y-2">
              {scarcity.map(pos => {
                // Calculate multiplier from scarcity score
                const getMultiplier = (score: number, available: number, needed: number) => {
                  if (available === 0) return 1.15;
                  const ratio = needed / available;
                  // Map to multiplier range [0.85, 1.15]
                  const multiplier = 0.85 + (ratio * 0.3);
                  return Math.min(1.15, Math.max(0.85, multiplier));
                };
                
                // Get style classes based on multiplier thresholds
                const getScarcityClass = (multiplier: number) => {
                  if (multiplier <= 0.95) return {
                    fill: 'bg-gradient-to-r from-blue-600 to-cyan-500',
                    badge: 'bg-blue-900/50 text-blue-400 border-blue-600',
                    label: 'oversupplied'
                  };
                  if (multiplier <= 1.05) return {
                    fill: 'bg-gradient-to-r from-green-600 to-green-400',
                    badge: 'bg-green-900/50 text-green-400 border-green-600',
                    label: 'balanced'
                  };
                  if (multiplier <= 1.12) return {
                    fill: 'bg-gradient-to-r from-yellow-600 to-yellow-400',
                    badge: 'bg-yellow-900/50 text-yellow-400 border-yellow-600',
                    label: 'scarce'
                  };
                  return {
                    fill: 'bg-gradient-to-r from-red-600 to-red-400',
                    badge: 'bg-red-900/50 text-red-400 border-red-600',
                    label: 'critical'
                  };
                };
                
                const multiplier = getMultiplier(pos.scarcityScore, pos.available, pos.needed);
                const classes = getScarcityClass(multiplier);
                const barWidth = ((multiplier - 0.85) / 0.3) * 100;
                
                return (
                  <div key={pos.position} className="flex items-center gap-3">
                    <span className="text-cyan-400 font-bold text-xs w-8">{pos.position}</span>
                    
                    <div className="flex-1 h-4 bg-gray-900 rounded-full overflow-hidden relative">
                      <div 
                        className={`h-full ${classes.fill} transition-all duration-500`}
                        style={{ width: `${Math.min(100, barWidth)}%` }}
                      />
                    </div>
                    
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-gray-400">
                        D:{pos.needed} S:{pos.available}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded border ${classes.badge} font-mono font-bold`}>
                        μ={multiplier.toFixed(2)}×
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Legend */}
            <div className="mt-3 pt-2 border-t border-gray-700 text-[10px]">
              <div className="flex justify-center gap-6 mb-1">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-500">Oversupplied</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span className="text-gray-500">Balanced</span>
                </div>
              </div>
              <div className="flex justify-center gap-6">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                  <span className="text-gray-500">Scarce</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <span className="text-gray-500">Critical</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};