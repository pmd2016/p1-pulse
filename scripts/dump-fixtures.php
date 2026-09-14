#!/usr/bin/env php
<?php
/**
 * API Fixture Dumper
 *
 * Captures representative responses from the P1 Monitor API and the custom solar
 * API into tests/fixtures/, so the data-shaping code can be exercised off-device.
 *
 * Run this ON the P1 Monitor host (the P1 Monitor API is only reachable there).
 *
 * Usage:
 *   php dump-fixtures.php                          # dump real values
 *   php dump-fixtures.php --anonymise              # shift dates, scale measurements
 *   php dump-fixtures.php --anonymise=0.73         # ... with an explicit scale factor
 *   php dump-fixtures.php --anonymise --epoch=2025-06-01
 *   php dump-fixtures.php --base=http://192.168.1.5
 *   php dump-fixtures.php --only=solar --verbose
 *   php dump-fixtures.php --dry-run
 *
 * Privacy: raw output contains your real meter readings and half-hourly consumption.
 * That is an occupancy signal. Use --anonymise for anything you intend to commit to
 * a public repository. See the warning this script prints, and tests/fixtures/README.md.
 */

define('SCRIPT_VERSION', '1.0.0');
define('DEFAULT_BASE', 'http://localhost');
define('DEFAULT_OUT', dirname(__DIR__) . '/tests/fixtures');
define('DEFAULT_FACTOR', 0.8317);
define('DEFAULT_EPOCH', '2026-01-15');
define('HTTP_TIMEOUT', 20);

// ----------------------------------------------------------------------------
// Endpoint catalogue
// ----------------------------------------------------------------------------

/**
 * P1 Monitor endpoints. Limits mirror what the UI actually requests.
 * json=object is appended to every one of these, matching P1API.fetch().
 */
$P1_ENDPOINTS = [
    'p1/smartmeter'       => '/api/v1/smartmeter?limit=60',
    'p1/status'           => '/api/v1/status',
    'p1/configuration'    => '/api/v1/configuration',
    'p1/powergas-hour'    => '/api/v1/powergas/hour?limit=24',
    'p1/powergas-day'     => '/api/v1/powergas/day?limit=7',
    'p1/powergas-month'   => '/api/v1/powergas/month?limit=12',
    'p1/powergas-year'    => '/api/v1/powergas/year?limit=5',
    'p1/financial-day'    => '/api/v1/financial/day?limit=7',
    'p1/financial-month'  => '/api/v1/financial/month?limit=12',
    'p1/financial-year'   => '/api/v1/financial/year?limit=5',
    'p1/weather-current'  => '/api/v1/weather',
    'p1/weather-hour'     => '/api/v1/weather/hour?limit=24',
    'p1/weather-day'      => '/api/v1/weather/day?limit=7',
    'p1/weather-month'    => '/api/v1/weather/month?limit=12',
    'p1/weather-year'     => '/api/v1/weather/year?limit=5',
    'p1/watermeter-day'   => '/api/v2/watermeter/day?limit=7',
    'p1/watermeter-month' => '/api/v2/watermeter/month?limit=12',
];

/** Custom solar endpoints. These do not take json=object. */
$SOLAR_ENDPOINTS = [
    'solar/current'   => '/custom/api/solar.php?action=current',
    'solar/hours-24'  => '/custom/api/solar.php?period=hours&zoom=24',
    'solar/hours-72'  => '/custom/api/solar.php?period=hours&zoom=72',
    'solar/days-7'    => '/custom/api/solar.php?period=days&zoom=7',
    'solar/days-30'   => '/custom/api/solar.php?period=days&zoom=30',
    'solar/months-12' => '/custom/api/solar.php?period=months&zoom=12',
    'solar/years-5'   => '/custom/api/solar.php?period=years&zoom=5',
];

// ----------------------------------------------------------------------------
// Anonymisation rules
// ----------------------------------------------------------------------------

/** Keys holding a unix timestamp that should be shifted. */
$UNIX_TIME_KEYS = [
    'TIMESTAMP_UTC', 'unixTimestamp', 'power_peak_time', 'timestamp',
    'collected_at', 'aggregated_at', 'cached_at', 'expires_at', 'updated_at',
];

/** Keys holding a date/datetime string that should be shifted. */
$DATE_STRING_KEYS = ['TIMESTAMP_lOCAL', 'TIMESTAMP_LOCAL', 'timestamp', 'date', 'time'];

/**
 * Keys never scaled: counts, durations, identifiers and enumerations, none of
 * which vary proportionally with production.
 *
 * Note that capacity factor is deliberately NOT in this list: it is
 * totalEnergy / (capacity x hours), so it scales linearly with the energy
 * values and must move with them or the fixture contradicts itself.
 */
