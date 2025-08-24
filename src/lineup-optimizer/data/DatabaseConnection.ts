import { Pool } from 'pg';
import { PlayerProjection, Projection, CalibrationResult } from '../types';

export class DatabaseConnection {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'fantasy_football',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.pool.query('SELECT NOW()');
      console.log('Database connected successfully');
      
      await this.runMigrations();
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  private async runMigrations(): Promise<void> {
    const schemaPath = './src/lineup-optimizer/data/schema.sql';
    
    try {
      await this.pool.query(`
        CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      const executedMigrations = await this.pool.query(
        'SELECT name FROM migrations'
      );
      const executed = new Set(executedMigrations.rows.map(r => r.name));

      if (!executed.has('initial_schema')) {
        console.log('Running initial schema migration...');
        
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS players (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            team VARCHAR(5) NOT NULL,
            position VARCHAR(5) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS weekly_projections (
            id SERIAL,
            player_id VARCHAR(50) NOT NULL REFERENCES players(id),
            week INTEGER NOT NULL,
            season INTEGER NOT NULL,
            floor DOUBLE PRECISION,
            q1 DOUBLE PRECISION,
            median DOUBLE PRECISION,
            q3 DOUBLE PRECISION,
            ceiling DOUBLE PRECISION,
            base_log_projection DOUBLE PRECISION,
            matchup_adjustment DOUBLE PRECISION,
            usage_adjustment DOUBLE PRECISION,
            trend_adjustment DOUBLE PRECISION,
            weather_adjustment DOUBLE PRECISION,
            injury_adjustment DOUBLE PRECISION,
            confidence DOUBLE PRECISION,
            variance DOUBLE PRECISION,
            vorp DOUBLE PRECISION,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (id, created_at)
          );

          CREATE TABLE IF NOT EXISTS actual_results (
            id SERIAL PRIMARY KEY,
            player_id VARCHAR(50) NOT NULL REFERENCES players(id),
            week INTEGER NOT NULL,
            season INTEGER NOT NULL,
            actual_points DOUBLE PRECISION NOT NULL,
            passing_yards DOUBLE PRECISION,
            passing_tds INTEGER,
            rushing_yards DOUBLE PRECISION,
            rushing_tds INTEGER,
            receptions INTEGER,
            receiving_yards DOUBLE PRECISION,
            receiving_tds INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(player_id, week, season)
          );

          CREATE TABLE IF NOT EXISTS calibration_results (
            id SERIAL PRIMARY KEY,
            player_id VARCHAR(50) NOT NULL REFERENCES players(id),
            week INTEGER NOT NULL,
            season INTEGER NOT NULL,
            predicted DOUBLE PRECISION NOT NULL,
            actual DOUBLE PRECISION NOT NULL,
            mae DOUBLE PRECISION,
            percentile DOUBLE PRECISION,
            percentile_error DOUBLE PRECISION,
            in_floor_ceiling BOOLEAN,
            in_q1_q3 BOOLEAN,
            confidence DOUBLE PRECISION,
            calibration_score DOUBLE PRECISION,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS lineups (
            id SERIAL PRIMARY KEY,
            week INTEGER NOT NULL,
            season INTEGER NOT NULL,
            strategy VARCHAR(20) NOT NULL,
            projected_points DOUBLE PRECISION,
            actual_points DOUBLE PRECISION,
            correlation_score DOUBLE PRECISION,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS lineup_players (
            id SERIAL PRIMARY KEY,
            lineup_id INTEGER NOT NULL REFERENCES lineups(id),
            player_id VARCHAR(50) NOT NULL REFERENCES players(id),
            slot VARCHAR(10) NOT NULL,
            projected_points DOUBLE PRECISION,
            actual_points DOUBLE PRECISION
          );

          CREATE INDEX idx_projections_player_week ON weekly_projections(player_id, week, season);
          CREATE INDEX idx_actuals_player_week ON actual_results(player_id, week, season);
          CREATE INDEX idx_calibration_week ON calibration_results(week, season);
          CREATE INDEX idx_lineups_week ON lineups(week, season);
        `);

        await this.pool.query(`
          SELECT create_hypertable('weekly_projections', 'created_at', if_not_exists => TRUE);
        `);

        await this.pool.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          ['initial_schema']
        );
      }

