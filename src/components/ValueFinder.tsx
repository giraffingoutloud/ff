import React, { useMemo, useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Target, AlertTriangle } from 'lucide-react';
import { Player } from '../types';
import { improvedCanonicalService } from '../services/improvedCanonicalService';
import { dynamicCVSCalculator } from '../services/dynamicCVSCalculator';
import { useDraftStore } from '../store/draftStore';

interface ValueMetrics {
  player: Player;
  cvsScore: number;
  auctionValue: number;
  projectedPoints: number;
  valueRatio: number; // CVS per dollar
  pointsPerDollar: number;
  marketInefficiency: number; // How much the market undervalues based on CVS
}

export const ValueFinder: React.FC = () => {
  const { draftHistory } = useDraftStore();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [minCvsInput, setMinCvsInput] = useState('50');
  const [maxPriceInput, setMaxPriceInput] = useState('30');
  
  const minCvs = minCvsInput === '' ? 0 : Number(minCvsInput);
  const maxPrice = maxPriceInput === '' ? 200 : Number(maxPriceInput);
  
  // Load all players once
  useEffect(() => {
    const loadPlayers = async () => {
      try {
        setIsLoading(true);
        const players = await improvedCanonicalService.initialize();
        // Calculate CVS for all players if needed
        const playersWithCVS = players.map(player => {
          if (!player.cvsScore || isNaN(player.cvsScore)) {
            return dynamicCVSCalculator.calculatePlayerCVS(player);
          }
          return player;
        });
        console.log(`ValueFinder loaded ${playersWithCVS.length} players`);
        // Log a few sample players to verify data
        if (playersWithCVS.length > 0) {
          console.log('Sample players:', playersWithCVS.slice(0, 3).map(p => ({
            name: p.name,
            cvs: p.cvsScore,
            auctionValue: p.auctionValue,
            projectedPoints: p.projectedPoints
          })));
        }
        setAllPlayers(playersWithCVS);
      } catch (error) {
        console.error('ValueFinder failed to load players:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPlayers();
  }, []);
  
  // Filter out drafted players
  const availablePlayers = useMemo(() => {
    const draftedIds = new Set(draftHistory.map(dp => dp.id));
    return allPlayers.filter(p => !draftedIds.has(p.id));
  }, [allPlayers, draftHistory]);
  
  const valueFinds = useMemo(() => {
    // Calculate value metrics for available players only
    const metrics: ValueMetrics[] = availablePlayers
      .filter(p => p.auctionValue && p.auctionValue >= 2 && p.cvsScore > 0) // Filter out $1 players
      .map(p => {
        const auctionValue = p.auctionValue!; // We know it exists from filter
        const valueRatio = p.cvsScore / auctionValue;
        const pointsPerDollar = p.projectedPoints / auctionValue;
        
        // Calculate expected auction value based on CVS
        // Top player has CVS ~100 and costs ~$60, so roughly 1.67 CVS per dollar at the top
        // But this varies by position and scarcity
        const expectedPrice = p.cvsScore / 1.5; // Baseline expectation
        const marketInefficiency = expectedPrice - auctionValue;
        
        return {
          player: p,
          cvsScore: p.cvsScore,
          auctionValue: auctionValue,
          projectedPoints: p.projectedPoints,
          valueRatio,
          pointsPerDollar,
          marketInefficiency
        };
      });
    
    // Filter and sort by value ratio
    const filtered = metrics.filter(m => m.cvsScore >= minCvs && m.auctionValue <= maxPrice);
    
    // Debug: Log how many players match the criteria
    if (minCvs >= 90) {
      console.log(`Players with CVS >= ${minCvs} and price <= $${maxPrice}:`, filtered.length);
      console.log('First 5:', filtered.slice(0, 5).map(m => ({
        name: m.player.name, 
        cvs: Math.round(m.cvsScore), 
        price: m.auctionValue
      })));
    }
    
    return filtered
      .sort((a, b) => b.valueRatio - a.valueRatio)
      .slice(0, 20);
  }, [availablePlayers, minCvs, maxPrice]);
  
  // Find different types of arbitrage
  const arbitrageOpportunities = useMemo(() => {
    console.log(`ValueFinder: Available players: ${availablePlayers.length}, MinCVS: ${minCvs}, MaxPrice: ${maxPrice}`);
    
    const playersWithValidData = availablePlayers.filter(p => p.auctionValue && p.auctionValue >= 2 && p.cvsScore > 0);
    console.log(`Players with valid data: ${playersWithValidData.length}`);
    
    const allMetrics: ValueMetrics[] = playersWithValidData
      .map(p => {
        const auctionValue = p.auctionValue!; // We know it exists from filter
        return {
          player: p,
          cvsScore: p.cvsScore,
          auctionValue: auctionValue,
          projectedPoints: p.projectedPoints,
          valueRatio: p.cvsScore / auctionValue,
          pointsPerDollar: p.projectedPoints / auctionValue,
          marketInefficiency: (p.cvsScore / 1.5) - auctionValue
        };
      });
    
    const undervalued = allMetrics
      .filter(m => m.cvsScore >= minCvs && m.auctionValue <= maxPrice)
      .sort((a, b) => b.cvsScore - a.cvsScore);
    
    console.log(`Undervalued players found: ${undervalued.length}`);
    if (undervalued.length > 0) {
      console.log('First undervalued player:', {
        name: undervalued[0].player.name,
        cvs: undervalued[0].cvsScore,
        price: undervalued[0].auctionValue
      });
    }
    
    return {
      // High CVS but low price (respecting max price and min CVS filters)
      undervaluedElite: undervalued.slice(0, 20), // Show up to 20 players
      
      // Best bang for buck under $20 (or max price if lower)
      budgetGems: allMetrics
        .filter(m => m.auctionValue <= Math.min(20, maxPrice) && m.auctionValue >= 2) // $2+ only
        .sort((a, b) => b.valueRatio - a.valueRatio)
        .slice(0, 5),
      
      // High points per dollar (respecting max price)
      efficiencyKings: allMetrics
        .filter(m => m.projectedPoints > 100 && m.auctionValue <= maxPrice)
        .sort((a, b) => b.pointsPerDollar - a.pointsPerDollar)
        .slice(0, 5),
      
      // Market inefficiencies (respecting max price)
      marketMisses: allMetrics
        .filter(m => m.marketInefficiency > 10 && m.auctionValue <= maxPrice)
        .sort((a, b) => b.marketInefficiency - a.marketInefficiency)
        .slice(0, 5)
    };
  }, [availablePlayers, maxPrice, minCvs]);

  return (
    <div className="bg-dark-bg-secondary rounded-lg p-4 border border-dark-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-400" />
          Value Finder
        </h2>
      </div>
      
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-400">Min CVS</label>
          <input
            type="number"
            value={minCvsInput}
            onChange={(e) => setMinCvsInput(e.target.value)}
            className="w-20 px-2 py-1 bg-dark-bg text-white rounded text-sm"
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Max Price</label>
          <input
            type="number"
            value={maxPriceInput}
            onChange={(e) => setMaxPriceInput(e.target.value)}
            className="w-20 px-2 py-1 bg-dark-bg text-white rounded text-sm"
            placeholder="200"
          />
        </div>
      </div>
      
      {/* Loading State */}
      {isLoading && (
        <div className="text-xs text-gray-400 text-center py-4">Loading players...</div>
      )}
      
      {/* Filtered Players List */}
      {!isLoading && (
        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {arbitrageOpportunities.undervaluedElite.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">
              No players found matching criteria (CVS ≥ {minCvs}, Price ≤ ${maxPrice})
            </div>
          ) : (
            arbitrageOpportunities.undervaluedElite.map(m => (
              <div key={m.player.id} className="text-xs flex justify-between hover:bg-dark-bg/50 py-1">
            <span className="text-gray-300">
              {m.player.name}
              <span className="text-gray-500 ml-1">({m.player.position})</span>
            </span>
            <span>
              <span className={`${
                m.auctionValue >= 50 ? 'text-red-400' :
                m.auctionValue >= 40 ? 'text-orange-400' :
                m.auctionValue >= 30 ? 'text-amber-400' :
                m.auctionValue >= 20 ? 'text-yellow-400' :
                m.auctionValue >= 10 ? 'text-lime-400' :
                m.auctionValue >= 5 ? 'text-green-400' :
                m.auctionValue >= 3 ? 'text-teal-400' :
                'text-cyan-400'
              }`}>${m.auctionValue}</span>
              <span className="text-gray-400"> (CVS: </span>
              <span className={`${
                m.cvsScore >= 90 ? 'text-purple-400' :
                m.cvsScore >= 80 ? 'text-blue-400' :
                m.cvsScore >= 70 ? 'text-cyan-400' :
                m.cvsScore >= 60 ? 'text-teal-400' :
                'text-green-400'
              }`}>{Math.round(m.cvsScore)}</span>
              <span className="text-gray-400">, Pts: </span>
              <span className="text-gray-300">{Math.round(m.projectedPoints)}</span>
              {m.player.sos !== undefined && m.player.sos !== null && (
                <>
                  <span className="text-gray-400">, SOS: </span>
                  <span className={`${
                    m.player.sos <= 4 ? 'text-green-400' :
                    m.player.sos <= 6 ? 'text-yellow-400' :
                    m.player.sos <= 8 ? 'text-orange-400' :
                    'text-red-400'
                  }`}>{m.player.sos.toFixed(1)}</span>
                </>
              )}
              <span className="text-gray-400">)</span>
            </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};