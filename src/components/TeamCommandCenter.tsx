import React, { useMemo } from 'react';
import { 
  BarChart, Bar, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, 
  PolarRadiusAxis, Radar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Trophy, TrendingUp, Calendar, Shield, Users, AlertCircle 
} from 'lucide-react';
import { ExtendedPlayer } from '../services/pprAnalyzer';
import { Position } from '../types';
import { useDraftStore } from '../store/draftStore';

interface TeamCommandCenterProps {
  teamId: string;
  totalBudget?: number;
}

export const TeamCommandCenter: React.FC<TeamCommandCenterProps> = ({
  teamId,
  totalBudget = 200
}) => {
  const { teams } = useDraftStore();
  const team = teams.find(t => t.id === teamId);
  
  if (!team) {
    return <div>Team not found</div>;
  }
  
  // Calculate real team metrics from actual roster
  const calculateTeamMetrics = () => {
    const roster = (team?.roster || []) as ExtendedPlayer[];
    
    // Position breakdown
    const positionCounts: Record<Position, number> = {
      QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0
    };
    
    let totalProjected = 0;
    let totalPPRBonus = 0;
    let totalSpent = 0;
    
    roster.forEach(player => {
      positionCounts[player.position]++;
      totalProjected += player.projectedPoints || 0;
      totalPPRBonus += ((player as any).receptions || 0) * 1; // PPR scoring
      totalSpent += player.auctionValue || 0;
    });
    
    // Calculate starters vs bench
    const starters = roster.slice(0, 9); // First 9 are starters
    const bench = roster.slice(9);
    
    const starterPoints = starters.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);
    const benchPoints = bench.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);
    
    return {
      totalProjected: totalProjected + totalPPRBonus,
      starterPoints,
      benchPoints,
      totalSpent,
      remainingBudget: totalBudget - totalSpent,
      positionCounts,
      avgAge: roster.reduce((sum, p) => sum + p.age, 0) / roster.length || 0,
      injuredCount: roster.filter(p => p.injuryStatus !== 'Healthy').length
    };
  };
  
  const metrics = calculateTeamMetrics();
  
  // Position strength radar chart data
  const getPositionStrengthData = () => {
    const roster = (team?.roster || []) as ExtendedPlayer[];
    const positionScores: Record<Position, number> = {
      QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0
    };
    
    // Calculate average CVS score by position
    Object.keys(positionScores).forEach(pos => {
      const position = pos as Position;
      const players = roster.filter(p => p.position === position);
      if (players.length > 0) {
        const avgCVS = players.reduce((sum, p) => sum + (p.cvsScore || 0), 0) / players.length;
        positionScores[position] = avgCVS;
      }
    });
    
    return Object.entries(positionScores).map(([position, score]) => ({
      position,
      score: score,
      fullMark: 100
    }));
  };
  
  // Weekly projection data (simplified - would need schedule data for real)
  const getWeeklyProjections = () => {
    const baseProjection = metrics.totalProjected / 17; // 17 week season
    return Array.from({ length: 17 }, (_, i) => ({
      week: i + 1,
      projected: baseProjection, // Use actual projection, no fake variance
      average: baseProjection
    }));
  };
  
  // Budget allocation pie chart
  const getBudgetAllocation = () => {
    const roster = (team?.roster || []) as ExtendedPlayer[];
    const allocation: Record<Position, number> = {
      QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0
    };
    
    roster.forEach(player => {
      allocation[player.position] += player.auctionValue || 0;
    });
    
    return Object.entries(allocation)
      .filter(([_, value]) => value > 0)
      .map(([position, value]) => ({
        name: position,
        value: value
      }));
  };
  
  // Position colors for charts
  const POSITION_COLORS = {
    QB: '#ef4444',
    RB: '#10b981',
    WR: '#3b82f6',
    TE: '#f59e0b',
    K: '#8b5cf6',
    DST: '#6b7280'
  };
  
  // Calculate league comparison (simplified without all teams data)
  const getLeagueRanking = () => {
    // This would compare to other teams in real implementation
    const allTeamProjections = teams.map(t => {
      const points = t.roster.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);
      return points;
    }).sort((a, b) => b - a);
    
    const myRank = allTeamProjections.indexOf(metrics.totalProjected) + 1;
    return myRank;
  };
  
  const positionStrengthData = getPositionStrengthData();
  const weeklyProjections = getWeeklyProjections();
  const budgetAllocation = getBudgetAllocation();
  const leagueRank = getLeagueRanking();
  
  return (
    <div className="bg-dark-bg-secondary rounded-xl p-6 border border-dark-border">
      <h2 className="text-2xl font-bold text-dark-text mb-6 flex items-center gap-2">
        <Trophy className="w-6 h-6 text-draft-primary" />
        Team Command Center
      </h2>
      
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-dark-bg rounded-lg p-4">
          <p className="text-sm text-dark-text-secondary mb-1">Total Projected</p>
          <p className="text-2xl font-bold text-dark-text">{metrics.totalProjected.toFixed(0)}</p>
          <p className="text-xs text-green-500">+{(metrics.totalProjected - metrics.starterPoints).toFixed(0)} PPR</p>
        </div>
        
        <div className="bg-dark-bg rounded-lg p-4">
          <p className="text-sm text-dark-text-secondary mb-1">League Rank</p>
          <p className="text-2xl font-bold text-dark-text">#{leagueRank}</p>
          <p className="text-xs text-dark-text-secondary">of {teams.length}</p>
        </div>
        
        <div className="bg-dark-bg rounded-lg p-4">
          <p className="text-sm text-dark-text-secondary mb-1">Budget Used</p>
          <p className="text-2xl font-bold text-dark-text">${metrics.totalSpent}</p>
          <p className="text-xs text-dark-text-secondary">${metrics.remainingBudget} left</p>
        </div>
        
        <div className="bg-dark-bg rounded-lg p-4">
          <p className="text-sm text-dark-text-secondary mb-1">Roster Status</p>
          <p className="text-2xl font-bold text-dark-text">{(team?.roster || []).length}/16</p>
          {metrics.injuredCount > 0 && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {metrics.injuredCount} injured
            </p>
          )}
        </div>
      </div>
      
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Position Strength Radar */}
        <div className="bg-dark-bg rounded-lg p-4">
          <h3 className="text-lg font-semibold text-dark-text mb-4">Position Strength</h3>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={positionStrengthData}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis dataKey="position" stroke="#9ca3af" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="#374151" />
              <Radar 
                name="Strength" 
                dataKey="score" 
                stroke="#0ea5e9" 
                fill="#0ea5e9" 
                fillOpacity={0.6} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Budget Allocation Pie */}
        <div className="bg-dark-bg rounded-lg p-4">
          <h3 className="text-lg font-semibold text-dark-text mb-4">Budget Allocation</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={budgetAllocation}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry: any) => `${entry.name} ${((entry.percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {budgetAllocation.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={POSITION_COLORS[entry.name as Position]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#e5e7eb' }}
                formatter={(value: number) => `$${value}`}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Weekly Projections */}
        <div className="bg-dark-bg rounded-lg p-4 lg:col-span-2">
          <h3 className="text-lg font-semibold text-dark-text mb-4">Season Projections</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyProjections}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="week" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Line 
                type="monotone" 
                dataKey="projected" 
                stroke="#0ea5e9" 
                strokeWidth={2}
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="average" 
                stroke="#6b7280" 
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Roster Grid */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-dark-text mb-4">Current Roster</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-dark-text-secondary mb-2">Starters</h4>
            <div className="space-y-2">
              {(team?.roster || []).slice(0, 9).map((player: any) => (
                <div key={player.id} className="flex items-center justify-between bg-dark-bg rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded bg-position-${player.position.toLowerCase()} text-white`}>
                      {player.position}
                    </span>
                    <span className="text-sm text-dark-text">{player.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-dark-text">{player.projectedPoints.toFixed(0)}</p>
                    <p className="text-xs text-dark-text-secondary">${player.purchasePrice || 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-dark-text-secondary mb-2">Bench</h4>
            <div className="space-y-2">
              {(team?.roster || []).slice(9).map((player: any) => (
                <div key={player.id} className="flex items-center justify-between bg-dark-bg rounded-lg p-2 opacity-75">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded bg-position-${player.position.toLowerCase()} text-white`}>
                      {player.position}
                    </span>
                    <span className="text-sm text-dark-text">{player.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-dark-text">{player.projectedPoints.toFixed(0)}</p>
                    <p className="text-xs text-dark-text-secondary">${player.purchasePrice || 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};