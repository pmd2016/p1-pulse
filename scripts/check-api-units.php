#!/usr/bin/env php
<?php
/**
 * Check actual Solplanet API response to understand units
 */

require_once '/p1mon/www/custom/lib/SolarConfig.php';
require_once '/p1mon/www/custom/lib/SolplanetAPI.php';

echo "=============================================================================\n";
echo "SOLPLANET API RESPONSE FORMAT CHECKER\n";
echo "=============================================================================\n\n";

// Load config
if (!SolarConfig::isEnabled()) {
    echo "❌ Solar monitoring is not enabled in config\n";
    exit(1);
}

$appKey = SolarConfig::get('app_key');
$appSecret = SolarConfig::get('app_secret');
$apiKey = SolarConfig::get('api_key');
$token = SolarConfig::get('token');
$sn = SolarConfig::get('sn');

if (!$appKey || !$appSecret || !$apiKey || !$token || !$sn) {
    echo "❌ Missing required credentials in config\n";
    exit(1);
}

echo "Config loaded successfully\n\n";

// Create API client
$api = new SolplanetAPI($appKey, $appSecret, $apiKey, $token, $sn);

echo "=============================================================================\n";
echo "TEST 1: getPlantOverview() - Plant-level data\n";
echo "=============================================================================\n\n";

try {
    $overview = $api->getPlantOverview();
    
    if (isset($overview['data'])) {
        $data = $overview['data'];
        
        echo "Raw API Response:\n";
        echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n\n";
        
        if (isset($data['Power']['value'])) {
            echo "Power Analysis:\n";
            echo "  Raw value: " . $data['Power']['value'] . " " . $data['Power']['unit'] . "\n";
            echo "  × 1000 = " . ($data['Power']['value'] * 1000) . " W\n";
            echo "  × 100 = " . ($data['Power']['value'] * 100) . " W\n";
            echo "  × 10 = " . ($data['Power']['value'] * 10) . " W\n";
            echo "\n";
        }
    } else {
        echo "No data field in response\n";
    }
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}

echo "\n";
echo "=============================================================================\n";
echo "TEST 2: getInverterData() - Inverter-specific data\n";
echo "=============================================================================\n\n";

try {
    $inverter = $api->getInverterData($sn);
    
    echo "Raw API Response:\n";
    echo json_encode($inverter, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n\n";
    
    // Try to find power field in response
    if (isset($inverter['data'])) {
        $data = $inverter['data'];
        
        echo "Looking for power-related fields...\n";
        foreach ($data as $key => $value) {
            if (stripos($key, 'power') !== false || stripos($key, 'pac') !== false || stripos($key, 'current') !== false) {
                echo "  Found: $key = " . json_encode($value) . "\n";
            }
        }
        echo "\n";
        
        // Check if it has the same nested structure
        if (isset($data['Power'])) {
            echo "Power field found:\n";
            echo "  Raw value: " . $data['Power']['value'] . " " . $data['Power']['unit'] . "\n";
            echo "  × 1000 = " . ($data['Power']['value'] * 1000) . " W\n";
            echo "  × 100 = " . ($data['Power']['value'] * 100) . " W\n";
            echo "\n";
        }
        
        // Check for 'currentPower' field
        if (isset($data['currentPower'])) {
            echo "currentPower field found:\n";
            echo "  Raw value: " . $data['currentPower'] . "\n";
            echo "  × 1 = " . $data['currentPower'] . " W (if already in W)\n";
            echo "  ÷ 100 = " . ($data['currentPower'] / 100) . " W (if in 0.01kW units)\n";
            echo "\n";
        }
    }
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}

echo "\n";
echo "=============================================================================\n";
echo "DATABASE COMPARISON\n";
echo "=============================================================================\n\n";

// Check what's in the database
$db = new SQLite3('/p1mon/www/custom/data/solar.db', SQLITE3_OPEN_READONLY);
$result = $db->query("SELECT power_current, energy_today FROM solar_realtime ORDER BY timestamp DESC LIMIT 1");
if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
    echo "Latest database values:\n";
    echo "  power_current: " . $row['power_current'] . " W\n";
    echo "  energy_today: " . $row['energy_today'] . " Wh\n";
    echo "\n";
    echo "If power_current is ~192000 and API shows ~1.92 KW:\n";
    echo "  Multiplier = " . ($row['power_current'] / 1.92) . "\n";
    echo "  Expected multiplier: 1000 (for KW → W)\n";
    echo "  Actual multiplier: ~100000 (100x too large!)\n";
}
$db->close();

echo "\n";
echo "=============================================================================\n";
echo "CONCLUSION\n";
echo "=============================================================================\n\n";
echo "Compare the API values above with the database values.\n";
echo "The correct conversion should be:\n";
echo "  - If API returns KW: multiply by 1000 to get W\n";
echo "  - If API returns 0.01 KW units: multiply by 10 to get W\n";
echo "  - If API returns W: use as-is\n";
echo "\n";

?>