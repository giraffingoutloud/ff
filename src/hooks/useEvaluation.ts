import { useState, useEffect, useCallback } from 'react';
import { Player, PlayerEvaluation, DraftedPlayer } from '../types';
import { evaluationEngine } from '../services/unifiedEvaluationEngine';
import { useDraftStore } from '../store/draftStore';

export function useEvaluation() {
  const { players, teams, draftHistory } = useDraftStore();
  const [evaluations, setEvaluations] = useState<PlayerEvaluation[]>([]);
  const [sleepers, setSleepers] = useState<PlayerEvaluation[]>([]);
  const [positionRuns, setPositionRuns] = useState<Map<string, number>>(new Map());
  const [isEvaluating, setIsEvaluating] = useState(false);

  const evaluateAllPlayers = useCallback(() => {
    setIsEvaluating(true);
    
    // Create market context
    const remainingBudgets = new Map<string, number>();
    teams.forEach(team => {
      remainingBudgets.set(team.id, team.budget - team.spentBudget);
    });
    
    const positionScarcity = new Map();
    const positionCounts: Record<string, number> = {};
    
    // Count remaining players by position
    players.forEach(player => {
      positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;
    });
    
    // Calculate scarcity (lower count = higher scarcity)
    Object.entries(positionCounts).forEach(([position, count]) => {
      const expectedCount = position === 'QB' || position === 'TE' ? 12 : 36;
      const scarcity = Math.max(0.5, Math.min(2, expectedCount / count));
      positionScarcity.set(position, scarcity);
    });
    
    // Get recent bids
    const recentBids = draftHistory.slice(-10).map(p => p.purchasePrice);
    
    const context = {
      draftedPlayers: draftHistory,
      remainingBudgets,
      positionScarcity,
      recentBids
    };
    
    // Evaluate all players
    const evaluated = players.map(player => 
      evaluationEngine.calculateCVS(player, context)
    );
    
    // Sort by CVS score
    evaluated.sort((a, b) => b.cvsScore - a.cvsScore);
    
    setEvaluations(evaluated);
    
    // Identify sleepers
    const sleeperPlayers = evaluationEngine.identifySleepers(players, context);
    setSleepers(sleeperPlayers);
    
    // Detect position runs
    const recentPicks = draftHistory.slice(-10);
    const runs = evaluationEngine.detectPositionRun(recentPicks);
    setPositionRuns(runs);
    
    setIsEvaluating(false);
  }, [players, teams, draftHistory]);

  useEffect(() => {
    evaluateAllPlayers();
  }, [evaluateAllPlayers]);

  const getTopByPosition = (position: string, count: number = 10): PlayerEvaluation[] => {
    return evaluations
      .filter(p => p.position === position)
      .slice(0, count);
  };

  const getValuePicks = (maxPrice: number): PlayerEvaluation[] => {
    return evaluations.filter(p => 
      p.isUndervalued && p.recommendedBid <= maxPrice
    );
  };

  const getBestAvailable = (budget: number): PlayerEvaluation[] => {
    return evaluations.filter(p => p.recommendedBid <= budget);
  };

  const getNominationStrategy = (myRoster: DraftedPlayer[], budget: number): PlayerEvaluation[] => {
    // Suggest players to nominate to drain opponent budgets
    const myPositions = new Set(myRoster.map(p => p.position));
    
    return evaluations.filter(player => {
      // Nominate expensive players at positions we don't need
      if (myPositions.has(player.position) && player.recommendedBid > 40) {
        return true;
      }
      
      // Nominate overvalued players
      if (!player.isUndervalued && player.marketValue > player.recommendedBid * 1.2) {
        return true;
      }
      
      return false;
    }).slice(0, 5);
  };

  return {
    evaluations,
    sleepers,
    positionRuns,
    isEvaluating,
    getTopByPosition,
    getValuePicks,
    getBestAvailable,
    getNominationStrategy,
    reevaluate: evaluateAllPlayers
  };
}