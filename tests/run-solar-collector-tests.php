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

// The most recently completed hour, so the aggregation loop runs over as few
// hours as possible. Stepped back when that lands on midnight, because these
// cases place an opening boundary reading just before the hour and it has to
// fall on the same local day.
$hour = (floor(time() / 3600) * 3600) - 3600;

if (date('H', $hour) === '00') {
    $hour -= 3600;
}

test('offline readings do not become an hour of production', function () use ($dbPath, $hour) {
    // Exactly the pattern observed live: the inverter reports zeros across every
    // field while offline, then returns with the day's running total intact.
    $db = freshDb($dbPath);
    reading($db, $hour - 60,   900, 11600, 1); // the previous hour's close
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
    reading($db, $hour - 60,   880, 10000, 1);  // the previous hour's close
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
    reading($db, $hour - 60,   780,  9000, 1);  // the previous hour's close
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

test('the hour boundary is carried across, not dropped', function () use ($dbPath, $hour) {
    // Three samples at :00, :20 and :40, and the next hour's first sample at
    // the following :00. Real production over the hour is 1600 - 1000 = 600 Wh.
    //
    // Reading first-to-last *inside* the hour gives 1400 - 1000 = 400, losing
    // the final twenty minutes. That gap belonged to no bucket at all, because
    // the next hour started its own count from its own first sample.
    $db = freshDb($dbPath);
    reading($db, $hour,        900, 1000, 1);
    reading($db, $hour + 1200, 950, 1200, 1);
    reading($db, $hour + 2400, 980, 1400, 1);
    reading($db, $hour + 3600, 990, 1600, 1);  // first sample of the next hour

    $row = aggregatePreviousHour($db, $hour);

    if (!$row) {
        fail('no hourly row was written');
        return;
    }

    assertSame(600, (int)$row['energy_produced'], 'the full hour, including the closing gap');
    assertSame(3, (int)$row['samples'], 'the next hour\'s sample is a boundary, not a member');
});

test('consecutive hours telescope to the daily total', function () use ($dbPath, $hour) {
    // Each hour's closing reading is the next hour's opening one, so summing
    // the hours must equal the counter's movement across the whole span.
    $db = freshDb($dbPath);
    $twoHoursBack = $hour - 3600;

    reading($db, $twoHoursBack,        500, 2000, 1);
    reading($db, $twoHoursBack + 1800, 700, 2400, 1);
    reading($db, $hour,                900, 2900, 1);
    reading($db, $hour + 1800,         950, 3500, 1);
    reading($db, $hour + 3600,         800, 4100, 1);

    $db->prepare(
        "INSERT OR REPLACE INTO collection_metadata (key, value, updated_at)
         VALUES ('last_hourly_aggregation', ?, ?)"
    )->execute([$twoHoursBack, time()]);

    aggregateHourlyData($db);

    $rows = $db->query(
        'SELECT timestamp, energy_produced FROM solar_hourly ORDER BY timestamp'
    )->fetchAll(PDO::FETCH_ASSOC);

    assertSame(2, count($rows), 'both completed hours aggregated');

    $total = array_sum(array_column($rows, 'energy_produced'));
    assertSame(2100, (int)$total, 'the hours sum to 4100 - 2000, with nothing lost between them');
});

test('the hour before midnight does not read the next day\'s counter', function () use ($dbPath) {
    // energy_today resets at midnight. A reading taken at 00:00 satisfies
    // "at or before the end of the 23:00 hour", and taking it would report the
    // day's last hour as zero or negative.
    $midnight = strtotime('today midnight') - 86400;  // yesterday 00:00 local
    $lastHour = $midnight + 23 * 3600;

    $db = freshDb($dbPath);
    reading($db, $lastHour,        120, 14000, 1);
    reading($db, $lastHour + 1800,  40, 14800, 1);
    reading($db, $lastHour + 3600,   0,     0, 1);  // 00:00, counter reset

    $db->prepare(
        "INSERT OR REPLACE INTO collection_metadata (key, value, updated_at)
         VALUES ('last_hourly_aggregation', ?, ?)"
    )->execute([$lastHour, time()]);

    aggregateHourlyData($db);

    $row = $db->query(
        'SELECT * FROM solar_hourly WHERE timestamp = ' . (int)$lastHour
    )->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        fail('no hourly row was written for the last hour of the day');
        return;
    }

    assertSame(800, (int)$row['energy_produced'], 'closes on the day\'s own last reading');
});

test('an hour before the day\'s first reading counts from zero', function () use ($dbPath) {
    // Dawn: the counter starts the day at zero, so the first productive hour
    // has no earlier reading to open against.
    $dayStart = strtotime('today midnight') - 86400;
    $firstHour = $dayStart + 7 * 3600;

    $db = freshDb($dbPath);
    reading($db, $firstHour + 600,  60, 40,  1);
    reading($db, $firstHour + 3000, 90, 120, 1);

    $db->prepare(
        "INSERT OR REPLACE INTO collection_metadata (key, value, updated_at)
         VALUES ('last_hourly_aggregation', ?, ?)"
    )->execute([$firstHour, time()]);

    aggregateHourlyData($db);

    $row = $db->query(
        'SELECT * FROM solar_hourly WHERE timestamp = ' . (int)$firstHour
    )->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        fail('no hourly row was written');
        return;
    }

    assertSame(120, (int)$row['energy_produced'], 'the whole counter movement, opening from zero');
});

if (file_exists($dbPath)) {
    unlink($dbPath);
}

exit(testSummary());
