<?php
/**
 * Solar Data API Endpoint
 *
 * Serves solar production data from the local SQLite database to the dashboard,
 * the solar page and the header widget. Read-only.
 *
 * Selects the most recent N records per period rather than filtering by a time
 * range, so backfilled history is served correctly.
 *
 * Both constants below are guarded so the test harness can point this file at a
 * temporary database and a known capacity. In normal use nothing defines them
 * first and the production values apply.
 */

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json');
    header('Cache-Control: no-cache, must-revalidate');
}

if (!defined('SOLAR_DB_PATH')) {
    define('SOLAR_DB_PATH', '/p1mon/www/custom/data/solar.db');
}

if (!defined('SYSTEM_CAPACITY_W')) {
    define('SYSTEM_CAPACITY_W', 3780); // 14 x 270Wp panels
}

/**
 * Record or read why the database could not be used.
 *
 * Kept separate from getSolarDB() so that every caller keeps its existing
 * PDO-or-null contract while the reason survives to the response.
 *
 * @param string|null $set Message to record, or null to read the current one
 * @return string|null
 */
function solarError($set = null) {
    static $error = null;

    if ($set !== null) {
        $error = $set;
    }

    return $error;
}

/**
 * Translate a PDO failure into something a reader can act on, without
 * echoing SQL or filesystem detail back to the browser.
 */
function describeQueryFailure(PDOException $e) {
    if (strpos($e->getMessage(), 'no such table') !== false) {
        return 'Database schema is missing or incomplete';
    }

    return 'Query failed';
}

/**
 * Connect to solar database
 */
