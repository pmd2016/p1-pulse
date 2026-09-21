#!/usr/bin/env php
<?php
/**
 * Run every test suite. Exits non-zero if any of them fail.
 *
 * Usage: php tests/run-all.php
 */

$suites = [
    'run-solar-units-tests.php',
    'run-solar-collector-tests.php',
    'run-solar-api-tests.php',
];

$failed = [];

foreach ($suites as $suite) {
    $path = __DIR__ . '/' . $suite;

    if (!is_readable($path)) {
        fwrite(STDERR, "ERROR: suite not found: $path\n");
        exit(2);
    }

    passthru(sprintf('php %s', escapeshellarg($path)), $status);
    echo "\n";

    if ($status !== 0) {
        $failed[] = $suite;
    }
}

echo str_repeat('=', 78) . "\n";

if ($failed) {
    printf("FAILED: %s\n", implode(', ', $failed));
    exit(1);
}

printf("All %d suites passed\n", count($suites));
exit(0);
