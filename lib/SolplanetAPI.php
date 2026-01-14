<?php
/**
 * Solplanet API Client for P1 Monitor (End User API)
 * Based on working Python implementation
 * 
 * This version uses the End User API endpoints with signature authentication
 * Updated to match collector's 5-parameter call signature
 */

class SolplanetAPI {
    
    private $api_key;      // Your plant's API key (for 'key=' parameter)
    private $app_key;      // App Key for signature
    private $app_secret;   // App Secret for signature
    private $sn;           // Inverter serial number
    private $base_url = 'https://eu-api-genergal.aisweicloud.com';
    
    /**
     * Initialize the Solplanet API client
     * 
     * Constructor matches solar-collector.php call:
     * new SolplanetAPI($appKey, $appSecret, $apiKey, $token, $sn)
     * 
     * @param string $app_key Application Key for signature (param 1)
     * @param string $app_secret Application Secret for signature (param 2)
     * @param string $api_key Your plant's API key (param 3)
     * @param string $token Token (param 4 - not used for End User API)
     * @param string $sn Inverter serial number (param 5)
     */
    public function __construct($app_key, $app_secret, $api_key, $token, $sn) {
        $this->app_key = $app_key;
        $this->app_secret = $app_secret;
        $this->api_key = $api_key;
        $this->sn = $sn;
        // $token is ignored for End User API
    }
    