$NEVER_SCALE = [
    'samples', 'daysWithData', 'monthsWithData',
    'sunlightHours', 'hours_sunlight', 'TARIFCODE', 'STATUS_ID', 'CONFIGURATION_ID',
    'RECORD_IS_PROCESSED', 'SECURITY', 'inverterStatus', 'inverter_status', 'status',
    'id', 'zoom', 'limit', 'period', 'unit', 'dataunit', 'LABEL', 'PARAMETER',
];

/** Substrings marking a key as weather data, which is not personal and stays intact. */
$WEATHER_KEY_HINTS = ['TEMPERATURE', 'HUMIDITY', 'PRESSURE', 'WIND', 'RAIN', 'SNOW', 'CLOUD', 'temp'];

/** A key matching this is a measurement to scale. */
define('MEASURE_PATTERN', '/(_KWH|_WH|_M3|_W$|^power|_power|power_|Power|energy|Energy|production|Production|consumption|Consumption|COST|REVENU|gas$|Gas|water$|Water|avgDaily|avgMonthly|avgYearly|peak|net$|capacityFactor|capacity_factor)/');

// ----------------------------------------------------------------------------
// Arguments
// ----------------------------------------------------------------------------

$options = getopt('', ['base::', 'out::', 'only::', 'anonymise::', 'anonymize::', 'epoch::',
                      'verbose', 'dry-run', 'help']);

