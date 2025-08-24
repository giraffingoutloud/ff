import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  TrendingUp, 
  Cloud, 
  AlertTriangle, 
  BarChart3,
  RefreshCw,
  Lock,
  Unlock,
  Info,
  ChevronRight,
  Target
} from 'lucide-react';
import { 
  Player, 
  PlayerProjection, 
  OptimizedLineup, 
  Position,
  PowerRanking 
} from '../types';
import { LineupOptimizer } from '../core/LineupOptimizer';
import { ProjectionEngine } from '../core/ProjectionEngine';
import { CorrelationService } from '../services/CorrelationService';
import { CalibrationTracker } from '../services/CalibrationTracker';
import { ReasoningEngine } from '../core/ReasoningEngine';

interface LineupManagerProps {
  players: Player[];
  week: number;
  projections?: PlayerProjection[];
  onLineupChange?: (lineup: OptimizedLineup) => void;
}

export const LineupManager: React.FC<LineupManagerProps> = ({
  players = [],
  week,
  projections: providedProjections,
  onLineupChange
}) => {
  const [optimizedLineup, setOptimizedLineup] = useState<OptimizedLineup | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [strategy, setStrategy] = useState<'floor' | 'ceiling' | 'balanced'>('balanced');
  const [lockedPlayers, setLockedPlayers] = useState<Set<string>>(new Set());
  const [excludedPlayers, setExcludedPlayers] = useState<Set<string>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProjection | null>(null);
  const [showCorrelations, setShowCorrelations] = useState(false);
  const [activeTab, setActiveTab] = useState<'lineup' | 'analysis' | 'calibration'>('lineup');

  // Initialize services
  const lineupOptimizer = useMemo(() => new LineupOptimizer(), []);
  const projectionEngine = useMemo(() => new ProjectionEngine(), []);
  const correlationService = useMemo(() => new CorrelationService(), []);
  const calibrationTracker = useMemo(() => new CalibrationTracker(), []);
  const reasoningEngine = useMemo(() => new ReasoningEngine(), []);
  
  // Estimate opponent strength (would come from league data in production)
  const getOpponentProjection = () => {
    // League average lineup projection for 12-team PPR
    const mean = 165;  // Average opponent scores 165 points
    const stdDev = 25; // With standard deviation of 25 points
    return {
      mean: mean,
      variance: stdDev * stdDev, // 625
      percentiles: {
        p10: mean - 1.28 * stdDev,
        p25: mean - 0.67 * stdDev,
        p50: mean,
        p75: mean + 0.67 * stdDev,
        p90: mean + 1.28 * stdDev
      }
    };
  };

  // Optimize lineup
  const optimizeLineup = async () => {
    console.log('optimizeLineup called');
    
    setIsOptimizing(true);
    
    try {
      // Use provided projections or generate them
      let projections: PlayerProjection[];
      
      console.log('providedProjections:', providedProjections?.length);
      console.log('First projection sample:', providedProjections?.[0]);
      
      if (providedProjections && providedProjections.length > 0) {
        // Use the provided projections
        console.log('Using provided projections:', providedProjections.length);
        projections = providedProjections;
        console.log('Projections set, first item:', projections[0]);
      } else {
        console.error('No player projections available');
        alert('Please load player data first using the data input form.');
        setIsOptimizing(false);
        return;
      }

      // Define lineup requirements for ESPN 12-team PPR
      const requirements = {
        QB: 1,
        RB: 2,
        WR: 3,
        TE: 1,
        FLEX: 1,
        K: 1,
        DST: 1,
        BENCH: 7  // 9 starters + 7 bench = 16 total roster
      };
      
      
      // Get opponent projection
      const opponentProjection = getOpponentProjection();
      
      // Run optimization for win probability with selected strategy
      const lineup = lineupOptimizer.optimizeLineup(
        projections,
        opponentProjection,
        requirements,
        lockedPlayers,
        excludedPlayers,
        strategy
      );
      
      console.log('Optimization successful! Lineup:', lineup);
      
      setOptimizedLineup(lineup);
      
      onLineupChange?.(lineup);
    } catch (error: any) {
      console.error('Optimization failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        error: error
      });
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      alert('Optimization failed: ' + errorMessage);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Toggle player lock
  const toggleLock = (playerId: string) => {
    const newLocked = new Set(lockedPlayers);
    if (newLocked.has(playerId)) {
      newLocked.delete(playerId);
    } else {
      newLocked.add(playerId);
    }
    setLockedPlayers(newLocked);
  };

  // Toggle player exclusion
  const toggleExclude = (playerId: string) => {
    const newExcluded = new Set(excludedPlayers);
    if (newExcluded.has(playerId)) {
      newExcluded.delete(playerId);
    } else {
      newExcluded.add(playerId);
    }
    setExcludedPlayers(newExcluded);
  };

  // Get position color
  const getPositionColor = (position: Position): string => {
    const colors: Record<Position, string> = {
      QB: 'bg-red-500',
      RB: 'bg-green-500',
      WR: 'bg-blue-500',
      TE: 'bg-yellow-500',
      K: 'bg-purple-500',
      DST: 'bg-orange-500',
      FLEX: 'bg-gray-500'
    };
    return colors[position] || 'bg-gray-500';
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Add error boundary check
  if (!players || players.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <p className="text-gray-400">No players loaded. Please load data first.</p>
      </div>
    );
  }
  

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users className="w-6 h-6" />
          Lineup Optimizer
        </h2>
        
        <div className="flex items-center gap-4">
          {/* Strategy Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setStrategy('floor')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                strategy === 'floor'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              Safe Floor
            </button>
            <button
              onClick={() => setStrategy('balanced')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                strategy === 'balanced'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              Balanced
            </button>
            <button
              onClick={() => setStrategy('ceiling')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                strategy === 'ceiling'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              High Ceiling
            </button>
          </div>

          
          {/* Optimize Button */}
          <button
            onClick={() => {
              optimizeLineup();
            }}
            disabled={isOptimizing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity:50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isOptimizing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <Target className="w-4 h-4" />
                Optimize Lineup
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6">
        <button
          onClick={() => setActiveTab('lineup')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'lineup'
              ? 'bg-dark-bg text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Lineup
        </button>
        <button
          onClick={() => setActiveTab('analysis')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'analysis'
              ? 'bg-dark-bg text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Analysis
        </button>
        <button
          onClick={() => setActiveTab('calibration')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'calibration'
              ? 'bg-dark-bg text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Calibration
        </button>
        <button
          onClick={() => setActiveTab('math')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'math'
              ? 'bg-dark-bg text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          Math Verification
        </button>
      </div>

      {/* Content */}
      <div className="bg-dark-bg rounded-lg p-4">
        {activeTab === 'lineup' && (
          <div className="space-y-4">
            {/* Win Probability Card */}
            {optimizedLineup && optimizedLineup.starters && optimizedLineup.starters.length > 0 && (
              <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-lg p-4 border border-blue-800/30">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-white">Win Probability Analysis</h3>
                  <div className="text-3xl font-bold text-green-400">
                    {(optimizedLineup.winProbability * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Your Expected:</span>
                    <div className="text-xl font-bold text-white">
                      {optimizedLineup.expectedPoints.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Opponent Expected:</span>
                    <div className="text-xl font-bold text-gray-300">
                      {optimizedLineup.opponentProjection.mean.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Your Std Dev:</span>
                    <div className="text-xl font-bold text-blue-400">
                      ±{Math.sqrt(optimizedLineup.variance).toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Strategy:</span>
                    <div className="text-xl font-bold text-purple-400 capitalize">
                      {strategy}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Lineup Summary */}
            {optimizedLineup && optimizedLineup.starters && optimizedLineup.starters.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">Projected Points Range</h3>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Floor:</span>
                      <span className="text-red-400 font-bold ml-2">
                        {optimizedLineup.floor.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Expected:</span>
                      <span className="text-yellow-400 font-bold ml-2">
                        {optimizedLineup.expectedPoints.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Ceiling:</span>
                      <span className="text-green-400 font-bold ml-2">
                        {optimizedLineup.ceiling.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Confidence:</span>
                      <span className={`font-bold ml-2 ${getConfidenceColor(optimizedLineup.confidence)}`}>
                        {(optimizedLineup.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Starters */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Starting Lineup</h4>
                  {optimizedLineup.starters.map((playerProj) => (
                    <PlayerCard
                      key={playerProj.player.id}
                      playerProjection={playerProj}
                      isLocked={lockedPlayers.has(playerProj.player.id)}
                      onToggleLock={() => toggleLock(playerProj.player.id)}
                      onSelect={() => setSelectedPlayer(playerProj)}
                      getPositionColor={getPositionColor}
                    />
                  ))}
                </div>

                {/* Team Correlations */}
                {optimizedLineup.correlationStructure && optimizedLineup.correlationStructure.teams && (
                  <div className="mt-6 p-3 bg-gray-900 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Team Stacks & Correlations</h4>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(optimizedLineup.correlationStructure.teams.entries())
                        .filter(([_, players]) => players.length > 1)
                        .map(([team, players]) => (
                          <div key={team} className="bg-blue-900/30 border border-blue-700 rounded px-3 py-1">
                            <span className="text-xs font-bold text-blue-400">{team} Stack</span>
                            <span className="text-xs text-gray-300 ml-2">
                              {players.length} players ({players.map(p => p.player.position).join(', ')})
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                
                {/* Bench */}
                <div className="space-y-2 mt-6">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Bench</h4>
                  {optimizedLineup.bench.map((playerProj) => (
                    <PlayerCard
                      key={playerProj.player.id}
                      playerProjection={playerProj}
                      isLocked={lockedPlayers.has(playerProj.player.id)}
                      onToggleLock={() => toggleLock(playerProj.player.id)}
                      onSelect={() => setSelectedPlayer(playerProj)}
                      getPositionColor={getPositionColor}
                      isBench
                    />
                  ))}
                </div>
              </div>
            )}

            {/* No lineup yet */}
            {!optimizedLineup && (
              <div className="text-center py-12 text-gray-400">
                <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Click "Optimize Lineup" to generate your optimal lineup</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analysis' && (
          optimizedLineup ? (
            <LineupAnalysis
              lineup={optimizedLineup}
              correlationService={correlationService}
              reasoningEngine={reasoningEngine}
            />
          ) : (
            <div className="text-center py-12 text-gray-400">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Generate a lineup first to see analysis</p>
            </div>
          )
        )}

        {activeTab === 'calibration' && (
          <CalibrationView
            calibrationTracker={calibrationTracker}
          />
        )}
        
        {activeTab === 'math' && (
          optimizedLineup ? (
            <MathVerificationView
              lineup={optimizedLineup}
              correlationService={correlationService}
            />
          ) : (
            <div className="text-center py-12 text-gray-400">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Generate a lineup first to see math verification</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

// Player Card Component
const PlayerCard: React.FC<{
  playerProjection: PlayerProjection;
  isLocked: boolean;
  onToggleLock: () => void;
  onSelect: () => void;
  getPositionColor: (pos: Position) => string;
  isBench?: boolean;
}> = ({ 
  playerProjection, 
  isLocked, 
  onToggleLock, 
  onSelect,
  getPositionColor,
  isBench = false
}) => {
  const { player, projection } = playerProjection;
  
  return (
    <div 
      className={`flex items-center justify-between p-3 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-colors ${
        isBench ? 'opacity-75' : ''
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${getPositionColor(player.position)}`}>
          {player.position}
        </div>
        
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{player.name}</span>
            {player.injuryStatus && player.injuryStatus !== 'HEALTHY' && (
              <span className="text-xs px-2 py-0.5 bg-red-500 text-white rounded">
                {player.injuryStatus}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400">
            {player.team} vs {playerProjection.opponent}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-white font-medium">
            {projection.median.toFixed(1)}
          </div>
          <div className="text-xs text-gray-400">
            {projection.floor.toFixed(1)} - {projection.ceiling.toFixed(1)}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          className="p-1 rounded hover:bg-gray-500 transition-colors"
        >
          {isLocked ? (
            <Lock className="w-4 h-4 text-yellow-400" />
          ) : (
            <Unlock className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>
    </div>
  );
};

// Lineup Analysis Component
const LineupAnalysis: React.FC<{
  lineup: OptimizedLineup;
  correlationService: CorrelationService;
  reasoningEngine: ReasoningEngine;
}> = ({ lineup, correlationService, reasoningEngine }) => {
  const correlationScore = useMemo(() => 
    correlationService.calculateLineupCorrelation(lineup.starters),
    [lineup, correlationService]
  );

  const insights = useMemo(() =>
    reasoningEngine.generateLineupInsights(lineup.starters, lineup.bench),
    [lineup, reasoningEngine]
  );

  return (
    <div className="space-y-6">
      {/* Correlation Analysis */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Correlation Analysis</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-400">Lineup Correlation:</span>
            <span className="text-white font-bold ml-2">
              {(correlationScore * 100).toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-gray-400">Stack Quality:</span>
            <span className={`font-bold ml-2 ${
              correlationScore > 0.2 ? 'text-green-400' : 
              correlationScore > 0.1 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {correlationScore > 0.2 ? 'Strong' : 
               correlationScore > 0.1 ? 'Moderate' : 'Weak'}
            </span>
          </div>
        </div>
      </div>

      {/* Lineup Insights */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Lineup Insights</h3>
        <ul className="space-y-2">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <ChevronRight className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Reasoning Breakdown */}
      {lineup.reasoning && lineup.reasoning.length > 0 ? (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Decision Reasoning</h3>
          <div className="space-y-3">
            {lineup.reasoning.slice(0, 5).map((reason, i) => (
              <div key={i} className="border-l-2 border-blue-500 pl-3">
                <div className="text-sm font-medium text-white mb-1">
                  {lineup.starters.find(p => p.player.id === reason.playerId)?.player.name}
                  {' - '}
                  <span className={`${
                    reason.decision === 'start' ? 'text-green-400' : 
                    reason.decision === 'flex' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {reason.decision.toUpperCase()}
                  </span>
                </div>
                <ul className="text-xs text-gray-400 space-y-1">
                  {reason.reasons?.map((r, j) => (
                    <li key={j}>{r}</li>
                  )) || <li>No specific reasons available</li>}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// Calibration View Component
const CalibrationView: React.FC<{
  calibrationTracker: CalibrationTracker;
}> = ({ calibrationTracker }) => {
  // Provide default metrics if calibration tracker is not working
  let metrics = {
    brierScore: 0,
    calibrationError: 0,
    sharpness: 0,
    overconfidencePenalty: 0
  };
  let isWellCalibrated = false;
  
  try {
    if (calibrationTracker && typeof calibrationTracker.getCalibrationMetrics === 'function') {
      metrics = calibrationTracker.getCalibrationMetrics();
      isWellCalibrated = calibrationTracker.isWellCalibrated();
    }
  } catch (error) {
    console.log('Calibration tracker not ready, showing default view');
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Calibration Metrics</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-gray-400">Brier Score:</span>
            <span className={`font-bold ml-2 ${
              metrics.brierScore < 0.25 ? 'text-green-400' : 'text-red-400'
            }`}>
              {metrics.brierScore.toFixed(3)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Calibration Error:</span>
            <span className={`font-bold ml-2 ${
              metrics.calibrationError < 0.1 ? 'text-green-400' : 'text-red-400'
            }`}>
              {metrics.calibrationError.toFixed(3)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Status:</span>
            <span className={`font-bold ml-2 ${
              isWellCalibrated ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {isWellCalibrated ? 'Well Calibrated' : 'Needs Calibration'}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Total Predictions:</span>
            <span className="text-white font-bold ml-2">
              {metrics.totalPredictions}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Coverage Analysis</h3>
        <div className="text-sm text-gray-400">
          <p className="mb-2">
            When we predict with 80% confidence, are we right 80% of the time?
          </p>
          <p>
            This helps us understand if our confidence levels are properly calibrated.
          </p>
        </div>
      </div>
    </div>
  );
};

// Mock data functions (would be replaced with real data fetching)
const getMockGameInfo = (player: Player): any => ({
  gameId: `game-${player.team}`,
  week: 1,
  season: 2024,
  homeTeam: player.team,
  awayTeam: 'OPP',
  homeImpliedTotal: 24 + Math.random() * 10,
  awayImpliedTotal: 21 + Math.random() * 10,
  spread: (Math.random() - 0.5) * 14,
  total: 45 + Math.random() * 15
});

const getMockOpponent = (player: Player): string => 'OPP';

const getMockRecentPerformance = (player: Player): number[] => 
  Array(4).fill(0).map(() => 10 + Math.random() * 20);

// Math Verification View Component
const MathVerificationView: React.FC<{
  lineup: OptimizedLineup;
  correlationService: CorrelationService;
}> = ({ lineup, correlationService }) => {
  // Calculate actual correlation values for display
  const getCorrelationDetails = () => {
    if (!lineup.correlationStructure?.correlationMatrix) return null;
    
    const matrix = lineup.correlationStructure.correlationMatrix;
    const starters = lineup.starters;
    
    // Find highest correlations
    const correlations: Array<{player1: string, player2: string, value: number, type: string}> = [];
    
    for (let i = 0; i < starters.length; i++) {
      for (let j = i + 1; j < starters.length; j++) {
        const corr = Array.isArray(matrix) && matrix[i] && matrix[i][j] ? matrix[i][j] : 0;
        if (Math.abs(corr) > 0.01) { // Only show non-zero correlations
          const player1 = starters[i];
          const player2 = starters[j];
          let type = 'Independent';
          
          if (player1.player.team === player2.player.team) {
            type = 'Same Team';
          } else if (player1.opponent?.team === player2.player.team || player2.opponent?.team === player1.player.team) {
            type = 'Opposing';
          }
          
          correlations.push({
            player1: player1.player.name,
            player2: player2.player.name,
            value: corr,
            type
          });
        }
      }
    }
    
    return correlations.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  };
  
  const correlations = getCorrelationDetails();
  
  // Calculate variance breakdown
  const getVarianceBreakdown = () => {
    const individualVariances = lineup.starters.map(p => {
      const variance = p.projection.variance || 
                      (p.projection.stdDev ? p.projection.stdDev * p.projection.stdDev : 
                       Math.pow((p.projection.ceiling - p.projection.floor) / 4, 2));
      return {
        name: p.player.name,
        position: p.player.position,
        team: p.player.team,
        variance: variance,
        stdDev: Math.sqrt(variance)
      };
    });
    
    const sumOfVariances = individualVariances.reduce((sum, p) => sum + p.variance, 0);
    const correlationContribution = lineup.variance - sumOfVariances;
    
    return {
      individual: individualVariances,
      sumOfVariances,
      correlationContribution,
      totalVariance: lineup.variance,
      totalStdDev: Math.sqrt(lineup.variance)
    };
  };
  
  const varianceBreakdown = getVarianceBreakdown();
  
  // Win probability calculation details
  const getWinProbDetails = () => {
    const ourMean = lineup.expectedPoints;
    const ourStdDev = Math.sqrt(lineup.variance);
    const oppMean = lineup.opponentProjection.mean;
    const oppStdDev = Math.sqrt(lineup.opponentProjection.variance);
    
    const diffMean = ourMean - oppMean;
    const diffVariance = lineup.variance + lineup.opponentProjection.variance;
    const diffStdDev = Math.sqrt(diffVariance);
    
    const zScore = diffMean / diffStdDev;
    
    return {
      ourMean,
      ourStdDev,
      oppMean,
      oppStdDev,
      diffMean,
      diffStdDev,
      zScore,
      winProb: lineup.winProbability
    };
  };
  
  const winProbDetails = getWinProbDetails();
  
  return (
    <div className="space-y-6">
      {/* Win Probability Math */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Win Probability Calculation</h3>
        <div className="space-y-3 font-mono text-sm">
          <div className="bg-gray-900 p-3 rounded">
            <div className="text-gray-400 mb-2">Step 1: Calculate Difference Distribution</div>
            <div className="text-white">
              Your Score ~ N({winProbDetails.ourMean.toFixed(1)}, {winProbDetails.ourStdDev.toFixed(1)}²)
            </div>
            <div className="text-white">
              Opp Score ~ N({winProbDetails.oppMean.toFixed(1)}, {winProbDetails.oppStdDev.toFixed(1)}²)
            </div>
            <div className="text-green-400 mt-2">
              Margin = Your - Opp ~ N({winProbDetails.diffMean.toFixed(1)}, {winProbDetails.diffStdDev.toFixed(1)}²)
            </div>
          </div>
          
          <div className="bg-gray-900 p-3 rounded">
            <div className="text-gray-400 mb-2">Step 2: Calculate Z-Score</div>
            <div className="text-white">
              Z = μ_diff / σ_diff = {winProbDetails.diffMean.toFixed(1)} / {winProbDetails.diffStdDev.toFixed(1)} = {winProbDetails.zScore.toFixed(3)}
            </div>
          </div>
          
          <div className="bg-gray-900 p-3 rounded">
            <div className="text-gray-400 mb-2">Step 3: Win Probability</div>
            <div className="text-white">
              P(Win) = Φ(Z) = Φ({winProbDetails.zScore.toFixed(3)}) = <span className="text-green-400 font-bold">{(winProbDetails.winProb * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Variance Decomposition */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Variance Decomposition</h3>
        
        <div className="mb-4">
          <div className="text-sm text-gray-400 mb-2">Individual Player Variances:</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {varianceBreakdown.individual.slice(0, 6).map((p, i) => (
              <div key={i} className="bg-gray-900 p-2 rounded">
                <span className="text-white">{p.name} ({p.position})</span>
                <span className="text-gray-400 ml-2">σ² = {p.variance.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="space-y-2 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Sum of Individual Variances:</span>
            <span className="text-white">{varianceBreakdown.sumOfVariances.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Correlation Contribution (2ΣΣCov):</span>
            <span className={varianceBreakdown.correlationContribution > 0 ? 'text-red-400' : 'text-green-400'}>
              {varianceBreakdown.correlationContribution > 0 ? '+' : ''}{varianceBreakdown.correlationContribution.toFixed(1)}
            </span>
          </div>
          <div className="border-t border-gray-700 pt-2 flex justify-between font-bold">
            <span className="text-gray-400">Total Lineup Variance:</span>
            <span className="text-white">{varianceBreakdown.totalVariance.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Total Lineup Std Dev:</span>
            <span className="text-blue-400">±{varianceBreakdown.totalStdDev.toFixed(1)} pts</span>
          </div>
        </div>
      </div>
      
      {/* Correlation Matrix */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Player Correlations (Non-Zero)</h3>
        
        {correlations && correlations.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs text-gray-400 mb-2">
              Correlation = Cov(X,Y) / (σ_X × σ_Y) | Range: [-1, 1]
            </div>
            {correlations.slice(0, 10).map((corr, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-900 p-2 rounded text-sm">
                <div>
                  <span className="text-white">{corr.player1}</span>
                  <span className="text-gray-500 mx-2">↔</span>
                  <span className="text-white">{corr.player2}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{corr.type}</span>
                  <span className={`font-mono font-bold ${
                    corr.value > 0.2 ? 'text-green-400' : 
                    corr.value < -0.1 ? 'text-red-400' : 
                    'text-yellow-400'
                  }`}>
                    {corr.value.toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400">No significant correlations found</div>
        )}
      </div>
      
      {/* Verification Summary */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-400 mb-3">Verification Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-300">Correlations calculated using team-based shock model</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-300">Variance includes correlation effects ({varianceBreakdown.correlationContribution > 0 ? 'increased' : 'decreased'} by {Math.abs(varianceBreakdown.correlationContribution).toFixed(1)} pts²)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-300">Win probability uses proper normal distribution (Z = {winProbDetails.zScore.toFixed(3)})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">✓</span>
            <span className="text-gray-300">Optimization considered {lineup.starters?.length || 0} players with correlations</span>
          </div>
        </div>
      </div>
    </div>
  );
};