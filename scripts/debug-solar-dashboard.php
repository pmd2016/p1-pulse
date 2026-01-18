#!/usr/bin/php
<?php
/**
 * Solar Dashboard Debug Script
 * Comprehensive diagnostics for data flow issues
 */

echo "=================================================================\n";
echo "SOLAR DASHBOARD DIAGNOSTIC SCRIPT\n";
echo "=================================================================\n\n";

// Change to the correct directory
chdir('/p1mon/www/custom');

// Test 1: Database File Exists and Readable
echo "TEST 1: Database File Check\n";
echo "-----------------------------------------------------------------\n";
$dbPath = '/p1mon/www/custom/data/solar.db';
if (file_exists($dbPath)) {
    echo "✅ Database file exists: $dbPath\n";
    echo "   Size: " . filesize($dbPath) . " bytes\n";
    echo "   Readable: " . (is_readable($dbPath) ? "Yes" : "No") . "\n";
    echo "   Permissions: " . substr(sprintf('%o', fileperms($dbPath)), -4) . "\n";
} else {
    echo "❌ Database file NOT FOUND: $dbPath\n";
    echo "   Cannot proceed with further tests.\n";
    exit(1);
}
echo "\n";

// Test 2: Database Contents
echo "TEST 2: Database Contents Check\n";
echo "-----------------------------------------------------------------\n";
try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Check tables
    $tables = $db->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    echo "Tables found: " . implode(', ', $tables) . "\n\n";
    
    // Check realtime data
    $count = $db->query("SELECT COUNT(*) FROM solar_realtime")->fetchColumn();
    echo "Realtime records: $count\n";
    
    if ($count > 0) {
        echo "\nLast 5 realtime records:\n";
        $stmt = $db->query("SELECT datetime(timestamp, 'unixepoch', 'localtime') as dt, 
                                   timestamp, energy_total, power_current, power_peak 
                            FROM solar_realtime 
                            ORDER BY timestamp DESC 
                            LIMIT 5");
        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($records as $r) {
            printf("  %s | TS:%d | Energy:%d Wh | Power:%d W | Peak:%d W\n",
                   $r['dt'], $r['timestamp'], $r['energy_total'], $r['power_current'], $r['power_peak']);
        }
    }
    
    // Check hourly data
    $count = $db->query("SELECT COUNT(*) FROM solar_hourly")->fetchColumn();
    echo "\nHourly records: $count\n";
    
    if ($count > 0) {
        echo "\nLast 3 hourly records:\n";
        $stmt = $db->query("SELECT datetime(timestamp, 'unixepoch', 'localtime') as dt,
                                   timestamp, energy_sum, power_avg, power_max
                            FROM solar_hourly
                            ORDER BY timestamp DESC
                            LIMIT 3");
        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($records as $r) {
            printf("  %s | TS:%d | Energy:%d Wh | Avg:%d W | Max:%d W\n",
                   $r['dt'], $r['timestamp'], $r['energy_sum'], $r['power_avg'], $r['power_max']);
        }
    }
    
} catch (Exception $e) {
    echo "❌ Database error: " . $e->getMessage() . "\n";
}
echo "\n";

// Test 3: API Endpoint - Current Data
echo "TEST 3: API Endpoint - Current Data\n";
echo "-----------------------------------------------------------------\n";
$url = 'http://localhost/custom/api/solar.php?action=current';
echo "Testing: $url\n";

$context = stream_context_create([
    'http' => [
        'timeout' => 5,
        'ignore_errors' => true
    ]
]);

$response = @file_get_contents($url, false, $context);
if ($response === false) {
    echo "❌ Failed to fetch URL\n";
    $error = error_get_last();
    if ($error) {
        echo "   Error: " . $error['message'] . "\n";
    }
} else {
    $httpCode = 200;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $header) {
            if (preg_match('/^HTTP\/\d\.\d\s+(\d+)/', $header, $matches)) {
                $httpCode = (int)$matches[1];
            }
        }
    }
    echo "HTTP Status: $httpCode\n";
    echo "Response length: " . strlen($response) . " bytes\n";
    
    // Try to decode JSON
    $data = json_decode($response, true);
    if (json_last_error() === JSON_ERROR_NONE) {
        echo "✅ Valid JSON response\n";
        echo "Response structure:\n";
        print_r($data);
    } else {
        echo "❌ Invalid JSON response\n";
        echo "JSON Error: " . json_last_error_msg() . "\n";
        echo "Raw response (first 500 chars):\n";
        echo substr($response, 0, 500) . "\n";
    }
}
echo "\n";

