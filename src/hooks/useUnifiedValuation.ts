/**
 * Unified Valuation Hook
 * Uses DashboardDataService as single source of truth for all valuations
 * Ensures consistency between main table and command center
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Player, Position } from '../types';
import { UnifiedPlayerEvaluation } from '../services/unifiedEvaluationService';
import { DashboardDataService } from '../services/dashboard/dashboardDataService';
import { LeagueSettings, defaultLeagueSettings } from '../services/valuation/leagueSettings';
import { useDraftStore } from '../store/draftStore';
import { PlayerEdge } from '../services/edge/edgeCalculator';

export interface UseUnifiedValuationResult {
  evaluations: UnifiedPlayerEvaluation[];
  edges: PlayerEdge[];
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

export function useUnifiedValuation(
  customSettings?: Partial<LeagueSettings>
): UseUnifiedValuationResult {
  // Get data from store
  const { players, draftHistory, teams, draftedPlayers, teamBudgets, teamRosters, myTeamId } = useDraftStore();
  
  // State
  const [evaluations, setEvaluations] = useState<UnifiedPlayerEvaluation[]>([]);
  const [edges, setEdges] = useState<PlayerEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings>({
    ...defaultLeagueSettings,
    ...customSettings
  });
  
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
      // This ensures we get edges for ALL players, not just top opportunities
      const draftedIds = new Set(draftHistory.map(dp => dp.playerId || dp.id));
      const availablePlayers = players.filter(p => !draftedIds.has(p.id));
      
      // Get the actual valuation engines from dashboard service
      const intrinsicValueEngine = (dashboardService as any).intrinsicValueEngine;
      const marketPriceModel = (dashboardService as any).marketPriceModel;
      const edgeCalculator = (dashboardService as any).edgeCalculator;
      
      // Calculate intrinsic values for ALL players
      const intrinsicValues = intrinsicValueEngine.calculateAllValues(availablePlayers);
      
      // Create market context (same as dashboard does)
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
      
      // Log sample values for verification
      if (allEdges.length > 0) {
        const samplePlayer = allEdges.find(e => e.player.name.includes('Barkley')) || allEdges[0];
        if (samplePlayer) {
          console.log('[Unified Valuation] Sample edge calculation:', {
            player: samplePlayer.player.name,
            intrinsicValue: samplePlayer.intrinsicValue.toFixed(1),
            marketPrice: samplePlayer.marketPrice.toFixed(1),
            edge: samplePlayer.edge.toFixed(1),
            edgePercent: samplePlayer.edgePercent.toFixed(1) + '%',
            totalPlayers: allEdges.length
          });
        }
      }
      
      // Convert edges to unified evaluations
      const unifiedEvaluations: UnifiedPlayerEvaluation[] = players.map(player => {
        const edge = allEdges.find(e => e.player.id === player.id);
        
        return {
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
          
          // New system fields - from dashboard service
          intrinsicValue: edge?.intrinsicValue,
          vorp: undefined, // Not directly available from edge
          marketPrice: edge?.marketPrice,
          edge: edge?.edge,
          edgePercent: edge?.edgePercent,
          valueRecommendation: edge?.recommendation,
          tier: undefined
        } as UnifiedPlayerEvaluation;
      });
      
      setEvaluations(unifiedEvaluations);
      setEdges(allEdges);
    } catch (err) {
      console.error('Evaluation error:', err);
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setIsLoading(false);
    }
  }, [players, draftedPlayers, teamBudgets, teamRosters, myTeamId, draftHistory, dashboardService]);
  
  // Auto-evaluate when dependencies change
  useEffect(() => {
    evaluateAllPlayers();
  }, [evaluateAllPlayers]);
  
  // Update league settings
  const updateLeagueSettings = useCallback((newSettings: LeagueSettings) => {
    setLeagueSettings(newSettings);
  }, []);
  
  // Get player evaluation by ID
  const getPlayerEvaluation = useCallback((playerId: string): UnifiedPlayerEvaluation | undefined => {
    return evaluations.find(e => e.id === playerId);
  }, [evaluations]);
  
  // Get player edge by ID
  const getPlayerEdge = useCallback((playerId: string): PlayerEdge | undefined => {
    return edges.find(e => e.player.id === playerId);
  }, [edges]);
  
  // Calculate derived data
  const topByEdge = useMemo(() => {
    return evaluations
      .filter(e => e.edge !== undefined && e.edge > 0)
      .sort((a, b) => (b.edge || 0) - (a.edge || 0))
      .slice(0, 10);
  }, [evaluations]);
  
  const topByValue = useMemo(() => {
    return evaluations
      .filter(e => e.intrinsicValue !== undefined)
      .sort((a, b) => (b.intrinsicValue || 0) - (a.intrinsicValue || 0))
      .slice(0, 10);
  }, [evaluations]);
  
  const valueOpportunities = useMemo(() => {
    return evaluations
      .filter(e => e.edge !== undefined && e.edge > 3)
      .sort((a, b) => (b.edge || 0) - (a.edge || 0));
  }, [evaluations]);
  
  const overpriced = useMemo(() => {
    return evaluations
      .filter(e => e.edge !== undefined && e.edge < -3)
      .sort((a, b) => (a.edge || 0) - (b.edge || 0));
  }, [evaluations]);
  
  // Calculate stats
  const stats = useMemo(() => {
    const totalPlayers = players.length;
    const evaluatedPlayers = evaluations.filter(e => e.edge !== undefined).length;
    
    let avgEdge = 0;
    if (evaluatedPlayers > 0) {
      const edgeSum = evaluations
        .filter(e => e.edge !== undefined)
        .reduce((sum, e) => sum + (e.edge || 0), 0);
      avgEdge = edgeSum / evaluatedPlayers;
    }
    
    // Check if budget constraint is met
    const totalValue = evaluations.reduce((sum, e) => sum + (e.intrinsicValue || 0), 0);
    const targetBudget = leagueSettings.numTeams * leagueSettings.budget;
    const budgetCheck = Math.abs(totalValue - targetBudget) <= 1;
    
    return {
      totalPlayers,
      evaluatedPlayers,
      avgEdge,
      budgetCheck
    };
  }, [players, evaluations, leagueSettings]);
  
  return {
    evaluations,
    edges,
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