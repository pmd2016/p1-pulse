<?php
/**
 * Unit conversion for Solplanet API values.
 *
 * Every measurement in a Solplanet response carries its own unit alongside the
 * value:
 *
 *     "Power":   { "unit": "KW",  "value": 1.22  }
 *     "E-Today": { "unit": "KWh", "value": 12    }
 *     "E-Total": { "unit": "MWh", "value": 39.09 }
 *
 * Note that the units differ between fields of the same kind, and that the
 * spelling is not SI ("KW", "KWh" with a capital K, and "KWh" with a capital W).
 * Reading the declared unit is therefore the only reliable approach: hardcoding
 * a multiplier per field means guessing four times and getting a silent 1000x
 * error wherever a guess is wrong.
 *
 * Everything is normalised to the base units the database stores: watts for
 * power, watt-hours for energy.
 */

class SolarUnits {

    /** Power units, expressed as a multiplier to watts. */
    private static $power = [
        'w'  => 1,
        'kw' => 1000,
        'mw' => 1000000,
    ];

    /** Energy units, expressed as a multiplier to watt-hours. */
    private static $energy = [
        'wh'  => 1,
        'kwh' => 1000,
        'mwh' => 1000000,
    ];

    /**
     * Convert a power reading to watts.
     *
     * @param mixed  $value Numeric value as supplied by the API
     * @param string $unit  Declared unit, any capitalisation
     * @return int|null Watts, or null if the value or unit is not understood
     */
    public static function toWatts($value, $unit) {
        return self::convert($value, $unit, self::$power);
    }

    /**
     * Convert an energy reading to watt-hours.
     *
     * @param mixed  $value Numeric value as supplied by the API
     * @param string $unit  Declared unit, any capitalisation
     * @return int|null Watt-hours, or null if the value or unit is not understood
     */
    public static function toWattHours($value, $unit) {
        return self::convert($value, $unit, self::$energy);
    }

    /** Power units this class accepts, for error messages. */
    public static function knownPowerUnits() {
        return array_keys(self::$power);
    }

    /** Energy units this class accepts, for error messages. */
    public static function knownEnergyUnits() {
        return array_keys(self::$energy);
    }

    /**
     * Returning null rather than falling back to a multiplier of 1 is
     * deliberate. A wrong multiplier is indistinguishable from a quiet night
     * once it reaches the database, and silently corrupts every aggregate
     * derived from it; an unconvertible reading has to be refused so the
     * caller can fail loudly.
     */
    private static function convert($value, $unit, array $table) {
        if (!is_numeric($value)) {
            return null;
        }

        if (!is_string($unit) && !is_numeric($unit)) {
            return null;
        }

        $key = strtolower(trim((string)$unit));

        if (!isset($table[$key])) {
            return null;
        }

        return (int)round((float)$value * $table[$key]);
    }
}
