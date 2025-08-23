/**
 * Position Scarcity Component
 * Visual representation of position supply/demand dynamics
 */

import React from 'react';
import { PositionScarcity as PositionScarcityData } from '../../services/dashboard/dashboardDataService';

interface PositionScarcityProps {
  scarcity: PositionScarcityData[];
}

export const PositionScarcity: React.FC<PositionScarcityProps> = ({ scarcity }) => {
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
  
  return (
    <section className="bg-gray-800 border border-gray-600 rounded-md p-3">
      <h3 className="text-2xl font-bold text-dark-text mb-2 cursor-help"
          title="Supply vs demand visualization for each position. Shows how many players are available (S) versus needed (D) across all teams. The multiplier (μ) indicates price inflation: >1.0 means scarce/expensive, <1.0 means oversupplied/cheaper.">
        Position Scarcity
      </h3>
      
      <div className="space-y-2">
        {scarcity.map(pos => {
          const multiplier = getMultiplier(pos.scarcityScore, pos.available, pos.needed);
          const classes = getScarcityClass(multiplier);
          const barWidth = ((multiplier - 0.85) / 0.3) * 100;
          
          return (
            <div key={pos.position} className="flex items-center gap-3">
              <span className="text-cyan-400 font-bold text-xs w-8">{pos.position}</span>
              
              <div className="flex-1 h-4 bg-gray-900 rounded-full overflow-hidden relative">
                <div 
                  className={`h-full ${classes.fill} transition-all duration-500 ${
                    classes.label === 'critical' ? 'animate-pulse' : ''
                  }`}
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
    </section>
  );
};