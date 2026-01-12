/**
 * P1 Monitor API Handler
 * Centralized API calls for all P1 Monitor endpoints
 */

(function() {
    'use strict';
    
    const P1API = {
        // Base API paths
        BASE_PATH: '/api',
        
        // Cache for API responses (short-lived)
        cache: new Map(),
        CACHE_DURATION: 5000, // 5 seconds
        
        // Connection monitoring
        connectionStatus: {
            isOnline: true,
            consecutiveFailures: 0,
            lastSuccessTime: Date.now(),
            MAX_FAILURES: 3
        },
        
        /**
         * Generic fetch wrapper with error handling
         */
        async fetch(endpoint, options = {}) {
            try {
                const response = await fetch(endpoint, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Mark as successful connection
                this.markConnectionSuccess();
                
                return data;
                
            } catch (error) {
                console.error(`API Error (${endpoint}):`, error);
                
                // Mark as failed connection
                this.markConnectionFailure();
                
                throw error;
            }
        },
        
        /**
         * Mark connection as successful
         */
        markConnectionSuccess() {
            const wasOffline = !this.connectionStatus.isOnline;
            
            this.connectionStatus.isOnline = true;
            this.connectionStatus.consecutiveFailures = 0;
            this.connectionStatus.lastSuccessTime = Date.now();
            
            // Dispatch event if we just came back online
            if (wasOffline) {
                this.dispatchConnectionEvent('online');
            }
        },
        
        /**
         * Mark connection as failed
         */
        markConnectionFailure() {
            this.connectionStatus.consecutiveFailures++;
            
            // Mark as offline after MAX_FAILURES
            if (this.connectionStatus.consecutiveFailures >= this.connectionStatus.MAX_FAILURES) {
                const wasOnline = this.connectionStatus.isOnline;
                this.connectionStatus.isOnline = false;
                
                // Dispatch event if we just went offline
                if (wasOnline) {
                    this.dispatchConnectionEvent('offline');
                }
            }
        },
        
        /**
         * Dispatch connection status event
         */
        dispatchConnectionEvent(status) {
            const event = new CustomEvent('p1connection', {
                detail: {
                    status: status,
                    isOnline: this.connectionStatus.isOnline,
                    consecutiveFailures: this.connectionStatus.consecutiveFailures,
                    lastSuccessTime: this.connectionStatus.lastSuccessTime
                }
            });
            
            document.dispatchEvent(event);
            console.log(`P1 API Connection: ${status}`);
        },
        
        /**
         * Get connection status
         */
        getConnectionStatus() {
            return {
                ...this.connectionStatus,
                timeSinceLastSuccess: Date.now() - this.connectionStatus.lastSuccessTime
            };
        },
        
        /**
         * Fetch with caching
         */
        async fetchCached(endpoint, options = {}) {
            const cacheKey = endpoint;
            const now = Date.now();
            
            // Check cache
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (now - cached.timestamp < this.CACHE_DURATION) {
                    return cached.data;
                }
            }
            
            // Fetch fresh data
            const data = await this.fetch(endpoint, options);
            
            // Store in cache
            this.cache.set(cacheKey, {
                data: data,
                timestamp: now
            });
            
            return data;
        },
        
        /**
         * Clear cache
         */
        clearCache(endpoint = null) {
            if (endpoint) {
                this.cache.delete(endpoint);
            } else {
                this.cache.clear();
            }
        },
        
        // ========================================================================
        // SMART METER APIs
        // ========================================================================
        
        /**
         * Get smart meter data (real-time readings)
         * @param {number} limit - Number of records to fetch (default: 60)
         * @returns {Promise<Array>}
         */
        async getSmartMeter(limit = 60) {
            return this.fetch(`${this.BASE_PATH}/v1/smartmeter?limit=${limit}`);
        },
        
        /**
         * Get status data (peaks, phases, totals)
         * @returns {Promise<Array>}
         */
        async getStatus() {
            return this.fetch(`${this.BASE_PATH}/v1/status`);
        },
        
        /**
         * Get configuration settings
         * @returns {Promise<Array>}
         */
        async getConfiguration() {
            return this.fetchCached(`${this.BASE_PATH}/v1/configuration`);
        },
        
        // ========================================================================
        // HISTORY APIs
        // ========================================================================
        
        /**
         * Get power and gas history by day
         * @param {number} limit - Number of days (default: 1)
         * @returns {Promise<Array>}
         */
        async getHistoryDay(limit = 1) {
            return this.fetch(`${this.BASE_PATH}/v1/powergas/day?limit=${limit}`);
        },
        
        /**
         * Get power and gas history by month
         * @param {number} limit - Number of months (default: 12)
         * @returns {Promise<Array>}
         */
        async getHistoryMonth(limit = 12) {
            return this.fetch(`${this.BASE_PATH}/v1/powergas/month?limit=${limit}`);
        },
        
        /**
         * Get power and gas history by year
         * @param {number} limit - Number of years (default: 5)
         * @returns {Promise<Array>}
         */
        async getHistoryYear(limit = 5) {
            return this.fetch(`${this.BASE_PATH}/v1/powergas/year?limit=${limit}`);
        },
        
        /**
         * Get hourly history for a specific date
         * @param {string} date - Date in YYYY-MM-DD format
         * @returns {Promise<Array>}
         */
        async getHistoryHour(date) {
            const today = date || new Date().toISOString().split('T')[0];
            return this.fetch(`${this.BASE_PATH}/v1/powergas/hour?date=${today}`);
        },

        /**
         * Get power and gas history by hour
         * @param {number} limit - Number of hours (default: 24)
         * @returns {Promise<Array>}
         */
        async getHistoryHour(limit = 24) {
            return this.fetchCached(`${this.BASE_PATH}/v1/powergas/hour?limit=${limit}`);
        },
        
        // ========================================================================
        // FINANCIAL APIs
        // ========================================================================
        
        /**
         * Get financial data by day
         * @param {number} limit - Number of days (default: 1)
         * @returns {Promise<Array>}
         */
        async getFinancial(limit = 1) {
            return this.fetch(`${this.BASE_PATH}/v1/financial/day?limit=${limit}`);
        },
        
        /**
         * Get financial data by month
         * @param {number} limit - Number of months (default: 12)
         * @returns {Promise<Array>}
         */
        async getFinancialMonth(limit = 12) {
            return this.fetch(`${this.BASE_PATH}/v1/financial/month?limit=${limit}`);
        },
        
        /**
         * Get financial data by year
         * @param {number} limit - Number of years (default: 5)
         * @returns {Promise<Array>}
         */
        async getFinancialYear(limit = 5) {
            return this.fetch(`${this.BASE_PATH}/v1/financial/year?limit=${limit}`);
        },
        
        // ========================================================================
        // WATER METER APIs
        // ========================================================================
        
        /**
         * Get water meter data by day
         * @param {number} limit - Number of days (default: 1)
         * @returns {Promise<Array>}
         */
        async getWaterMeter(limit = 1) {
            return this.fetch(`${this.BASE_PATH}/v2/watermeter/day?limit=${limit}`);
        },
        
        /**
         * Get water meter data by month
         * @param {number} limit - Number of months (default: 12)
         * @returns {Promise<Array>}
         */
        async getWaterMeterMonth(limit = 12) {
            return this.fetch(`${this.BASE_PATH}/v2/watermeter/month?limit=${limit}`);
        },
        
        // ========================================================================
        // WEATHER API
        // ========================================================================
        
        /**
         * Get current weather data from OpenWeatherMap
         * @returns {Promise<Object>}
         */
        async getWeather() {
            try {
                console.log('Calling weather API...');
                const data = await this.fetchCached(`${this.BASE_PATH}/v1/weather`);
                console.log('Weather API raw response:', data);
                console.log('Weather API response type:', typeof data);
                console.log('Weather API response keys:', data ? Object.keys(data) : 'null');
                return data;
            } catch (error) {
                console.error('Weather API error:', error);
                return null;
            }
        },

        /**
         * Get weather history for a specific time range
         * @param {number} hours - Number of hours to fetch (default: 24)
         * @returns {Promise<Array>} Array of weather records
         */
        async getWeatherHistory(hours = 24) {
            try {
                const data = await this.fetch(`${this.BASE_PATH}/v1/weather`);
                if (!Array.isArray(data)) return [];
                
                // Filter to requested timeframe
                const now = Date.now() / 1000;
                const startTime = now - (hours * 3600);
                
                return data.filter(record => {
                    const timestamp = parseInt(record[1]);
                    return timestamp >= startTime;
                });
            } catch (error) {
                console.warn('Weather history not available:', error);
                return [];
            }
        },
        
        /**
         * Process weather data into temperature stats per time bucket
         * @param {Array} weatherData - Raw weather records
         * @param {string} period - 'hours', 'days', 'months', 'years'
         * @param {number} bucketSize - Size of time bucket in seconds
         * @returns {Object} Mapped temperature data by timestamp
         */
        processTemperatureData(weatherData, period = 'hours', bucketSize = 3600) {
            const tempMap = {};
            
            // For months/years, we need to group by calendar month/year
            if (period === 'months' || period === 'years') {
                weatherData.forEach(record => {
                    const timestamp = parseInt(record[1]);
                    const temp = parseFloat(record[4]);
                    
                    if (isNaN(temp) || isNaN(timestamp)) return;
                    
                    const date = new Date(timestamp * 1000);
                    const year = date.getFullYear();
                    const month = date.getMonth();
                    
                    // Create key for start of month
                    const monthStart = new Date(year, month, 1);
                    const bucketKey = Math.floor(monthStart.getTime() / 1000);
                    
                    if (!tempMap[bucketKey]) {
                        tempMap[bucketKey] = {
                            temps: [],
                            min: temp,
                            max: temp,
                            sum: 0,
                            count: 0
                        };
                    }
                    
                    tempMap[bucketKey].temps.push(temp);
                    tempMap[bucketKey].min = Math.min(tempMap[bucketKey].min, temp);
                    tempMap[bucketKey].max = Math.max(tempMap[bucketKey].max, temp);
                    tempMap[bucketKey].sum += temp;
                    tempMap[bucketKey].count++;
                });
            } else {
                // For hours/days, use simple bucketing
                weatherData.forEach(record => {
                    const timestamp = parseInt(record[1]);
                    const temp = parseFloat(record[4]);
                    
                    if (isNaN(temp) || isNaN(timestamp)) return;
                    
                    const bucketKey = Math.floor(timestamp / bucketSize) * bucketSize;
                    
                    if (!tempMap[bucketKey]) {
                        tempMap[bucketKey] = {
                            temps: [],
                            min: temp,
                            max: temp,
                            sum: 0,
                            count: 0
                        };
                    }
                    
                    tempMap[bucketKey].temps.push(temp);
                    tempMap[bucketKey].min = Math.min(tempMap[bucketKey].min, temp);
                    tempMap[bucketKey].max = Math.max(tempMap[bucketKey].max, temp);
                    tempMap[bucketKey].sum += temp;
                    tempMap[bucketKey].count++;
                });
            }
            
            Object.keys(tempMap).forEach(key => {
                tempMap[key].avg = tempMap[key].sum / tempMap[key].count;
            });
            
            return tempMap;
        },
        
        // ========================================================================
        // PHASE APIs
        // ========================================================================
        
        /**
         * Get phase data (L1, L2, L3)
         * @returns {Promise<Object>}
         */
        async getPhases() {
            const status = await this.getStatus();
            const phases = {
                consumption: [0, 0, 0],
                production: [0, 0, 0],
                voltage: [0, 0, 0],
                current: [0, 0, 0]
            };
            
            status.forEach(item => {
                switch(item[0]) {
                    // Consumption power per phase
                    case 74: phases.consumption[0] = parseFloat(item[1]); break;
                    case 75: phases.consumption[1] = parseFloat(item[1]); break;
                    case 76: phases.consumption[2] = parseFloat(item[1]); break;
                    // Production power per phase
                    case 77: phases.production[0] = parseFloat(item[1]); break;
                    case 78: phases.production[1] = parseFloat(item[1]); break;
                    case 79: phases.production[2] = parseFloat(item[1]); break;
                }
            });
            
            return phases;
        },
        
        // ========================================================================
        // UTILITY METHODS
        // ========================================================================
        
        /**
         * Get current tariff (peak/offpeak)
         * @returns {Promise<string>} 'P' or 'D'
         */
        async getCurrentTariff() {
            const data = await this.getSmartMeter(1);
            if (data && data.length > 0) {
                return data[0][7]; // 'P' for peak, 'D' for off-peak
            }
            return 'P';
        },
        
        /**
         * Get all data for dashboard (optimized single call)
         * @returns {Promise<Object>}
         */
        async getDashboardData() {
            try {
                const [smartMeter, status, historyDay, financial, waterMeter] = await Promise.all([
                    this.getSmartMeter(60),
                    this.getStatus(),
                    this.getHistoryDay(),
                    this.getFinancial(),
                    this.getWaterMeter().catch(() => null) // Water meter might not exist
                ]);
                
                return {
                    smartMeter,
                    status,
                    historyDay,
                    financial,
                    waterMeter
                };
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
                throw error;
            }
        },
        
        /**
         * Format API data for charts
         * @param {Array} data - Raw API data
         * @param {string} valueKey - Which value to extract
         * @returns {Object} Formatted chart data
         */
        formatChartData(data, valueKey) {
            return {
                labels: data.map(item => new Date(item[0])),
                values: data.map(item => item[valueKey])
            };
        },
        
        /**
         * Check if API is available
         * @returns {Promise<boolean>}
         */
        async isAvailable() {
            try {
                await this.fetch(`${this.BASE_PATH}/v1/status`);
                return true;
            } catch (error) {
                return false;
            }
        },

        /**
         * Get electricity data with statistics for a specific period
         * @param {string} period - 'hours', 'days', 'months', 'years'
         * @param {number} limit - Number of records to fetch
         * @returns {Promise<Object>}
         */
        async getElectricityData(period = 'hours', limit = 24, includeTemperature = false) {
            try {
                let historyData, financialData, temperatureMap = null;
                
                // Fetch temperature data if requested
                if (includeTemperature) {
                    try {
                        // Determine time range based on period
                        let hours = limit;
                        if (period === 'days') hours = limit * 24;
                        else if (period === 'months') hours = limit * 24 * 30;
                        else if (period === 'years') hours = limit * 24 * 365;
                        
                        const weatherData = await this.getWeatherHistory(hours);
                        
                        // Determine bucket size based on period
                        // For months view, we still want daily granularity
                        let bucketSize = 3600; // 1 hour default
                        if (period === 'days') bucketSize = 86400; // 1 day
                        else if (period === 'months') bucketSize = 86400; // 1 day (not 30 days!)
                        else if (period === 'years') bucketSize = 86400 * 30; // ~1 month
                        
                        temperatureMap = this.processTemperatureData(weatherData, period, bucketSize);
                    } catch (error) {
                        console.warn('Could not fetch temperature data:', error);
                        temperatureMap = null;
                    }
                }
                
                
                // Fetch appropriate data based on period
                switch(period) {
                    case 'hours':
                        historyData = await this.getHistoryHour(limit);
                        // Financial hour endpoint doesn't exist in P1 Monitor API
                        // We'll estimate costs from consumption data
                        financialData = null;
                        break;
                    case 'days':
                        historyData = await this.getHistoryDay(limit);
                        try {
                            financialData = await this.getFinancialDay(limit);
                        } catch (error) {
                            console.warn('Financial day data not available');
                            financialData = null;
                        }
                        break;
                    case 'months':
                        historyData = await this.getHistoryMonth(limit);
                        try {
                            financialData = await this.getFinancialMonth(limit);
                        } catch (error) {
                            console.warn('Financial month data not available');
                            financialData = null;
                        }
                        break;
                    case 'years':
                        historyData = await this.getHistoryYear(limit);
                        try {
                            financialData = await this.getFinancialYear(limit);
                        } catch (error) {
                            console.warn('Financial year data not available');
                            financialData = null;
                        }
                        break;
                    default:
                        throw new Error('Invalid period: ' + period);
                }
                
                if (!historyData || historyData.length === 0) {
                    return null;
                }
                
                // Reverse data so oldest is first (left side of chart)
                historyData.reverse();
                
                // Process data into chart-friendly format
                const chartData = [];
                let totalConsumption = 0;
                let totalProduction = 0;
                let totalCost = 0;
                let peakConsumption = { value: 0, time: '' };
                
                historyData.forEach((row, index) => {
                    // History data structure:
                    // [0] = timestamp
                    // [1] = unix timestamp
                    // [2] = verbruik_dal_kwh (off-peak consumption)
                    // [3] = verbruik_piek_kwh (peak consumption)
                    // [4] = productie_dal_kwh (off-peak production)
                    // [5] = productie_piek_kwh (peak production)
                    // [6] = verbruik_dal_piek_kwh (total consumption)
                    // [7] = productie_dal_piek_kwh (total production)
                    // [8] = netto (net)
                    // [9] = gas_m3
                    
                    const consumption = parseFloat(row[6] || 0);
                    const production = parseFloat(row[7] || 0);
                    const net = consumption - production; // Calculate net (not provided by API)
                    
                    // Debug: check first row
                    if (index === 0) {
                        console.log('First row:', row);
                        console.log('consumption:', consumption, 'production:', production, 'net:', net);
                    }
                    
                    totalConsumption += consumption;
                    totalProduction += production;
                    
                    // Track peak
                    if (consumption > peakConsumption.value) {
                        peakConsumption.value = consumption;
                        peakConsumption.time = row[0];
                    }
                    
                    // Get temperature data for this timestamp if available
                    const unixTimestamp = parseInt(row[1]);
                    let tempData = {};
                    if (temperatureMap && unixTimestamp) {
                        let bucketKey;
                        
                        // For months/years, match by calendar month
                        if (period === 'months' || period === 'years') {
                            const date = new Date(unixTimestamp * 1000);
                            const year = date.getFullYear();
                            const month = date.getMonth();
                            const monthStart = new Date(year, month, 1);
                            bucketKey = Math.floor(monthStart.getTime() / 1000);
                        } else {
                            // For hours/days, use bucket size
                            let bucketSize = 3600; // 1 hour default
                            if (period === 'days') bucketSize = 86400; // 1 day
                            bucketKey = Math.floor(unixTimestamp / bucketSize) * bucketSize;
                        }
                        
                        const temps = temperatureMap[bucketKey];
                        if (temps) {
                            tempData = {
                                tempMin: temps.min,
                                tempMax: temps.max,
                                tempAvg: temps.avg
                            };
                        }
                    }
                    
                    chartData.push({
                        timestamp: row[0],
                        unixTimestamp: unixTimestamp,
                        consumption: consumption,
                        production: production,
                        net: net,
                        gas: parseFloat(row[9] || 0),
                        ...tempData
                    });
                });
                
                // Calculate financial totals
                if (financialData && financialData.length > 0) {
                    financialData.forEach(row => {
                        // Financial data structure:
                        // [2] = verbruik_dal_kosten
                        // [3] = verbruik_piek_kosten
                        // [4] = opbrengst_dal
                        // [5] = opbrengst_piek
                        // [6] = gas_kosten
                        const costs = parseFloat(row[2] || 0) + parseFloat(row[3] || 0) + parseFloat(row[6] || 0);
                        const revenue = parseFloat(row[4] || 0) + parseFloat(row[5] || 0);
                        totalCost += (costs - revenue);
                    });
                } else {
                    // If financial data not available, estimate from consumption
                    // Using rough estimate of €0.30 per kWh (adjust based on your rates)
                    const estimatedCostPerKwh = 0.30;
                    totalCost = (totalConsumption - totalProduction) * estimatedCostPerKwh;
                }
                
                // Calculate statistics
                const average = chartData.length > 0 ? totalConsumption / chartData.length : 0;
                
                return {
                    period: period,
                    limit: limit,
                    chartData: chartData,
                    stats: {
                        totalConsumption: totalConsumption,
                        totalProduction: totalProduction,
                        netConsumption: totalConsumption - totalProduction,
                        totalCost: totalCost,
                        average: average,
                        peakConsumption: peakConsumption
                    }
                };
                
            } catch (error) {
                console.error('Error fetching electricity data:', error);
                throw error;
            }
        }
    };
    
    // Expose API globally
    window.P1API = P1API;
    
    console.log('P1 API Handler initialized');
    
})();