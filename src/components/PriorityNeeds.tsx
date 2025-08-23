import React, { useMemo } from 'react';
import { AlertCircle, TrendingUp, Target } from 'lucide-react';
import { Position } from '../types';
import { Tooltip } from './Tooltip';

interface PriorityNeedsProps {
  roster: any[];
  remainingBudget: number;
  spotsLeft: number;
}

export const PriorityNeeds: React.FC<PriorityNeedsProps> = ({ 
  roster, 
  remainingBudget, 
  spotsLeft 
}) => {
  const needs = useMemo(() => {
    // Count current positions
    const positionCounts: Record<string, number> = {
      QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0
    };
    
    roster.forEach(player => {
      if (positionCounts[player.position] !== undefined) {
        positionCounts[player.position]++;
      }
    });
    
    // Define minimum requirements for a competitive team
    const requirements = {
      QB: 2,
      RB: 4,
      WR: 4,
      TE: 2,
      K: 1,
      DST: 1
    };
    
    // Calculate needs
    const priorityList: Array<{
      position: string;
      needed: number;
      have: number;
      urgency: 'critical' | 'high' | 'medium' | 'low';
      suggestedBudget: number;
    }> = [];
    
    Object.entries(requirements).forEach(([pos, required]) => {
      const have = positionCounts[pos];
      const needed = required - have;
      
      if (needed > 0) {
        // Calculate urgency based on spots left and need
        let urgency: 'critical' | 'high' | 'medium' | 'low';
        if (spotsLeft <= needed) {
          urgency = 'critical';
        } else if (needed >= 2) {
          urgency = 'high';
        } else if (spotsLeft < 5) {
          urgency = 'medium';
        } else {
          urgency = 'low';
        }
        
        // Suggest budget allocation
        const avgPerSpot = spotsLeft > 0 ? remainingBudget / spotsLeft : 0;
        let suggestedBudget = avgPerSpot;
        
        // Adjust based on position importance
        if (pos === 'RB' || pos === 'WR') {
          suggestedBudget = avgPerSpot * 1.3;
        } else if (pos === 'QB' || pos === 'TE') {
          suggestedBudget = avgPerSpot * 1.1;
        } else if (pos === 'K' || pos === 'DST') {
          suggestedBudget = Math.min(avgPerSpot * 0.5, 2);
        }
        
        priorityList.push({
          position: pos,
          needed,
          have,
          urgency,
          suggestedBudget: Math.round(suggestedBudget)
        });
      }
    });
    
    // Sort by urgency and needed count
    return priorityList.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return b.needed - a.needed;
    });
  }, [roster, remainingBudget, spotsLeft]);
  
  if (needs.length === 0) {
    return (
      <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-green-400" />
          <span className="text-sm font-semibold text-green-400">Roster Complete!</span>
        </div>
        <p className="text-xs text-green-400/80 mt-1">
          All position requirements met. Focus on best available players.
        </p>
      </div>
    );
  }
  
  return (
    <div className="border border-dark-border rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-yellow-400" />
        <span className="text-base font-semibold text-dark-text">Priority Needs</span>
      </div>
      
      <div className="space-y-3">
        {needs.slice(0, 3).map((need) => (
          <div 
            key={need.position}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              need.urgency === 'critical' ? 'bg-red-900/20 border-red-500/30' :
              need.urgency === 'high' ? 'bg-gray-900/20 border-gray-500/30' :
              need.urgency === 'medium' ? 'bg-yellow-900/20 border-yellow-500/30' :
              'bg-gray-900/20 border-gray-500/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2 py-1 rounded text-white bg-position-${need.position.toLowerCase()}`}>
                {need.position}
              </span>
              <div className="flex flex-col">
                <span className="text-sm text-dark-text">
                  Need {need.needed} more
                </span>
                <span className={`text-xs font-medium ${
                  need.urgency === 'critical' ? 'text-red-400' :
                  need.urgency === 'high' ? 'text-gray-400' :
                  need.urgency === 'medium' ? 'text-yellow-400' :
                  'text-gray-400'
                }`}>
                  {need.urgency === 'critical' ? '⚠️ Critical' :
                   need.urgency === 'high' ? '⬆️ High Priority' :
                   need.urgency === 'medium' ? '➡️ Medium Priority' :
                   '⬇️ Low Priority'}
                </span>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-dark-text">
                Target: <span className="font-bold text-green-400">${need.suggestedBudget}</span>
              </div>
              <div className="text-xs text-dark-text-secondary">
                per player
              </div>
            </div>
          </div>
        ))}
        
        {needs.length > 3 && (
          <div className="text-xs text-dark-text-secondary text-center pt-2">
            +{needs.length - 3} more needs
          </div>
        )}
      </div>
      
      {/* Quick tip based on current situation */}
      <div className="mt-3 pt-3 border-t border-dark-border">
        <div className="flex items-start gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400 mt-0.5" />
          <p className="text-xs text-dark-text-secondary">
            {spotsLeft <= 3 ? 
              "Final picks! Fill critical needs first, then best available." :
            remainingBudget < 30 ? 
              "Low budget! Target value picks and $1-2 players." :
            needs.some(n => n.urgency === 'critical') ?
              "Fill critical positions before they're gone!" :
              "Balance needs with best available players for value."}
          </p>
        </div>
      </div>
    </div>
  );
};