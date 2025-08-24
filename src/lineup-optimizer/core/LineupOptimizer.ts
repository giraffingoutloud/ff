import {
  PlayerProjection,
  OptimizedLineup,
  LineupRequirements,
  OpponentProjection
} from '../types';
import { CorrelationModel } from '../services/CorrelationModel';
import { WinProbabilityCalculator } from './WinProbabilityCalculator';

/**
 * K-best Dynamic Programming Lineup Optimizer
 * Optimizes for win probability using proper statistical framework
 */
export class LineupOptimizer {
  private readonly K = 50; // Keep top K candidates per state
  private correlationModel: CorrelationModel;
  private winProbCalculator: WinProbabilityCalculator;
  
  // ESPN standard lineup requirements (12-team PPR)
  private readonly STANDARD_REQUIREMENTS: LineupRequirements = {
    QB: 1,
    RB: 2,
    WR: 3,
    TE: 1,
    FLEX: 1, // RB/WR/TE
    K: 1,
    DST: 1,
    BENCH: 6
  };
  
  constructor() {
    this.correlationModel = new CorrelationModel();
    this.winProbCalculator = new WinProbabilityCalculator();
  }
  
  /**
   * Main optimization entry point
   */
  optimizeLineup(
    playerProjections: PlayerProjection[],
    opponentProjection: OpponentProjection,
    requirements: LineupRequirements = this.STANDARD_REQUIREMENTS,
    lockedPlayers: Set<string> = new Set(),
    excludedPlayers: Set<string> = new Set(),
    strategy: 'floor' | 'ceiling' | 'balanced' = 'balanced'
  ): OptimizedLineup {
    // Filter eligible players
    const eligiblePlayers = playerProjections.filter(p => 
      p.player.isActive && 
      !excludedPlayers.has(p.player.id) &&
      p.projection.confidence > 0
    );
    
    console.log('LineupOptimizer: Starting optimization');
    console.log('Input players:', playerProjections.length);
    console.log('Eligible players after filtering:', eligiblePlayers.length);
    console.log('Player positions:', eligiblePlayers.map(p => `${p.player.name} (${p.player.position})`));
    console.log('Requirements:', requirements);
    
    // Run k-best DP to generate candidate lineups
    const candidates = this.kBestDP(
      eligiblePlayers,
      requirements,
      lockedPlayers,
      strategy
    );
    
    console.log('Candidates found:', candidates.length);
    
    // Evaluate each candidate for win probability
    let bestLineup: OptimizedLineup | null = null;
    let bestWinProb = -1;
    
    console.log('Evaluating candidates for win probability...');
    console.log('Total candidates to evaluate:', candidates.length);
    
    // Debug: Check first candidate structure
    if (candidates.length > 0) {
      console.log('First candidate structure:', {
        hasStarters: !!candidates[0].starters,
        startersLength: candidates[0].starters?.length,
        expectedPoints: candidates[0].expectedPoints,
        firstStarter: candidates[0].starters?.[0]
      });
    }
    
    // Evaluate ALL candidates to find the one with best win probability
    let evaluationErrors = 0;
    
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      
      try {
        console.log(`\nEvaluating candidate ${i + 1}/${candidates.length}:`);
        console.log('- Expected points:', candidate.expectedPoints);
        console.log('- Starters count:', candidate.starters?.length || 0);
        
        // Validate candidate structure
        if (!candidate.starters || candidate.starters.length === 0) {
          console.error(`Candidate ${i + 1} has no starters!`);
          continue;
        }
        
        // Calculate correlation matrix
        const correlationMatrix = this.correlationModel.calculateCorrelationMatrix(candidate.starters);
        console.log('- Correlation matrix type:', typeof correlationMatrix, 'Is array:', Array.isArray(correlationMatrix));
        
        // Calculate lineup variance
        const lineupVariance = this.correlationModel.calculateLineupVariance(
          candidate.starters,
          correlationMatrix
        );
        console.log('- Lineup variance:', lineupVariance);
        
        // Validate variance
        if (isNaN(lineupVariance) || lineupVariance <= 0) {
          console.error(`Invalid variance for candidate ${i + 1}:`, lineupVariance);
          continue;
        }
        
        // Calculate win probability
        const winProb = this.winProbCalculator.calculateWinProbability(
          candidate.expectedPoints,
          lineupVariance,
          opponentProjection.mean,
          opponentProjection.variance || 625 // Default variance if not provided
        );
        console.log('- Win probability:', (winProb * 100).toFixed(2) + '%');
        
        // Validate win probability
        if (isNaN(winProb)) {
          console.error(`Invalid win probability for candidate ${i + 1}:`, winProb);
          continue;
        }
        
        // Check if this is the best lineup so far
        if (winProb > bestWinProb || bestLineup === null) {
          bestWinProb = winProb;
          bestLineup = {
            ...candidate,
            variance: lineupVariance,
            winProbability: winProb,
            opponentProjection,
            correlationStructure: {
              teams: this.groupByTeam(candidate.starters),
              correlationMatrix: correlationMatrix,
              teamShockVariances: this.calculateTeamShockVariances(candidate.starters)
            }
          };
          console.log('*** New best lineup found with win prob:', (winProb * 100).toFixed(2) + '%');
        }
      } catch (err) {
        evaluationErrors++;
        console.error(`Error evaluating candidate ${i + 1}:`, err.message);
        
        // If all candidates are failing, use the first one with defaults
        if (evaluationErrors === candidates.length && i === candidates.length - 1 && !bestLineup) {
          console.log('All candidates failed evaluation, using first with defaults');
          bestLineup = {
            ...candidates[0],
            variance: 100,
            winProbability: 0.5,
            opponentProjection,
            correlationStructure: {
              teams: this.groupByTeam(candidates[0].starters),
              correlationMatrix: [],
              teamShockVariances: new Map()
            }
          };
        }
      }
    }
    
