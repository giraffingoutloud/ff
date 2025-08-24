import { Player, GameInfo, PlayerProjection } from '../types';

/**
 * Correlation Service for modeling player correlations
 * Based on research showing 90% of perfect lineups have stacks
 */
export class CorrelationService {
  // Base correlations from research
  private readonly BASE_CORRELATIONS = {
    // Same team positive correlations
    'QB-WR1-same': 0.35,
    'QB-WR2-same': 0.25,
    'QB-TE-same': 0.20,
    'QB-RB-same': 0.08,
    
    // Same team negative correlations
    'RB-WR-same': -0.05,  // Compete for touches
    'WR1-WR2-same': -0.08, // Compete for targets
    
    // Game stack correlations
    'QB-OppWR1': 0.15,     // Shootout correlation
    'QB-OppQB': 0.12,      // High-scoring game
    'RB-OppRB': 0.05,      // Competitive game script
    
    // Negative correlations
    'QB-OppDST': -0.20,    // Direct opposition
    'RB-OppDST': -0.15,
    'WR-OppDST': -0.12,
    
    // Position group correlations
    'RB-DST-same': 0.12,   // Game script correlation
    'K-DST-same': 0.10,    // Field position
    'K-QB-same': 0.08      // Scoring opportunities
  };

  /**
   * Build correlation matrix for a set of players
   */
  buildCorrelationMatrix(
    players: PlayerProjection[],
    gameContext?: 'normal' | 'shootout' | 'blowout'
  ): number[][] {
    const n = players.length;
    const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1.0; // Perfect correlation with self
        } else {
          matrix[i][j] = this.calculateCorrelation(
            players[i],
            players[j],
            gameContext
          );
        }
      }
    }
    
    return matrix;
  }

  /**
   * Calculate correlation between two players
   */
  private calculateCorrelation(
    player1: PlayerProjection,
    player2: PlayerProjection,
    gameContext?: 'normal' | 'shootout' | 'blowout'
  ): number {
    // Start with base correlation
    let correlation = this.getBaseCorrelation(player1, player2);
    
    // Adjust for game context
    correlation = this.adjustForGameContext(
      correlation,
      player1,
      player2,
      gameContext
    );
    
    // Adjust for game environment (total, spread)
    correlation = this.adjustForGameEnvironment(
      correlation,
      player1,
      player2
    );
    
    // Cap correlation to realistic bounds
    return Math.max(-0.5, Math.min(0.5, correlation));
  }

  /**
   * Get base correlation between two players
   */
  private getBaseCorrelation(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): number {
    const p1 = player1.player;
    const p2 = player2.player;
    
    // Same player (shouldn't happen but safety check)
    if (p1.id === p2.id) return 1.0;
    
    // Same team correlations
    if (p1.team === p2.team) {
      return this.getSameTeamCorrelation(p1, p2);
    }
    
    // Opposing team correlations (game stack)
    if (this.areOpponents(player1, player2)) {
      return this.getOpposingTeamCorrelation(p1, p2);
    }
    
    // Different games - no correlation
    return 0;
  }

  /**
   * Get correlation for players on same team
   */
  private getSameTeamCorrelation(p1: Player, p2: Player): number {
    // QB correlations
    if (p1.position === 'QB' || p2.position === 'QB') {
      const qb = p1.position === 'QB' ? p1 : p2;
      const other = p1.position === 'QB' ? p2 : p1;
      
      switch (other.position) {
        case 'WR':
          // Assume WR1 vs WR2 based on projections (simplified)
          return this.BASE_CORRELATIONS['QB-WR1-same'];
        case 'TE':
          return this.BASE_CORRELATIONS['QB-TE-same'];
        case 'RB':
          return this.BASE_CORRELATIONS['QB-RB-same'];
        case 'K':
          return this.BASE_CORRELATIONS['K-QB-same'];
        default:
          return 0;
      }
    }
    
    // RB-WR correlation
    if ((p1.position === 'RB' && p2.position === 'WR') ||
        (p1.position === 'WR' && p2.position === 'RB')) {
      return this.BASE_CORRELATIONS['RB-WR-same'];
    }
    
    // WR-WR correlation
    if (p1.position === 'WR' && p2.position === 'WR') {
      return this.BASE_CORRELATIONS['WR1-WR2-same'];
    }
    
    // DST correlations
    if (p1.position === 'DST' || p2.position === 'DST') {
      const other = p1.position === 'DST' ? p2 : p1;
      
      switch (other.position) {
        case 'RB':
          return this.BASE_CORRELATIONS['RB-DST-same'];
        case 'K':
          return this.BASE_CORRELATIONS['K-DST-same'];
        default:
          return 0.05; // Small positive correlation
      }
    }
    
    return 0;
  }

  /**
   * Get correlation for players on opposing teams
   */
  private getOpposingTeamCorrelation(p1: Player, p2: Player): number {
    // QB vs opposing players
    if (p1.position === 'QB' || p2.position === 'QB') {
      const qb = p1.position === 'QB' ? p1 : p2;
      const opp = p1.position === 'QB' ? p2 : p1;
      
      switch (opp.position) {
        case 'QB':
          return this.BASE_CORRELATIONS['QB-OppQB'];
        case 'WR':
          return this.BASE_CORRELATIONS['QB-OppWR1'];
        case 'DST':
          return this.BASE_CORRELATIONS['QB-OppDST'];
        default:
          return 0.05; // Small positive for shootout potential
      }
    }
    
    // RB vs RB (competitive game script)
    if (p1.position === 'RB' && p2.position === 'RB') {
      return this.BASE_CORRELATIONS['RB-OppRB'];
    }
    
    // DST vs offensive players
    if (p1.position === 'DST' || p2.position === 'DST') {
      const dst = p1.position === 'DST' ? p1 : p2;
      const off = p1.position === 'DST' ? p2 : p1;
      
      switch (off.position) {
        case 'QB':
          return this.BASE_CORRELATIONS['QB-OppDST'];
        case 'RB':
          return this.BASE_CORRELATIONS['RB-OppDST'];
        case 'WR':
        case 'TE':
          return this.BASE_CORRELATIONS['WR-OppDST'];
        default:
          return -0.05;
      }
    }
    
    return 0;
  }

  /**
   * Adjust correlation based on game context
   */
  private adjustForGameContext(
    baseCorrelation: number,
    player1: PlayerProjection,
    player2: PlayerProjection,
    gameContext?: 'normal' | 'shootout' | 'blowout'
  ): number {
    if (!gameContext || gameContext === 'normal') {
      return baseCorrelation;
    }
    
    // Shootout environment increases passing correlations
    if (gameContext === 'shootout') {
      const bothPassing = this.isPassingPlayer(player1) && this.isPassingPlayer(player2);
      if (bothPassing) {
        return baseCorrelation * 1.3; // 30% boost
      }
    }
    
    // Blowout reduces correlations (garbage time)
    if (gameContext === 'blowout') {
      // Reduce all correlations except DST
      if (player1.player.position !== 'DST' && player2.player.position !== 'DST') {
        return baseCorrelation * 0.7; // 30% reduction
      }
    }
    
    return baseCorrelation;
  }

  /**
   * Adjust correlation based on game environment (Vegas lines)
   */
  private adjustForGameEnvironment(
    correlation: number,
    player1: PlayerProjection,
    player2: PlayerProjection
  ): number {
    // Both players must be in same game
    if (!this.inSameGame(player1, player2)) {
      return correlation;
    }
    
    const gameInfo = player1.gameInfo;
    
    // High total games (50+) increase correlations
    if (gameInfo.total > 50) {
      correlation *= 1.15;
    }
    // Low total games (40-) decrease correlations
    else if (gameInfo.total < 40) {
      correlation *= 0.85;
    }
    
    // Close spreads increase QB-QB and WR-WR correlations
    if (Math.abs(gameInfo.spread) < 3) {
      if (this.isPassingPlayer(player1) && this.isPassingPlayer(player2)) {
        correlation *= 1.1;
      }
    }
    // Large spreads (10+) affect correlations
    else if (Math.abs(gameInfo.spread) > 10) {
      // Favored team RB gets boost
      const favored = gameInfo.spread > 0 ? gameInfo.homeTeam : gameInfo.awayTeam;
      if ((player1.player.team === favored && player1.player.position === 'RB') ||
          (player2.player.team === favored && player2.player.position === 'RB')) {
        correlation *= 1.2;
      }
    }
    
    return correlation;
  }

  /**
   * Check if two players are opponents
   */
  private areOpponents(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): boolean {
    const game1 = player1.gameInfo;
    const game2 = player2.gameInfo;
    
    if (!game1 || !game2) return false;
    
    return (game1.homeTeam === game2.homeTeam && game1.awayTeam === game2.awayTeam) ||
           (game1.homeTeam === game2.awayTeam && game1.awayTeam === game2.homeTeam);
  }

  /**
   * Check if two players are in same game
   */
  private inSameGame(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): boolean {
    return this.areOpponents(player1, player2) || 
           player1.player.team === player2.player.team;
  }

  /**
   * Check if player is passing game beneficiary
   */
  private isPassingPlayer(player: PlayerProjection): boolean {
    const pos = player.player.position;
    return pos === 'QB' || pos === 'WR' || pos === 'TE';
  }

  /**
   * Get recommended stacks based on correlations
   */
  getRecommendedStacks(
    availablePlayers: PlayerProjection[],
    primaryPlayer: PlayerProjection
  ): StackRecommendation[] {
    const recommendations: StackRecommendation[] = [];
    
    // Find correlated players
    for (const player of availablePlayers) {
      if (player.player.id === primaryPlayer.player.id) continue;
      
      const correlation = this.calculateCorrelation(primaryPlayer, player);
      
      if (correlation > 0.15) {
        recommendations.push({
          primaryPlayer: primaryPlayer.player,
          stackPlayer: player.player,
          correlation,
          type: this.getStackType(primaryPlayer, player),
          expectedBoost: correlation * 0.15 // Simplified boost calculation
        });
      }
    }
    
    // Sort by correlation strength
    return recommendations.sort((a, b) => b.correlation - a.correlation);
  }

  /**
   * Identify stack type
   */
  private getStackType(
    player1: PlayerProjection,
    player2: PlayerProjection
  ): StackType {
    if (player1.player.team === player2.player.team) {
      if (player1.player.position === 'QB' && player2.player.position === 'WR') {
        return 'QB-WR';
      }
      if (player1.player.position === 'QB' && player2.player.position === 'TE') {
        return 'QB-TE';
      }
      return 'SAME-TEAM';
    }
    
    if (this.areOpponents(player1, player2)) {
      return 'GAME-STACK';
    }
    
    return 'OTHER';
  }

  /**
   * Calculate lineup correlation score
   */
  calculateLineupCorrelation(lineup: PlayerProjection[]): number {
    const matrix = this.buildCorrelationMatrix(lineup);
    let totalCorrelation = 0;
    let pairs = 0;
    
    for (let i = 0; i < matrix.length; i++) {
      for (let j = i + 1; j < matrix.length; j++) {
        totalCorrelation += Math.abs(matrix[i][j]);
        pairs++;
      }
    }
    
    return pairs > 0 ? totalCorrelation / pairs : 0;
  }
}

// Types
type StackType = 'QB-WR' | 'QB-TE' | 'SAME-TEAM' | 'GAME-STACK' | 'OTHER';

interface StackRecommendation {
  primaryPlayer: Player;
  stackPlayer: Player;
  correlation: number;
  type: StackType;
  expectedBoost: number;
}

export { StackRecommendation, StackType };