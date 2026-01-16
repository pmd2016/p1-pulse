<?php
/**
 * Solar Data API Endpoint
 * Provides solar panel production data for custom P1 Monitor dashboard
 * Matches electricity.php API structure for frontend compatibility
 */

// Set JSON response headers
header('Content-Type: application/json');
header('Cache-Control: no-cache, must-revalidate');

// Database path
define('SOLAR_DB_PATH', '/p1mon/www/custom/data/solar.db');

/**
 * Connect to solar database
 */
function getSolarDB() {
    if (!file_exists(SOLAR_DB_PATH)) {
        return null;
    }
    
    try {
        $db = new SQLite3(SOLAR_DB_PATH, SQLITE3_OPEN_READONLY);
        return $db;
    } catch (Exception $e) {
        error_log("Solar DB connection failed: " . $e->getMessage());
        return null;
    }
}

/**
 * Get current/realtime solar data
 */
function getCurrentData() {
    $db = getSolarDB();
    if (!$db) {
        return ['error' => 'Database not available'];
    }
    
    // Get most recent realtime reading
    $query = "SELECT * FROM solar_realtime ORDER BY timestamp DESC LIMIT 1";
    $result = $db->query($query);
    
    if (!$result) {
        $db->close();
        return ['error' => 'Query failed'];
    }
    
    $current = $result->fetchArray(SQLITE3_ASSOC);
    $result->finalize();
    
    // Get today's totals from daily table
    $today = date('Y-m-d');
    $query = "SELECT * FROM solar_daily WHERE date = '$today'";
    $result = $db->query($query);
    $todayData = $result->fetchArray(SQLITE3_ASSOC);
    $result->finalize();
    
    // Get this month's total
    $thisMonth = date('Y-m');
    $query = "SELECT * FROM solar_monthly WHERE month = '$thisMonth'";
    $result = $db->query($query);
    $monthData = $result->fetchArray(SQLITE3_ASSOC);
    $result->finalize();
    
    $db->close();
    
    return [
        'current' => [
            'power' => $current ? floatval($current['power_current']) : 0,
            'timestamp' => $current ? $current['timestamp'] : time()
        ],
        'today' => [
            'energy' => $todayData ? floatval($todayData['energy_produced']) : 0,
            'peak_power' => $todayData ? floatval($todayData['power_max']) : 0,
            'peak_time' => $todayData ? $todayData['peak_time'] : null,
            'sunlight_hours' => $todayData ? floatval($todayData['hours_sunlight']) : 0,
            'capacity_factor' => $todayData ? floatval($todayData['capacity_factor']) : 0
        ],
        'month' => [
            'energy' => $monthData ? floatval($monthData['energy_produced']) : 0,
            'avg_daily' => $monthData ? floatval($monthData['avg_daily_production']) : 0,
            'days_with_data' => $monthData ? intval($monthData['days_with_data']) : 0
        ],
        'system' => [
            'capacity' => 3780, // 14 × 270Wp
            'inverter' => 'Zeversolar 3000TL',
            'panels' => 14
        ]
    ];
}

/**
 * Get historical solar data for charting
 */
function getHistoricalData($period, $zoom) {
    $db = getSolarDB();
    if (!$db) {
        return ['error' => 'Database not available'];
    }
    
    $chartData = [];
    $stats = [
        'totalEnergy' => 0,
        'avgPower' => 0,
        'peakPower' => ['value' => 0, 'time' => null],
        'capacityFactor' => 0
    ];
    
    // Determine table and query based on period
    switch ($period) {
        case 'hours':
            $chartData = getHourlyData($db, $zoom, $stats);
            break;
        case 'days':
            $chartData = getDailyData($db, $zoom, $stats);
            break;
        case 'months':
            $chartData = getMonthlyData($db, $zoom, $stats);
            break;
        case 'years':
            $chartData = getYearlyData($db, $zoom, $stats);
            break;
        default:
            $db->close();
            return ['error' => 'Invalid period'];
    }
    
    $db->close();
    
    return [
        'period' => $period,
        'zoom' => $zoom,
        'chartData' => $chartData,
        'stats' => $stats
    ];
}

