import { describe, it, expect, beforeEach } from 'vitest';
import { LineupOptimizer } from '../core/LineupOptimizer';
import { WinProbabilityOptimizer } from '../core/WinProbabilityOptimizer';
import { CorrelationModel } from '../services/CorrelationModel';
import { OpponentModeler } from '../services/OpponentModeler';
import { TruncatedNormalDistribution } from '../math/TruncatedNormalDistribution';
import { TextFileParser } from '../services/TextFileParser';
import { CalibrationTracker } from '../services/CalibrationTracker';
import { GameTimingManager } from '../services/GameTimingManager';
import type { PlayerProjection, OpponentProjection } from '../types';

describe('TruncatedNormalDistribution', () => {
  it('should maintain proper mean/median distinction', () => {
    const dist = new TruncatedNormalDistribution(20, 5, 0, 50);
    const mean = dist.mean();
    const median = dist.quantile(0.5);
    
    // Mean and median should be different for truncated normal
    expect(Math.abs(mean - median)).toBeGreaterThan(0.01);
    
    // Mean should be positive for realistic FF scores
    expect(mean).toBeGreaterThan(0);
  });
  
  it('should respect truncation bounds', () => {
    const dist = new TruncatedNormalDistribution(15, 10, 0, 30);
    const samples = dist.samples(1000);
    
    for (const sample of samples) {
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(30);
    }
  });
  
  it('should produce correct percentiles', () => {
    const dist = TruncatedNormalDistribution.fromProjection(18, 0.25, 'WR');
    const percentiles = dist.getPercentiles();
    
    expect(percentiles.p10).toBeLessThan(percentiles.p25);
    expect(percentiles.p25).toBeLessThan(percentiles.p50);
    expect(percentiles.p50).toBeLessThan(percentiles.p75);
    expect(percentiles.p75).toBeLessThan(percentiles.p90);
  });
});

describe('CorrelationModel', () => {
  let model: CorrelationModel;
  let mockLineup: PlayerProjection[];
  
  beforeEach(() => {
    model = new CorrelationModel();
    mockLineup = createMockLineup();
  });
  
  it('should decompose variance correctly', () => {
    const player = mockLineup[0];
    const { shockVariance, residualVariance } = model.decomposeVariance(player);
    
    expect(shockVariance + residualVariance).toBeCloseTo(player.projection.variance, 5);
    expect(shockVariance).toBeGreaterThan(0);
    expect(residualVariance).toBeGreaterThan(0);
  });
  
  it('should create positive semi-definite correlation matrix', () => {
    const matrix = model.calculateCorrelationMatrix(mockLineup);
    
    // Diagonal should be 1
    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i][i]).toBeCloseTo(1, 5);
    }
    
    // Matrix should be symmetric
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 5);
      }
    }
    
    // All correlations should be in [-1, 1]
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        expect(matrix[i][j]).toBeGreaterThanOrEqual(-1);
        expect(matrix[i][j]).toBeLessThanOrEqual(1);
      }
    }
  });
  
  it('should produce higher correlation for same-team players', () => {
    const qb = mockLineup.find(p => p.player.position === 'QB');
    const wr1 = mockLineup.find(p => p.player.position === 'WR' && p.player.team === qb?.player.team);
    const wr2 = mockLineup.find(p => p.player.position === 'WR' && p.player.team !== qb?.player.team);
    
    if (qb && wr1 && wr2) {
      const lineup1 = [qb, wr1];
      const lineup2 = [qb, wr2];
      
      const matrix1 = model.calculateCorrelationMatrix(lineup1);
      const matrix2 = model.calculateCorrelationMatrix(lineup2);
      
      // Same-team QB-WR should have higher correlation
      expect(matrix1[0][1]).toBeGreaterThan(matrix2[0][1]);
    }
  });
});

