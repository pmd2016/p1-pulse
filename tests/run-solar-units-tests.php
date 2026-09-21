#!/usr/bin/env php
<?php
/**
 * SolarUnits test harness
 *
 * Pins the conversion from Solplanet's declared units to the base units the
 * database stores. The expected values are taken from a real getPlantOverview
 * response, recorded below, so a regression here is measurable against
 * something that actually happened rather than an invented example.
 *
 * Usage: php tests/run-solar-units-tests.php
 */

require_once __DIR__ . '/assert.php';
require_once dirname(__DIR__) . '/lib/SolarUnits.php';

echo "SolarUnits harness\n";
echo str_repeat('=', 78) . "\n\n";

/**
 * Verbatim from a live response, 2026-09-21 13:10. Note the non-SI spellings:
 * "KW" and "KWh" with a capital K, and "KWh" with a capital W.
 */
$liveResponse = [
    'E-Today' => ['unit' => 'KWh', 'value' => 12],
    'E-Month' => ['unit' => 'KWh', 'value' => 239.78],
    'E-Total' => ['unit' => 'MWh', 'value' => 39.09],
    'E-Year'  => ['unit' => 'MWh', 'value' => 3.24],
    'Power'   => ['unit' => 'KW',  'value' => 1.22],
];

test('the live response converts to the units the database stores', function () use ($liveResponse) {
    // The bug: "KW" was read as though it were watts, and (int)1.22 truncated
    // to 1. Every stored power reading was 1000x low and lost its fraction.
    assertSame(1220, SolarUnits::toWatts(
        $liveResponse['Power']['value'], $liveResponse['Power']['unit']
    ), 'Power 1.22 KW -> 1220 W');

    assertSame(12000, SolarUnits::toWattHours(
        $liveResponse['E-Today']['value'], $liveResponse['E-Today']['unit']
    ), 'E-Today 12 KWh -> 12000 Wh');

    assertSame(239780, SolarUnits::toWattHours(
        $liveResponse['E-Month']['value'], $liveResponse['E-Month']['unit']
    ), 'E-Month 239.78 KWh -> 239780 Wh');

    assertSame(39090000, SolarUnits::toWattHours(
        $liveResponse['E-Total']['value'], $liveResponse['E-Total']['unit']
    ), 'E-Total 39.09 MWh -> 39090000 Wh');

    assertSame(3240000, SolarUnits::toWattHours(
        $liveResponse['E-Year']['value'], $liveResponse['E-Year']['unit']
    ), 'E-Year 3.24 MWh -> 3240000 Wh');
});

test('units are matched regardless of capitalisation or padding', function () {
    // Solplanet sends "KW" and "KWh"; neither is the SI spelling, and there is
    // no guarantee the capitalisation is stable.
    foreach (['KW', 'kW', 'kw', 'Kw', ' KW '] as $unit) {
        assertSame(1220, SolarUnits::toWatts(1.22, $unit), "power unit '$unit'");
    }

    foreach (['KWh', 'kWh', 'kwh', 'KWH'] as $unit) {
        assertSame(12000, SolarUnits::toWattHours(12, $unit), "energy unit '$unit'");
    }
});

test('every supported unit scales correctly', function () {
    assertSame(1500, SolarUnits::toWatts(1500, 'W'), 'W is the base power unit');
    assertSame(1500, SolarUnits::toWatts(1.5, 'kW'), 'kW scales by 1000');
    assertSame(1500000, SolarUnits::toWatts(1.5, 'MW'), 'MW scales by a million');

    assertSame(250, SolarUnits::toWattHours(250, 'Wh'), 'Wh is the base energy unit');
    assertSame(2500, SolarUnits::toWattHours(2.5, 'kWh'), 'kWh scales by 1000');
    assertSame(2500000, SolarUnits::toWattHours(2.5, 'MWh'), 'MWh scales by a million');
});

test('power and energy units are not interchangeable', function () {
    // kWh is not a power unit and kW is not an energy unit. Accepting either
    // would reintroduce exactly the confusion this class exists to remove.
    assertSame(null, SolarUnits::toWatts(1.22, 'kWh'), 'kWh rejected as power');
    assertSame(null, SolarUnits::toWattHours(1.22, 'kW'), 'kW rejected as energy');
});

test('an unrecognised or missing unit is refused, never assumed', function () {
    // Returning null forces the caller to fail loudly. Defaulting to a
    // multiplier of 1 is what produced months of silently wrong aggregates.
    foreach (['', 'kWp', 'joules', 'T', "\u{20AC}", 'null'] as $unit) {
        assertSame(null, SolarUnits::toWattHours(10, $unit), "energy unit '$unit' refused");
    }

    assertSame(null, SolarUnits::toWatts(10, null), 'null unit refused');
    assertSame(null, SolarUnits::toWatts(10, []), 'array unit refused');
});

test('a non-numeric value is refused', function () {
    foreach (['', 'n/a', null, [], 'twelve'] as $value) {
        assertSame(null, SolarUnits::toWatts($value, 'kW'),
            'value ' . render($value) . ' refused');
    }
});

test('numeric strings are accepted, since JSON numbers may arrive quoted', function () {
    assertSame(1220, SolarUnits::toWatts('1.22', 'KW'), 'string "1.22" KW');
    assertSame(12000, SolarUnits::toWattHours('12', 'KWh'), 'string "12" KWh');
});

test('conversion rounds rather than truncates', function () {
    // (int) truncation is half the original bug: it discarded the fraction on
    // every reading, not just the ones with the wrong multiplier.
    assertSame(1226, SolarUnits::toWatts(1.2255, 'kW'), '1.2255 kW rounds to 1226 W');
    assertSame(1, SolarUnits::toWatts(0.9, 'W'), '0.9 W rounds to 1, not 0');
    assertSame(0, SolarUnits::toWatts(0.4, 'W'), '0.4 W rounds to 0');
});

test('zero and negative readings survive', function () {
    // Night-time readings are legitimately zero; some inverters report a small
    // negative draw. Neither should be mistaken for a conversion failure.
    assertSame(0, SolarUnits::toWatts(0, 'kW'), 'zero converts to zero, not null');
    assertSame(-50, SolarUnits::toWatts(-0.05, 'kW'), 'negative power preserved');
});

exit(testSummary());
