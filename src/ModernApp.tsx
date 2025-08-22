import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu } from '@headlessui/react';
import { 
  Trophy, 
  Users, 
  Database, 
  TrendingUp, 
  ChevronDown,
  ChevronUp,
  Grid,
  List,
  Sparkles,
  X,
  ArrowUpDown,
  DollarSign,
  Target
} from 'lucide-react';
import { useDraftStore } from './store/draftStore';
import { AdvancedPlayerCard } from './components/AdvancedPlayerCard';
import { ComprehensiveHorizontalRecommendations } from './components/ComprehensiveHorizontalRecommendations';
import { TeamCommandCenter } from './components/TeamCommandCenter';
import { SearchBar } from './components/SearchBar';
import { DarkPlayerComparison } from './components/DarkPlayerComparison';
import { ValueFinder } from './components/ValueFinder';
import { DraftHistory } from './components/DraftHistory';
import { playerDB } from './services/database';
import { improvedCanonicalService } from './services/improvedCanonicalService';
import { dynamicCVSCalculator } from './services/dynamicCVSCalculator';
import { ExtendedPlayer, pprAnalyzer } from './services/pprAnalyzer';
import { advancedMetricsService } from './services/advancedMetricsService';
import { auctionMarketTracker, MarketConditions, PositionMarket } from './services/auctionMarketTracker';
import { Player, Position } from './types';
import { dataValidator } from './services/dataValidator';
import { hallucinationDetector } from './services/hallucinationDetector';
import { dataProvenanceChecker } from './services/dataProvenanceChecker';
import { badgeDataService } from './services/badgeDataService';
import './utils/findPlayer';

type ViewMode = 'grid' | 'list';
type DraftMode = 'snake' | 'auction';

// Extend the ExtendedPlayer type for ModernApp
interface ModernExtendedPlayer extends ExtendedPlayer {
  isDrafted?: boolean;
  purchasePrice?: number;
  auctionValue?: number;
}

