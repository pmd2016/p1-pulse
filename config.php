<?php
/**
 * P1 Monitor Custom UI Configuration
 * Central configuration file for the custom interface
 */

// Start session for user preferences
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Include P1 Monitor utilities if available
if (file_exists('/p1mon/www/util/p1mon-util.php')) {
    include_once '/p1mon/www/util/p1mon-util.php';
}

// Define base paths
define('CUSTOM_BASE_PATH', dirname(__FILE__));
define('CUSTOM_BASE_URL', '/custom');

require_once CUSTOM_BASE_PATH . '/components/icon.php';
require_once CUSTOM_BASE_PATH . '/components/section.php';
require_once CUSTOM_BASE_PATH . '/components/nav.php';
require_once CUSTOM_BASE_PATH . '/components/tariffs.php';

// Configuration settings
class P1Config {
    
    // The configuration ids this UI reads; only these are fetched and cached
    const CONFIG_IDS = [1, 2, 3, 4, 5, 15, 16, 52, 53, 61, 96, 103, 104, 154, 158, 204, 205, 206, 208];

    // Seconds a configuration read from the API stays in the session
    const CONFIG_TTL = 300;

    // Get P1 Monitor configuration value, or null when it cannot be read.
    // config_read() is used when P1 Monitor's PHP provides it; otherwise the
    // value comes from P1 Monitor's own API (/api/v1/configuration).
    public static function get($key) {
        if (function_exists('config_read')) {
            $value = config_read($key);
            if ($value !== null && $value !== false) {
                return $value;
            }
        }
        return self::fromApi()[(int)$key] ?? null;
    }

    // Where the configuration came from: 'config_read', 'api' or null
    public static function source() {
        if (function_exists('config_read')) {
            $value = config_read(0);
            if ($value !== null && $value !== false) {
                return 'config_read';
            }
        }
        return self::fromApi() ? 'api' : null;
    }

    // [id => value] from P1 Monitor's API, [] when unreachable. Fetched at
    // most once per request and cached in the session, failures included, so
    // an unreachable API does not slow down every page.
    private static function fromApi() {
        static $values = null;
        if ($values !== null) {
            return $values;
        }

        $cached = $_SESSION['p1_config_cache'] ?? null;
        if (is_array($cached) && time() - ($cached['at'] ?? 0) < self::CONFIG_TTL) {
            return $values = $cached['values'];
        }

        $values = [];
        foreach (self::apiUrls() as $url) {
            $rows = self::fetchJson($url);
            if (!is_array($rows)) {
                continue;
            }
            foreach ($rows as $row) {
                $id = (int)($row['CONFIGURATION_ID'] ?? -1);
                if (in_array($id, self::CONFIG_IDS, true)) {
                    $values[$id] = $row['PARAMETER'] ?? null;
                }
            }
            if ($values) {
                break;
            }
        }

        $_SESSION['p1_config_cache'] = ['at' => time(), 'values' => $values];
        return $values;
    }

    // Loopback first; then the host this page was requested on
    private static function apiUrls() {
        $path = '/api/v1/configuration?json=object';
        $urls = ['http://127.0.0.1' . $path];
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if ($host !== '' && preg_match('/^[A-Za-z0-9.\-:\[\]]+$/', $host)) {
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $urls[] = $scheme . '://' . $host . $path;
        }
        return array_unique($urls);
    }

    private static function fetchJson($url) {
        $context = stream_context_create(['http' => [
            'timeout' => 2,
            'header'  => "Accept: application/json\r\n",
            'ignore_errors' => true,
        ]]);
        $body = @file_get_contents($url, false, $context);
        if ($body === false) {
            return null;
        }
        $data = json_decode($body, true);
        return is_array($data) ? $data : null;
    }
    
    // User preferences with defaults
    public static function getUserPrefs() {
        if (!isset($_SESSION['p1_prefs'])) {
            $_SESSION['p1_prefs'] = [
                'theme' => 'dark',
                'sidebar_collapsed' => false,
                'default_page' => 'dashboard',
                'update_interval' => 10
            ];
        }
        return $_SESSION['p1_prefs'];
    }
    
    // Save user preference
    public static function setUserPref($key, $value) {
        $prefs = self::getUserPrefs();
        $prefs[$key] = $value;
        $_SESSION['p1_prefs'] = $prefs;
        return true;
    }
    
    // Get UI visibility settings from P1 Monitor config
    public static function getVisibility() {
        return [
            'hide_gas' => self::get(158) == 1,
            'hide_water' => self::get(96) == 0,
            'hide_peak_kw' => self::get(206) == 1,
            'show_phase_info' => self::get(61) == 1
        ];
    }
    
    // Get gauge max values
    public static function getMaxValues() {
        return [
            'consumption' => self::get(52) ?: 10,
            'production' => self::get(53) ?: 10
        ];
    }
    
    // Check if fast telegram mode is enabled
    public static function isFastMode() {
        return self::get(154) == 1;
    }