/**
 * Get hourly solar data
 */
function getHourlyData($db, $hours, &$stats) {
    $data = [];
    
    // Calculate start timestamp
    $endTime = time();
    $startTime = $endTime - ($hours * 3600);
    
    $query = "SELECT 
                hour,
                timestamp,
                energy_produced,
                power_avg,
                power_max,
                capacity_factor
              FROM solar_hourly 
              WHERE timestamp >= $startTime 
              ORDER BY timestamp ASC";
    
    $result = $db->query($query);
    if (!$result) return $data;
    
    $totalEnergy = 0;
    $powerSum = 0;
    $count = 0;
    $peakPower = 0;
    $peakTime = null;
    
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $energy = floatval($row['energy_produced']);
        $powerAvg = floatval($row['power_avg']);
        $powerMax = floatval($row['power_max']);
        
        $data[] = [
            'timestamp' => date('Y-m-d H:i:s', $row['timestamp']),
            'unixTimestamp' => intval($row['timestamp']),
            'production' => round($energy / 1000, 3), // Convert Wh to kWh
            'power' => round($powerAvg, 0), // Keep in W
            'powerMax' => round($powerMax, 0)
        ];
        
        $totalEnergy += $energy;
        $powerSum += $powerAvg;
        $count++;
        
        if ($powerMax > $peakPower) {
            $peakPower = $powerMax;
            $peakTime = date('Y-m-d H:i:s', $row['timestamp']);
        }
    }
    
    $result->finalize();
    
    $stats['totalEnergy'] = round($totalEnergy / 1000, 2); // kWh
    $stats['avgPower'] = $count > 0 ? round($powerSum / $count, 0) : 0; // W
    $stats['peakPower'] = [
        'value' => round($peakPower, 0),
        'time' => $peakTime
    ];
    
    return $data;
}

/**
 * Get daily solar data
 */
function getDailyData($db, $days, &$stats) {
    $data = [];
    
    // Calculate start date
    $endDate = date('Y-m-d');
    $startDate = date('Y-m-d', strtotime("-$days days"));
    
    $query = "SELECT 
                date,
                timestamp,
                energy_produced,
                power_max,
                peak_time,
                hours_sunlight,
                capacity_factor
              FROM solar_daily 
              WHERE date >= '$startDate' 
              ORDER BY date ASC";
    
    $result = $db->query($query);
    if (!$result) return $data;
    
    $totalEnergy = 0;
    $peakPower = 0;
    $peakTime = null;
    $totalCapacityFactor = 0;
    $count = 0;
    
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $energy = floatval($row['energy_produced']);
        $powerMax = floatval($row['power_max']);
        
        $data[] = [
            'timestamp' => $row['date'],
            'unixTimestamp' => intval($row['timestamp']),
            'production' => round($energy / 1000, 3), // Convert Wh to kWh
            'powerMax' => round($powerMax, 0),
            'sunlightHours' => round(floatval($row['hours_sunlight']), 1),
            'capacityFactor' => round(floatval($row['capacity_factor']), 1)
        ];
        
        $totalEnergy += $energy;
        $totalCapacityFactor += floatval($row['capacity_factor']);
        $count++;
        
        if ($powerMax > $peakPower) {
            $peakPower = $powerMax;
            $peakTime = $row['date'] . ' ' . $row['peak_time'];
        }
    }
    
    $result->finalize();
    
    $stats['totalEnergy'] = round($totalEnergy / 1000, 2); // kWh
    $stats['avgDaily'] = $count > 0 ? round($totalEnergy / 1000 / $count, 2) : 0; // kWh
    $stats['peakPower'] = [
        'value' => round($peakPower, 0),
        'time' => $peakTime
    ];
    $stats['capacityFactor'] = $count > 0 ? round($totalCapacityFactor / $count, 1) : 0;
    
    return $data;
}

/**
 * Get monthly solar data
 */