function getSolarDB() {
    // file_exists() returns false both when the file is absent and when the
    // web server user cannot traverse the directory, so the two cannot be
    // distinguished from here. Say so rather than asserting it is missing.
    if (!file_exists(SOLAR_DB_PATH)) {
        solarError('Database not found, or not readable by the web server');
        return null;
    }

    if (!is_readable(SOLAR_DB_PATH)) {
        solarError('Database exists but is not readable by the web server');
        return null;
    }

    try {
        $db = new PDO('sqlite:' . SOLAR_DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $db;
    } catch (PDOException $e) {
        error_log("Solar DB connection failed: " . $e->getMessage());
        solarError('Database could not be opened');
        return null;
    }
}

/**
 * Get current/realtime solar data
 */
function getCurrentData() {
    $db = getSolarDB();
    if (!$db) {
        return ['error' => solarError()];
    }
    
    try {
        // Get latest realtime record
        $stmt = $db->query("
            SELECT * FROM solar_realtime 
            ORDER BY timestamp DESC 
            LIMIT 1
        ");
        $latest = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$latest) {
            return [
                'power' => 0,
                'energy' => 0,
                'energyToday' => 0,
                'energyMonth' => 0,
                'status' => 'offline'
            ];
        }
        
        return [
            'power' => (int)$latest['power_current'],
            'energy' => round($latest['energy_total'] / 1000, 2), // Wh to kWh
            'energyToday' => round($latest['energy_today'] / 1000, 2),
            'energyMonth' => round($latest['energy_month'] / 1000, 2),
            'status' => $latest['inverter_status'] == 1 ? 'normal' : 'offline',
            'timestamp' => date('Y-m-d H:i:s', $latest['timestamp'])
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting current data: " . $e->getMessage());
        return ['error' => describeQueryFailure($e)];
    }
}

/**
 * Get hourly solar data - FIXED to get most recent N hours
 */
function getHourlyData($zoom, $offset = 0) {
    $db = getSolarDB();
    if (!$db) {
        return ['chartData' => [], 'stats' => getEmptyStats()];
    }
    
    try {
        // Get most recent N hourly records (reversed chronologically)
        $stmt = $db->prepare("
            SELECT 
                timestamp,
                energy_produced,
                power_avg,
                power_max,
                power_min,
                samples
            FROM solar_hourly 
            ORDER BY timestamp DESC 
            LIMIT :limit OFFSET :offset
        ");
        
        $stmt->bindValue(':limit', (int)$zoom, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Reverse to get chronological order (oldest first)
        $rows = array_reverse($rows);
        
        $chartData = [];
        $totalEnergy = 0;
        $totalPower = 0;
        $count = 0;
        $peakPower = 0;
        $peakTime = null;
        
        foreach ($rows as $row) {
            $timestamp = (int)$row['timestamp'];
            $energyWh = (float)$row['energy_produced'];
            $energyKWh = round($energyWh / 1000, 3); // Wh to kWh
            $powerAvg = (int)$row['power_avg'];
            $powerMax = (int)$row['power_max'];
            
            $chartData[] = [
                'timestamp' => date('Y-m-d H:i:s', $timestamp),
                'unixTimestamp' => $timestamp,
                'production' => $energyKWh,
                'power' => $powerAvg,
                'powerMax' => $powerMax
            ];
            
            $totalEnergy += $energyKWh;
            $totalPower += $powerAvg;
            $count++;
            
            if ($powerMax > $peakPower) {
                $peakPower = $powerMax;
                $peakTime = date('Y-m-d H:i:s', $timestamp);
            }
        }
        
        // Calculate capacity factor
        $theoreticalMaxKWh = (SYSTEM_CAPACITY_W / 1000) * $zoom;
        $capacityFactor = $theoreticalMaxKWh > 0 ? round(($totalEnergy / $theoreticalMaxKWh) * 100, 2) : 0;
        
        return [
            'chartData' => $chartData,
            'stats' => [
                'totalEnergy' => round($totalEnergy, 2),
                'avgPower' => $count > 0 ? round($totalPower / $count, 0) : 0,
                'peakPower' => [
                    'value' => $peakPower,
                    'time' => $peakTime
                ],
                'capacityFactor' => $capacityFactor
            ]
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting hourly data: " . $e->getMessage());
        solarError(describeQueryFailure($e));
        return ['chartData' => [], 'stats' => getEmptyStats()];
    }
}

/**
 * Get daily solar data - FIXED to get most recent N days
 */
function getDailyData($zoom, $offset = 0) {
    $db = getSolarDB();
    if (!$db) {
        return ['chartData' => [], 'stats' => getEmptyStats()];
    }
    
    try {
        // Get most recent N daily records
        $stmt = $db->prepare("
            SELECT 
                date,
                timestamp,
                energy_produced,
                power_peak,
                power_peak_time,
                hours_sunlight,
                capacity_factor
            FROM solar_daily 
            ORDER BY date DESC 
            LIMIT :limit OFFSET :offset
        ");
        
        $stmt->bindValue(':limit', (int)$zoom, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Reverse to chronological order
        $rows = array_reverse($rows);
        
        $chartData = [];
        $totalEnergy = 0;
        $peakPower = 0;
        $peakTime = null;
        $totalCapacityFactor = 0;
        $count = 0;
        
        foreach ($rows as $row) {
            $timestamp = (int)$row['timestamp'];
            $energyWh = (float)$row['energy_produced'];
            $energyKWh = round($energyWh / 1000, 3);
            $powerPeak = (int)$row['power_peak'];
            
            $chartData[] = [
                'timestamp' => $row['date'],
                'unixTimestamp' => $timestamp,
                'production' => $energyKWh,
                'power' => $powerPeak, // For daily, use peak as "power"
                'powerMax' => $powerPeak,
                'sunlightHours' => round((float)$row['hours_sunlight'], 1),
                'capacityFactor' => round((float)$row['capacity_factor'], 2)
            ];
            
            $totalEnergy += $energyKWh;
            $totalCapacityFactor += (float)$row['capacity_factor'];
            $count++;
            
            if ($powerPeak > $peakPower) {
                $peakPower = $powerPeak;
                $peakTime = $row['date'];
            }
        }
        
        return [
            'chartData' => $chartData,
            'stats' => [
                'totalEnergy' => round($totalEnergy, 2),
                'avgDaily' => $count > 0 ? round($totalEnergy / $count, 2) : 0,
                'peakPower' => [
                    'value' => $peakPower,
                    'time' => $peakTime
                ],
                'capacityFactor' => $count > 0 ? round($totalCapacityFactor / $count, 2) : 0
            ]
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting daily data: " . $e->getMessage());
        solarError(describeQueryFailure($e));
        return ['chartData' => [], 'stats' => getEmptyStats()];
    }
}

/**
 * Get monthly solar data - FIXED
 */
function getMonthlyData($zoom, $offset = 0) {
    $db = getSolarDB();
    if (!$db) {
        return ['chartData' => [], 'stats' => getEmptyStats()];
    }
    
    try {
        $stmt = $db->prepare("
            SELECT 
                year,
                month,
                timestamp,
                energy_produced,
                power_peak,
                days_with_data,
                avg_daily_production,
                capacity_factor
            FROM solar_monthly 
            ORDER BY year DESC, month DESC 
            LIMIT :limit OFFSET :offset
        ");
        
        $stmt->bindValue(':limit', (int)$zoom, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Reverse to chronological order
        $rows = array_reverse($rows);
        
        $chartData = [];
        $totalEnergy = 0;
        $peakPower = 0;
        $count = 0;
        
        foreach ($rows as $row) {
            $timestamp = (int)$row['timestamp'];
            $energyWh = (float)$row['energy_produced'];
            $energyKWh = round($energyWh / 1000, 2);
            $powerPeak = (int)$row['power_peak'];
            
            $monthStr = sprintf('%04d-%02d', $row['year'], $row['month']);
            
            $chartData[] = [
                'timestamp' => $monthStr,
                'unixTimestamp' => $timestamp,
                'production' => $energyKWh,
                'power' => $powerPeak,
                'powerMax' => $powerPeak,
                'avgDaily' => round((float)$row['avg_daily_production'] / 1000, 2),
                'daysWithData' => (int)$row['days_with_data']
            ];
            
            $totalEnergy += $energyKWh;
            
            if ($powerPeak > $peakPower) {
                $peakPower = $powerPeak;
            }
            
            $count++;
        }
        
        return [
            'chartData' => $chartData,
            'stats' => [
                'totalEnergy' => round($totalEnergy, 2),
                'avgMonthly' => $count > 0 ? round($totalEnergy / $count, 2) : 0,
                'peakPower' => [
                    'value' => $peakPower,
                    'time' => null
                ]
            ]
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting monthly data: " . $e->getMessage());
        solarError(describeQueryFailure($e));
        return ['chartData' => [], 'stats' => getEmptyStats()];
    }
}

/**
 * Get yearly solar data - FIXED
 */
function getYearlyData($zoom, $offset = 0) {
    $db = getSolarDB();
    if (!$db) {
        return ['chartData' => [], 'stats' => getEmptyStats()];
    }
    
    try {
        $stmt = $db->prepare("
            SELECT 
                year,
                timestamp,
                energy_produced,
                power_peak,
                months_with_data,
                avg_monthly_production
            FROM solar_yearly 
            ORDER BY year DESC 
            LIMIT :limit OFFSET :offset
        ");
        
        $stmt->bindValue(':limit', (int)$zoom, PDO::PARAM_INT);
        $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Reverse to chronological order
        $rows = array_reverse($rows);
        
        $chartData = [];
        $totalEnergy = 0;
        $peakPower = 0;
        $count = 0;
        
        foreach ($rows as $row) {
            $timestamp = (int)$row['timestamp'];
            $energyWh = (float)$row['energy_produced'];
            $energyKWh = round($energyWh / 1000, 1);
            $powerPeak = (int)$row['power_peak'];
            
            $chartData[] = [
                'timestamp' => (string)$row['year'],
                'unixTimestamp' => $timestamp,
                'production' => $energyKWh,
                'power' => $powerPeak,
                'powerMax' => $powerPeak,
                'avgMonthly' => round((float)$row['avg_monthly_production'] / 1000, 2),
                'monthsWithData' => (int)$row['months_with_data']
            ];
            
            $totalEnergy += $energyKWh;
            
            if ($powerPeak > $peakPower) {
                $peakPower = $powerPeak;
            }
            
            $count++;
        }
        
        return [
            'chartData' => $chartData,
            'stats' => [
                'totalEnergy' => round($totalEnergy, 1),
                'avgYearly' => $count > 0 ? round($totalEnergy / $count, 1) : 0,
                'peakPower' => [
                    'value' => $peakPower,
                    'time' => null
                ]
            ]
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting yearly data: " . $e->getMessage());
        solarError(describeQueryFailure($e));
        return ['chartData' => [], 'stats' => getEmptyStats()];
    }
}

/**
 * Helper: Empty stats object
 */
function getEmptyStats() {
    return [
        'totalEnergy' => 0,
        'avgPower' => 0,
        'peakPower' => ['value' => 0, 'time' => null],
        'capacityFactor' => 0
    ];
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

$action = $_GET['action'] ?? '';
$period = $_GET['period'] ?? '';
$zoom = isset($_GET['zoom']) ? (int)$_GET['zoom'] : 24;

// Validate zoom ranges
if ($zoom < 1) $zoom = 24;
if ($period === 'hours' && $zoom > 168) $zoom = 168;
if ($period === 'days' && $zoom > 365) $zoom = 365;
if ($period === 'months' && $zoom > 24) $zoom = 24;
if ($period === 'years' && $zoom > 10) $zoom = 10;

// Number of newest buckets to skip, for paging back through history.
// Clamped so a stray value cannot turn into an expensive scan.
$offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
if ($offset < 0) $offset = 0;
if ($offset > 100000) $offset = 100000;

try {
    if ($action === 'current') {
        // Current/realtime data
        $response = getCurrentData();
    } elseif ($period) {
        // Historical data
        switch ($period) {
            case 'hours':
                $result = getHourlyData($zoom, $offset);
                break;
            case 'days':
                $result = getDailyData($zoom, $offset);
                break;
            case 'months':
                $result = getMonthlyData($zoom, $offset);
                break;
            case 'years':
                $result = getYearlyData($zoom, $offset);
                break;
            default:
                $result = ['error' => 'Invalid period'];
        }
        
        $response = [
            'period' => $period,
            'zoom' => $zoom,
            'offset' => $offset,
            'chartData' => $result['chartData'] ?? [],
            'stats' => $result['stats'] ?? getEmptyStats()
        ];

        // Additive: clients that ignore this key still see the empty data they
        // saw before, but an unavailable database is no longer silent.
        if (solarError() !== null) {
            $response['error'] = solarError();
        }
    } else {
        $response = ['error' => 'Missing required parameters'];
    }
    
    echo json_encode($response, JSON_NUMERIC_CHECK);
    
} catch (Exception $e) {
    error_log("Solar API error: " . $e->getMessage());
    echo json_encode(['error' => 'Internal server error']);
}