    // Read a positive number from P1 Monitor's configuration, or null
    private static function tariff($id) {
        $value = self::get($id);
        return is_numeric($value) && (float)$value > 0 ? (float)$value : null;
    }

    // Average of two tariffs (dal/piek); either may be missing
    private static function averageTariff($lowId, $highId) {
        $values = array_filter([self::tariff($lowId), self::tariff($highId)], fn($v) => $v !== null);
        return $values ? array_sum($values) / count($values) : null;
    }

    // Read a number (zero included) from P1 Monitor's configuration, or null
    private static function amount($id) {
        $value = self::get($id);
        return is_numeric($value) ? (float)$value : null;
    }

    // Everything cost-related in P1 Monitor's configuration, for display.
    // Unlike getEnergyConfig() there are no defaults: null means not set,
    // or P1 Monitor is not reachable.
    public static function getTariffOverview() {
        return [
            // False when neither config_read() nor the API gave anything
            'available' => self::source() !== null,
            // Config 204: 0 = fixed tariffs, 1 = dynamic (hourly) prices
            'dynamic' => self::get(204) == 1,
            'electricity' => [
                'import_high' => self::amount(2),   // verbruik piek/dag
                'import_low'  => self::amount(1),   // verbruik dal/nacht
                'export_high' => self::amount(4),   // geleverd piek/dag
                'export_low'  => self::amount(3),   // geleverd dal/nacht
                'fixed'       => self::amount(5),   // vastrecht per maand
                'surcharge'   => self::amount(205), // opslag per kWh bij dynamisch
            ],
            'gas' => [
                'price'     => self::amount(15),
                'fixed'     => self::amount(16),
                'surcharge' => self::amount(208),   // opslag per m³ bij dynamisch
            ],
            'water' => [
                'price' => self::amount(104),
                'fixed' => self::amount(103),
            ],
        ];
    }

    // Get energy configuration values
    // Tariffs come from P1 Monitor's own configuration (the same values its
    // financial data is calculated with). The defaults below apply only when
    // P1 Monitor is not reachable (e.g. local development) or a tariff is unset.
    // Estimates average dal and piek because hourly data is not split by tariff.
    public static function getEnergyConfig() {
        return [
            // Solar system capacity in Watts (14 × 270Wp panels = 3780W)
            // Adjust this value to match your installation
            'system_capacity_w' => 3780,

            // Electricity bought, EUR per kWh (P1 Monitor config 1 = dal, 2 = piek)
            'electricity_cost_per_kwh' => self::averageTariff(1, 2) ?? 0.30,

            // Electricity delivered back, EUR per kWh (config 3 = dal, 4 = piek)
            'electricity_export_per_kwh' => self::averageTariff(3, 4) ?? 0.30,

            // Gas, EUR per m³ (config 15)
            'gas_cost_per_m3' => self::tariff(15) ?? 1.50,

            // Drinking water, EUR per m³ (config 104)
            'water_cost_per_m3' => self::tariff(104) ?? 0,
        ];
    }
}

// Helper function to render a page
function renderPage($page, $data = []) {
    // Make data available to included files
    extract($data, EXTR_SKIP);
    
    // Start output buffering
    ob_start();
    
    // Include components
    $headerPath = CUSTOM_BASE_PATH . '/components/header.php';
    $sidebarPath = CUSTOM_BASE_PATH . '/components/sidebar.php';
    $footerPath = CUSTOM_BASE_PATH . '/components/footer.php';
    $pagePath = CUSTOM_BASE_PATH . "/pages/{$page}.php";
    
    if (file_exists($headerPath)) {
        include $headerPath;
    } else {
        echo "<!-- Header file not found: $headerPath -->";
    }
    
    if (file_exists($sidebarPath)) {
        include $sidebarPath;
    } else {
        echo "<!-- Sidebar file not found: $sidebarPath -->";
    }
    
    // Include the requested page
    if (file_exists($pagePath)) {
        include $pagePath;
    } else {
        echo "<div class='error'>Page not found: {$page}</div>";
    }
    
    // Phone tab bar: after the page content, so it comes last in reading order
    include CUSTOM_BASE_PATH . '/components/bottom-nav.php';

    if (file_exists($footerPath)) {
        include $footerPath;
    } else {
        echo "<!-- Footer file not found: $footerPath -->";
    }
    
    // Return the buffered content
    return ob_get_clean();
}

// Helper function to include CSS files
function includeCSS() {
    $cssFiles = ['variables', 'base', 'layout', 'components', 'dashboard'];
    foreach ($cssFiles as $file) {
        echo "<link rel='stylesheet' href='" . CUSTOM_BASE_URL . "/assets/css/{$file}.css'>\n";
    }
}

// Helper function to include JS files
function includeJS() {
    $jsFiles = ['logger', 'theme', 'sidebar', 'api', 'header', 'utils'];
    foreach ($jsFiles as $file) {
        echo "<script src='" . CUSTOM_BASE_URL . "/assets/js/{$file}.js'></script>\n";
    }
}
?>