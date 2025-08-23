/**
 * My Roster Component
 * Shows budget status and roster composition
 */

import React from 'react';
import { DashboardData } from '../../services/dashboard/dashboardDataService';

interface MyRosterProps {
  roster: DashboardData['myRoster'];
}

export const MyRoster: React.FC<MyRosterProps> = ({ roster }) => {
  const maxBid = Math.max(1, roster.remaining - (roster.rosterSpots - roster.filledSpots - 1));
  const avgPerSlot = roster.rosterSpots - roster.filledSpots > 0
    ? roster.remaining / (roster.rosterSpots - roster.filledSpots)
    : 0;
  
  // Position requirements (typical league)
  const positionRequirements = {
    QB: { min: 1, max: 2 },
    RB: { min: 2, max: 5 },
    WR: { min: 3, max: 6 },
    TE: { min: 1, max: 2 },
    K: { min: 1, max: 1 },
    DST: { min: 1, max: 1 },
    FLEX: { min: 1, max: 2 }
  };
  
  // Calculate position fill status
  const getPositionStatus = (position: string) => {
    const req = positionRequirements[position as keyof typeof positionRequirements];
    
    if (!req) return { status: 'empty', count: 0, required: 0 };
    
    // Get actual filled count from positionCounts object
    const filled = roster.positionCounts?.[position] || 0;
    
    if (filled >= req.min) return { status: 'complete', count: filled, required: req.min };
    if (filled > 0) return { status: 'partial', count: filled, required: req.min };
    return { status: 'empty', count: filled, required: req.min };
  };
  
  return (
    <section className="bg-gray-800 border border-gray-600 rounded-md p-4">
      <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3">MY ROSTER</h3>
      
      {/* Budget Section */}
      <div className="bg-gray-900 rounded p-3 mb-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-gray-500 uppercase">Spent</span>
            <div className="text-xl font-bold text-red-400">${roster.spent}</div>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase">Remaining</span>
            <div className="text-xl font-bold text-green-400">${roster.remaining}</div>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase">Max Bid</span>
            <div className="text-xl font-bold text-yellow-400">${maxBid}</div>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase">Avg/Slot</span>
            <div className="text-xl font-bold text-gray-400">${avgPerSlot.toFixed(0)}</div>
          </div>
        </div>
      </div>
      
      {/* Position Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {Object.keys(positionRequirements).map(position => {
          const status = getPositionStatus(position);
          const statusClass = status.status === 'complete' 
            ? 'border-green-600 bg-green-900/20'
            : status.status === 'partial'
            ? 'border-yellow-600 bg-yellow-900/20'
            : 'border-red-600 bg-red-900/20';
          
          const icon = status.status === 'complete' ? '✓' : '⚠';
          const iconColor = status.status === 'complete' ? 'text-green-400' : 'text-yellow-400';
          
          return (
            <div
              key={position}
              className={`bg-gray-900 border rounded p-2 text-center transition-all ${statusClass}`}
            >
              <div className="font-bold text-gray-200">{position}</div>
              <div className="text-xs text-gray-400 flex items-center justify-center gap-1">
                {status.count}/{status.required}
                <span className={iconColor}>{icon}</span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Needs Section */}
      <div className="bg-gray-900 rounded p-3">
        <h4 className="text-xs text-gray-400 mb-2">PRIORITY NEEDS</h4>
        <div className="space-y-2">
          {roster.needs.slice(0, 3).map((need, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <span className="bg-yellow-600 text-gray-900 px-1.5 py-0.5 rounded text-xs font-bold">
                #{idx + 1}
              </span>
              <span className="text-gray-300">{need}</span>
              {idx === 0 && <span className="text-xs text-gray-500 ml-auto">High priority</span>}
              {idx === 1 && <span className="text-xs text-gray-500 ml-auto">Medium priority</span>}
              {idx === 2 && <span className="text-xs text-gray-500 ml-auto">Low priority</span>}
            </div>
          ))}
        </div>
      </div>
      
      {/* Warnings */}
      {avgPerSlot < 5 && roster.rosterSpots - roster.filledSpots > 5 && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-600 rounded text-xs text-red-400">
          ⚠️ Budget constraint: Only ${avgPerSlot.toFixed(0)} per remaining spot
        </div>
      )}
    </section>
  );
};