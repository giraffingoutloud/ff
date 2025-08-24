import { Player, PlayerProjection, GameInfo, Projection, InjuryStatus } from '../types';
import { NameNormalizer } from '../../services/nameNormalizer';
import { TruncatedNormalDistribution } from '../math/TruncatedNormalDistribution';

interface TextProjection {
  playerName: string;
  team: string;
  position: string;
  projectedPoints: number;
  floor?: number;
  ceiling?: number;
}

interface TextGame {
  homeTeam: string;
  awayTeam: string;
  date: string;
  time: string;
  spread: number;
  total: number;
}

interface TextInjury {
  playerName: string;
  team: string;
  status: string;
  practiceNotes?: string;
}

export class TextFileParser {
  private nameNormalizer: NameNormalizer;

  constructor() {
    this.nameNormalizer = new NameNormalizer();
  }

  parseAndMergeData(
    projectionsText: string,
    gamesText: string,
    injuriesText: string
  ): PlayerProjection[] {
    console.log('TextFileParser: Starting parse...');
    const projections = this.parseProjections(projectionsText);
    console.log('TextFileParser: Parsed', projections.length, 'projections');
    
    const games = this.parseGames(gamesText);
    console.log('TextFileParser: Parsed', games.length, 'games');
    
    const injuries = this.parseInjuries(injuriesText);
    console.log('TextFileParser: Parsed', injuries.length, 'injuries');

    const result = this.mergeData(projections, games, injuries);
    console.log('TextFileParser: Merged into', result.length, 'player projections');
    
    return result;
  }

