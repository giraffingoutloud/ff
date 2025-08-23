/**
 * Market Status Component
 * Displays current market conditions and inflation metrics
 */

import React from 'react';
import { MarketContext } from '../../services/dashboard/dashboardDataService';

interface MarketStatusProps {
  marketContext: MarketContext;
}

export const MarketStatus: React.FC<MarketStatusProps> = ({ marketContext }) => {
  // Determine draft phase based on progress
  const getPhase = (progress: number) => {
    if (progress < 10) return { name: 'OPENING', className: 'text-blue-400' };
    if (progress < 25) return { name: 'EARLY', className: 'text-cyan-400' };
    if (progress < 50) return { name: 'MIDDLE', className: 'text-green-400' };
    if (progress < 75) return { name: 'LATE', className: 'text-yellow-400' };
    if (progress < 90) return { name: 'CLOSING', className: 'text-orange-400' };
    return { name: 'ENDGAME', className: 'text-red-400' };
  };
  
  const phase = getPhase(marketContext.draftProgress);
  
  // Determine momentum
  const getMomentum = (inflation: number) => {
    if (inflation < 0.95) return '❄️ COLD';
    if (inflation < 1.05) return '🌡️ WARM';
    if (inflation < 1.15) return '🔥 HOT';
    return '🌋 OVERHEATED';
  };
  
  return (
    <section className="bg-gray-800 border border-gray-600 rounded-md p-4 mb-4">
      <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3">MARKET STATUS</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase">Phase</span>
          <div className={`text-lg font-bold mt-1 ${phase.className}`}>{phase.name}</div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase">Inflation</span>
          <div className="text-lg font-bold mt-1">{marketContext.inflationRate.toFixed(2)}×</div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase">Progress</span>
          <div className="text-lg font-bold mt-1">{marketContext.draftProgress.toFixed(0)}%</div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase">Momentum</span>
          <div className="text-lg font-bold mt-1">{getMomentum(marketContext.inflationRate)}</div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase">Remaining</span>
          <div className="text-lg font-bold mt-1 text-green-400">
            ${marketContext.totalRemaining}
          </div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase">Avg/Team</span>
          <div className="text-lg font-bold mt-1">
            ${marketContext.avgTeamRemaining.toFixed(0)}
          </div>
        </div>
      </div>
      
      {/* Pace indicator */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Spending Pace vs Expected:</span>
          <span className={`font-bold ${
            marketContext.paceVsExpected > 1.1 ? 'text-red-400' :
            marketContext.paceVsExpected < 0.9 ? 'text-blue-400' :
            'text-green-400'
          }`}>
            {(marketContext.paceVsExpected * 100).toFixed(0)}%
            {marketContext.paceVsExpected > 1.1 && ' (Fast)'}
            {marketContext.paceVsExpected < 0.9 && ' (Slow)'}
          </span>
        </div>
      </div>
    </section>
  );
};