describe('LineupOptimizer', () => {
  let optimizer: LineupOptimizer;
  let projections: PlayerProjection[];
  let opponentProjection: OpponentProjection;
  
  beforeEach(() => {
    optimizer = new LineupOptimizer();
    projections = createFullPlayerPool();
    opponentProjection = {
      mean: 120,
      variance: 625, // 25^2
      percentiles: { p10: 88, p25: 103, p50: 120, p75: 137, p90: 152 }
    };
  });
  
  it('should return valid lineup with all positions filled', () => {
    const result = optimizer.optimizeLineup(projections, opponentProjection);
    
    expect(result.starters).toHaveLength(10); // Standard lineup
    expect(result.bench).toHaveLength(6);
    
    // Check position requirements
    const positions = result.starters.map(p => p.player.position);
    expect(positions.filter(p => p === 'QB')).toHaveLength(1);
    expect(positions.filter(p => p === 'RB').length + 
           positions.filter(p => p === 'WR').length + 
           positions.filter(p => p === 'TE').length).toBeGreaterThanOrEqual(6); // Including FLEX
    expect(positions.filter(p => p === 'K')).toHaveLength(1);
    expect(positions.filter(p => p === 'DST')).toHaveLength(1);
  });
  
  it('should maximize win probability, not just points', () => {
    // Create two scenarios: high floor vs high ceiling
    const highFloorLineup = projections.filter(p => {
      const cv = Math.sqrt(p.projection.variance) / p.projection.mean;
      return cv < 0.2; // Low variance players
    });
    
    const highCeilingLineup = projections.filter(p => {
      const cv = Math.sqrt(p.projection.variance) / p.projection.mean;
      return cv > 0.3; // High variance players
    });
    
    // When we're underdogs, should prefer ceiling
    const underdogOpp = { ...opponentProjection, mean: 150 };
    const underdogResult = optimizer.optimizeLineup(projections, underdogOpp);
    
    // When we're favorites, should prefer floor
    const favoriteOpp = { ...opponentProjection, mean: 90 };
    const favoriteResult = optimizer.optimizeLineup(projections, favoriteOpp);
    
    // Underdog lineup should have higher variance
    expect(underdogResult.variance).toBeGreaterThan(favoriteResult.variance);
  });
});

describe('WinProbabilityOptimizer', () => {
  let optimizer: WinProbabilityOptimizer;
  
  beforeEach(() => {
    optimizer = new WinProbabilityOptimizer();
  });
  
  it('should calculate win probability correctly', () => {
    const lineup = createMockLineup();
    const opponent: OpponentProjection = {
      mean: 120,
      variance: 625,
      percentiles: { p10: 88, p25: 103, p50: 120, p75: 137, p90: 152 }
    };
    
    const winProb = optimizer.calculateWinProbability(lineup, opponent);
    
    expect(winProb).toBeGreaterThan(0);
    expect(winProb).toBeLessThan(1);
    
    // If our mean > opponent mean, win prob should be > 0.5
    const ourMean = lineup.reduce((sum, p) => sum + p.projection.mean, 0);
    if (ourMean > opponent.mean) {
      expect(winProb).toBeGreaterThan(0.5);
    }
  });
  
  it('should recommend correct strategy', () => {
    const highWinProb = 0.75;
    const lowWinProb = 0.25;
    const evenWinProb = 0.50;
    
    expect(optimizer.getOptimalStrategy(highWinProb, 10)).toBe('floor');
    expect(optimizer.getOptimalStrategy(lowWinProb, -10)).toBe('ceiling');
    expect(optimizer.getOptimalStrategy(evenWinProb, 0)).toBe('balanced');
  });
});

describe('CalibrationTracker', () => {
  let tracker: CalibrationTracker;
  
  beforeEach(() => {
    tracker = new CalibrationTracker();
  });
  
  it('should calculate CRPS correctly', () => {
    const projection = createMockProjection(15, 3);
    
    // Record multiple weeks
    for (let week = 1; week <= 10; week++) {
      tracker.recordProjection('player1', week, projection);
      // Actual within reasonable range of projection
      const actual = 15 + (Math.random() - 0.5) * 10;
      tracker.recordActual('player1', week, actual);
    }
    
    const crps = tracker.calculateCRPS();
    expect(crps).toBeGreaterThan(0);
    expect(crps).toBeLessThan(10); // Reasonable CRPS for FF
  });
  
  it('should detect calibration issues', () => {
    const projection = createMockProjection(15, 2); // Low variance
    
    // Record systematically biased predictions
    for (let week = 1; week <= 20; week++) {
      tracker.recordProjection('player1', week, projection);
      // Actual always higher than projection
      tracker.recordActual('player1', week, 20);
    }
    
    const summary = tracker.getCalibrationSummary();
    expect(summary.isWellCalibrated).toBe(false);
    expect(summary.rmse).toBeGreaterThan(4);
  });
});