      console.log('Database migrations complete');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  async saveProjections(projections: PlayerProjection[], week: number, season: number): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      for (const proj of projections) {
        await client.query(`
          INSERT INTO players (id, name, team, position)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE
          SET name = $2, team = $3, position = $4, updated_at = NOW()
        `, [proj.player.id, proj.player.name, proj.player.team, proj.player.position]);

        await client.query(`
          INSERT INTO weekly_projections (
            player_id, week, season, floor, q1, median, q3, ceiling,
            base_log_projection, matchup_adjustment, usage_adjustment,
            trend_adjustment, weather_adjustment, injury_adjustment,
            confidence, variance, vorp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          proj.player.id, week, season,
          proj.projection.floor, proj.projection.q1, proj.projection.median,
          proj.projection.q3, proj.projection.ceiling,
          proj.projection.baseLogProjection, proj.projection.matchupAdjustment,
          proj.projection.usageAdjustment, proj.projection.trendAdjustment,
          proj.projection.weatherAdjustment, proj.projection.injuryAdjustment,
          proj.projection.confidence, proj.projection.variance, proj.vorp
        ]);
      }

      await client.query('COMMIT');
      console.log(`Saved ${projections.length} projections for week ${week}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to save projections:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveActualResults(
    playerId: string,
    week: number,
    season: number,
    actualPoints: number,
    stats: any
  ): Promise<void> {
    await this.pool.query(`
      INSERT INTO actual_results (
        player_id, week, season, actual_points,
        passing_yards, passing_tds, rushing_yards, rushing_tds,
        receptions, receiving_yards, receiving_tds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (player_id, week, season) DO UPDATE
      SET actual_points = $4, passing_yards = $5, passing_tds = $6,
          rushing_yards = $7, rushing_tds = $8, receptions = $9,
          receiving_yards = $10, receiving_tds = $11
    `, [
      playerId, week, season, actualPoints,
      stats.passingYards, stats.passingTDs, stats.rushingYards, stats.rushingTDs,
      stats.receptions, stats.receivingYards, stats.receivingTDs
    ]);
  }

  async saveCalibrationResult(result: CalibrationResult, week: number, season: number): Promise<void> {
    await this.pool.query(`
      INSERT INTO calibration_results (
        player_id, week, season, predicted, actual, mae, percentile,
        percentile_error, in_floor_ceiling, in_q1_q3, confidence, calibration_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      result.playerId, week, season, result.predicted, result.actual,
      result.mae, result.percentile, result.percentileError,
      result.inFloorCeiling, result.inQ1Q3, result.confidence, result.calibrationScore
    ]);
  }

  async getHistoricalProjections(
    playerId: string,
    weeks: number = 5
  ): Promise<Projection[]> {
    const result = await this.pool.query(`
      SELECT * FROM weekly_projections
      WHERE player_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [playerId, weeks]);

    return result.rows.map(row => ({
      floor: row.floor,
      q1: row.q1,
      median: row.median,
      q3: row.q3,
      ceiling: row.ceiling,
      baseLogProjection: row.base_log_projection,
      matchupAdjustment: row.matchup_adjustment,
      usageAdjustment: row.usage_adjustment,
      trendAdjustment: row.trend_adjustment,
      weatherAdjustment: row.weather_adjustment,
      injuryAdjustment: row.injury_adjustment,
      confidence: row.confidence,
      variance: row.variance,
      components: {}
    }));
  }

  async getCalibrationData(season: number): Promise<CalibrationResult[]> {
    const result = await this.pool.query(`
      SELECT * FROM calibration_results
      WHERE season = $1
      ORDER BY week, player_id
    `, [season]);

    return result.rows.map(row => ({
      playerId: row.player_id,
      week: row.week,
      predicted: row.predicted,
      actual: row.actual,
      mae: row.mae,
      percentile: row.percentile,
      percentileError: row.percentile_error,
      inFloorCeiling: row.in_floor_ceiling,
      inQ1Q3: row.in_q1_q3,
      confidence: row.confidence,
      calibrationScore: row.calibration_score
    }));
  }

  async getReplacementLevelStats(
    position: string,
    weeks: number = 5
  ): Promise<{ mean: number; std: number }> {
    const result = await this.pool.query(`
      WITH ranked_players AS (
        SELECT 
          wp.player_id,
          wp.median,
          ROW_NUMBER() OVER (PARTITION BY wp.week ORDER BY wp.median DESC) as rank
        FROM weekly_projections wp
        JOIN players p ON wp.player_id = p.id
        WHERE p.position = $1
          AND wp.created_at > NOW() - INTERVAL '${weeks} weeks'
      )
      SELECT 
        AVG(median) as mean,
        STDDEV(median) as std
      FROM ranked_players
      WHERE rank BETWEEN 13 AND 24
    `, [position]);

    return {
      mean: result.rows[0]?.mean || 0,
      std: result.rows[0]?.std || 0
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}