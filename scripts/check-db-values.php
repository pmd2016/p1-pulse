#!/usr/bin/env php
<?php
/**
 * Quick database value diagnostic
 */

$db = new SQLite3('/p1mon/www/custom/data/solar.db', SQLITE3_OPEN_READONLY);

echo "=============================================================================\n";
echo "SOLAR DATABASE VALUE DIAGNOSTIC\n";
echo "=============================================================================\n\n";

// Check latest realtime record
echo "Latest realtime record:\n";
echo str_repeat('-', 80) . "\n";
$result = $db->query("SELECT * FROM solar_realtime ORDER BY timestamp DESC LIMIT 1");
if ($row = $result->fetchArray(SQLITE3_ASSOC)) {
    foreach ($row as $key => $value) {
        printf("%-20s: %s\n", $key, $value);
    }
} else {
    echo "No data found\n";
}

echo "\n";
echo "Latest 5 realtime power readings:\n";
echo str_repeat('-', 80) . "\n";
$result = $db->query("SELECT timestamp, power_current, energy_today, datetime(timestamp, 'unixepoch', 'localtime') as dt FROM solar_realtime ORDER BY timestamp DESC LIMIT 5");
while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
    printf("%s | Power: %7d W | Today: %7d Wh\n", $row['dt'], $row['power_current'], $row['energy_today']);
}

echo "\n";
echo "Expected values for 3.78kW system:\n";
echo str_repeat('-', 80) . "\n";
echo "Power range:     0 - 3780 W (theoretical max)\n";
echo "Typical peak:    2500 - 3200 W (on sunny day)\n";
echo "Daily energy:    0 - 30000 Wh (0 - 30 kWh typical range)\n";
echo "\n";
echo "If power_current shows values like 830000, the data is NOT converted correctly.\n";
echo "It should show values like 1870 (1.87 kW) or 2450 (2.45 kW).\n";
echo "\n";

$db->close();
?>