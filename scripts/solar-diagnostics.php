#!/usr/bin/env php
<?php
/**
 * Solar Database Diagnostics
 * Shows current status of solar data collection
 * 
 * Usage: php solar-diagnostics.php [--table=TABLE_NAME] [--limit=N]
 */

define('DB_PATH', '/p1mon/www/custom/data/solar.db');

// Parse arguments
$options = getopt('', ['table:', 'limit:']);
$specificTable = $options['table'] ?? null;
$limit = (int)($options['limit'] ?? 10);

// Check if database exists
if (!file_exists(DB_PATH)) {
    die("ERROR: Database not found at " . DB_PATH . "\n");
}

// Connect to database
try {
    $db = new PDO('sqlite:' . DB_PATH);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("ERROR: Could not connect to database: " . $e->getMessage() . "\n");
}

/**
 * Format bytes to human readable
 */
function formatBytes($bytes) {
    $units = ['B', 'KB', 'MB', 'GB'];
    $i = 0;
    while ($bytes >= 1024 && $i < count($units) - 1) {
        $bytes /= 1024;
        $i++;
    }
    return round($bytes, 2) . ' ' . $units[$i];
}

/**
 * Format timestamp
 */
function formatTime($timestamp) {
    if ($timestamp == 0) return 'Never';
    return date('Y-m-d H:i:s', $timestamp);
}

/**
 * Show metadata
 */
function showMetadata($db) {
    echo "\n" . str_repeat("=", 80) . "\n";
    echo "COLLECTION METADATA\n";
    echo str_repeat("=", 80) . "\n";
    
    $stmt = $db->query("SELECT key, value, updated_at FROM collection_metadata ORDER BY key");
    $metadata = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($metadata as $row) {
        $label = str_replace('_', ' ', ucwords($row['key'], '_'));
        $value = $row['value'];
        
        // Format timestamps
        if (strpos($row['key'], 'timestamp') !== false || strpos($row['key'], 'aggregation') !== false) {
            $ts = (int)$value;
            if ($ts > 0) {
                $value = formatTime($ts) . " (" . $value . ")";
            }
        }
        
        $updated = formatTime($row['updated_at']);
        printf("%-30s : %s\n", $label, $value);
        printf("%-30s   (updated: %s)\n", "", $updated);
    }
}

/**
 * Show table statistics
 */
function showTableStats($db) {
    echo "\n" . str_repeat("=", 80) . "\n";
    echo "TABLE STATISTICS\n";
    echo str_repeat("=", 80) . "\n";
    
    $tables = ['solar_realtime', 'solar_hourly', 'solar_daily', 'solar_monthly', 'solar_yearly', 'api_cache'];
    
    printf("%-20s %10s %20s %20s\n", "Table", "Rows", "Oldest Record", "Latest Record");
    echo str_repeat("-", 80) . "\n";
    
    foreach ($tables as $table) {
        // Count rows
        $stmt = $db->query("SELECT COUNT(*) FROM $table");
        $count = $stmt->fetchColumn();
        
        // Get timestamp range
        $tsField = ($table === 'solar_daily') ? 'timestamp' : 'timestamp';
        if ($table === 'api_cache') $tsField = 'cached_at';
        
        $oldest = $newest = 'N/A';
        
        if ($count > 0) {
            $stmt = $db->query("SELECT MIN($tsField), MAX($tsField) FROM $table");
            list($minTs, $maxTs) = $stmt->fetch(PDO::FETCH_NUM);
            
            if ($minTs) $oldest = date('Y-m-d H:i', $minTs);
            if ($maxTs) $newest = date('Y-m-d H:i', $maxTs);
        }
        
        printf("%-20s %10d %20s %20s\n", $table, $count, $oldest, $newest);
    }
    
    // Database file size
    $filesize = filesize(DB_PATH);
    echo str_repeat("-", 80) . "\n";
    printf("Database file size: %s\n", formatBytes($filesize));
}

/**
 * Show recent realtime data
 */
