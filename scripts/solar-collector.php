#!/usr/bin/env php
<?php
/**
 * Solar Data Collector
 * Fetches current production data from Solplanet API and stores in database
 * 
 * Usage: php solar-collector.php [--force] [--verbose]
 * 
 * Run via cron every 10 minutes:
 * *\/10 * * * * /usr/bin/php /p1mon/www/custom/scripts/solar-collector.php >> /tmp/solar-collector.log 2>&1
 */

// Configuration
define('BASE_DIR', '/p1mon/www/custom');
define('DB_PATH', BASE_DIR . '/data/solar.db');
define('LIB_DIR', BASE_DIR . '/lib');

// Parse command line arguments
$options = getopt('', ['force', 'verbose']);
$force = isset($options['force']);
$verbose = isset($options['verbose']);

// Include dependencies
require_once LIB_DIR . '/SolarConfig.php';
require_once LIB_DIR . '/SolplanetAPI.php';

/**
 * Logger function
 */
function logMessage($message, $level = 'INFO') {
    global $verbose;
    $timestamp = date('Y-m-d H:i:s');
    $line = "[$timestamp] [$level] $message\n";
    
    if ($verbose || $level === 'ERROR') {
        echo $line;
    }
    
    // Also log to syslog
    if ($level === 'ERROR') {
        error_log("solar-collector: $message");
    }
}

/**
 * Main collection function
 */
