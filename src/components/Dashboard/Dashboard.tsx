/**
 * Main Dashboard Component
 * Aggregates all dashboard sections and manages data updates
 */

import React, { useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { useDraftStore } from '../../store/draftStore';
import { MarketStatus } from './MarketStatus';
import { OpportunitiesTable } from './OpportunitiesTable';
import { PositionScarcity } from './PositionScarcity';
import { MyRoster } from './MyRoster';
import { CriticalMoments } from './CriticalMoments';
import { DashboardDataService, DashboardData } from '../../services/dashboard/dashboardDataService';
import { defaultLeagueSettings } from '../../services/valuation/leagueSettings';

const Dashboard: React.FC = () => {
  const { players, draftedPlayers, teamBudgets, teamRosters, myTeamId, draftHistory } = useDraftStore();
  
  // Debounce rapidly changing values to prevent excessive recalculation
  const debouncedPlayers = useDebounce(players, 300);
  const debouncedDraftHistory = useDebounce(draftHistory, 300);
  
  // Initialize services
  const dashboardService = useMemo(() => {
    return new DashboardDataService(defaultLeagueSettings);
  }, []);
  
  // Generate dashboard data
  const dashboardData = useMemo<DashboardData>(() => {
    // Convert store state to dashboard service format
    const draftState = {
      draftedPlayers,
      teamBudgets,
      teamRosters,
      myTeamId,
      draftHistory
    };
    
    // All players including available ones
    const allPlayers = [...debouncedPlayers];
    
    return dashboardService.generateDashboardData(allPlayers, draftState);
  }, [debouncedPlayers, draftedPlayers, teamBudgets, teamRosters, myTeamId, debouncedDraftHistory, dashboardService]);
  
  return (
    <div className="dashboard bg-gray-900 border-t border-gray-700 mt-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-700 border border-gray-600 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            AUCTION DRAFT COMMAND CENTER
          </h1>
          <span className="bg-gray-900 px-3 py-1 rounded-full text-xs text-gray-400">v3.3</span>
        </div>
      </div>
      
      {/* System Status Bar */}
      <div className="bg-gray-800 border border-gray-600 rounded-md p-3 mb-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-gray-400 text-sm">SYSTEM STATUS: <strong className="text-green-400">✓ HEALTHY</strong></span>
        </div>
        
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">FPS:</span>
            <span className="text-green-400 font-bold">60</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">LAG:</span>
            <span className="text-green-400 font-bold">32ms</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">INFLATION:</span>
            <span className={`font-bold ${dashboardData.marketContext.inflationRate > 1.1 ? 'text-yellow-400' : 'text-green-400'}`}>
              {dashboardData.marketContext.inflationRate.toFixed(2)}×
            </span>
          </div>
        </div>
      </div>
      
      {/* Market Status */}
      <MarketStatus marketContext={dashboardData.marketContext} />
      
      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        {/* Left Column - Opportunities Table (spans 2 columns on xl) */}
        <div className="xl:col-span-2">
          <OpportunitiesTable opportunities={dashboardData.opportunities} />
        </div>
        
        {/* Right Column */}
        <div className="space-y-4">
          {/* Critical Moments */}
          <CriticalMoments moments={dashboardData.criticalMoments} />
          
          {/* Position Scarcity */}
          <PositionScarcity scarcity={dashboardData.positionScarcity} />
          
          {/* My Roster */}
          <MyRoster roster={dashboardData.myRoster} />
        </div>
      </div>
    </div>
  );
};

export default React.memo(Dashboard);