import { Player, PlayerProjection, GameInfo, Projection, WeatherData } from '../types';
import { NameNormalizer } from '../../services/nameNormalizer';
import fs from 'fs/promises';
import path from 'path';

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

export class TextFileDataLoader {
  private nameNormalizer: NameNormalizer;
  private dataDir: string;
  private weatherApiKey: string | undefined;

  constructor(dataDir: string = './lineup-data') {
    this.nameNormalizer = new NameNormalizer();
    this.dataDir = dataDir;
    this.weatherApiKey = process.env.OPENWEATHER_API_KEY;
  }

  async loadWeekData(week: number): Promise<PlayerProjection[]> {
    const weekDir = path.join(this.dataDir, `week${week}`);
    
    try {
      const [projections, games, injuries] = await Promise.all([
        this.loadProjections(weekDir),
        this.loadGames(weekDir),
        this.loadInjuries(weekDir)
      ]);

      const playerProjections = this.mergeData(projections, games, injuries);
      
      // Fetch weather for outdoor games
      await this.enrichWithWeatherData(playerProjections);
      
      return playerProjections;
    } catch (error) {
      console.error(`Error loading week ${week} data:`, error);
      throw error;
    }
  }

  private async loadProjections(weekDir: string): Promise<TextProjection[]> {
    try {
      const filePath = path.join(weekDir, 'projections.txt');
      const content = await fs.readFile(filePath, 'utf-8');
      
      const lines = content.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      
      return lines.slice(1).map(line => {
        const values = this.parseCSVLine(line);
        const projection: TextProjection = {
          playerName: values[0]?.trim() || '',
          team: values[1]?.trim() || '',
          position: values[2]?.trim() || '',
          projectedPoints: parseFloat(values[3]) || 0,
          floor: values[4] ? parseFloat(values[4]) : undefined,
          ceiling: values[5] ? parseFloat(values[5]) : undefined
        };
        return projection;
      }).filter(p => p.playerName && p.projectedPoints > 0);
    } catch (error) {
      console.warn('Could not load projections:', error);
      return [];
    }
  }

  private async loadGames(weekDir: string): Promise<TextGame[]> {
    try {
      const filePath = path.join(weekDir, 'games.txt');
      const content = await fs.readFile(filePath, 'utf-8');
      
      const lines = content.split('\n').filter(line => line.trim());
      
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
    } catch (error) {
      console.warn('Could not load games:', error);
      return [];
    }
  }

  private async loadInjuries(weekDir: string): Promise<TextInjury[]> {
    try {
      const filePath = path.join(weekDir, 'injuries.txt');
      const content = await fs.readFile(filePath, 'utf-8');
      
      const lines = content.split('\n').filter(line => line.trim());
      
      return lines.slice(1).map(line => {
        const values = this.parseCSVLine(line);
        return {
          playerName: values[0]?.trim() || '',
          team: values[1]?.trim() || '',
          status: values[2]?.trim() || 'H',
          practiceNotes: values[3]?.trim()
        };
      }).filter(i => i.playerName);
    } catch (error) {
      console.warn('Could not load injuries:', error);
      return [];
    }
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

    return projections.map(proj => {
      const normalizedName = this.nameNormalizer.normalize(proj.playerName);
      const injury = injuryMap.get(normalizedName);
      const game = gameMap.get(proj.team);

      const player: Player = {
        id: `${normalizedName}_${proj.team}`,
        name: proj.playerName,
        team: proj.team,
        position: proj.position as Player['position'],
        status: this.parseInjuryStatus(injury?.status),
        injuryDetails: injury?.practiceNotes,
        practiceParticipation: this.parsePracticeNotes(injury?.practiceNotes),
        projectedPoints: proj.projectedPoints,
        salary: 0,
        ownership: 0
      };

      const variance = proj.projectedPoints * 0.15;
      const projection: Projection = {
        floor: proj.floor || Math.max(0, proj.projectedPoints - variance * 2),
        q1: Math.max(0, proj.projectedPoints - variance),
        median: proj.projectedPoints,
        q3: proj.projectedPoints + variance,
        ceiling: proj.ceiling || proj.projectedPoints + variance * 2,
        baseLogProjection: Math.log(Math.max(1, proj.projectedPoints)),
        matchupAdjustment: 0,
        usageAdjustment: 0,
        trendAdjustment: 0,
        weatherAdjustment: 0,
        injuryAdjustment: this.calculateInjuryAdjustment(injury?.status),
        confidence: injury?.status && injury.status !== 'H' ? 0.6 : 0.75,
        variance: variance,
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
        weather: null,
        vorp: 0
      };
    });
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
      return new Date(`${date} ${time}`);
    } catch {
      return new Date();
    }
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

  private async enrichWithWeatherData(projections: PlayerProjection[]): Promise<void> {
    if (!this.weatherApiKey) {
      console.log('No weather API key configured. Skipping weather data.');
      return;
    }

    for (const proj of projections) {
      if (proj.gameInfo && !this.isDomeTeam(proj.player.team)) {
        try {
          const weather = await this.fetchWeatherForGame(
            proj.player.team,
            proj.gameInfo.gameTime
          );
          if (weather) {
            proj.weather = weather;
          }
        } catch (error) {
          console.warn(`Could not fetch weather for ${proj.player.team}:`, error);
        }
      }
    }
  }

  private isDomeTeam(team: string): boolean {
    const domeTeams = [
      'ARI', 'ATL', 'DAL', 'DET', 'HOU', 'IND', 
      'LAC', 'LAR', 'LV', 'MIN', 'NO'
    ];
    return domeTeams.includes(team);
  }

