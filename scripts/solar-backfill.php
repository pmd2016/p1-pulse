#!/usr/bin/env php
<?php
/**
 * Phase 6: Solar Data Backfill Script
 * 
 * Populates solar database with historical production data from Solplanet API
 * using getPlantOutput('bydays') which provides 20-minute interval data.
 * 
 * Usage:
 *   php solar-backfill.php --days=7          # Backfill last 7 days
 *   php solar-backfill.php --start=2025-12-15 --end=2026-01-16
 *   php solar-backfill.php --days=30 --verbose
 */

require_once '/p1mon/www/custom/lib/SolarConfig.php';
require_once '/p1mon/www/custom/lib/SolplanetAPI.php';

// Parse command line arguments
$options = getopt('', ['days:', 'start:', 'end:', 'verbose', 'dry-run', 'force', 'help']);

if (isset($options['help'])) {
    echo <<<HELP
Solar Data Backfill Script

Usage:
  php solar-backfill.php [options]

Options:
  --days=N          Backfill last N days (default: 7)
  --start=DATE      Start date (YYYY-MM-DD)
  --end=DATE        End date (YYYY-MM-DD)
  --verbose         Show detailed progress
  --dry-run         Show what would be done without inserting
  --force           Overwrite existing data
  --help            Show this help

Examples:
  php solar-backfill.php --days=7
  php solar-backfill.php --start=2025-12-15 --end=2026-01-16
  php solar-backfill.php --days=30 --verbose --force

HELP;
    exit(0);
}

$verbose = isset($options['verbose']);
$dryRun = isset($options['dry-run']);
$force = isset($options['force']);

// Determine date range
if (isset($options['start']) && isset($options['end'])) {
    $startDate = $options['start'];
    $endDate = $options['end'];
} else {
    $days = isset($options['days']) ? (int)$options['days'] : 7;
    $endDate = date('Y-m-d', strtotime('-1 day')); // Yesterday (don't interfere with live collector)
    $startDate = date('Y-m-d', strtotime("-$days days"));
}

echo "================================================================================\n";
echo "SOLAR DATA BACKFILL\n";
echo "================================================================================\n\n";

echo "Date range: $startDate to $endDate\n";
if ($dryRun) echo "Mode: DRY RUN (no data will be inserted)\n";
if ($force) echo "Mode: FORCE (will overwrite existing data)\n";
echo "\n";

// Validate dates
$start = strtotime($startDate);
$end = strtotime($endDate);

if ($start === false || $end === false) {
    die("❌ Invalid date format. Use YYYY-MM-DD\n");
}

if ($start > $end) {
    die("❌ Start date must be before end date\n");
}

$totalDays = ceil(($end - $start) / 86400) + 1;
echo "Total days to process: $totalDays\n\n";

// Load credentials
if (!SolarConfig::isEnabled()) {
    die("❌ Solar monitoring is not enabled in config\n");
}

$appKey = SolarConfig::get('app_key');
$appSecret = SolarConfig::get('app_secret');
$apiKey = SolarConfig::get('api_key');
$token = SolarConfig::get('token');
$sn = SolarConfig::get('sn');

if (!$appKey || !$appSecret || !$apiKey || !$sn) {
    die("❌ Missing required credentials in config\n");
}

// Create API client
$api = new SolplanetAPI($appKey, $appSecret, $apiKey, $token, $sn);

// Open database
$dbPath = '/p1mon/www/custom/data/solar.db';
if (!file_exists($dbPath)) {
    die("❌ Database not found: $dbPath\n");
}

try {
    $db = new PDO("sqlite:$dbPath");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("❌ Database connection failed: " . $e->getMessage() . "\n");
}

echo "✓ API client initialized\n";
echo "✓ Database connected\n\n";

// Statistics
$stats = [
    'days_processed' => 0,
    'days_skipped' => 0,
    'records_inserted' => 0,
    'total_energy_kwh' => 0,
    'api_calls' => 0,
    'errors' => 0
];

// Process each day
$currentDate = $start;
$processedDays = 0;

