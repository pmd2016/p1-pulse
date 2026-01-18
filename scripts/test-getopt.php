#!/usr/bin/env php
<?php
echo "Testing command line argument parsing:\n\n";

$options = getopt('', ['days:', 'start:', 'end:', 'verbose', 'dry-run', 'force', 'help']);

echo "Parsed options:\n";
print_r($options);

echo "\nChecking flags:\n";
echo "verbose: " . (isset($options['verbose']) ? 'YES' : 'NO') . "\n";
echo "dry-run: " . (isset($options['dry-run']) ? 'YES' : 'NO') . "\n";
echo "force: " . (isset($options['force']) ? 'YES' : 'NO') . "\n";
echo "days: " . (isset($options['days']) ? $options['days'] : 'NOT SET') . "\n";

$force = isset($options['force']);
echo "\n\$force variable: " . ($force ? 'true' : 'false') . "\n";

if (!$force) {
    echo "Would check for existing data (force is false)\n";
} else {
    echo "Would skip existence check (force is true)\n";
}