export function ModernApp() {
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
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [draftMode, setDraftMode] = useState<DraftMode>('auction');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPositions, setSelectedPositions] = useState<Set<Position>>(new Set());
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  const [extendedPlayers, setExtendedPlayers] = useState<ModernExtendedPlayer[]>([]);
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState<ModernExtendedPlayer | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const auctionTrackerInitialized = useRef(false);
  const [marketConditions, setMarketConditions] = useState<MarketConditions | null>(null);
  const [positionMarkets, setPositionMarkets] = useState<PositionMarket[]>([]);
  const [sortColumn, setSortColumn] = useState<'name' | 'position' | 'team' | 'cvsScore' | 'projectedPoints' | 'receptions' | 'auctionValue' | 'adp' | 'round' | 'age' | 'sos'>('cvsScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [displayCount, setDisplayCount] = useState(75);
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set());
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [showTeamCommandCenter, setShowTeamCommandCenter] = useState(false);
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
  const [dataQualityIssues, setDataQualityIssues] = useState<{ 
    errors: number, 
    warnings: number, 
    hallucinations: number,
    legitimacy: boolean 
  }>({ errors: 0, warnings: 0, hallucinations: 0, legitimacy: true });
  const [validationResults, setValidationResults] = useState<string>('');

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
    initializeApp();
    
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
  
  // Check data quality issues
  useEffect(() => {
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
  }, [extendedPlayers]);


  // Update auction tracker when players are drafted
  useEffect(() => {
    // Tracker is initialized in the other useEffect, this just handles draft updates
    if (draftMode === 'auction' && auctionTrackerInitialized.current && draftHistory.length > 0) {
      // No additional logic needed here as the tracker updates are handled in confirmDraft
    }
  }, [draftMode, extendedPlayers.length]);


  const initializeApp = async () => {
    setIsLoading(true);
    
    try {
      
      // Initialize draft settings and create teams
      initializeDraft({
        leagueSize: 12,
        budget: 200,
        rosterSize: 16,
        scoringType: 'PPR',
        flexPositions: ['RB', 'WR', 'TE'],
      });

      // Try to load from database first, but don't fail if it errors
      let loadedPlayers: Player[] = [];
      
      try {
        loadedPlayers = await playerDB.getAll();
      } catch (dbError) {
        console.warn('Database load failed, will load from canonical:', dbError);
        loadedPlayers = [];
      }
      
      if (loadedPlayers.length === 0) {
        // Force fresh load
        improvedCanonicalService.reset();
        loadedPlayers = await improvedCanonicalService.initialize();
        
        if (loadedPlayers.length === 0) {
          throw new Error('No players loaded from canonical data');
        }
      } else {
        // Still initialize canonical service for real-time updates
        improvedCanonicalService.initialize().catch(err => 
          console.warn('Failed to initialize canonical service:', err)
        );
      }
      
      // Calculate CVS scores
      loadedPlayers = dynamicCVSCalculator.calculateBulkCVS(loadedPlayers);
      
      // Extend players with PPR and advanced metrics
      const extended = loadedPlayers.map(player => {
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
      
      // Store in window for debugging
      (window as any).__players = extended;
      
      console.log('Sample extended player:', extended[0]);
      console.log('Total extended players:', extended.length);
      
      setExtendedPlayers(extended);
      
      // Initialize auction tracker if in auction mode
      // Auction tracker initialized in useEffect to prevent duplication
      
      // Save to database
      await playerDB.bulkUpsert(loadedPlayers);
      
      // Make sure the store has the same players we're using in the UI
      console.log('About to set players in store, type:', typeof extended, 'isArray:', Array.isArray(extended));
      if (extended.length > 0) {
        console.log('First extended player:', extended[0]);
      }
      setPlayers(extended);
      console.log('Set players in store:', extended.length);
    } catch (error) {
      console.error('Error initializing app:', error);
      alert('Failed to load player data. Please check canonical_data/ folder.');
      setPlayers([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync teams from store whenever draft history changes
  const prevDraftLength = useRef(draftHistory.length);
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
    
    // Get IDs of all drafted players
    const draftedPlayerIds = new Set(draftHistory.map(p => p.id));
    
    // Update extendedPlayers to reflect current draft state
    setExtendedPlayers(prev => prev.map(p => ({
      ...p,
      isDrafted: draftedPlayerIds.has(p.id),
      purchasePrice: draftHistory.find(dp => dp.id === p.id)?.purchasePrice
    })));
  }, [draftHistory.length]); // Only depend on length to avoid initial render issues

  // Filter players based on search and filters
  const filteredPlayers = extendedPlayers.filter(player => {
    const matchesSearch = searchQuery === '' || 
      player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      player.team.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Use selectedPositions if any are selected, otherwise show all
    const matchesPosition = selectedPositions.size === 0 || selectedPositions.has(player.position);
    
    const isAvailable = !showOnlyAvailable || !player.isDrafted;
    
    return matchesSearch && matchesPosition && isAvailable;
  });

  // Get available players only
  const availablePlayers = extendedPlayers.filter(p => !p.isDrafted);

  // Sort players based on current sort column and direction
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    let aVal: any;
    let bVal: any;
    
    // Special handling for round column (calculated from ADP)
    if (sortColumn === 'round') {
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
  });

  // Handle column header click
  const handleSort = (column: typeof sortColumn) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const handleDraftPlayer = async (player: ModernExtendedPlayer, teamId?: string, price?: number) => {
    // If price is provided (from AuctionWarRoom), draft directly
    if (price !== undefined) {
      await draftPlayer(player.id, teamId || 'my-team', price);
      
      // Update extended players
      setExtendedPlayers(prev => prev.map(p => 
        p.id === player.id ? { ...p, isDrafted: true, purchasePrice: price } : p
      ));
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

  const confirmDraft = async () => {
    if (draftPriceModal.player) {
      console.log('Drafting player:', draftPriceModal.player.name);
      console.log('Player ID:', draftPriceModal.player.id);
      console.log('To team:', draftPriceModal.selectedTeamId);
      console.log('For price:', draftPriceModal.price);
      console.log('Teams before draft:', teams.map(t => ({ id: t.id, spent: t.spentBudget })));
      
      try {
        // First, ensure the player exists in the store by setting window.__players as fallback
        (window as any).__players = extendedPlayers;
        (window as any).__lastDraftedPlayer = draftPriceModal.player;
        
        console.log('Attempting to draft to team:', draftPriceModal.selectedTeamId);
        console.log('Available team IDs:', teams.map(t => t.id));
        
        // Use the store's draftPlayer action
        await draftPlayer(draftPriceModal.player.id, draftPriceModal.selectedTeamId, draftPriceModal.price);
        
        // Check if draft was successful by checking if player was added to draft history
        const updatedState = useDraftStore.getState();
        const wasPlayerDrafted = draftPriceModal.player && updatedState.draftHistory.some(p => p.id === draftPriceModal.player!.id);
        
        if (wasPlayerDrafted && draftPriceModal.player) {
          // Only update extended players if draft was successful
          setExtendedPlayers(prev => prev.filter(p => p.id !== draftPriceModal.player!.id));
          console.log('Draft successful, removed player from available list');
        } else {
          console.error('Draft failed - player was not added to draft history, keeping in available list');
        }
        
        // Update auction market tracker
        if (draftMode === 'auction' && wasPlayerDrafted && draftPriceModal.player) {
          // Get the actual drafted player from draft history
          const actualDraftedPlayer = useDraftStore.getState().draftHistory.find(
            p => p.id === draftPriceModal.player!.id
          );
          if (actualDraftedPlayer) {
            auctionMarketTracker.recordDraft(actualDraftedPlayer, draftPriceModal.selectedTeamId, draftPriceModal.price);
          }
        }
        
        // Close modal
        setDraftPriceModal({ player: null, show: false, price: 0, selectedTeamId: 'my-team' });
        
        console.log('Draft completed successfully');
      } catch (error) {
        console.error('Error drafting player:', error);
        alert('Failed to draft player. Check console for details.');
      }
    }
  };

  const handlePlayerDetail = (player: ModernExtendedPlayer) => {
    setSelectedPlayerDetail(player);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-draft-primary mx-auto"></div>
          <p className="mt-4 text-dark-text">Loading draft assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen dark bg-dark-bg transition-colors duration-200">
      {/* Modern Header */}
      <header className="bg-dark-bg-secondary border-b border-dark-border sticky top-0 z-50 backdrop-blur-lg bg-opacity-90">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Trophy className="w-8 h-8 text-yellow-500" />
              <h1 className="text-base font-bold text-dark-text">NFL Fantasy Auction Draft and Roster Optimizer</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Data Quality Indicator */}
              <button
                onClick={() => setShowDataQuality(!showDataQuality)}
                className={`px-3 py-1 text-sm rounded-full font-medium transition-colors ${
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
                  <>🚫 Unverified Data</>
                ) : dataQualityIssues.hallucinations > 0 ? (
                  <>🧠 {dataQualityIssues.hallucinations} Hallucinations</>
                ) : dataQualityIssues.errors > 0 ? (
                  <>⚠️ {dataQualityIssues.errors} Data Issues</>
                ) : dataQualityIssues.warnings > 0 ? (
                  <>📊 {dataQualityIssues.warnings} Warnings</>
                ) : (
                  <>✅ Data Quality</>
                )}
              </button>
              
              {/* View Mode Selector */}
              <div className="flex items-center bg-dark-bg rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'list' ? 'bg-draft-primary text-white' : 'text-dark-text-secondary'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'grid' ? 'bg-draft-primary text-white' : 'text-dark-text-secondary'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowTeamCommandCenter(true)}
                  className="p-2 rounded-md transition-colors text-dark-text-secondary hover:bg-draft-primary hover:text-white"
                  title="Team Command Center"
                >
                  <Users className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-12 gap-4">
            {/* Left Sidebar - My Team + Smart Recommendations */}
            <div className="col-span-12 lg:col-span-3 space-y-4">
              {/* My Team Box - Above Smart Recommendations */}
              <div className="bg-dark-bg-secondary rounded-xl p-4 border border-dark-border">
                <h3 className="text-base font-semibold text-dark-text mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-draft-primary" />
                  My Team ({myTeam.roster.length}/16)
                </h3>
                
                {/* Position Requirements - One per line */}
                <div className="space-y-2 mb-4">
                  {[
                    { pos: 'QB', needed: 2 },  // 1 starter + 1 bench
                    { pos: 'RB', needed: 4 },  // 2 starters + 2 bench
                    { pos: 'WR', needed: 4 },  // 2 starters + 2 bench  
                    { pos: 'TE', needed: 2 },  // 1 starter + 1 bench
                    { pos: 'FLEX', needed: 2 }, // 1 starter (RB/WR/TE) + 1 bench
                    { pos: 'K', needed: 1 },   // 1 starter
                    { pos: 'DST', needed: 1 }  // 1 starter
                  ].map(({ pos, needed }) => {
                    let players, count;
                    if (pos === 'FLEX') {
                      // For FLEX, count only extra RB/WR/TE beyond their main requirements
                      const rbCount = myTeam.roster.filter(p => p.position === 'RB').length;
                      const wrCount = myTeam.roster.filter(p => p.position === 'WR').length;
                      const teCount = myTeam.roster.filter(p => p.position === 'TE').length;
                      const flexEligible = Math.max(0, rbCount - 4) + Math.max(0, wrCount - 4) + Math.max(0, teCount - 2);
                      count = Math.min(flexEligible, needed);
                      // Get the actual flex players (those beyond position requirements)
                      const rbs = myTeam.roster.filter(p => p.position === 'RB').slice(4);
                      const wrs = myTeam.roster.filter(p => p.position === 'WR').slice(4);
                      const tes = myTeam.roster.filter(p => p.position === 'TE').slice(2);
                      players = [...rbs, ...wrs, ...tes].slice(0, needed);
                    } else {
                      players = myTeam.roster.filter(p => p.position === pos);
                      count = players.length;
                    }
                    
                    return (
                      <div key={pos} className="border-b border-dark-border pb-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1 py-0.5 rounded text-white ${
                              pos === 'FLEX' ? 'bg-purple-600' : `bg-position-${pos.toLowerCase()}`
                            }`}>
                              {pos}
                            </span>
                            <span className={`text-xs ${
                              count < needed ? 'text-red-400' : 
                              count === needed ? 'text-yellow-400' : 
                              'text-green-400'
                            }`}>
                              {count}/{needed}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-60 bg-dark-bg-tertiary rounded-full h-5">
                              <div 
                                className={`h-5 rounded-full ${
                                  count >= needed ? 'bg-green-500' : 
                                  count > 0 ? 'bg-yellow-500' : 
                                  'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, (count / needed) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        {/* Show drafted players */}
                        {players.length > 0 && (
                          <div className="ml-8 space-y-1">
                            {players.map((player, idx) => (
                              <div key={idx} className="text-[10px] text-dark-text-secondary">
                                • {player.name} ({player.team})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Team Stats */}
                <div className="pt-2">
                  <div className="flex justify-between mb-2">
                    <span className="text-[10px] text-dark-text-secondary">Total Projected</span>
                    <span className="text-[10px] font-bold text-dark-text">
                      {Math.round(myTeam.roster.reduce((sum, p) => sum + p.projectedPoints, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-[10px] text-dark-text-secondary">PPR Bonus</span>
                    <span className="text-[10px] font-bold text-green-500">
                      +{Math.round(myTeam.roster.reduce((sum, p) => sum + ((p as any).receptions || 0), 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-dark-text-secondary">Budget Remaining</span>
                    <span className="text-[10px] font-bold text-dark-text">
                      ${myTeam.budget - myTeam.spentBudget}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Smart Recommendations - Below My Team */}
              <ComprehensiveHorizontalRecommendations
                availablePlayers={availablePlayers}
                myTeamId="my-team"
                mode="auction"
              />
              
              {/* Value Finder - Below Smart Recommendations */}
              <ValueFinder />
            </div>

            {/* Center - Player Grid/List */}
            <div className="col-span-12 lg:col-span-7 space-y-4">
              {/* Comparison Toolbar */}
              {selectedForComparison.size > 0 && (
                <div className="bg-draft-primary/10 border border-draft-primary rounded-xl p-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-dark-text text-[11px]">
                      {selectedForComparison.size} player{selectedForComparison.size !== 1 ? 's' : ''} selected
                    </span>
                    {selectedForComparison.size >= 2 && (
                      <button
                        onClick={openComparison}
                        className="bg-draft-primary hover:bg-blue-700 text-white px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
                      >
                        Compare Players
                      </button>
                    )}
                  </div>
                  <button
                    onClick={clearSelection}
                    className="text-dark-text-secondary hover:text-dark-text transition-colors text-[11px]"
                  >
                    Clear Selection
                  </button>
                </div>
              )}

              {/* Search and Filters */}
              <div className="bg-dark-bg-secondary rounded-xl p-4 border border-dark-border">
                {/* Position Filter Badges and Available Only */}
                <div className="mb-3">
                  <div className="grid grid-cols-7 gap-2 w-full">
                    {(['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as Position[]).map(position => (
                      <button
                        key={position}
                        onClick={() => {
                          const newSelection = new Set(selectedPositions);
                          if (newSelection.has(position)) {
                            newSelection.delete(position);
                          } else {
                            newSelection.add(position);
                          }
                          setSelectedPositions(newSelection);
                        }}
                        className={`text-xs font-bold py-1.5 rounded transition-all ${
                          selectedPositions.has(position)
                            ? `bg-position-${position.toLowerCase()} text-white`
                            : `bg-position-${position.toLowerCase()} text-white opacity-40 hover:opacity-70`
                        }`}
                      >
                        {position}
                      </button>
                    ))}
                    {/* Available Only Toggle */}
                    <button
                      onClick={() => setShowOnlyAvailable(!showOnlyAvailable)}
                      className={`text-xs font-bold py-1.5 rounded transition-all ${
                        showOnlyAvailable 
                          ? 'bg-green-600 text-white' 
                          : 'bg-green-600 text-white opacity-40 hover:opacity-70'
                      }`}
                    >
                      Available
                    </button>
                  </div>
                  
                  {selectedPositions.size > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setSelectedPositions(new Set())}
                        className="text-xs text-dark-text-secondary hover:text-dark-text"
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Search Bar - Full Width */}
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-1.5 pr-8 text-sm text-dark-text placeholder-dark-text-secondary focus:border-draft-primary focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-dark-text-secondary hover:text-dark-text transition-colors p-0.5"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Player Cards */}
              {viewMode === 'grid' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence>
                      {sortedPlayers.slice(0, displayCount).map(player => (
                      <motion.div
                        key={player.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                      >
                        <AdvancedPlayerCard
                          player={player}
                          marketValue={player.auctionValue}
                          onDraft={() => handleDraftPlayer(player)}
                          onDetail={() => handlePlayerDetail(player)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {sortedPlayers.length > displayCount && (
                  <div className="mt-4">
                    <button
                      onClick={() => setDisplayCount(prev => prev + 30)}
                      className="w-full bg-dark-bg-secondary hover:bg-dark-bg-tertiary text-dark-text font-medium py-2 px-4 rounded-lg border border-dark-border transition-colors"
                    >
                      Load More ({sortedPlayers.length - displayCount} remaining)
                    </button>
                  </div>
                )}
                </>
              ) : (
                <div className="bg-dark-bg-secondary rounded-xl border border-dark-border overflow-hidden">
                  <div className="px-4 py-2 bg-dark-bg-tertiary border-b border-dark-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-dark-text-secondary">
                        Showing {Math.min(displayCount, sortedPlayers.length)} of {sortedPlayers.length} players
                      </span>
                      <span className="text-xs text-dark-text-secondary">
                        Sorted by: <span className="font-medium text-dark-text">
                          {sortColumn === 'cvsScore' ? 'CVS Score' :
                           sortColumn === 'projectedPoints' ? 'Projected Points' :
                           sortColumn === 'adp' ? 'ADP' :
                           sortColumn === 'round' ? 'Round' :
                           sortColumn === 'receptions' ? 'PPR Receptions' :
                           sortColumn.charAt(0).toUpperCase() + sortColumn.slice(1)}
                        </span> ({sortDirection === 'asc' ? '↑' : '↓'})
                      </span>
                    </div>
                    {/* Badge Legend */}
                    <div className="flex items-center gap-3 text-[9px] text-dark-text-secondary">
                      <span className="flex items-center gap-1 cursor-help" title="First year in the NFL">
                        <span className="px-1 py-0.5 bg-yellow-500/20 text-yellow-400 rounded font-bold">R</span> Rookie
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="High price but CVS doesn't justify it">
                        <span className="px-1 py-0.5 bg-red-600/20 text-red-500 rounded font-bold">📉</span> Overvalued
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="ADP 100-200 with 120+ points">
                        <span className="px-1 py-0.5 bg-green-500/20 text-green-400 rounded font-bold">💎</span> Sleeper
                      </span>
                      <span className="text-gray-500">|</span>
                      <span className="flex items-center gap-1 cursor-help" title="Injury statuses from Sleeper API">
                        <span className="px-1 py-0.5 bg-yellow-500/20 text-yellow-400 rounded font-bold">Q</span>/
                        <span className="px-1 py-0.5 bg-orange-500/20 text-orange-400 rounded font-bold">D</span>/
                        <span className="px-1 py-0.5 bg-red-500/20 text-red-400 rounded font-bold">O</span> Injury
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="ADP > 36 with high points for position">
                        <span className="px-1 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-bold">💰</span> Value
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="50+ projected receptions">
                        <span className="px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded font-bold">PPR</span> PPR Stud
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="Age ≤ 24 with 80+ points">
                        <span className="px-1 py-0.5 bg-cyan-500/20 text-cyan-400 rounded font-bold">Y</span> Young
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="Age ≥ 31">
                        <span className="px-1 py-0.5 bg-gray-500/20 text-gray-400 rounded font-bold">V</span> Veteran
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="ADP < 50 with low projected points">
                        <span className="px-1 py-0.5 bg-red-500/20 text-red-400 rounded font-bold">⚠</span> Bust Risk
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="Elite consistency in 2024 (14+ games, 10+ PPG, low variance)">
                        <span className="px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded font-bold">📊</span> Consistent
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="Red zone dominator (20%+ RZ usage or 18+ RZ touches with 7+ TDs)">
                        <span className="px-1 py-0.5 bg-red-600/20 text-red-400 rounded font-bold">🎯</span> RZ Monster
                      </span>
                      <span className="flex items-center gap-1 cursor-help" title="Top 20% in projected touches for 2025">
                        <span className="px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded font-bold">👑</span> Volume King
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-max">
                    <thead className="bg-dark-bg-tertiary">
                      <tr>
                        <th className="w-6 px-0.5 py-1">
                          <input
                            type="checkbox"
                            className="w-3 h-3 rounded border-dark-border bg-dark-bg text-draft-primary focus:ring-draft-primary"
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
                        </th>
                        <th 
                          className="text-left px-1 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors min-w-[100px]"
                          onClick={() => handleSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            Player
                            {sortColumn === 'name' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-8"
                          onClick={() => handleSort('position')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Pos
                            {sortColumn === 'position' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-10"
                          onClick={() => handleSort('team')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Team
                            {sortColumn === 'team' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-9"
                          onClick={() => handleSort('cvsScore')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Composite Value Score (0-100) - Weighted formula: Auction Value 23% + ADP 23% + Projected Points 28% + Position Scarcity 8% + Strength of Schedule 10% + Year-over-Year Trend 8%">CVS</span>
                            {sortColumn === 'cvsScore' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-9"
                          onClick={() => handleSort('projectedPoints')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Projected fantasy points for the season">Proj</span>
                            {sortColumn === 'projectedPoints' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-9"
                          onClick={() => handleSort('receptions')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Points Per Reception bonus points">PPR</span>
                            {sortColumn === 'receptions' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-11"
                          onClick={() => handleSort('auctionValue')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Auction draft dollar value ($200 budget)">$Value</span>
                            {sortColumn === 'auctionValue' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-10"
                          onClick={() => handleSort('adp')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Average Draft Position across leagues">ADP</span>
                            {sortColumn === 'adp' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-7"
                          onClick={() => handleSort('round')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Draft round based on 12-team league">Rd</span>
                            {sortColumn === 'round' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-8"
                          onClick={() => handleSort('age')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Age
                            {sortColumn === 'age' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th 
                          className="text-center px-0.5 py-1 text-dark-text text-sm font-medium cursor-pointer hover:bg-dark-bg transition-colors w-10"
                          onClick={() => handleSort('sos')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className="cursor-help" title="Strength of Schedule (1=easiest, 10=hardest)">SOS</span>
                            {sortColumn === 'sos' ? (
                              sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                            ) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </div>
                        </th>
                        <th className="text-center px-0.5 py-1 text-dark-text text-sm font-medium w-12">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.slice(0, displayCount).map(player => (
                        <tr key={player.id} className="border-t border-dark-border hover:bg-dark-bg">
                          <td className="w-6 px-0.5 py-0.5">
                            <input
                              type="checkbox"
                              className="w-3 h-3 rounded border-dark-border bg-dark-bg text-draft-primary focus:ring-draft-primary"
                              checked={selectedForComparison.has(player.id)}
                              onChange={() => togglePlayerSelection(player.id)}
                            />
                          </td>
                          <td className="px-1 py-0.5 text-dark-text text-[15px] font-medium min-w-[50px]">
                            <div className="flex items-center gap-1">
                              {player.name}
                              <div className="flex items-center gap-0.5">
                                {/* Rookie Badge */}
                                {(player as any).isRookie && (
                                  <span className="text-[11px] px-1 py-0.5 bg-yellow-500/20 text-yellow-400 rounded font-bold cursor-help" title="Rookie Player - First year in the NFL">R</span>
                                )}
                                {/* Injury Badge */}
                                {player.injuryStatus && player.injuryStatus !== 'Healthy' && (
                                  <span className={`text-[11px] px-1 py-0.5 rounded font-bold cursor-help ${
                                    player.injuryStatus === 'Questionable' ? 'bg-yellow-500/20 text-yellow-400' :
                                    player.injuryStatus === 'Doubtful' ? 'bg-orange-500/20 text-orange-400' :
                                    player.injuryStatus === 'Out' || player.injuryStatus === 'IR' ? 'bg-red-500/20 text-red-400' :
                                    player.injuryStatus === 'PUP' ? 'bg-purple-500/20 text-purple-400' :
                                    player.injuryStatus === 'Suspended' ? 'bg-gray-500/20 text-gray-400' :
                                    'bg-gray-500/20 text-gray-400'
                                  }`} title={`${player.injuryStatus}${player.injuryNotes ? `: ${player.injuryNotes}` : ''}`}>
                                    {player.injuryStatus === 'Questionable' ? 'Q' :
                                     player.injuryStatus === 'Doubtful' ? 'D' :
                                     player.injuryStatus === 'Out' ? 'O' :
                                     player.injuryStatus === 'IR' ? 'IR' :
                                     player.injuryStatus === 'PUP' ? 'PUP' :
                                     player.injuryStatus === 'Suspended' ? 'SUS' : '?'}
                                    {player.injuryNotes && '*'}
                                  </span>
                                )}
                                {/* Sleeper Badge (Late round value - ADP > 100 with good projections) */}
                                {player.adp > 100 && player.adp < 200 && player.projectedPoints > 120 && (
                                  <span className="text-[9px] px-0.5 py-0 bg-green-500/20 text-green-400 rounded font-bold cursor-help" title="Sleeper Pick - ADP 100-200 with 120+ projected points">💎</span>
                                )}
                                {/* Bust Risk Badge (High ADP but low projected points relative to position - 20th percentile) */}
                                {player.adp < 50 && player.adp > 0 && (
                                  (player.position === 'RB' && player.projectedPoints < 215) ||
                                  (player.position === 'WR' && player.projectedPoints < 230) ||
                                  (player.position === 'QB' && player.projectedPoints < 300) ||
                                  (player.position === 'TE' && player.projectedPoints < 195)
                                ) && (
                                  <span className="text-[9px] px-0.5 py-0 bg-red-500/20 text-red-400 rounded font-bold cursor-help" title="Bust Risk - ADP < 50 with low points (RB<215, WR<230, QB<300, TE<195)">⚠</span>
                                )}
                                {/* PPR Stud Badge (75+ receptions) */}
                                {(player.receptions || 0) >= 75 && (
                                  <span className="text-[9px] px-0.5 py-0 bg-blue-500/20 text-blue-400 rounded font-bold cursor-help" title="PPR Stud - 75+ projected receptions (valuable in PPR leagues)">PPR</span>
                                )}
                                {/* Value Badge (Good points for late ADP) */}
                                {player.adp > 36 && player.adp < 150 && (
                                  (player.position === 'QB' && player.projectedPoints > 240) ||
                                  (player.position === 'RB' && player.projectedPoints > 180) ||
                                  (player.position === 'WR' && player.projectedPoints > 200) ||
                                  (player.position === 'TE' && player.projectedPoints > 140)
                                ) && (
                                  <span className="text-[9px] px-0.5 py-0 bg-emerald-500/20 text-emerald-400 rounded font-bold cursor-help" title="Value Pick - ADP > 36 with high points (QB>240, RB>180, WR>200, TE>140)">💰</span>
                                )}
                                {/* Overvalued Badge (High price but CVS doesn't justify it) */}
                                {player.auctionValue >= 10 && (
                                  // Very lenient: CVS should be at least 2.5x the auction price
                                  // For $10: CVS 25+, $20: CVS 50+, $30: CVS 75+
                                  player.cvsScore < (player.auctionValue * 2.5)
                                ) && (
                                  <span className="text-[9px] px-0.5 py-0 bg-red-600/20 text-red-500 rounded font-bold cursor-help" 
                                        title={`Overvalued - $${player.auctionValue} price but CVS ${Math.round(player.cvsScore)} (expected ${Math.round(player.auctionValue * 2.5)}+)`}>
                                    📉
                                  </span>
                                )}
                                {/* Young Talent (age <= 24 and decent projections) */}
                                {player.age > 0 && player.age <= 24 && player.projectedPoints > 80 && !(player as any).isRookie && (
                                  <span className="text-[11px] px-1 py-0.5 bg-cyan-500/20 text-cyan-400 rounded font-bold cursor-help" title="Young Talent - Age ≤ 24 with 80+ projected points (not rookie)">Y</span>
                                )}
                                {/* Veteran (age >= 31) */}
                                {player.age >= 31 && (
                                  <span className="text-[11px] px-1 py-0.5 bg-gray-500/20 text-gray-400 rounded font-bold cursor-help" title="Veteran - Age ≥ 31 (experienced but aging)">V</span>
                                )}
                                {/* New Badges from Canonical Data */}
                                {/* Consistent Producer */}
                                {badgeDataService.isConsistentProducer(player.name) && (
                                  <span className="text-[11px] px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded font-bold cursor-help" 
                                        title="Consistent Producer - Elite consistency in 2024 (14+ games, 10+ PPG, low variance)">📊</span>
                                )}
                                {/* RZ Monster */}
                                {badgeDataService.isRedZoneMonster(player.name) && (
                                  <span className="text-[11px] px-1 py-0.5 bg-red-600/20 text-red-400 rounded font-bold cursor-help" 
                                        title="RZ Monster - Red zone dominator (20%+ RZ usage or 18+ RZ touches with 7+ TDs)">🎯</span>
                                )}
                                {/* Volume King */}
                                {badgeDataService.isVolumeKing(player.name) && (
                                  <span className="text-[11px] px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded font-bold cursor-help" 
                                        title="Volume King - Top 20% in projected touches for 2025">👑</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-center px-0.5 py-0.5 w-8">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded bg-position-${player.position.toLowerCase()} text-white`}>
                              {player.position}
                            </span>
                          </td>
                          <td className="text-center px-0.5 py-0.5 text-sm text-dark-text-secondary w-10">{player.team}</td>
                          <td className={`text-center px-0.5 py-0.5 text-[13px] font-bold w-9 ${
                            player.cvsScore >= 90 ? 'text-emerald-400' :
                            player.cvsScore >= 80 ? 'text-green-500' : 
                            player.cvsScore >= 70 ? 'text-lime-500' :
                            player.cvsScore >= 60 ? 'text-yellow-500' :
                            player.cvsScore >= 50 ? 'text-amber-500' :
                            player.cvsScore >= 40 ? 'text-orange-500' :
                            player.cvsScore >= 30 ? 'text-red-500' :
                            'text-gray-500'
                          }`}>{isNaN(player.cvsScore) ? 'N/A' : Math.round(player.cvsScore)}</td>
                          <td className="text-center px-0.5 py-0.5 text-sm text-dark-text w-9">{Math.round(player.projectedPoints)}</td>
                          <td className={`text-center px-0.5 py-0.5 text-[13px] w-9 ${
                            (player.receptions || 0) >= 80 ? 'text-purple-400' :
                            (player.receptions || 0) >= 60 ? 'text-blue-400' :
                            (player.receptions || 0) >= 40 ? 'text-cyan-400' :
                            (player.receptions || 0) >= 20 ? 'text-teal-400' :
                            (player.receptions || 0) >= 10 ? 'text-gray-400' :
                            'text-gray-600'
                          }`}>+{Math.round(player.receptions || 0)}</td>
                          <td className={`text-center px-0.5 py-0.5 text-[13px] font-bold w-11 ${
                            (player.auctionValue || 0) >= 60 ? 'text-pink-400' :
                            (player.auctionValue || 0) >= 40 ? 'text-purple-400' :
                            (player.auctionValue || 0) >= 25 ? 'text-indigo-400' :
                            (player.auctionValue || 0) >= 15 ? 'text-blue-400' :
                            (player.auctionValue || 0) >= 8 ? 'text-cyan-400' :
                            (player.auctionValue || 0) >= 3 ? 'text-teal-400' :
                            (player.auctionValue || 0) >= 1 ? 'text-green-400' :
                            'text-gray-500'
                          }`}>{player.auctionValue && player.auctionValue > 0 ? `$${Math.round(player.auctionValue)}` : 'N/A'}</td>
                          <td className={`text-center px-0.5 py-0.5 text-[13px] w-10 ${
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
                            <span title={`Raw: ${player.adp}, Formatted: ${Number(player.adp).toFixed(1)}`}>
                              {Number(player.adp).toFixed(1)}
                            </span>
                          </td>
                          <td className={`text-center px-0.5 py-0.5 text-[13px] w-7 ${
                            parseInt(getAdpRoundRange(player.adp)) <= 3 ? 'text-green-400 font-bold' :
                            parseInt(getAdpRoundRange(player.adp)) <= 6 ? 'text-lime-400 font-semibold' :
                            parseInt(getAdpRoundRange(player.adp)) <= 9 ? 'text-yellow-400' :
                            parseInt(getAdpRoundRange(player.adp)) <= 12 ? 'text-orange-400' :
                            parseInt(getAdpRoundRange(player.adp)) <= 15 ? 'text-red-400' :
                            'text-gray-500'
                          }`}>
                            {getAdpRoundRange(player.adp)}
                          </td>
                          <td className="text-center px-0.5 py-0.5 text-sm text-dark-text-secondary w-8">{player.age}</td>
                          <td className="text-center px-0.5 py-0.5 w-10">
                            {player.sos !== undefined && player.sos !== null ? (
                              <div className={`inline-block w-7 h-5 rounded text-[11px] font-bold flex items-center justify-center ${
                                player.sos <= 2 ? 'bg-green-500/30 text-green-400' :
                                player.sos <= 4 ? 'bg-green-500/20 text-green-400' :
                                player.sos <= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                                player.sos <= 8 ? 'bg-orange-500/20 text-orange-400' :
                                'bg-red-500/30 text-red-400'
                              }`}>
                                {player.sos.toFixed(1)}
                              </div>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                          <td className="text-center px-0.5 py-0.5 w-12">
                            <button
                              onClick={() => handleDraftPlayer(player)}
                              className="bg-draft-primary hover:bg-blue-700 text-white text-xs font-medium py-0.5 px-2 rounded transition-colors"
                            >
                              Draft
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {sortedPlayers.length > displayCount && (
                    <div className="p-4 border-t border-dark-border">
                      <button
                        onClick={() => setDisplayCount(prev => prev + 30)}
                        className="w-full bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text font-medium py-2 px-4 rounded-lg transition-colors"
                      >
                        Show More ({sortedPlayers.length - displayCount} remaining)
                      </button>
                    </div>
                  )}
                  {displayCount > 30 && (
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => setDisplayCount(30)}
                        className="text-sm text-dark-text-secondary hover:text-dark-text"
                      >
                        Show Less
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Sidebar - Auction Analytics & Team Budgets */}
            <div className="col-span-12 lg:col-span-2 space-y-4">
              {/* Nomination Strategy */}
              <div className="bg-dark-bg-secondary rounded-xl p-4 border border-dark-border">
                <h3 className="text-base font-semibold text-dark-text mb-3 flex items-center gap-2 cursor-help"
                    title="Nominate players based on: 1) Overpriced players (market value > CVS value) to drain opponent budgets, 2) Players you don't want that others value highly, 3) Position runs when you're already set at that position. Formula: (Market Value - CVS Value) * Position Scarcity * Team Need Factor">
                  <Target className="w-5 h-5 text-red-500" />
                  Nomination Strategy
                </h3>
                {availablePlayers.length > 0 && (() => {
                  try {
                    const nominationStrategy = auctionMarketTracker.getNominationStrategy('my-team');
                    if (!nominationStrategy || !nominationStrategy.recommendedNomination) {
                      return <p className="text-xs text-dark-text-secondary">Loading strategy...</p>;
                    }
                    return (
                      <div className="space-y-2">
                        <div className="p-3 bg-dark-bg rounded-lg border border-draft-primary">
                          <p className="text-sm font-medium text-dark-text">
                            {nominationStrategy.recommendedNomination.player.name}
                          </p>
                          <p className="text-xs text-dark-text-secondary mt-1">
                            {nominationStrategy.recommendedNomination.reason}
                          </p>
                          <p className="text-xs text-draft-primary mt-1">
                            Expected: ${nominationStrategy.recommendedNomination.expectedPrice}
                          </p>
                        </div>
                        <p className="text-xs text-dark-text-secondary">
                          Phase: <span className="font-bold">{nominationStrategy.phase}</span>
                        </p>
                      </div>
                    );
                  } catch (error) {
                    return <p className="text-xs text-dark-text-secondary">Initializing...</p>;
                  }
                })()}
              </div>
              
              {/* Market Conditions */}
              <div className="bg-dark-bg-secondary rounded-xl p-4 border border-dark-border">
                <h3 className="text-base font-semibold text-dark-text mb-3 flex items-center gap-2 cursor-help"
                    title="Inflation Rate: How much prices are above/below expected value. Positive % = players are going for more than expected (spending is aggressive). Negative % = players are going for less than expected (spending is conservative). Based on average price paid vs. $200/16 = $12.50 baseline.">
                  <TrendingUp className="w-5 h-5 text-yellow-500" />
                  Market Conditions
                </h3>
                {marketConditions && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-dark-text-secondary cursor-help" title="Shows if players are being overpaid (+%) or underpaid (-%) compared to expected values. Positive = prices are inflated, Negative = good value opportunities">Inflation Rate</span>
                      <span className={`text-xs font-bold ${
                        marketConditions.inflationRate > 0.1 ? 'text-red-500' :
                        marketConditions.inflationRate < -0.1 ? 'text-green-500' :
                        'text-yellow-500'
                      }`}>
                        {marketConditions.inflationRate > 0 ? '+' : ''}
                        {(marketConditions.inflationRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-dark-text-secondary cursor-help" title="Average amount spent per player so far in the draft. Helps gauge if the market is running hot or cold">Avg Price</span>
                      <span className="text-xs font-bold text-dark-text">
                        ${marketConditions.avgPricePerPlayer.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-dark-text-secondary cursor-help" title="Total budget left across all teams. Lower amounts mean tighter competition for remaining players">Total Remaining</span>
                      <span className="text-xs font-bold text-dark-text">
                        ${marketConditions.totalRemaining}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Position Markets */}
              <div className="bg-dark-bg-secondary rounded-xl p-4 border border-dark-border">
                <h3 className="text-base font-semibold text-dark-text mb-3 flex items-center gap-2 cursor-help"
                    title="Shows position scarcity and market trends. $ = Average price paid for position. % = Price inflation (positive = overpaying, negative = underpaying compared to projected value). Colors indicate scarcity: Red = Critical, Orange = Scarce, Yellow = Normal, Green = Abundant">
                  <Users className="w-5 h-5 text-draft-primary" />
                  Position Markets
                </h3>
                <div className="space-y-2">
                  {positionMarkets && positionMarkets.length > 0 ? positionMarkets.map(market => {
                    const getScarcityColor = (level: string) => {
                      switch(level) {
                        case 'critical': return 'text-red-500 bg-red-500/10';
                        case 'scarce': return 'text-orange-500 bg-orange-500/10';
                        case 'normal': return 'text-yellow-500 bg-yellow-500/10';
                        case 'abundant': return 'text-green-500 bg-green-500/10';
                        default: return 'text-gray-500 bg-gray-500/10';
                      }
                    };
                    return (
                      <div key={market.position} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1 py-0.5 rounded bg-position-${market.position.toLowerCase()} text-white`}>
                            {market.position}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getScarcityColor(market.scarcityLevel)}`}>
                            {market.scarcityLevel.charAt(0).toUpperCase() + market.scarcityLevel.slice(1)}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-dark-text">
                            ${market.avgPrice.toFixed(0)} <span className={`text-[10px] ${
                              market.inflationRate > 0 ? 'text-red-500' : 'text-green-500'
                            }`}>
                              ({market.inflationRate > 0 ? '+' : ''}{(market.inflationRate * 100).toFixed(0)}%)
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="text-[10px] text-dark-text-secondary">Loading market data...</p>
                  )}
                </div>
              </div>
              
              {/* Draft History - Recent Picks */}
              {draftHistory.length > 0 && (
                <div className="bg-dark-bg-secondary rounded-xl p-4 border border-dark-border">
                  <DraftHistory />
                </div>
              )}
              
              {/* Team Budgets */}
              <div className="bg-dark-bg-secondary rounded-xl p-4 border border-dark-border">
                <h3 className="text-base font-semibold text-dark-text mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  Team Budgets
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
                          <div className="flex items-center gap-2">
                            <span 
                              className="text-sm font-semibold text-dark-text cursor-help"
                              title={team.roster.length > 0 
                                ? `Roster (${team.roster.length}):\n${team.roster.map(p => 
                                    `• ${p.name} (${p.position}) - $${(p as any).purchasePrice || p.auctionValue || 1}`
                                  ).join('\n')}`
                                : 'No players drafted yet'
                              }
                            >
                              {team.name || `Team ${idx + 1}`}
                            </span>
                          </div>
                          <span className="text-xs text-dark-text-secondary">
                            {rosterSize}/{maxRoster}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-dark-text-secondary">Budget</span>
                            <span className={`font-bold ${
                              remaining > 150 ? 'text-green-400' :
                              remaining > 50 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              ${remaining}
                            </span>
                          </div>
                          
                          <div className="flex justify-between text-xs">
                            <span className="text-dark-text-secondary">Spent</span>
                            <span className="text-dark-text">${spent}</span>
                          </div>
                          
                          
                          {/* Budget Bar */}
                          <div className="w-full bg-dark-bg-tertiary rounded-full h-2 mt-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                remaining > 150 ? 'bg-green-500' :
                                remaining > 50 ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${(remaining / 200) * 100}%` }}
                            />
                          </div>
                        </div>
                        
                        {/* Recent Picks */}
                        {team.roster.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-dark-border">
                            <div className="text-xs text-dark-text-secondary mb-1">Recent:</div>
                            {team.roster.slice(-2).reverse().map((player, i) => (
                              <div key={i} className="text-xs text-dark-text">
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
              <h2 className="text-2xl font-bold text-dark-text mb-4">{selectedPlayerDetail.name}</h2>
              <p className="text-dark-text-secondary mb-4">{selectedPlayerDetail.team} • {selectedPlayerDetail.position}</p>
              
              {/* Detailed stats would go here */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-bg rounded-lg p-4">
                  <p className="text-sm text-dark-text-secondary mb-1">Projected Points</p>
                  <p className="text-2xl font-bold text-dark-text">{Math.round(selectedPlayerDetail.projectedPoints)}</p>
                </div>
                <div className="bg-dark-bg rounded-lg p-4">
                  <p className="text-sm text-dark-text-secondary mb-1">CVS Score</p>
                  <p className="text-2xl font-bold text-dark-text">{isNaN(selectedPlayerDetail.cvsScore) ? 'N/A' : Math.round(selectedPlayerDetail.cvsScore)}</p>
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


      {/* Draft Price Input Modal */}
      <AnimatePresence>
        {draftPriceModal.show && draftPriceModal.player && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setDraftPriceModal({ player: null, show: false, price: 0, selectedTeamId: 'my-team' })}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-dark-bg-secondary rounded-xl p-6 max-w-md w-full border border-dark-border max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with Player Name and Position */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-dark-text">
                    {draftPriceModal.player.name}
                  </h2>
                  <span className={`px-1.5 py-0.5 rounded text-sm font-bold bg-position-${draftPriceModal.player.position.toLowerCase()} text-white`}>
                    {draftPriceModal.player.position}
                  </span>
                  <span className="text-dark-text-secondary">
                    {draftPriceModal.player.team}
                  </span>
                </div>
                <button
                  onClick={() => setDraftPriceModal({ player: null, show: false, price: 0, selectedTeamId: 'my-team' })}
                  className="text-dark-text-secondary hover:text-dark-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Player Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Left Column - Key Metrics */}
                <div className="space-y-3">
                  {/* CVS Score with Visual Bar */}
                  <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-dark-text-secondary">CVS Score</span>
                      <span className={`text-lg font-bold ${
                        draftPriceModal.player.cvsScore >= 80 ? 'text-green-400' :
                        draftPriceModal.player.cvsScore >= 60 ? 'text-yellow-400' :
                        draftPriceModal.player.cvsScore >= 40 ? 'text-orange-400' :
                        'text-red-400'
                      }`}>
                        {Math.round(draftPriceModal.player.cvsScore)}
                      </span>
                    </div>
                    <div className="w-full bg-dark-bg-tertiary rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
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
                  <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-dark-text-secondary">Projected Points</span>
                      <span className="text-lg font-bold text-dark-text">
                        {Math.round(draftPriceModal.player.projectedPoints)}
                      </span>
                    </div>
                  </div>

                  {/* PPR Metrics if available */}
                  {draftPriceModal.player.receptions && draftPriceModal.player.receptions > 0 && (
                    <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                      <div className="text-xs text-dark-text-secondary mb-2">PPR Stats</div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-dark-text-secondary">Proj. Receptions</span>
                          <span className="text-sm font-bold text-purple-400">
                            {Math.round(draftPriceModal.player.receptions || 0)}
                          </span>
                        </div>
                        {draftPriceModal.player.targets && (
                          <div className="flex justify-between">
                            <span className="text-xs text-dark-text-secondary">Proj. Targets</span>
                            <span className="text-sm text-dark-text">
                              {Math.round(draftPriceModal.player.targets)}
                            </span>
                          </div>
                        )}
                        {draftPriceModal.player.catchRate !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-xs text-dark-text-secondary">Catch Rate</span>
                            <span className="text-sm text-dark-text">
                              {draftPriceModal.player.catchRate < 1 ? 
                                (draftPriceModal.player.catchRate * 100).toFixed(1) : 
                                draftPriceModal.player.catchRate.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column - Additional Info */}
                <div className="space-y-3">
                  {/* Auction Value */}
                  <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-dark-text-secondary">Auction Value</span>
                      <span className="text-lg font-bold text-green-400">
                        ${draftPriceModal.player.auctionValue || 0}
                      </span>
                    </div>
                  </div>

                  {/* ADP and Round */}
                  <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-dark-text-secondary">ADP</span>
                      <span className="text-lg font-bold text-blue-400">
                        {draftPriceModal.player.adp ? draftPriceModal.player.adp.toFixed(1) : 'N/A'}
                      </span>
                    </div>
                    <div className="text-xs text-dark-text-secondary">
                      Round: {getAdpRoundRange(draftPriceModal.player.adp)}
                    </div>
                  </div>

                  {/* Age and Experience */}
                  <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-dark-text-secondary">Age</div>
                        <div className="text-lg font-bold text-dark-text">
                          {draftPriceModal.player.age || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-dark-text-secondary">Experience</div>
                        <div className="text-lg font-bold text-dark-text">
                          {draftPriceModal.player.experience || 0} yrs
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bye Week */}
                  <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-dark-text-secondary">Bye Week</span>
                      <span className="text-lg font-bold text-orange-400">
                        Week {draftPriceModal.player.byeWeek || draftPriceModal.player.bye || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {/* Elite badge */}
                {(() => {
                  const adp = draftPriceModal.player.adp;
                  const position = draftPriceModal.player.position;
                  const isElite = (
                    (position === 'QB' && adp <= 5) ||
                    (position === 'RB' && adp <= 10) ||
                    (position === 'WR' && adp <= 12) ||
                    (position === 'TE' && adp <= 4) ||
                    (adp <= 26.5)
                  );
                  return isElite && (
                    <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs font-bold">
                      ⭐ Elite
                    </span>
                  );
                })()}
                
                {/* PPR Stud badge */}
                {(draftPriceModal.player.receptions || 0) >= 75 && (
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-bold">
                    📈 PPR Stud
                  </span>
                )}
                
                {/* Rookie badge */}
                {(draftPriceModal.player as any).isRookie && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-bold">
                    🌟 Rookie
                  </span>
                )}
                
                {/* Young Talent badge */}
                {draftPriceModal.player.age <= 24 && draftPriceModal.player.experience > 0 && draftPriceModal.player.projectedPoints >= 80 && (
                  <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs font-bold">
                    ⚡ Young Talent
                  </span>
                )}
                
                {/* Veteran badge */}
                {draftPriceModal.player.age >= 31 && (
                  <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs font-bold">
                    🎖️ Veteran
                  </span>
                )}
                
                {/* Consistent Producer badge */}
                {badgeDataService.isConsistentProducer(draftPriceModal.player.name) && (
                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-bold">
                    📊 Consistent Producer
                  </span>
                )}
                
                {/* RZ Monster badge */}
                {badgeDataService.isRedZoneMonster(draftPriceModal.player.name) && (
                  <span className="px-2 py-1 bg-red-600/20 text-red-400 rounded text-xs font-bold">
                    🎯 RZ Monster
                  </span>
                )}
                
                {/* Volume King badge */}
                {badgeDataService.isVolumeKing(draftPriceModal.player.name) && (
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-bold">
                    👑 Volume King
                  </span>
                )}

                {/* Value badge */}
                {draftPriceModal.player.cvsScore > 60 && (draftPriceModal.player.auctionValue || 0) < 20 && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-bold">
                    💎 Value Pick
                  </span>
                )}

                {/* Sleeper badge */}
                {draftPriceModal.player.adp >= 100 && draftPriceModal.player.adp <= 200 && draftPriceModal.player.projectedPoints >= 120 && (
                  <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded text-xs font-bold">
                    😴 Sleeper
                  </span>
                )}
              </div>

              {/* Price Input Section */}
              <div className="space-y-4">
                {/* Team Selection Dropdown */}
                <div className="bg-dark-bg rounded-lg p-3 border border-draft-primary/30">
                  <label className="block text-sm font-semibold text-draft-primary mb-2">
                    Which team drafted this player?
                  </label>
                  <select
                    value={draftPriceModal.selectedTeamId}
                    onChange={(e) => setDraftPriceModal(prev => ({ 
                      ...prev, 
                      selectedTeamId: e.target.value
                    }))}
                    className="w-full bg-dark-bg-tertiary text-dark-text px-3 py-2 rounded border border-dark-border focus:border-draft-primary focus:outline-none cursor-pointer"
                  >
                    {teams.map(team => (
                      <option key={team.id} value={team.id} className="bg-dark-bg-tertiary text-dark-text">
                        {team.name} (${team.budget - team.spentBudget} remaining)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-dark-text-secondary mb-2">
                    Enter Draft Price (Market Value: ${draftPriceModal.player.auctionValue || 0})
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl text-dark-text">$</span>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={draftPriceModal.price}
                      onChange={(e) => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.max(0, Math.min(200, parseInt(e.target.value) || 0))
                      }))}
                      className="flex-1 bg-dark-bg text-dark-text px-3 py-2 rounded border border-dark-border focus:border-draft-primary focus:outline-none text-2xl font-bold"
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
                      className="px-3 py-1 bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text rounded border border-dark-border transition-colors"
                    >
                      -$1
                    </button>
                    <button
                      onClick={() => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.min(200, prev.price + 1)
                      }))}
                      className="px-3 py-1 bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text rounded border border-dark-border transition-colors"
                    >
                      +$1
                    </button>
                    <button
                      onClick={() => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.max(0, prev.price - 5)
                      }))}
                      className="px-3 py-1 bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text rounded border border-dark-border transition-colors"
                    >
                      -$5
                    </button>
                    <button
                      onClick={() => setDraftPriceModal(prev => ({ 
                        ...prev, 
                        price: Math.min(200, prev.price + 5)
                      }))}
                      className="px-3 py-1 bg-dark-bg hover:bg-dark-bg-tertiary text-dark-text rounded border border-dark-border transition-colors"
                    >
                      +$5
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setDraftPriceModal({ player: null, show: false, price: 0, selectedTeamId: 'my-team' })}
                  className="flex-1 bg-dark-bg-tertiary hover:bg-gray-700 text-dark-text text-sm font-medium py-1 px-3 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDraft}
                  className="flex-1 bg-draft-primary hover:bg-green-600 text-white text-sm font-medium py-1 px-3 rounded-lg transition-colors"
                >
                  Draft for ${draftPriceModal.price}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Data Quality Modal */}
      {showDataQuality && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
             onClick={() => setShowDataQuality(false)}>
          <div className="bg-dark-bg-secondary rounded-xl p-6 max-w-xl w-full max-h-[80vh] overflow-y-auto border border-dark-border"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-dark-text">Data Quality Report</h2>
              <button onClick={() => setShowDataQuality(false)} className="text-dark-text-secondary hover:text-dark-text">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Data Source Info */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-4">
              <h3 className="text-blue-400 font-semibold mb-2">📊 Data Sources</h3>
              <div className="text-sm text-dark-text-secondary space-y-1">
                <div className="mb-2">
                  <strong>Canonical CSV Projections:</strong> {extendedPlayers.length} players loaded
                </div>
                <div className="ml-4 text-xs space-y-0.5">
                  <div>• QB: qb_projections_2025.csv</div>
                  <div>• RB: rb_projections_2025.csv</div>
                  <div>• WR: wr_projections_2025.csv</div>
                  <div>• TE: te_projections_2025.csv</div>
                  <div>• K: k_projections_2025.csv</div>
                  <div>• DST: dst_projections_2025.csv</div>
                  <div className="pt-2 text-yellow-400">Source: Pro Football Focus 2025 <a href="https://www.pff.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-300">pff.com</a></div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-blue-500/20">
                  <strong>Real-time Updates:</strong> Sleeper API
                  <div className="ml-4 text-xs">Last updated: {improvedCanonicalService.getSleeperLastUpdated()?.toLocaleString() || 'Not yet fetched'}</div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-blue-500/20">
                  <strong>Validation Tests Run at Startup:</strong>
                </div>
                <div className="ml-2">
                  ✓ Statistical impossibility checks (catch rate, negative points, etc.)
                </div>
                <div className="ml-2">
                  ✓ Hallucination detection (AI-generated patterns)
                </div>
                <div className="ml-2">
                  ✓ Data provenance verification (canonical sources only)
                </div>
                <div className="ml-2">
                  ✓ Name normalization for API matching
                </div>
                <div className="ml-2">
                  ✓ Age/experience validation
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              {/* Test Button and Results */}
              <div className="mb-4 flex items-start gap-3">
                <button 
                  onClick={async () => {
                    setValidationResults('Running validation on all players...');
                    console.log('Running real validation tests on actual players...');
                    
                    try {
                      // Run real validation on actual players
                      const players = improvedCanonicalService.getAllPlayers();
                      
                      // Run hallucination detection
                      hallucinationDetector.detectHallucinations(players);
                      const hallucinations = hallucinationDetector.getHighConfidenceIssues().length;
                      
                      // Run data validation
                      dataValidator.validateAllPlayers(players);
                      const validationIssues = dataValidator.getIssues();
                      const errors = validationIssues.filter(i => i.severity === 'error').length;
                      const warnings = validationIssues.filter(i => i.severity === 'warning').length;
                      
                      // Run provenance check (it doesn't take parameters, checks global state)
                      await dataProvenanceChecker.checkDataProvenance();
                      const provenanceIssues = dataProvenanceChecker.getCriticalIssues().length;
                      
                      // Format results
                      let resultText = `✓ Validated ${players.length} players: `;
                      if (errors === 0 && warnings === 0 && hallucinations === 0 && provenanceIssues === 0) {
                        resultText += `No critical issues found`;
                      } else {
                        resultText += `${errors} errors, ${warnings} warnings`;
                        if (hallucinations > 0) {
                          resultText += `, ${hallucinations} critical hallucinations`;
                        }
                        if (provenanceIssues > 0) {
                          resultText += `, ${provenanceIssues} critical provenance issues`;
                        }
                      }
                      
                      setValidationResults(resultText);
                      
                      // Update the main data quality issues state
                      setDataQualityIssues({
                        errors,
                        warnings,
                        hallucinations,
                        legitimacy: provenanceIssues === 0
                      });
                      
                      console.log('Real validation complete:', {
                        totalPlayers: players.length,
                        errors,
                        warnings,
                        hallucinations,
                        provenanceIssues
                      });
                    } catch (error) {
                      console.error('Validation error:', error);
                      setValidationResults('Error running validation tests');
                    }
                  }}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-sm font-medium"
                >
                  🧪 Run Validation Tests
                </button>
                {validationResults && (
                  <div className="flex-1 px-3 py-2 bg-dark-bg rounded-lg border border-dark-border text-xs text-dark-text-secondary">
                    {validationResults}
                  </div>
                )}
              </div>
              
              {!dataQualityIssues.legitimacy && (
                <div className="bg-red-600/30 border border-red-400/50 rounded-lg p-4">
                  <h3 className="text-red-300 font-semibold mb-2">🚫 Data Provenance Issues</h3>
                  <div className="space-y-1 text-sm text-dark-text-secondary">
                    {dataProvenanceChecker.getCriticalIssues()
                      .slice(0, 5)
                      .map((issue, idx) => (
                        <div key={idx}>
                          • {issue.location}: {issue.description}
                        </div>
                      ))}
                  </div>
                  <div className="mt-2 text-xs text-red-400">
                    Data may not be from canonical sources or evaluation engines
                  </div>
                </div>
              )}
              
              {dataQualityIssues.hallucinations > 0 && (
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="text-purple-400 font-semibold mb-2">🧠 Likely Hallucinations ({dataQualityIssues.hallucinations})</h3>
                  <div className="space-y-1 text-sm text-dark-text-secondary">
                    {hallucinationDetector.getHighConfidenceIssues()
                      .slice(0, 10)
                      .map((issue, idx) => (
                        <div key={idx}>
                          • {issue.playerName ? `${issue.playerName}: ` : ''}{issue.description}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              
              {dataQualityIssues.errors > 0 && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                  <h3 className="text-red-400 font-semibold mb-2">❌ Errors ({dataQualityIssues.errors})</h3>
                  <div className="space-y-1 text-sm text-dark-text-secondary">
                    {dataValidator.getIssues()
                      .filter(i => i.severity === 'error')
                      .slice(0, 10)
                      .map((issue, idx) => (
                        <div key={idx}>• {issue.playerName}: {issue.issue}</div>
                      ))}
                  </div>
                </div>
              )}
              
              {dataQualityIssues.warnings > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                  <h3 className="text-yellow-400 font-semibold mb-2">⚠️ Warnings ({dataQualityIssues.warnings})</h3>
                  <div className="space-y-1 text-sm text-dark-text-secondary">
                    {dataValidator.getIssues()
                      .filter(i => i.severity === 'warning')
                      .slice(0, 10)
                      .map((issue, idx) => (
                        <div key={idx}>• {issue.playerName}: {issue.issue}</div>
                      ))}
                  </div>
                </div>
              )}
              
              {dataQualityIssues.errors === 0 && dataQualityIssues.warnings === 0 && dataQualityIssues.hallucinations === 0 && dataQualityIssues.legitimacy && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                  <h3 className="text-green-400 font-semibold mb-2">✅ All Data Valid</h3>
                  <div className="text-sm text-dark-text-secondary space-y-1">
                    <div>• No statistical impossibilities detected</div>
                    <div>• No hallucination patterns found</div>
                    <div>• All data from canonical sources verified</div>
                    <div>• Player data integrity confirmed</div>
                  </div>
                </div>
              )}
              
              <div className="text-xs text-dark-text-tertiary mt-4">
                <p>Data is refreshed daily from Sleeper API</p>
                <p>Some validation warnings are expected (e.g., high ADP for kickers)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Player Comparison Modal */}
      {showComparisonModal && (
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
        />
      )}

      {/* Team Command Center Modal */}
      <AnimatePresence>
        {showTeamCommandCenter && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowTeamCommandCenter(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-dark-bg-secondary rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden border border-dark-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-dark-border">
                <h2 className="text-xl font-bold text-dark-text flex items-center gap-2">
                  <Users className="w-6 h-6 text-draft-primary" />
                  Team Command Center
                </h2>
                <button
                  onClick={() => setShowTeamCommandCenter(false)}
                  className="p-2 rounded-lg hover:bg-dark-bg transition-colors"
                >
                  <X className="w-5 h-5 text-dark-text-secondary" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
                <TeamCommandCenter teamId="my-team" totalBudget={200} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ModernApp;