function collectData() {
    global $force, $verbose;
    
    logMessage("Starting solar data collection", 'INFO');
    
    // Check if collection is enabled
    try {
        if (!SolarConfig::isEnabled() && !$force) {
            logMessage("Solar collection is disabled in config (use --force to override)", 'INFO');
            return false;
        }
    } catch (Exception $e) {
        logMessage("Failed to load solar config: " . $e->getMessage(), 'ERROR');
        if (!$force) {
            return false;
        }
        logMessage("Continuing with --force flag despite config error", 'INFO');
    }
    
    // Connect to database
    try {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        logMessage("Database connected: " . DB_PATH, 'INFO');
    } catch (PDOException $e) {
        logMessage("Database connection failed: " . $e->getMessage(), 'ERROR');
        return false;
    }
    
    // Check last collection time (avoid collecting more than once per 5 minutes unless forced)
    if (!$force) {
        $stmt = $db->prepare("SELECT value FROM collection_metadata WHERE key = 'last_collection_timestamp'");
        $stmt->execute();
        $lastCollection = (int)$stmt->fetchColumn();
        $timeSinceLastCollection = time() - $lastCollection;
        
        if ($timeSinceLastCollection < 300) { // 5 minutes
            logMessage("Skipping collection - last run was $timeSinceLastCollection seconds ago (min 300s)", 'INFO');
            return false;
        }
    }
    
    // Initialize API client
    try {
        // Load credentials from config
        $appKey = SolarConfig::get('app_key');
        $appSecret = SolarConfig::get('app_secret');
        $apiKey = SolarConfig::get('api_key');
        $token = SolarConfig::get('token', ''); // Optional for End User API
        $sn = SolarConfig::get('sn');
        
        if (!$appKey || !$appSecret || !$apiKey || !$sn) {
            logMessage("Missing required credentials in config", 'ERROR');
            return false;
        }
        
        $api = new SolplanetAPI($appKey, $appSecret, $apiKey, $token, $sn);
        
        if ($verbose) {
            logMessage("API client initialized with credentials from config", 'INFO');
        }
        
    } catch (Exception $e) {
        logMessage("Failed to initialize API client: " . $e->getMessage(), 'ERROR');
        return false;
    }
    
    // Fetch plant overview
    try {
        logMessage("Fetching plant overview from API", 'INFO');
        
        if ($verbose) {
            logMessage("Using credentials - app_key: " . substr($appKey, 0, 6) . "..., api_key: " . substr($apiKey, 0, 8) . "...", 'INFO');
        }
        
        $overview = $api->getPlantOverview();
        
        if ($verbose) {
            logMessage("API Response: " . json_encode($overview, JSON_PRETTY_PRINT), 'INFO');
        }
        
        // Validate response
        if (!isset($overview['success']) || !$overview['success']) {
            logMessage("API returned unsuccessful response: " . json_encode($overview), 'ERROR');
            
            // If we got an error response, show more details
            if (isset($overview['error'])) {
                logMessage("Error details: " . $overview['error'], 'ERROR');
            }
            if (isset($overview['status'])) {
                logMessage("HTTP Status: " . $overview['status'], 'ERROR');
            }
            
            return false;
        }
        
        if (!isset($overview['data'])) {
            logMessage("API response missing data field", 'ERROR');
            return false;
        }
        
        $data = $overview['data'];
        
        // Extract values - API returns nested objects with 'value' and 'unit' properties
        // Power.value is ALREADY in W (not KW as initially thought)
        $powerCurrent = isset($data['Power']['value']) ? (int)$data['Power']['value'] : 0;

        // Energy values are in kWh, convert to Wh
        $energyToday = isset($data['E-Today']['value']) ? (int)($data['E-Today']['value'] * 1000) : 0;
        $energyMonth = isset($data['E-Month']['value']) ? (int)($data['E-Month']['value'] * 1000) : 0;

        // E-Total is in MWh, convert to Wh
        $energyTotal = isset($data['E-Total']['value']) ? (int)($data['E-Total']['value'] * 1000000) : 0;
        
        // Status: "1" (string) = normal, convert to int
        $status = isset($data['status']) ? (int)$data['status'] : 0;
        
        $timestamp = time();
        $collectedAt = $timestamp;
        
        logMessage(sprintf(
            "Data extracted - Power: %dW, Today: %dWh, Month: %dWh, Total: %dWh, Status: %d",
            $powerCurrent, $energyToday, $energyMonth, $energyTotal, $status
        ), 'INFO');
        
    } catch (Exception $e) {
        logMessage("API fetch failed: " . $e->getMessage(), 'ERROR');
        return false;
    }
    
    // Store in database
    try {
        $stmt = $db->prepare("
            INSERT INTO solar_realtime (timestamp, power_current, energy_today, energy_month, energy_total, inverter_status, collected_at)
            VALUES (:timestamp, :power, :today, :month, :total, :status, :collected)
            ON CONFLICT(timestamp) DO UPDATE SET
                power_current = :power,
                energy_today = :today,
                energy_month = :month,
                energy_total = :total,
                inverter_status = :status,
                collected_at = :collected
        ");
        
        $stmt->execute([
            ':timestamp' => $timestamp,
            ':power' => $powerCurrent,
            ':today' => $energyToday,
            ':month' => $energyMonth,
            ':total' => $energyTotal,
            ':status' => $status,
            ':collected' => $collectedAt
        ]);
        
        logMessage("Data stored successfully in solar_realtime", 'INFO');
        
        // Update metadata
        $stmt = $db->prepare("
            INSERT OR REPLACE INTO collection_metadata (key, value, updated_at)
            VALUES ('last_collection_timestamp', :timestamp, :updated)
        ");
        $stmt->execute([':timestamp' => $timestamp, ':updated' => time()]);
        
    } catch (PDOException $e) {
        logMessage("Database insert failed: " . $e->getMessage(), 'ERROR');
        return false;
    }
    
    // Trigger aggregation if needed
    try {
        aggregateHourlyData($db);
        aggregateDailyData($db);
        aggregateMonthlyData($db);
        aggregateYearlyData($db);
    } catch (Exception $e) {
        logMessage("Aggregation failed: " . $e->getMessage(), 'ERROR');
        // Don't return false - collection succeeded even if aggregation failed
    }
    
    // Clean up old realtime data (keep 7 days)
    try {
        $cutoff = time() - (7 * 24 * 3600);
        $stmt = $db->prepare("DELETE FROM solar_realtime WHERE timestamp < :cutoff");
        $stmt->execute([':cutoff' => $cutoff]);
        $deleted = $stmt->rowCount();
        
        if ($deleted > 0) {
            logMessage("Cleaned up $deleted old realtime records (>7 days)", 'INFO');
        }
    } catch (PDOException $e) {
        logMessage("Cleanup failed: " . $e->getMessage(), 'ERROR');
    }
    
    logMessage("Collection complete", 'INFO');
    return true;
}

/**
 * Aggregate realtime data into hourly buckets
 */
function aggregateHourlyData($db) {
    global $verbose;
    
    // Get last aggregation time
    $stmt = $db->prepare("SELECT value FROM collection_metadata WHERE key = 'last_hourly_aggregation'");
    $stmt->execute();
    $lastAgg = (int)$stmt->fetchColumn();
    
    // Find hours that need aggregation (complete hours only)
    $currentHour = floor(time() / 3600) * 3600;
    $lastHourAggregated = $lastAgg > 0 ? $lastAgg : (time() - 24 * 3600);
    
    // Aggregate each complete hour
    for ($hourStart = $lastHourAggregated; $hourStart < $currentHour; $hourStart += 3600) {
        $hourEnd = $hourStart + 3600;
        
        // Get all realtime samples for this hour
        $stmt = $db->prepare("
            SELECT 
                COUNT(*) as samples,
                AVG(power_current) as power_avg,
                MAX(power_current) as power_max,
                MIN(power_current) as power_min
            FROM solar_realtime
            WHERE timestamp >= :start AND timestamp < :end
        ");
        $stmt->execute([':start' => $hourStart, ':end' => $hourEnd]);
        $stats = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($stats['samples'] == 0) {
            continue; // No data for this hour
        }
        
        // Calculate energy produced during this hour
        // Use first and last energy_today readings to get delta
        $stmt = $db->prepare("
            SELECT energy_today 
            FROM solar_realtime
            WHERE timestamp >= :start AND timestamp < :end
            ORDER BY timestamp ASC
            LIMIT 1
        ");
        $stmt->execute([':start' => $hourStart, ':end' => $hourEnd]);
        $energyStart = (int)$stmt->fetchColumn();
        
        $stmt = $db->prepare("
            SELECT energy_today 
            FROM solar_realtime
            WHERE timestamp >= :start AND timestamp < :end
            ORDER BY timestamp DESC
            LIMIT 1
        ");
        $stmt->execute([':start' => $hourStart, ':end' => $hourEnd]);
        $energyEnd = (int)$stmt->fetchColumn();
        
        $energyProduced = max(0, $energyEnd - $energyStart);
        
        // Insert/update hourly record
        $stmt = $db->prepare("
            INSERT INTO solar_hourly (timestamp, energy_produced, power_avg, power_max, power_min, samples, aggregated_at)
            VALUES (:timestamp, :energy, :avg, :max, :min, :samples, :aggregated)
            ON CONFLICT(timestamp) DO UPDATE SET
                energy_produced = :energy,
                power_avg = :avg,
                power_max = :max,
                power_min = :min,
                samples = :samples,
                aggregated_at = :aggregated
        ");
        
        $stmt->execute([
            ':timestamp' => $hourStart,
            ':energy' => $energyProduced,
            ':avg' => (int)$stats['power_avg'],
            ':max' => (int)$stats['power_max'],
            ':min' => (int)$stats['power_min'],
            ':samples' => (int)$stats['samples'],
            ':aggregated' => time()
        ]);
        
        if ($verbose) {
            logMessage(sprintf("Aggregated hour %s: %dWh, %d samples", date('Y-m-d H:i', $hourStart), $energyProduced, $stats['samples']), 'INFO');
        }
    }
    
    // Update last aggregation timestamp
    if ($currentHour > $lastHourAggregated) {
        $stmt = $db->prepare("
            INSERT OR REPLACE INTO collection_metadata (key, value, updated_at)
            VALUES ('last_hourly_aggregation', :timestamp, :updated)
        ");
        $stmt->execute([':timestamp' => $currentHour, ':updated' => time()]);
    }
}

/**
 * Aggregate hourly data into daily buckets
 */
function aggregateDailyData($db) {
    global $verbose;
    
    // Get yesterday's date (only aggregate complete days)
    $yesterday = strtotime('yesterday midnight');
    $yesterdayDate = date('Y-m-d', $yesterday);
    
    // Check if already aggregated
    $stmt = $db->prepare("SELECT COUNT(*) FROM solar_daily WHERE date = :date");
    $stmt->execute([':date' => $yesterdayDate]);
    if ($stmt->fetchColumn() > 0) {
        return; // Already aggregated
    }
    
    $dayStart = $yesterday;
    $dayEnd = $dayStart + 86400;
    
    // Aggregate from hourly data
    $stmt = $db->prepare("
        SELECT 
            SUM(energy_produced) as energy_total,
            MAX(power_max) as power_peak,
            COUNT(*) as hours_with_data
        FROM solar_hourly
        WHERE timestamp >= :start AND timestamp < :end
    ");
    $stmt->execute([':start' => $dayStart, ':end' => $dayEnd]);
    $stats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($stats['hours_with_data'] == 0) {
        return; // No data for this day
    }
    
    // Find peak power time
    $stmt = $db->prepare("
        SELECT timestamp
        FROM solar_hourly
        WHERE timestamp >= :start AND timestamp < :end
        ORDER BY power_max DESC
        LIMIT 1
    ");
    $stmt->execute([':start' => $dayStart, ':end' => $dayEnd]);
    $peakTime = (int)$stmt->fetchColumn();
    
    // Calculate hours of sunlight (hours with avg power > 10W)
    $stmt = $db->prepare("
        SELECT COUNT(*)
        FROM solar_hourly
        WHERE timestamp >= :start AND timestamp < :end AND power_avg > 10
    ");
    $stmt->execute([':start' => $dayStart, ':end' => $dayEnd]);
    $hoursSunlight = (int)$stmt->fetchColumn();
    
    // Calculate capacity factor (% of rated 3780W over 24h)
    $maxPossible = 3780 * 24; // Wh if running at full capacity for 24h
    $capacityFactor = $maxPossible > 0 ? ($stats['energy_total'] / $maxPossible) * 100 : 0;
    
    // Insert daily record
    $stmt = $db->prepare("
        INSERT INTO solar_daily (date, timestamp, energy_produced, power_peak, power_peak_time, hours_sunlight, capacity_factor, aggregated_at)
        VALUES (:date, :timestamp, :energy, :peak, :peak_time, :hours, :capacity, :aggregated)
    ");
    
    $stmt->execute([
        ':date' => $yesterdayDate,
        ':timestamp' => $dayStart,
        ':energy' => (int)$stats['energy_total'],
        ':peak' => (int)$stats['power_peak'],
        ':peak_time' => $peakTime,
        ':hours' => $hoursSunlight,
        ':capacity' => round($capacityFactor, 2),
        ':aggregated' => time()
    ]);
    
    if ($verbose) {
        logMessage(sprintf("Aggregated day %s: %dWh, peak %dW", $yesterdayDate, $stats['energy_total'], $stats['power_peak']), 'INFO');
    }
}

/**
 * Aggregate daily data into monthly buckets
 */
function aggregateMonthlyData($db) {
    global $verbose;
    
    // Get last complete month
    $lastMonth = strtotime('first day of last month midnight');
    $year = (int)date('Y', $lastMonth);
    $month = (int)date('m', $lastMonth);
    
    // Check if already aggregated
    $stmt = $db->prepare("SELECT COUNT(*) FROM solar_monthly WHERE year = :year AND month = :month");
    $stmt->execute([':year' => $year, ':month' => $month]);
    if ($stmt->fetchColumn() > 0) {
        return; // Already aggregated
    }
    
    $monthStart = $lastMonth;
    $monthEnd = strtotime('first day of this month midnight');
    
    // Aggregate from daily data
    $stmt = $db->prepare("
        SELECT 
            SUM(energy_produced) as energy_total,
            MAX(power_peak) as power_peak,
            COUNT(*) as days_with_data,
            AVG(energy_produced) as avg_daily
        FROM solar_daily
        WHERE timestamp >= :start AND timestamp < :end
    ");
    $stmt->execute([':start' => $monthStart, ':end' => $monthEnd]);
    $stats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($stats['days_with_data'] == 0) {
        return; // No data for this month
    }
    
    // Calculate capacity factor for the month
    $daysInMonth = date('t', $lastMonth);
    $maxPossible = 3780 * 24 * $daysInMonth;
    $capacityFactor = $maxPossible > 0 ? ($stats['energy_total'] / $maxPossible) * 100 : 0;
    
    // Insert monthly record
    $stmt = $db->prepare("
        INSERT INTO solar_monthly (year, month, timestamp, energy_produced, power_peak, days_with_data, avg_daily_production, capacity_factor, aggregated_at)
        VALUES (:year, :month, :timestamp, :energy, :peak, :days, :avg_daily, :capacity, :aggregated)
    ");
    
    $stmt->execute([
        ':year' => $year,
        ':month' => $month,
        ':timestamp' => $monthStart,
        ':energy' => (int)$stats['energy_total'],
        ':peak' => (int)$stats['power_peak'],
        ':days' => (int)$stats['days_with_data'],
        ':avg_daily' => (int)$stats['avg_daily'],
        ':capacity' => round($capacityFactor, 2),
        ':aggregated' => time()
    ]);
    
    if ($verbose) {
        logMessage(sprintf("Aggregated month %04d-%02d: %dWh", $year, $month, $stats['energy_total']), 'INFO');
    }
}

/**
 * Aggregate monthly data into yearly buckets
 */
function aggregateYearlyData($db) {
    global $verbose;
    
    // Get last complete year
    $lastYear = (int)date('Y') - 1;
    
    // Check if already aggregated
    $stmt = $db->prepare("SELECT COUNT(*) FROM solar_yearly WHERE year = :year");
    $stmt->execute([':year' => $lastYear]);
    if ($stmt->fetchColumn() > 0) {
        return; // Already aggregated
    }
    
    $yearStart = strtotime("$lastYear-01-01 00:00:00");
    $yearEnd = strtotime(($lastYear + 1) . "-01-01 00:00:00");
    
    // Aggregate from monthly data
    $stmt = $db->prepare("
        SELECT 
            SUM(energy_produced) as energy_total,
            MAX(power_peak) as power_peak,
            COUNT(*) as months_with_data,
            AVG(energy_produced) as avg_monthly
        FROM solar_monthly
        WHERE year = :year
    ");
    $stmt->execute([':year' => $lastYear]);
    $stats = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($stats['months_with_data'] == 0) {
        return; // No data for this year
    }
    
    // Calculate capacity factor for the year
    $daysInYear = date('L', $yearStart) ? 366 : 365;
    $maxPossible = 3780 * 24 * $daysInYear;
    $capacityFactor = $maxPossible > 0 ? ($stats['energy_total'] / $maxPossible) * 100 : 0;
    
    // Insert yearly record
    $stmt = $db->prepare("
        INSERT INTO solar_yearly (year, timestamp, energy_produced, power_peak, months_with_data, avg_monthly_production, capacity_factor, aggregated_at)
        VALUES (:year, :timestamp, :energy, :peak, :months, :avg_monthly, :capacity, :aggregated)
    ");
    
    $stmt->execute([
        ':year' => $lastYear,
        ':timestamp' => $yearStart,
        ':energy' => (int)$stats['energy_total'],
        ':peak' => (int)$stats['power_peak'],
        ':months' => (int)$stats['months_with_data'],
        ':avg_monthly' => (int)$stats['avg_monthly'],
        ':capacity' => round($capacityFactor, 2),
        ':aggregated' => time()
    ]);
    
    if ($verbose) {
        logMessage(sprintf("Aggregated year %04d: %dWh", $lastYear, $stats['energy_total']), 'INFO');
    }
}

// Run collection
$success = collectData();
exit($success ? 0 : 1);

?>