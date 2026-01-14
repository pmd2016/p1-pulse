<?php
/**
 * Solar Configuration Manager for P1 Monitor
 * Handles secure loading of Solplanet API credentials
 */

class SolarConfig {
    
    private static $config = null;
    private static $config_paths = [
        '/p1mon/config/solplanet.ini',           // Production location (outside web root)
        '/etc/p1mon/solplanet.ini',              // Alternative system location
        '/home/claude/solplanet.ini',            // Development location
        __DIR__ . '/../config/solplanet.ini',    // Relative to this file
    ];
    
    /**
     * Load configuration from file
     * Tries multiple locations in order of preference
     * 
     * @return array Configuration array
     * @throws Exception if config file not found or invalid
     */
    public static function load() {
        if (self::$config !== null) {
            return self::$config;
        }
        
        // Try environment variables first (highest priority)
        if (self::loadFromEnvironment()) {
            return self::$config;
        }
        
        // Try config files
        foreach (self::$config_paths as $path) {
            if (file_exists($path) && is_readable($path)) {
                $ini = parse_ini_file($path, true);
                if ($ini && isset($ini['solplanet'])) {
                    self::$config = $ini['solplanet'];
                    
                    // Validate required fields
                    if (self::validate()) {
                        return self::$config;
                    }
                }
            }
        }
        
        throw new Exception('Solplanet configuration not found or invalid. Please create /p1mon/config/solplanet.ini');
    }
    
    /**
     * Try to load credentials from environment variables
     * 
     * @return bool True if successfully loaded from environment
     */
    private static function loadFromEnvironment() {
        $required = ['SOLPLANET_APP_KEY', 'SOLPLANET_APP_SECRET', 'SOLPLANET_API_KEY', 
                     'SOLPLANET_TOKEN', 'SOLPLANET_SN'];
        
        $all_exist = true;
        foreach ($required as $var) {
            if (!getenv($var)) {
                $all_exist = false;
                break;
            }
        }
        
        if (!$all_exist) {
            return false;
        }
        
        self::$config = [
            'enabled' => getenv('SOLPLANET_ENABLED') !== 'false',
            'app_key' => getenv('SOLPLANET_APP_KEY'),
            'app_secret' => getenv('SOLPLANET_APP_SECRET'),
            'api_key' => getenv('SOLPLANET_API_KEY'),
            'token' => getenv('SOLPLANET_TOKEN'),
            'sn' => getenv('SOLPLANET_SN'),
            'system_capacity_wp' => getenv('SOLPLANET_CAPACITY') ?: 3780,
            'collection_interval' => getenv('SOLPLANET_INTERVAL') ?: 10,
            'retention_days' => getenv('SOLPLANET_RETENTION') ?: 7,
            'cache_enabled' => getenv('SOLPLANET_CACHE') !== 'false',
            'cache_ttl' => getenv('SOLPLANET_CACHE_TTL') ?: 300,
            'log_enabled' => getenv('SOLPLANET_LOG') !== 'false',
            'log_level' => getenv('SOLPLANET_LOG_LEVEL') ?: 'INFO'
        ];
        
        return true;
    }
    
    /**
     * Validate configuration has all required fields
     * 
     * @return bool True if valid
     */
    private static function validate() {
        $required = ['app_key', 'app_secret', 'api_key', 'token', 'sn'];
        
        foreach ($required as $field) {
            if (!isset(self::$config[$field]) || empty(self::$config[$field])) {
                return false;
            }
            
            // Check for placeholder values
            if (strpos(self::$config[$field], 'YOUR_') === 0 || 
                strpos(self::$config[$field], 'HERE') !== false) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Get a configuration value
     * 
     * @param string $key Configuration key
     * @param mixed $default Default value if key not found
     * @return mixed Configuration value
     */
    public static function get($key, $default = null) {
        if (self::$config === null) {
            try {
                self::load();
            } catch (Exception $e) {
                return $default;
            }
        }
        
        return isset(self::$config[$key]) ? self::$config[$key] : $default;
    }
    
    /**
     * Check if solar monitoring is enabled
     * 
     * @return bool True if enabled
     */
    public static function isEnabled() {
        $enabled = self::get('enabled', false);
        
        // Handle various representations of "true"
        // INI files return "1" for true, not boolean true
        if ($enabled === true || $enabled === 1 || $enabled === '1' || $enabled === 'true' || $enabled === 'True') {
            return true;
        }
        
        return false;
    }
    
    /**
     * Get all configuration values (for debugging)
     * Sensitive values are masked
     * 
     * @return array Configuration with masked sensitive data
     */
    public static function getAll($mask_sensitive = true) {
        if (self::$config === null) {
            try {
                self::load();
            } catch (Exception $e) {
                return [];
            }
        }
        
        if (!$mask_sensitive) {
            return self::$config;
        }
        
        $safe_config = self::$config;
        $sensitive = ['app_key', 'app_secret', 'api_key', 'token', 'sn'];
        
        foreach ($sensitive as $field) {
            if (isset($safe_config[$field])) {
                $value = $safe_config[$field];
                $safe_config[$field] = substr($value, 0, 4) . '...' . substr($value, -4);
            }
        }
        
        return $safe_config;
    }
    
    /**
     * Get the path to the config file being used
     * 
     * @return string|null Path to config file or null if not found
     */
    public static function getConfigPath() {
        foreach (self::$config_paths as $path) {
            if (file_exists($path) && is_readable($path)) {
                return $path;
            }
        }
        return null;
    }
}