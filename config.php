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

// Configuration settings
class P1Config {
    
    // Get P1 Monitor configuration value
    public static function get($key) {
        if (function_exists('config_read')) {
            return config_read($key);
        }
        return null;
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
            'hide_water' => self::get(157) == 1,
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
}

// Helper function to render a page
function renderPage($page, $data = []) {
    // Make data available to included files
    extract($data);
    
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
    $cssFiles = ['variables', 'base', 'components', 'layout'];
    foreach ($cssFiles as $file) {
        echo "<link rel='stylesheet' href='" . CUSTOM_BASE_URL . "/assets/css/{$file}.css'>\n";
    }
}

// Helper function to include JS files
function includeJS() {
    $jsFiles = ['theme', 'sidebar', 'api', 'header', 'charts'];
    foreach ($jsFiles as $file) {
        echo "<script src='" . CUSTOM_BASE_URL . "/assets/js/{$file}.js'></script>\n";
    }
}
?>