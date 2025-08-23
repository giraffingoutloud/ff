import React, { useMemo, useState } from 'react';
import { TrendingUp, DollarSign, Target, AlertTriangle } from 'lucide-react';
import { safeToFixed } from '../utils/safeNumber';
import { useUnifiedValuation } from '../hooks/useUnifiedValuation';
import { useDraftStore } from '../store/draftStore';

export const ValueFinder: React.FC = () => {
  const { draftHistory } = useDraftStore();
  const { evaluations, edges } = useUnifiedValuation();
  
  // Filter controls
  const [minEdgeInput, setMinEdgeInput] = useState('5');
  const [maxPriceInput, setMaxPriceInput] = useState('30');
  const [minValueInput, setMinValueInput] = useState('10');
  
  const minEdge = minEdgeInput === '' ? 0 : Number(minEdgeInput);
  const maxPrice = maxPriceInput === '' ? 200 : Number(maxPriceInput);
  const minValue = minValueInput === '' ? 0 : Number(minValueInput);
  
  // Filter out drafted players and apply filters
  const opportunities = useMemo(() => {
    const draftedIds = new Set(draftHistory.map(dp => dp.id || dp.playerId));
    
    // Get available players with edge data
    const availableEdges = edges.filter(edge => 
      !draftedIds.has(edge.player.id) &&
      edge.marketPrice <= maxPrice &&
      edge.intrinsicValue >= minValue
    );
    
    // Sort by different criteria for different views
    const byEdge = [...availableEdges]
      .filter(e => e.edge >= minEdge)
      .sort((a, b) => b.edge - a.edge)
      .slice(0, 10);
    
    const byEdgePercent = [...availableEdges]
      .filter(e => e.edgePercent >= 10)
      .sort((a, b) => b.edgePercent - a.edgePercent)
      .slice(0, 10);
    
    const byCWE = [...availableEdges]
      .filter(e => e.confidenceWeightedEdge > 0)
      .sort((a, b) => b.confidenceWeightedEdge - a.confidenceWeightedEdge)
      .slice(0, 10);
    
    const budgetGems = [...availableEdges]
      .filter(e => e.marketPrice <= 15 && e.edge > 0)
      .sort((a, b) => b.edgePercent - a.edgePercent)
      .slice(0, 3);
    
    return {
      byEdge,
      byEdgePercent,
      byCWE,
      budgetGems
    };
  }, [edges, draftHistory, minEdge, maxPrice, minValue]);
  
  return (
    <div className="bg-gray-800 rounded-md p-3 xl:p-5 border border-gray-600">
      <div className="flex items-center justify-between mb-4 xl:mb-5">
        <h2 className="text-base xl:text-lg font-semibold text-white cursor-help" 
            title="Identifies the best value opportunities available right now. Shows players whose intrinsic value exceeds their market price. Edge = how much profit you get, Edge % = return on investment, CWE = confidence-weighted edge accounting for projection uncertainty.">
          Value Finder
        </h2>
      </div>
      
      {/* Filters - Compact single line */}
      <div className="flex gap-2 items-center mb-4">
        <span className="text-xs text-gray-400">Min Edge:</span>
        <input
          type="number"
          value={minEdgeInput}
          onChange={(e) => setMinEdgeInput(e.target.value)}
          className="w-14 bg-dark-bg border border-gray-600 rounded px-1 py-1 text-xs text-white"
          placeholder="0"
        />
        <span className="text-xs text-gray-400">Max Price:</span>
        <input
          type="number"
          value={maxPriceInput}
          onChange={(e) => setMaxPriceInput(e.target.value)}
          className="w-14 bg-dark-bg border border-gray-600 rounded px-1 py-1 text-xs text-white"
          placeholder="200"
        />
        <span className="text-xs text-gray-400">Min Value:</span>
        <input
          type="number"
          value={minValueInput}
          onChange={(e) => setMinValueInput(e.target.value)}
          className="w-14 bg-dark-bg border border-gray-600 rounded px-1 py-1 text-xs text-white"
          placeholder="0"
        />
      </div>
      
      {/* Top Opportunities by Different Metrics */}
      <div className="space-y-4">
        {/* By Raw Edge */}
        <div>
          <h3 className="text-xs xl:text-base font-semibold text-cyan-400 mb-2">
            Best Edge ($)
          </h3>
          <div className="space-y-1">
            {opportunities.byEdge.length > 0 ? (
              opportunities.byEdge.slice(0, 3).map((edge) => (
                <div key={edge.player.id} className="flex items-center justify-between text-xs xl:text-base">
                  <span className="text-dark-text truncate max-w-[180px]">{edge.player.name}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-gray-500">${Math.round(edge.intrinsicValue)}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-yellow-400">${Math.round(edge.marketPrice)}</span>
                    <span className="text-green-400 font-bold">+${Math.round(edge.edge)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs xl:text-base text-gray-500">No opportunities found</div>
            )}
          </div>
        </div>
        
        {/* By Edge Percentage */}
        <div>
          <h3 className="text-xs xl:text-base font-semibold text-purple-400 mb-2">
            Best Edge %
          </h3>
          <div className="space-y-1">
            {opportunities.byEdgePercent.length > 0 ? (
              opportunities.byEdgePercent.slice(0, 3).map((edge) => (
                <div key={edge.player.id} className="flex items-center justify-between text-xs xl:text-base">
                  <span className="text-dark-text truncate max-w-[180px]">{edge.player.name}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-yellow-400">${Math.round(edge.marketPrice)}</span>
                    <span className="text-green-400 font-bold">+{safeToFixed(edge.edgePercent, 0)}%</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs xl:text-base text-gray-500">No opportunities found</div>
            )}
          </div>
        </div>
        
        {/* By Confidence Weighted Edge */}
        <div>
          <h3 className="text-xs xl:text-base font-semibold text-yellow-400 mb-2">
            Best CWE (Confidence)
          </h3>
          <div className="space-y-1">
            {opportunities.byCWE.length > 0 ? (
              opportunities.byCWE.slice(0, 3).map((edge) => (
                <div key={edge.player.id} className="flex items-center justify-between text-xs xl:text-base">
                  <span className="text-dark-text truncate max-w-[180px]">{edge.player.name}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-gray-500 text-[10px] xl:text-xs">{safeToFixed((edge.confidence || 0) * 100, 0)}%</span>
                    <span className="text-yellow-400 font-bold">CWE:{safeToFixed(edge.confidenceWeightedEdge, 0)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs xl:text-base text-gray-500">No opportunities found</div>
            )}
          </div>
        </div>
        
        {/* Budget Gems */}
        <div>
          <h3 className="text-xs xl:text-base font-semibold text-blue-400 mb-2">
            Budget Gems (&lt;$15)
          </h3>
          <div className="space-y-1">
            {opportunities.budgetGems.length > 0 ? (
              opportunities.budgetGems.map((edge) => (
                <div key={edge.player.id} className="flex items-center justify-between text-xs xl:text-base">
                  <span className="text-dark-text truncate max-w-[180px]">{edge.player.name}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-blue-400">${Math.round(edge.marketPrice)}</span>
                    <span className="text-green-400 font-bold">+{safeToFixed(edge.edgePercent, 0)}%</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs xl:text-base text-gray-500">No budget gems found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};