/**
 * Market Status Component
 * Displays current market conditions and inflation metrics
 */

import React from 'react';
import { MarketContext } from '../../services/dashboard/dashboardDataService';
import { Tooltip } from '../Tooltip';

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
          <span className="text-xs text-gray-500 uppercase flex items-center">
            Phase
            <Tooltip content="Current stage of the draft based on percentage of players drafted. Opening (0-10%), Early (10-25%), Middle (25-50%), Late (50-75%), Closing (75-90%), Endgame (90-100%). Each phase has different strategy implications." />
          </span>
          <div className={`text-lg font-bold mt-1 ${phase.className}`}>{phase.name}</div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase flex items-center">
            Inflation
            <Tooltip content="Ratio of remaining money to remaining value. >1.0 means prices will be higher than normal (inflation), <1.0 means bargains available (deflation). Calculated as (money left / slots left) ÷ baseline average." />
          </span>
          <div className="text-lg font-bold mt-1">{marketContext.inflationRate.toFixed(2)}×</div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase flex items-center">
            Progress
            <Tooltip content="Percentage of total roster spots that have been filled across all teams. Helps gauge how much of the draft is complete and what phase you're in." />
          </span>
          <div className="text-lg font-bold mt-1">{marketContext.draftProgress.toFixed(0)}%</div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase flex items-center">
            Momentum
            <Tooltip content="Market temperature based on inflation rate. Cold (<0.95x) = bargains available, Warm (0.95-1.05x) = fair prices, Hot (1.05-1.15x) = rising prices, Overheated (>1.15x) = bidding wars likely." />
          </span>
          <div className="text-lg font-bold mt-1">{getMomentum(marketContext.inflationRate)}</div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase flex items-center">
            Pool
            <Tooltip content="Total money remaining across all teams. This is the entire budget pool still available to be spent. As this shrinks, competition for remaining players intensifies." />
          </span>
          <div className="text-lg font-bold mt-1 text-green-400">
            ${marketContext.totalRemaining}
          </div>
        </div>
        
        <div className="bg-gray-900 p-3 rounded">
          <span className="text-xs text-gray-500 uppercase flex items-center">
            Avg/Team
            <Tooltip content="Average budget remaining per team. Compare your remaining budget to this to see if you're cash-rich (can be aggressive) or cash-poor (need bargains) relative to competition." />
          </span>
          <div className="text-lg font-bold mt-1">
            ${marketContext.avgTeamRemaining.toFixed(0)}
          </div>
        </div>
      </div>
      
      {/* Pace indicator */}
      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center">
            Spending Pace vs Expected:
            <Tooltip content="Compares actual spending to expected spending at this point. >110% = Fast (teams overspending early), 90-110% = Normal, <90% = Slow (teams saving for later). Fast pace often leads to bargains later." />
          </span>
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