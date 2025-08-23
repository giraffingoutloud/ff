/**
 * React hook for the improved evaluation system
 * Provides access to intrinsic value, market price, and edge calculations
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Player, DraftedPlayer } from '../types';
import { UnifiedEvaluationService, UnifiedPlayerEvaluation } from '../services/unifiedEvaluationService';
import { LeagueSettings, defaultLeagueSettings } from '../services/valuation/leagueSettings';
import { useDraftStore } from '../store/draftStore';
import { featureFlags } from '../config/featureFlags';

export interface UseImprovedEvaluationResult {
  evaluations: UnifiedPlayerEvaluation[];
  isLoading: boolean;
  error: string | null;
  
  // Top players by different metrics
  topByEdge: UnifiedPlayerEvaluation[];
  topByValue: UnifiedPlayerEvaluation[];
  valueOpportunities: UnifiedPlayerEvaluation[];
  overpriced: UnifiedPlayerEvaluation[];
  
  // Methods
  reevaluate: () => void;
  updateLeagueSettings: (settings: LeagueSettings) => void;
  getPlayerEvaluation: (playerId: string) => UnifiedPlayerEvaluation | undefined;
  
  // System info
  evaluationMethod: 'new' | 'old';
  leagueSettings: LeagueSettings;
  
  // Stats
  stats: {
    totalPlayers: number;
    evaluatedPlayers: number;
    avgEdge: number;
    budgetCheck: boolean;
  };
}

export function useImprovedEvaluation(
  customSettings?: Partial<LeagueSettings>
): UseImprovedEvaluationResult {
  // Get data from store
  const { players, draftHistory, teams } = useDraftStore();
  
  // State
  const [evaluations, setEvaluations] = useState<UnifiedPlayerEvaluation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings>({
    ...defaultLeagueSettings,
    ...customSettings
  });
  
  // Create evaluation service
  const evaluationService = useMemo(
    () => new UnifiedEvaluationService(leagueSettings),
    [leagueSettings]
  );
  
  // Evaluate all players
  const evaluateAllPlayers = useCallback(() => {
    if (players.length === 0) {
      setError('No players to evaluate');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Create team budgets map
      const teamBudgets = new Map<string, number>();
      teams.forEach(team => {
        teamBudgets.set(team.id, team.budget - team.spentBudget);
      });
      
      // Filter out drafted players
      const draftedIds = new Set(draftHistory.map(p => p.id));
      const availablePlayers = players.filter(p => !draftedIds.has(p.id));
      
      // Evaluate
      const results = evaluationService.evaluateAllPlayers(
        availablePlayers,
        draftHistory,
        teamBudgets
      );
      
      setEvaluations(results);
    } catch (err) {
      console.error('Evaluation error:', err);
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setIsLoading(false);
    }
  }, [players, draftHistory, teams, evaluationService]);
  
  // Auto-evaluate when dependencies change
  useEffect(() => {
    evaluateAllPlayers();
  }, [evaluateAllPlayers]);
  
  // Update league settings
  const updateLeagueSettings = useCallback((newSettings: LeagueSettings) => {
    setLeagueSettings(newSettings);
    evaluationService.updateLeagueSettings(newSettings);
    evaluateAllPlayers();
  }, [evaluationService, evaluateAllPlayers]);
  
  // Get player evaluation by ID
  const getPlayerEvaluation = useCallback((playerId: string): UnifiedPlayerEvaluation | undefined => {
    return evaluations.find(e => e.id === playerId);
  }, [evaluations]);
  
  // Calculate derived data
  const topByEdge = useMemo(() => {
    if (!featureFlags.useNewEvaluationSystem) return [];
    return evaluationService.getTopPlayers(evaluations, 'edge', 10);
  }, [evaluations, evaluationService]);
  
  const topByValue = useMemo(() => {
    if (!featureFlags.useNewEvaluationSystem) return [];
    return evaluationService.getTopPlayers(evaluations, 'value', 10);
  }, [evaluations, evaluationService]);
  
  const valueOpportunities = useMemo(() => {
    return evaluationService.getValueOpportunities(evaluations, 3);
  }, [evaluations, evaluationService]);
  
  const overpriced = useMemo(() => {
    return evaluationService.getOverpricedPlayers(evaluations, -3);
  }, [evaluations, evaluationService]);
  
  // Calculate stats
  const stats = useMemo(() => {
    const totalPlayers = players.length;
    const evaluatedPlayers = evaluations.length;
    
    let avgEdge = 0;
    if (featureFlags.useNewEvaluationSystem && evaluations.length > 0) {
      const edgeSum = evaluations.reduce((sum, e) => sum + (e.edge || 0), 0);
      avgEdge = edgeSum / evaluations.length;
    }
    
    // Check if budget constraint is met (for new system)
    let budgetCheck = true;
    if (featureFlags.useNewEvaluationSystem) {
      const totalValue = evaluations.reduce((sum, e) => sum + (e.intrinsicValue || 0), 0);
      const targetBudget = leagueSettings.numTeams * leagueSettings.budget;
      budgetCheck = Math.abs(totalValue - targetBudget) <= 1;
    }
    
    return {
      totalPlayers,
      evaluatedPlayers,
      avgEdge,
      budgetCheck
    };
  }, [players, evaluations, leagueSettings]);
  
  return {
    evaluations,
    isLoading,
    error,
    topByEdge,
    topByValue,
    valueOpportunities,
    overpriced,
    reevaluate: evaluateAllPlayers,
    updateLeagueSettings,
    getPlayerEvaluation,
    evaluationMethod: evaluationService.getCurrentMethod(),
    leagueSettings,
    stats
  };
}

/**
 * Hook to get evaluation for a specific player
 */
export function usePlayerEvaluation(playerId: string): UnifiedPlayerEvaluation | undefined {
  const { getPlayerEvaluation } = useImprovedEvaluation();
  return getPlayerEvaluation(playerId);
}

/**
 * Hook to get value opportunities
 */
export function useValueOpportunities(minEdge: number = 3): UnifiedPlayerEvaluation[] {
  const { evaluations } = useImprovedEvaluation();
  const evaluationService = useMemo(() => new UnifiedEvaluationService(), []);
  
  return useMemo(() => {
    return evaluationService.getValueOpportunities(evaluations, minEdge);
  }, [evaluations, minEdge, evaluationService]);
}