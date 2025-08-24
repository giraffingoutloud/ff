-- Fantasy Lineup Optimizer Database Schema
-- PostgreSQL with TimescaleDB extensions

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- Players table (master list)
CREATE TABLE IF NOT EXISTS players (
    player_id VARCHAR(50) PRIMARY KEY,
    espn_id VARCHAR(50),
    sleeper_id VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    team VARCHAR(5),
    position VARCHAR(5) NOT NULL,
    positions TEXT[], -- Array for multi-position eligibility
    bye_week INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(espn_id),
    UNIQUE(sleeper_id)
);

CREATE INDEX idx_players_name ON players(name);
CREATE INDEX idx_players_team ON players(team);
CREATE INDEX idx_players_position ON players(position);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    team_abbr VARCHAR(5) PRIMARY KEY,
    full_name VARCHAR(50) NOT NULL,
    conference VARCHAR(3),
    division VARCHAR(10),
    stadium_id VARCHAR(50)
);

-- Stadiums table (for weather context)
CREATE TABLE IF NOT EXISTS stadiums (
    stadium_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(50),
    state VARCHAR(2),
    is_dome BOOLEAN DEFAULT FALSE,
    has_retractable_roof BOOLEAN DEFAULT FALSE,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7)
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
    game_id VARCHAR(50) PRIMARY KEY,
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    home_team VARCHAR(5) REFERENCES teams(team_abbr),
    away_team VARCHAR(5) REFERENCES teams(team_abbr),
    kickoff_time TIMESTAMP WITH TIME ZONE NOT NULL,
    stadium_id VARCHAR(50) REFERENCES stadiums(stadium_id),
    is_primetime BOOLEAN DEFAULT FALSE,
    is_divisional BOOLEAN DEFAULT FALSE,
    is_playoff BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(week, season, home_team, away_team)
);

CREATE INDEX idx_games_week_season ON games(week, season);
CREATE INDEX idx_games_kickoff ON games(kickoff_time);

-- Vegas lines (temporal data)
CREATE TABLE IF NOT EXISTS vegas_lines (
    game_id VARCHAR(50) REFERENCES games(game_id),
    spread DOUBLE PRECISION, -- Positive = home favored
    total DOUBLE PRECISION,
    home_implied_total DOUBLE PRECISION,
    away_implied_total DOUBLE PRECISION,
    as_of TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(50),
    PRIMARY KEY (game_id, as_of)
);

CREATE INDEX idx_vegas_latest ON vegas_lines(game_id, as_of DESC);

-- Weather conditions (temporal data)
CREATE TABLE IF NOT EXISTS weather_conditions (
    game_id VARCHAR(50) REFERENCES games(game_id),
    temperature INTEGER,
    wind_speed INTEGER, -- Sustained wind
    wind_gusts INTEGER,
    precipitation_prob DOUBLE PRECISION, -- 0-1
    precipitation_amount DOUBLE PRECISION, -- Inches
    is_dome BOOLEAN,
    is_retractable_closed BOOLEAN,
    wet_bulb_temp INTEGER,
    forecast_confidence DOUBLE PRECISION,
    as_of TIMESTAMP WITH TIME ZONE NOT NULL,
    forecast_for TIMESTAMP WITH TIME ZONE, -- When this forecast is for
    source VARCHAR(50),
    PRIMARY KEY (game_id, as_of)
);

CREATE INDEX idx_weather_latest ON weather_conditions(game_id, as_of DESC);

-- Weekly projections (main projection table)
CREATE TABLE IF NOT EXISTS weekly_projections (
    projection_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    player_id VARCHAR(50) REFERENCES players(player_id),
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    -- Distribution quantiles
    floor DOUBLE PRECISION, -- 10th percentile
    q1 DOUBLE PRECISION, -- 25th percentile
    median DOUBLE PRECISION, -- 50th percentile
    q3 DOUBLE PRECISION, -- 75th percentile
    ceiling DOUBLE PRECISION, -- 90th percentile
    -- Log-space adjustments
    base_log_projection DOUBLE PRECISION,
    matchup_adjustment DOUBLE PRECISION,
    vegas_adjustment DOUBLE PRECISION,
    weather_adjustment DOUBLE PRECISION,
    usage_adjustment DOUBLE PRECISION,
    injury_adjustment DOUBLE PRECISION,
    -- Meta
    confidence DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1),
    data_quality DOUBLE PRECISION CHECK (data_quality >= 0 AND data_quality <= 1),
    model_version VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(player_id, week, season, model_version)
);

