import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu } from '@headlessui/react';
import { 
  Trophy, 
  Users, 
  Database, 
  ChevronDown,
  ChevronUp,
  List,
  Sparkles,
  X,
  ArrowUpDown,
  DollarSign,
  Edit2,
  Check,
  HelpCircle
} from 'lucide-react';
import { useDraftStore } from './store/draftStore';
import { AdvancedPlayerCard } from './components/AdvancedPlayerCard';
import { ComprehensiveHorizontalRecommendations } from './components/ComprehensiveHorizontalRecommendations';
import { TeamCommandCenter } from './components/TeamCommandCenter';
import { SearchBar } from './components/SearchBar';
import { DarkPlayerComparison } from './components/DarkPlayerComparison';
import { ValueFinder } from './components/ValueFinder';
import { DraftHistory } from './components/DraftHistory';
import Dashboard from './components/Dashboard/Dashboard';
import { PopOutWindow } from './components/PopOutWindow';
import { MethodologyDocs } from './components/MethodologyDocs';
import { playerDB } from './services/database';
import { improvedCanonicalService } from './services/improvedCanonicalService';
import { dynamicCVSCalculator } from './services/dynamicCVSCalculator';
import { ExtendedPlayer, pprAnalyzer } from './services/pprAnalyzer';
import { advancedMetricsService } from './services/advancedMetricsService';
import { auctionMarketTracker, MarketConditions, PositionMarket } from './services/auctionMarketTracker';
import { Player, Position, Team } from './types';
// Validation imports commented out for performance
// import { dataValidator } from './services/dataValidator';
// import { hallucinationDetector } from './services/hallucinationDetector';
// import { dataProvenanceChecker } from './services/dataProvenanceChecker';
import { badgeDataService } from './services/badgeDataService';
import { EvaluationSettings } from './components/EvaluationSettings';
import { Settings, Calculator } from 'lucide-react';
import { useUnifiedValuation } from './hooks/useUnifiedValuation';
import { ImprovedValueDisplay, ValueBadge } from './components/ImprovedValueDisplay';
import { featureFlags } from './config/featureFlags';
import { safeToFixed, safeRound } from './utils/safeNumber';
import { CriticalMoments } from './components/Dashboard/CriticalMoments';
import { DashboardDataService } from './services/dashboard/dashboardDataService';
import { defaultLeagueSettings } from './services/valuation/leagueSettings';
import './utils/findPlayer';
import { useDebounce } from './hooks/useDebounce';
import { optimizedFilterService } from './services/optimizedFilterService';
import { PriorityNeeds } from './components/PriorityNeeds';
import { DualScrollTable } from './components/DualScrollTable';
import { VirtualTable } from './components/VirtualTable';

type ViewMode = 'grid' | 'list';
type DraftMode = 'snake' | 'auction';

// Extend the ExtendedPlayer type for App
interface ModernExtendedPlayer extends ExtendedPlayer {
  isDrafted?: boolean;
  purchasePrice?: number;
  auctionValue?: number;
}

