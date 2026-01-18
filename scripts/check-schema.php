#!/usr/bin/php
<?php
/**
 * Check Solar Database Schema
 */

$dbPath = '/p1mon/www/custom/data/solar.db';

if (!file_exists($dbPath)) {
    echo "Database not found: $dbPath\n";
    exit(1);
}

try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "SOLAR DATABASE SCHEMA\n";
    echo "=================================================================\n\n";
    
    $tables = ['solar_realtime', 'solar_hourly', 'solar_daily', 'solar_monthly', 'solar_yearly'];
    
    foreach ($tables as $table) {
        echo "Table: $table\n";
        echo "-----------------------------------------------------------------\n";
        
        // Get schema
        $stmt = $db->query("PRAGMA table_info($table)");
        $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo "Columns:\n";
        foreach ($columns as $col) {
            printf("  %-20s %s %s\n", 
                   $col['name'], 
                   $col['type'],
                   $col['pk'] ? '(PRIMARY KEY)' : '');
        }
        
        // Get sample data
        $count = $db->query("SELECT COUNT(*) FROM $table")->fetchColumn();
        echo "\nRecord count: $count\n";
        
        if ($count > 0) {
            echo "\nSample record (most recent):\n";
            $stmt = $db->query("SELECT * FROM $table ORDER BY timestamp DESC LIMIT 1");
            $record = $stmt->fetch(PDO::FETCH_ASSOC);
            foreach ($record as $key => $value) {
                printf("  %-20s = %s\n", $key, $value);
            }
        }
        
        echo "\n\n";
    }
    
    echo "=================================================================\n";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
?>