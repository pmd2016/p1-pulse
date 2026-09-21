#!/usr/bin/env php
<?php
/**
 * Solar API test harness
 *
 * Exercises api/solar.php against a temporary SQLite database built from the
 * same schema the installer uses (scripts/solar-schema.sql), so its behaviour
 * can be checked without a P1 Monitor host.
 *
 * No test framework: the project has no package manager and no dependencies.
 *
 * Usage:
 *   php tests/run-solar-api-tests.php [--verbose] [--keep]
 *
 * Exits 0 when everything passes, 1 otherwise.
 */

define('CAPACITY_W', 3780);
define('EPSILON', 0.0001);

// A fixed hour boundary, so every expectation is deterministic.
define('T0', 1768471200); // 2026-01-15 10:00:00 UTC

$options = getopt('', ['verbose', 'keep', 'help']);

if (isset($options['help'])) {
    echo "Usage: php tests/run-solar-api-tests.php [--verbose] [--keep]\n\n";
    echo "  --verbose  Print the response body for every request\n";
    echo "  --keep     Leave the temporary database in place for inspection\n";
    exit(0);
}

$verbose = isset($options['verbose']);
$keep    = isset($options['keep']);

$passed = 0;
$failed = 0;
$failures = [];
$currentTest = '(none)';

// ----------------------------------------------------------------------------
// Harness
// ----------------------------------------------------------------------------

function test($name, callable $body) {
    global $currentTest;
    $currentTest = $name;
    echo "  $name\n";

    try {
        $body();
    } catch (Throwable $e) {
        fail('threw ' . get_class($e) . ': ' . $e->getMessage());
    }
}

function pass($detail) {
    global $passed;
    $passed++;
    echo "    ok    $detail\n";
}

function fail($detail) {
    global $failed, $failures, $currentTest;
    $failed++;
    $failures[] = "$currentTest: $detail";
    echo "    FAIL  $detail\n";
}

function assertSame($expected, $actual, $what) {
    if ($expected === $actual) {
        pass($what);
        return;
    }
    fail(sprintf('%s — expected %s, got %s', $what, render($expected), render($actual)));
}

function assertClose($expected, $actual, $what) {
    if (is_numeric($actual) && abs((float)$expected - (float)$actual) < EPSILON) {
        pass($what . ' = ' . render($actual));
        return;
    }
    fail(sprintf('%s — expected %s, got %s', $what, render($expected), render($actual)));
}

function assertEquals($expected, $actual, $what) {
    if ($expected == $actual) {
        pass($what);
        return;
    }
    fail(sprintf('%s — expected %s, got %s', $what, render($expected), render($actual)));
}

function render($value) {
    if (is_array($value)) {
        return json_encode($value, JSON_UNESCAPED_SLASHES);
    }
    return var_export($value, true);
}

/** Run one request against api/solar.php and decode the response. */
function request($dbPath, $query, $capacity = CAPACITY_W) {
    global $verbose;

    $cmd = sprintf(
        'php %s %s %s %d 2>&1',
        escapeshellarg(__DIR__ . '/solar-api-request.php'),
        escapeshellarg($dbPath),
        escapeshellarg($query),
        $capacity
    );

    $raw = shell_exec($cmd);

    if ($verbose) {
        echo "    > $query\n    < " . trim((string)$raw) . "\n";
    }

    $decoded = json_decode((string)$raw, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        fail("response was not JSON for '$query': " . trim((string)$raw));
        return null;
    }

    return $decoded;
}

// ----------------------------------------------------------------------------
// Database construction
// ----------------------------------------------------------------------------

function buildDatabase($path) {
    $schemaPath = dirname(__DIR__) . '/scripts/solar-schema.sql';

    if (!is_readable($schemaPath)) {
        fwrite(STDERR, "ERROR: schema not found at $schemaPath\n");
        exit(2);
    }

    if (file_exists($path)) {
        unlink($path);
    }

    $db = new PDO('sqlite:' . $path);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec(file_get_contents($schemaPath));

    return $db;
}