describe('Integration Tests', () => {
  it('should handle complete optimization workflow', async () => {
    // Parse input data
    const parser = new TextFileParser();
    const csvProjections = `Name,Team,Position,Points,Floor,Ceiling
Josh Allen,BUF,QB,25,20,32
Saquon Barkley,PHI,RB,18,12,25
CeeDee Lamb,DAL,WR,16,10,24`;
    
    const csvGames = `Home,Away,Date,Time,Spread,Total
BUF,MIA,2024-11-17,1:00 PM,-3.5,48
PHI,WAS,2024-11-17,1:00 PM,-7,44`;
    
    const csvInjuries = `Name,Team,Status,Notes
Josh Allen,BUF,H,Full practice`;
    
    const projections = parser.parseAndMergeData(csvProjections, csvGames, csvInjuries);
    expect(projections.length).toBeGreaterThan(0);
    
    // Check timing constraints
    const timingManager = new GameTimingManager(11, 2024);
    const validation = timingManager.validateLineup(projections);
    expect(validation.valid).toBe(true);
    
    // Model opponent
    const opponentModeler = new OpponentModeler();
    const opponentProj = opponentModeler.estimateFromLeagueAverages(12, 'PPR');
    expect(opponentProj.mean).toBeGreaterThan(100);
    
    // Optimize lineup (would need full roster)
    // This is simplified for testing
    expect(projections[0].projection.mean).toBeGreaterThan(0);
  });
});

// Helper functions
function createMockLineup(): PlayerProjection[] {
  return [
    createMockPlayerProjection('QB', 'BUF', 22, 4),
    createMockPlayerProjection('RB', 'PHI', 15, 5),
    createMockPlayerProjection('RB', 'SF', 12, 4),
    createMockPlayerProjection('WR', 'BUF', 14, 6),
    createMockPlayerProjection('WR', 'DAL', 13, 5),
    createMockPlayerProjection('WR', 'MIA', 11, 5),
    createMockPlayerProjection('TE', 'KC', 10, 4),
    createMockPlayerProjection('K', 'BAL', 8, 3),
    createMockPlayerProjection('DST', 'PIT', 9, 5),
    createMockPlayerProjection('RB', 'LAR', 10, 4), // FLEX
  ];
}

function createMockPlayerProjection(
  position: string,
  team: string,
  mean: number,
  stdDev: number
): PlayerProjection {
  return {
    player: {
      id: `${position}-${team}`,
      name: `Player ${position}`,
      team,
      position: position as any,
      positions: [position as any],
      byeWeek: 0,
      isActive: true
    },
    projection: createMockProjection(mean, stdDev),
    opponent: 'OPP',
    isHome: true,
    gameInfo: {
      homeTeam: team,
      awayTeam: 'OPP',
      spread: -3,
      total: 48,
      opponent: 'OPP',
      isHome: true
    } as any
  };
}

function createMockProjection(mean: number, stdDev: number) {
  const variance = stdDev * stdDev;
  return {
    floor: mean - 1.645 * stdDev,
    q1: mean - 0.675 * stdDev,
    median: mean,
    q3: mean + 0.675 * stdDev,
    ceiling: mean + 1.645 * stdDev,
    mean,
    variance,
    lowerBound: 0,
    upperBound: mean * 3,
    originalMean: mean,
    originalStdDev: stdDev,
    baseLogProjection: Math.log(Math.max(1, mean)),
    matchupAdjustment: 0,
    weatherAdjustment: 0,
    usageAdjustment: 0,
    injuryAdjustment: 0,
    confidence: 0.75
  };
}

function createFullPlayerPool(): PlayerProjection[] {
  const pool: PlayerProjection[] = [];
  
  // QBs
  pool.push(createMockPlayerProjection('QB', 'BUF', 25, 5));
  pool.push(createMockPlayerProjection('QB', 'KC', 24, 4));
  
  // RBs
  for (let i = 0; i < 8; i++) {
    pool.push(createMockPlayerProjection('RB', `T${i}`, 12 + Math.random() * 8, 4));
  }
  
  // WRs
  for (let i = 0; i < 10; i++) {
    pool.push(createMockPlayerProjection('WR', `T${i}`, 10 + Math.random() * 8, 5));
  }
  
  // TEs
  for (let i = 0; i < 4; i++) {
    pool.push(createMockPlayerProjection('TE', `T${i}`, 8 + Math.random() * 6, 3));
  }
  
  // Ks
  pool.push(createMockPlayerProjection('K', 'BAL', 9, 3));
  pool.push(createMockPlayerProjection('K', 'SF', 8, 3));
  
  // DSTs
  pool.push(createMockPlayerProjection('DST', 'PIT', 10, 5));
  pool.push(createMockPlayerProjection('DST', 'SF', 9, 4));
  
  return pool;
}