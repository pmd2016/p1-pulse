#!/usr/bin/env php
<?php
/**
 * Solar collector test harness
 *
 * Exercises the aggregation in scripts/solar-collector.php against a temporary
 * database. The collector's constants and its entry point are guarded, so this
 * includes the file for its functions without running a collection.
 *
 * Usage: php tests/run-solar-collector-tests.php
 */

require_once __DIR__ . '/assert.php';

$tmpDir = sys_get_temp_dir() . '/p1-pulse-tests';

if (!is_dir($tmpDir) && !mkdir($tmpDir, 0755, true) && !is_dir($tmpDir)) {
    fwrite(STDERR, "ERROR: could not create $tmpDir\n");
    exit(2);
}

$dbPath = $tmpDir . '/solar-collector.db';

// Point the collector at our fixtures before including it.
define('BASE_DIR', dirname(__DIR__));
define('DB_PATH', $dbPath);
define('LIB_DIR', dirname(__DIR__) . '/lib');
define('SOLAR_COLLECTOR_NO_RUN', true);

$verbose = false;
require_once dirname(__DIR__) . '/scripts/solar-collector.php';

echo "Solar collector harness\n";
echo str_repeat('=', 78) . "\n\n";

/** Fresh database from the installer's schema. */
function freshDb($path) {
    if (file_exists($path)) {
        unlink($path);
    }

    $db = new PDO('sqlite:' . $path);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec(file_get_contents(dirname(__DIR__) . '/scripts/solar-schema.sql'));

    return $db;
}

/** Insert one realtime reading. */
function reading(PDO $db, $timestamp, $power, $energyToday, $status = 1) {
    $db->prepare(
        'INSERT INTO solar_realtime
            (timestamp, power_current, energy_today, energy_month, energy_total,
             inverter_status, collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([$timestamp, $power, $energyToday, 239780, 39090000, $status, $timestamp]);
}

/** Aggregate only the single hour that just completed. */
function aggregatePreviousHour(PDO $db, $hourStart) {
    $db->prepare(
        "INSERT OR REPLACE INTO collection_metadata (key, value, updated_at)
         VALUES ('last_hourly_aggregation', ?, ?)"
    )->execute([$hourStart, time()]);

    aggregateHourlyData($db);

    return $db->query(
        'SELECT * FROM solar_hourly WHERE timestamp = ' . (int)$hourStart
    )->fetch(PDO::FETCH_ASSOC);
}

// The most recently completed hour, so the aggregation loop runs exactly once.
$hour = (floor(time() / 3600) * 3600) - 3600;

test('offline readings do not become an hour of production', function () use ($dbPath, $hour) {
    // Exactly the pattern observed live: the inverter reports zeros across every
    // field while offline, then returns with the day's running total intact.
    $db = freshDb($dbPath);
    reading($db, $hour + 300,  0, 0,     0);   // offline
    reading($db, $hour + 900,  0, 0,     0);   // offline
    reading($db, $hour + 1500, 0, 0,     0);   // offline
    reading($db, $hour + 2100, 998, 11600, 1); // back online, 11.6 kWh so far today
    reading($db, $hour + 2700, 998, 12000, 1);
    reading($db, $hour + 3300, 998, 12400, 1);

    $row = aggregatePreviousHour($db, $hour);

    if (!$row) {
        fail('no hourly row was written');
        return;
    }

    // Without the inverter_status filter the delta runs 0 -> 12400, recording
    // the whole day into this one hour.
    assertSame(800, (int)$row['energy_produced'],
        'energy is the delta between real readings (12400 - 11600)');
    assertSame(3, (int)$row['samples'], 'only the online readings are counted');
    assertSame(998, (int)$row['power_avg'], 'offline zeros do not drag the average down');
    assertSame(998, (int)$row['power_min'], 'power_min ignores the offline zeros');
});

test('an hour that ends offline does not lose its production', function () use ($dbPath, $hour) {
    $db = freshDb($dbPath);
    reading($db, $hour + 300,  900, 10000, 1);
    reading($db, $hour + 900,  950, 10500, 1);
    reading($db, $hour + 1500, 980, 11000, 1);
    reading($db, $hour + 2100, 0,   0,     0);  // dropped out
    reading($db, $hour + 2700, 0,   0,     0);

    $row = aggregatePreviousHour($db, $hour);

    if (!$row) {
        fail('no hourly row was written');
        return;
    }

    // With the zeros included the delta is max(0, 0 - 10000) = 0, silently
    // discarding an hour of real production.
    assertSame(1000, (int)$row['energy_produced'], 'delta spans the real readings only');
    assertSame(3, (int)$row['samples'], 'offline readings excluded');
});

test('an hour with no online readings is skipped entirely', function () use ($dbPath, $hour) {
    $db = freshDb($dbPath);
    reading($db, $hour + 300,  0, 0, 0);
    reading($db, $hour + 1800, 0, 0, 0);

    $row = aggregatePreviousHour($db, $hour);

    assertSame(false, $row, 'no row is written for an hour the inverter was down');
});

test('a normal hour aggregates as expected', function () use ($dbPath, $hour) {
    $db = freshDb($dbPath);
    reading($db, $hour + 300,  800,  9000, 1);
    reading($db, $hour + 1500, 1200, 9400, 1);
    reading($db, $hour + 2700, 1000, 9800, 1);

    $row = aggregatePreviousHour($db, $hour);

    if (!$row) {
        fail('no hourly row was written');
        return;
    }

    assertSame(800, (int)$row['energy_produced'], 'energy delta across the hour');
    assertSame(1000, (int)$row['power_avg'], 'mean power');
    assertSame(1200, (int)$row['power_max'], 'peak power');
    assertSame(800, (int)$row['power_min'], 'minimum power');
    assertSame(3, (int)$row['samples'], 'sample count');
});

test('the midnight reset does not produce a negative hour', function () use ($dbPath, $hour) {
    // energy_today restarts at zero each day; the hour spanning that must not
    // record a negative, and max(0, ...) is what prevents it.
    $db = freshDb($dbPath);
    reading($db, $hour + 300,  10, 14800, 1);
    reading($db, $hour + 2700, 5,  0,     1);

    $row = aggregatePreviousHour($db, $hour);

    if (!$row) {
        fail('no hourly row was written');
        return;
    }

    assertSame(0, (int)$row['energy_produced'], 'clamped to zero, not negative');
});

if (file_exists($dbPath)) {
    unlink($dbPath);
}

exit(testSummary());