function showRealtimeData($db, $limit) {
    echo "\n" . str_repeat("=", 80) . "\n";
    echo "RECENT REALTIME DATA (last $limit entries)\n";
    echo str_repeat("=", 80) . "\n";
    
    $stmt = $db->prepare("
        SELECT 
            datetime(timestamp, 'unixepoch', 'localtime') as time,
            power_current,
            energy_today,
            energy_month,
            inverter_status,
            datetime(collected_at, 'unixepoch', 'localtime') as collected
        FROM solar_realtime 
        ORDER BY timestamp DESC 
        LIMIT :limit
    ");
    $stmt->execute([':limit' => $limit]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($rows)) {
        echo "No data found.\n";
        return;
    }
    
    printf("%-20s %10s %12s %12s %8s %20s\n", "Time", "Power (W)", "Today (Wh)", "Month (Wh)", "Status", "Collected");
    echo str_repeat("-", 80) . "\n";
    
    foreach ($rows as $row) {
        $status = ['Offline', 'Normal', 'Warning', 'Error'][$row['inverter_status']] ?? 'Unknown';
        printf(
            "%-20s %10d %12d %12d %8s %20s\n",
            $row['time'],
            $row['power_current'],
            $row['energy_today'],
            $row['energy_month'],
            $status,
            $row['collected']
        );
    }
}

/**
 * Show hourly data
 */
function showHourlyData($db, $limit) {
    echo "\n" . str_repeat("=", 80) . "\n";
    echo "RECENT HOURLY DATA (last $limit hours)\n";
    echo str_repeat("=", 80) . "\n";
    
    $stmt = $db->prepare("
        SELECT 
            datetime(timestamp, 'unixepoch', 'localtime') as hour,
            energy_produced,
            power_avg,
            power_max,
            samples
        FROM solar_hourly 
        ORDER BY timestamp DESC 
        LIMIT :limit
    ");
    $stmt->execute([':limit' => $limit]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($rows)) {
        echo "No hourly data yet. Aggregation runs after each hour completes.\n";
        return;
    }
    
    printf("%-20s %12s %12s %12s %8s\n", "Hour", "Energy (Wh)", "Avg (W)", "Peak (W)", "Samples");
    echo str_repeat("-", 80) . "\n";
    
    foreach ($rows as $row) {
        printf(
            "%-20s %12d %12d %12d %8d\n",
            $row['hour'],
            $row['energy_produced'],
            $row['power_avg'],
            $row['power_max'],
            $row['samples']
        );
    }
}

/**
 * Show daily data
 */
function showDailyData($db, $limit) {
    echo "\n" . str_repeat("=", 80) . "\n";
    echo "RECENT DAILY DATA (last $limit days)\n";
    echo str_repeat("=", 80) . "\n";
    
    $stmt = $db->prepare("
        SELECT 
            date,
            energy_produced,
            power_peak,
            datetime(power_peak_time, 'unixepoch', 'localtime') as peak_time,
            hours_sunlight,
            capacity_factor
        FROM solar_daily 
        ORDER BY date DESC 
        LIMIT :limit
    ");
    $stmt->execute([':limit' => $limit]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($rows)) {
        echo "No daily data yet. Aggregation runs for completed days only.\n";
        return;
    }
    
    printf("%-12s %12s %12s %20s %10s %10s\n", "Date", "Energy (Wh)", "Peak (W)", "Peak Time", "Sun Hrs", "Cap %");
    echo str_repeat("-", 80) . "\n";
    
    foreach ($rows as $row) {
        printf(
            "%-12s %12d %12d %20s %10.1f %9.1f%%\n",
            $row['date'],
            $row['energy_produced'],
            $row['power_peak'],
            $row['peak_time'],
            $row['hours_sunlight'],
            $row['capacity_factor']
        );
    }
}

/**
 * Show monthly data
 */
function showMonthlyData($db, $limit) {
    echo "\n" . str_repeat("=", 80) . "\n";
    echo "RECENT MONTHLY DATA (last $limit months)\n";
    echo str_repeat("=", 80) . "\n";
    
    $stmt = $db->prepare("
        SELECT 
            printf('%04d-%02d', year, month) as month,
            energy_produced,
            power_peak,
            days_with_data,
            avg_daily_production,
            capacity_factor
        FROM solar_monthly 
        ORDER BY year DESC, month DESC 
        LIMIT :limit
    ");
    $stmt->execute([':limit' => $limit]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($rows)) {
        echo "No monthly data yet. Aggregation runs for completed months only.\n";
        return;
    }
    
    printf("%-10s %14s %12s %10s %14s %10s\n", "Month", "Energy (kWh)", "Peak (W)", "Days", "Avg/Day (Wh)", "Cap %");
    echo str_repeat("-", 80) . "\n";
    
    foreach ($rows as $row) {
        printf(
            "%-10s %14.1f %12d %10d %14d %9.1f%%\n",
            $row['month'],
            $row['energy_produced'] / 1000,
            $row['power_peak'],
            $row['days_with_data'],
            $row['avg_daily_production'],
            $row['capacity_factor']
        );
    }
}

/**
 * Show yearly data
 */
function showYearlyData($db, $limit) {
    echo "\n" . str_repeat("=", 80) . "\n";
    echo "YEARLY DATA\n";
    echo str_repeat("=", 80) . "\n";
    
    $stmt = $db->prepare("
        SELECT 
            year,
            energy_produced,
            power_peak,
            months_with_data,
            avg_monthly_production,
            capacity_factor
        FROM solar_yearly 
        ORDER BY year DESC 
        LIMIT :limit
    ");
    $stmt->execute([':limit' => $limit]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($rows)) {
        echo "No yearly data yet. Aggregation runs for completed years only.\n";
        return;
    }
    
    printf("%-6s %14s %12s %10s %16s %10s\n", "Year", "Energy (kWh)", "Peak (W)", "Months", "Avg/Month (kWh)", "Cap %");
    echo str_repeat("-", 80) . "\n";
    
    foreach ($rows as $row) {
        printf(
            "%-6d %14.1f %12d %10d %16.1f %9.1f%%\n",
            $row['year'],
            $row['energy_produced'] / 1000,
            $row['power_peak'],
            $row['months_with_data'],
            $row['avg_monthly_production'] / 1000,
            $row['capacity_factor']
        );
    }
}

// Main execution
echo "\n";
echo "╔══════════════════════════════════════════════════════════════════════════════╗\n";
echo "║                     SOLAR DATA COLLECTION DIAGNOSTICS                        ║\n";
echo "╚══════════════════════════════════════════════════════════════════════════════╝\n";

// Show specific table if requested
if ($specificTable) {
    switch ($specificTable) {
        case 'realtime':
            showRealtimeData($db, $limit);
            break;
        case 'hourly':
            showHourlyData($db, $limit);
            break;
        case 'daily':
            showDailyData($db, $limit);
            break;
        case 'monthly':
            showMonthlyData($db, $limit);
            break;
        case 'yearly':
            showYearlyData($db, $limit);
            break;
        default:
            echo "Unknown table: $specificTable\n";
            echo "Valid tables: realtime, hourly, daily, monthly, yearly\n";
    }
    exit(0);
}

// Show everything
showMetadata($db);
showTableStats($db);
showRealtimeData($db, $limit);
showHourlyData($db, $limit);
showDailyData($db, $limit);
showMonthlyData($db, $limit);
showYearlyData($db, $limit);

echo "\n";
echo str_repeat("=", 80) . "\n";
echo "QUICK TIPS:\n";
echo str_repeat("=", 80) . "\n";
echo "  • Show only specific table:  php solar-diagnostics.php --table=hourly\n";
echo "  • Show more/fewer entries:   php solar-diagnostics.php --limit=20\n";
echo "  • Check collector log:       tail -50 /tmp/solar-collector.log\n";
echo "  • Test API connection:       php test-python-match.php\n";
echo "  • Manual collection:         php solar-collector.php --verbose --force\n";
echo str_repeat("=", 80) . "\n";
echo "\n";

?>