CREATE INDEX idx_projections_player_week ON weekly_projections(player_id, week, season);
CREATE INDEX idx_projections_updated ON weekly_projections(updated_at DESC);

-- Convert to hypertable if using TimescaleDB
SELECT create_hypertable('weekly_projections', 'created_at', 
    partitioning_column => 'season', 
    number_partitions => 4,
    if_not_exists => TRUE);

-- Usage metrics
CREATE TABLE IF NOT EXISTS usage_metrics (
    player_id VARCHAR(50) REFERENCES players(player_id),
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    snap_percent DOUBLE PRECISION,
    route_participation DOUBLE PRECISION,
    target_share DOUBLE PRECISION,
    air_yards_share DOUBLE PRECISION,
    wopr DOUBLE PRECISION, -- Weighted Opportunity Rating
    red_zone_touches INTEGER,
    carries INTEGER,
    targets INTEGER,
    yards_per_route_run DOUBLE PRECISION,
    adot DOUBLE PRECISION, -- Average Depth of Target
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (player_id, week, season)
);

CREATE INDEX idx_usage_player ON usage_metrics(player_id);
CREATE INDEX idx_usage_week_season ON usage_metrics(week, season);

-- Practice reports
CREATE TABLE IF NOT EXISTS practice_reports (
    player_id VARCHAR(50) REFERENCES players(player_id),
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    day_of_week VARCHAR(3) CHECK (day_of_week IN ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT')),
    status VARCHAR(10) CHECK (status IN ('DNP', 'LIMITED', 'FULL')),
    injury_designation VARCHAR(100),
    is_veteran_rest BOOLEAN DEFAULT FALSE,
    game_day VARCHAR(3) CHECK (game_day IN ('SUN', 'MON', 'THU', 'SAT')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (player_id, week, season, day_of_week)
);

CREATE INDEX idx_practice_player_week ON practice_reports(player_id, week, season);

-- Power rankings
CREATE TABLE IF NOT EXISTS power_rankings (
    player_id VARCHAR(50) REFERENCES players(player_id),
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    power_score DOUBLE PRECISION CHECK (power_score >= 0 AND power_score <= 100),
    rank_change INTEGER,
    trend VARCHAR(10) CHECK (trend IN ('rising', 'falling', 'stable')),
    momentum DOUBLE PRECISION, -- EWMA-based
    breakout_probability DOUBLE PRECISION,
    source VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (player_id, week, season, source)
);

CREATE INDEX idx_power_player_week ON power_rankings(player_id, week, season);

-- Injury status
CREATE TABLE IF NOT EXISTS injury_status (
    player_id VARCHAR(50) REFERENCES players(player_id),
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    status VARCHAR(20) CHECK (status IN ('HEALTHY', 'QUESTIONABLE', 'DOUBTFUL', 'OUT', 'IR', 'PUP', 'SUSPENDED')),
    injury_description VARCHAR(200),
    return_timeline VARCHAR(50),
    as_of TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(50),
    PRIMARY KEY (player_id, week, season, as_of)
);

CREATE INDEX idx_injury_latest ON injury_status(player_id, as_of DESC);

-- Historical performance (for backtesting)
CREATE TABLE IF NOT EXISTS historical_performance (
    player_id VARCHAR(50) REFERENCES players(player_id),
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    actual_points DOUBLE PRECISION,
    projected_points DOUBLE PRECISION,
    opponent VARCHAR(5),
    is_home BOOLEAN,
    weather_conditions JSONB,
    game_script JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (player_id, week, season)
);

CREATE INDEX idx_historical_player ON historical_performance(player_id);
CREATE INDEX idx_historical_season ON historical_performance(season, week);

-- Lineup decisions (audit log)
CREATE TABLE IF NOT EXISTS lineup_decisions (
    decision_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id VARCHAR(50),
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    lineup JSONB NOT NULL, -- Full lineup details
    expected_points DOUBLE PRECISION,
    floor DOUBLE PRECISION,
    ceiling DOUBLE PRECISION,
    confidence DOUBLE PRECISION,
    reasoning JSONB, -- Array of reasoning objects
    strategy VARCHAR(20), -- 'floor', 'ceiling', 'balanced'
    actual_points DOUBLE PRECISION, -- Filled in after games
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_decisions_user_week ON lineup_decisions(user_id, week, season);

-- Model versions (for tracking)
CREATE TABLE IF NOT EXISTS model_versions (
    version VARCHAR(20) PRIMARY KEY,
    description TEXT,
    features JSONB,
    performance_metrics JSONB,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projections_updated_at BEFORE UPDATE ON weekly_projections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();