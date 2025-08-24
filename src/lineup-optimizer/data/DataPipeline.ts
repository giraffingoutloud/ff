import { Player, PlayerProjection, GameInfo, Projection, WeatherData } from '../types';
import { NameNormalizer } from '../../services/nameNormalizer';
import Papa from 'papaparse';
import fs from 'fs/promises';
import path from 'path';

interface CanonicalProjection {
  Player: string;
  Team: string;
  Position: string;
  Points: number;
  PassingYards?: number;
  PassingTDs?: number;
  Interceptions?: number;
  RushingYards?: number;
  RushingTDs?: number;
  Receptions?: number;
  ReceivingYards?: number;
  ReceivingTDs?: number;
  FantasyPoints: number;
}

interface SleeperPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  team: string;
  position: string;
  injury_status?: string;
  injury_notes?: string;
  practice_participation?: string;
  status?: string;
}

interface ESPNGame {
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  spread: number;
  total: number;
  homeTeamScore?: number;
  awayTeamScore?: number;
}

export class DataPipeline {
  private nameNormalizer: NameNormalizer;
  private canonicalData: Map<string, CanonicalProjection> = new Map();
  private sleeperData: Map<string, SleeperPlayer> = new Map();
  private gamesData: Map<string, ESPNGame> = new Map();
  private weatherCache: Map<string, WeatherData> = new Map();

  constructor() {
    this.nameNormalizer = new NameNormalizer();
  }

