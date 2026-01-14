#!/usr/bin/env php
<?php
/**
 * Solar Database Initialization Script
 * Creates SQLite database with proper schema for solar data collection
 * 
 * Usage: php init-solar-database.php
 */

define('DB_PATH', '/p1mon/www/custom/data/solar.db');
define('DB_DIR', dirname(DB_PATH));

// Ensure data directory exists
if (!is_dir(DB_DIR)) {
    if (!mkdir(DB_DIR, 0755, true)) {
        die("ERROR: Could not create directory: $DB_DIR\n");
    }
    echo "Created directory: $DB_DIR\n";
}

// Connect to database (creates if doesn't exist)
try {
    $db = new PDO('sqlite:' . DB_PATH);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Database connection established: " . DB_PATH . "\n";
} catch (PDOException $e) {
    die("ERROR: Could not connect to database: " . $e->getMessage() . "\n");
}

// SQL Schema
$schema = <<<SQL
-- Real-time data (10-minute intervals, 7-day retention)
CREATE TABLE IF NOT EXISTS solar_realtime (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    power_current INTEGER NOT NULL,           -- Current power in W
    energy_today INTEGER NOT NULL,            -- Today's production in Wh
    energy_month INTEGER NOT NULL,            -- Month's production in Wh
    energy_total INTEGER NOT NULL,            -- Total lifetime in Wh
    inverter_status INTEGER DEFAULT 1,        -- 0=offline, 1=normal, 2=warning, 3=error
    collected_at INTEGER NOT NULL,            -- When we fetched this data
    UNIQUE(timestamp)
);

CREATE INDEX IF NOT EXISTS idx_realtime_timestamp ON solar_realtime(timestamp);
CREATE INDEX IF NOT EXISTS idx_realtime_collected ON solar_realtime(collected_at);

-- Hourly aggregated data (permanent retention)
CREATE TABLE IF NOT EXISTS solar_hourly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,               -- Start of hour (unix timestamp)
    energy_produced INTEGER NOT NULL,         -- Production in Wh for this hour
    power_avg INTEGER DEFAULT 0,              -- Average power in W
    power_max INTEGER DEFAULT 0,              -- Peak power in W
    power_min INTEGER DEFAULT 0,              -- Minimum power in W
    samples INTEGER DEFAULT 0,                -- Number of realtime samples used
    aggregated_at INTEGER NOT NULL,           -- When aggregation was performed
    UNIQUE(timestamp)
);

CREATE INDEX IF NOT EXISTS idx_hourly_timestamp ON solar_hourly(timestamp);

-- Daily aggregated data (permanent retention)
CREATE TABLE IF NOT EXISTS solar_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,                       -- YYYY-MM-DD format
    timestamp INTEGER NOT NULL,               -- Start of day (unix timestamp)
    energy_produced INTEGER NOT NULL,         -- Production in Wh for this day
    power_peak INTEGER DEFAULT 0,             -- Peak power in W
    power_peak_time INTEGER DEFAULT 0,        -- When peak occurred (unix timestamp)
    hours_sunlight REAL DEFAULT 0,            -- Hours with production > 10W
    capacity_factor REAL DEFAULT 0,           -- % of rated capacity (3780W)
    aggregated_at INTEGER NOT NULL,
    UNIQUE(date)
);

CREATE INDEX IF NOT EXISTS idx_daily_date ON solar_daily(date);
CREATE INDEX IF NOT EXISTS idx_daily_timestamp ON solar_daily(timestamp);

-- Monthly aggregated data (permanent retention)
CREATE TABLE IF NOT EXISTS solar_monthly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,                   -- 1-12
    timestamp INTEGER NOT NULL,               -- Start of month (unix timestamp)
    energy_produced INTEGER NOT NULL,         -- Production in Wh for this month
    power_peak INTEGER DEFAULT 0,             -- Peak power in W
    days_with_data INTEGER DEFAULT 0,         -- Number of days with data
    avg_daily_production INTEGER DEFAULT 0,   -- Average Wh per day
    capacity_factor REAL DEFAULT 0,           -- % of rated capacity
    aggregated_at INTEGER NOT NULL,
    UNIQUE(year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_year_month ON solar_monthly(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_timestamp ON solar_monthly(timestamp);

-- Yearly aggregated data (permanent retention)
CREATE TABLE IF NOT EXISTS solar_yearly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,               -- Start of year (unix timestamp)
    energy_produced INTEGER NOT NULL,         -- Production in Wh for this year
    power_peak INTEGER DEFAULT 0,             -- Peak power in W
    months_with_data INTEGER DEFAULT 0,       -- Number of months with data
    avg_monthly_production INTEGER DEFAULT 0, -- Average Wh per month
    capacity_factor REAL DEFAULT 0,           -- % of rated capacity
    aggregated_at INTEGER NOT NULL,
    UNIQUE(year)
);

CREATE INDEX IF NOT EXISTS idx_yearly_year ON solar_yearly(year);

-- API response cache (to avoid redundant calls)
CREATE TABLE IF NOT EXISTS api_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,                   -- API endpoint called
    params TEXT DEFAULT '',                   -- Query parameters (serialized)
    response TEXT NOT NULL,                   -- JSON response
    cached_at INTEGER NOT NULL,               -- When cached
    expires_at INTEGER NOT NULL,              -- When to invalidate
    UNIQUE(endpoint, params)
);

CREATE INDEX IF NOT EXISTS idx_cache_endpoint ON api_cache(endpoint);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at);

-- Metadata table for tracking collection status
CREATE TABLE IF NOT EXISTS collection_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Insert initial metadata
INSERT OR IGNORE INTO collection_metadata (key, value, updated_at) VALUES
    ('last_collection_timestamp', '0', 0),
    ('last_hourly_aggregation', '0', 0),
    ('last_daily_aggregation', '0', 0),
    ('last_monthly_aggregation', '0', 0),
    ('last_yearly_aggregation', '0', 0),
    ('backfill_status', 'pending', 0),
    ('backfill_oldest_date', '', 0);
SQL;

// Execute schema
try {
    $db->exec($schema);
    echo "✓ Schema created successfully\n";
    
    // Verify tables
    $tables = ['solar_realtime', 'solar_hourly', 'solar_daily', 'solar_monthly', 'solar_yearly', 'api_cache', 'collection_metadata'];
    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    $existing = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    echo "\nVerifying tables:\n";
    foreach ($tables as $table) {
        if (in_array($table, $existing)) {
            echo "  ✓ $table\n";
        } else {
            echo "  ✗ $table (MISSING!)\n";
        }
    }
    
    // Show initial metadata
    echo "\nInitial metadata:\n";
    $stmt = $db->query("SELECT key, value FROM collection_metadata ORDER BY key");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "  {$row['key']} = {$row['value']}\n";
    }
    
    echo "\n✓ Database initialization complete!\n";
    echo "Database location: " . DB_PATH . "\n";
    
    // Set proper permissions
    chmod(DB_PATH, 0644);
    echo "Permissions set to 0644\n";
    
} catch (PDOException $e) {
    die("ERROR: Schema creation failed: " . $e->getMessage() . "\n");
}

?>