while ($currentDate <= $end) {
    $dateStr = date('Y-m-d', $currentDate);
    $processedDays++;
    
    echo "[$processedDays/$totalDays] Processing $dateStr... ";
    
    if ($verbose) echo "\n";
    
    try {
        // Check if we already have data for this day
        if (!$dryRun && !$force) {
            $stmt = $db->prepare("SELECT COUNT(*) FROM solar_daily WHERE date = ?");
            $stmt->execute([$dateStr]);
            $count = $stmt->fetchColumn();
            
            if ($count > 0) {
                echo "⊘ Already exists (use --force to overwrite)\n";
                $stats['days_skipped']++;
                $currentDate = strtotime('+1 day', $currentDate);
                continue;
            }
        }
        
        // Fetch data from API
        $stats['api_calls']++;
        $response = $api->getPlantOutput('bydays', $dateStr);
        
        if (!isset($response['success']) || !$response['success']) {
            echo "❌ API error\n";
            $stats['errors']++;
            $currentDate = strtotime('+1 day', $currentDate);
            continue;
        }
        
        if (!isset($response['data']['data']) || !is_array($response['data']['data'])) {
            echo "⊘ No data available\n";
            $stats['days_skipped']++;
            $currentDate = strtotime('+1 day', $currentDate);
            continue;
        }
        
        $dataPoints = $response['data']['data'];
        $dataUnit = $response['data']['dataunit'] ?? 'W';
        
        if ($verbose) {
            echo "  Received " . count($dataPoints) . " data points ($dataUnit)\n";
        }
        
        // Process 20-minute intervals into hourly buckets
        $hourlyData = [];
        $dailyTotalWh = 0;
        $peakPower = 0;
        $peakTime = null;
        
        foreach ($dataPoints as $point) {
            $time = $point['time']; // "HH:MM"
            $powerW = floatval($point['value']);
            
            if ($powerW < 0) $powerW = 0; // Sanity check
            
            // Track peak
            if ($powerW > $peakPower) {
                $peakPower = $powerW;
                $peakTime = $time;
            }
            
            // Calculate energy for this 20-minute interval (in Wh)
            // Energy = Power × Time
            // 20 minutes = 1/3 hour
            $energyWh = $powerW * (20 / 60);
            $dailyTotalWh += $energyWh;
            
            // Group into hourly buckets
            list($hour, $minute) = explode(':', $time);
            $hour = (int)$hour;
            
            if (!isset($hourlyData[$hour])) {
                $hourlyData[$hour] = [
                    'power_sum' => 0,
                    'power_count' => 0,
                    'power_max' => 0,
                    'energy_wh' => 0
                ];
            }
            
            $hourlyData[$hour]['power_sum'] += $powerW;
            $hourlyData[$hour]['power_count']++;
            $hourlyData[$hour]['power_max'] = max($hourlyData[$hour]['power_max'], $powerW);
            $hourlyData[$hour]['energy_wh'] += $energyWh;
        }
        
        $dailyTotalKwh = $dailyTotalWh / 1000;
        $stats['total_energy_kwh'] += $dailyTotalKwh;
        
        if ($verbose) {
            echo "  Daily total: " . number_format($dailyTotalKwh, 2) . " kWh\n";
            echo "  Peak power: {$peakPower}W at $peakTime\n";
        }
        
        if ($dryRun) {
            echo "✓ Would insert " . count($hourlyData) . " hourly records\n";
            $stats['days_processed']++;
            $currentDate = strtotime('+1 day', $currentDate);
            continue;
        }
        
        // Begin transaction
        $db->beginTransaction();
        
        try {
            // Insert hourly records
            $stmt = $db->prepare("
                INSERT OR IGNORE INTO solar_hourly (
                    timestamp, power_avg, energy_produced, power_max, power_min, samples, aggregated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            
            $now = time();
            foreach ($hourlyData as $hour => $data) {
                $timestamp = strtotime("$dateStr $hour:00:00");
                $avgPower = $data['power_count'] > 0 
                    ? round($data['power_sum'] / $data['power_count']) 
                    : 0;
                
                // power_min for backfilled data is 0 (we don't track it from 20-min intervals)
                $powerMin = 0;
                
                $stmt->execute([
                    $timestamp,
                    $avgPower,
                    round($data['energy_wh']),
                    round($data['power_max']),
                    $powerMin,
                    $data['power_count'],
                    $now
                ]);
                
                $stats['records_inserted']++;
            }
            
            // Insert daily summary
            $dailyTimestamp = strtotime("$dateStr 00:00:00");
            $now = time();
            
            // Calculate peak time (unix timestamp for when peak occurred)
            $peakTimeTimestamp = 0;
            if ($peakTime) {
                $peakTimeTimestamp = strtotime("$dateStr $peakTime:00");
            }
            
            // Calculate hours of sunlight (production > 10W)
            $sunlightHours = 0;
            foreach ($dataPoints as $point) {
                if (floatval($point['value']) > 10) {
                    $sunlightHours += (20 / 60); // 20 minutes = 1/3 hour
                }
            }
            
            // Calculate capacity factor
            // System capacity: 3780W, theoretical max per day: 3780W × 24h = 90720 Wh
            $theoreticalMax = 3780 * 24;
            $capacityFactor = $theoreticalMax > 0 ? ($dailyTotalWh / $theoreticalMax) * 100 : 0;
            
            $stmt = $db->prepare("
                INSERT OR REPLACE INTO solar_daily (
                    date, timestamp, energy_produced, power_peak, power_peak_time, 
                    hours_sunlight, capacity_factor, aggregated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            $stmt->execute([
                $dateStr,
                $dailyTimestamp,
                round($dailyTotalWh), // Store in Wh
                round($peakPower),
                $peakTimeTimestamp,
                round($sunlightHours, 2),
                round($capacityFactor, 2),
                $now
            ]);
            
            $db->commit();
            
            echo "✓ Inserted " . count($hourlyData) . " hourly records, " 
                . number_format($dailyTotalKwh, 2) . " kWh\n";
            
            $stats['days_processed']++;
            
        } catch (PDOException $e) {
            $db->rollBack();
            echo "❌ Database error: " . $e->getMessage() . "\n";
            $stats['errors']++;
        }
        
        // Rate limiting: 6 calls per minute = 10 second delay
        // This is conservative to avoid hitting API limits
        if ($processedDays < $totalDays) {
            sleep(10);
        }
        
    } catch (Exception $e) {
        echo "❌ Error: " . $e->getMessage() . "\n";
        $stats['errors']++;
    }
    
    $currentDate = strtotime('+1 day', $currentDate);
}

// Trigger aggregations for monthly/yearly data
if (!$dryRun && $stats['days_processed'] > 0) {
    echo "\n================================================================================\n";
    echo "AGGREGATING DATA\n";
    echo "================================================================================\n\n";
    
    echo "Aggregating daily → monthly... ";
    try {
        $db->exec("
            INSERT OR REPLACE INTO solar_monthly (
                year, month, timestamp, energy_produced, power_peak, 
                days_with_data, avg_daily_production, capacity_factor, aggregated_at
            )
            SELECT 
                CAST(strftime('%Y', date) AS INTEGER) as year,
                CAST(strftime('%m', date) AS INTEGER) as month,
                strftime('%s', strftime('%Y-%m-01', date)) as timestamp,
                SUM(energy_produced) as energy_produced,
                MAX(power_peak) as power_peak,
                COUNT(*) as days_with_data,
                CAST(AVG(energy_produced) AS INTEGER) as avg_daily_production,
                AVG(capacity_factor) as capacity_factor,
                strftime('%s', 'now') as aggregated_at
            FROM solar_daily
            WHERE date >= '$startDate' AND date <= '$endDate'
            GROUP BY year, month
        ");
        echo "✓\n";
    } catch (PDOException $e) {
        echo "❌ " . $e->getMessage() . "\n";
    }
    
    echo "Aggregating monthly → yearly... ";
    try {
        $db->exec("
            INSERT OR REPLACE INTO solar_yearly (
                year, timestamp, energy_produced, power_peak,
                months_with_data, avg_monthly_production, capacity_factor, aggregated_at
            )
            SELECT 
                year,
                strftime('%s', year || '-01-01') as timestamp,
                SUM(energy_produced) as energy_produced,
                MAX(power_peak) as power_peak,
                COUNT(*) as months_with_data,
                CAST(AVG(energy_produced) AS INTEGER) as avg_monthly_production,
                AVG(capacity_factor) as capacity_factor,
                strftime('%s', 'now') as aggregated_at
            FROM solar_monthly
            GROUP BY year
        ");
        echo "✓\n";
    } catch (PDOException $e) {
        echo "❌ " . $e->getMessage() . "\n";
    }
}

// Summary
echo "\n================================================================================\n";
echo "BACKFILL SUMMARY\n";
echo "================================================================================\n\n";

echo "Days processed:     {$stats['days_processed']}\n";
echo "Days skipped:       {$stats['days_skipped']}\n";
echo "Records inserted:   {$stats['records_inserted']}\n";
echo "Total energy:       " . number_format($stats['total_energy_kwh'], 2) . " kWh\n";
echo "API calls made:     {$stats['api_calls']}\n";
echo "Errors:             {$stats['errors']}\n";

if ($stats['days_processed'] > 0) {
    $avgDaily = $stats['total_energy_kwh'] / $stats['days_processed'];
    echo "Average per day:    " . number_format($avgDaily, 2) . " kWh\n";
}

echo "\n";

if (!$dryRun && $stats['days_processed'] > 0) {
    echo "✓ Backfill complete! Your solar dashboard now has historical data.\n";
} elseif ($dryRun) {
    echo "Dry run complete. Remove --dry-run to actually insert data.\n";
} else {
    echo "No new data was inserted.\n";
}

echo "\n";