  async loadCanonicalProjections(week: number): Promise<void> {
    const filePath = path.join(
      process.cwd(),
      'canonical_data',
      `week${week}_projections.csv`
    );

    try {
      const csvContent = await fs.readFile(filePath, 'utf-8');
      const { data } = Papa.parse<CanonicalProjection>(csvContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
      });

      for (const row of data) {
        if (row.Player && row.Team && row.Position) {
          const normalizedName = this.nameNormalizer.normalize(row.Player);
          this.canonicalData.set(normalizedName, row);
          
          const variations = this.nameNormalizer.generateVariations(row.Player);
          for (const variation of variations) {
            this.canonicalData.set(variation, row);
          }
        }
      }

      console.log(`Loaded ${this.canonicalData.size} canonical projections for week ${week}`);
    } catch (error) {
      console.error('Error loading canonical projections:', error);
      throw new Error(`Failed to load canonical data for week ${week}`);
    }
  }

  async fetchSleeperUpdates(): Promise<void> {
    try {
      const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
      const players = await playersResponse.json();

      for (const [id, player] of Object.entries(players as Record<string, SleeperPlayer>)) {
        if (player.full_name && player.team) {
          const normalizedName = this.nameNormalizer.normalize(player.full_name);
          this.sleeperData.set(normalizedName, { ...player, player_id: id });
          
          const variations = this.nameNormalizer.generateVariations(player.full_name);
          for (const variation of variations) {
            this.sleeperData.set(variation, { ...player, player_id: id });
          }
        }
      }

      console.log(`Loaded ${this.sleeperData.size} Sleeper player updates`);
    } catch (error) {
      console.error('Error fetching Sleeper data:', error);
    }
  }

  async fetchESPNGames(week: number): Promise<void> {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}`
      );
      const data = await response.json();

      for (const event of data.events || []) {
        const competition = event.competitions[0];
        const homeTeam = competition.competitors.find((c: any) => c.homeAway === 'home');
        const awayTeam = competition.competitors.find((c: any) => c.homeAway === 'away');

        if (homeTeam && awayTeam) {
          const game: ESPNGame = {
            homeTeam: homeTeam.team.abbreviation,
            awayTeam: awayTeam.team.abbreviation,
            kickoff: event.date,
            spread: competition.odds?.[0]?.details || 0,
            total: competition.odds?.[0]?.overUnder || 45,
            homeTeamScore: homeTeam.score ? parseFloat(homeTeam.score) : undefined,
            awayTeamScore: awayTeam.score ? parseFloat(awayTeam.score) : undefined
          };

          const gameKey = `${game.homeTeam}_${game.awayTeam}`;
          this.gamesData.set(gameKey, game);
        }
      }

      console.log(`Loaded ${this.gamesData.size} games for week ${week}`);
    } catch (error) {
      console.error('Error fetching ESPN games:', error);
    }
  }

  async fetchWeatherData(venue: string, gameTime: Date): Promise<WeatherData | null> {
    const cacheKey = `${venue}_${gameTime.toISOString()}`;
    
    if (this.weatherCache.has(cacheKey)) {
      return this.weatherCache.get(cacheKey)!;
    }

    try {
      const stadiumCoordinates = this.getStadiumCoordinates(venue);
      if (!stadiumCoordinates) {
        return null;
      }

      const apiKey = process.env.OPENWEATHER_API_KEY;
      if (!apiKey) {
        console.warn('OpenWeather API key not configured');
        return null;
      }

      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${stadiumCoordinates.lat}&lon=${stadiumCoordinates.lon}&appid=${apiKey}&units=imperial`
      );
      const data = await response.json();

      const forecast = data.list.find((item: any) => {
        const forecastTime = new Date(item.dt * 1000);
        return Math.abs(forecastTime.getTime() - gameTime.getTime()) < 3 * 60 * 60 * 1000;
      });

      if (forecast) {
        const weather: WeatherData = {
          temperature: forecast.main.temp,
          windSpeed: forecast.wind.speed,
          precipitation: forecast.rain?.['3h'] || forecast.snow?.['3h'] || 0,
          conditions: forecast.weather[0].main,
          isDome: this.isDomeStadium(venue)
        };

        this.weatherCache.set(cacheKey, weather);
        return weather;
      }
    } catch (error) {
      console.error('Error fetching weather data:', error);
    }

    return null;
  }

  mergePlayerData(): PlayerProjection[] {
    const projections: PlayerProjection[] = [];

    for (const [key, canonical] of this.canonicalData) {
      if (!key.includes('_')) continue;

      const sleeperPlayer = this.sleeperData.get(key);
      
      const player: Player = {
        id: sleeperPlayer?.player_id || `canonical_${key}`,
        name: canonical.Player,
        team: canonical.Team,
        position: canonical.Position as Player['position'],
        status: sleeperPlayer?.injury_status || 'healthy',
        injuryDetails: sleeperPlayer?.injury_notes,
        practiceParticipation: this.parsePracticeStatus(sleeperPlayer?.practice_participation),
        projectedPoints: canonical.FantasyPoints,
        salary: 0,
        ownership: 0
      };

      const gameInfo = this.findGameInfo(canonical.Team);

      const projection: Projection = {
        floor: canonical.FantasyPoints * 0.7,
        q1: canonical.FantasyPoints * 0.85,
        median: canonical.FantasyPoints,
        q3: canonical.FantasyPoints * 1.15,
        ceiling: canonical.FantasyPoints * 1.3,
        baseLogProjection: Math.log(Math.max(1, canonical.FantasyPoints)),
        matchupAdjustment: 0,
        usageAdjustment: 0,
        trendAdjustment: 0,
        weatherAdjustment: 0,
        injuryAdjustment: sleeperPlayer?.injury_status ? -0.1 : 0,
        confidence: 0.7,
        variance: canonical.FantasyPoints * 0.15,
        components: {
          passingYards: canonical.PassingYards || 0,
          passingTDs: canonical.PassingTDs || 0,
          rushingYards: canonical.RushingYards || 0,
          rushingTDs: canonical.RushingTDs || 0,
          receptions: canonical.Receptions || 0,
          receivingYards: canonical.ReceivingYards || 0,
          receivingTDs: canonical.ReceivingTDs || 0,
          interceptions: canonical.Interceptions || 0
        }
      };

      projections.push({
        player,
        projection,
        gameInfo: gameInfo || this.getDefaultGameInfo(),
        weather: null,
        vorp: 0
      });
    }

    return projections;
  }

  private findGameInfo(team: string): GameInfo | null {
    for (const [key, game] of this.gamesData) {
      if (game.homeTeam === team || game.awayTeam === team) {
        return {
          opponent: game.homeTeam === team ? game.awayTeam : game.homeTeam,
          isHome: game.homeTeam === team,
          gameTime: new Date(game.kickoff),
          spread: game.homeTeam === team ? -game.spread : game.spread,
          total: game.total,
          impliedPoints: this.calculateImpliedPoints(game.total, game.spread, game.homeTeam === team),
          oppDefenseRank: 16,
          oppPaceRank: 16,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam
        };
      }
    }
    return null;
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

  private parsePracticeStatus(status?: string): 'FP' | 'LP' | 'DNP' | undefined {
    if (!status) return undefined;
    const normalized = status.toUpperCase();
    if (normalized.includes('FULL')) return 'FP';
    if (normalized.includes('LIMITED')) return 'LP';
    if (normalized.includes('DNP') || normalized.includes('DID NOT')) return 'DNP';
    return undefined;
  }

  private getStadiumCoordinates(venue: string): { lat: number; lon: number } | null {
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

    return stadiums[venue] || null;
  }

  private isDomeStadium(venue: string): boolean {
    const domeStadiums = [
      'ARI', 'ATL', 'DAL', 'DET', 'HOU', 'IND', 'LAC', 'LAR', 
      'LV', 'MIN', 'NO'
    ];
    return domeStadiums.includes(venue);
  }

  async loadAllData(week: number): Promise<PlayerProjection[]> {
    console.log(`Loading data for week ${week}...`);
    
    await Promise.all([
      this.loadCanonicalProjections(week),
      this.fetchSleeperUpdates(),
      this.fetchESPNGames(week)
    ]);

    const projections = this.mergePlayerData();
    
    for (const projection of projections) {
      if (projection.gameInfo) {
        const weather = await this.fetchWeatherData(
          projection.player.team,
          projection.gameInfo.gameTime
        );
        if (weather) {
          projection.weather = weather;
        }
      }
    }

    console.log(`Loaded ${projections.length} player projections`);
    return projections;
  }
}

export default DataPipeline;