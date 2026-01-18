#!/usr/bin/env php
<?php
/**
 * Phase 6: Validate Backfilled Solar Data
 * 
 * Checks data quality after backfill:
 * - Record counts
 * - Value ranges (sanity checks)
 * - Timeline gaps
 * - Aggregation consistency
 */

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

echo "================================================================================\n";
echo "SOLAR DATA VALIDATION\n";
echo "================================================================================\n\n";

// Check 1: Record counts
echo "Record Counts:\n";
echo "----------------------------------------\n";

$tables = ['solar_realtime', 'solar_hourly', 'solar_daily', 'solar_monthly', 'solar_yearly'];
foreach ($tables as $table) {
    $count = $db->query("SELECT COUNT(*) FROM $table")->fetchColumn();
    echo sprintf("  %-20s %d records\n", $table . ':', $count);
}
echo "\n";

// Check 2: Daily data overview
echo "Daily Data Overview:\n";
echo "----------------------------------------\n";

$dailyData = $db->query("
    SELECT 
        date,
        ROUND(energy_produced / 1000.0, 2) as kwh,
        power_peak
    FROM solar_daily 
    ORDER BY date DESC 
    LIMIT 10
")->fetchAll(PDO::FETCH_ASSOC);

if (count($dailyData) > 0) {
    echo "Latest 10 days:\n";
    foreach ($dailyData as $row) {
        echo sprintf("  %s: %6.2f kWh (peak: %4dW)\n", 
            $row['date'], $row['kwh'], $row['power_peak']);
    }
} else {
    echo "  No daily data found\n";
}
echo "\n";

// Check 3: Data quality checks
echo "Data Quality Checks:\n";
echo "----------------------------------------\n";

// Check for negative values (should not happen)
$negatives = $db->query("
    SELECT COUNT(*) FROM solar_daily WHERE energy_produced < 0
")->fetchColumn();
echo "  Negative energy values: " . ($negatives > 0 ? "❌ $negatives found" : "✓ None") . "\n";

// Check for unrealistic values (> 40 kWh/day for 3.78 kW system)
$unrealistic = $db->query("
    SELECT COUNT(*) FROM solar_daily WHERE energy_produced > 40000
")->fetchColumn();
echo "  Unrealistic values (>40kWh/day): " . ($unrealistic > 0 ? "⚠ $unrealistic found" : "✓ None") . "\n";

// Check for zero-production days (might be valid, but worth noting)
$zeroDays = $db->query("
    SELECT COUNT(*) FROM solar_daily WHERE energy_produced = 0
")->fetchColumn();
echo "  Zero-production days: $zeroDays\n";

// Check peak power values
$peakStats = $db->query("
    SELECT 
        MIN(power_peak) as min_peak,
        MAX(power_peak) as max_peak,
        AVG(power_peak) as avg_peak
    FROM solar_daily
    WHERE energy_produced > 0
")->fetch(PDO::FETCH_ASSOC);

if ($peakStats) {
    echo "  Peak power range: {$peakStats['min_peak']}W - {$peakStats['max_peak']}W ";
    if ($peakStats['max_peak'] > 3800) {
        echo "(⚠ exceeds system max 3780W)\n";
    } else {
        echo "(✓ within system capacity)\n";
    }
}

echo "\n";

// Check 4: Timeline gaps
echo "Timeline Gap Analysis:\n";
echo "----------------------------------------\n";

$gapQuery = $db->query("
    WITH dates AS (
        SELECT date FROM solar_daily ORDER BY date
    ),
    gaps AS (
        SELECT 
            date as gap_after,
            LEAD(date) OVER (ORDER BY date) as gap_before,
            julianday(LEAD(date) OVER (ORDER BY date)) - julianday(date) - 1 as gap_days
        FROM dates
    )
    SELECT * FROM gaps WHERE gap_days > 0
")->fetchAll(PDO::FETCH_ASSOC);

if (count($gapQuery) > 0) {
    echo "  Found " . count($gapQuery) . " gaps:\n";
    foreach ($gapQuery as $gap) {
        echo sprintf("    %s → %s (%d day gap)\n", 
            $gap['gap_after'], $gap['gap_before'], (int)$gap['gap_days']);
    }
} else {
    echo "  ✓ No gaps in timeline\n";
}
echo "\n";

// Check 5: Aggregation consistency
echo "Aggregation Consistency:\n";
echo "----------------------------------------\n";

// Check if monthly totals match sum of daily
$monthlyCheck = $db->query("
    SELECT 
        m.year || '-' || printf('%02d', m.month) as month,
        ROUND(m.energy_produced / 1000.0, 2) as monthly_total,
        ROUND(SUM(d.energy_produced) / 1000.0, 2) as daily_sum,
        ROUND(ABS(m.energy_produced - SUM(d.energy_produced)) / 1000.0, 2) as difference
    FROM solar_monthly m
    JOIN solar_daily d ON CAST(strftime('%Y', d.date) AS INTEGER) = m.year 
                      AND CAST(strftime('%m', d.date) AS INTEGER) = m.month
    GROUP BY m.year, m.month
    HAVING ABS(m.energy_produced - SUM(d.energy_produced)) > 100
")->fetchAll(PDO::FETCH_ASSOC);

if (count($monthlyCheck) > 0) {
    echo "  ⚠ Monthly aggregation mismatches found:\n";
    foreach ($monthlyCheck as $row) {
        echo sprintf("    %s: Monthly=%0.2f kWh, Daily sum=%0.2f kWh (diff: %0.2f kWh)\n",
            $row['month'], $row['monthly_total'], $row['daily_sum'], $row['difference']);
    }
} else {
    echo "  ✓ Monthly aggregations match daily sums\n";
}

echo "\n";

// Check 6: Production statistics
echo "Production Statistics:\n";
echo "----------------------------------------\n";

$stats = $db->query("
    SELECT 
        COUNT(*) as days,
        ROUND(SUM(energy_produced) / 1000.0, 2) as total_kwh,
        ROUND(AVG(energy_produced) / 1000.0, 2) as avg_kwh,
        ROUND(MIN(energy_produced) / 1000.0, 2) as min_kwh,
        ROUND(MAX(energy_produced) / 1000.0, 2) as max_kwh,
        MIN(date) as first_date,
        MAX(date) as last_date
    FROM solar_daily
    WHERE energy_produced > 0
")->fetch(PDO::FETCH_ASSOC);

if ($stats) {
    echo "  Date range: {$stats['first_date']} to {$stats['last_date']}\n";
    echo "  Production days: {$stats['days']}\n";
    echo "  Total energy: {$stats['total_kwh']} kWh\n";
    echo "  Average daily: {$stats['avg_kwh']} kWh\n";
    echo "  Range: {$stats['min_kwh']} - {$stats['max_kwh']} kWh/day\n";
    
    // Calculate capacity factor for sunny days
    $systemCapacity = 3.78; // kW
    $hoursPerDay = 24;
    $maxTheoretical = $systemCapacity * $hoursPerDay;
    $avgCapacityFactor = ($stats['avg_kwh'] / $maxTheoretical) * 100;
    
    echo sprintf("  Average capacity factor: %.1f%%\n", $avgCapacityFactor);
}

echo "\n";

// Check 7: Recent hourly data sample
echo "Recent Hourly Data Sample:\n";
echo "----------------------------------------\n";

$hourlyData = $db->query("
    SELECT 
        datetime(timestamp, 'unixepoch', 'localtime') as time,
        power_avg,
        ROUND(energy_produced / 1000.0, 3) as kwh,
        power_max
    FROM solar_hourly 
    ORDER BY timestamp DESC 
    LIMIT 5
")->fetchAll(PDO::FETCH_ASSOC);

if (count($hourlyData) > 0) {
    foreach ($hourlyData as $row) {
        echo sprintf("  %s: %4dW avg, %.3f kWh, %4dW peak\n",
            $row['time'], $row['power_avg'], $row['kwh'], $row['power_max']);
    }
} else {
    echo "  No hourly data found\n";
}

echo "\n";

// Final verdict
echo "================================================================================\n";
echo "VALIDATION SUMMARY\n";
echo "================================================================================\n\n";

$issues = 0;
if ($negatives > 0) {
    echo "❌ Found negative values - this needs investigation\n";
    $issues++;
}
if ($unrealistic > 0) {
    echo "⚠ Found unrealistic values - check unit conversions\n";
    $issues++;
}
if (count($monthlyCheck) > 0) {
    echo "⚠ Aggregation mismatches found - may need re-aggregation\n";
    $issues++;
}

if ($issues == 0) {
    echo "✓ All validation checks passed!\n";
    echo "✓ Data quality looks good\n";
    echo "✓ Ready to use in solar dashboard\n";
} else {
    echo "Found $issues potential issues - review output above\n";
}

echo "\n";