// Test 4: API Endpoint - Historical Data (Hours)
echo "TEST 4: API Endpoint - Historical Data (hours, zoom=24)\n";
echo "-----------------------------------------------------------------\n";
$url = 'http://localhost/custom/api/solar.php?period=hours&zoom=24';
echo "Testing: $url\n";

$response = @file_get_contents($url, false, $context);
if ($response === false) {
    echo "❌ Failed to fetch URL\n";
} else {
    $httpCode = 200;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $header) {
            if (preg_match('/^HTTP\/\d\.\d\s+(\d+)/', $header, $matches)) {
                $httpCode = (int)$matches[1];
            }
        }
    }
    echo "HTTP Status: $httpCode\n";
    echo "Response length: " . strlen($response) . " bytes\n";
    
    $data = json_decode($response, true);
    if (json_last_error() === JSON_ERROR_NONE) {
        echo "✅ Valid JSON response\n";
        echo "Period: " . ($data['period'] ?? 'N/A') . "\n";
        echo "Zoom: " . ($data['zoom'] ?? 'N/A') . "\n";
        echo "ChartData count: " . (isset($data['chartData']) ? count($data['chartData']) : 0) . "\n";
        
        if (isset($data['chartData']) && count($data['chartData']) > 0) {
            echo "\nFirst chartData entry:\n";
            print_r($data['chartData'][0]);
            echo "\nLast chartData entry:\n";
            print_r($data['chartData'][count($data['chartData']) - 1]);
        } else {
            echo "⚠️  No chartData entries\n";
        }
        
        if (isset($data['stats'])) {
            echo "\nStats:\n";
            print_r($data['stats']);
        }
    } else {
        echo "❌ Invalid JSON response\n";
        echo "JSON Error: " . json_last_error_msg() . "\n";
        echo "Raw response (first 500 chars):\n";
        echo substr($response, 0, 500) . "\n";
    }
}
echo "\n";

// Test 5: Check if solar.js is accessible
echo "TEST 5: Frontend Files Check\n";
echo "-----------------------------------------------------------------\n";
$files = [
    '/p1mon/www/custom/pages/solar.php' => 'Solar page',
    '/p1mon/www/custom/assets/js/solar.js' => 'Solar JavaScript',
    '/p1mon/www/custom/assets/css/solar.css' => 'Solar CSS'
];

foreach ($files as $path => $desc) {
    if (file_exists($path)) {
        echo "✅ $desc exists: $path\n";
        echo "   Size: " . filesize($path) . " bytes\n";
    } else {
        echo "❌ $desc NOT FOUND: $path\n";
    }
}
echo "\n";

// Test 6: Check Apache/Nginx error logs for clues
echo "TEST 6: Recent Error Log Check\n";
echo "-----------------------------------------------------------------\n";
$logPaths = [
    '/var/log/apache2/error.log',
    '/var/log/nginx/error.log',
    '/var/log/httpd/error_log'
];

$foundLog = false;
foreach ($logPaths as $logPath) {
    if (file_exists($logPath) && is_readable($logPath)) {
        echo "Checking: $logPath\n";
        $foundLog = true;
        
        // Get last 20 lines
        $lines = [];
        $fp = fopen($logPath, 'r');
        if ($fp) {
            fseek($fp, -4096, SEEK_END); // Read last 4KB
            $content = fread($fp, 4096);
            fclose($fp);
            $lines = array_slice(explode("\n", $content), -20);
            
            // Filter for solar-related errors
            $solarErrors = array_filter($lines, function($line) {
                return stripos($line, 'solar') !== false;
            });
            
            if (count($solarErrors) > 0) {
                echo "Recent solar-related errors:\n";
                foreach ($solarErrors as $error) {
                    echo "  $error\n";
                }
            } else {
                echo "No solar-related errors in last 20 lines\n";
            }
        }
        break;
    }
}

