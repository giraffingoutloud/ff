import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Target,
  Activity,
  DollarSign,
  ChevronRight
} from 'lucide-react';
import { ExtendedPlayer } from '../services/pprAnalyzer';
import { advancedMetricsService } from '../services/advancedMetricsService';

interface AdvancedPlayerCardProps {
  player: ExtendedPlayer;
  marketValue?: number;
  currentBid?: number;
  inflationRate?: number;
  onDraft?: () => void;
  onDetail?: () => void;
  onCompare?: () => void;
}

export const AdvancedPlayerCard: React.FC<AdvancedPlayerCardProps> = ({
  player,
  marketValue,
  currentBid,
  inflationRate = 0,
  onDraft,
  onDetail,
  onCompare
}) => {
  // Calculate real metrics from our data
  const targetMetrics = advancedMetricsService.calculateTargetMetrics(player);
  const efficiencyMetrics = advancedMetricsService.calculateEfficiencyMetrics(player);
  const regressionAnalysis = advancedMetricsService.analyzeRegression(player);
  
  // Calculate PPR bonus from real data
  const pprBonus = player.receptions ? player.receptions * 1 : 0;
  
  // Position-specific color
  const positionColors = {
    QB: 'bg-position-qb',
    RB: 'bg-position-rb',
    WR: 'bg-position-wr',
    TE: 'bg-position-te',
    K: 'bg-position-k',
    DST: 'bg-position-dst'
  };
  
  const positionColor = positionColors[player.position] || 'bg-gray-600';
  
  // Determine regression indicator
  const getRegressionIndicator = () => {
    if (regressionAnalysis.efficiencyTrend === 'improve') {
      return { icon: TrendingUp, color: 'text-green-500', label: 'Buy Low' };
    } else if (regressionAnalysis.efficiencyTrend === 'decline') {
      return { icon: TrendingDown, color: 'text-red-500', label: 'Sell High' };
    }
    return null;
  };
  
  const regressionIndicator = getRegressionIndicator();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="relative bg-dark-bg-secondary backdrop-blur-sm border border-dark-border rounded-xl p-4 hover:border-draft-primary transition-all duration-200 cursor-pointer"
      onClick={onDetail}
    >
      {/* Position Badge */}
      <div className={`absolute top-2 left-2 ${positionColor} text-white text-xs font-bold px-1.5 py-0.5 rounded`}>
        {player.position}
      </div>
      
      {/* Regression Indicator */}
      {regressionIndicator && (
        <div className={`absolute top-2 right-2 flex items-center gap-1 ${regressionIndicator.color}`}>
          <regressionIndicator.icon className="w-4 h-4" />
          <span className="text-xs font-medium">{regressionIndicator.label}</span>
        </div>
      )}
      
      {/* Player Info */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-dark-text">{player.name}</h3>
        <p className="text-sm text-dark-text-secondary">{player.team} • Bye: {player.byeWeek}</p>
      </div>
      
      {/* Main Stats */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-2xl font-bold text-dark-text">{Math.round(player.projectedPoints)}</p>
          <p className="text-xs text-dark-text-secondary">Proj Pts</p>
        </div>
        {player.position !== 'K' && player.position !== 'DST' ? (
          <>
            <div className="text-center">
              <p className={`text-lg font-bold ${
                (player.receptions || 0) >= 80 ? 'text-purple-400' :
                (player.receptions || 0) >= 60 ? 'text-blue-400' :
                (player.receptions || 0) >= 40 ? 'text-cyan-400' :
                (player.receptions || 0) >= 20 ? 'text-teal-400' :
                (player.receptions || 0) >= 10 ? 'text-gray-400' :
                'text-gray-600'
              }`}>+{Math.round(pprBonus)}</p>
              <p className="text-[10px] text-dark-text-secondary">PPR Bonus</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${
                player.cvsScore >= 90 ? 'text-emerald-400' :
                player.cvsScore >= 80 ? 'text-green-500' : 
                player.cvsScore >= 70 ? 'text-lime-500' :
                player.cvsScore >= 60 ? 'text-yellow-500' :
                player.cvsScore >= 50 ? 'text-amber-500' :
                player.cvsScore >= 40 ? 'text-orange-500' :
                player.cvsScore >= 30 ? 'text-red-500' :
                'text-gray-500'
              }`}>
                {isNaN(player.cvsScore) ? 'N/A' : Math.round(player.cvsScore)}
              </p>
              <p className="text-xs text-dark-text-secondary">CVS Score</p>
            </div>
          </>
        ) : (
          <div className="text-center col-span-2">
            <p className={`text-lg font-bold ${
              player.cvsScore >= 90 ? 'text-emerald-400' :
              player.cvsScore >= 80 ? 'text-green-500' : 
              player.cvsScore >= 70 ? 'text-lime-500' :
              player.cvsScore >= 60 ? 'text-yellow-500' :
              player.cvsScore >= 50 ? 'text-amber-500' :
              player.cvsScore >= 40 ? 'text-orange-500' :
              player.cvsScore >= 30 ? 'text-red-500' :
              'text-gray-500'
            }`}>
              {isNaN(player.cvsScore) ? 'N/A' : Math.round(player.cvsScore)}
            </p>
            <p className="text-xs text-dark-text-secondary">CVS Score</p>
          </div>
        )}
      </div>
      
      {/* Advanced Metrics Bar */}
      {['RB', 'WR', 'TE'].includes(player.position) && (
        <div className="mt-4 space-y-2">
          {/* Target Share */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Target className="w-3 h-3 text-dark-text-secondary" />
              <span className="text-xs text-dark-text-secondary">Target Share</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 bg-dark-bg-tertiary rounded-full h-2">
                <div 
                  className="bg-draft-primary h-2 rounded-full"
                  style={{ width: `${Math.min(100, targetMetrics.estimatedTargetShare * 4)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-dark-text">
                {Math.round(targetMetrics.estimatedTargetShare)}%
              </span>
            </div>
          </div>
          
          {/* Catch Rate */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-dark-text-secondary" />
              <span className="text-xs text-dark-text-secondary">Catch Rate</span>
            </div>
            <span className={`text-xs font-medium ${
              targetMetrics.catchRate >= 70 ? 'text-green-500' : 
              targetMetrics.catchRate >= 60 ? 'text-yellow-500' : 'text-red-500'
            }`}>
              {Math.round(targetMetrics.catchRate)}%
            </span>
          </div>
          
          {/* Depth of Target */}
          {efficiencyMetrics.depthOfTarget > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-text-secondary">aDOT</span>
              <span className="text-xs font-medium text-dark-text">
                {Math.round(efficiencyMetrics.depthOfTarget)} yds
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Market Intelligence */}
      {(marketValue || currentBid) && (
        <div className="mt-4 pt-4 border-t border-dark-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-dark-text-secondary" />
              <div>
                {currentBid !== undefined && (
                  <span className={`text-sm font-bold ${
                    currentBid >= 60 ? 'text-pink-400' :
                    currentBid >= 40 ? 'text-purple-400' :
                    currentBid >= 25 ? 'text-indigo-400' :
                    currentBid >= 15 ? 'text-blue-400' :
                    currentBid >= 8 ? 'text-cyan-400' :
                    currentBid >= 3 ? 'text-teal-400' :
                    currentBid >= 1 ? 'text-green-400' :
                    'text-gray-500'
                  }`}>${currentBid}</span>
                )}
                {marketValue && (
                  <span className="text-xs text-dark-text-secondary ml-1">
                    Value: {marketValue}
                  </span>
                )}
              </div>
            </div>
            {inflationRate !== 0 && (
              <span className={`text-xs font-medium ${
                inflationRate > 0 ? 'text-red-500' : 'text-green-500'
              }`}>
                {inflationRate > 0 ? '+' : ''}{Math.round(inflationRate * 100)}%
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="mt-4 flex gap-2">
        {onDraft && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDraft();
            }}
            className="flex-1 bg-draft-primary hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            Draft
          </button>
        )}
        {onCompare && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCompare();
            }}
            className="flex-1 bg-dark-bg-tertiary hover:bg-gray-700 text-dark-text text-sm font-medium py-2 px-3 rounded-lg transition-colors"
          >
            Compare
          </button>
        )}
      </div>
      
      {/* Injury Status */}
      {player.injuryStatus && player.injuryStatus !== 'Healthy' && (
        <div className="absolute bottom-2 right-2">
          <AlertTriangle className="w-4 h-4 text-draft-warning" />
        </div>
      )}
    </motion.div>
  );
};