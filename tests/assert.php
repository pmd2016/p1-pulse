<?php
/**
 * Minimal assertion helpers shared by the test runners.
 *
 * The project has no package manager and no dependencies, so there is no test
 * framework here either. Include this, call test() with assertions inside, and
 * finish with testSummary() to print the result and get an exit code.
 */

if (!defined('EPSILON')) {
    define('EPSILON', 0.0001);
}

$GLOBALS['t_passed']   = 0;
$GLOBALS['t_failed']   = 0;
$GLOBALS['t_failures'] = [];
$GLOBALS['t_current']  = '(none)';

function test($name, callable $body) {
    $GLOBALS['t_current'] = $name;
    echo "  $name\n";

    try {
        $body();
    } catch (Throwable $e) {
        fail('threw ' . get_class($e) . ': ' . $e->getMessage());
    }
}

function pass($detail) {
    $GLOBALS['t_passed']++;
    echo "    ok    $detail\n";
}

function fail($detail) {
    $GLOBALS['t_failed']++;
    $GLOBALS['t_failures'][] = $GLOBALS['t_current'] . ": $detail";
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

/**
 * Print the tally and return the exit code the runner should use.
 */
function testSummary() {
    echo "\n" . str_repeat('-', 78) . "\n";
    printf("%d passed, %d failed\n", $GLOBALS['t_passed'], $GLOBALS['t_failed']);

    if ($GLOBALS['t_failures']) {
        echo "\nFailures:\n";
        foreach ($GLOBALS['t_failures'] as $f) {
            echo "  - $f\n";
        }
    }

    return $GLOBALS['t_failed'] === 0 ? 0 : 1;
}