function seed(PDO $db) {
    // Latest realtime reading. Energy columns are Wh, power is W.
    $db->prepare(
        'INSERT INTO solar_realtime
            (timestamp, power_current, energy_today, energy_month, energy_total,
             inverter_status, collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([T0 + 3000, 2335, 8500, 285000, 4821350, 1, T0 + 3000]);

    // An older reading, to prove the API takes the newest.
    $db->prepare(
        'INSERT INTO solar_realtime
            (timestamp, power_current, energy_today, energy_month, energy_total,
             inverter_status, collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([T0, 100, 1000, 277500, 4813850, 1, T0]);

    // Three hours, inserted newest first to prove the API re-sorts them.
    $hourly = $db->prepare(
        'INSERT INTO solar_hourly
            (timestamp, energy_produced, power_avg, power_max, power_min, samples, aggregated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $hourly->execute([T0,        3000, 1500, 2700, 300, 6, T0]);
    $hourly->execute([T0 - 3600, 2000, 1000, 1800, 200, 6, T0]);
    $hourly->execute([T0 - 7200, 1000,  500,  900, 100, 6, T0]);

    // Two days.
    $daily = $db->prepare(
        'INSERT INTO solar_daily
            (date, timestamp, energy_produced, power_peak, power_peak_time,
             hours_sunlight, capacity_factor, aggregated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $daily->execute(['2026-01-14', T0 - 86400, 6000, 2400, T0 - 43200, 7.5, 6.61, T0]);
    $daily->execute(['2026-01-15', T0,        12000, 3000, T0 + 3000,  9.25, 13.23, T0]);

    // One month and one year.
    $db->prepare(
        'INSERT INTO solar_monthly
            (year, month, timestamp, energy_produced, power_peak, days_with_data,
             avg_daily_production, capacity_factor, aggregated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([2026, 1, T0, 180000, 3000, 15, 12000, 10.5, T0]);

    $db->prepare(
        'INSERT INTO solar_yearly
            (year, timestamp, energy_produced, power_peak, months_with_data,
             avg_monthly_production, capacity_factor, aggregated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([2026, T0, 180000, 3000, 1, 180000, 10.5, T0]);
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

$tmpDir      = sys_get_temp_dir() . '/p1-pulse-tests';
$seededDb    = $tmpDir . '/solar-seeded.db';
$emptyDb     = $tmpDir . '/solar-empty.db';
$missingDb   = $tmpDir . '/solar-does-not-exist.db';

if (!is_dir($tmpDir) && !mkdir($tmpDir, 0755, true) && !is_dir($tmpDir)) {
    fwrite(STDERR, "ERROR: could not create $tmpDir\n");
    exit(2);
}

$db = buildDatabase($seededDb);
seed($db);
buildDatabase($emptyDb);

if (file_exists($missingDb)) {
    unlink($missingDb);
}

echo "Solar API harness\n";
echo str_repeat('=', 78) . "\n\n";

test('action=current returns the newest reading, converted to kWh', function () use ($seededDb) {
    $r = request($seededDb, 'action=current');
    if ($r === null) return;

    assertSame(2335, $r['power'] ?? null, 'power stays in W');
    assertClose(4821.35, $r['energy'] ?? null, 'energy (lifetime Wh -> kWh)');
    assertClose(8.5, $r['energyToday'] ?? null, 'energyToday (Wh -> kWh)');
    assertClose(285.0, $r['energyMonth'] ?? null, 'energyMonth (Wh -> kWh)');
    assertSame('normal', $r['status'] ?? null, 'status maps 1 -> normal');
    assertSame(date('Y-m-d H:i:s', T0 + 3000), $r['timestamp'] ?? null, 'timestamp of newest row');
});

test('action=current reports offline for a non-normal inverter status', function () use ($tmpDir) {
    $path = $tmpDir . '/solar-offline.db';
    $db = buildDatabase($path);
    $db->prepare(
        'INSERT INTO solar_realtime
            (timestamp, power_current, energy_today, energy_month, energy_total,
             inverter_status, collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([T0, 0, 0, 0, 4813850, 3, T0]);

    $r = request($path, 'action=current');
    if ($r === null) return;

    assertSame('offline', $r['status'] ?? null, 'status maps 3 -> offline');
});

test('period=hours converts Wh to kWh and returns oldest first', function () use ($seededDb) {
    $r = request($seededDb, 'period=hours&zoom=3');
    if ($r === null) return;

    $chart = $r['chartData'] ?? [];
    assertSame(3, count($chart), 'three buckets returned');
    if (count($chart) !== 3) return;

    assertSame(T0 - 7200, $chart[0]['unixTimestamp'], 'first bucket is the oldest');
    assertSame(T0, $chart[2]['unixTimestamp'], 'last bucket is the newest');

    assertClose(1.0, $chart[0]['production'], 'oldest production kWh');
    assertClose(3.0, $chart[2]['production'], 'newest production kWh');
    assertSame(1500, $chart[2]['power'], 'power is the hourly average, in W');
    assertSame(2700, $chart[2]['powerMax'], 'powerMax is the hourly peak, in W');
});

test('period=hours statistics', function () use ($seededDb) {
    $r = request($seededDb, 'period=hours&zoom=3');
    if ($r === null) return;

    $stats = $r['stats'] ?? [];
    assertClose(6.0, $stats['totalEnergy'] ?? null, 'totalEnergy is the sum in kWh');
    assertSame(1000, $stats['avgPower'] ?? null, 'avgPower is the mean of power_avg');
    assertSame(2700, $stats['peakPower']['value'] ?? null, 'peakPower.value');
    assertSame(date('Y-m-d H:i:s', T0), $stats['peakPower']['time'] ?? null, 'peakPower.time');

    // Denominator is the REQUESTED zoom, not the span actually covered by data:
    // 6 kWh / (3.78 kW x 3 h) = 52.91%.
    assertClose(52.91, $stats['capacityFactor'] ?? null, 'capacityFactor uses zoom as the window');
});

test('capacity factor tracks the configured system capacity', function () use ($seededDb) {
    // Halving capacity must double the capacity factor for the same energy.
    $r = request($seededDb, 'period=hours&zoom=3', 1890);
    if ($r === null) return;

    assertClose(105.82, $r['stats']['capacityFactor'] ?? null, 'capacityFactor at half capacity');
});

test('period=days exposes stored per-day values', function () use ($seededDb) {
    $r = request($seededDb, 'period=days&zoom=7');
    if ($r === null) return;

    $chart = $r['chartData'] ?? [];
    assertSame(2, count($chart), 'two days returned');
    if (count($chart) !== 2) return;

    assertSame('2026-01-14', $chart[0]['timestamp'], 'day timestamp is the date column');
    assertClose(6.0, $chart[0]['production'], 'day production kWh');
    assertSame(2400, $chart[0]['power'], 'day power is the stored peak');
    assertClose(7.5, $chart[0]['sunlightHours'], 'sunlightHours passed through');
    assertClose(6.61, $chart[0]['capacityFactor'], 'per-day capacityFactor passed through');

    $stats = $r['stats'] ?? [];
    assertClose(18.0, $stats['totalEnergy'] ?? null, 'totalEnergy across both days');
    assertClose(9.0, $stats['avgDaily'] ?? null, 'avgDaily');
    assertSame(3000, $stats['peakPower']['value'] ?? null, 'peak across both days');
    // Mean of the stored daily values, unlike the hours path which recomputes.
    assertClose(9.92, $stats['capacityFactor'] ?? null, 'capacityFactor is the mean of stored values');
});

test('period=months and period=years return their own stat shapes', function () use ($seededDb) {
    $months = request($seededDb, 'period=months&zoom=12');
    if ($months !== null) {
        assertSame('2026-01', $months['chartData'][0]['timestamp'] ?? null, 'month timestamp is YYYY-MM');
        assertClose(180.0, $months['chartData'][0]['production'] ?? null, 'month production kWh');
        assertClose(12.0, $months['chartData'][0]['avgDaily'] ?? null, 'month avgDaily kWh');
        assertSame(15, $months['chartData'][0]['daysWithData'] ?? null, 'daysWithData');
        assertClose(180.0, $months['stats']['avgMonthly'] ?? null, 'stats.avgMonthly');
        assertSame(false, array_key_exists('capacityFactor', $months['stats'] ?? []),
            'months omits capacityFactor');
    }

    $years = request($seededDb, 'period=years&zoom=5');
    if ($years !== null) {
        // Known quirk: JSON_NUMERIC_CHECK turns the year string into a JSON number,
        // so this one period returns a numeric timestamp where the others return
        // strings. Asserted so a change in that behaviour is noticed.
        assertSame(2026, $years['chartData'][0]['timestamp'] ?? null,
            'year timestamp arrives as a number, not a string');
        assertClose(180.0, $years['chartData'][0]['production'] ?? null, 'year production kWh');
        assertClose(180.0, $years['stats']['avgYearly'] ?? null, 'stats.avgYearly');
    }
});

test('zoom is clamped per period and echoed back', function () use ($seededDb) {
    $cases = [
        ['period=hours&zoom=999',  168, 'hours clamps to 168'],
        ['period=days&zoom=9999',  365, 'days clamps to 365'],
        ['period=months&zoom=999',  24, 'months clamps to 24'],
        ['period=years&zoom=999',   10, 'years clamps to 10'],
        ['period=hours&zoom=0',     24, 'zoom below 1 falls back to 24'],
        ['period=hours&zoom=-5',    24, 'negative zoom falls back to 24'],
    ];

    foreach ($cases as [$query, $expected, $what]) {
        $r = request($seededDb, $query);
        if ($r === null) continue;
        assertSame($expected, $r['zoom'] ?? null, $what);
    }
});

test('an unknown period is rejected rather than silently defaulted', function () use ($seededDb) {
    $r = request($seededDb, 'period=fortnights&zoom=5');
    if ($r === null) return;

    assertSame([], $r['chartData'] ?? null, 'no chart data for an invalid period');
});

test('no parameters is an error, not an empty success', function () use ($seededDb) {
    $r = request($seededDb, '');
    if ($r === null) return;

    assertSame('Missing required parameters', $r['error'] ?? null, 'error message');
});

test('an empty database yields empty data, not an error', function () use ($emptyDb) {
    $r = request($emptyDb, 'period=hours&zoom=24');
    if ($r === null) return;

    assertSame([], $r['chartData'] ?? null, 'chartData is empty');
    assertSame(0, $r['stats']['totalEnergy'] ?? null, 'totalEnergy is zero');

    // Not `?? 'unset'`: the null coalescing operator cannot tell a null value
    // from an absent key, which is exactly the distinction under test.
    $peak = $r['stats']['peakPower'] ?? [];
    assertSame(true, array_key_exists('time', $peak), 'peakPower.time is present');
    assertSame(null, $peak['time'] ?? null, 'peakPower.time is null');
});

test('a missing database reproduces the live failure exactly', function () use ($missingDb) {
    // This is what the committed fixtures captured from the real installation.
    $r = request($missingDb, 'action=current');
    if ($r === null) return;

    assertSame('Database not available', $r['error'] ?? null, 'current reports the missing database');

    $hours = request($missingDb, 'period=hours&zoom=24');
    if ($hours === null) return;

    assertSame([], $hours['chartData'] ?? null, 'history degrades to empty chartData');
});

test('missing and empty databases are indistinguishable over the history API', function () use ($emptyDb, $missingDb) {
    // Worth pinning: it is why a broken installation looks like a quiet night.
    $fromEmpty   = request($emptyDb, 'period=hours&zoom=24');
    $fromMissing = request($missingDb, 'period=hours&zoom=24');

    if ($fromEmpty === null || $fromMissing === null) return;

    assertEquals($fromEmpty, $fromMissing, 'both produce an identical response');
});

test('the committed fixture matches what the API produces with no database', function () use ($missingDb) {
    $fixturePath = dirname(__DIR__) . '/tests/fixtures/solar/hours-24.json';

    if (!is_readable($fixturePath)) {
        fail('fixture not found at ' . $fixturePath);
        return;
    }

    $fixture = json_decode(file_get_contents($fixturePath), true);
    $live    = request($missingDb, 'period=hours&zoom=24');

    if ($live === null) return;

    assertEquals($fixture, $live, 'fixture reproduces byte-for-byte in structure');
});

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------

echo "\n" . str_repeat('-', 78) . "\n";
printf("%d passed, %d failed\n", $passed, $failed);

if ($failures) {
    echo "\nFailures:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
}

if ($keep) {
    echo "\nDatabases kept in $tmpDir\n";
} else {
    foreach (glob($tmpDir . '/*.db') as $f) {
        unlink($f);
    }
}

exit($failed === 0 ? 0 : 1);