// Draggable Modal Component - Memoized for performance
const DraggableModal = React.memo<{
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}>(({ children, onClose, title }) => {
  const [position, setPosition] = useState({ x: window.innerWidth / 2 - (title === 'My Team' ? 350 : title === 'Data Quality Report' ? 175 : title === 'Draft Player' ? 350 : title === 'Player Comparison' ? 450 : 250), y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-header')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 pointer-events-none"
    >
      <motion.div
        ref={modalRef}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={`absolute bg-dark-bg-secondary rounded-xl overflow-hidden border border-dark-border pointer-events-auto shadow-2xl ${
          title === 'My Team' ? 'w-[700px] h-[95vh]' : 
          title === 'Data Quality Report' ? 'w-[350px] max-h-[85vh]' : 
          title === 'Draft Player' ? 'w-[700px] max-h-[85vh]' :
          title === 'Player Comparison' ? 'w-[900px] max-h-[85vh]' :
          'w-[500px] max-h-[85vh]'
        }`}
        style={{
          left: position.x,
          top: position.y,
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="modal-header flex items-center justify-between p-3 border-b border-dark-border cursor-move bg-dark-bg">
          <h2 className="text-sm font-bold text-dark-text flex items-center gap-2">
            <Users className="w-3 h-3 text-draft-primary" />
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-dark-bg-secondary transition-colors"
          >
            <X className="w-4 h-4 text-dark-text-secondary" />
          </button>
        </div>
        <div className={`overflow-y-auto ${
          title === 'My Team' ? 'h-[calc(95vh-50px)]' : 'max-h-[calc(85vh-50px)]'
        }`}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
});

DraggableModal.displayName = 'DraggableModal';

export function App() {
  const {
    players,
    myTeam: storeMyTeam,
    teams: storeTeams,
    selectedPlayer,
    setPlayers,
    selectPlayer,
    draftPlayer,
    initializeDraft,
    draftHistory
  } = useDraftStore();
  
  // Local teams state
  const [teams, setTeams] = useState(storeTeams);
  
  // Use the team from teams array for consistency
  const myTeam = teams.find(t => t.id === 'my-team') || storeMyTeam;

  const [isLoading, setIsLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState('Initializing...');
  const [loadingProgress, setLoadingProgress] = useState(15);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [draftMode, setDraftMode] = useState<DraftMode>('auction');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedPositions, setSelectedPositions] = useState<Set<Position>>(new Set());
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  const [tableViewMode, setTableViewMode] = useState<'ALL' | 'BUYS' | 'TRAPS'>('ALL');
  const [extendedPlayers, setExtendedPlayers] = useState<ModernExtendedPlayer[]>([]);
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState<ModernExtendedPlayer | null>(null);
  const auctionTrackerInitialized = useRef(false);
  const appInitialized = useRef(false);
  const [marketConditions, setMarketConditions] = useState<MarketConditions | null>(null);
  const [positionMarkets, setPositionMarkets] = useState<PositionMarket[]>([]);
  const [sortColumn, setSortColumn] = useState<'name' | 'position' | 'team' | 'cvsScore' | 'projectedPoints' | 'receptions' | 'auctionValue' | 'adp' | 'byeWeek' | 'sos' | 'intrinsicValue' | 'marketPrice' | 'edge'>('edge');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [displayCount, setDisplayCount] = useState(30); // Reduced initial load for better performance
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set());
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [selectedBadges, setSelectedBadges] = useState<Set<string>>(new Set());
  const [draftPriceModal, setDraftPriceModal] = useState<{ 
    player: ModernExtendedPlayer | null, 
    show: boolean, 
    price: number,
    selectedTeamId: string 
  }>({ 
    player: null, 
    show: false, 
    price: 0,
    selectedTeamId: 'my-team' 
  });
  const [showDataQuality, setShowDataQuality] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  // const [showDashboardPopout, setShowDashboardPopout] = useState(false); // Now opens in new window
  const [dataQualityIssues, setDataQualityIssues] = useState<{ 
    errors: number, 
    warnings: number, 
    hallucinations: number,
    legitimacy: boolean 
  }>({ errors: 0, warnings: 0, hallucinations: 0, legitimacy: true });
  const [validationResults, setValidationResults] = useState<string>('');
  const [customTeamNames, setCustomTeamNames] = useState<Record<string, string>>({});
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [tempTeamName, setTempTeamName] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  // Use unified valuation hook for consistency
  const { 
    evaluations: improvedEvaluations, 
    valueOpportunities,
    overpriced,
    reevaluate,
    getPlayerEdge,
    isLoading: valuationsLoading
  } = useUnifiedValuation();

  // Generate dashboard data for critical moments
  const dashboardService = useMemo(() => new DashboardDataService(defaultLeagueSettings), []);
  const dashboardData = useMemo(() => {
    // Create draft state from available data
    const draftedPlayersSet = new Set(draftHistory.map(dp => dp.id));
    const teamBudgetsMap = new Map();
    const teamRostersMap = new Map();
    
    teams.forEach(team => {
      teamBudgetsMap.set(team.id, {
        spent: team.spentBudget,
        remaining: team.budget - team.spentBudget
      });
      teamRostersMap.set(team.id, team.roster);
    });
    
    const draftState = {
      draftedPlayers: draftedPlayersSet,
      teamBudgets: teamBudgetsMap,
      teamRosters: teamRostersMap,
      myTeamId: myTeam.id,
      draftHistory
    };
    return dashboardService.generateDashboardData(players, draftState);
  }, [players, teams, myTeam.id, draftHistory, dashboardService]);

  // Load custom team names from localStorage on mount
  useEffect(() => {
    const savedNames = localStorage.getItem('fantasyCustomTeamNames');
    if (savedNames) {
      try {
        setCustomTeamNames(JSON.parse(savedNames));
      } catch (e) {
        console.error('Failed to load team names:', e);
      }
    }
  }, []);

  // Save custom team names to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(customTeamNames).length > 0) {
      localStorage.setItem('fantasyCustomTeamNames', JSON.stringify(customTeamNames));
    }
  }, [customTeamNames]);

  // Helper function to get display name for a team
  const getTeamDisplayName = (team: Team, idx?: number) => {
    if (team.id === 'my-team') return 'My Team';
    return customTeamNames[team.id] || team.name || `Team ${idx !== undefined ? idx + 1 : team.id.replace('team-', '')}`;
  };

  // Helper function to convert ADP to round (assumes 12-team league)
  const getAdpRoundRange = (adp: number): string => {
    if (!adp || adp > 200) return '17+';
    
    const teamSize = 12; // Standard 12-team league
    const round = Math.ceil(adp / teamSize);
    
    if (round > 16) return '17+';
    
    // Just the number
    return String(round);
  };

  // Handle player selection for comparison
  const togglePlayerSelection = (playerId: string) => {
    const newSelection = new Set(selectedForComparison);
    if (newSelection.has(playerId)) {
      newSelection.delete(playerId);
    } else {
      // Limit to 4 players max for comparison
      if (newSelection.size < 4) {
        newSelection.add(playerId);
      }
    }
    setSelectedForComparison(newSelection);
  };

  // Open comparison modal
  const openComparison = () => {
    if (selectedForComparison.size >= 2) {
      setShowComparisonModal(true);
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedForComparison(new Set());
    setShowComparisonModal(false);
  };

  useEffect(() => {
    if (!appInitialized.current) {
      appInitialized.current = true;
      initializeApp();
    }
    
    // Set up callback for real-time updates to trigger re-render
    (window as any).updatePlayersFromRealtime = () => {
      // Get the current players with updated injury data
      const currentPlayers = improvedCanonicalService.getAllPlayers();
      
      // Calculate CVS for each player (like in initializeApp)
      const playersWithCVS = currentPlayers.map(player => 
        dynamicCVSCalculator.calculatePlayerCVS(player)
      );
      
      // Update both players and extendedPlayers to ensure UI updates
      // We'll set the extended players as the store players later
      
      // Also update extended players with the new injury data
      const extended = playersWithCVS.map(player => {
        const extPlayer = player as ExtendedPlayer;
        const pprAdjustment = pprAnalyzer.getPPRAdjustment(extPlayer);
        const targetMetrics = advancedMetricsService.calculateTargetMetrics(extPlayer);
        
        return {
          ...extPlayer,
          pprValue: extPlayer.projectedPoints + (extPlayer.receptions || 0),
          targetShare: targetMetrics.estimatedTargetShare,
          catchRate: targetMetrics.catchRate,
          isDrafted: draftHistory.some(dp => dp.id === extPlayer.id),
          auctionValue: extPlayer.auctionValue,
          adp: extPlayer.adp,
          cvsScore: extPlayer.cvsScore, // Explicitly preserve CVS
          // Preserve injury data
          injuryStatus: extPlayer.injuryStatus,
          injuryNotes: extPlayer.injuryNotes
        } as ModernExtendedPlayer;
      });
      
      setExtendedPlayers(extended);
      setPlayers(extended); // Keep store in sync
      console.log('UI updated with real-time injury data');
    };
    
    return () => {
      delete (window as any).updatePlayersFromRealtime;
    };
  }, []); // Only run once on mount
  
  // Initialize auction market tracker ONCE and update market data periodically
  useEffect(() => {
    if (draftMode === 'auction' && teams.length > 0 && extendedPlayers.length > 0) {
      // Only initialize if not already initialized
      if (!auctionTrackerInitialized.current) {
        const teamIds = teams.map(t => t.id);
        const availablePlayersForTracker = extendedPlayers.filter(p => !p.isDrafted);
        auctionMarketTracker.initialize(teamIds, 200, 16, availablePlayersForTracker);
        auctionTrackerInitialized.current = true;
        console.log('Auction tracker initialized with', availablePlayersForTracker.length, 'players');
      }
      
      // Update market data
      const updateMarketData = () => {
        setMarketConditions(auctionMarketTracker.getMarketConditions());
        setPositionMarkets(auctionMarketTracker.getPositionMarkets());
      };
      
      updateMarketData();
      
      // Update every 2 seconds
      const interval = setInterval(updateMarketData, 2000);
      return () => clearInterval(interval);
    }
  }, [teams, extendedPlayers, draftHistory, draftMode]);
  
  // Check data quality issues - DISABLED FOR PERFORMANCE
  /* useEffect(() => {
    if (extendedPlayers.length > 0) {
      const issues = dataValidator.getIssues();
      const errors = issues.filter(i => i.severity === 'error').length;
      const warnings = issues.filter(i => i.severity === 'warning').length;
      const hallucinationSummary = hallucinationDetector.getSummary();
      const provenanceSummary = dataProvenanceChecker.getSummary();
      setDataQualityIssues({ 
        errors, 
        warnings, 
        hallucinations: hallucinationSummary.high,
        legitimacy: provenanceSummary.isLegitimate
      });
    }
  }, [extendedPlayers]); */


  // Update auction tracker when players are drafted
  useEffect(() => {
    // Tracker is initialized in the other useEffect, this just handles draft updates
    if (draftMode === 'auction' && auctionTrackerInitialized.current && draftHistory.length > 0) {
      // No additional logic needed here as the tracker updates are handled in confirmDraft
    }
  }, [draftMode, extendedPlayers.length]);


  const initializeApp = async () => {
    console.log('initializeApp called - starting load');
    setIsLoading(true);
    setLoadingStage('Initializing draft settings...');
    
    try {
      
      // Initialize draft settings and create teams
      await new Promise(resolve => setTimeout(resolve, 200));
      setLoadingProgress(25);
      initializeDraft({
        leagueSize: 12,
        budget: 200,
        rosterSize: 16,
        scoringType: 'PPR',
        flexPositions: ['RB', 'WR', 'TE'],
      });

      // Try to load from database first, but don't fail if it errors
      let loadedPlayers: Player[] = [];
      
      setLoadingStage('Loading player database...');
      await new Promise(resolve => setTimeout(resolve, 300));
      setLoadingProgress(45);
      try {
        loadedPlayers = await playerDB.getAll();
      } catch (dbError) {
        console.warn('Database load failed, will load from canonical:', dbError);
        loadedPlayers = [];
      }
      
      if (loadedPlayers.length === 0) {
        // Force fresh load
        setLoadingStage('Loading player data from CSV files...');
        await new Promise(resolve => setTimeout(resolve, 300));
        setLoadingProgress(60);
        improvedCanonicalService.reset();
        loadedPlayers = await improvedCanonicalService.initialize();
        
        if (loadedPlayers.length === 0) {
          throw new Error('No players loaded from canonical data');
        }
      } else {
        // Still initialize canonical service for real-time updates
        setLoadingStage('Checking for player updates...');
        await new Promise(resolve => setTimeout(resolve, 300));
        setLoadingProgress(60);
        improvedCanonicalService.initialize().catch(err => 
          console.warn('Failed to initialize canonical service:', err)
        );
      }
      
      // Calculate CVS scores
      setLoadingStage('Calculating player values...');
      await new Promise(resolve => setTimeout(resolve, 300));
      setLoadingProgress(75);
      loadedPlayers = dynamicCVSCalculator.calculateBulkCVS(loadedPlayers);
      
      // Extend players with PPR and advanced metrics
      setLoadingStage('Analyzing PPR adjustments...');
      
      // Process in chunks to prevent blocking
      const extended: ModernExtendedPlayer[] = [];
      const chunkSize = 50;
      
      for (let i = 0; i < loadedPlayers.length; i += chunkSize) {
        const chunk = loadedPlayers.slice(i, i + chunkSize);
        const extendedChunk = chunk.map(player => {
          const extPlayer = player as ExtendedPlayer;
          const pprAdjustment = pprAnalyzer.getPPRAdjustment(extPlayer);
          const targetMetrics = advancedMetricsService.calculateTargetMetrics(extPlayer);
          
          const result = {
            ...extPlayer,
            pprValue: extPlayer.projectedPoints + (extPlayer.receptions || 0),
            targetShare: targetMetrics.estimatedTargetShare,
            catchRate: targetMetrics.catchRate,
            isDrafted: false,
            auctionValue: extPlayer.auctionValue, // Explicitly preserve auction value
            adp: extPlayer.adp // Explicitly preserve ADP value with decimals
          } as ModernExtendedPlayer;
          
          return result;
        });
        extended.push(...extendedChunk);
        
        // Update loading progress
        const progress = 75 + Math.round(((i + chunkSize) / loadedPlayers.length) * 20);
        setLoadingStage(`Analyzing players... ${Math.min(Math.round(((i + chunkSize) / loadedPlayers.length) * 100), 100)}%`);
        setLoadingProgress(Math.min(progress, 95));
      }
      
      // Store in window for debugging
      (window as any).__players = extended;
      
      console.log('Sample extended player:', extended[0]);
      console.log('Total extended players:', extended.length);
      
      setExtendedPlayers(extended);
      
      // Initialize auction tracker if in auction mode
      // Auction tracker initialized in useEffect to prevent duplication
      
      // Save to database in background (don't wait)
      setLoadingStage('Saving to database...');
      playerDB.bulkUpsert(loadedPlayers).catch(err => 
        console.warn('Failed to save to database:', err)
      );
      
      // Make sure the store has the same players we're using in the UI
      console.log('About to set players in store, type:', typeof extended, 'isArray:', Array.isArray(extended));
      if (extended.length > 0) {
        console.log('First extended player:', extended[0]);
      }
      
      setLoadingStage('Finalizing...');
      setPlayers(extended);
      console.log('Set players in store:', extended.length);
      
      // Final progress
      setLoadingProgress(100);
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Set loading to false before valuations start
      setIsLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      console.error('Stack trace:', error);
      alert(`Failed to load player data: ${error.message || error}`);
      setPlayers([]);
      setIsLoading(false);
    }
  };

  // Sync teams from store whenever draft history changes
  const prevDraftLength = useRef(draftHistory.length);
  const prevDraftHistory = useRef(draftHistory);
  useEffect(() => {
    // Always sync teams from store when draft history changes
    const storeTeams = useDraftStore.getState().teams;
    console.log('Draft history changed, syncing teams from store');
    console.log('Store teams:', storeTeams.map(t => ({ id: t.id, roster: t.roster.length, spent: t.spentBudget })));
    setTeams(storeTeams);
    prevDraftLength.current = draftHistory.length;
  }, [draftHistory.length]); // Use length to detect changes
  
  // Sync extendedPlayers with draftHistory when undo happens
  useEffect(() => {
    // Only sync if we have extended players loaded
    if (extendedPlayers.length === 0) return;
    
    // Check if this is an undo (draft history got shorter)
    if (prevDraftLength.current > draftHistory.length && prevDraftLength.current > 0) {
      // Find the player that was undone
      const undonePlayer = prevDraftHistory.current[prevDraftHistory.current.length - 1];
      if (undonePlayer && auctionTrackerInitialized.current) {
        // Update auction tracker to add player back to available list
        const restoredPlayer = extendedPlayers.find(p => p.id === undonePlayer.id);
        if (restoredPlayer) {
          auctionMarketTracker.undoDraft(
            restoredPlayer,
            undonePlayer.purchasedBy,
            undonePlayer.purchasePrice
          );
          console.log('Updated auction tracker after undo:', restoredPlayer.name);
        }
      }
      
      // After undo, reinitialize the auction tracker with the correct available players
      if (prevDraftLength.current > draftHistory.length && auctionTrackerInitialized.current) {
        const availablePlayersForTracker = extendedPlayers.filter(p => {
          const draftedIds = new Set(draftHistory.map(dp => dp.id));
          return !draftedIds.has(p.id);
        });
        
        // Re-initialize with updated available players
        const teamIds = teams.map(t => t.id);
        auctionMarketTracker.initialize(teamIds, 200, 16, availablePlayersForTracker);
        
        // Re-record all remaining drafts to rebuild the market state
        draftHistory.forEach(draftedPlayer => {
          if (draftedPlayer.purchasedBy && draftedPlayer.purchasePrice) {
            auctionMarketTracker.recordDraft(
              draftedPlayer,
              draftedPlayer.purchasedBy,
              draftedPlayer.purchasePrice
            );
          }
        });
        
        console.log('Re-initialized auction tracker after undo with', availablePlayersForTracker.length, 'available players');
        console.log('Re-recorded', draftHistory.length, 'drafts to rebuild market state');
        
        // Force update market conditions and position markets to trigger re-render
        setMarketConditions(auctionMarketTracker.getMarketConditions());
        setPositionMarkets(auctionMarketTracker.getPositionMarkets());
        
        // Clear badge cache when draft state changes
        optimizedFilterService.clearCache();
      }
    }
    
    // Update previous draft history reference
    prevDraftHistory.current = draftHistory;
    
    // Get IDs of all drafted players from current draft history
    const draftedPlayerIds = new Set(draftHistory.map(p => p.id));
    
    // Update extendedPlayers to reflect current draft state
    setExtendedPlayers(prev => {
      // Update isDrafted status for all existing players
      const updated = prev.map(p => ({
        ...p,
        isDrafted: draftedPlayerIds.has(p.id),
        purchasePrice: draftedPlayerIds.has(p.id) ? 
          draftHistory.find(dp => dp.id === p.id)?.purchasePrice : 
          undefined
      }));
      
      console.log('Updated isDrafted status - drafted:', draftedPlayerIds.size, 'available:', updated.filter(p => !p.isDrafted).length);
      return updated;
    });
    
    console.log('Updated extendedPlayers after draft history change. Drafted:', draftedPlayerIds.size);
  }, [draftHistory.length]); // Only depend on length to avoid initial render issues

  // Helper function to check if player has a specific badge
  const playerHasBadge = (player: ModernExtendedPlayer, badge: string): boolean => {
    switch(badge) {
      case 'overvalued':
        return (player.auctionValue ?? 0) >= 10 && player.cvsScore < ((player.auctionValue ?? 0) * 2.5);
      case 'sleeper':
        return player.adp > 100 && player.adp < 200 && player.projectedPoints > 120;
      case 'hot':
        return (player.trending || 0) > 3000;
      case 'trending':
        return (player.trending || 0) > 1500 && (player.trending || 0) <= 3000;
      case 'rising':
        return (player.trending || 0) > 500 && (player.trending || 0) <= 1500;
      case 'injury':
        return player.injuryStatus !== undefined && player.injuryStatus !== 'Healthy';
      case 'value':
        return player.adp > 36 && player.adp < 150 && (
          (player.position === 'QB' && player.projectedPoints > 240) ||
          (player.position === 'RB' && player.projectedPoints > 180) ||
          (player.position === 'WR' && player.projectedPoints > 200) ||
          (player.position === 'TE' && player.projectedPoints > 140)
        );
      case 'pprstud':
        return (player.receptions || 0) >= 75;
      case 'bustrisk':
        return player.adp < 50 && player.adp > 0 && (
          (player.position === 'RB' && player.projectedPoints < 215) ||
          (player.position === 'WR' && player.projectedPoints < 230) ||
          (player.position === 'QB' && player.projectedPoints < 300) ||
          (player.position === 'TE' && player.projectedPoints < 195)
        );
      case 'consistent':
        return badgeDataService.isConsistentProducer(player.name);
      case 'rzmonster':
        return badgeDataService.isRedZoneMonster(player.name);
      case 'volume':
        return badgeDataService.isVolumeKing(player.name);
      default:
        return false;
    }
  };

  // Filter players based on search and filters - OPTIMIZED VERSION
  const filteredPlayers = useMemo(() => {
    // Debug: Count recommendations
    if (tableViewMode !== 'ALL') {
      const recommendationCounts = improvedEvaluations.reduce((acc, playerEval) => {
        if (playerEval.valueRecommendation) {
          acc[playerEval.valueRecommendation] = (acc[playerEval.valueRecommendation] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      console.log('[Filter Debug] Recommendation counts:', recommendationCounts);
      console.log('[Filter Debug] Table view mode:', tableViewMode);
    }
    
    // Use optimized filter service with debounced search
    return optimizedFilterService.filterPlayers(extendedPlayers, {
      searchQuery: debouncedSearchQuery, // Using debounced value
      selectedPositions,
      showOnlyAvailable,
      selectedBadges,
      tableViewMode,
      improvedEvaluations
    });
  }, [extendedPlayers, debouncedSearchQuery, selectedPositions, showOnlyAvailable, selectedBadges, tableViewMode, improvedEvaluations]);

  // Get available players only
  const availablePlayers = extendedPlayers.filter(p => !p.isDrafted);

  // Log filtering results
  useEffect(() => {
    console.log('Filtered players count:', filteredPlayers.length, 'showOnlyAvailable:', showOnlyAvailable);
  }, [filteredPlayers.length, showOnlyAvailable]);
  
  // Sort players based on current sort column and direction
  const sortedPlayers = useMemo(() => [...filteredPlayers].sort((a, b) => {
    let aVal: any;
    let bVal: any;
    
    // Special handling for new evaluation columns - Using Map for O(1) lookups
    if (sortColumn === 'intrinsicValue' || sortColumn === 'marketPrice' || sortColumn === 'edge' || 
        sortColumn === 'edgePercent' || sortColumn === 'confidence' || sortColumn === 'cwe') {
      const aEval = improvedEvaluations.find(e => e.id === a.id);
      const bEval = improvedEvaluations.find(e => e.id === b.id);
      const aEdge = getPlayerEdge(a.id);
      const bEdge = getPlayerEdge(b.id);
      
      if (sortColumn === 'intrinsicValue') {
        aVal = aEval?.intrinsicValue || 0;
        bVal = bEval?.intrinsicValue || 0;
      } else if (sortColumn === 'marketPrice') {
        aVal = aEval?.marketPrice || 0;
        bVal = bEval?.marketPrice || 0;
      } else if (sortColumn === 'edge') {
        aVal = aEval?.edge || 0;
        bVal = bEval?.edge || 0;
      } else if (sortColumn === 'edgePercent') {
        aVal = aEval?.edgePercent || 0;
        bVal = bEval?.edgePercent || 0;
      } else if (sortColumn === 'confidence') {
        aVal = aEdge?.confidence || 0;
        bVal = bEdge?.confidence || 0;
      } else if (sortColumn === 'cwe') {
        aVal = aEdge?.confidenceWeightedEdge || 0;
        bVal = bEdge?.confidenceWeightedEdge || 0;
      }
    }
    // Special handling for round column (calculated from ADP)
    else if (sortColumn === 'round') {
      aVal = Math.ceil((a.adp || 999) / 12);
      bVal = Math.ceil((b.adp || 999) / 12);
    } else {
      aVal = a[sortColumn];
      bVal = b[sortColumn];
    }
    
    // Handle null/undefined values
    if (aVal == null) aVal = (sortColumn === 'receptions' || sortColumn === 'sos') ? 0 : '';
    if (bVal == null) bVal = (sortColumn === 'receptions' || sortColumn === 'sos') ? 0 : '';
    
    // Handle string vs number comparison
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    
    // Number comparison
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  }), [filteredPlayers, sortColumn, sortDirection, improvedEvaluations]);

  // Handle column header click
  const handleSort = useCallback((column: typeof sortColumn) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }, [sortColumn, sortDirection]);

  const handleDraftPlayer = async (player: ModernExtendedPlayer, teamId?: string, price?: number) => {
    // If price is provided (from AuctionWarRoom), draft directly
    if (price !== undefined) {
      // IMMEDIATELY update UI for instant feedback
      setExtendedPlayers(prev => prev.map(p => 
        p.id === player.id ? { ...p, isDrafted: true, purchasePrice: price } : p
      ));
      
      // Force immediate re-render by clearing filters if player was visible
      if (filteredPlayers.some(p => p.id === player.id)) {
        // This will instantly remove the player from view
        setShowOnlyAvailable(true);
      }
      
      // Update store in background (non-blocking)
      setTimeout(() => {
        draftPlayer(player.id, teamId || 'my-team', price);
      }, 0);
    } else {
      // Show price input modal
      setDraftPriceModal({
        player,
        show: true,
        price: player.auctionValue || 1,
        selectedTeamId: 'my-team'
      });
    }
  };

  const confirmDraft = useCallback(async () => {
    if (!draftPriceModal.player) return;
    
    const { player, selectedTeamId, price } = draftPriceModal;
      
      try {
        // Close modal IMMEDIATELY
        setDraftPriceModal({ player: null, show: false, price: 0, selectedTeamId: 'my-team' });
        
        // Update UI IMMEDIATELY for instant feedback
        setExtendedPlayers(prev => prev.map(p => 
          p.id === player.id ? { ...p, isDrafted: true, purchasePrice: price } : p
        ));
        
        // Force immediate re-render if showing available only
        if (showOnlyAvailable) {
          // This triggers instant visual update
          setShowOnlyAvailable(true);
        }
        
        // Update store and tracker in background (non-blocking)
        setTimeout(async () => {
          await draftPlayer(player.id, selectedTeamId, price);
          
          // Update auction market tracker if needed
          if (draftMode === 'auction') {
            const draftedPlayer = { ...player, purchasePrice: price } as any;
            auctionMarketTracker.recordDraft(draftedPlayer, selectedTeamId, price);
          }
        }, 0);
      } catch (error) {
        console.error('Error drafting player:', error);
        alert('Failed to draft player. Check console for details.');
      }
  }, [draftPriceModal, draftPlayer, draftMode]);

  const handlePlayerDetail = (player: ModernExtendedPlayer) => {
    setSelectedPlayerDetail(player);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-draft-primary mx-auto"></div>
          <p className="mt-4 text-dark-text text-2xl font-bold">Loading optimizer...</p>
          <br />
          <p className="mt-2 text-dark-text-secondary text-base">{loadingStage}</p>
          <div className="mt-6 w-96 bg-dark-bg-secondary rounded-full h-4 mx-auto overflow-hidden">
            <div 
              className="bg-draft-primary h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${loadingProgress || 10}%` }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  try {
    return (
    <div className="min-h-screen dark bg-dark-bg transition-colors duration-200">
      {/* Modern Header */}
      <header className="bg-gradient-to-r from-gray-800 to-gray-700 border-b border-gray-600 sticky top-0 z-50">
        <div className="w-full px-3 sm:px-6 xl:px-10 py-2 sm:py-3 xl:py-5">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2 lg:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 xl:gap-4">
              <h1 className="text-sm sm:text-lg xl:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent uppercase whitespace-nowrap">
                <span className="hidden sm:inline">Fantasy Auction Draft Optimizer</span>
                <span className="sm:hidden">Draft Optimizer</span>
              </h1>
            </div>
            
            {/* Market Status - Compressed */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 xl:gap-5 text-xs sm:text-sm xl:text-lg">
              {/* Draft Phase */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase cursor-help" title="Current stage of the draft based on percentage of players drafted. Opening (0-10%), Early (10-25%), Middle (25-50%), Late (50-75%), Closing (75-90%), Endgame (90-100%). Each phase has different strategy implications.">
                  Phase:
                </span>
                <span className={`font-bold ${
                  dashboardData.marketContext.draftProgress < 10 ? 'text-blue-400' :
                  dashboardData.marketContext.draftProgress < 25 ? 'text-cyan-400' :
                  dashboardData.marketContext.draftProgress < 50 ? 'text-green-400' :
                  dashboardData.marketContext.draftProgress < 75 ? 'text-yellow-400' :
                  dashboardData.marketContext.draftProgress < 90 ? 'text-orange-400' :
                  'text-red-400'
                }`}>
                  {dashboardData.marketContext.draftProgress < 10 ? 'OPENING' :
                   dashboardData.marketContext.draftProgress < 25 ? 'EARLY' :
                   dashboardData.marketContext.draftProgress < 50 ? 'MIDDLE' :
                   dashboardData.marketContext.draftProgress < 75 ? 'LATE' :
                   dashboardData.marketContext.draftProgress < 90 ? 'CLOSING' :
                   'ENDGAME'} ({safeToFixed(dashboardData.marketContext.draftProgress, 0)}%)
                </span>
              </div>
              
              {/* Momentum */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase cursor-help" title="Market temperature based on inflation rate. Cold (<0.95x) = bargains available, Warm (0.95-1.05x) = fair prices, Hot (1.05-1.15x) = rising prices, Overheated (>1.15x) = bidding wars likely.">
                  Momentum:
                </span>
                <span className="font-bold">
                  {dashboardData.marketContext.inflationRate < 0.95 ? 'COLD' :
                   dashboardData.marketContext.inflationRate < 1.05 ? 'WARM' :
                   dashboardData.marketContext.inflationRate < 1.15 ? 'HOT' :
                   'OVERHEATED'}
                </span>
              </div>
              
              {/* Inflation */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase cursor-help" title="Ratio of remaining money to remaining value. >1.0 means prices will be higher than normal (inflation), <1.0 means bargains available (deflation). Calculated as (money left / slots left) ÷ baseline average.">
                  Inflation:
                </span>
                <span className={`font-bold font-mono ${
                  dashboardData.marketContext.inflationRate > 1.15 ? 'text-red-400' :
                  dashboardData.marketContext.inflationRate > 1.05 ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  {safeToFixed(dashboardData.marketContext.inflationRate, 2)}×
                </span>
              </div>
              
              {/* Spending Pace */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase cursor-help" title="Compares actual spending to expected spending at this point. >110% = Fast (teams overspending early), 90-110% = Normal, <90% = Slow (teams saving for later). Fast pace often leads to bargains later.">
                  Pace:
                </span>
                <span className={`font-bold ${
                  dashboardData.marketContext.paceVsExpected > 1.1 ? 'text-red-400' :
                  dashboardData.marketContext.paceVsExpected < 0.9 ? 'text-blue-400' :
                  'text-green-400'
                }`}>
                  {safeToFixed((dashboardData.marketContext.paceVsExpected || 0) * 100, 0)}%
                  {dashboardData.marketContext.paceVsExpected > 1.1 && ' (Fast)'}
                  {dashboardData.marketContext.paceVsExpected < 0.9 && ' (Slow)'}
                </span>
              </div>
              
              {/* Avg per Team */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase cursor-help" title="Average budget remaining per team. Compare your remaining budget to this to see if you're cash-rich (can be aggressive) or cash-poor (need bargains) relative to competition.">
                  Avg/Team:
                </span>
                <span className="font-bold text-cyan-400 font-mono">
                  ${safeToFixed(dashboardData.marketContext.avgTeamRemaining, 0)}
                </span>
              </div>
              
              {/* Remaining Budget Pool */}
              <div className="flex items-center gap-2">
                <span className="text-gray-400 uppercase cursor-help" title="Total money remaining across all teams. This is the entire budget pool still available to be spent. As this shrinks, competition for remaining players intensifies.">
                  Pool:
                </span>
                <span className="font-bold text-green-400 font-mono">
                  ${dashboardData.marketContext.totalRemaining}
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Methodology Button - Moved to right side */}
              <button
                onClick={() => setShowMethodology(true)}
                className="p-1.5 rounded-lg bg-dark-bg hover:bg-blue-600 transition-all text-dark-text-secondary hover:text-white"
                title="Methodology & Calculations"
              >
                <HelpCircle className="w-5 h-5 xl:w-6 xl:h-6" />
              </button>
              
              {/* Data Quality Indicator - DISABLED FOR PERFORMANCE
              Validation features commented out to improve load time
              <button
                onClick={() => setShowDataQuality(!showDataQuality)}
                className={`px-2 py-0.5 text-xs rounded-full font-medium transition-colors ${
                  !dataQualityIssues.legitimacy
                    ? 'bg-red-600/30 text-red-300 hover:bg-red-600/40 animate-pulse'
                    : dataQualityIssues.hallucinations > 0
                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                    : dataQualityIssues.errors > 0 
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : dataQualityIssues.warnings > 0
                    ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                    : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                }`}
                title="Click to view data quality details"
              >
                {!dataQualityIssues.legitimacy ? (
                  <span className="text-[10px] xl:text-sm">🚫 Unverified</span>
                ) : dataQualityIssues.hallucinations > 0 ? (
                  <span className="text-[10px] xl:text-sm">🧠 {dataQualityIssues.hallucinations} Issues</span>
                ) : dataQualityIssues.errors > 0 ? (
                  <span className="text-[10px] xl:text-sm">⚠️ {dataQualityIssues.errors} Issues</span>
                ) : dataQualityIssues.warnings > 0 ? (
                  <span className="text-[10px] xl:text-sm">📊 {dataQualityIssues.warnings} Warn</span>
                ) : (
                  <span className="text-[10px] xl:text-sm">✓ Data OK</span>
                )}
              </button>
              */}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {
        <div className="w-full px-6 xl:px-10 py-6 xl:py-10">
          <div className="grid grid-cols-12 gap-4">
            {/* Left Sidebar - Smart Recommendations + My Team */}
            <div className="col-span-12 lg:col-span-3 xl:col-span-2 2xl:col-span-2 space-y-4 order-2 lg:order-1">
              
              {/* My Team Box - Below Smart Recommendations */}
              <div className="bg-gray-800 rounded-md p-3 xl:p-5 border border-gray-600">
                <div className="mb-3 xl:mb-4">
                  <h3 className="text-base xl:text-lg font-semibold text-dark-text">
                    My Team ({myTeam.roster.length}/16)
                  </h3>
                </div>
                
                {/* Priority Needs - Moved from Team Command Center */}
                <PriorityNeeds 
                  roster={myTeam.roster}
                  remainingBudget={myTeam.budget - myTeam.spentBudget}
                  spotsLeft={16 - myTeam.roster.length}
                />
                
                {/* Position Requirements - One per line */}
                <div className="space-y-2 mb-4">
                  {[
                    { pos: 'QB', needed: 2 },
                    { pos: 'RB', needed: 4 },
                    { pos: 'WR', needed: 4 },
                    { pos: 'TE', needed: 2 },
                    { pos: 'FLEX', needed: 2 },
                    { pos: 'K', needed: 1 },
                    { pos: 'DST', needed: 1 }
                  ].map(({ pos, needed }) => {
                      let players: any[] = [], count: number;
                      if (pos === 'FLEX') {
                        // Simplified FLEX calculation
                        players = [];
                        count = 0;
                      } else {
                        players = myTeam.roster.filter(p => p.position === pos);
                        count = players.length;
                      }
                    
                    return (
                      <div key={pos} className="flex items-center gap-3 mb-2">
                        <span className="text-cyan-400 font-bold text-xs xl:text-base w-10">{pos}</span>
                        
                        <div className="flex-1 h-4 bg-gray-900 rounded-full overflow-hidden relative">
                          <div 
                            className="h-full transition-all duration-500 bg-gradient-to-r from-green-600 to-green-400"
                            style={{ width: `${Math.min(100, (count / needed) * 100)}%` }}
                          />
                        </div>
                        
                        <div className="flex items-center gap-2 text-[10px] xl:text-sm">
                          <span className="text-gray-400">
                            {count}/{needed}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Team Stats */}
                <div className="pt-2">
                  <div className="space-y-1 mb-2">
                    <div className="flex justify-between">
                      <span className="text-[10px] xl:text-sm text-dark-text-secondary">Budget Remaining</span>
                      <span className="text-[10px] xl:text-sm font-bold text-dark-text">
                        ${myTeam.budget - myTeam.spentBudget}
                      </span>
                    </div>
                    <div className="w-full bg-gray-900 rounded-full h-4 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          (myTeam.budget - myTeam.spentBudget) > 140 ? 'bg-gradient-to-r from-green-600 to-green-400' :
                          (myTeam.budget - myTeam.spentBudget) > 50 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
                          'bg-gradient-to-r from-red-600 to-red-400'
                        }`}
                        style={{ width: `${Math.min(100, ((myTeam.budget - myTeam.spentBudget) / 200) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-[10px] xl:text-sm text-dark-text-secondary">Total Projected</span>
                    <span className="text-[10px] xl:text-sm font-bold text-dark-text">
                      {Math.round(myTeam.roster.reduce((sum, p) => sum + p.projectedPoints, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] xl:text-sm text-dark-text-secondary">PPR Bonus</span>
                    <span className="text-[10px] xl:text-sm font-bold text-green-500">
                      +{Math.round(myTeam.roster.reduce((sum, p) => sum + ((p as any).receptions || 0), 0))}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Value Finder - Below My Team */}
              <ValueFinder />
            </div>

            {/* Center - Player Grid/List */}
            <div className="col-span-12 lg:col-span-6 xl:col-span-8 space-y-4 order-1 lg:order-2">
              {/* Comparison Toolbar */}
              {selectedForComparison.size > 0 && (
                <div className="inline-flex bg-draft-primary/10 border border-draft-primary rounded-xl p-1 items-center gap-3">
                  <span className="text-dark-text text-[10px] xl:text-sm pl-1">
                    {selectedForComparison.size} player{selectedForComparison.size !== 1 ? 's' : ''} selected
                  </span>
                  {selectedForComparison.size >= 2 && (
                    <button
                      onClick={openComparison}
                      className="bg-draft-primary hover:bg-blue-700 text-white px-1.5 py-0.5 rounded text-[10px] xl:text-sm font-medium transition-colors"
                    >
                      Compare Players
                    </button>
                  )}
                  <button
                    onClick={clearSelection}
                    className="text-dark-text-secondary hover:text-dark-text transition-colors text-[10px] xl:text-sm pr-1"
                  >
                    Clear
                  </button>
                </div>
              )}

              
              {/* Player Cards */}
              {viewMode === 'grid' ? (
                <>
                  {/* Grid view content placeholder - ready for new content */}
                  <div className="flex items-center justify-center h-96 bg-dark-bg-secondary rounded-xl border border-dark-border">
                    <p className="text-dark-text-secondary">Grid view content will go here</p>
                  </div>
                </>
              ) : (
                <div className="bg-dark-bg-secondary rounded-xl border border-dark-border overflow-hidden">
                  <div className="px-4 xl:px-6 py-3 xl:py-5 bg-dark-bg-tertiary border-b border-dark-border">
                    {/* First row - Showing, View Mode Buttons, and Sorted by */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm xl:text-lg text-dark-text-secondary whitespace-nowrap">
                          Showing {Math.min(displayCount, sortedPlayers.length)} of {sortedPlayers.length} players
                        </span>
                        {/* Table View Mode Toggle - Moved here */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setTableViewMode('ALL')}
                            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                              tableViewMode === 'ALL'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                            title="Show all players"
                          >
                            ALL
                          </button>
                          <button
                            onClick={() => setTableViewMode('BUYS')}
                            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                              tableViewMode === 'BUYS'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                            title="Best values: Strong-buy or $15+ edge with 25%+ return"
                          >
                            BEST VALUES
                          </button>
                          <button
                            onClick={() => setTableViewMode('TRAPS')}
                            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                              tableViewMode === 'TRAPS'
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                            title="Overpriced: Strong-avoid or -10% edge"
                          >
                            OVERPRICED
                          </button>
                        </div>
                      </div>
                      <span className="text-sm xl:text-lg text-dark-text-secondary whitespace-nowrap">
                        Sorted by: <span className="font-medium text-dark-text">
                          {sortColumn === 'edge' ? 'Edge ($)' :
                           sortColumn === 'edgePercent' ? 'Edge %' :
                           sortColumn === 'confidence' ? 'Confidence' :
                           sortColumn === 'cwe' ? 'CWE' :
                           sortColumn === 'intrinsicValue' ? 'Value ($)' :
                           sortColumn === 'marketPrice' ? 'Price ($)' :
                           sortColumn === 'projectedPoints' ? 'Projected Points' :
                           sortColumn === 'adp' ? 'ADP' :
                           sortColumn === 'cvsScore' ? 'CVS Score' :
                           sortColumn === 'round' ? 'Round' :
                           sortColumn === 'receptions' ? 'PPR Receptions' :
                           sortColumn === 'byeWeek' ? 'Bye Week' :
                           sortColumn === 'experience' ? 'Experience' :
                           sortColumn === 'sos' ? 'Strength of Schedule' :
                           sortColumn.charAt(0).toUpperCase() + sortColumn.slice(1)}
                        </span> ({sortDirection === 'asc' ? '↑' : '↓'})
                      </span>
                    </div>
                    
                    {/* Second row - Position filter buttons */}
                    <div className="flex flex-wrap gap-0.5 sm:gap-1 xl:gap-2 mb-3">
                      {(['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as Position[]).map(position => (
                        <button
                          key={position}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log(`${position} button clicked`);
                            const newSelection = new Set(selectedPositions);
                            if (newSelection.has(position)) {
                              newSelection.delete(position);
                            } else {
                              newSelection.add(position);
                            }
                            setSelectedPositions(newSelection);
                          }}
                          className={`text-[10px] sm:text-xs xl:text-sm font-bold py-0.5 xl:py-1 px-0.5 sm:px-1 xl:px-1.5 rounded flex-1 h-4 sm:h-5 xl:h-6 min-h-[1rem] sm:min-h-[1.25rem] bg-position-${position.toLowerCase()} text-white cursor-pointer ${
                            selectedPositions.has(position)
                              ? 'opacity-100'
                              : 'opacity-40 hover:opacity-70'
                          }`}
                        >
                          {position}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newState = !showOnlyAvailable;
                          console.log('Available button clicked. Current state:', showOnlyAvailable, 'New state:', newState);
                          try {
                            console.log('Total players:', extendedPlayers.length);
                            console.log('Drafted players:', extendedPlayers.filter(p => p.isDrafted).length);
                            console.log('Available players:', extendedPlayers.filter(p => !p.isDrafted).length);
                            console.log('First player isDrafted:', extendedPlayers[0]?.isDrafted);
                          } catch (error) {
                            console.error('Error checking players:', error);
                          }
                          setShowOnlyAvailable(newState);
                          console.log('State set to:', newState);
                        }}
                        className={`text-[10px] sm:text-xs xl:text-sm font-bold py-0.5 xl:py-1 px-0.5 sm:px-1 xl:px-1.5 rounded flex-1 h-4 sm:h-5 xl:h-6 min-h-[1rem] sm:min-h-[1.25rem] bg-green-600 text-white cursor-pointer ${
                          showOnlyAvailable 
                            ? 'opacity-100' 
                            : 'opacity-40 hover:opacity-70'
                        }`}
                      >
                        Available
                      </button>
                      <div className="w-[40px]">
                        {selectedPositions.size > 0 && (
                          <button
                            onClick={() => setSelectedPositions(new Set())}
                            className="text-xs text-dark-text-secondary hover:text-dark-text px-1 py-0.5 w-full rounded bg-gray-700 hover:bg-gray-600"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <hr className="border-dark-border mt-2" />
                    {/* Badge Legend - Clickable for filtering */}
                    <div className="flex flex-wrap items-center gap-4 text-sm xl:text-base text-dark-text-secondary mt-3">
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('overvalued')) newSet.delete('overvalued');
                          else newSet.add('overvalued');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('overvalued') ? 'ring-2 ring-red-500 rounded px-1' : ''
                        }`}
                        title="Click to filter - High price but CVS doesn't justify it"
                      >
                        <span className="px-0.5 py-0 bg-red-600/20 text-red-500 rounded font-bold text-xs xl:text-base">📉</span> <span className="text-xs xl:text-base">Overvalued</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('sleeper')) newSet.delete('sleeper');
                          else newSet.add('sleeper');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('sleeper') ? 'ring-2 ring-green-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - ADP 100-200 with 120+ points"
                      >
                        <span className="px-0.5 py-0 bg-green-500/20 text-green-400 rounded font-bold text-xs xl:text-base">💎</span> <span className="text-xs xl:text-base">Sleeper</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('hot')) newSet.delete('hot');
                          else newSet.add('hot');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('hot') ? 'ring-2 ring-red-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - 3000+ adds/drops recently"
                      >
                        <span className="px-0.5 py-0 bg-red-600/20 text-red-400 rounded font-bold text-xs xl:text-base">🔥</span> <span className="text-xs xl:text-base">Hot</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('trending')) newSet.delete('trending');
                          else newSet.add('trending');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('trending') ? 'ring-2 ring-orange-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - 1500-3000 adds/drops recently"
                      >
                        <span className="px-0.5 py-0 bg-orange-600/20 text-orange-400 rounded font-bold text-xs xl:text-base">📈</span> <span className="text-xs xl:text-base">Trending</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('rising')) newSet.delete('rising');
                          else newSet.add('rising');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('rising') ? 'ring-2 ring-yellow-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - 500-1500 adds/drops recently"
                      >
                        <span className="px-0.5 py-0 bg-yellow-600/20 text-yellow-400 rounded font-bold text-xs xl:text-base">⬆️</span> <span className="text-xs xl:text-base">Rising</span>
                      </button>
                      <span className="text-gray-500">|</span>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('injury')) newSet.delete('injury');
                          else newSet.add('injury');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('injury') ? 'ring-2 ring-orange-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - Injury statuses from Sleeper API"
                      >
                        <span className="px-0.5 py-0 bg-yellow-500/20 text-yellow-400 rounded font-bold text-xs xl:text-base">Q</span>/
                        <span className="px-0.5 py-0 bg-orange-500/20 text-orange-400 rounded font-bold text-xs xl:text-base">D</span>/
                        <span className="px-0.5 py-0 bg-red-500/20 text-red-400 rounded font-bold text-xs xl:text-base">O</span> <span className="text-xs xl:text-base">Injury</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('value')) newSet.delete('value');
                          else newSet.add('value');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('value') ? 'ring-2 ring-emerald-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - ADP > 36 with high points for position"
                      >
                        <span className="px-0.5 py-0 bg-emerald-500/20 text-emerald-400 rounded font-bold text-xs xl:text-base">💰</span> <span className="text-xs xl:text-base">Value</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('pprstud')) newSet.delete('pprstud');
                          else newSet.add('pprstud');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('pprstud') ? 'ring-2 ring-blue-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - 75+ projected receptions"
                      >
                        <span className="px-0.5 py-0 bg-blue-500/20 text-blue-400 rounded font-bold text-xs xl:text-base">PPR</span> <span className="text-xs xl:text-base">PPR Stud</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('bustrisk')) newSet.delete('bustrisk');
                          else newSet.add('bustrisk');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('bustrisk') ? 'ring-2 ring-red-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - ADP < 50 with low projected points"
                      >
                        <span className="px-0.5 py-0 bg-red-500/20 text-red-400 rounded font-bold text-xs xl:text-base">⚠</span> <span className="text-xs xl:text-base">Bust Risk</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('consistent')) newSet.delete('consistent');
                          else newSet.add('consistent');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('consistent') ? 'ring-2 ring-blue-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - Elite consistency in 2024 (14+ games, 10+ PPG, low variance)"
                      >
                        <span className="px-0.5 py-0 bg-blue-500/20 text-blue-400 rounded font-bold text-xs xl:text-base">📊</span> <span className="text-xs xl:text-base">Consistent</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('rzmonster')) newSet.delete('rzmonster');
                          else newSet.add('rzmonster');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('rzmonster') ? 'ring-2 ring-red-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - Red zone dominator (20%+ RZ usage or 18+ RZ touches with 7+ TDs)"
                      >
                        <span className="px-0.5 py-0 bg-red-600/20 text-red-400 rounded font-bold text-xs xl:text-base">🎯</span> <span className="text-xs xl:text-base">RZ Monster</span>
                      </button>
                      <button
                        onClick={() => {
                          const newSet = new Set(selectedBadges);
                          if (newSet.has('volume')) newSet.delete('volume');
                          else newSet.add('volume');
                          setSelectedBadges(newSet);
                        }}
                        className={`flex items-center gap-1 cursor-pointer transition-all hover:opacity-80 ${
                          selectedBadges.has('volume') ? 'ring-2 ring-purple-400 rounded px-1' : ''
                        }`}
                        title="Click to filter - Top 10% in projected touches for 2025"
                      >
                        <span className="px-0.5 py-0 bg-purple-500/20 text-purple-400 rounded font-bold text-xs xl:text-base">👑</span> <span className="text-xs xl:text-base">Volume King</span>
                      </button>
                      {selectedBadges.size > 0 && (
                        <button
                          onClick={() => setSelectedBadges(new Set())}
                          className="text-xs text-dark-text-secondary hover:text-dark-text px-1 py-0.5 rounded bg-gray-700 hover:bg-gray-600 ml-1"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <DualScrollTable>
                  <table className="w-full min-w-max">
                    <thead className="bg-dark-bg-tertiary">
                      <tr>
                        <th className="w-8 px-0.5 py-1">
                          <div className="flex justify-center">
                            <input
                              type="checkbox"
                              className="w-3 h-3 xl:w-5 xl:h-5 rounded border-dark-border bg-dark-bg text-draft-primary focus:ring-draft-primary"
                            checked={selectedForComparison.size === sortedPlayers.slice(0, displayCount).length && sortedPlayers.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const newSelection = new Set(selectedForComparison);
                                sortedPlayers.slice(0, Math.min(displayCount, 4)).forEach(p => newSelection.add(p.id));
                                setSelectedForComparison(newSelection);
                              } else {
                                setSelectedForComparison(new Set());
                              }
                            }}
                          />
                          </div>
                        </th>
                        <th className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium w-16">Draft</th>
                        <th 
                          className="text-left px-1 py-1 text-dark-text text-xs xl:text-base font-medium hover:bg-dark-bg transition-colors w-44"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 cursor-pointer flex-shrink-0" onClick={() => handleSort('name')}>
                              <span className="cursor-help" title="Player Name - Click column to sort, use search box to filter">Player</span>
                              {sortColumn === 'name' ? (
                                sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                              ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                            </div>
                            <div className="relative flex-grow">
                              <input
                                type="text"
                                placeholder="Search players..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-dark-bg-tertiary border border-dark-border rounded pl-2 pr-6 py-0.5 text-[11px] xl:text-sm text-dark-text placeholder-dark-text-secondary focus:border-white focus:outline-none"
                              />
                              {searchQuery && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSearchQuery('');
                                  }}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 text-dark-text-secondary hover:text-dark-text transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-[10px] sm:text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-8 sm:w-12"
                          onClick={() => handleSort('position')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help text-[10px] sm:text-xs xl:text-base" title="Position - QB/RB/WR/TE/K/DST"><span className="hidden sm:inline">Pos</span><span className="sm:hidden">P</span></span>
                            {sortColumn === 'position' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-[10px] sm:text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-10 sm:w-14"
                          onClick={() => handleSort('team')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help text-[10px] sm:text-xs xl:text-base" title="NFL Team - Player's current team"><span className="hidden sm:inline">Team</span><span className="sm:hidden">Tm</span></span>
                            {sortColumn === 'team' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                          </div>
                        </th>
                        {featureFlags.useNewEvaluationSystem ? (
                          <>
                            <th 
                              className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-14"
                              onClick={() => handleSort('intrinsicValue')}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="cursor-help" title="Intrinsic Value ($) - What the player is truly worth based on projected performance and VORP (Value Over Replacement Player) methodology">Value</span>
                                {sortColumn === 'intrinsicValue' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                              </div>
                            </th>
                            <th 
                              className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-14"
                              onClick={() => handleSort('marketPrice')}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="cursor-help" title="Market Price ($) - What the market expects to pay based on Average Auction Value (AAV) and Average Draft Position (ADP) data">Price</span>
                                {sortColumn === 'marketPrice' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                              </div>
                            </th>
                            <th 
                              className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-16"
                              onClick={() => handleSort('auctionValue')}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="cursor-help" title="Auction Value ($) - Recommended spending amount in a $200 budget auction draft based on historical data">$AAV</span>
                                {sortColumn === 'auctionValue' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                              </div>
                            </th>
                            <th 
                              className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-14"
                              onClick={() => handleSort('edge')}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="cursor-help" title="Edge ($) - The difference between Intrinsic Value and Market Price. Positive = undervalued bargain, Negative = overpriced">Edge</span>
                                {sortColumn === 'edge' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                              </div>
                            </th>
                            <th 
                              className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-14"
                              onClick={() => handleSort('edgePercent')}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="cursor-help" title="Edge % - The edge as a percentage of market price">Edge%</span>
                                {sortColumn === 'edgePercent' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                              </div>
                            </th>
                            <th 
                              className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-12"
                              onClick={() => handleSort('confidence')}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="cursor-help" title="Confidence - How reliable the edge calculation is (0-100%)">Conf</span>
                                {sortColumn === 'confidence' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                              </div>
                            </th>
                            <th 
                              className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-14"
                              onClick={() => handleSort('cwe')}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="cursor-help" title="CWE - Confidence Weighted Edge (Edge × Confidence)">CWE</span>
                                {sortColumn === 'cwe' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                              </div>
                            </th>
                            <th 
                              className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-14"
                              onClick={() => handleSort('adp')}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span className="cursor-help" title="Average Draft Position - Where the player is typically selected across all ESPN leagues (lower = earlier)">ADP</span>
                                {sortColumn === 'adp' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                                ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                              </div>
                            </th>
                          </>
                        ) : (
                          <th 
                            className="text-center px-0.5 py-1 text-dark-text text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-14"
                            onClick={() => handleSort('cvsScore')}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="cursor-help" title="Composite Value Score (0-100) - Overall player rating combining projections, market value, position scarcity, and schedule strength">CVS</span>
                              {sortColumn === 'cvsScore' ? (
                                sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                              ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                            </div>
                          </th>
                        )}
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-[10px] sm:text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-10 sm:w-14"
                          onClick={() => handleSort('projectedPoints')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Projected Points - Total fantasy points expected for the 2025 season based on statistical projections">Proj</span>
                            {sortColumn === 'projectedPoints' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-[10px] sm:text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-10 sm:w-14"
                          onClick={() => handleSort('receptions')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="PPR Bonus - Additional points from projected receptions in Point Per Reception scoring format">PPR</span>
                            {sortColumn === 'receptions' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-[10px] sm:text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-8 sm:w-12"
                          onClick={() => handleSort('byeWeek')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Bye Week - Week when the team doesn't play (important for roster planning)">Bye</span>
                            {sortColumn === 'byeWeek' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-[10px] sm:text-xs xl:text-base font-medium cursor-pointer hover:bg-dark-bg transition-colors w-8 sm:w-12"
                          onClick={() => handleSort('sos')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Strength of Schedule (1-10) - How difficult the player's matchups are. Lower = easier schedule = better for fantasy">SOS</span>
                            {sortColumn === 'sos' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            ) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.slice(0, displayCount).map(player => (
                        <tr key={player.id} className="border-t border-dark-border hover:bg-dark-bg">
                          <td className="w-8 px-0.5 py-0.5">
                            <div className="flex justify-center">
                              <input
                                type="checkbox"
                                className="w-3 h-3 xl:w-5 xl:h-5 rounded border-dark-border bg-dark-bg text-draft-primary focus:ring-draft-primary"
                              checked={selectedForComparison.has(player.id)}
                              onChange={() => togglePlayerSelection(player.id)}
                            />
                            </div>
                          </td>
                          <td className="text-center px-0.5 py-0.5 w-16">
                            <button
                              onClick={() => handleDraftPlayer(player)}
                              className="bg-draft-primary hover:bg-blue-700 text-white text-xs font-medium py-0.5 xl:py-1 px-1.5 xl:px-3 rounded transition-colors"
                            >
                              Draft
                            </button>
                          </td>
                          <td className="px-0.5 sm:px-1 py-0.5 text-dark-text text-xs sm:text-[16px] xl:text-xl font-medium w-24 sm:w-32 xl:w-36">
                            <div className="flex items-center gap-1">
                              <span className="truncate" title={player.name}>{player.name}</span>
                              <div className="flex items-center gap-0.5">
                                {/* Injury Badge */}
                                {player.injuryStatus && player.injuryStatus !== 'Healthy' && (
                                  <span className={`text-xs xl:text-base px-0.5 py-0 rounded font-bold cursor-help ${
                                    player.injuryStatus === 'Questionable' ? 'bg-yellow-500/20 text-yellow-400' :
                                    player.injuryStatus === 'Doubtful' ? 'bg-orange-500/20 text-orange-400' :
                                    player.injuryStatus === 'Out' || player.injuryStatus === 'IR' ? 'bg-red-500/20 text-red-400' :
                                    player.injuryStatus === 'PUP' ? 'bg-purple-500/20 text-purple-400' :
                                    player.injuryStatus === 'Suspended' ? 'bg-gray-500/20 text-gray-400' :
                                    'bg-gray-500/20 text-gray-400'
                                  }`} title={`${player.injuryStatus}${player.injuryNotes ? `: ${player.injuryNotes}` : ''}${player.injuryBodyPart ? ` (${player.injuryBodyPart})` : ''}${player.practiceDescription ? ` - ${player.practiceDescription}` : ''}`}>
                                    {player.injuryStatus === 'Questionable' ? 'Q' :
                                     player.injuryStatus === 'Doubtful' ? 'D' :
                                     player.injuryStatus === 'Out' ? 'O' :
                                     player.injuryStatus === 'IR' ? 'IR' :
                                     player.injuryStatus === 'PUP' ? 'PUP' :
                                     player.injuryStatus === 'Suspended' ? 'SUS' : '?'}
                                    {player.injuryNotes && '*'}
                                  </span>
                                )}
                                
                                {/* Trending Badge - Adjusted thresholds */}
                                {player.trending && player.trending > 500 && (
                                  <span 
                                    className={`text-sm xl:text-base px-0.5 py-0 rounded font-bold cursor-help ${
                                      player.trending > 3000 ? 'bg-red-600/20 text-red-400' :
                                      player.trending > 1500 ? 'bg-orange-600/20 text-orange-400' :
                                      'bg-yellow-600/20 text-yellow-400'
                                    }`}
                                    title={`Trending: ${player.trending.toLocaleString()} adds/drops recently`}
                                  >
                                    {player.trending > 3000 ? '🔥' : player.trending > 1500 ? '📈' : '⬆️'}
                                  </span>
                                )}
                                {/* Sleeper Badge (Late round value - ADP > 100 with good projections) */}
                                {player.adp > 100 && player.adp < 200 && player.projectedPoints > 120 && (
                                  <span className="text-sm xl:text-base px-0.5 py-0 bg-green-500/20 text-green-400 rounded font-bold cursor-help" title="Sleeper Pick - ADP 100-200 with 120+ projected points">💎</span>
                                )}
                                {/* Bust Risk Badge (High ADP but low projected points relative to position - 20th percentile) */}
                                {player.adp < 50 && player.adp > 0 && (
                                  (player.position === 'RB' && player.projectedPoints < 215) ||
                                  (player.position === 'WR' && player.projectedPoints < 230) ||
                                  (player.position === 'QB' && player.projectedPoints < 300) ||
                                  (player.position === 'TE' && player.projectedPoints < 195)
                                ) && (
                                  <span className="text-sm xl:text-base px-0.5 py-0 bg-red-500/20 text-red-400 rounded font-bold cursor-help" title="Bust Risk - ADP < 50 with low points (RB<215, WR<230, QB<300, TE<195)">⚠</span>
                                )}
                                {/* PPR Stud Badge (75+ receptions) */}
                                {(player.receptions || 0) >= 75 && (
                                  <span className="text-sm xl:text-base px-0.5 py-0 bg-blue-500/20 text-blue-400 rounded font-bold cursor-help" title="PPR Stud - 75+ projected receptions (valuable in PPR leagues)">PPR</span>
                                )}
                                {/* Value Badge (Good points for late ADP) */}
                                {player.adp > 36 && player.adp < 150 && (
                                  (player.position === 'QB' && player.projectedPoints > 240) ||
                                  (player.position === 'RB' && player.projectedPoints > 180) ||
                                  (player.position === 'WR' && player.projectedPoints > 200) ||
                                  (player.position === 'TE' && player.projectedPoints > 140)
                                ) && (
                                  <span className="text-sm xl:text-base px-0.5 py-0 bg-emerald-500/20 text-emerald-400 rounded font-bold cursor-help" title="Value Pick - ADP > 36 with high points (QB>240, RB>180, WR>200, TE>140)">💰</span>
                                )}
                                {/* Overvalued Badge (High price but CVS doesn't justify it) */}
                                {(player.auctionValue ?? 0) >= 10 && (
                                  // Very lenient: CVS should be at least 2.5x the auction price
                                  // For $10: CVS 25+, $20: CVS 50+, $30: CVS 75+
                                  player.cvsScore < ((player.auctionValue ?? 0) * 2.5)
                                ) && (
                                  <span className="text-sm xl:text-base px-0.5 py-0 bg-red-600/20 text-red-500 rounded font-bold cursor-help" 
                                        title={`Overvalued - $${player.auctionValue} price but CVS ${safeToFixed(player.cvsScore, 0)} (expected ${Math.round((player.auctionValue ?? 0) * 2.5)}+)`}>
                                    📉
                                  </span>
                                )}
                                {/* New Badges from Canonical Data */}
                                {/* Consistent Producer */}
                                {badgeDataService.isConsistentProducer(player.name) && (
                                  <span className="text-xs xl:text-base px-0.5 py-0 bg-blue-500/20 text-blue-400 rounded font-bold cursor-help" 
                                        title="Consistent Producer - Elite consistency in 2024 (14+ games, 10+ PPG, low variance)">📊</span>
                                )}
                                {/* RZ Monster */}
                                {badgeDataService.isRedZoneMonster(player.name) && (
                                  <span className="text-xs xl:text-base px-0.5 py-0 bg-red-600/20 text-red-400 rounded font-bold cursor-help" 
                                        title="RZ Monster - Red zone dominator (25%+ RZ usage or 30+ RZ touches with 10+ TDs)">🎯</span>
                                )}
                                {/* Volume King */}
                                {badgeDataService.isVolumeKing(player.name) && (
                                  <span className="text-xs xl:text-base px-0.5 py-0 bg-purple-500/20 text-purple-400 rounded font-bold cursor-help" 
                                        title="Volume King - Top 10% in projected touches for 2025">👑</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-center px-0.5 py-0.5 w-12">
                            <span className={`text-sm font-bold px-1.5 py-0.5 rounded bg-position-${player.position.toLowerCase()} text-white`}>
                              {player.position}
                            </span>
                          </td>
                          <td className="text-center px-0.5 py-0.5 text-[10px] sm:text-[14px] xl:text-lg text-dark-text-secondary w-10 sm:w-14">{player.team}</td>
                          {featureFlags.useNewEvaluationSystem ? (
                            <>
                              {/* Intrinsic Value */}
                              <td className="text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14">
                                {(() => {
                                  const evaluation = improvedEvaluations.find(e => e.id === player.id);
                                  const value = evaluation?.intrinsicValue;
                                  if (!value) return '--';
                                  const rounded = Math.round(value);
                                  const colorClass = 
                                    rounded >= 60 ? 'text-purple-400' :
                                    rounded >= 40 ? 'text-indigo-400' :
                                    rounded >= 25 ? 'text-blue-400' :
                                    rounded >= 15 ? 'text-cyan-400' :
                                    rounded >= 8 ? 'text-teal-400' :
                                    rounded >= 3 ? 'text-green-400' :
                                    rounded >= 1 ? 'text-lime-400' :
                                    'text-gray-500';
                                  return <span className={colorClass}>${rounded}</span>;
                                })()}
                              </td>
                              {/* Market Price */}
                              <td className="text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14">
                                {(() => {
                                  const evaluation = improvedEvaluations.find(e => e.id === player.id);
                                  const price = evaluation?.marketPrice;
                                  if (!price) return '--';
                                  const rounded = Math.round(price);
                                  const colorClass = 
                                    rounded >= 60 ? 'text-red-400' :
                                    rounded >= 40 ? 'text-orange-400' :
                                    rounded >= 25 ? 'text-amber-400' :
                                    rounded >= 15 ? 'text-yellow-400' :
                                    rounded >= 8 ? 'text-yellow-500' :
                                    rounded >= 3 ? 'text-lime-500' :
                                    rounded >= 1 ? 'text-green-500' :
                                    'text-gray-500';
                                  return <span className={colorClass}>${rounded}</span>;
                                })()}
                              </td>
                              {/* AAV */}
                              <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-12 sm:w-16 ${
                                (player.auctionValue || 0) >= 60 ? 'text-pink-400' :
                                (player.auctionValue || 0) >= 40 ? 'text-purple-400' :
                                (player.auctionValue || 0) >= 25 ? 'text-indigo-400' :
                                (player.auctionValue || 0) >= 15 ? 'text-blue-400' :
                                (player.auctionValue || 0) >= 8 ? 'text-cyan-400' :
                                (player.auctionValue || 0) >= 3 ? 'text-teal-400' :
                                (player.auctionValue || 0) >= 1 ? 'text-green-400' :
                                'text-gray-500'
                              }`}>{player.auctionValue && player.auctionValue > 0 ? `$${Math.round(player.auctionValue)}` : 'N/A'}</td>
                              {/* Edge */}
                              <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14`}>
                                {(() => {
                                  const evaluation = improvedEvaluations.find(e => e.id === player.id);
                                  if (!evaluation?.edge) return '--';
                                  const edge = evaluation.edge;
                                  const color = edge >= 5 ? 'text-green-500' :
                                               edge >= 2 ? 'text-green-400' :
                                               edge <= -5 ? 'text-red-500' :
                                               edge <= -2 ? 'text-orange-400' :
                                               'text-gray-400';
                                  return <span className={color}>{edge > 0 ? '+' : ''}{Math.round(edge)}</span>;
                                })()}
                              </td>
                              {/* Edge % */}
                              <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14`}>
                                {(() => {
                                  const evaluation = improvedEvaluations.find(e => e.id === player.id);
                                  if (!evaluation?.edgePercent) return '--';
                                  const edgePercent = evaluation.edgePercent;
                                  const color = edgePercent >= 20 ? 'text-green-500' :
                                               edgePercent >= 10 ? 'text-green-400' :
                                               edgePercent <= -20 ? 'text-red-500' :
                                               edgePercent <= -10 ? 'text-orange-400' :
                                               'text-gray-400';
                                  return <span className={color}>{edgePercent > 0 ? '+' : ''}{Math.round(edgePercent)}%</span>;
                                })()}
                              </td>
                              {/* Confidence */}
                              <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-8 sm:w-12`}>
                                {(() => {
                                  const edgeData = getPlayerEdge(player.id);
                                  if (!edgeData?.confidence) return '--';
                                  const confidence = edgeData.confidence * 100;
                                  const color = confidence >= 80 ? 'text-green-400' :
                                               confidence >= 60 ? 'text-yellow-400' :
                                               confidence >= 40 ? 'text-orange-400' :
                                               'text-red-400';
                                  return <span className={color}>{Math.round(confidence)}%</span>;
                                })()}
                              </td>
                              {/* CWE */}
                              <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14`}>
                                {(() => {
                                  const edgeData = getPlayerEdge(player.id);
                                  if (!edgeData?.confidenceWeightedEdge) return '--';
                                  const cwe = edgeData.confidenceWeightedEdge;
                                  const color = cwe >= 5 ? 'text-purple-500' :
                                               cwe >= 2 ? 'text-purple-400' :
                                               cwe <= -5 ? 'text-red-500' :
                                               cwe <= -2 ? 'text-orange-400' :
                                               'text-gray-400';
                                  return <span className={color}>{cwe > 0 ? '+' : ''}{safeToFixed(cwe, 0)}</span>;
                                })()}
                              </td>
                              {/* ADP */}
                              <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14 ${
                                player.adp <= 12 ? 'text-green-400' :
                                player.adp <= 24 ? 'text-lime-400' :
                                player.adp <= 36 ? 'text-yellow-400' :
                                player.adp <= 60 ? 'text-amber-400' :
                                player.adp <= 84 ? 'text-orange-400' :
                                player.adp <= 120 ? 'text-red-400' :
                                player.adp <= 156 ? 'text-red-500' :
                                player.adp <= 192 ? 'text-red-600' :
                                'text-gray-500'
                              }`}>
                                <span title={`Raw: ${player.adp}, Formatted: ${safeRound(Number(player.adp))}`}>
                                  {safeRound(Number(player.adp))}
                                </span>
                              </td>
                            </>
                          ) : (
                            <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14 ${
                              player.cvsScore >= 90 ? 'text-emerald-400' :
                              player.cvsScore >= 80 ? 'text-green-500' : 
                              player.cvsScore >= 70 ? 'text-lime-500' :
                              player.cvsScore >= 60 ? 'text-yellow-500' :
                              player.cvsScore >= 50 ? 'text-amber-500' :
                              player.cvsScore >= 40 ? 'text-orange-500' :
                              player.cvsScore >= 30 ? 'text-red-500' :
                              'text-gray-500'
                            }`}>{isNaN(player.cvsScore) ? 'N/A' : safeToFixed(player.cvsScore, 0)}</td>
                          )}
                          <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14 ${
                            player.projectedPoints >= 300 ? 'text-purple-400' :
                            player.projectedPoints >= 250 ? 'text-indigo-400' :
                            player.projectedPoints >= 200 ? 'text-blue-400' :
                            player.projectedPoints >= 150 ? 'text-cyan-400' :
                            player.projectedPoints >= 100 ? 'text-teal-400' :
                            player.projectedPoints >= 75 ? 'text-green-400' :
                            player.projectedPoints >= 50 ? 'text-lime-400' :
                            'text-gray-500'
                          }`}>{Math.round(player.projectedPoints)}</td>
                          <td className={`text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono w-10 sm:w-14 ${
                            (player.receptions || 0) >= 80 ? 'text-purple-400' :
                            (player.receptions || 0) >= 60 ? 'text-blue-400' :
                            (player.receptions || 0) >= 40 ? 'text-cyan-400' :
                            (player.receptions || 0) >= 20 ? 'text-teal-400' :
                            (player.receptions || 0) >= 10 ? 'text-gray-400' :
                            'text-gray-600'
                          }`}>+{Math.round(player.receptions || 0)}</td>
                          <td className="text-center px-0.5 py-0.5 text-[10px] sm:text-[13px] xl:text-lg font-mono text-dark-text-secondary w-8 sm:w-12">
                            <span className={`${
                              player.byeWeek === 5 || player.byeWeek === 6 || player.byeWeek === 7 || player.byeWeek === 9 ? 'text-orange-400' :
                              player.byeWeek === 10 || player.byeWeek === 11 || player.byeWeek === 12 || player.byeWeek === 14 ? 'text-yellow-400' :
                              'text-dark-text-secondary'
                            }`}>
                              {player.byeWeek || player.bye || '-'}
                            </span>
                          </td>
                          <td className="text-center px-0.5 py-0.5 w-12">
                            <div className="flex justify-center items-center">
                              {player.sos !== undefined && player.sos !== null ? (
                                <div className={`w-8 xl:w-10 h-5 xl:h-6 rounded text-[11px] xl:text-base font-mono flex items-center justify-center ${
                                player.sos <= 2 ? 'bg-green-500/30 text-green-400' :
                                player.sos <= 4 ? 'bg-green-500/20 text-green-400' :
                                player.sos <= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                player.sos <= 8 ? 'bg-orange-500/20 text-orange-400' :
                                'bg-red-500/30 text-red-400'
                              }`}>
                                {safeToFixed(player.sos, 0)}
                                </div>
                              ) : (
                                <span className="text-gray-600">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </DualScrollTable>
                  {sortedPlayers.length > displayCount && (
                    <div className="p-4 xl:p-7 border-t border-dark-border">
                      <button
                        onClick={() => setDisplayCount(prev => prev + 20)}
                        className="w-full bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text text-xs xl:text-base font-medium py-1.5 px-3 rounded-lg transition-colors"
                      >
                        Show More ({sortedPlayers.length - displayCount} remaining)
                      </button>
                    </div>
                  )}
                  {displayCount > 30 && (
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => setDisplayCount(30)}
                        className="text-xs text-dark-text-secondary hover:text-dark-text"
                      >
                        Show Less
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Sidebar - Auction Analytics & Team Budgets */}
            <div className="col-span-12 lg:col-span-3 xl:col-span-2 space-y-4 order-3 lg:order-3">
              {/* Critical Moments & Position Scarcity - Combined */}
              <CriticalMoments 
                moments={dashboardData.criticalMoments} 
                scarcity={dashboardData.positionScarcity} 
              />
              
              {/* Draft History - Recent Picks */}
              {draftHistory.length > 0 && (
                <div className="bg-gray-800 rounded-md p-3 xl:p-5 border border-gray-600">
                  <DraftHistory />
                </div>
              )}
              
              {/* Team Budgets */}
              <div className="bg-gray-800 rounded-md p-3 xl:p-5 border border-gray-600">
                <h3 className="text-base xl:text-lg font-semibold text-dark-text mb-3 xl:mb-5">
                  The Competition
                </h3>
                
                {/* Team Budget List */}
                <div className="space-y-2 max-h-[1400px] overflow-y-auto">
                  {teams.filter(team => team.id !== 'my-team').map((team, idx) => {
                    const spent = team.spentBudget || 0;
                    const remaining = team.budget - spent;
                    const rosterSize = team.roster.length;
                    const maxRoster = 16;
                    const spotsLeft = maxRoster - rosterSize;
                    const avgPerSpot = spotsLeft > 0 ? remaining / spotsLeft : 0;
                    
                    return (
                      <div key={`${team.id}-${team.spentBudget}-${team.roster.length}`} className="p-3 rounded-lg border border-dark-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1">
                            {editingTeamId === team.id ? (
                              <div className="flex items-center gap-1 flex-1">
                                <input
                                  type="text"
                                  value={tempTeamName}
                                  onChange={(e) => setTempTeamName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      setCustomTeamNames(prev => ({ ...prev, [team.id]: tempTeamName }));
                                      setEditingTeamId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingTeamId(null);
                                    }
                                  }}
                                  className="flex-1 max-w-[100px] px-1 py-0.5 bg-dark-bg text-dark-text text-xs rounded border border-dark-border focus:border-draft-primary focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  onClick={() => {
                                    setCustomTeamNames(prev => ({ ...prev, [team.id]: tempTeamName }));
                                    setEditingTeamId(null);
                                  }}
                                  className="text-green-400 hover:text-green-300"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setEditingTeamId(null)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span 
                                  className="text-sm font-semibold text-dark-text cursor-help"
                                  title={team.roster.length > 0 
                                    ? `Roster (${team.roster.length}):\n${team.roster.map(p => 
                                        `• ${p.name} (${p.position}) - $${(p as any).purchasePrice || p.auctionValue || 1}`
                                      ).join('\n')}`
                                    : 'No players drafted yet'
                                  }
                                >
                                  {getTeamDisplayName(team, idx)}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingTeamId(team.id);
                                    setTempTeamName(getTeamDisplayName(team, idx));
                                  }}
                                  className="text-gray-400 hover:text-draft-primary"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                          <span className="text-[10px] xl:text-sm text-dark-text-secondary">
                            {rosterSize}/{maxRoster}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] xl:text-sm">
                            <span className="text-dark-text-secondary">Budget Remaining</span>
                            <span className={`font-bold ${
                              remaining > 140 ? 'text-green-400' :
                              remaining > 50 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              ${remaining}
                            </span>
                          </div>
                          
                          
                          {/* Budget Bar */}
                          <div className="w-full bg-gray-900 rounded-full h-2 mt-2 overflow-hidden">
                            <div 
                              className="h-full transition-all duration-500 bg-gradient-to-r from-green-600 to-green-400"
                              style={{ width: `${Math.min(100, (remaining / 200) * 100)}%` }}
                            />
                          </div>
                        </div>
                        
                        {/* Recent Picks */}
                        {team.roster.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-dark-border">
                            <div className="text-[10px] xl:text-sm text-dark-text-secondary mb-1">Recent:</div>
                            {team.roster.slice(-2).reverse().map((player, i) => (
                              <div key={i} className="text-[10px] xl:text-sm text-dark-text">
                                • {player.name} ({player.position}) ${(player as any).purchasePrice || player.auctionValue || 1}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      }
      
      {/* Dashboard Pop-out Window - Now opens in separate window */}

      {/* Player Detail Modal */}
      <AnimatePresence>
        {selectedPlayerDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedPlayerDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-dark-bg-secondary rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-dark-border"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl xl:text-4xl font-bold text-dark-text mb-4">{selectedPlayerDetail.name}</h2>
              <p className="text-dark-text-secondary mb-4">{selectedPlayerDetail.team} • {selectedPlayerDetail.position}</p>
              
              {/* Detailed stats would go here */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-bg rounded-lg p-4">
                  <p className="text-sm text-dark-text-secondary mb-1">Projected Points</p>
                  <p className="text-2xl xl:text-4xl font-bold text-dark-text">{Math.round(selectedPlayerDetail.projectedPoints)}</p>
                </div>
                <div className="bg-dark-bg rounded-lg p-4">
                  <p className="text-sm text-dark-text-secondary mb-1">CVS Score</p>
                  <p className="text-2xl xl:text-4xl font-bold text-dark-text">{isNaN(selectedPlayerDetail.cvsScore) ? 'N/A' : Math.round(selectedPlayerDetail.cvsScore)}</p>
                </div>
              </div>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    handleDraftPlayer(selectedPlayerDetail);
                    setSelectedPlayerDetail(null);
                  }}
                  className="flex-1 bg-draft-primary hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Draft Player
                </button>
                <button
                  onClick={() => setSelectedPlayerDetail(null)}
                  className="flex-1 bg-dark-bg-tertiary hover:bg-gray-700 text-dark-text font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Draft Price Input Modal - Draggable */}
      <AnimatePresence>
        {draftPriceModal.show && draftPriceModal.player && (
          <DraggableModal
            onClose={() => setDraftPriceModal({ player: null, show: false, price: 0, selectedTeamId: 'my-team' })}
            title="Draft Player"
          >
            <div className="p-3">
              {/* Header with Player Name and Position */}
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-bold text-dark-text">
                  {draftPriceModal.player.name}
                </h2>
                <span className={`px-0.5 py-0 rounded text-sm xl:text-base font-bold bg-position-${draftPriceModal.player.position.toLowerCase()} text-white`}>
                  {draftPriceModal.player.position}
                </span>
                <span className="text-xs text-dark-text-secondary">
                  {draftPriceModal.player.team}
                </span>
              </div>

              {/* Player Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Left Column - Key Metrics */}
                <div className="space-y-2">
                  {/* CVS Score with Visual Bar */}
                  <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] xl:text-sm text-dark-text-secondary">CVS Score</span>
                      <span className={`text-sm font-bold ${
                        draftPriceModal.player.cvsScore >= 80 ? 'text-green-400' :
                        draftPriceModal.player.cvsScore >= 60 ? 'text-yellow-400' :
                        draftPriceModal.player.cvsScore >= 40 ? 'text-orange-400' :
                        'text-red-400'
                      }`}>
                        {Math.round(draftPriceModal.player.cvsScore)}
                      </span>
                    </div>
                    <div className="w-full bg-dark-bg-tertiary rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full ${
                          draftPriceModal.player.cvsScore >= 80 ? 'bg-green-400' :
                          draftPriceModal.player.cvsScore >= 60 ? 'bg-yellow-400' :
                          draftPriceModal.player.cvsScore >= 40 ? 'bg-orange-400' :
                          'bg-red-400'
                        }`}
                        style={{ width: `${Math.min(100, draftPriceModal.player.cvsScore)}%` }}
                      />
                    </div>
                  </div>

                  {/* Projected Points */}
                  <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] xl:text-sm text-dark-text-secondary">Projected Points</span>
                      <span className="text-sm font-bold text-dark-text">
                        {Math.round(draftPriceModal.player.projectedPoints)}
                      </span>
                    </div>
                  </div>

                  {/* Simple PPR Stats */}
                  {(draftPriceModal.player.receptions ?? 0) > 0 && (
                    <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[10px] xl:text-sm text-dark-text-secondary">Receptions</span>
                          <span className="text-xs font-bold text-purple-400">
                            {Math.round(draftPriceModal.player.receptions ?? 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[10px] xl:text-sm text-dark-text-secondary">PPR Bonus</span>
                          <span className="text-xs font-bold text-purple-400">
                            +{Math.round(draftPriceModal.player.receptions ?? 0)} pts
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Physical Stats */}
                  {(draftPriceModal.player.height || draftPriceModal.player.weight) && (
                    <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                      <div className="grid grid-cols-2 gap-2">
                        {draftPriceModal.player.height && (
                          <div>
                            <div className="text-[10px] xl:text-sm text-dark-text-secondary">Height</div>
                            <div className="text-sm font-bold text-dark-text">
                              {Math.floor(Number(draftPriceModal.player.height) / 12)}'{Number(draftPriceModal.player.height) % 12}"
                            </div>
                          </div>
                        )}
                        {draftPriceModal.player.weight && (
                          <div>
                            <div className="text-[10px] xl:text-sm text-dark-text-secondary">Weight</div>
                            <div className="text-sm font-bold text-dark-text">
                              {draftPriceModal.player.weight} lbs
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column - Additional Info */}
                <div className="space-y-2">
                  {/* Auction Value */}
                  <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] xl:text-sm text-dark-text-secondary">Auction Value</span>
                      <span className="text-sm font-bold text-green-400">
                        ${draftPriceModal.player.auctionValue || 0}
                      </span>
                    </div>
                  </div>

                  {/* ADP and Round */}
                  <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] xl:text-sm text-dark-text-secondary">ADP</span>
                      <span className="text-sm font-bold text-blue-400">
                        {draftPriceModal.player.adp ? safeToFixed(draftPriceModal.player.adp, 1) : 'N/A'}
                      </span>
                    </div>
                    <div className="text-[10px] xl:text-sm text-dark-text-secondary">
                      Round: {getAdpRoundRange(draftPriceModal.player.adp)}
                    </div>
                  </div>

                  {/* Age and Experience */}
                  <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] xl:text-sm text-dark-text-secondary">Age</div>
                        <div className="text-sm font-bold text-dark-text">
                          {draftPriceModal.player.age || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] xl:text-sm text-dark-text-secondary">Experience</div>
                        <div className="text-sm font-bold text-dark-text">
                          {draftPriceModal.player.experience || 0} yrs
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bye Week */}
                  <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] xl:text-sm text-dark-text-secondary">Bye Week</span>
                      <span className="text-sm font-bold text-white">
                        Week {draftPriceModal.player.byeWeek || draftPriceModal.player.bye || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Depth Chart */}
                  {(draftPriceModal.player.depthChartPosition || draftPriceModal.player.depthChartOrder) && (
                    <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] xl:text-sm text-dark-text-secondary">Depth Chart</span>
                        <span className={`text-sm font-bold ${
                          draftPriceModal.player.depthChartOrder === 1 ? 'text-green-400' :
                          draftPriceModal.player.depthChartOrder === 2 ? 'text-yellow-400' :
                          draftPriceModal.player.depthChartOrder === 3 ? 'text-orange-400' :
                          'text-red-400'
                        }`}>
                          {draftPriceModal.player.depthChartPosition || draftPriceModal.player.position}
                          {draftPriceModal.player.depthChartOrder ? ` (${
                            draftPriceModal.player.depthChartOrder === 1 ? 'Starter' :
                            draftPriceModal.player.depthChartOrder === 2 ? 'Backup' :
                            `#${draftPriceModal.player.depthChartOrder}`
                          })` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1 mb-3">
                {/* PPR Stud badge */}
                {(draftPriceModal.player.receptions || 0) >= 75 && (
                  <span className="px-0.5 py-0 bg-purple-500/20 text-purple-400 rounded text-sm xl:text-base font-bold">
                    📈 PPR Stud
                  </span>
                )}
                
                {/* Trending Badge */}
                {draftPriceModal.player.trending && draftPriceModal.player.trending > 1000 && (
                  <span 
                    className={`px-0.5 py-0 rounded text-sm xl:text-base font-bold cursor-help ${
                      draftPriceModal.player.trending > 5000 ? 'bg-red-600/20 text-red-400' :
                      draftPriceModal.player.trending > 2500 ? 'bg-orange-600/20 text-orange-400' :
                      'bg-yellow-600/20 text-yellow-400'
                    }`}
                    title={`Trending: ${draftPriceModal.player.trending.toLocaleString()} adds/drops recently`}
                  >
                    {draftPriceModal.player.trending > 5000 ? '🔥 Hot' : 
                     draftPriceModal.player.trending > 2500 ? '📈 Trending' : '⬆️ Rising'}
                  </span>
                )}
                
                {/* Consistent Producer badge */}
                {badgeDataService.isConsistentProducer(draftPriceModal.player.name) && (
                  <span className="px-0.5 py-0 bg-blue-500/20 text-blue-400 rounded text-sm xl:text-base font-bold">
                    📊 Consistent Producer
                  </span>
                )}
                
                {/* RZ Monster badge */}
                {badgeDataService.isRedZoneMonster(draftPriceModal.player.name) && (
                  <span className="px-0.5 py-0 bg-red-600/20 text-red-400 rounded text-sm xl:text-base font-bold">
                    🎯 RZ Monster
                  </span>
                )}
                
                {/* Volume King badge */}
                {badgeDataService.isVolumeKing(draftPriceModal.player.name) && (
                  <span className="px-0.5 py-0 bg-purple-500/20 text-purple-400 rounded text-sm xl:text-base font-bold">
                    👑 Volume King
                  </span>
                )}

                {/* Value badge */}
                {draftPriceModal.player.cvsScore > 60 && (draftPriceModal.player.auctionValue || 0) < 20 && (
                  <span className="px-0.5 py-0 bg-green-500/20 text-green-400 rounded text-sm xl:text-base font-bold">
                    💎 Value Pick
                  </span>
                )}

                {/* Sleeper badge */}
                {draftPriceModal.player.adp >= 100 && draftPriceModal.player.adp <= 200 && draftPriceModal.player.projectedPoints >= 120 && (
                  <span className="px-0.5 py-0 bg-indigo-500/20 text-indigo-400 rounded text-sm xl:text-base font-bold">
                    😴 Sleeper
                  </span>
                )}
              </div>

              {/* Advanced Stats Section */}
              {(draftPriceModal.player.position === 'RB' || draftPriceModal.player.position === 'WR' || draftPriceModal.player.position === 'TE') && (
                <div className="mb-3">
                  <h3 className="text-xs font-semibold text-dark-text mb-2">PPR Performance</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Opportunity Score */}
                    <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                      <div className="text-[10px] xl:text-sm text-dark-text-secondary mb-1">Opportunity Score</div>
                      <div className="text-sm font-bold text-cyan-400">
                        {(() => {
                          const touches = (draftPriceModal.player.rushAttempts || 0) + (draftPriceModal.player.receptions || 0);
                          const totalYards = (draftPriceModal.player.rushYards || 0) + (draftPriceModal.player.receivingYards || 0);
                          const opportunityScore = touches > 0 ? Math.round((touches * 2 + totalYards * 0.1) / 3) : 0;
                          return opportunityScore;
                        })()}
                      </div>
                      <div className="text-sm xl:text-base text-dark-text-secondary">
                        {Math.round((draftPriceModal.player.rushAttempts || 0) + (draftPriceModal.player.receptions || 0))} touches
                      </div>
                    </div>

                    {/* Target Share */}
                    {(draftPriceModal.player.targets ?? 0) > 0 && (
                      <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                        <div className="text-[10px] xl:text-sm text-dark-text-secondary mb-1">Target Share</div>
                        <div className="text-sm font-bold text-purple-400">
                          {Math.round(((draftPriceModal.player.targets ?? 0) / 550) * 100)}%
                        </div>
                        <div className="text-sm xl:text-base text-dark-text-secondary">
                          {Math.round(draftPriceModal.player.targets || 0)} targets
                        </div>
                      </div>
                    )}

                    {/* Catch Rate */}
                    {(draftPriceModal.player.targets ?? 0) > 0 && (
                      <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                        <div className="text-[10px] xl:text-sm text-dark-text-secondary mb-1">Catch Rate</div>
                        <div className="text-sm font-bold text-green-400">
                          {Math.round(((draftPriceModal.player.receptions ?? 0) / (draftPriceModal.player.targets ?? 1)) * 100)}%
                        </div>
                        <div className="text-sm xl:text-base text-dark-text-secondary">
                          {Math.round(draftPriceModal.player.receptions || 0)}/{Math.round(draftPriceModal.player.targets || 0)}
                        </div>
                      </div>
                    )}

                    {/* TD Rate */}
                    <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                      <div className="text-[10px] xl:text-sm text-dark-text-secondary mb-1">TD Rate</div>
                      <div className="text-sm font-bold text-red-400">
                        {(() => {
                          const totalTDs = (draftPriceModal.player.rushTDs || 0) + (draftPriceModal.player.receivingTDs || 0);
                          const touches = (draftPriceModal.player.rushAttempts || 0) + (draftPriceModal.player.receptions || 0);
                          return touches > 0 ? Math.round((totalTDs / touches) * 100) : 0;
                        })()}%
                      </div>
                      <div className="text-sm xl:text-base text-dark-text-secondary">
                        {Math.round((draftPriceModal.player.rushTDs || 0) + (draftPriceModal.player.receivingTDs || 0))} TDs
                      </div>
                    </div>

                    {/* YPC/YPR */}
                    {draftPriceModal.player.position === 'RB' && (draftPriceModal.player.rushAttempts ?? 0) > 0 && (
                      <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                        <div className="text-[10px] xl:text-sm text-dark-text-secondary mb-1">Yards/Carry</div>
                        <div className="text-sm font-bold text-blue-400">
                          {Math.round((draftPriceModal.player.rushYards ?? 0) / (draftPriceModal.player.rushAttempts ?? 1))}
                        </div>
                        <div className="text-sm xl:text-base text-dark-text-secondary">
                          {Math.round(draftPriceModal.player.rushYards || 0)} yards
                        </div>
                      </div>
                    )}

                    {(draftPriceModal.player.position === 'WR' || draftPriceModal.player.position === 'TE') && (draftPriceModal.player.receptions ?? 0) > 0 && (
                      <div className="bg-dark-bg rounded-lg p-2 border border-dark-border">
                        <div className="text-[10px] xl:text-sm text-dark-text-secondary mb-1">Yards/Rec</div>
                        <div className="text-sm font-bold text-blue-400">
                          {Math.round((draftPriceModal.player.receivingYards ?? 0) / (draftPriceModal.player.receptions ?? 1))}
                        </div>
                        <div className="text-sm xl:text-base text-dark-text-secondary">
                          {Math.round(draftPriceModal.player.receivingYards || 0)} yards
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Price Input Section */}
              <div className="space-y-3">
                {/* Team Selection Dropdown */}
                <div className="bg-dark-bg rounded-lg p-2 border border-draft-primary/30">
                  <select
                    value={draftPriceModal.selectedTeamId}
                    onChange={(e) => setDraftPriceModal(prev => ({ 
                      ...prev, 
                      selectedTeamId: e.target.value
                    }))}
                    className="w-full bg-dark-bg-tertiary text-dark-text text-xs px-2 py-1 rounded border border-dark-border focus:border-draft-primary focus:outline-none cursor-pointer"
                  >
                    {teams.map((team, idx) => (
                      <option key={team.id} value={team.id} className="bg-dark-bg-tertiary text-dark-text text-xs">
                        {getTeamDisplayName(team, idx)} (${team.budget - team.spentBudget} remaining)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-dark-text-secondary mb-1">
                    Enter Draft Price (Market Value: ${draftPriceModal.player.auctionValue || 0})
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-dark-text">$</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={draftPriceModal.price}
                      onChange={(e) => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.max(0, Math.min(200, parseInt(e.target.value) || 0))
                      }))}
                      className="flex-1 bg-dark-bg text-dark-text px-2 py-0.5 rounded border border-dark-border focus:border-draft-primary focus:outline-none text-sm font-bold"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          confirmDraft();
                        } else if (e.key === 'Escape') {
                          setDraftPriceModal({ player: null, show: false, price: 0, selectedTeamId: 'my-team' });
                        }
                      }}
                    />
                  </div>
                  
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.max(0, prev.price - 1)
                      }))}
                      className="px-1.5 py-0.5 bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text text-[10px] xl:text-sm rounded border border-dark-border transition-colors"
                    >
                      -$1
                    </button>
                    <button
                      onClick={() => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.min(200, prev.price + 1)
                      }))}
                      className="px-1.5 py-0.5 bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text text-[10px] xl:text-sm rounded border border-dark-border transition-colors"
                    >
                      +$1
                    </button>
                    <button
                      onClick={() => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.max(0, prev.price - 5)
                      }))}
                      className="px-1.5 py-0.5 bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text text-[10px] xl:text-sm rounded border border-dark-border transition-colors"
                    >
                      -$5
                    </button>
                    <button
                      onClick={() => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.min(200, prev.price + 5)
                      }))}
                      className="px-1.5 py-0.5 bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text text-[10px] xl:text-sm rounded border border-dark-border transition-colors"
                    >
                      +$5
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setDraftPriceModal({ player: null, show: false, price: 0, selectedTeamId: 'my-team' })}
                  className="flex-1 bg-dark-bg-tertiary hover:bg-gray-700 text-dark-text text-[10px] xl:text-sm font-medium py-0.5 px-1.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDraft}
                  className="flex-1 bg-draft-primary hover:bg-green-600 text-white text-[10px] xl:text-sm font-medium py-0.5 px-1.5 rounded-lg transition-colors"
                >
                  Draft for ${draftPriceModal.price}
                </button>
              </div>
            </div>
          </DraggableModal>
        )}
      </AnimatePresence>

      {/* Data Quality Modal - DISABLED FOR PERFORMANCE
      Validation features commented out to improve load time
      Code removed due to nested comment parsing issues */}

      {/* Methodology Documentation - Now opens in new window */}

      {/* Settings Modal - DISABLED: Using standard 12-team PPR ESPN auction settings
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="max-w-4xl w-full mx-4">
            <EvaluationSettings 
              onClose={() => setShowSettings(false)}
              onSettingsChange={() => {
                // Trigger re-evaluation when settings change
                window.location.reload(); // Simple reload for now
              }}
            />
          </div>
        </div>
      )}
      */}

      {/* Player Comparison Modal - Draggable */}
      {showComparisonModal && (
        <DraggableModal
          onClose={() => {
            setShowComparisonModal(false);
            setSelectedForComparison(new Set());
          }}
          title="Player Comparison"
        >
          <DarkPlayerComparison
            players={extendedPlayers.filter(p => selectedForComparison.has(p.id))}
            onClose={() => {
              setShowComparisonModal(false);
              setSelectedForComparison(new Set());
            }}
            onRemovePlayer={(playerId) => {
              const newSelection = new Set(selectedForComparison);
              newSelection.delete(playerId);
              setSelectedForComparison(newSelection);
              if (newSelection.size < 2) {
                setShowComparisonModal(false);
              }
            }}
            isEmbedded={true}
          />
        </DraggableModal>
      )}

      {/* Methodology Modal */}
      {showMethodology && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
            <MethodologyDocs onClose={() => setShowMethodology(false)} />
          </div>
        </div>
      )}

    </div>
  );
  } catch (error) {
    console.error('Render error:', error);
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl text-red-500 mb-4">Error Loading Application</h1>
          <p className="text-dark-text mb-2">An error occurred while rendering the application.</p>
          <p className="text-dark-text-secondary text-sm mb-4">Error: {error?.message || String(error)}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}

export default App;