    console.log('Evaluation complete. Errors:', evaluationErrors, 'of', candidates.length);
    
    console.log('Final best win prob:', bestWinProb);
    console.log('Best lineup found:', bestLineup ? 'Yes' : 'No');
    
    if (!bestLineup) {
      console.error('No valid lineup found. Debug info:', {
        candidatesCount: candidates.length,
        eligiblePlayersCount: eligiblePlayers.length,
        requirements,
        playersByPosition: eligiblePlayers.reduce((acc, p) => {
          const pos = p.player.position;
          acc[pos] = (acc[pos] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });
      throw new Error(`No valid lineup found. Found ${candidates.length} candidates from ${eligiblePlayers.length} eligible players.`);
    }
    
    return bestLineup;
  }
  
  /**
   * K-best dynamic programming implementation
   */
  private kBestDP(
    players: PlayerProjection[],
    requirements: LineupRequirements,
    lockedPlayers: Set<string>,
    strategy: 'floor' | 'ceiling' | 'balanced' = 'balanced'
  ): OptimizedLineup[] {
    // State: (QB_used, RB_used, WR_used, TE_used, FLEX_used, K_used, DST_used)
    // Total states: 2 × 3 × 4 × 2 × 2 × 2 × 2 = 384 base states
    // With FLEX, we need to track what went into FLEX
    
    interface DPState {
      qb: number;
      rb: number;
      wr: number;
      te: number;
      flex: number;
      k: number;
      dst: number;
      players: PlayerProjection[];
      value: number; // Expected points for now, will optimize on win prob later
    }
    
    // Initialize DP table: Map from state key to top K candidates
    const dp = new Map<string, DPState[]>();
    
    // Helper to create state key
    const stateKey = (s: Omit<DPState, 'players' | 'value'>): string => {
      return `${s.qb},${s.rb},${s.wr},${s.te},${s.flex},${s.k},${s.dst}`;
    };
    
    // Initial state
    const initState: DPState = {
      qb: 0, rb: 0, wr: 0, te: 0, flex: 0, k: 0, dst: 0,
      players: [],
      value: 0
    };
    dp.set(stateKey(initState), [initState]);
    
    // Sort players by expected value for pruning
    const sortedPlayers = [...players].sort((a, b) => 
      b.projection.mean - a.projection.mean
    );
    
    // Process each player
    for (const player of sortedPlayers) {
      const newDp = new Map<string, DPState[]>();
      
      // Copy existing states
      for (const [key, states] of dp) {
        if (!newDp.has(key)) {
          newDp.set(key, states);
        }
      }
      
      // Try adding this player to each state
      for (const [key, states] of dp) {
        for (const state of states) {
          // Skip if player already selected
          if (state.players.some(p => p.player.id === player.player.id)) {
            continue;
          }
          
          // Generate all valid next states
          const nextStates = this.getValidNextStates(state, player, requirements, strategy);
          
          for (const nextState of nextStates) {
            const nextKey = stateKey(nextState);
            
            // Get current candidates for this state
            const currentCandidates = newDp.get(nextKey) || [];
            
            // Add new candidate
            currentCandidates.push(nextState);
            
            // Keep only top K by value
            currentCandidates.sort((a, b) => b.value - a.value);
            newDp.set(nextKey, currentCandidates.slice(0, this.K));
          }
        }
      }
      
      dp.clear();
      for (const [key, states] of newDp) {
        dp.set(key, states);
      }
    }
    
    // Find complete lineups
    const targetKey = stateKey({
      qb: requirements.QB,
      rb: requirements.RB,
      wr: requirements.WR,
      te: requirements.TE,
      flex: requirements.FLEX,
      k: requirements.K,
      dst: requirements.DST
    });
    
    const completeCandidates = dp.get(targetKey) || [];
    
    console.log('kBestDP results:');
    console.log('Target key:', targetKey);
    console.log('Complete candidates found:', completeCandidates.length);
    console.log('All DP states:', Array.from(dp.keys()));
    
    // Convert to OptimizedLineup format
    return completeCandidates.map(state => {
      const starters = state.players;
      const bench = this.selectBench(players, starters, requirements.BENCH);
      
      return {
        starters,
        bench,
        expectedPoints: state.value,
        variance: 0, // Will be calculated later
        floor: starters.reduce((sum, p) => sum + p.projection.floor, 0),
        ceiling: starters.reduce((sum, p) => sum + p.projection.ceiling, 0),
        winProbability: 0, // Will be calculated later
        opponentProjection: { mean: 0, variance: 0, percentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 } },
        confidence: Math.min(...starters.map(p => p.projection.confidence))
      };
    });
  }
  
  /**
   * Get valid next states when adding a player
   */
  private getPlayerValue(
    player: PlayerProjection,
    strategy: 'floor' | 'ceiling' | 'balanced'
  ): number {
    switch (strategy) {
      case 'floor':
        return player.projection.floor;
      case 'ceiling':
        return player.projection.ceiling;
      case 'balanced':
      default:
        return player.projection.mean;
    }
  }
  
  private getValidNextStates(
    currentState: any,
    player: PlayerProjection,
    requirements: LineupRequirements,
    strategy: 'floor' | 'ceiling' | 'balanced' = 'balanced'
  ): any[] {
    const nextStates: any[] = [];
    const pos = player.player.position;
    
    // Try adding to primary position
    if (pos === 'QB' && currentState.qb < requirements.QB) {
      nextStates.push({
        ...currentState,
        qb: currentState.qb + 1,
        players: [...currentState.players, player],
        value: currentState.value + this.getPlayerValue(player, strategy)
      });
    }
    if (pos === 'RB' && currentState.rb < requirements.RB) {
      nextStates.push({
        ...currentState,
        rb: currentState.rb + 1,
        players: [...currentState.players, player],
        value: currentState.value + this.getPlayerValue(player, strategy)
      });
    }
    if (pos === 'WR' && currentState.wr < requirements.WR) {
      nextStates.push({
        ...currentState,
        wr: currentState.wr + 1,
        players: [...currentState.players, player],
        value: currentState.value + this.getPlayerValue(player, strategy)
      });
    }
    if (pos === 'TE' && currentState.te < requirements.TE) {
      nextStates.push({
        ...currentState,
        te: currentState.te + 1,
        players: [...currentState.players, player],
        value: currentState.value + this.getPlayerValue(player, strategy)
      });
    }
    if (pos === 'K' && currentState.k < requirements.K) {
      nextStates.push({
        ...currentState,
        k: currentState.k + 1,
        players: [...currentState.players, player],
        value: currentState.value + this.getPlayerValue(player, strategy)
      });
    }
    if (pos === 'DST' && currentState.dst < requirements.DST) {
      nextStates.push({
        ...currentState,
        dst: currentState.dst + 1,
        players: [...currentState.players, player],
        value: currentState.value + this.getPlayerValue(player, strategy)
      });
    }
    
    // Try adding to FLEX if eligible (RB/WR/TE)
    if (['RB', 'WR', 'TE'].includes(pos) && currentState.flex < requirements.FLEX) {
      // Only add to FLEX if primary positions are filled or this is strategic
      const canFlex = (
        (pos === 'RB' && currentState.rb >= requirements.RB) ||
        (pos === 'WR' && currentState.wr >= requirements.WR) ||
        (pos === 'TE' && currentState.te >= requirements.TE) ||
        // Allow flexing even if primary not filled for high-value players
        player.projection.mean > 12
      );
      
      if (canFlex) {
        nextStates.push({
          ...currentState,
          flex: currentState.flex + 1,
          players: [...currentState.players, player],
          value: currentState.value + this.getPlayerValue(player, strategy)
        });
      }
    }
    
    return nextStates;
  }
  
  /**
   * Select bench players
   */
  private selectBench(
    allPlayers: PlayerProjection[],
    starters: PlayerProjection[],
    benchSize: number
  ): PlayerProjection[] {
    const starterIds = new Set(starters.map(p => p.player.id));
    
    const availableBench = allPlayers
      .filter(p => !starterIds.has(p.player.id) && p.player.isActive)
      .sort((a, b) => b.projection.mean - a.projection.mean);
    
    return availableBench.slice(0, benchSize);
  }
  
  /**
   * Group players by team
   */
  private groupByTeam(players: PlayerProjection[]): Map<string, PlayerProjection[]> {
    const teams = new Map<string, PlayerProjection[]>();
    
    for (const player of players) {
      const team = player.player.team;
      if (!teams.has(team)) {
        teams.set(team, []);
      }
      teams.get(team)!.push(player);
    }
    
    return teams;
  }
  
  /**
   * Calculate team shock variances
   */
  private calculateTeamShockVariances(players: PlayerProjection[]): Map<string, number> {
    const teamVariances = new Map<string, number>();
    const teams = this.groupByTeam(players);
    
    for (const [team, teamPlayers] of teams) {
      let totalShockVariance = 0;
      
      for (const player of teamPlayers) {
        const decomposed = this.correlationModel.decomposeVariance(player);
        totalShockVariance += decomposed.shockVariance;
      }
      
      teamVariances.set(team, totalShockVariance / teamPlayers.length);
    }
    
    return teamVariances;
  }
}