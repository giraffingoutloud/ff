/**
 * Optimized Loading Hook
 * Implements progressive loading strategy:
 * 1. Show top 40 players immediately
 * 2. Load rest in background
 * 3. Calculate expensive metrics only when visible
 */

import { useState, useEffect, useRef } from 'react';
import { Player } from '../types';
import { ModernExtendedPlayer } from '../types';
import { optimizedLoader } from '../services/optimizedLoader';
import { dynamicCVSCalculator } from '../services/dynamicCVSCalculator';
import { pprAnalyzer } from '../services/pprAnalyzer';
import { advancedMetricsService } from '../services/advancedMetricsService';

interface UseOptimizedLoadResult {
  players: ModernExtendedPlayer[];
  isInitialLoadComplete: boolean;
  isFullLoadComplete: boolean;
  loadingProgress: number;
  loadingStage: string;
  error: string | null;
}

export function useOptimizedLoad(): UseOptimizedLoadResult {
  const [players, setPlayers] = useState<ModernExtendedPlayer[]>([]);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [isFullLoadComplete, setIsFullLoadComplete] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('Starting...');
  const [error, setError] = useState<string | null>(null);
  
  const loadStarted = useRef(false);
  
  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    
    const load = async () => {
      try {
        // PHASE 1: Quick load top players (< 500ms)
        setLoadingStage('Loading top players...');
        setLoadingProgress(20);
        
        const topPlayers = await optimizedLoader.quickLoad(40);
        
        // Process just the top players quickly
        const quickProcessed = topPlayers.map(player => {
          // Minimal processing for initial display
          const extPlayer = player as any;
          return {
            ...extPlayer,
            id: player.id || player.playerId,
            pprValue: player.projectedPoints + (player.receptions || 0),
            isDrafted: false,
            // Defer expensive calculations
            targetShare: 0,
            catchRate: 0,
            auctionValue: player.auctionValue || 0,
            adp: player.adp || 999,
            cvsScore: player.cvsScore || 0
          } as ModernExtendedPlayer;
        });
        
        setPlayers(quickProcessed);
        setIsInitialLoadComplete(true);
        setLoadingProgress(40);
        
        // PHASE 2: Load remaining players in background
        setLoadingStage('Loading full player database...');
        
        const allPlayers = await optimizedLoader.fullLoad();
        setLoadingProgress(60);
        
        // PHASE 3: Process in chunks to avoid blocking
        setLoadingStage('Processing player data...');
        
        const processed = await optimizedLoader.processInChunks(
          allPlayers,
          (player) => {
            // Only calculate essentials
            const extPlayer = player as any;
            const pprAdjustment = pprAnalyzer.getPPRAdjustment(extPlayer);
            
            return {
              ...extPlayer,
              id: player.id || player.playerId,
              pprValue: player.projectedPoints + (player.receptions || 0) + pprAdjustment,
              isDrafted: false,
              targetShare: 0, // Calculate on demand
              catchRate: 0,    // Calculate on demand
              auctionValue: player.auctionValue || 0,
              adp: player.adp || 999,
              cvsScore: player.cvsScore || 0
            } as ModernExtendedPlayer;
          },
          50,
          (progress) => {
            setLoadingProgress(60 + (progress * 0.4));
          }
        );
        
        setPlayers(processed);
        setIsFullLoadComplete(true);
        setLoadingProgress(100);
        setLoadingStage('Ready!');
        
        // PHASE 4: Calculate expensive metrics in idle time
        requestIdleCallback(() => {
          // Calculate CVS scores in background
          const withCVS = dynamicCVSCalculator.calculateBulkCVS(processed as any);
          setPlayers(withCVS as ModernExtendedPlayer[]);
        });
        
      } catch (err) {
        console.error('Load error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load players');
        setIsInitialLoadComplete(true);
        setIsFullLoadComplete(true);
      }
    };
    
    load();
  }, []);
  
  return {
    players,
    isInitialLoadComplete,
    isFullLoadComplete,
    loadingProgress,
    loadingStage,
    error
  };
}