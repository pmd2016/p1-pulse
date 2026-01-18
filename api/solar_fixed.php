<?php
/**
 * Solar API Endpoint
 * Provides solar production data for the dashboard
 * 
 * Schema-corrected version matching actual database structure
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Database path
$dbPath = '/p1mon/www/custom/data/solar.db';

// System configuration
$SYSTEM_CAPACITY_W = 3780; // 14 × 270Wp panels

/**
 * Get database connection
 */
function getSolarDB() {
    global $dbPath;
    
    if (!file_exists($dbPath)) {
        error_log("Solar database not found: $dbPath");
        return null;
    }
    
    try {
        $db = new PDO('sqlite:' . $dbPath);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $db;
    } catch (PDOException $e) {
        error_log("Solar DB connection error: " . $e->getMessage());
        return null;
    }
}

/**
 * Get current/realtime solar data
 */
function getCurrentData($db) {
    try {
        $stmt = $db->query("
            SELECT 
                timestamp,
                power_current,
                energy_today,
                energy_total,
                inverter_status
            FROM solar_realtime 
            ORDER BY timestamp DESC 
            LIMIT 1
        ");
        
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            return [
                'timestamp' => date('Y-m-d H:i:s'),
                'unixTimestamp' => time(),
                'power' => 0,
                'energy' => 0,
                'energyToday' => 0,
                'inverterStatus' => 0
            ];
        }
        
        return [
            'timestamp' => date('Y-m-d H:i:s', $row['timestamp']),
            'unixTimestamp' => (int)$row['timestamp'],
            'power' => (int)$row['power_current'],
            'energy' => round($row['energy_total'] / 1000, 3), // Wh to kWh
            'energyToday' => round($row['energy_today'] / 1000, 3), // Wh to kWh
            'inverterStatus' => (int)$row['inverter_status']
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting current data: " . $e->getMessage());
        return null;
    }
}

/**
 * Get historical data for hours period
 */
function getHoursData($db, $zoom) {
    global $SYSTEM_CAPACITY_W;
    
    try {
        // Get data from solar_hourly table
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
            LIMIT :limit
        ");
        
        $stmt->bindValue(':limit', (int)$zoom, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Reverse to get chronological order
        $rows = array_reverse($rows);
        
        $chartData = [];
        $totalEnergy = 0;
        $totalPower = 0;
        $count = 0;
        $peakPower = 0;
        $peakTime = null;
        
        foreach ($rows as $row) {
            $timestamp = (int)$row['timestamp'];
            $energyKWh = round($row['energy_produced'] / 1000, 3); // Wh to kWh
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
        $hours = $zoom;
        $theoreticalMaxKWh = ($SYSTEM_CAPACITY_W / 1000) * $hours;
        $capacityFactor = $theoreticalMaxKWh > 0 ? round(($totalEnergy / $theoreticalMaxKWh) * 100, 2) : 0;
        
        return [
            'chartData' => $chartData,
            'stats' => [
                'totalEnergy' => round($totalEnergy, 3),
                'avgPower' => $count > 0 ? round($totalPower / $count, 0) : 0,
                'peakPower' => [
                    'value' => $peakPower,
                    'time' => $peakTime
                ],
                'capacityFactor' => $capacityFactor
            ]
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting hours data: " . $e->getMessage());
        return [
            'chartData' => [],
            'stats' => [
                'totalEnergy' => 0,
                'avgPower' => 0,
                'peakPower' => ['value' => 0, 'time' => null],
                'capacityFactor' => 0
            ]
        ];
    }
}

/**
 * Get historical data for days period
 */
function getDaysData($db, $zoom) {
    global $SYSTEM_CAPACITY_W;
    
    try {
        $stmt = $db->prepare("
            SELECT 
                timestamp,
                energy_produced,
                power_peak,
                capacity_factor
            FROM solar_daily 
            ORDER BY timestamp DESC 
            LIMIT :limit
        ");
        
        $stmt->bindValue(':limit', (int)$zoom, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_reverse($rows);
        
        $chartData = [];
        $totalEnergy = 0;
        $peakPower = 0;
        $peakTime = null;
        
        foreach ($rows as $row) {
            $timestamp = (int)$row['timestamp'];
            $energyKWh = round($row['energy_produced'] / 1000, 3);
            $powerPeak = (int)$row['power_peak'];
            
            $chartData[] = [
                'timestamp' => date('Y-m-d H:i:s', $timestamp),
                'unixTimestamp' => $timestamp,
                'production' => $energyKWh,
                'power' => $powerPeak, // For days, show peak power
                'powerMax' => $powerPeak
            ];
            
            $totalEnergy += $energyKWh;
            
            if ($powerPeak > $peakPower) {
                $peakPower = $powerPeak;
                $peakTime = date('Y-m-d H:i:s', $timestamp);
            }
        }
        
        $hours = $zoom * 24;
        $theoreticalMaxKWh = ($SYSTEM_CAPACITY_W / 1000) * $hours;
        $capacityFactor = $theoreticalMaxKWh > 0 ? round(($totalEnergy / $theoreticalMaxKWh) * 100, 2) : 0;
        
        return [
            'chartData' => $chartData,
            'stats' => [
                'totalEnergy' => round($totalEnergy, 3),
                'avgPower' => count($chartData) > 0 ? round($totalEnergy * 1000 / count($chartData) / 24, 0) : 0,
                'peakPower' => [
                    'value' => $peakPower,
                    'time' => $peakTime
                ],
                'capacityFactor' => $capacityFactor
            ]
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting days data: " . $e->getMessage());
        return [
            'chartData' => [],
            'stats' => [
                'totalEnergy' => 0,
                'avgPower' => 0,
                'peakPower' => ['value' => 0, 'time' => null],
                'capacityFactor' => 0
            ]
        ];
    }
}

/**
 * Get historical data for months period
 */
function getMonthsData($db, $zoom) {
    global $SYSTEM_CAPACITY_W;
    
    try {
        $stmt = $db->prepare("
            SELECT 
                timestamp,
                energy_produced,
                power_peak,
                capacity_factor
            FROM solar_monthly 
            ORDER BY timestamp DESC 
            LIMIT :limit
        ");
        
        $stmt->bindValue(':limit', (int)$zoom, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_reverse($rows);
        
        $chartData = [];
        $totalEnergy = 0;
        $peakPower = 0;
        $peakTime = null;
        
        foreach ($rows as $row) {
            $timestamp = (int)$row['timestamp'];
            $energyKWh = round($row['energy_produced'] / 1000, 3);
            $powerPeak = (int)$row['power_peak'];
            
            $chartData[] = [
                'timestamp' => date('Y-m-d H:i:s', $timestamp),
                'unixTimestamp' => $timestamp,
                'production' => $energyKWh,
                'power' => $powerPeak,
                'powerMax' => $powerPeak
            ];
            
            $totalEnergy += $energyKWh;
            
            if ($powerPeak > $peakPower) {
                $peakPower = $powerPeak;
                $peakTime = date('Y-m-d H:i:s', $timestamp);
            }
        }
        
        $hours = $zoom * 30 * 24;
        $theoreticalMaxKWh = ($SYSTEM_CAPACITY_W / 1000) * $hours;
        $capacityFactor = $theoreticalMaxKWh > 0 ? round(($totalEnergy / $theoreticalMaxKWh) * 100, 2) : 0;
        
        return [
            'chartData' => $chartData,
            'stats' => [
                'totalEnergy' => round($totalEnergy, 3),
                'avgPower' => 0,
                'peakPower' => [
                    'value' => $peakPower,
                    'time' => $peakTime
                ],
                'capacityFactor' => $capacityFactor
            ]
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting months data: " . $e->getMessage());
        return [
            'chartData' => [],
            'stats' => [
                'totalEnergy' => 0,
                'avgPower' => 0,
                'peakPower' => ['value' => 0, 'time' => null],
                'capacityFactor' => 0
            ]
        ];
    }
}

/**
 * Get historical data for years period
 */
function getYearsData($db, $zoom) {
    global $SYSTEM_CAPACITY_W;
    
    try {
        $stmt = $db->prepare("
            SELECT 
                timestamp,
                energy_produced,
                power_peak,
                capacity_factor
            FROM solar_yearly 
            ORDER BY timestamp DESC 
            LIMIT :limit
        ");
        
        $stmt->bindValue(':limit', (int)$zoom, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $rows = array_reverse($rows);
        
        $chartData = [];
        $totalEnergy = 0;
        $peakPower = 0;
        $peakTime = null;
        
        foreach ($rows as $row) {
            $timestamp = (int)$row['timestamp'];
            $energyKWh = round($row['energy_produced'] / 1000, 3);
            $powerPeak = (int)$row['power_peak'];
            
            $chartData[] = [
                'timestamp' => date('Y-m-d H:i:s', $timestamp),
                'unixTimestamp' => $timestamp,
                'production' => $energyKWh,
                'power' => $powerPeak,
                'powerMax' => $powerPeak
            ];
            
            $totalEnergy += $energyKWh;
            
            if ($powerPeak > $peakPower) {
                $peakPower = $powerPeak;
                $peakTime = date('Y-m-d H:i:s', $timestamp);
            }
        }
        
        $hours = $zoom * 365 * 24;
        $theoreticalMaxKWh = ($SYSTEM_CAPACITY_W / 1000) * $hours;
        $capacityFactor = $theoreticalMaxKWh > 0 ? round(($totalEnergy / $theoreticalMaxKWh) * 100, 2) : 0;
        
        return [
            'chartData' => $chartData,
            'stats' => [
                'totalEnergy' => round($totalEnergy, 3),
                'avgPower' => 0,
                'peakPower' => [
                    'value' => $peakPower,
                    'time' => $peakTime
                ],
                'capacityFactor' => $capacityFactor
            ]
        ];
        
    } catch (PDOException $e) {
        error_log("Error getting years data: " . $e->getMessage());
        return [
            'chartData' => [],
            'stats' => [
                'totalEnergy' => 0,
                'avgPower' => 0,
                'peakPower' => ['value' => 0, 'time' => null],
                'capacityFactor' => 0
            ]
        ];
    }
}

// Main execution
$db = getSolarDB();

if (!$db) {
    echo json_encode([
        'error' => 'Database connection failed',
        'chartData' => [],
        'stats' => [
            'totalEnergy' => 0,
            'avgPower' => 0,
            'peakPower' => ['value' => 0, 'time' => null],
            'capacityFactor' => 0
        ]
    ]);
    exit;
}

// Get request parameters
$action = isset($_GET['action']) ? $_GET['action'] : '';
$period = isset($_GET['period']) ? $_GET['period'] : 'hours';
$zoom = isset($_GET['zoom']) ? (int)$_GET['zoom'] : 24;

// Handle different actions
if ($action === 'current') {
    // Return current/realtime data
    $data = getCurrentData($db);
    echo json_encode($data, JSON_PRETTY_PRINT);
} else {
    // Return historical data based on period
    $result = null;
    
    switch ($period) {
        case 'hours':
            $result = getHoursData($db, $zoom);
            break;
        case 'days':
            $result = getDaysData($db, $zoom);
            break;
        case 'months':
            $result = getMonthsData($db, $zoom);
            break;
        case 'years':
            $result = getYearsData($db, $zoom);
            break;
        default:
            $result = getHoursData($db, $zoom);
    }
    
    // Add period and zoom to response
    $result['period'] = $period;
    $result['zoom'] = $zoom;
    
    echo json_encode($result, JSON_PRETTY_PRINT);
}
?>