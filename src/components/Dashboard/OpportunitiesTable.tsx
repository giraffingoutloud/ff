/**
 * Opportunities Table Component
 * Displays top value opportunities sorted by confidence-weighted edge
 */

import React, { useState } from 'react';
import { OpportunityData } from '../../services/dashboard/dashboardDataService';
import { PlayerEdge } from '../../services/edge/edgeCalculator';

interface OpportunitiesTableProps {
  opportunities: OpportunityData;
}

type ViewMode = 'BUYS' | 'TRAPS' | 'ALL';

export const OpportunitiesTable: React.FC<OpportunitiesTableProps> = ({ opportunities }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('BUYS');
  const [sortColumn, setSortColumn] = useState<string>('CWE');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Get data based on view mode
  const getData = (): PlayerEdge[] => {
    switch (viewMode) {
      case 'BUYS':
        return opportunities.bestValues;
      case 'TRAPS':
        return opportunities.traps;
      case 'ALL':
        return [...opportunities.bestValues, ...opportunities.traps].sort(
          (a, b) => b.confidenceWeightedEdge - a.confidenceWeightedEdge
        );
      default:
        return opportunities.bestValues;
    }
  };
  
  // Sort data
  const sortedData = [...getData()].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;
    
    switch (sortColumn) {
      case 'PLAYER':
        aVal = a.player.name;
        bVal = b.player.name;
        break;
      case 'VALUE':
        aVal = a.intrinsicValue;
        bVal = b.intrinsicValue;
        break;
      case 'PRICE':
        aVal = a.marketPrice;
        bVal = b.marketPrice;
        break;
      case 'EDGE$':
        aVal = a.edge;
        bVal = b.edge;
        break;
      case 'EDGE%':
        aVal = a.edgePercent;
        bVal = b.edgePercent;
        break;
      case 'CONF':
        aVal = a.confidence;
        bVal = b.confidence;
        break;
      case 'CWE':
        aVal = a.confidenceWeightedEdge;
        bVal = b.confidenceWeightedEdge;
        break;
    }
    
    if (typeof aVal === 'string') {
      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal);
    }
    
    return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });
  
  const handleSort = (column: string) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };
  
  const getActionBadgeClass = (recommendation: string) => {
    switch (recommendation) {
      case 'strong-buy':
        return 'bg-green-700 text-white';
      case 'buy':
        return 'bg-green-900 text-green-300 border border-green-600';
      case 'hold':
        return 'bg-gray-800 text-gray-400 border border-gray-600';
      case 'avoid':
        return 'bg-orange-900 text-orange-300 border border-orange-600';
      case 'strong-avoid':
        return 'bg-red-700 text-white';
      default:
        return 'bg-gray-800 text-gray-400';
    }
  };
  
  return (
    <section className="bg-gray-800 border border-gray-600 rounded-md overflow-hidden">
      <div className="p-4 border-b border-gray-600 flex justify-between items-center">
        <h3 className="text-xs uppercase tracking-wider text-gray-400">
          TOP OPPORTUNITIES (BY CWE)
        </h3>
        
        <div className="flex gap-4">
          {/* View toggle */}
          <div className="flex gap-2">
            {(['BUYS', 'TRAPS', 'ALL'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto max-h-96">
        <table className="w-full">
          <thead className="bg-gray-900 sticky top-0">
            <tr>
              {['PLAYER', 'VALUE', 'PRICE', 'EDGE$', 'EDGE%', 'CONF', 'CWE', 'ACTION'].map(col => (
                <th
                  key={col}
                  onClick={() => col !== 'ACTION' && handleSort(col)}
                  className="px-4 py-2 text-left text-xs uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-gray-800 select-none"
                >
                  <div className="flex items-center gap-1">
                    {col}
                    {sortColumn === col && (
                      <span className="text-blue-400">
                        {sortDirection === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {sortedData.map((edge, idx) => (
              <tr key={edge.player.id} className="hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-medium">{edge.player.name}</span>
                    <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">
                      {edge.player.position}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  ${edge.intrinsicValue}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  ${edge.marketPrice}
                </td>
                <td className={`px-4 py-3 text-right font-mono ${
                  edge.edge >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {edge.edge >= 0 ? '+' : ''}{edge.edge.toFixed(1)}
                </td>
                <td className={`px-4 py-3 text-right font-mono ${
                  edge.edgePercent >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {edge.edgePercent >= 0 ? '+' : ''}{edge.edgePercent.toFixed(0)}%
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="font-mono">{edge.confidence.toFixed(2)}</span>
                    <div className="w-8 h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${
                          edge.confidence >= 0.8 ? 'bg-green-500' :
                          edge.confidence >= 0.6 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${edge.confidence * 100}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold">
                  {edge.confidenceWeightedEdge.toFixed(1)}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                    getActionBadgeClass(edge.recommendation)
                  }`}>
                    {edge.recommendation.replace('-', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};