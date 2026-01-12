/**
 * Header Manager
 * Handles weather info and current time display in header
 */

(function() {
    'use strict';
    
    const HeaderManager = {
        // Update intervals
        weatherInterval: null,
        timeInterval: null,
        
        /**
         * Initialize header features
         */
        init() {
            console.log('Initializing header...');
            
            // Start time display
            this.updateTime();
            this.timeInterval = setInterval(() => {
                this.updateTime();
            }, 1000);
            
            // Start weather updates
            this.updateWeather();
            this.weatherInterval = setInterval(() => {
                this.updateWeather();
            }, 300000); // Update every 5 minutes
            
            console.log('Header initialized');
        },
        
        /**
         * Update current time display
         */
        updateTime() {
            const timeEl = document.getElementById('current-time');
            if (!timeEl) return;
            
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            
            timeEl.textContent = `${hours}:${minutes}`;
        },
        
/**
         * Update weather information
         */
        async updateWeather() {
            try {
                console.log('Fetching weather data...');
                const weatherData = await window.P1API.getWeather();
                
                console.log('Weather response:', weatherData);
                
                if (!weatherData || !Array.isArray(weatherData) || weatherData.length === 0) {
                    console.warn('No weather data available');
                    return;
                }
                
                // Get the most recent weather record (first in array)
                const latest = weatherData[0];
                console.log('Latest weather record:', latest);
                
                // Parse the weather data from P1 Monitor format
                // Format: [timestamp, unix_ts, location_id, location, temp, desc, icon, pressure, humidity, wind_speed, ...]
                const weather = {
                    temp: parseFloat(latest[4]),
                    humidity: parseInt(latest[8]),
                    pressure: parseInt(latest[7]),
                    windSpeed: parseFloat(latest[9]),
                    description: latest[5],
                    location: latest[3]
                };
                
                console.log('Parsed weather:', weather);
                
                // Update temperature
                const tempEl = document.getElementById('weather-temp');
                if (tempEl && !isNaN(weather.temp)) {
                    tempEl.textContent = `${Math.round(weather.temp)}°C`;
                }
                
                // Update humidity
                const humidityEl = document.getElementById('weather-humidity');
                if (humidityEl && !isNaN(weather.humidity)) {
                    humidityEl.textContent = `${weather.humidity}%`;
                }
                
                // Update wind speed
                const windEl = document.getElementById('weather-wind');
                if (windEl && !isNaN(weather.windSpeed)) {
                    windEl.textContent = `${Math.round(weather.windSpeed)} m/s`;
                }
                
                // Update pressure
                const pressureEl = document.getElementById('weather-pressure');
                if (pressureEl && !isNaN(weather.pressure)) {
                    pressureEl.textContent = `${weather.pressure} hPa`;
                }
                
                // Show weather info container
                const weatherInfo = document.getElementById('weather-info');
                if (weatherInfo) {
                    weatherInfo.style.display = 'flex';
                }
                
                console.log('Weather updated successfully');
                
            } catch (error) {
                console.error('Weather fetch error:', error);
                // Don't show weather info if not available
                const weatherInfo = document.getElementById('weather-info');
                if (weatherInfo) {
                    weatherInfo.style.display = 'none';
                }
            }
        },
        
        /**
         * Cleanup on page unload
         */
        destroy() {
            if (this.timeInterval) {
                clearInterval(this.timeInterval);
            }
            if (this.weatherInterval) {
                clearInterval(this.weatherInterval);
            }
        }
    };
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            HeaderManager.init();
        });
    } else {
        HeaderManager.init();
    }
    
    // Expose globally
    window.HeaderManager = HeaderManager;
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        HeaderManager.destroy();
    });
    
})();