    /**
     * Make an authenticated API request
     * 
     * @param string $endpoint API endpoint path (e.g., '/devicelist')
     * @param array $extra_params Additional query parameters (optional)
     * @return array API response as associative array
     */
    private function makeRequest($endpoint, $extra_params = []) {
        $method = 'GET';
        $content_type = 'application/json; charset=UTF-8';
        $accept = 'application/json';
        
        // Add key parameter (End User API uses "key" not "apikey")
        $key_param = 'key=' . $this->api_key;
        $endpoint .= (strpos($endpoint, '?') !== false ? '&' : '?') . $key_param;
        
        // Add extra parameters
        foreach ($extra_params as $key => $value) {
            $endpoint .= '&' . $key . '=' . urlencode($value);
        }
        
        // Sort parameters alphabetically (required for signature)
        $parts = explode('?', $endpoint);
        if (count($parts) > 1) {
            $params = explode('&', $parts[1]);
            sort($params);
            $endpoint = $parts[0] . '?' . implode('&', $params);
        }
        
        // Build signature string (CRITICAL: No space after colon in X-Ca-Key:)
        $string_to_sign = $method . "\n" .
                         $accept . "\n" .
                         "\n" .
                         $content_type . "\n" .
                         "\n" .
                         "X-Ca-Key:" . $this->app_key . "\n" .
                         $endpoint;
        
        // Generate signature
        $signature = base64_encode(hash_hmac('sha256', $string_to_sign, $this->app_secret, true));
        
        // Build headers
        $header_lines = [
            'User-Agent: app 1.0',
            'Content-Type: ' . $content_type,
            'Accept: ' . $accept,
            'X-Ca-Signature-Headers: X-Ca-Key',
            'X-Ca-Key: ' . $this->app_key,
            'X-Ca-Signature: ' . $signature
        ];
        
        // Make the request
        $url = $this->base_url . $endpoint;
        
        $context = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $header_lines),
                'timeout' => 30,
                'ignore_errors' => true
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true
            ]
        ]);
        
        $response = @file_get_contents($url, false, $context);
        
        // Check for connection errors
        if ($response === false) {
            $error = error_get_last();
            return [
                'success' => false,
                'error' => 'Connection Error: ' . ($error['message'] ?? 'Unknown error'),
                'status' => 0
            ];
        }
        
        // Get HTTP response code
        $http_code = 0;
        if (isset($http_response_header)) {
            foreach ($http_response_header as $header) {
                if (preg_match('#HTTP/[0-9.]+\s+([0-9]+)#', $header, $matches)) {
                    $http_code = intval($matches[1]);
                    break;
                }
            }
        }
        
        // Handle non-200 responses
        if ($http_code !== 200) {
            return [
                'success' => false,
                'error' => "HTTP Error: $http_code",
                'status' => $http_code,
                'response' => $response
            ];
        }
        
        // Parse JSON response
        $json = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false,
                'error' => 'JSON Parse Error: ' . json_last_error_msg(),
                'status' => $http_code,
                'response' => $response
            ];
        }
        
        // Return successful response
        return [
            'success' => true,
            'data' => $json,
            'status' => $http_code
        ];
    }
    
    // ============================================================
    // PUBLIC API METHODS (End User API)
    // ============================================================
    
    /**
     * Get list of plants
     * API: planlist
     * 
     * @param int $order Sort order (0=last update, 1=create time, 2=status)
     * @param int $page Page number (default: 1)
     * @param int $size Page size (default: 20)
     * @return array Plant list
     */
    public function getPlanList($order = 0, $page = 1, $size = 20) {
        return $this->makeRequest('/planlist', [
            'order' => $order,
            'page' => $page,
            'size' => $size
        ]);
    }
    
    /**
     * Get plant overview - current status and production
     * API: getPlantOverview
     * 
     * Returns:
     * - Current power output (W)
     * - Today's generation (kWh)
     * - Monthly generation (kWh)
     * - Total generation (kWh)
     * - Plant status (0=offline, 1=normal, 2=warning, 3=error)
     * 
     * @return array Plant overview data
     */
    public function getPlantOverview() {
        return $this->makeRequest('/getPlantOverview');
    }
    
    /**
     * Get plant output for a specific period
     * API: getPlantOutput
     * 
     * @param string $period 'bydays', 'bymonth', 'byyear', 'bytotal'
     * @param string $date Date string based on period:
     *                     - bydays: 'YYYY-MM-DD'
     *                     - bymonth: 'YYYY-MM'
     *                     - byyear: 'YYYY'
     *                     - bytotal: null
     * @return array Historical output data
     */
    public function getPlantOutput($period = 'bydays', $date = null) {
        if ($date === null) {
            $date = date('Y-m-d');
        }
        
        $params = ['period' => $period];
        if ($period !== 'bytotal') {
            $params['date'] = $date;
        }
        
        return $this->makeRequest('/getPlantOutput', $params);
    }
    
    /**
     * Get plant events (errors/warnings)
     * API: getPlantEvent
     * 
     * @param string $start_date Start date 'YYYY-MM-DD'
     * @param string $end_date End date 'YYYY-MM-DD' (max 7 days from start)
     * @return array Event list
     */
    public function getPlantEvent($start_date = null, $end_date = null) {
        if ($start_date === null) {
            $start_date = date('Y-m-d');
        }
        if ($end_date === null) {
            $end_date = date('Y-m-d');
        }
        
        return $this->makeRequest('/getPlantEvent', [
            'sdt' => $start_date,
            'edt' => $end_date
        ]);
    }
    
    /**
     * Get inverter overview with statistics
     * API: getInverterOverview
     * 
     * @param string $date Date 'YYYY-MM-DD' (optional)
     * @return array Inverter statistics
     */
    public function getInverterOverview($date = null) {
        $params = [];
        if ($date !== null) {
            $params['date'] = $date;
        }
        
        return $this->makeRequest('/getInverterOverview', $params);
    }
    
    /**
     * Get device list (inverters and collectors)
     * API: devicelist
     * 
     * Returns list of devices with status
     * 
     * @return array Device list
     */
    public function getDeviceList() {
        return $this->makeRequest('/devicelist');
    }
    
    /**
     * Get detailed inverter data for a time period
     * API: getInverterData
     * 
     * @param string $start_time Start time 'YYYY-MM-DD HH:MM:SS'
     * @param string $end_time End time 'YYYY-MM-DD HH:MM:SS'
     * @return array Detailed inverter data
     */
    public function getInverterData($start_time, $end_time) {
        return $this->makeRequest('/getInverterData', [
            'sn' => $this->sn,
            'starttime' => $start_time,
            'endtime' => $end_time
        ]);
    }
    
    /**
     * Test API connection
     * 
     * @return array Test results
     */
    public function testConnection() {
        $results = [
            'success' => false,
            'tests' => [],
            'summary' => ''
        ];
        
        // Test 1: Device List
        $devices = $this->getDeviceList();
        $results['tests']['device_list'] = [
            'endpoint' => 'devicelist',
            'success' => isset($devices['success']) && $devices['success'],
            'response' => $devices
        ];
        
        // Test 2: Plant Overview
        $overview = $this->getPlantOverview();
        $results['tests']['plant_overview'] = [
            'endpoint' => 'getPlantOverview',
            'success' => isset($overview['success']) && $overview['success'],
            'response' => $overview
        ];
        
        // Test 3: Today's Production
        $today = $this->getPlantOutput('bydays', date('Y-m-d'));
        $results['tests']['today_production'] = [
            'endpoint' => 'getPlantOutput',
            'success' => isset($today['success']) && $today['success'],
            'response' => $today
        ];
        
        // Check if all tests passed
        $all_passed = true;
        foreach ($results['tests'] as $test) {
            if (!$test['success']) {
                $all_passed = false;
                break;
            }
        }
        
        $results['success'] = $all_passed;
        $results['summary'] = $all_passed 
            ? 'All API tests passed successfully!' 
            : 'Some API tests failed. Check individual test results.';
        
        return $results;
    }
}