if (!$foundLog) {
    echo "Could not find/read any web server error logs\n";
}
echo "\n";

// Test 7: JavaScript Console Check Instructions
echo "TEST 7: Browser Console Check Instructions\n";
echo "-----------------------------------------------------------------\n";
echo "To check for frontend JavaScript errors:\n";
echo "1. Open browser to: http://your-p1-monitor/custom/?page=solar\n";
echo "2. Press F12 to open Developer Tools\n";
echo "3. Go to Console tab\n";
echo "4. Look for errors (red text)\n";
echo "5. Go to Network tab\n";
echo "6. Reload page\n";
echo "7. Check for:\n";
echo "   - solar.js loaded successfully (Status 200)\n";
echo "   - API calls to /custom/api/solar.php (Status 200)\n";
echo "   - Response preview shows valid JSON\n\n";

// Test 8: Quick Fix Suggestions
echo "TEST 8: Common Issues & Solutions\n";
echo "-----------------------------------------------------------------\n";
echo "If data exists in DB but not showing:\n\n";

echo "ISSUE A: API returns empty chartData\n";
echo "  Check: Does API period parameter match data availability?\n";
echo "  - Hourly data needs aggregation from realtime\n";
echo "  - Daily data needs aggregation from hourly\n";
echo "  Solution: Wait 1 hour for first hourly aggregation\n\n";

echo "ISSUE B: JavaScript not initializing\n";
echo "  Check browser console for:\n";
echo "  - 'SolarManager is not defined' → solar.js not loaded\n";
echo "  - 'Cannot read property of null' → Element IDs don't match\n";
echo "  Solution: Verify solar.js included in config.php\n\n";

echo "ISSUE C: Database has realtime but not hourly data\n";
echo "  Realtime data needs to be aggregated to hourly\n";
echo "  Solution: Run aggregation manually or wait for cron\n";
echo "  Command: php /p1mon/www/custom/scripts/solar-aggregator.php\n\n";

echo "ISSUE D: API accessible but returns wrong format\n";
echo "  Check: Response has 'chartData' array with expected fields\n";
echo "  Expected fields: timestamp, unixTimestamp, production, power\n";
echo "  Solution: Review API code for correct data mapping\n\n";

// Test 9: Generate test API call for manual inspection
echo "TEST 9: Manual Test Commands\n";
echo "-----------------------------------------------------------------\n";
echo "Test API directly with these commands:\n\n";

echo "# Current data:\n";
echo "curl -s 'http://localhost/custom/api/solar.php?action=current' | jq\n\n";

echo "# Historical (hours):\n";
echo "curl -s 'http://localhost/custom/api/solar.php?period=hours&zoom=24' | jq '.chartData | length'\n";
echo "curl -s 'http://localhost/custom/api/solar.php?period=hours&zoom=24' | jq '.chartData[0]'\n\n";

echo "# Check if response is valid JSON:\n";
echo "curl -s 'http://localhost/custom/api/solar.php?period=hours&zoom=24' | python -m json.tool > /dev/null && echo 'Valid JSON' || echo 'Invalid JSON'\n\n";

echo "=================================================================\n";
echo "DIAGNOSTIC COMPLETE\n";
echo "=================================================================\n";
echo "\nNext steps:\n";
echo "1. Review the test results above\n";
echo "2. Identify which test failed\n";
echo "3. Follow the relevant solution in TEST 8\n";
echo "4. Check browser console (TEST 7)\n";
echo "5. Run manual test commands (TEST 9)\n";
echo "\n";
?>