  private async fetchWeatherForGame(
    team: string,
    gameTime: Date
  ): Promise<WeatherData | null> {
    const coordinates = this.getStadiumCoordinates(team);
    if (!coordinates) return null;

    try {
      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${coordinates.lat}&lon=${coordinates.lon}&appid=${this.weatherApiKey}&units=imperial`;
      const response = await fetch(url);
      const data = await response.json();

      const forecast = data.list.find((item: any) => {
        const forecastTime = new Date(item.dt * 1000);
        return Math.abs(forecastTime.getTime() - gameTime.getTime()) < 3 * 60 * 60 * 1000;
      });

      if (forecast) {
        return {
          temperature: forecast.main.temp,
          windSpeed: forecast.wind.speed,
          precipitation: forecast.rain?.['3h'] || forecast.snow?.['3h'] || 0,
          conditions: forecast.weather[0].main,
          isDome: false
        };
      }
    } catch (error) {
      console.error('Weather API error:', error);
    }

    return null;
  }

  private getStadiumCoordinates(team: string): { lat: number; lon: number } | null {
    const stadiums: Record<string, { lat: number; lon: number }> = {
      'ARI': { lat: 33.5276, lon: -112.2626 },
      'ATL': { lat: 33.7553, lon: -84.4006 },
      'BAL': { lat: 39.2780, lon: -76.6227 },
      'BUF': { lat: 42.7738, lon: -78.7870 },
      'CAR': { lat: 35.2258, lon: -80.8528 },
      'CHI': { lat: 41.8623, lon: -87.6167 },
      'CIN': { lat: 39.0954, lon: -84.5160 },
      'CLE': { lat: 41.5061, lon: -81.6995 },
      'DAL': { lat: 32.7473, lon: -97.0945 },
      'DEN': { lat: 39.7439, lon: -105.0201 },
      'DET': { lat: 42.3400, lon: -83.0456 },
      'GB': { lat: 44.5013, lon: -88.0622 },
      'HOU': { lat: 29.6847, lon: -95.4107 },
      'IND': { lat: 39.7601, lon: -86.1639 },
      'JAX': { lat: 30.3239, lon: -81.6373 },
      'KC': { lat: 39.0489, lon: -94.4839 },
      'LAC': { lat: 33.8643, lon: -118.2611 },
      'LAR': { lat: 33.9535, lon: -118.3392 },
      'LV': { lat: 36.0909, lon: -115.1833 },
      'MIA': { lat: 25.9580, lon: -80.2389 },
      'MIN': { lat: 44.9736, lon: -93.2575 },
      'NE': { lat: 42.0909, lon: -71.2643 },
      'NO': { lat: 29.9511, lon: -90.0812 },
      'NYG': { lat: 40.8128, lon: -74.0742 },
      'NYJ': { lat: 40.8135, lon: -74.0745 },
      'PHI': { lat: 39.9008, lon: -75.1675 },
      'PIT': { lat: 40.4468, lon: -80.0158 },
      'SEA': { lat: 47.5952, lon: -122.3316 },
      'SF': { lat: 37.7133, lon: -122.3861 },
      'TB': { lat: 27.9759, lon: -82.5033 },
      'TEN': { lat: 36.1665, lon: -86.7713 },
      'WAS': { lat: 38.9076, lon: -76.8645 }
    };

    return stadiums[team] || null;
  }

  async createSampleWeekData(week: number): Promise<void> {
    const weekDir = path.join(this.dataDir, `week${week}`);
    
    try {
      await fs.mkdir(weekDir, { recursive: true });
      
      const sampleProjections = `Player Name,Team,Position,Projected Points,Floor,Ceiling
Josh Allen,BUF,QB,24.5,18.2,31.8
Patrick Mahomes,KC,QB,23.8,17.5,30.2
Lamar Jackson,BAL,QB,23.2,16.8,29.7
Christian McCaffrey,SF,RB,22.3,16.5,28.9
Austin Ekeler,LAC,RB,18.7,13.2,24.5
Tyreek Hill,MIA,WR,19.2,13.8,25.1
Justin Jefferson,MIN,WR,18.5,13.1,24.2
Cooper Kupp,LAR,WR,17.8,12.5,23.4
Travis Kelce,KC,TE,16.2,11.3,21.5
Mark Andrews,BAL,TE,14.1,9.5,18.9
Bills D/ST,BUF,DST,9.5,5.0,14.0
Cowboys D/ST,DAL,DST,8.8,4.5,13.2
Justin Tucker,BAL,K,8.2,5.5,11.0
Harrison Butker,KC,K,7.8,5.0,10.5`;

      const sampleGames = `Home Team,Away Team,Date,Time,Spread,Total
BUF,MIA,2024-09-08,13:00,-3.5,48.5
KC,DET,2024-09-07,20:20,-4.5,53.0
SF,DAL,2024-09-08,16:25,-4.0,45.0
BAL,HOU,2024-09-08,13:00,-9.5,44.5
LAC,LV,2024-09-08,16:05,-3.0,46.0
MIN,GB,2024-09-08,13:00,1.5,43.5
LAR,SEA,2024-09-08,16:05,-2.5,47.0`;

      const sampleInjuries = `Player Name,Team,Status,Practice Notes
Mike Evans,TB,Q,Limited practice Friday
Chris Olave,NO,D,DNP all week
Dalvin Cook,MIN,Q,Full practice Friday
George Kittle,SF,H,Full participant`;

      await Promise.all([
        fs.writeFile(path.join(weekDir, 'projections.txt'), sampleProjections),
        fs.writeFile(path.join(weekDir, 'games.txt'), sampleGames),
        fs.writeFile(path.join(weekDir, 'injuries.txt'), sampleInjuries)
      ]);

      console.log(`Sample data created for week ${week} in ${weekDir}`);
    } catch (error) {
      console.error('Error creating sample data:', error);
    }
  }
}

export default TextFileDataLoader;