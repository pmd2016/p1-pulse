#!/usr/bin/env php
<?php
/**
 * Solar API Response Diagnostic
 * Checks what the API returns and compares to what frontend expects
 */

echo "================================================================================\n";
echo "SOLAR API DIAGNOSTIC - Check API Response Format\n";
echo "================================================================================\n\n";

// Test URL (adjust if needed)
$baseUrl = 'http://localhost/custom/api/solar.php';

$tests = [
    [
        'name' => 'Current Data',
        'url' => $baseUrl . '?action=current',
        'expects' => ['power', 'energy', 'energyToday', 'energyMonth']
    ],
    [
        'name' => 'Hourly Data (24h)',
        'url' => $baseUrl . '?period=hours&zoom=24',
        'expects' => ['chartData', 'stats']
    ],
    [
        'name' => 'Daily Data (7d)',
        'url' => $baseUrl . '?period=days&zoom=7',
        'expects' => ['chartData', 'stats']
    ]
];

foreach ($tests as $test) {
    echo "================================================================================\n";
    echo "TEST: {$test['name']}\n";
    echo "================================================================================\n";
    echo "URL: {$test['url']}\n\n";
    
    // Fetch response
    $response = @file_get_contents($test['url']);
    
    if ($response === false) {
        echo "❌ Failed to fetch data\n";
        echo "   Check that Apache/web server is running\n";
        echo "   URL: {$test['url']}\n\n";
        continue;
    }
    
    // Decode JSON
    $data = json_decode($response, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "❌ Invalid JSON response\n";
        echo "   Error: " . json_last_error_msg() . "\n";
        echo "   Raw response: " . substr($response, 0, 200) . "...\n\n";
        continue;
    }
    
    // Check expected fields
    echo "Response structure:\n";
    foreach ($test['expects'] as $field) {
        if (isset($data[$field])) {
            echo "  ✓ $field: present\n";
        } else {
            echo "  ❌ $field: MISSING\n";
        }
    }
    
    // For chart data, check detailed structure
    if (isset($data['chartData']) && is_array($data['chartData'])) {
        $count = count($data['chartData']);
        echo "\nChart Data:\n";
        echo "  Records: $count\n";
        
        if ($count > 0) {
            $first = $data['chartData'][0];
            echo "\n  First record fields:\n";
            
            $requiredFields = ['timestamp', 'unixTimestamp', 'production', 'power'];
            foreach ($requiredFields as $field) {
                if (isset($first[$field])) {
                    $value = $first[$field];
                    echo "    ✓ $field: $value\n";
                } else {
                    echo "    ❌ $field: MISSING (frontend will crash!)\n";
                }
            }
            
            // Show full first record
            echo "\n  Full first record:\n";
            echo "    " . json_encode($first, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
        }
    }
    
    // Check stats
    if (isset($data['stats'])) {
        echo "\nStats structure:\n";
        $stats = $data['stats'];
        
        $requiredStats = ['totalEnergy', 'peakPower'];
        foreach ($requiredStats as $field) {
            if (isset($stats[$field])) {
                echo "  ✓ $field: " . json_encode($stats[$field]) . "\n";
            } else {
                echo "  ❌ $field: MISSING\n";
            }
        }
    }
    
    echo "\n";
}

// Summary
echo "================================================================================\n";
echo "FRONTEND EXPECTATIONS\n";
echo "================================================================================\n\n";

echo "The solar.js frontend expects this structure:\n\n";

echo "For period=hours/days/months/years:\n";
echo json_encode([
    'period' => 'hours',
    'zoom' => 24,
    'chartData' => [
        [
            'timestamp' => '2026-01-17 16:00:00',
            'unixTimestamp' => 1768662000,
            'production' => 0.100,  // kWh (energy_produced / 1000)
            'power' => 69,          // W (power_avg)
            'powerMax' => 83        // W (power_max) - optional
        ]
    ],
    'stats' => [
        'totalEnergy' => 2.4,       // kWh
        'peakPower' => [
            'value' => 83,
            'time' => '2026-01-17 16:00:00'
        ]
    ]
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n\n";

echo "KEY REQUIREMENTS:\n";
echo "  1. chartData MUST be an array (even if empty)\n";
echo "  2. Each item MUST have: timestamp, unixTimestamp, production, power\n";
echo "  3. production MUST be in kWh (divide Wh by 1000)\n";
echo "  4. power MUST be in W (not kW)\n";
echo "  5. unixTimestamp MUST be an integer\n\n";

echo "If any of these are wrong, the chart will be blank or crash!\n\n";

// Direct database check
echo "================================================================================\n";
echo "DIRECT DATABASE CHECK\n";
echo "================================================================================\n\n";

$dbPath = '/p1mon/www/custom/data/solar.db';

if (!file_exists($dbPath)) {
    echo "❌ Database not found: $dbPath\n\n";
} else {
    try {
        $db = new PDO("sqlite:$dbPath");
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Check hourly data
        $hourly = $db->query("SELECT COUNT(*) FROM solar_hourly")->fetchColumn();
        echo "Hourly records: $hourly\n";
        
        if ($hourly > 0) {
            echo "\nLatest hourly record:\n";
            $row = $db->query("SELECT * FROM solar_hourly ORDER BY timestamp DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            foreach ($row as $key => $value) {
                echo "  $key: $value\n";
            }
            
            echo "\nWhat API should return for this record:\n";
            echo "  timestamp: " . date('Y-m-d H:i:s', $row['timestamp']) . "\n";
            echo "  unixTimestamp: " . $row['timestamp'] . "\n";
            echo "  production: " . round($row['energy_produced'] / 1000, 3) . " kWh\n";
            echo "  power: " . round($row['power_avg'], 0) . " W\n";
            echo "  powerMax: " . round($row['power_max'], 0) . " W\n";
        }
        
        // Check daily data
        $daily = $db->query("SELECT COUNT(*) FROM solar_daily")->fetchColumn();
        echo "\nDaily records: $daily\n";
        
        if ($daily > 0) {
            echo "\nLatest daily record:\n";
            $row = $db->query("SELECT * FROM solar_daily ORDER BY date DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
            foreach ($row as $key => $value) {
                echo "  $key: $value\n";
            }
        }
        
    } catch (Exception $e) {
        echo "❌ Database error: " . $e->getMessage() . "\n";
    }
}

echo "\n";
echo "Run this diagnostic and share the output to identify the issue!\n";