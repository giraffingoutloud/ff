import { useState, useCallback, useEffect } from 'react';
import { Player, PlayerEvaluation, Position } from '../types';
import { enhancedEvaluationEngine, evaluationEngine } from '../services/unifiedEvaluationEngine';

interface UseEnhancedEvaluationProps {
  players: Player[];
  draftedPlayers?: Player[];
  remainingBudgets?: Map<string, number>;
  useEnhanced?: boolean;
}

export function useEnhancedEvaluation({
  players,
  draftedPlayers = [],
  remainingBudgets = new Map(),
  useEnhanced = false
}: UseEnhancedEvaluationProps) {
  const [evaluations, setEvaluations] = useState<PlayerEvaluation[]>([]);
  const [topByPosition, setTopByPosition] = useState<Map<Position, PlayerEvaluation[]>>(new Map());
  const [leagueWinners, setLeagueWinners] = useState<PlayerEvaluation[]>([]);
  const [landmines, setLandmines] = useState<PlayerEvaluation[]>([]);
  const [valuePicks, setValuePicks] = useState<PlayerEvaluation[]>([]);
  
  // Create context for evaluation
  const context = {
    draftedPlayers: draftedPlayers.map(p => ({
      playerId: p.id,
      teamId: 'team-1',
      price: 0,
      timestamp: Date.now()
    })),
    remainingBudgets,
    positionScarcity: new Map<Position, number>(),
    recentBids: []
  };
  
  // Calculate position scarcity
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
  positions.forEach(pos => {
    const available = players.filter(p => p.position === pos).length;
    const drafted = draftedPlayers.filter(p => p.position === pos).length;
    const total = available + drafted;
    const scarcity = total > 0 ? drafted / total : 0;
    context.positionScarcity.set(pos, scarcity);
  });
  
  // Main evaluation function
  const evaluateAllPlayers = useCallback(() => {
    if (players.length === 0) return;
    
    // Evaluate all players with enhanced or base engine
    const evaluated = players.map(player => {
      if (useEnhanced) {
        // Use enhanced evaluation with advanced metrics
        // In a real app, we'd fetch advanced metrics from APIs
        // Use only real data - no mock/synthetic data allowed
        // The engine will use actual data from canonical sources
        return enhancedEvaluationEngine.calculateCVS(player, context);
      } else {
        return evaluationEngine.calculateCVS(player, context);
      }
    });
    
    // Sort by CVS score
    evaluated.sort((a, b) => b.cvsScore - a.cvsScore);
    
    setEvaluations(evaluated);
    
    if (useEnhanced) {
      // Find league winners and landmines
      const winners = enhancedEvaluationEngine.findLeagueWinners(players);
      const mines = enhancedEvaluationEngine.findLandmines(players);
      setLeagueWinners(winners);
      setLandmines(mines);
    }
    
    // Group by position
    const byPosition = new Map<Position, PlayerEvaluation[]>();
    positions.forEach(pos => {
      const positionPlayers = evaluated.filter(p => p.position === pos);
      byPosition.set(pos, positionPlayers);
    });
    setTopByPosition(byPosition);
    
    // Find value picks (high CVS, low market value)
    const values = evaluated.filter(p => {
      const valueRatio = p.cvsScore / (p.marketValue || 1);
      return valueRatio > 2 && p.cvsScore > 70;
    });
    setValuePicks(values);
    
  }, [players, draftedPlayers, useEnhanced]);
  
  // Auto-evaluate when inputs change
  useEffect(() => {
    evaluateAllPlayers();
  }, [evaluateAllPlayers]);
  
  // Get top players by position
  const getTopByPosition = useCallback((position: Position, count: number = 5) => {
    const positionPlayers = topByPosition.get(position) || [];
    return positionPlayers.slice(0, count);
  }, [topByPosition]);
  
  // Get value picks
  const getValuePicks = useCallback((count: number = 10) => {
    return valuePicks.slice(0, count);
  }, [valuePicks]);
  
  // Get best available
  const getBestAvailable = useCallback((count: number = 10) => {
    return evaluations.slice(0, count);
  }, [evaluations]);
  
  // Get nomination strategy
  const getNominationStrategy = useCallback(() => {
    const strategy = {
      priceEnforcers: [] as PlayerEvaluation[],
      valuePlays: [] as PlayerEvaluation[],
      positionRuns: [] as PlayerEvaluation[]
    };
    
    // Price enforcers: High-value players you don't want
    strategy.priceEnforcers = evaluations
      .filter(p => p.marketValue > 30 && p.cvsScore < 70)
      .slice(0, 3);
    
    // Value plays: Your targets
    strategy.valuePlays = valuePicks.slice(0, 5);
    
    // Position runs: Scarce positions
    const scarcestPosition = Array.from(context.positionScarcity.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    if (scarcestPosition) {
      strategy.positionRuns = getTopByPosition(scarcestPosition[0], 3);
    }
    
    return strategy;
  }, [evaluations, valuePicks, context.positionScarcity, getTopByPosition]);
  
  return {
    evaluations,
    topByPosition,
    leagueWinners,
    landmines,
    valuePicks,
    getTopByPosition,
    getValuePicks,
    getBestAvailable,
    getNominationStrategy,
    reevaluate: evaluateAllPlayers
  };
}

// REMOVED: Mock data generation function
// All data must come from canonical_data and Sleeper API only
// No synthetic, simulated, or fabricated data allowed