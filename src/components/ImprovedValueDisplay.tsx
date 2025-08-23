/**
 * Component to display the improved value/price/edge metrics
 * Shows intrinsic value, market price, and edge calculations
 */

import React, { useMemo } from 'react';
import { UnifiedPlayerEvaluation } from '../services/unifiedEvaluationService';
import { featureFlags } from '../config/featureFlags';

interface ImprovedValueDisplayProps {
  evaluation: UnifiedPlayerEvaluation;
  showDetails?: boolean;
  compact?: boolean;
}

export const ImprovedValueDisplay: React.FC<ImprovedValueDisplayProps> = ({
  evaluation,
  showDetails = false,
  compact = false
}) => {
  // Determine display mode based on feature flags
  const useNewSystem = featureFlags.useNewEvaluationSystem;
  
  // Format currency
  const formatDollar = (value: number | undefined): string => {
    if (value === undefined || value === null) return '--';
    if (value === 0) return '$0';
    return `$${Math.round(value)}`;
  };
  
  // Format percentage
  const formatPercent = (value: number | undefined): string => {
    if (value === undefined || value === null) return '--';
    return `${value > 0 ? '+' : ''}${Math.round(value)}%`;
  };
  
  // Get recommendation color
  const getRecommendationColor = (rec?: string): string => {
    switch (rec) {
      case 'strong-buy': return 'text-green-500 font-bold';
      case 'buy': return 'text-green-400';
      case 'hold': return 'text-gray-400';
      case 'avoid': return 'text-orange-400';
      case 'strong-avoid': return 'text-red-500 font-bold';
      default: return 'text-gray-400';
    }
  };
  
  // Get edge color
  const getEdgeColor = (edge: number | undefined): string => {
    if (edge === undefined) return 'text-gray-400';
    if (edge >= 5) return 'text-green-500 font-bold';
    if (edge >= 2) return 'text-green-400';
    if (edge <= -5) return 'text-red-500 font-bold';
    if (edge <= -2) return 'text-orange-400';
    return 'text-gray-400';
  };
  
  // Get tier badge
  const getTierBadge = (tier?: string): JSX.Element | null => {
    if (!tier) return null;
    
    const colors = {
      elite: 'bg-purple-600 text-white',
      starter: 'bg-blue-600 text-white',
      bench: 'bg-gray-600 text-white',
      waiver: 'bg-gray-800 text-gray-400'
    };
    
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[tier as keyof typeof colors] || colors.waiver}`}>
        {tier.toUpperCase()}
      </span>
    );
  };
  
  if (!useNewSystem) {
    // Old system display
    return (
      <div className={`${compact ? 'space-y-1' : 'space-y-2'}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">CVS:</span>
          <span className="font-medium">{evaluation.cvsScore.toFixed(1)}</span>
        </div>
        {!compact && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Value:</span>
              <span>{formatDollar(evaluation.recommendedBid)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Market:</span>
              <span>{formatDollar(evaluation.marketValue)}</span>
            </div>
          </>
        )}
      </div>
    );
  }
  
  // New system display
  return (
    <div className={`${compact ? 'space-y-1' : 'space-y-2'}`}>
      {/* Main metrics */}
      <div className="flex items-center gap-4">
        {evaluation.tier && getTierBadge(evaluation.tier)}
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Value:</span>
          <span className="font-medium">{formatDollar(evaluation.intrinsicValue)}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Price:</span>
          <span>{formatDollar(evaluation.marketPrice)}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Edge:</span>
          <span className={getEdgeColor(evaluation.edge)}>
            {formatDollar(evaluation.edge)}
            {evaluation.edgePercent !== undefined && (
              <span className="text-xs ml-1">
                ({formatPercent(evaluation.edgePercent)})
              </span>
            )}
          </span>
        </div>
      </div>
      
      {/* Recommendation */}
      {evaluation.valueRecommendation && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Action:</span>
          <span className={getRecommendationColor(evaluation.valueRecommendation)}>
            {evaluation.valueRecommendation.replace('-', ' ').toUpperCase()}
          </span>
        </div>
      )}
      
      {/* Details */}
      {showDetails && !compact && (
        <div className="pt-2 border-t border-gray-700 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">VORP:</span>
            <span className="text-xs">{evaluation.vorp?.toFixed(1) || '--'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Pos Rank:</span>
            <span className="text-xs">#{evaluation.positionRank}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Overall:</span>
            <span className="text-xs">#{evaluation.overallRank}</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Compact value badge for tables
 */
export const ValueBadge: React.FC<{ evaluation: UnifiedPlayerEvaluation }> = ({ evaluation }) => {
  const useNewSystem = featureFlags.useNewEvaluationSystem;
  
  if (!useNewSystem) {
    // Old system badge
    return (
      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300">
        CVS {evaluation.cvsScore.toFixed(0)}
      </span>
    );
  }
  
  // New system badge - show edge
  if (evaluation.edge === undefined) {
    return null;
  }
  
  const getEdgeColor = () => {
    const edge = evaluation.edge || 0;
    if (edge >= 5) return 'bg-green-600 text-white';
    if (edge >= 2) return 'bg-green-700 text-green-100';
    if (edge <= -5) return 'bg-red-600 text-white';
    if (edge <= -2) return 'bg-orange-700 text-orange-100';
    return 'bg-gray-700 text-gray-300';
  };
  
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getEdgeColor()}`}>
      {evaluation.edge > 0 ? '+' : ''}{Math.round(evaluation.edge || 0)}
    </span>
  );
};

/**
 * Value comparison chart for multiple players
 */
export const ValueComparisonChart: React.FC<{ 
  evaluations: UnifiedPlayerEvaluation[] 
}> = ({ evaluations }) => {
  const useNewSystem = featureFlags.useNewEvaluationSystem;
  
  // Sort by edge/value
  const sorted = useMemo(() => {
    if (useNewSystem) {
      return [...evaluations].sort((a, b) => (b.edge || 0) - (a.edge || 0));
    } else {
      return [...evaluations].sort((a, b) => b.cvsScore - a.cvsScore);
    }
  }, [evaluations, useNewSystem]);
  
  const maxValue = useMemo(() => {
    if (useNewSystem) {
      return Math.max(...sorted.map(e => Math.max(e.intrinsicValue || 0, e.marketPrice || 0)));
    } else {
      return Math.max(...sorted.map(e => Math.max(e.recommendedBid, e.marketValue)));
    }
  }, [sorted, useNewSystem]);
  
  return (
    <div className="space-y-2">
      {sorted.slice(0, 10).map(eval => (
        <div key={eval.id} className="flex items-center gap-2">
          <div className="w-32 truncate text-sm">
            {eval.name}
          </div>
          
          {useNewSystem ? (
            <>
              {/* Value bar */}
              <div className="flex-1 flex items-center gap-1">
                <div 
                  className="h-4 bg-blue-600 rounded"
                  style={{ width: `${(eval.intrinsicValue || 0) / maxValue * 100}%` }}
                />
                <span className="text-xs text-gray-400">
                  ${eval.intrinsicValue || 0}
                </span>
              </div>
              
              {/* Price bar */}
              <div className="flex-1 flex items-center gap-1">
                <div 
                  className="h-4 bg-orange-600 rounded"
                  style={{ width: `${(eval.marketPrice || 0) / maxValue * 100}%` }}
                />
                <span className="text-xs text-gray-400">
                  ${eval.marketPrice || 0}
                </span>
              </div>
              
              {/* Edge indicator */}
              <div className="w-16 text-right">
                <ValueBadge evaluation={eval} />
              </div>
            </>
          ) : (
            <>
              {/* CVS bar */}
              <div className="flex-1 flex items-center gap-1">
                <div 
                  className="h-4 bg-purple-600 rounded"
                  style={{ width: `${eval.cvsScore}%` }}
                />
                <span className="text-xs text-gray-400">
                  {eval.cvsScore.toFixed(0)}
                </span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};