if (isset($options['help'])) {
    $version = SCRIPT_VERSION;
    echo <<<HELP
API Fixture Dumper (v$version)

Usage:
  php dump-fixtures.php [options]

Options:
  --base=URL        P1 Monitor base URL (default: http://localhost)
  --out=DIR         Output directory (default: <repo>/tests/fixtures)
  --only=PREFIX     Only dump fixtures whose name starts with PREFIX (e.g. solar, p1/weather)
  --anonymise[=F]   Shift dates and scale measurements by factor F (default: 0.8317)
  --epoch=DATE      With --anonymise, shift dates so today lands on DATE
                    (default: 2026-01-15). Whole days only, so time-of-day
                    and weekday are preserved.
  --verbose         Print each response summary
  --dry-run         Fetch and report, but write nothing
  --help            Show this help

Privacy:
  Without --anonymise the output contains your real meter readings and hourly
  consumption pattern. Do not commit that to a public repository.

HELP;
    exit(0);
}

/**
 * Read an optional-value long option. getopt() yields false for a bare flag
 * such as `--only`, which must not be mistaken for a supplied value.
 */
function optValue(array $options, $name, $default = null) {
    if (!array_key_exists($name, $options)) {
        return $default;
    }
    $value = $options[$name];
    return (is_string($value) && $value !== '') ? $value : $default;
}

$baseUrl   = rtrim(optValue($options, 'base', DEFAULT_BASE), '/');
$outDir    = rtrim(optValue($options, 'out', DEFAULT_OUT), '/');
$only      = optValue($options, 'only');
$verbose   = isset($options['verbose']);
$dryRun    = isset($options['dry-run']);

$anonKey   = array_key_exists('anonymise', $options) ? 'anonymise'
           : (array_key_exists('anonymize', $options) ? 'anonymize' : null);
$anonymise = $anonKey !== null;
$factor    = DEFAULT_FACTOR;

if ($anonymise) {
    $supplied = optValue($options, $anonKey);
    if ($supplied !== null) {
        if (!is_numeric($supplied) || (float)$supplied <= 0) {
            fwrite(STDERR, "ERROR: --anonymise factor must be a number greater than 0\n");
            exit(1);
        }
        $factor = (float)$supplied;
    }
}

// Shift dates by a whole number of days, so time-of-day and weekday survive while
// the absolute dates do not. The same offset is applied to every fixture, keeping
// them aligned with each other.
$dayOffset = 0;

if ($anonymise) {
    $epoch = optValue($options, 'epoch', DEFAULT_EPOCH);
    $epochTs = strtotime($epoch);

    if ($epochTs === false) {
        fwrite(STDERR, "ERROR: --epoch must be a date PHP can parse, e.g. 2026-01-15\n");
        exit(1);
    }

    $dayOffset = -((int)round((time() - $epochTs) / 86400)) * 86400;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function out($message, $always = true) {
    global $verbose;
    if ($always || $verbose) {
        echo $message . "\n";
    }
}

/**
 * Fetch a URL, capturing non-200 responses rather than throwing.
 *
 * @return array{status:int, body:?string, error:?string}
 */
function httpGet($url) {
    $context = stream_context_create([
        'http' => [
            'method'        => 'GET',
            'header'        => "Accept: application/json\r\nUser-Agent: p1-pulse-fixture-dumper/" . SCRIPT_VERSION,
            'timeout'       => HTTP_TIMEOUT,
            'ignore_errors' => true,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);

    if ($body === false) {
        $err = error_get_last();
        return ['status' => 0, 'body' => null, 'error' => $err['message'] ?? 'connection failed'];
    }

    $status = 0;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $header) {
            if (preg_match('#HTTP/[0-9.]+\s+([0-9]+)#', $header, $m)) {
                $status = (int)$m[1];
                break;
            }
        }
    }

    return ['status' => $status, 'body' => $body, 'error' => null];
}

/**
 * True if the array is a zero-indexed list.
 * array_is_list() is PHP 8.1+; this project targets 7.4.
 */
function isList($value) {
    if (!is_array($value)) {
        return false;
    }
    return $value === [] || array_keys($value) === range(0, count($value) - 1);
}

/** True if the key names weather data, which is left untouched. */
function isWeatherKey($key) {
    global $WEATHER_KEY_HINTS;
    foreach ($WEATHER_KEY_HINTS as $hint) {
        if (stripos($key, $hint) !== false) {
            return true;
        }
    }
    return false;
}

/** True if the value under this key is a measurement that should be scaled. */
function isMeasureKey($key) {
    global $NEVER_SCALE;
    if (in_array($key, $NEVER_SCALE, true) || isWeatherKey($key)) {
        return false;
    }
    return (bool)preg_match(MEASURE_PATTERN, $key);
}

/** Shift a date string, preserving its original format. */
function shiftDateString($value, $offset) {
    $len = strlen($value);
    $formats = [19 => 'Y-m-d H:i:s', 10 => 'Y-m-d', 7 => 'Y-m', 4 => 'Y'];

    if (!isset($formats[$len])) {
        return $value;
    }

    // 'Y' alone is ambiguous with a plain number; only treat 1900-2100 as a year.
    if ($len === 4 && ((int)$value < 1900 || (int)$value > 2100)) {
        return $value;
    }

    $ts = strtotime($value);
    if ($ts === false) {
        return $value;
    }

    return date($formats[$len], $ts + $offset);
}

/**
 * Recursively shift timestamps and scale measurements.
 *
 * A single multiplicative factor is used throughout, so internal consistency is
 * preserved: sums still equal the sum of their parts, and any ratio discrepancy
 * between two series (such as the backfill issue) remains visible.
 *
 * @param mixed $node        Decoded JSON node
 * @param int   $offset      Seconds to shift timestamps by
 * @param float $factor      Multiplier for measurements
 * @param bool  $inMeasure   True when the parent key was itself a measurement
 */
function anonymiseNode($node, $offset, $factor, $inMeasure = false) {
    global $UNIX_TIME_KEYS, $DATE_STRING_KEYS;

    if (!is_array($node)) {
        return $node;
    }

    $result = [];

    foreach ($node as $key => $value) {
        // Preserve list indices untouched, but recurse into their contents.
        if (is_int($key)) {
            $result[$key] = anonymiseNode($value, $offset, $factor, $inMeasure);
            continue;
        }

        if (is_array($value)) {
            $result[$key] = anonymiseNode($value, $offset, $factor, isMeasureKey($key));
            continue;
        }

        // Unix timestamps
        if (in_array($key, $UNIX_TIME_KEYS, true) && is_numeric($value) && (int)$value > 1000000000) {
            $result[$key] = is_string($value) ? (string)((int)$value + $offset) : (int)$value + $offset;
            continue;
        }

        // Date/datetime strings
        if (in_array($key, $DATE_STRING_KEYS, true) && is_string($value)) {
            $result[$key] = shiftDateString($value, $offset);
            continue;
        }

        // A 'value' directly under a measurement key (e.g. peakPower.value)
        $scale = isMeasureKey($key) || ($inMeasure && $key === 'value');

        if ($scale && is_numeric($value)) {
            $scaled = (float)$value * $factor;
            if (is_int($value)) {
                $result[$key] = (int)round($scaled);
            } elseif (is_string($value)) {
                $decimals = strlen(substr(strrchr($value, '.') ?: '', 1));
                $result[$key] = number_format($scaled, $decimals, '.', '');
            } else {
                $result[$key] = round($scaled, 6);
            }
            continue;
        }

        $result[$key] = $value;
    }

    return $result;
}

/** Write a fixture file, creating parent directories as needed. */
function writeFixture($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException("Could not create directory: $dir");
    }

    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('json_encode failed: ' . json_last_error_msg());
    }

    if (file_put_contents($path, $json . "\n") === false) {
        throw new RuntimeException("Could not write: $path");
    }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

echo "================================================================================\n";
echo "P1 PULSE FIXTURE DUMP\n";
echo "================================================================================\n\n";
echo "Base URL:   $baseUrl\n";
echo "Output:     $outDir\n";
echo "Anonymise:  " . ($anonymise
        ? sprintf('yes (factor %.4f, dates shifted %+d days)', $factor, $dayOffset / 86400)
        : 'no') . "\n";
if ($only)   echo "Filter:     $only\n";
if ($dryRun) echo "Mode:       DRY RUN (nothing will be written)\n";
echo "\n";

if (!$anonymise) {
    echo "  ! Raw mode: output will contain real meter readings and your hourly\n";
    echo "  ! consumption pattern, which reveals when the house is occupied.\n";
    echo "  ! Do not commit this to a public repository. Use --anonymise instead.\n\n";
}

// Build the work list
$targets = [];
foreach ($P1_ENDPOINTS as $name => $path) {
    $targets[$name] = $baseUrl . $path . (strpos($path, '?') !== false ? '&' : '?') . 'json=object';
}
foreach ($SOLAR_ENDPOINTS as $name => $path) {
    $targets[$name] = $baseUrl . $path;
}

if ($only !== null) {
    $targets = array_filter(
        $targets,
        fn($name) => strpos($name, $only) === 0,
        ARRAY_FILTER_USE_KEY
    );

    if (!$targets) {
        fwrite(STDERR, "ERROR: no fixtures match --only=$only\n");
        exit(1);
    }
}

$manifest = [
    'generated_at'   => date('c'),
    'script_version' => SCRIPT_VERSION,
    'php_version'    => PHP_VERSION,
    // Redacted when anonymising: --base may carry a LAN address.
    'base_url'       => $anonymise ? null : $baseUrl,
    'anonymised'     => $anonymise,
    'scale_factor'   => $anonymise ? $factor : null,
    'date_offset_s'  => $anonymise ? $dayOffset : 0,
    'fixtures'       => [],
];

$ok = 0;
$failed = 0;

foreach ($targets as $name => $url) {
    $result = httpGet($url);

    // Strip the base URL so the manifest does not record a LAN address.
    $entry = [
        'endpoint' => substr($url, strlen($baseUrl)),
        'status'   => $result['status'],
        'ok'       => false,
        'records'  => null,
        'bytes'    => $result['body'] !== null ? strlen($result['body']) : 0,
        'error'    => $result['error'],
    ];

    if ($result['error'] !== null) {
        $failed++;
        out(sprintf('  ✗ %-22s connection failed: %s', $name, $result['error']));
        $manifest['fixtures'][$name] = $entry;
        continue;
    }

    if ($result['status'] !== 200) {
        $failed++;
        $entry['error'] = 'HTTP ' . $result['status'];
        out(sprintf('  ✗ %-22s HTTP %d', $name, $result['status']));
        $manifest['fixtures'][$name] = $entry;
        continue;
    }

    $decoded = json_decode($result['body'], true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        $failed++;
        $entry['error'] = 'invalid JSON: ' . json_last_error_msg();
        $entry['body_preview'] = substr($result['body'], 0, 200);
        out(sprintf('  ✗ %-22s invalid JSON (%s)', $name, json_last_error_msg()));
        $manifest['fixtures'][$name] = $entry;
        continue;
    }

    if ($anonymise) {
        $decoded = anonymiseNode($decoded, $dayOffset, $factor);
    }

    $entry['ok'] = true;
    $entry['records'] = isList($decoded)
        ? count($decoded)
        : (isset($decoded['chartData']) && is_array($decoded['chartData']) ? count($decoded['chartData']) : null);

    if (!$dryRun) {
        try {
            writeFixture("$outDir/$name.json", $decoded);
        } catch (RuntimeException $e) {
            $failed++;
            $entry['ok'] = false;
            $entry['error'] = $e->getMessage();
            out(sprintf('  ✗ %-22s %s', $name, $e->getMessage()));
            $manifest['fixtures'][$name] = $entry;
            continue;
        }
    }

    $ok++;
    $records = $entry['records'] !== null ? $entry['records'] . ' records' : 'object';
    out(sprintf('  ✓ %-22s %s, %s', $name, $records, number_format($entry['bytes']) . ' bytes'));
    $manifest['fixtures'][$name] = $entry;
}

if (!$dryRun) {
    try {
        writeFixture("$outDir/manifest.json", $manifest);
    } catch (RuntimeException $e) {
        fwrite(STDERR, "ERROR: could not write manifest: " . $e->getMessage() . "\n");
        exit(1);
    }
}

echo "\n--------------------------------------------------------------------------------\n";
echo sprintf("Captured %d of %d fixtures (%d failed)\n", $ok, count($targets), $failed);

if ($failed > 0) {
    echo "\nFailures are recorded in manifest.json. An empty or 404 watermeter fixture is\n";
    echo "expected when no water meter is installed; treat other failures as real.\n";
}

if (!$dryRun) {
    echo "\nWritten to: $outDir\n";
}

exit($ok > 0 ? 0 : 1);
