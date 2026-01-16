#!/usr/bin/env php
<?php
/**
 * Solar API Test Script
 * Tests all endpoints and data formats
 */

// Configuration
define('BASE_DIR', '/p1mon/www/custom');
define('DB_PATH', BASE_DIR . '/data/solar.db');
define('LIB_DIR', BASE_DIR . '/lib');
define('API_DIR', BASE_DIR . '/api');

echo "=============================================================================\n";
echo "SOLAR API TEST SCRIPT\n";
echo "=============================================================================\n\n";

// Include the API file by simulating GET parameters
function testEndpoint($description, $params) {
    echo "TEST: $description\n";
    echo str_repeat('-', 80) . "\n";
    
    // Set GET parameters
    foreach ($params as $key => $value) {
        $_GET[$key] = $value;
    }
    
    // Capture output
    ob_start();
    include API_DIR . '/solar.php';
    $output = ob_get_clean();
    
    // Clear GET parameters
    $_GET = [];
    
    // Parse JSON
    $data = json_decode($output, true);
    
    if ($data === null) {
        echo "❌ FAILED: Invalid JSON response\n";
        echo "Raw output: $output\n";
        return false;
    }
    
    if (isset($data['error'])) {
        echo "⚠️  WARNING: " . $data['error'] . "\n";
        if (isset($data['message'])) {
            echo "   Message: " . $data['message'] . "\n";
        }
        echo "\n";
        return false;
    }
    
    // Pretty print response
    echo "✅ SUCCESS\n";
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    echo "\n";
    return true;
}

echo "\n";
echo ">>> Testing Current Data Endpoint\n\n";
testEndpoint(
    "Get current/realtime solar data",
    ['action' => 'current']
);

echo "\n";
echo ">>> Testing Hourly Historical Data\n\n";
testEndpoint(
    "Get last 24 hours of data",
    ['period' => 'hours', 'zoom' => '24']
);

testEndpoint(
    "Get last 48 hours of data",
    ['period' => 'hours', 'zoom' => '48']
);

testEndpoint(
    "Get last 72 hours of data",
    ['period' => 'hours', 'zoom' => '72']
);

echo "\n";
echo ">>> Testing Daily Historical Data\n\n";
testEndpoint(
    "Get last 7 days of data",
    ['period' => 'days', 'zoom' => '7']
);

testEndpoint(
    "Get last 14 days of data",
    ['period' => 'days', 'zoom' => '14']
);

testEndpoint(
    "Get last 30 days of data",
    ['period' => 'days', 'zoom' => '30']
);

echo "\n";
echo ">>> Testing Monthly Historical Data\n\n";
testEndpoint(
    "Get last 12 months of data",
    ['period' => 'months', 'zoom' => '12']
);

testEndpoint(
    "Get last 24 months of data",
    ['period' => 'months', 'zoom' => '24']
);

echo "\n";
echo ">>> Testing Yearly Historical Data\n\n";
testEndpoint(
    "Get last 5 years of data",
    ['period' => 'years', 'zoom' => '5']
);

testEndpoint(
    "Get last 10 years of data",
    ['period' => 'years', 'zoom' => '10']
);

echo "\n";
echo ">>> Testing Default Parameters\n\n";
testEndpoint(
    "Default endpoint (should be hours/24)",
    []
);

echo "\n";
echo ">>> Testing Invalid Parameters\n\n";
testEndpoint(
    "Invalid period (should default to hours)",
    ['period' => 'invalid', 'zoom' => '24']
);

echo "\n";
echo "=============================================================================\n";
echo "TEST SUITE COMPLETE\n";
echo "=============================================================================\n";
?>