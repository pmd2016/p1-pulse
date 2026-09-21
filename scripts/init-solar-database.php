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
// Schema lives in solar-schema.sql so the API test harness can build an identical
// database without duplicating the definitions.
define('SCHEMA_PATH', __DIR__ . '/solar-schema.sql');

if (!is_readable(SCHEMA_PATH)) {
    die('ERROR: Schema file not found: ' . SCHEMA_PATH . "\n");
}

$schema = file_get_contents(SCHEMA_PATH);

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