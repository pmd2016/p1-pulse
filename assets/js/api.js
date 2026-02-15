/**
 * P1 Monitor API Handler
 * Centralized API calls for all P1 Monitor endpoints
 *
 * All P1 Monitor API calls use ?json=object to receive responses with
 * named properties (e.g. record.TIMESTAMP_UTC) instead of positional
 * arrays (e.g. record[1]). This makes the code resilient to API
 * field-order changes and self-documenting.
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
         * Generic fetch wrapper with error handling.
         * Automatically appends json=object to P1 Monitor API calls
         * so responses use named properties instead of positional arrays.
         */
        async fetch(endpoint, options = {}) {
            // Auto-append json=object for P1 Monitor API endpoints
            let url = endpoint;
            if (url.startsWith(this.BASE_PATH)) {
                const separator = url.includes('?') ? '&' : '?';
                url += separator + 'json=object';
            }

            try {
                const response = await fetch(url, {
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
                P1Logger.error(`API Error (${endpoint}):`, error);

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
            P1Logger.log(`P1 API Connection: ${status}`);
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
         * Response fields: TIMESTAMP_lOCAL, TIMESTAMP_UTC, RECORD_IS_PROCESSED,
         *   CONSUMPTION_KWH_LOW, CONSUMPTION_KWH_HIGH, PRODUCTION_KWH_LOW,
         *   PRODUCTION_KWH_HIGH, TARIFCODE, CONSUMPTION_W, PRODUCTION_W,
         *   CONSUMPTION_GAS_M3
         * @param {number} limit - Number of records to fetch (default: 60)
         * @returns {Promise<Array>}
         */
        async getSmartMeter(limit = 60) {
            return this.fetch(`${this.BASE_PATH}/v1/smartmeter?limit=${limit}`);
        },

        /**
         * Get status data (peaks, phases, totals)
         * Response fields: STATUS_ID, STATUS, LABEL, SECURITY
         * @returns {Promise<Array>}
         */
        async getStatus() {
            return this.fetch(`${this.BASE_PATH}/v1/status`);
        },

        /**
         * Get configuration settings
         * Response fields: CONFIGURATION_ID, PARAMETER, LABEL
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
         * Response fields: TIMESTAMP_lOCAL, TIMESTAMP_UTC,
         *   CONSUMPTION_COST_ELECTRICITY_HIGH, CONSUMPTION_COST_ELECTRICITY_LOW,
         *   PRODUCTION_REVENUES_ELECTRICITY_HIGH, PRODUCTION_REVENUES_ELECTRICITY_LOW,
         *   CONSUMPTION_COST_GAS, CONSUMPTION_COST_WATER
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
         * Get current weather data
         * Response fields: TIMESTAMP_lOCAL, TIMESTAMP_UTC, CITY_ID, CITY_NAME,
         *   TEMPERATURE, WEATHER_DESCRIPTION, WEATHER_ICON, PRESSURE, HUMIDITY,
         *   WIND_SPEED, WIND_DEGREES, CLOUDS, WEATHER_ID
         * @returns {Promise<Object>}
         */
        async getWeather() {
            try {
                return await this.fetchCached(`${this.BASE_PATH}/v1/weather`);
            } catch (error) {
                P1Logger.error('Weather API error:', error);
                return null;
            }
        },

        /**
         * Get weather history for a specific period
         * Uses period-specific weather endpoints (hour, day, month, year).
         * @param {string} period - 'hours', 'days', 'months', 'years'
         * @param {number} limit - Number of records to fetch
         * @returns {Promise<Array>} Array of weather records (named properties)
         */
        async getWeatherHistory(period = 'hours', limit = 24) {
            try {
                const periodMap = {
                    hours: 'hour',
                    days: 'day',
                    months: 'month',
                    years: 'year'
                };
                const endpoint = periodMap[period];
                if (!endpoint) return [];

                const data = await this.fetch(
                    `${this.BASE_PATH}/v1/weather/${endpoint}?limit=${limit}`
                );
                return Array.isArray(data) ? data : [];
            } catch (error) {
                P1Logger.warn('Weather history not available:', error);
                return [];
            }
        },

        /**
         * Process weather history into a lookup map keyed by period timestamp.
         * Weather history endpoints return pre-aggregated TEMPERATURE_LOW,
         * TEMPERATURE_AVERAGE, TEMPERATURE_HIGH per period.
         * @param {Array} weatherData - Raw weather records from /api/v1/weather/{period}
         * @param {string} period - 'hours', 'days', 'months', 'years'
         * @returns {Object} Map of { [periodKey]: { min, max, avg } }
         */
        processTemperatureData(weatherData, period = 'hours') {
            const tempMap = {};

            weatherData.forEach(record => {
                const timestamp = parseInt(record.TIMESTAMP_UTC);
                if (isNaN(timestamp)) return;

                const key = ChartBase.getPeriodKey
                    ? ChartBase.getPeriodKey(timestamp, period)
                    : timestamp;

                const min = parseFloat(record.TEMPERATURE_LOW);
                const max = parseFloat(record.TEMPERATURE_HIGH);
                const avg = parseFloat(record.TEMPERATURE_AVERAGE);

                if (isNaN(min) && isNaN(max) && isNaN(avg)) return;

                tempMap[key] = {
                    min: isNaN(min) ? avg : min,
                    max: isNaN(max) ? avg : max,
                    avg: isNaN(avg) ? (min + max) / 2 : avg
                };
            });

            return tempMap;
        },

        // ========================================================================
        // PHASE APIs
        // ========================================================================

        /**
         * Get phase data (L1, L2, L3) from status endpoint
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
                switch(item.STATUS_ID) {
                    // Consumption power per phase
                    case 74: phases.consumption[0] = parseFloat(item.STATUS); break;
                    case 75: phases.consumption[1] = parseFloat(item.STATUS); break;
                    case 76: phases.consumption[2] = parseFloat(item.STATUS); break;
                    // Production power per phase
                    case 77: phases.production[0] = parseFloat(item.STATUS); break;
                    case 78: phases.production[1] = parseFloat(item.STATUS); break;
                    case 79: phases.production[2] = parseFloat(item.STATUS); break;
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
                return data[0].TARIFCODE; // 'P' for peak, 'D' for off-peak
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
                P1Logger.error('Error fetching dashboard data:', error);
                throw error;
            }
        },

        /**
         * Format API data for charts
         * @param {Array} data - Raw API data (named properties)
         * @param {string} valueKey - Which property to extract
         * @returns {Object} Formatted chart data
         */
        formatChartData(data, valueKey) {
            return {
                labels: data.map(item => new Date(item.TIMESTAMP_lOCAL)),
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
         * @param {boolean} includeTemperature - Whether to include temperature data
         * @returns {Promise<Object>}
         */
        async getElectricityData(period = 'hours', limit = 24, includeTemperature = false) {
            try {
                let historyData, financialData, temperatureMap = null;

                // Fetch temperature data if requested
                if (includeTemperature) {
                    try {
                        const weatherData = await this.getWeatherHistory(period, limit);
                        temperatureMap = this.processTemperatureData(weatherData, period);
                    } catch (error) {
                        P1Logger.warn('Could not fetch temperature data:', error);
                        temperatureMap = null;
                    }
                }

                // Fetch appropriate data based on period
                switch(period) {
                    case 'hours':
                        historyData = await this.getHistoryHour(limit);
                        financialData = null;
                        break;
                    case 'days':
                        historyData = await this.getHistoryDay(limit);
                        try {
                            financialData = await this.getFinancial(limit);
                        } catch (error) {
                            P1Logger.warn('Financial day data not available');
                            financialData = null;
                        }
                        break;
                    case 'months':
                        historyData = await this.getHistoryMonth(limit);
                        try {
                            financialData = await this.getFinancialMonth(limit);
                        } catch (error) {
                            P1Logger.warn('Financial month data not available');
                            financialData = null;
                        }
                        break;
                    case 'years':
                        historyData = await this.getHistoryYear(limit);
                        try {
                            financialData = await this.getFinancialYear(limit);
                        } catch (error) {
                            P1Logger.warn('Financial year data not available');
                            financialData = null;
                        }
                        break;
                    default:
                        throw new Error('Invalid period: ' + period);
                }

                if (!historyData || historyData.length === 0) {
                    return null;
                }

                // API returns sort=desc (newest first), clone and reverse for chronological order
                // Clone to avoid mutating the fetchCached reference
                historyData = [...historyData].reverse();

                // Process data into chart-friendly format (oldest first)
                const chartData = [];
                let totalConsumption = 0;
                let totalProduction = 0;
                let totalCost = 0;
                let peakConsumption = { value: 0, time: '' };

                historyData.forEach((row) => {
                    const consumption = parseFloat(row.CONSUMPTION_DELTA_KWH || 0);
                    const production = parseFloat(row.PRODUCTION_DELTA_KWH || 0);
                    const net = consumption - production;

                    totalConsumption += consumption;
                    totalProduction += production;

                    // Track peak
                    if (consumption > peakConsumption.value) {
                        peakConsumption.value = consumption;
                        peakConsumption.time = row.TIMESTAMP_lOCAL;
                    }

                    // Get temperature data for this timestamp if available
                    const unixTimestamp = parseInt(row.TIMESTAMP_UTC);
                    let tempData = {};
                    if (temperatureMap && unixTimestamp) {
                        const key = ChartBase.getPeriodKey
                            ? ChartBase.getPeriodKey(unixTimestamp, period)
                            : unixTimestamp;
                        const temps = temperatureMap[key];
                        if (temps) {
                            tempData = {
                                tempMin: temps.min,
                                tempMax: temps.max,
                                tempAvg: temps.avg
                            };
                        }
                    }

                    chartData.push({
                        timestamp: row.TIMESTAMP_lOCAL,
                        unixTimestamp: unixTimestamp,
                        consumption: consumption,
                        production: production,
                        net: net,
                        gas: parseFloat(row.CONSUMPTION_GAS_DELTA_M3 || 0),
                        ...tempData
                    });
                });

                // Calculate financial totals
                if (financialData && financialData.length > 0) {
                    financialData.forEach(row => {
                        const costs = parseFloat(row.CONSUMPTION_COST_ELECTRICITY_HIGH || 0)
                                    + parseFloat(row.CONSUMPTION_COST_ELECTRICITY_LOW || 0)
                                    + parseFloat(row.CONSUMPTION_COST_GAS || 0);
                        const revenue = parseFloat(row.PRODUCTION_REVENUES_ELECTRICITY_HIGH || 0)
                                      + parseFloat(row.PRODUCTION_REVENUES_ELECTRICITY_LOW || 0);
                        totalCost += (costs - revenue);
                    });
                } else {
                    // If financial data not available, estimate from consumption
                    // Uses config value from config.php (default: €0.30/kWh)
                    const estimatedCostPerKwh = window.P1MonConfig?.electricityCostPerKwh ?? 0.30;
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
                P1Logger.error('Error fetching electricity data:', error);
                throw error;
            }
        }
    };

    // Expose API globally
    window.P1API = P1API;

    P1Logger.log('P1 API Handler initialized');

})();
