import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Filter, ChevronDown, ChevronUp, Grid, List, 
  Download, Star, TrendingUp, AlertCircle, X, 
  SortAsc, SortDesc, Eye, Users, Activity, GitCompare, RotateCw
} from 'lucide-react';
import { Player, Position } from '../types';
import { useDraftStore } from '../store/draftStore';
import { playerDB } from '../services/database';
import { PlayerComparison } from './PlayerComparison';
import { getPlayerValue } from '../utils/valueCalculator';
import { dynamicCVSCalculator } from '../services/dynamicCVSCalculator';
import { improvedCanonicalService } from '../services/improvedCanonicalService';

type ViewMode = 'grid' | 'list' | 'compact';
type SortField = 'name' | 'cvsScore' | 'projectedPoints' | 'adp' | 'age' | 'team' | 'position';
type SortDirection = 'asc' | 'desc';

interface FilterState {
  positions: Position[];
  teams: string[];
  minCvs: number;
  maxCvs: number;
  minAdp: number;
  maxAdp: number;
  injuryStatus: string[];
  ageRange: [number, number];
  searchQuery: string;
  onlyAvailable: boolean;
}

export const PlayerDatabase: React.FC = () => {
  const { players: storePlayers, draftHistory, selectPlayer } = useDraftStore();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  
  console.log('PlayerDatabase render - storePlayers:', storePlayers.length);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortField, setSortField] = useState<SortField>('cvsScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    positions: [],
    teams: [],
    minCvs: 0,
    maxCvs: 100,
    minAdp: 1,
    maxAdp: 300,
    injuryStatus: [],
    ageRange: [20, 40],
    searchQuery: '',
    onlyAvailable: true
  });

  // Load all players including drafted ones
  useEffect(() => {
    console.log('PlayerDatabase useEffect triggered');
    console.log('storePlayers length:', storePlayers.length);
    console.log('draftHistory length:', draftHistory.length);
    loadAllPlayers();
  }, [storePlayers, draftHistory]); // Re-run when players change

  const loadAllPlayers = async () => {
    // Get available players from store
    let available = storePlayers;
    
    // If store is empty, load from database directly
    if (available.length === 0) {
      console.log('Store is empty, loading from database directly...');
      const dbPlayers = await playerDB.getAll();
      if (dbPlayers.length > 0) {
        console.log(`Loaded ${dbPlayers.length} players from database`);
        available = dbPlayers;
      } else {
        console.log('Database is empty, loading from canonical sources...');
        available = await improvedCanonicalService.initialize();
        console.log(`Loaded ${available.length} players from canonical sources`);
        // Save to database for next time
        await playerDB.bulkUpsert(available);
      }
    }
    
    // Get drafted players from history
    const drafted = draftHistory;
    
    console.log('Available players:', available.length);
    console.log('Drafted players:', drafted.length);
    
    // Combine all players
    const all = [...available, ...drafted];
    
    // Remove duplicates
    const uniquePlayers = Array.from(
      new Map(all.map(p => [p.id, p])).values()
    );
    
    console.log(`Loading ${uniquePlayers.length} players into database view`);
    setAllPlayers(uniquePlayers);
  };

  // Get unique teams for filter
  const uniqueTeams = useMemo(() => {
    const teams = new Set(allPlayers.map(p => p.team));
    return Array.from(teams).sort();
  }, [allPlayers]);

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let filtered = [...allPlayers];

    // Apply filters
    if (filters.onlyAvailable) {
      const draftedIds = new Set(draftHistory.map(p => p.id));
      filtered = filtered.filter(p => !draftedIds.has(p.id));
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.team.toLowerCase().includes(query)
      );
    }

    if (filters.positions.length > 0) {
      filtered = filtered.filter(p => filters.positions.includes(p.position));
    }

    if (filters.teams.length > 0) {
      filtered = filtered.filter(p => filters.teams.includes(p.team));
    }

    if (filters.injuryStatus.length > 0) {
      filtered = filtered.filter(p => 
        filters.injuryStatus.includes(p.injuryStatus || 'Healthy')
      );
    }

    filtered = filtered.filter(p => 
      p.cvsScore >= filters.minCvs && 
      p.cvsScore <= filters.maxCvs &&
      p.adp >= filters.minAdp &&
      p.adp <= filters.maxAdp &&
      p.age >= filters.ageRange[0] &&
      p.age <= filters.ageRange[1]
    );

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortField] as string | number;
      let bVal = b[sortField] as string | number;
      
      // Handle string comparisons
      if (sortField === 'name' || sortField === 'team' || sortField === 'position') {
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        if (sortDirection === 'asc') {
          return aStr.localeCompare(bStr);
        } else {
          return bStr.localeCompare(aStr);
        }
      }
      
      // Handle numeric comparisons
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      
      if (sortDirection === 'asc') {
        return aNum - bNum;
      } else {
        return bNum - aNum;
      }
    });

    return filtered;
  }, [allPlayers, filters, sortField, sortDirection, draftHistory]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    const newSelected = new Set(selectedPlayers);
    if (newSelected.has(playerId)) {
      newSelected.delete(playerId);
    } else {
      newSelected.add(playerId);
    }
    setSelectedPlayers(newSelected);
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Team', 'Position', 'Age', 'CVS Score', 'Projected Points', 'ADP', 'Status'];
    const rows = filteredPlayers.map(p => [
      p.name,
      p.team,
      p.position,
      p.age,
      p.cvsScore,
      p.projectedPoints,
      p.adp,
      p.injuryStatus || 'Healthy'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fantasy-players.csv';
    a.click();
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const refreshData = async () => {
    setIsRefreshing(true);
    console.log('Refreshing player data...');
    
    try {
      // Clear the cache first
      dynamicCVSCalculator.clearCache();
      console.log('Cache cleared');
      
      // Clear the database (if implemented) or skip for now
      // await playerDB.clear();
      console.log('Database refresh initiated');
      
      // Load fresh data from canonical sources only
      console.log('Loading all player data from canonical sources...');
      const freshPlayers = await improvedCanonicalService.initialize();
      console.log(`Loaded ${freshPlayers.length} players from canonical sources`);
      
      // Real-time updates from Sleeper API are initiated by canonical service
      try {
        console.log('Real-time updates from Sleeper API initiated by canonical service');
      } catch (error) {
        console.log('Using static data only');
      }
      
      console.log(`Calculating CVS scores for ${freshPlayers.length} players...`);
      const playersWithCVS = dynamicCVSCalculator.calculateBulkCVS(freshPlayers);
      
      // Debug log - show top players by ADP
      console.log('Sample recalculated scores:');
      const topPlayers = [...playersWithCVS].sort((a, b) => a.adp - b.adp).slice(0, 3);
      topPlayers.forEach(p => {
        console.log(`- ${p.name} (ADP ${p.adp}):`, p.cvsScore);
      });
      
      // Save to database
      await playerDB.bulkUpsert(playersWithCVS);
      
      // Update the store
      const { setPlayers } = useDraftStore.getState();
      setPlayers(playersWithCVS);
      
      // Force reload the component
      await loadAllPlayers();
      
      console.log('Data refresh complete!');
      alert('Player data has been refreshed with latest CVS calculations!');
    } catch (error) {
      console.error('Error refreshing data:', error);
      alert('Error refreshing data. Please check the console.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      QB: 'bg-red-100 text-red-800 border-red-300',
      RB: 'bg-blue-100 text-blue-800 border-blue-300',
      WR: 'bg-green-100 text-green-800 border-green-300',
      TE: 'bg-purple-100 text-purple-800 border-purple-300',
      K: 'bg-gray-100 text-gray-800 border-gray-300',
      DST: 'bg-orange-100 text-orange-800 border-orange-300',
    };
    return colors[position] || 'bg-gray-100 text-gray-800';
  };

  const getCvsColor = (score: number) => {
    if (score >= 90) return 'text-green-600 font-bold';
    if (score >= 80) return 'text-green-500';
    if (score >= 70) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getInjuryIcon = (status?: string) => {
    if (!status || status === 'Healthy') return null;
    const colors: Record<string, string> = {
      'Questionable': 'text-yellow-500',
      'Doubtful': 'text-orange-500',
      'Out': 'text-red-500',
      'IR': 'text-red-700',
    };
    return <AlertCircle className={`w-4 h-4 ${colors[status] || 'text-gray-500'}`} />;
  };

  const getInjuryColor = (status?: string) => {
    if (!status || status === 'Healthy') return 'text-green-600';
    const colors: Record<string, string> = {
      'Questionable': 'text-yellow-600',
      'Doubtful': 'text-orange-600',
      'Out': 'text-red-600',
      'IR': 'text-red-800',
    };
    return colors[status] || 'text-gray-600';
  };

  const isDrafted = (playerId: string) => {
    return draftHistory.some(p => p.id === playerId);
  };

  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredPlayers.map(player => (
        <div
          key={player.id}
          className={`bg-white rounded-lg border-2 p-4 hover:shadow-lg transition-all cursor-pointer ${
            isDrafted(player.id) ? 'opacity-60 border-gray-300' : 'border-gray-200 hover:border-draft-primary'
          } ${selectedPlayers.has(player.id) ? 'ring-2 ring-draft-primary' : ''}`}
          onClick={() => handleViewDetails(player)}
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center space-x-1">
              <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getPositionColor(player.position)}`}>
                {player.position}
              </span>
              {player.isRookie && (
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded font-semibold">
                  Rookie
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1">
              {player.dataStatus === 'Insufficient Data' && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded" title="Limited data available">
                  ⚠️ Limited
                </span>
              )}
              {player.dataStatus === 'Partial Data' && (
                <span className="text-xs text-gray-500" title="Some data missing">
                  ℹ️
                </span>
              )}
              {getInjuryIcon(player.injuryStatus)}
              {player.cvsScore >= 85 && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
              {isDrafted(player.id) && (
                <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">Drafted</span>
              )}
            </div>
          </div>
          
          <h3 className="font-bold text-gray-900 mb-1">{player.name}</h3>
          <p className="text-sm text-gray-600 mb-3">{player.team} • Age {player.age}</p>
          
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">CVS:</span>
              <span className={getCvsColor(player.cvsScore)}>{player.cvsScore}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Proj:</span>
              <span className="font-semibold">{player.projectedPoints} pts</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ADP:</span>
              <span>{Number(player.adp).toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Value:</span>
              <span className="font-bold text-draft-primary">
                {getPlayerValue(player) > 0 ? `$${getPlayerValue(player)}` : 'N/A'}
              </span>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlayerSelection(player.id);
              }}
              className={`w-full py-1 rounded text-xs font-semibold transition-colors ${
                selectedPlayers.has(player.id)
                  ? 'bg-draft-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {selectedPlayers.has(player.id) ? 'Selected' : 'Select'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const handleViewDetails = (player: Player) => {
    setModalPlayer(player);
    setShowPlayerModal(true);
  };

  const renderListView = () => (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
          <tr>
            <th 
              className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg"
              onClick={() => handleSort('name')}
            >
              <div className="flex items-center space-x-1">
                <span>Player</span>
                {sortField === 'name' && (
                  sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                )}
              </div>
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Position
            </th>
            <th 
              className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg"
              onClick={() => handleSort('team')}
            >
              <div className="flex items-center space-x-1">
                <span>Team</span>
                {sortField === 'team' && (
                  sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                )}
              </div>
            </th>
            <th 
              className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg"
              onClick={() => handleSort('age')}
            >
              <div className="flex items-center justify-center space-x-1">
                <span>Age</span>
                {sortField === 'age' && (
                  sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                )}
              </div>
            </th>
            <th 
              className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg"
              onClick={() => handleSort('cvsScore')}
            >
              <div className="flex items-center justify-center space-x-1">
                <span>CVS</span>
                {sortField === 'cvsScore' && (
                  sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                )}
              </div>
            </th>
            <th 
              className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg"
              onClick={() => handleSort('projectedPoints')}
            >
              <div className="flex items-center justify-center space-x-1">
                <span>Proj Pts</span>
                {sortField === 'projectedPoints' && (
                  sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                )}
              </div>
            </th>
            <th 
              className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg"
              onClick={() => handleSort('adp')}
            >
              <div className="flex items-center justify-center space-x-1">
                <span>ADP</span>
                {sortField === 'adp' && (
                  sortDirection === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                )}
              </div>
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Value
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
          {filteredPlayers.map((player, index) => (
            <tr 
              key={player.id} 
              className={`hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary ${isDrafted(player.id) ? 'opacity-60 bg-gray-50 dark:bg-dark-bg' : ''} ${
                selectedPlayers.has(player.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <td className="px-4 py-3">
                <div className="flex items-center space-x-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className={`font-semibold ${
                        player.dataStatus === 'Insufficient Data' ? 'text-gray-500' : 'text-gray-900 dark:text-gray-100'
                      }`}>{player.name}</p>
                      {player.isRookie && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold">
                          R
                        </span>
                      )}
                      {player.dataStatus === 'Insufficient Data' && (
                        <span className="text-xs text-yellow-600" title="Limited data available">
                          ⚠️
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Bye: Week {player.byeWeek}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getPositionColor(player.position)}`}>
                  {player.position}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{player.team}</td>
              <td className="px-4 py-3 text-center text-sm text-gray-900 dark:text-gray-100">{player.age}</td>
              <td className="px-4 py-3 text-center">
                <span className={`font-semibold ${getCvsColor(player.cvsScore)}`}>
                  {player.cvsScore}
                </span>
              </td>
              <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                {player.projectedPoints}
              </td>
              <td className="px-4 py-3 text-center text-sm text-gray-900 dark:text-gray-100">{Number(player.adp).toFixed(1)}</td>
              <td className="px-4 py-3 text-center">
                <span className="font-bold text-draft-primary">
                  {getPlayerValue(player) > 0 ? `$${getPlayerValue(player)}` : 'N/A'}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center space-x-1">
                  {getInjuryIcon(player.injuryStatus)}
                  {player.cvsScore >= 85 && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
                  {isDrafted(player.id) && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">Drafted</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewDetails(player);
                  }}
                  className="text-draft-primary hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  title="View Details"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderCompactView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {filteredPlayers.map(player => (
        <div
          key={player.id}
          className={`bg-white rounded border p-2 hover:shadow cursor-pointer flex items-center justify-between ${
            isDrafted(player.id) ? 'opacity-60' : ''
          } ${selectedPlayers.has(player.id) ? 'ring-2 ring-draft-primary' : ''}`}
          onClick={() => handleViewDetails(player)}
        >
          <div className="flex items-center space-x-3">
            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getPositionColor(player.position)}`}>
              {player.position}
            </span>
            <div>
              <p className="font-semibold text-sm">{player.name}</p>
              <p className="text-xs text-gray-500">{player.team}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <p className={`text-sm font-bold ${getCvsColor(player.cvsScore)}`}>CVS: {player.cvsScore}</p>
              <p className="text-xs text-gray-500">ADP: {Number(player.adp).toFixed(1)}</p>
            </div>
            <div className="flex items-center space-x-1">
              {getInjuryIcon(player.injuryStatus)}
              {isDrafted(player.id) && <span className="text-xs text-red-600">D</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-dark-bg p-4 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-lg p-6 mb-6 border border-gray-200 dark:border-dark-border">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text flex items-center">
                <Users className="w-8 h-8 mr-3 text-draft-primary" />
                Player Database
              </h1>
              <p className="text-gray-600 dark:text-dark-text-secondary mt-1">
                Browse and analyze {allPlayers.length} NFL players
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {selectedPlayers.size >= 2 && (
                <button
                  onClick={() => setShowComparison(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <GitCompare className="w-4 h-4" />
                  <span>Compare ({selectedPlayers.size})</span>
                </button>
              )}
              <button
                onClick={refreshData}
                disabled={isRefreshing}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  isRefreshing 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white shadow' : ''}`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded ${viewMode === 'list' ? 'bg-white shadow' : ''}`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('compact')}
                  className={`p-2 rounded ${viewMode === 'compact' ? 'bg-white shadow' : ''}`}
                >
                  <Activity className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search players by name or team..."
                value={filters.searchQuery}
                onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                className="w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text rounded-lg focus:outline-none focus:ring-2 focus:ring-draft-primary"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-lg border transition-colors ${
                showFilters 
                  ? 'bg-draft-primary text-white border-draft-primary' 
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-5 h-5" />
              <span>Filters</span>
              {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Position Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Positions</label>
                  <div className="flex flex-wrap gap-2">
                    {(['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as Position[]).map(pos => (
                      <button
                        key={pos}
                        onClick={() => {
                          const newPositions = filters.positions.includes(pos)
                            ? filters.positions.filter(p => p !== pos)
                            : [...filters.positions, pos];
                          setFilters({ ...filters, positions: newPositions });
                        }}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          filters.positions.includes(pos)
                            ? 'bg-draft-primary text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CVS Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CVS Score: {filters.minCvs} - {filters.maxCvs}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={filters.minCvs}
                      onChange={(e) => setFilters({ ...filters, minCvs: parseInt(e.target.value) })}
                      className="flex-1"
                    />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={filters.maxCvs}
                      onChange={(e) => setFilters({ ...filters, maxCvs: parseInt(e.target.value) })}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* ADP Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ADP: {filters.minAdp} - {filters.maxAdp}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={filters.minAdp}
                      onChange={(e) => setFilters({ ...filters, minAdp: parseInt(e.target.value) || 1 })}
                      className="w-20 px-2 py-1 border border-gray-300 rounded"
                    />
                    <span>to</span>
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={filters.maxAdp}
                      onChange={(e) => setFilters({ ...filters, maxAdp: parseInt(e.target.value) || 300 })}
                      className="w-20 px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                </div>

                {/* Injury Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Injury Status</label>
                  <div className="flex flex-wrap gap-2">
                    {['Healthy', 'Questionable', 'Doubtful', 'Out', 'IR'].map(status => (
                      <button
                        key={status}
                        onClick={() => {
                          const newStatuses = filters.injuryStatus.includes(status)
                            ? filters.injuryStatus.filter(s => s !== status)
                            : [...filters.injuryStatus, status];
                          setFilters({ ...filters, injuryStatus: newStatuses });
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          filters.injuryStatus.includes(status)
                            ? 'bg-draft-primary text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Age Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age: {filters.ageRange[0]} - {filters.ageRange[1]}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="20"
                      max="40"
                      value={filters.ageRange[0]}
                      onChange={(e) => setFilters({ 
                        ...filters, 
                        ageRange: [parseInt(e.target.value) || 20, filters.ageRange[1]] 
                      })}
                      className="w-16 px-2 py-1 border border-gray-300 rounded"
                    />
                    <span>to</span>
                    <input
                      type="number"
                      min="20"
                      max="40"
                      value={filters.ageRange[1]}
                      onChange={(e) => setFilters({ 
                        ...filters, 
                        ageRange: [filters.ageRange[0], parseInt(e.target.value) || 40] 
                      })}
                      className="w-16 px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                </div>

                {/* Availability Toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Availability</label>
                  <button
                    onClick={() => setFilters({ ...filters, onlyAvailable: !filters.onlyAvailable })}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      filters.onlyAvailable
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {filters.onlyAvailable ? 'Available Only' : 'Show All'}
                  </button>
                </div>
              </div>

              {/* Reset Filters */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setFilters({
                    positions: [],
                    teams: [],
                    minCvs: 0,
                    maxCvs: 100,
                    minAdp: 1,
                    maxAdp: 300,
                    injuryStatus: [],
                    ageRange: [20, 40],
                    searchQuery: '',
                    onlyAvailable: true
                  })}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  Reset All Filters
                </button>
              </div>
            </div>
          )}

          {/* Results Summary */}
          <div className="mt-4 flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Showing <span className="font-semibold">{filteredPlayers.length}</span> players
              {filters.searchQuery && ` matching "${filters.searchQuery}"`}
            </p>
            {selectedPlayers.size > 0 && (
              <p className="text-sm text-draft-primary font-medium">
                {selectedPlayers.size} players selected
              </p>
            )}
          </div>
        </div>

        {/* Players Display */}
        <div className="mb-6">
          {viewMode === 'grid' && renderGridView()}
          {viewMode === 'list' && renderListView()}
          {viewMode === 'compact' && renderCompactView()}
        </div>

        {/* No Results */}
        {filteredPlayers.length === 0 && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-lg p-12 text-center">
            <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No players found</h3>
            <p className="text-gray-500 dark:text-gray-400">Try adjusting your filters or search query</p>
          </div>
        )}

        {/* Player Comparison Modal */}
        {showComparison && (
          <PlayerComparison
            players={filteredPlayers.filter(p => selectedPlayers.has(p.id))}
            onRemovePlayer={(playerId) => {
              const newSelected = new Set(selectedPlayers);
              newSelected.delete(playerId);
              setSelectedPlayers(newSelected);
              if (newSelected.size < 2) {
                setShowComparison(false);
              }
            }}
            onClose={() => setShowComparison(false)}
          />
        )}

        {/* Player Details Modal */}
        {showPlayerModal && modalPlayer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{modalPlayer.name}</h2>
                    <div className="flex items-center space-x-3 mt-1">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{modalPlayer.team}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-500">•</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${getPositionColor(modalPlayer.position)}`}>
                        {modalPlayer.position}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-500">•</span>
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Bye: Week {modalPlayer.byeWeek}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowPlayerModal(false);
                      setModalPlayer(null);
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">CVS Score</p>
                    <p className={`text-2xl font-bold ${getCvsColor(modalPlayer.cvsScore)}`}>{modalPlayer.cvsScore}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Projected Points</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{modalPlayer.projectedPoints}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">ADP</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Number(modalPlayer.adp).toFixed(1)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Value</p>
                    <p className="text-2xl font-bold text-green-600">{getPlayerValue(modalPlayer) > 0 ? `$${getPlayerValue(modalPlayer)}` : 'N/A'}</p>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Age</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{modalPlayer.age} years</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Experience</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{modalPlayer.experience} years</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Injury Status</p>
                    <p className={`text-lg font-semibold ${getInjuryColor(modalPlayer.injuryStatus)}`}>
                      {modalPlayer.injuryStatus || 'Healthy'}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Status</p>
                    <p className={`text-lg font-semibold ${isDrafted(modalPlayer.id) ? 'text-red-600' : 'text-green-600'}`}>
                      {isDrafted(modalPlayer.id) ? 'Drafted' : 'Available'}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowPlayerModal(false);
                      setModalPlayer(null);
                    }}
                    className="px-6 py-2 bg-gray-200 dark:bg-dark-bg text-gray-800 dark:text-gray-200 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};