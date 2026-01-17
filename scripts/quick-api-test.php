#!/usr/bin/env php
<?php
/**
 * Quick API power value check
 */

$apiUrl = "http://localhost/custom/api/solar.php?action=current";
$response = @file_get_contents($apiUrl);

if ($response === false) {
    echo "❌ Could not connect to API\n";
    echo "Try: curl http://localhost/custom/api/solar.php?action=current\n";
    exit(1);
}

$data = json_decode($response, true);

if (!$data) {
    echo "❌ Invalid JSON response\n";
    exit(1);
}

echo "API Test Result:\n";
echo "================\n";
echo "Current power: " . $data['current']['power'] . " W\n";

// Check database
$db = new SQLite3('/p1mon/www/custom/data/solar.db', SQLITE3_OPEN_READONLY);
$result = $db->query("SELECT power_current FROM solar_realtime ORDER BY timestamp DESC LIMIT 1");
$row = $result->fetchArray(SQLITE3_ASSOC);
$dbPower = $row['power_current'];
$db->close();

echo "Database power: $dbPower W\n";
echo "\n";

if ($data['current']['power'] == $dbPower) {
    echo "✅ CORRECT - API matches database\n";
} else if ($data['current']['power'] == ($dbPower * 1000)) {
    echo "❌ ERROR - API is multiplying by 1000\n";
    echo "Fix: Remove * 1000 from solar.php\n";
} else if ($data['current']['power'] == ($dbPower / 100)) {
    echo "❌ ERROR - API is dividing by 100 (old compensation code)\n";
    echo "Fix: Remove / 100 from solar.php\n";
} else {
    echo "⚠️  WARNING - API value doesn't match database\n";
    echo "API/DB ratio: " . ($data['current']['power'] / $dbPower) . "\n";
}
?>