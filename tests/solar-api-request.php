#!/usr/bin/env php
<?php
/**
 * Invokes api/solar.php in an isolated process against a chosen database.
 *
 * Run in its own process per request because api/solar.php declares functions
 * and constants at file scope, so it can only be included once per process.
 *
 * Usage: php solar-api-request.php <db-path> <query-string> [capacity-w]
 */

if ($argc < 3) {
    fwrite(STDERR, "Usage: php solar-api-request.php <db-path> <query-string> [capacity-w]\n");
    exit(2);
}

define('SOLAR_DB_PATH', $argv[1]);
define('SYSTEM_CAPACITY_W', isset($argv[3]) ? (int)$argv[3] : 3780);

parse_str($argv[2], $_GET);

require __DIR__ . '/../api/solar.php';
