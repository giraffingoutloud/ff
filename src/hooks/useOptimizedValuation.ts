/**
 * Optimized Valuation Hook with Performance Improvements
 * - Uses Map for O(1) player lookups instead of O(n) find()
 * - Longer debounce to prevent excessive recalculations
 * - Memoized getters for better performance
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Player, Position } from '../types';
import { UnifiedPlayerEvaluation } from '../services/unifiedEvaluationService';
import { DashboardDataService } from '../services/dashboard/dashboardDataService';
import { LeagueSettings, defaultLeagueSettings } from '../services/valuation/leagueSettings';
import { useDraftStore } from '../store/draftStore';
import { PlayerEdge } from '../services/edge/edgeCalculator';

export interface UseOptimizedValuationResult {
  evaluations: UnifiedPlayerEvaluation[];
  evaluationMap: Map<string, UnifiedPlayerEvaluation>;
  edgeMap: Map<string, PlayerEdge>;
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
  getPlayerEdge: (playerId: string) => PlayerEdge | undefined;
  
  // League settings
  leagueSettings: LeagueSettings;
  
  // Stats
  stats: {
    totalPlayers: number;
    evaluatedPlayers: number;
    avgEdge: number;
    budgetCheck: boolean;
  };
}

export function useOptimizedValuation(
  customSettings?: Partial<LeagueSettings>
): UseOptimizedValuationResult {
  // Get data from store
  const { players, draftHistory, teams, draftedPlayers, teamBudgets, teamRosters, myTeamId } = useDraftStore();
  
  // State
  const [evaluations, setEvaluations] = useState<UnifiedPlayerEvaluation[]>([]);
  const [evaluationMap, setEvaluationMap] = useState<Map<string, UnifiedPlayerEvaluation>>(new Map());
  const [edgeMap, setEdgeMap] = useState<Map<string, PlayerEdge>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings>({
    ...defaultLeagueSettings,
    ...customSettings
  });
  
  // Debounce timer ref - increased to 500ms for better performance
  const evaluationTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Create dashboard service - single source of truth
  const dashboardService = useMemo(
    () => new DashboardDataService(leagueSettings),
    [leagueSettings]
  );
  
  // Evaluate all players using DashboardDataService
  const evaluateAllPlayers = useCallback(() => {
    if (players.length === 0) {
      setError('No players to evaluate');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Create draft state for dashboard service
      const draftState = {
        draftedPlayers,
        teamBudgets,
        teamRosters,
        myTeamId,
        draftHistory
      };
      
      // Calculate ALL edges directly using the same engines as dashboard
      const draftedIds = new Set(draftHistory.map(dp => dp.playerId || dp.id));
      const availablePlayers = players.filter(p => !draftedIds.has(p.id));
      
      // Get the actual valuation engines from dashboard service
      const intrinsicValueEngine = (dashboardService as any).intrinsicValueEngine;
      const marketPriceModel = (dashboardService as any).marketPriceModel;
      const edgeCalculator = (dashboardService as any).edgeCalculator;
      
      // Calculate intrinsic values for ALL players
      const intrinsicValues = intrinsicValueEngine.calculateAllValues(availablePlayers);
      
      // Create market context
      const remainingBudgetMap = new Map<string, number>();
      let totalRemaining = 0;
      teamBudgets.forEach((budget, teamId) => {
        remainingBudgetMap.set(teamId, budget.remaining);
        totalRemaining += budget.remaining;
      });
      
      const marketContext = {
        draftedPlayers: draftHistory,
        remainingBudget: remainingBudgetMap,
        totalRemainingBudget: totalRemaining,
        remainingPlayers: availablePlayers,
        inflationRate: totalRemaining / (availablePlayers.length * 10) || 1.0,
        recentPrices: draftHistory
          .slice(-10)
          .map(pick => ({
            position: players.find(p => p.id === pick.playerId)?.position || 'QB' as Position,
            price: pick.purchasePrice
          }))
      };
      
      // Calculate market prices for ALL players
      const marketPrices = marketPriceModel.predictMultiple(
        availablePlayers,
        marketContext
      );
      
      // Calculate edges for ALL players
      const allEdges = edgeCalculator.calculateMultipleEdges(intrinsicValues, marketPrices);
      
      // Create Maps for O(1) lookups
      const newEvaluationMap = new Map<string, UnifiedPlayerEvaluation>();
      const newEdgeMap = new Map<string, PlayerEdge>();
      
      // Build edge map first
      allEdges.forEach(edge => {
        newEdgeMap.set(edge.player.id, edge);
      });
      
      // Convert edges to unified evaluations
      const unifiedEvaluations: UnifiedPlayerEvaluation[] = players.map(player => {
        const edge = newEdgeMap.get(player.id);
        
        const evaluation = {
          ...player,
          // Old system fields (for compatibility)
          cvsScore: edge?.intrinsicValue || 0,
          cvsComponents: {
            pps: player.projectedPoints,
            var: 0,
            con: 0,
            ups: 0,
            sos: 0,
            trd: 0,
            inj: 0
          },
          recommendedBid: edge?.intrinsicValue || 0,
          marketValue: edge?.marketPrice || 0,
          isUndervalued: edge ? edge.edge > 3 : false,
          positionRank: 999,
          overallRank: 999,
          
          // New system fields
          intrinsicValue: edge?.intrinsicValue,
          vorp: undefined,
          marketPrice: edge?.marketPrice,
          edge: edge?.edge,
          edgePercent: edge?.edgePercent,
          valueRecommendation: edge?.recommendation,
          tier: undefined
        } as UnifiedPlayerEvaluation;
        
        newEvaluationMap.set(player.id, evaluation);
        return evaluation;
      });
      
      setEvaluations(unifiedEvaluations);
      setEvaluationMap(newEvaluationMap);
      setEdgeMap(newEdgeMap);
    } catch (err) {
      console.error('Evaluation error:', err);
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setIsLoading(false);
    }
  }, [players, draftedPlayers, teamBudgets, teamRosters, myTeamId, draftHistory, dashboardService]);
  
  // Debounced evaluation with longer delay (500ms instead of immediate)
  useEffect(() => {
    // Clear existing timer
    if (evaluationTimerRef.current) {
      clearTimeout(evaluationTimerRef.current);
    }
    
    // Set new timer with longer delay for better performance
    evaluationTimerRef.current = setTimeout(() => {
      if (players.length > 0) {
        evaluateAllPlayers();
      }
    }, 500); // Increased from immediate to 500ms
    
    return () => {
      if (evaluationTimerRef.current) {
        clearTimeout(evaluationTimerRef.current);
      }
    };
  }, [draftHistory.length, evaluateAllPlayers, players.length]);
  
  // Update league settings
  const updateLeagueSettings = useCallback((settings: LeagueSettings) => {
    setLeagueSettings(settings);
  }, []);
  
  // Optimized getters using Map lookups (O(1) instead of O(n))
  const getPlayerEvaluation = useCallback((playerId: string) => {
    return evaluationMap.get(playerId);
  }, [evaluationMap]);
  
  const getPlayerEdge = useCallback((playerId: string) => {
    return edgeMap.get(playerId);
  }, [edgeMap]);
  
  // Memoized derived values
  const { topByEdge, topByValue, valueOpportunities, overpriced } = useMemo(() => {
    const available = evaluations.filter(e => !draftedPlayers.some(dp => dp.playerId === e.id));
    
    return {
      topByEdge: [...available]
        .filter(e => e.edge !== undefined)
        .sort((a, b) => (b.edge || 0) - (a.edge || 0))
        .slice(0, 20),
      
      topByValue: [...available]
        .filter(e => e.intrinsicValue !== undefined)
        .sort((a, b) => (b.intrinsicValue || 0) - (a.intrinsicValue || 0))
        .slice(0, 20),
      
      valueOpportunities: available.filter(e => 
        e.valueRecommendation === 'STRONG BUY' || 
        e.valueRecommendation === 'BUY'
      ),
      
      overpriced: available.filter(e => 
        e.valueRecommendation === 'SELL' || 
        e.valueRecommendation === 'STRONG SELL'
      )
    };
  }, [evaluations, draftedPlayers]);
  
  // Memoized stats
  const stats = useMemo(() => {
    const evaluated = evaluations.filter(e => e.edge !== undefined);
    const avgEdge = evaluated.length > 0 
      ? evaluated.reduce((sum, e) => sum + (e.edge || 0), 0) / evaluated.length 
      : 0;
    
    return {
      totalPlayers: evaluations.length,
      evaluatedPlayers: evaluated.length,
      avgEdge,
      budgetCheck: true
    };
  }, [evaluations]);
  
  return {
    evaluations,
    evaluationMap,
    edgeMap,
    edges: Array.from(edgeMap.values()),
    isLoading,
    error,
    topByEdge,
    topByValue,
    valueOpportunities,
    overpriced,
    reevaluate: evaluateAllPlayers,
    updateLeagueSettings,
    getPlayerEvaluation,
    getPlayerEdge,
    leagueSettings,
    stats
  };
}