  private parseProjections(text: string): TextProjection[] {
    if (!text.trim()) return [];

    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
      const values = this.parseCSVLine(line);
      return {
        playerName: values[0]?.trim() || '',
        team: values[1]?.trim() || '',
        position: values[2]?.trim() || '',
        projectedPoints: parseFloat(values[3]) || 0,
        floor: values[4] ? parseFloat(values[4]) : undefined,
        ceiling: values[5] ? parseFloat(values[5]) : undefined
      };
    }).filter(p => p.playerName && p.projectedPoints > 0);
  }

  private parseGames(text: string): TextGame[] {
    if (!text.trim()) return [];

    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
      const values = this.parseCSVLine(line);
      return {
        homeTeam: values[0]?.trim() || '',
        awayTeam: values[1]?.trim() || '',
        date: values[2]?.trim() || '',
        time: values[3]?.trim() || '',
        spread: parseFloat(values[4]) || 0,
        total: parseFloat(values[5]) || 45
      };
    }).filter(g => g.homeTeam && g.awayTeam);
  }

  private parseInjuries(text: string): TextInjury[] {
    if (!text.trim()) return [];

    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    return lines.slice(1).map(line => {
      const values = this.parseCSVLine(line);
      return {
        playerName: values[0]?.trim() || '',
        team: values[1]?.trim() || '',
        status: values[2]?.trim() || 'H',
        practiceNotes: values[3]?.trim()
      };
    }).filter(i => i.playerName);
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }

  private mergeData(
    projections: TextProjection[],
    games: TextGame[],
    injuries: TextInjury[]
  ): PlayerProjection[] {
    // Create lookup maps
    const injuryMap = new Map<string, TextInjury>();
    for (const injury of injuries) {
      const key = this.nameNormalizer.normalize(injury.playerName);
      injuryMap.set(key, injury);
    }

    const gameMap = new Map<string, TextGame>();
    for (const game of games) {
      gameMap.set(game.homeTeam, game);
      gameMap.set(game.awayTeam, { ...game, spread: -game.spread });
    }

    // Convert to PlayerProjection format
    return projections.map(proj => {
      const normalizedName = this.nameNormalizer.normalize(proj.playerName);
      const injury = injuryMap.get(normalizedName);
      const game = gameMap.get(proj.team);

      const injuryStatus = this.parseInjuryStatus(injury?.status);
      const player: Player = {
        id: `${normalizedName}_${proj.team}`,
        name: proj.playerName,
        team: proj.team,
        position: this.normalizePosition(proj.position),
        positions: [this.normalizePosition(proj.position)], // Single position for now
        injuryStatus: injuryStatus === 'healthy' ? undefined : injuryStatus.toUpperCase() as InjuryStatus,
        byeWeek: 0, // Not provided in text file
        isActive: injuryStatus !== 'out' && injuryStatus !== 'ir',
        status: injuryStatus,
        injuryDetails: injury?.practiceNotes,
        practiceParticipation: this.parsePracticeNotes(injury?.practiceNotes),
        projectedPoints: proj.projectedPoints,
        salary: 0,
        ownership: 0
      };

      // Position-specific CV for more realistic variance
      const positionCV: Record<string, number> = {
        'QB': 0.20,   // 20% - moderate variance
        'RB': 0.25,   // 25% - game script dependent
        'WR': 0.30,   // 30% - high variance
        'TE': 0.35,   // 35% - TD dependent
        'K': 0.40,    // 40% - FG opportunity variance
        'DST': 0.60,  // 60% - high volatility (turnovers/TDs)
      };
      
      const position = this.normalizePosition(proj.position);
      const cv = positionCV[position] || 0.25;
      
      // Create truncated normal distribution
      const dist = TruncatedNormalDistribution.fromProjection(
        proj.projectedPoints,
        cv,
        position
      );
      
      const percentiles = dist.getPercentiles();
      const mean = dist.mean();
      const variance = dist.variance();
      
      // Use provided floor/ceiling if available, otherwise use distribution
      const projection: Projection = {
        floor: proj.floor || percentiles.p10,
        q1: percentiles.p25,
        median: percentiles.p50,
        q3: percentiles.p75,
        ceiling: proj.ceiling || percentiles.p90,
        mean: mean,
        variance: variance,
        lowerBound: position === 'DST' ? -5 : 0,
        upperBound: position === 'K' ? 25 : proj.projectedPoints * 3,
        originalMean: proj.projectedPoints,
        originalStdDev: proj.projectedPoints * cv,
        baseLogProjection: Math.log(Math.max(1, mean)),
        matchupAdjustment: 0,
        usageAdjustment: 0,
        trendAdjustment: 0,
        weatherAdjustment: 0,
        injuryAdjustment: this.calculateInjuryAdjustment(injury?.status),
        confidence: injury?.status && injury.status !== 'H' ? 0.6 : 0.75,
        components: {}
      };

      const gameInfo: GameInfo = game ? {
        opponent: game.homeTeam === proj.team ? game.awayTeam : game.homeTeam,
        isHome: game.homeTeam === proj.team,
        gameTime: this.parseGameTime(game.date, game.time),
        spread: game.spread,
        total: game.total,
        impliedPoints: this.calculateImpliedPoints(game.total, game.spread, game.homeTeam === proj.team),
        oppDefenseRank: 16,
        oppPaceRank: 16,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam
      } : this.getDefaultGameInfo();

      return {
        player,
        projection,
        gameInfo,
        opponent: gameInfo.opponent,
        isHome: gameInfo.isHome,
        weather: null,
        vorp: 0
      };
    });
  }

  private normalizePosition(position: string): Player['position'] {
    const normalized = position.toUpperCase().replace(/[^A-Z]/g, '');
    
    const positionMap: Record<string, Player['position']> = {
      'QB': 'QB',
      'RB': 'RB',
      'WR': 'WR',
      'TE': 'TE',
      'DST': 'DST',
      'DEF': 'DST',
      'K': 'K',
      'PK': 'K'
    };
    
    return positionMap[normalized] || 'WR';
  }

  private parseInjuryStatus(status?: string): Player['status'] {
    if (!status) return 'healthy';
    
    switch (status.toUpperCase()) {
      case 'Q': return 'questionable';
      case 'D': return 'doubtful';
      case 'O': return 'out';
      case 'IR': return 'ir';
      default: return 'healthy';
    }
  }

  private parsePracticeNotes(notes?: string): 'FP' | 'LP' | 'DNP' | undefined {
    if (!notes) return undefined;
    
    const upper = notes.toUpperCase();
    if (upper.includes('DNP') || upper.includes('DID NOT')) return 'DNP';
    if (upper.includes('LIMITED')) return 'LP';
    if (upper.includes('FULL')) return 'FP';
    
    return undefined;
  }

  private calculateInjuryAdjustment(status?: string): number {
    if (!status) return 0;
    
    switch (status.toUpperCase()) {
      case 'Q': return -0.1;
      case 'D': return -0.3;
      case 'O': return -1.0;
      case 'IR': return -1.0;
      default: return 0;
    }
  }

  private parseGameTime(date: string, time: string): Date {
    try {
      // Try to parse the date and time
      const dateTime = new Date(`${date} ${time}`);
      if (!isNaN(dateTime.getTime())) {
        return dateTime;
      }
    } catch {
      // Fall through to default
    }
    
    // Default to next Sunday at 1 PM
    const now = new Date();
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    const nextSunday = new Date(now.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000);
    nextSunday.setHours(13, 0, 0, 0);
    return nextSunday;
  }

  private calculateImpliedPoints(total: number, spread: number, isHome: boolean): number {
    const homeImplied = (total + spread) / 2;
    const awayImplied = (total - spread) / 2;
    return isHome ? homeImplied : awayImplied;
  }

  private getDefaultGameInfo(): GameInfo {
    return {
      opponent: 'UNK',
      isHome: true,
      gameTime: new Date(),
      spread: 0,
      total: 45,
      impliedPoints: 22.5,
      oppDefenseRank: 16,
      oppPaceRank: 16,
      homeTeam: 'UNK',
      awayTeam: 'UNK'
    };
  }
}