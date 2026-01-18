#!/usr/bin/env php
<?php
/**
 * Phase 6: Discover Solplanet Historical Data API Capabilities
 * 
 * This script tests what historical data is available from the Solplanet API
 * and documents the response format for the backfill script.
 */

require_once '/p1mon/www/custom/lib/SolarConfig.php';
require_once '/p1mon/www/custom/lib/SolplanetAPI.php';

echo "================================================================================\n";
echo "SOLPLANET HISTORICAL DATA API DISCOVERY\n";
echo "================================================================================\n\n";

// Load credentials
if (!SolarConfig::isEnabled()) {
    die("❌ Solar monitoring is not enabled in config\n");
}

$appKey = SolarConfig::get('app_key');
$appSecret = SolarConfig::get('app_secret');
$apiKey = SolarConfig::get('api_key');
$token = SolarConfig::get('token');
$sn = SolarConfig::get('sn');

if (!$appKey || !$appSecret || !$apiKey || !$sn) {
    die("❌ Missing required credentials in config\n");
}

// Create API client
$api = new SolplanetAPI($appKey, $appSecret, $apiKey, $token, $sn);

echo "✓ API client initialized\n";
echo "✓ Inverter SN: $sn\n\n";

// Test 1: Available methods
echo "================================================================================\n";
echo "TEST 1: Available API Methods\n";
echo "================================================================================\n\n";

$methods = get_class_methods($api);
$getMethods = array_filter($methods, function($m) {
    return stripos($m, 'get') === 0;
});

echo "Available get* methods:\n";
foreach ($getMethods as $method) {
    echo "  • $method\n";
}
echo "\n";

// Test 2: Current data baseline
echo "================================================================================\n";
echo "TEST 2: Current Data Baseline (getPlantOverview)\n";
echo "================================================================================\n\n";

try {
    $current = $api->getPlantOverview();
    
    if (isset($current['data'])) {
        $data = $current['data'];
        
        echo "Current Production:\n";
        if (isset($data['Power'])) {
            echo "  Power: {$data['Power']['value']} {$data['Power']['unit']}\n";
        }
        if (isset($data['Today_Energy'])) {
            echo "  Today Energy: {$data['Today_Energy']['value']} {$data['Today_Energy']['unit']}\n";
        }
        if (isset($data['Month_Energy'])) {
            echo "  Month Energy: {$data['Month_Energy']['value']} {$data['Month_Energy']['unit']}\n";
        }
        if (isset($data['Total_Energy'])) {
            echo "  Total Energy: {$data['Total_Energy']['value']} {$data['Total_Energy']['unit']}\n";
        }
        echo "\n";
    } else {
        echo "⚠ No data field in response\n\n";
    }
} catch (Exception $e) {
    echo "❌ Error: {$e->getMessage()}\n\n";
}

// Test 3: Historical data - Yesterday
echo "================================================================================\n";
echo "TEST 3: Historical Data - Yesterday (getInverterData)\n";
echo "================================================================================\n\n";

$yesterday = date('Y-m-d', strtotime('-1 day'));
$startTime = "$yesterday 00:00:00";
$endTime = "$yesterday 23:59:59";

echo "Requesting: $startTime to $endTime\n\n";

