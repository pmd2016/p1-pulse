#!/usr/bin/env php
<?php
/**
 * Solar Configuration & API Debug Script
 * Shows config values and tests API connection
 */

define('BASE_DIR', '/p1mon/www/custom');
define('LIB_DIR', BASE_DIR . '/lib');

require_once LIB_DIR . '/SolarConfig.php';
require_once LIB_DIR . '/SolplanetAPI.php';

echo "\n";
echo str_repeat("=", 80) . "\n";
echo "SOLAR CONFIGURATION & API DEBUG\n";
echo str_repeat("=", 80) . "\n\n";

// 1. Show config file location
echo "1. CONFIG FILE LOCATION:\n";
$configPath = SolarConfig::getConfigPath();
if ($configPath) {
    echo "   ✓ Found: $configPath\n";
    echo "   ✓ Readable: " . (is_readable($configPath) ? 'Yes' : 'No') . "\n";
} else {
    echo "   ✗ No config file found!\n";
    echo "   Expected locations:\n";
    echo "     - /p1mon/config/solplanet.ini\n";
    echo "     - /etc/p1mon/solplanet.ini\n";
    exit(1);
}

echo "\n";

// 2. Show config values (masked)
echo "2. CONFIGURATION VALUES (masked):\n";
try {
    $config = SolarConfig::getAll(true); // masked
    foreach ($config as $key => $value) {
        printf("   %-25s : %s\n", $key, is_bool($value) ? ($value ? 'true' : 'false') : $value);
    }
} catch (Exception $e) {
    echo "   ✗ Error loading config: " . $e->getMessage() . "\n";
    exit(1);
}

echo "\n";

// 3. Check if enabled
echo "3. COLLECTION STATUS:\n";
$enabled = SolarConfig::isEnabled();
echo "   Enabled: " . ($enabled ? '✓ Yes' : '✗ No') . "\n";

if (!$enabled) {
    echo "   ⚠ Collection is disabled. Set 'enabled = true' in config.\n";
}

echo "\n";

// 4. Test API credentials
echo "4. API CREDENTIALS CHECK:\n";
$appKey = SolarConfig::get('app_key');
$appSecret = SolarConfig::get('app_secret');
$apiKey = SolarConfig::get('api_key');
$token = SolarConfig::get('token', '');
$sn = SolarConfig::get('sn');

$credentials = [
    'app_key' => $appKey,
    'app_secret' => $appSecret,
    'api_key' => $apiKey,
    'token' => $token,
    'sn' => $sn
];

$allPresent = true;
foreach ($credentials as $name => $value) {
    $status = !empty($value) ? '✓' : '✗';
    $display = !empty($value) ? substr($value, 0, 4) . '...' . substr($value, -4) : 'MISSING';
    printf("   %s %-15s : %s (length: %d)\n", $status, $name, $display, strlen($value));
    
    if (empty($value) && $name !== 'token') { // token is optional
        $allPresent = false;
    }
}

if (!$allPresent) {
    echo "\n   ✗ Some required credentials are missing!\n";
    exit(1);
}

echo "\n";

// 5. Test API connection
echo "5. API CONNECTION TEST:\n";
try {
    $api = new SolplanetAPI($appKey, $appSecret, $apiKey, $token, $sn);
    echo "   ✓ API client created successfully\n";
    
    echo "\n   Testing getPlantOverview()...\n";
    $result = $api->getPlantOverview();
    
    if (isset($result['success']) && $result['success']) {
        echo "   ✓ API call successful!\n";
        
        // Show full response to see actual field names
        echo "\n   Full API Response:\n";
        echo "   " . str_replace("\n", "\n   ", json_encode($result['data'], JSON_PRETTY_PRINT)) . "\n";
        
        if (isset($result['data'])) {
            $data = $result['data'];
            echo "\n   Current Data (parsed):\n";
            echo "   - Power:               " . (isset($data['Power']['value']) ? ($data['Power']['value'] * 1000) . ' W (' . $data['Power']['value'] . ' KW)' : 'N/A') . "\n";
            echo "   - Today (E-Today):     " . (isset($data['E-Today']['value']) ? ($data['E-Today']['value'] * 1000) . ' Wh (' . $data['E-Today']['value'] . ' KWh)' : 'N/A') . "\n";
            echo "   - Month (E-Month):     " . (isset($data['E-Month']['value']) ? ($data['E-Month']['value'] * 1000) . ' Wh (' . $data['E-Month']['value'] . ' KWh)' : 'N/A') . "\n";
            echo "   - Total (E-Total):     " . (isset($data['E-Total']['value']) ? ($data['E-Total']['value'] * 1000000) . ' Wh (' . $data['E-Total']['value'] . ' MWh)' : 'N/A') . "\n";
            echo "   - Year (E-Year):       " . (isset($data['E-Year']['value']) ? $data['E-Year']['value'] . ' KWh' : 'N/A') . "\n";
            echo "   - Status:              " . ($data['status'] ?? 'N/A') . " (1=normal, 0=offline, 2=warning, 3=error)\n";
            echo "   - Last Update:         " . ($data['ludt'] ?? 'N/A') . "\n";
        }
    } else {
        echo "   ✗ API call failed!\n";
        echo "\n   Response:\n";
        echo "   " . json_encode($result, JSON_PRETTY_PRINT) . "\n";
        
        // Show what might be wrong
        echo "\n   Possible issues:\n";
        if (isset($result['status']) && $result['status'] == 400) {
            echo "   - HTTP 400: Bad Request\n";
            echo "   - Check if credentials are correct\n";
            echo "   - Verify API endpoint is using End User API (not Pro API)\n";
            echo "   - Check signature format in SolplanetAPI.php\n";
        }
        
        exit(1);
    }
    
} catch (Exception $e) {
    echo "   ✗ Exception: " . $e->getMessage() . "\n";
    exit(1);
}

echo "\n";
echo str_repeat("=", 80) . "\n";
echo "DEBUG COMPLETE\n";
echo str_repeat("=", 80) . "\n\n";

echo "Next steps:\n";
echo "  - If API test passed: Run solar-collector.php\n";
echo "  - If API test failed: Check credentials in $configPath\n";
echo "\n";

?>