function getMonthlyData($db, $months, &$stats) {
    $data = [];
    
    // Calculate start month
    $endDate = new DateTime();
    $startDate = clone $endDate;
    $startDate->modify("-$months months");
    $startMonth = $startDate->format('Y-m');
    
    $query = "SELECT 
                month,
                timestamp,
                energy_produced,
                power_max,
                avg_daily_production,
                days_with_data
              FROM solar_monthly 
              WHERE month >= '$startMonth' 
              ORDER BY month ASC";
    
    $result = $db->query($query);
    if (!$result) return $data;
    
    $totalEnergy = 0;
    $peakPower = 0;
    $count = 0;
    
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $energy = floatval($row['energy_produced']);
        $powerMax = floatval($row['power_max']);
        
        $data[] = [
            'timestamp' => $row['month'],
            'unixTimestamp' => intval($row['timestamp']),
            'production' => round($energy / 1000, 2), // Convert Wh to kWh
            'powerMax' => round($powerMax, 0),
            'avgDaily' => round(floatval($row['avg_daily_production']) / 1000, 2), // kWh
            'daysWithData' => intval($row['days_with_data'])
        ];
        
        $totalEnergy += $energy;
        $count++;
        
        if ($powerMax > $peakPower) {
            $peakPower = $powerMax;
        }
    }
    
    $result->finalize();
    
    $stats['totalEnergy'] = round($totalEnergy / 1000, 2); // kWh
    $stats['avgMonthly'] = $count > 0 ? round($totalEnergy / 1000 / $count, 2) : 0; // kWh
    $stats['peakPower'] = [
        'value' => round($peakPower, 0),
        'time' => null
    ];
    
    return $data;
}

/**
 * Get yearly solar data
 */
function getYearlyData($db, $years, &$stats) {
    $data = [];
    
    // Calculate start year
    $endYear = date('Y');
    $startYear = $endYear - $years + 1;
    
    $query = "SELECT 
                year,
                timestamp,
                energy_produced,
                power_max,
                avg_monthly_production,
                months_with_data
              FROM solar_yearly 
              WHERE year >= $startYear 
              ORDER BY year ASC";
    
    $result = $db->query($query);
    if (!$result) return $data;
    
    $totalEnergy = 0;
    $peakPower = 0;
    $count = 0;
    
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $energy = floatval($row['energy_produced']);
        $powerMax = floatval($row['power_max']);
        
        $data[] = [
            'timestamp' => $row['year'],
            'unixTimestamp' => intval($row['timestamp']),
            'production' => round($energy / 1000, 2), // Convert Wh to kWh
            'powerMax' => round($powerMax, 0),
            'avgMonthly' => round(floatval($row['avg_monthly_production']) / 1000, 2), // kWh
            'monthsWithData' => intval($row['months_with_data'])
        ];
        
        $totalEnergy += $energy;
        $count++;
        
        if ($powerMax > $peakPower) {
            $peakPower = $powerMax;
        }
    }
    
    $result->finalize();
    
    $stats['totalEnergy'] = round($totalEnergy / 1000, 2); // kWh
    $stats['avgYearly'] = $count > 0 ? round($totalEnergy / 1000 / $count, 2) : 0; // kWh
    $stats['peakPower'] = [
        'value' => round($peakPower, 0),
        'time' => null
    ];
    
    return $data;
}

// ============================================================================
// Main Request Handler
// ============================================================================

try {
    // Get request parameters
    $action = isset($_GET['action']) ? $_GET['action'] : 'history';
    $period = isset($_GET['period']) ? $_GET['period'] : 'hours';
    $zoom = isset($_GET['zoom']) ? intval($_GET['zoom']) : 24;
    
    // Validate period
    $validPeriods = ['hours', 'days', 'months', 'years'];
    if (!in_array($period, $validPeriods)) {
        $period = 'hours';
    }
    
    // Handle different actions
    if ($action === 'current') {
        $response = getCurrentData();
    } else {
        $response = getHistoricalData($period, $zoom);
    }
    
    // Return JSON response
    echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    
} catch (Exception $e) {
    // Error response
    http_response_code(500);
    echo json_encode([
        'error' => 'Internal server error',
        'message' => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
?>