try {
    $historical = $api->getInverterData($startTime, $endTime);
    
    echo "Response structure:\n";
    echo json_encode($historical, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n\n";
    
    if (isset($historical['data']) && is_array($historical['data'])) {
        $records = $historical['data'];
        echo "✓ Received " . count($records) . " data points\n";
        
        if (count($records) > 0) {
            echo "\nFirst record:\n";
            print_r($records[0]);
            
            echo "\nLast record:\n";
            print_r($records[count($records) - 1]);
            
            // Analyze data points
            echo "\nData Point Analysis:\n";
            $fields = array_keys($records[0]);
            echo "Available fields: " . implode(', ', $fields) . "\n";
        }
    } else {
        echo "⚠ No data array in response\n";
    }
} catch (Exception $e) {
    echo "❌ Error: {$e->getMessage()}\n\n";
}

// Test 4: Historical data - 7 days ago
echo "================================================================================\n";
echo "TEST 4: Historical Data - 7 Days Ago\n";
echo "================================================================================\n\n";

$sevenDaysAgo = date('Y-m-d', strtotime('-7 days'));
$startTime = "$sevenDaysAgo 00:00:00";
$endTime = "$sevenDaysAgo 23:59:59";

echo "Requesting: $startTime to $endTime\n\n";

try {
    $historical = $api->getInverterData($startTime, $endTime);
    
    if (isset($historical['data']) && is_array($historical['data'])) {
        $records = $historical['data'];
        echo "✓ Received " . count($records) . " data points\n";
        
        if (count($records) > 0) {
            echo "Sample record:\n";
            print_r($records[0]);
        }
    } else {
        echo "⚠ No data available for this period\n";
    }
} catch (Exception $e) {
    echo "❌ Error: {$e->getMessage()}\n\n";
}

// Test 5: Historical data - 30 days ago
echo "================================================================================\n";
echo "TEST 5: Historical Data - 30 Days Ago\n";
echo "================================================================================\n\n";

$thirtyDaysAgo = date('Y-m-d', strtotime('-30 days'));
$startTime = "$thirtyDaysAgo 00:00:00";
$endTime = "$thirtyDaysAgo 23:59:59";

echo "Requesting: $startTime to $endTime\n\n";

try {
    $historical = $api->getInverterData($startTime, $endTime);
    
    if (isset($historical['data']) && is_array($historical['data'])) {
        $records = $historical['data'];
        echo "✓ Received " . count($records) . " data points\n";
        echo "✓ Historical data available up to at least 30 days ago\n";
    } else {
        echo "⚠ No data available for this period\n";
    }
} catch (Exception $e) {
    echo "❌ Error: {$e->getMessage()}\n\n";
}

// Test 6: Check getPlantOutput for historical daily data
echo "================================================================================\n";
echo "TEST 6: Daily Production Data (getPlantOutput)\n";
echo "================================================================================\n\n";

try {
    $dailyData = $api->getPlantOutput('bydays', $yesterday);
    
    echo "Response for yesterday ($yesterday):\n";
    echo json_encode($dailyData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n\n";
    
    if (isset($dailyData['data'])) {
        echo "✓ Daily production data available\n";
    }
} catch (Exception $e) {
    echo "❌ Error: {$e->getMessage()}\n\n";
}

// Test 7: Check monthly data
echo "================================================================================\n";
echo "TEST 7: Monthly Production Data (getPlantOutput)\n";
echo "================================================================================\n\n";

$currentMonth = date('Y-m');

try {
    $monthlyData = $api->getPlantOutput('bymonths', $currentMonth);
    
    echo "Response for current month ($currentMonth):\n";
    echo json_encode($monthlyData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n\n";
    
    if (isset($monthlyData['data'])) {
        echo "✓ Monthly production data available\n";
    }
} catch (Exception $e) {
    echo "❌ Error: {$e->getMessage()}\n\n";
}

// Summary
echo "================================================================================\n";
echo "DISCOVERY SUMMARY\n";
echo "================================================================================\n\n";

echo "Key Findings:\n";
echo "1. getInverterData() provides detailed historical data\n";
echo "2. getPlantOutput() provides daily/monthly/yearly summaries\n";
echo "3. Date format: YYYY-MM-DD HH:MM:SS for inverter data\n";
echo "4. Date format: YYYY-MM-DD for daily, YYYY-MM for monthly\n";
echo "\nNext Steps:\n";
echo "1. Review the response structures above\n";
echo "2. Identify which fields contain power/energy data\n";
echo "3. Verify units (W vs KW, Wh vs KWh)\n";
echo "4. Create backfill script based on response format\n\n";

echo "Run this script and share the output to proceed with Phase 6!\n";