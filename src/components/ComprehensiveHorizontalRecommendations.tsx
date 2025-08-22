import React, { useMemo } from 'react';
import { 
  TrendingUp,
  DollarSign,
  Target,
  AlertTriangle
} from 'lucide-react';
import { ExtendedPlayer, pprAnalyzer } from '../services/pprAnalyzer';
import { Position } from '../types';
import { useDraftStore } from '../store/draftStore';

interface ComprehensiveHorizontalRecommendationsProps {
  availablePlayers: ExtendedPlayer[];
  myTeamId: string;
  mode?: 'auction' | 'snake';
}

export const ComprehensiveHorizontalRecommendations: React.FC<ComprehensiveHorizontalRecommendationsProps> = ({
  availablePlayers,
  myTeamId,
  mode = 'snake'
}) => {
  const { teams } = useDraftStore();
  const myTeam = teams.find(t => t.id === myTeamId);
  
  // Analyze team needs
  const analyzeTeamNeeds = () => {
    const roster = myTeam?.roster || [];
    const positionCounts: Record<Position, number> = {
      QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0
    };
    
    roster.forEach(player => {
      positionCounts[player.position]++;
    });
    
    // Updated requirements for 16-player roster
    const requirements = {
      QB: 2, RB: 4, WR: 4, TE: 2, K: 1, DST: 1
    };
    
    const critical: Position[] = [];
    Object.entries(requirements).forEach(([pos, needed]) => {
      const position = pos as Position;
      if (positionCounts[position] < needed) {
        critical.push(position);
      }
    });
    
    return { critical };
  };
  
  const teamNeeds = analyzeTeamNeeds();
  
  // Find best available (DRAFT NOW recommendations)
  const findBestAvailable = () => {
    let candidates = teamNeeds.critical.length > 0
      ? availablePlayers.filter(p => teamNeeds.critical.includes(p.position))
      : availablePlayers;
    
    if (candidates.length === 0) {
      candidates = availablePlayers;
    }
    
    return candidates.sort((a, b) => b.cvsScore - a.cvsScore).slice(0, 3); // Get top 3 for draft now
  };
  
  // Get recommendations
  const bestAvailable = findBestAvailable();
  
  // Value picks - High CVS relative to ADP
  const valuePicks = useMemo(() => {
    return availablePlayers
      .filter(p => {
        const valueRatio = p.cvsScore / (p.adp || 200);
        return p.adp > 40 && p.cvsScore > 30 && valueRatio > 0.25 && p.projectedPoints > 40;
      })
      .sort((a, b) => {
        const aRatio = a.cvsScore / (a.adp || 200);
        const bRatio = b.cvsScore / (b.adp || 200);
        return bRatio - aRatio;
      })
      .slice(0, 3);
  }, [availablePlayers]);
  
  // Budget bargains - $5 or less with good value
  const budgetBargains = useMemo(() => {
    return availablePlayers
      .filter(p => {
        const auctionValue = p.auctionValue || 0;
        return auctionValue <= 5 && auctionValue > 0 && p.projectedPoints >= 50;
      })
      .sort((a, b) => {
        // Sort by projected points per dollar
        const aValue = a.projectedPoints / (a.auctionValue || 1);
        const bValue = b.projectedPoints / (b.auctionValue || 1);
        return bValue - aValue;
      })
      .slice(0, 3);
  }, [availablePlayers]);
  
  // PPR targets - High reception volume
  const pprTargets = useMemo(() => {
    return availablePlayers
      .filter(p => p.receptions && p.receptions > 0)
      .sort((a, b) => (b.receptions || 0) - (a.receptions || 0))
      .slice(0, 3);
  }, [availablePlayers]);
  
  return (
    <div className="bg-dark-bg-secondary rounded-xl border border-dark-border">
      {/* Header */}
      <div className="p-3 border-b border-dark-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-yellow-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span className="font-bold">Need:</span> {teamNeeds.critical.length > 0 ? teamNeeds.critical.join(', ') : 'Roster Complete'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Content - Single view, no tabs */}
      <div className="p-3 space-y-3">
        {/* DRAFT NOW - Primary recommendation with alternatives */}
        {bestAvailable.length > 0 && (
          <div className="bg-draft-primary/10 border border-draft-primary rounded-lg p-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Primary pick - left side */}
              <div>
                <div className="text-base font-bold text-dark-text">
                  {bestAvailable[0].name} ({bestAvailable[0].position})
                </div>
                <div className="text-sm text-dark-text-secondary">
                  CVS: {isNaN(bestAvailable[0].cvsScore) ? 'N/A' : Math.round(bestAvailable[0].cvsScore)} • {Math.round(bestAvailable[0].projectedPoints)} pts
                </div>
              </div>
              
              {/* Also consider - right side */}
              {bestAvailable.length > 1 && (
                <div>
                  <div className="text-xs text-dark-text-secondary mb-1">Also consider:</div>
                  <div className="space-y-0.5">
                    {bestAvailable.slice(1, 3).map((player, idx) => (
                      <div key={player.id} className="text-xs text-dark-text-secondary">
                        {idx + 2}. {player.name} ({player.position})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Three columns of recommendations */}
        <div className="grid grid-cols-3 gap-3">
          {/* Value Picks */}
          <div className="bg-dark-bg rounded-lg p-2">
            <h4 className="text-xs font-semibold text-green-500 mb-2 flex items-center gap-1 cursor-help" 
                title="Players with ADP > 40, CVS > 30, projected points > 40, and high CVS relative to their ADP (value ratio > 0.25). R# = Expected draft round (e.g., R4 = Round 4)">
              <TrendingUp className="w-3 h-3" />
              VALUABLE PICKS
            </h4>
            <div className="space-y-1">
              {valuePicks.length > 0 ? (
                valuePicks.map((p, idx) => (
                  <div key={p.id} className="text-xs text-dark-text-secondary">
                    {idx + 1}. {p.name} (R{Math.ceil(p.adp / 12)})
                  </div>
                ))
              ) : (
                <div className="text-xs text-dark-text-secondary italic">No value picks found</div>
              )}
            </div>
          </div>
          
          {/* Budget Bargains */}
          <div className="bg-dark-bg rounded-lg p-2">
            <h4 className="text-xs font-semibold text-cyan-500 mb-2 flex items-center gap-1 cursor-help"
                title="Players valued at $5 or less with 50+ projected points, sorted by points per dollar">
              <DollarSign className="w-3 h-3" />
              BUDGET BARGAINS
            </h4>
            <div className="space-y-1">
              {budgetBargains.length > 0 ? (
                budgetBargains.map((p, idx) => (
                  <div key={p.id} className="text-xs text-dark-text-secondary">
                    {idx + 1}. {p.name} (${p.auctionValue})
                  </div>
                ))
              ) : (
                <div className="text-xs text-dark-text-secondary italic">No bargains found</div>
              )}
            </div>
          </div>
          
          {/* PPR Targets */}
          <div className="bg-dark-bg rounded-lg p-2">
            <h4 className="text-xs font-semibold text-yellow-500 mb-2 flex items-center gap-1 cursor-help"
                title="Players with highest projected reception counts, valuable in PPR (Point Per Reception) leagues">
              <Target className="w-3 h-3" />
              PPR TARGETS
            </h4>
            <div className="space-y-1">
              {pprTargets.length > 0 ? (
                pprTargets.map((p, idx) => (
                  <div key={p.id} className="text-xs text-dark-text-secondary">
                    {idx + 1}. {p.name} (+{Math.round(p.receptions || 0)})
                  </div>
                ))
              ) : (
                <div className="text-xs text-dark-text-secondary italic">No PPR targets found</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};