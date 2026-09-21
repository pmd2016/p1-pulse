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

// Relative to this script, so it runs both from a checkout and from the
// deployed copy under /p1mon/www/custom/scripts.
define('LIB_DIR', __DIR__ . '/../lib');

require_once LIB_DIR . '/SolarConfig.php';
require_once LIB_DIR . '/SolplanetAPI.php';
require_once LIB_DIR . '/SolarUnits.php';

// Parse command line arguments
$options = getopt('', ['days:', 'start:', 'end:', 'delay:', 'verbose', 'dry-run', 'force', 'help']);

if (isset($options['help'])) {
    echo <<<HELP
Solar Data Backfill Script

Usage:
  php solar-backfill.php [options]

Options:
  --days=N          Backfill last N days (default: 7)
  --start=DATE      Start date (YYYY-MM-DD)
  --end=DATE        End date (YYYY-MM-DD)
  --delay=N         Seconds to wait between API calls (default: 10)
  --verbose         Show detailed progress
  --dry-run         Show what would be done without inserting
  --force           Overwrite existing data
  --help            Show this help

Examples:
  php solar-backfill.php --days=7
  php solar-backfill.php --start=2025-12-15 --end=2026-01-16
  php solar-backfill.php --days=30 --verbose --force

Long ranges:
  One API call per day, so a multi-year range takes hours. The run is
  resumable: days already present in solar_daily are skipped without an API
  call, so an interrupted run can simply be started again with the same
  arguments. Run it detached so an SSH drop does not kill it:

    nohup php solar-backfill.php --start=2016-06-01 --end=2026-09-20 \
      > /tmp/backfill.log 2>&1 &
    tail -f /tmp/backfill.log

HELP;
    exit(0);
}

$verbose = isset($options['verbose']);
$dryRun = isset($options['dry-run']);
$force = isset($options['force']);

// Seconds between API calls. Skipped days make no call and so never wait,
// which is what makes an interrupted long run cheap to resume.
$delay = isset($options['delay']) ? max(0, (int)$options['delay']) : 10;

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
echo "Total days to process: $totalDays\n";
echo "Delay between calls: {$delay}s\n";

// One API call per day, so long ranges are measured in hours rather than
// minutes. Say so up front rather than letting someone discover it.
$worstCaseSeconds = $totalDays * $delay;

if ($worstCaseSeconds > 1800) {
    printf(
        "\n  ! At %ds per day this run takes up to %s if no day is skipped.\n",
        $delay,
        $worstCaseSeconds >= 3600
            ? sprintf('%dh %dm', intdiv($worstCaseSeconds, 3600), intdiv($worstCaseSeconds % 3600, 60))
            : sprintf('%dm', intdiv($worstCaseSeconds, 60))
    );
    echo "  ! Days already in solar_daily are skipped without an API call, so an\n";
    echo "  ! interrupted run resumes cheaply. Consider running it detached:\n";
    echo "  !   nohup php " . basename(__FILE__) . " ... > /tmp/backfill.log 2>&1 &\n";
}

echo "\n";

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
$runStartedAt = time();

while ($currentDate <= $end) {
    $dateStr = date('Y-m-d', $currentDate);
    $processedDays++;
    
    // Estimate from days that actually cost an API call; skipped days finish
    // instantly and would otherwise flatter the projection.
    $eta = '';
    if ($stats['api_calls'] > 0) {
        $elapsed = time() - $runStartedAt;
        $remainingCalls = max(0, ($totalDays - $processedDays + 1) - $stats['days_skipped']);
        $secondsLeft = (int)round(($elapsed / $stats['api_calls']) * $remainingCalls);

        if ($secondsLeft > 60) {
            $eta = $secondsLeft >= 3600
                ? sprintf(' (ETA %dh %dm)', intdiv($secondsLeft, 3600), intdiv($secondsLeft % 3600, 60))
                : sprintf(' (ETA %dm)', intdiv($secondsLeft, 60));
        }
    }

    echo "[$processedDays/$totalDays]$eta Processing $dateStr... ";
    
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

        // Honour the declared unit. This used to default to 'W' and then ignore
        // the value entirely, which silently divided every backfilled reading by
        // a thousand when the API reported kW.
        $dataUnit = $response['data']['dataunit'] ?? null;

        if ($dataUnit === null) {
            echo "✗ $dateStr: response declares no dataunit; refusing to guess\n";
            $stats['errors']++;
            $currentDate = strtotime('+1 day', $currentDate);
            continue;
        }

        if (SolarUnits::toWatts(0, $dataUnit) === null) {
            echo "✗ $dateStr: unrecognised power unit '$dataUnit'. Known: "
                . implode(', ', SolarUnits::knownPowerUnits()) . "\n";
            $stats['errors']++;
            $currentDate = strtotime('+1 day', $currentDate);
            continue;
        }

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

            // Convert from the declared unit rather than assuming watts.
            $powerW = SolarUnits::toWatts($point['value'], $dataUnit);

            if ($powerW === null) {
                if ($verbose) {
                    echo "  Skipping unreadable point at $time\n";
                }
                continue;
            }

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
        
        // Rate limiting. The default of 10s is six calls a minute, which is
        // conservative; --delay tunes it for long ranges. Only reached when the
        // day actually cost an API call, since every skip path continues above.
        if ($delay > 0 && $processedDays < $totalDays) {
            sleep($delay);
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