import { Player, Position } from '../types';

interface PositionThresholds {
  max: number;
  elite: number;
  top10: number;
  top25: number;
  starter: number;
  replacement: number;
  average: number;
}

class DynamicThresholdService {
  private thresholds: Map<Position, PositionThresholds> = new Map();
  private initialized = false;

  calculateThresholds(players: Player[]): void {
    if (this.initialized) return;
    
    // Group players by position
    const byPosition = new Map<Position, Player[]>();
    players.forEach(player => {
      if (!byPosition.has(player.position)) {
        byPosition.set(player.position, []);
      }
      byPosition.get(player.position)!.push(player);
    });

    // Calculate thresholds for each position
    byPosition.forEach((posPlayers, position) => {
      // Sort by projected points
      const sorted = [...posPlayers].sort((a, b) => b.projectedPoints - a.projectedPoints);
      
      if (sorted.length === 0) return;
      
      // Starter counts for a 12-team league
      const starterCounts: Record<Position, number> = {
        QB: 12,  // 1 QB per team
        RB: 24,  // 2 RBs per team
        WR: 36,  // 3 WRs per team
        TE: 12,  // 1 TE per team
        K: 12,   // 1 K per team
        DST: 12  // 1 DST per team
      };
      
      const starterCount = starterCounts[position] || 12;
      
      // Calculate key thresholds
      const max = sorted[0].projectedPoints;
      const elite = sorted[Math.min(2, sorted.length - 1)].projectedPoints; // Top 3
      const top10 = sorted[Math.min(Math.floor(sorted.length * 0.1), sorted.length - 1)].projectedPoints;
      const top25 = sorted[Math.min(Math.floor(sorted.length * 0.25), sorted.length - 1)].projectedPoints;
      const starter = sorted[Math.min(starterCount - 1, sorted.length - 1)].projectedPoints;
      const replacement = sorted[Math.min(starterCount, sorted.length - 1)].projectedPoints;
      const average = sorted.reduce((sum, p) => sum + p.projectedPoints, 0) / sorted.length;
      
      this.thresholds.set(position, {
        max,
        elite,
        top10,
        top25,
        starter,
        replacement,
        average
      });
    });
    
    console.log('Dynamic Thresholds Calculated:');
    this.thresholds.forEach((threshold, position) => {
      console.log(`${position}:`, {
        max: threshold.max.toFixed(1),
        elite: threshold.elite.toFixed(1),
        top10: threshold.top10.toFixed(1),
        top25: threshold.top25.toFixed(1),
        starter: threshold.starter.toFixed(1),
        replacement: threshold.replacement.toFixed(1),
        average: threshold.average.toFixed(1)
      });
    });
    
    this.initialized = true;
  }

  getThresholds(position: Position): PositionThresholds | undefined {
    return this.thresholds.get(position);
  }

  getValueAboveReplacement(player: Player): number {
    const thresholds = this.thresholds.get(player.position);
    if (!thresholds) return 0;
    return Math.max(0, player.projectedPoints - thresholds.replacement);
  }

  // Calculate a normalized score (0-100) based on position
  getPercentileScore(player: Player): number {
    const thresholds = this.thresholds.get(player.position);
    if (!thresholds) return 50;
    
    const points = player.projectedPoints;
    
    // Scale based on where the player falls in the distribution
    if (points >= thresholds.max) return 100;
    if (points >= thresholds.elite) {
      // Elite tier: 90-100
      return 90 + ((points - thresholds.elite) / (thresholds.max - thresholds.elite)) * 10;
    }
    if (points >= thresholds.top10) {
      // Top 10%: 80-90
      return 80 + ((points - thresholds.top10) / (thresholds.elite - thresholds.top10)) * 10;
    }
    if (points >= thresholds.top25) {
      // Top 25%: 70-80
      return 70 + ((points - thresholds.top25) / (thresholds.top10 - thresholds.top25)) * 10;
    }
    if (points >= thresholds.starter) {
      // Starter tier: 55-70
      return 55 + ((points - thresholds.starter) / (thresholds.top25 - thresholds.starter)) * 15;
    }
    if (points >= thresholds.replacement) {
      // Replacement level: 40-55
      return 40 + ((points - thresholds.replacement) / (thresholds.starter - thresholds.replacement)) * 15;
    }
    // Below replacement: 0-40
    return Math.max(0, (points / thresholds.replacement) * 40);
  }
}

export const dynamicThresholdService = new DynamicThresholdService();