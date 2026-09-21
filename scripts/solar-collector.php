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

// Configuration. Guarded so the test harness can point this file at a
// temporary database and a local lib directory; nothing defines them in
// normal use, so production behaviour is unchanged.
if (!defined('BASE_DIR')) {
    define('BASE_DIR', '/p1mon/www/custom');
}
if (!defined('DB_PATH')) {
    define('DB_PATH', BASE_DIR . '/data/solar.db');
}
if (!defined('LIB_DIR')) {
    define('LIB_DIR', BASE_DIR . '/lib');
}

// Parse command line arguments
$options = getopt('', ['force', 'verbose']);
$force = isset($options['force']);
$verbose = isset($options['verbose']);

// Include dependencies
require_once LIB_DIR . '/SolarConfig.php';
require_once LIB_DIR . '/SolplanetAPI.php';
require_once LIB_DIR . '/SolarUnits.php';

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
 * Read one measurement from a plant overview response and convert it to the
 * base unit the database stores (W for power, Wh for energy).
 *
 * @param array  $data  The response's data object
 * @param string $field Field name, e.g. 'Power' or 'E-Today'
 * @param string $kind  'power' or 'energy'
 * @return int|null Converted value, or null if it could not be read
 */
function extractMeasurement(array $data, $field, $kind) {
    if (!isset($data[$field]['value'])) {
        logMessage("API response has no $field value", 'ERROR');
        return null;
    }

    if (!isset($data[$field]['unit'])) {
        logMessage("API response gives $field without a unit; refusing to guess", 'ERROR');
        return null;
    }

    $value = $data[$field]['value'];
    $unit  = $data[$field]['unit'];

    $converted = $kind === 'power'
        ? SolarUnits::toWatts($value, $unit)
        : SolarUnits::toWattHours($value, $unit);

    if ($converted === null) {
        $known = $kind === 'power'
            ? SolarUnits::knownPowerUnits()
            : SolarUnits::knownEnergyUnits();

        logMessage(sprintf(
            "Cannot convert %s: value '%s' in unit '%s'. Known %s units: %s",
            $field,
            is_scalar($value) ? $value : gettype($value),
            is_scalar($unit) ? $unit : gettype($unit),
            $kind,
            implode(', ', $known)
        ), 'ERROR');

        return null;
    }

    return $converted;
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
    
    // Connect to database.
    //
    // The file_exists check is load-bearing: PDO creates an empty SQLite file
    // on connect. Without it, a run against a missing database silently
    // manufactures a schemaless one, which then satisfies every other
    // component's existence check while failing every query. Fail loudly here
    // instead, and say what to do about it.
    if (!file_exists(DB_PATH)) {
        logMessage("Database not found at " . DB_PATH, 'ERROR');
        logMessage("Refusing to create an empty one. Run: php " . __DIR__ . "/init-solar-database.php", 'ERROR');
        return false;
    }

    try {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        logMessage("Database connected: " . DB_PATH, 'INFO');
    } catch (PDOException $e) {
        logMessage("Database connection failed: " . $e->getMessage(), 'ERROR');
        return false;
    }

    // An existing file is not necessarily an initialised one.
    try {
        $db->query('SELECT 1 FROM collection_metadata LIMIT 1');
    } catch (PDOException $e) {
        logMessage("Database at " . DB_PATH . " has no schema: " . $e->getMessage(), 'ERROR');
        logMessage("Run: php " . __DIR__ . "/init-solar-database.php (safe on an existing file)", 'ERROR');
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
        
        // Convert from whatever unit the API declares, rather than assuming one
        // per field. The units genuinely differ between fields -- Power is KW,
        // E-Today and E-Month are KWh, E-Total is MWh -- and a hardcoded
        // multiplier that guesses wrong is a silent 1000x error.
        $powerCurrent = extractMeasurement($data, 'Power', 'power');
        $energyToday  = extractMeasurement($data, 'E-Today', 'energy');
        $energyMonth  = extractMeasurement($data, 'E-Month', 'energy');
        $energyTotal  = extractMeasurement($data, 'E-Total', 'energy');

        // Refuse to store a partial reading. A gap is recoverable by backfill;
        // a wrong value quietly corrupts every aggregate derived from it, which
        // is how this went unnoticed for months.
        if ($powerCurrent === null || $energyToday === null
            || $energyMonth === null || $energyTotal === null) {
            logMessage("Aborting: could not convert every measurement in the response", 'ERROR');
            return false;
        }
        
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
        
        // Get all realtime samples for this hour.
        //
        // inverter_status = 1 filters out readings taken while the inverter was
        // offline. The API reports those as zeros across every field, including
        // energy_today, so they are absence of data wearing the costume of a
        // measurement. Including them wrecks the delta below: a zero at the
        // start of an hour followed by a real reading records the entire day's
        // production into that single hour, and a real reading followed by a
        // zero yields max(0, negative) and loses the hour altogether.
        $stmt = $db->prepare("
            SELECT 
                COUNT(*) as samples,
                AVG(power_current) as power_avg,
                MAX(power_current) as power_max,
                MIN(power_current) as power_min
            FROM solar_realtime
            WHERE timestamp >= :start AND timestamp < :end
              AND inverter_status = 1
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
              AND inverter_status = 1
            ORDER BY timestamp ASC
            LIMIT 1
        ");
        $stmt->execute([':start' => $hourStart, ':end' => $hourEnd]);
        $energyStart = (int)$stmt->fetchColumn();
        
        $stmt = $db->prepare("
            SELECT energy_today 
            FROM solar_realtime
            WHERE timestamp >= :start AND timestamp < :end
              AND inverter_status = 1
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

// Run collection, unless this file was included to reach its functions.
if (!defined('SOLAR_COLLECTOR_NO_RUN')) {
    $success = collectData();
    exit($success ? 0 : 1);
}

?>