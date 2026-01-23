/**
 * Header Manager
 * Handles header widgets: time, weather, and solar production
 */

(function() {
    'use strict';

    const HeaderManager = {
        updateInterval: null,

        init() {
            console.log('[Header] Initialized');
            this.updateTime();
            this.loadWeather();
            this.loadSolarWidget();
            
            // Update time every second
            setInterval(() => this.updateTime(), 1000);
            
            // Update weather every 5 minutes
            setInterval(() => {
                console.log('[Header] Refreshing weather data');
                this.loadWeather();
            }, 300000);
            
            // Update solar widget every 10 seconds
            setInterval(() => {
                console.log('[Header] Refreshing solar widget');
                this.loadSolarWidget();
            }, 10000);
        },

        updateTime() {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const timeEl = document.getElementById('current-time');
            if (timeEl) {
                timeEl.textContent = `${hours}:${minutes}`;
            }
        },

        async loadWeather() {
            try {
                // Use P1 Monitor weather API
                const response = await fetch('/api/v1/weather');
                if (!response.ok) return;
                
                const data = await response.json();
                if (!Array.isArray(data) || data.length === 0) return;
                
                // Get most recent weather record
                const latest = data[0];
                
                // Update weather display
                const tempEl = document.getElementById('weather-temp');
                const humidityEl = document.getElementById('weather-humidity');
                const windEl = document.getElementById('weather-wind');
                const pressureEl = document.getElementById('weather-pressure');
                
                if (tempEl && latest[4] !== undefined) {
                    tempEl.textContent = `${Math.round(latest[4])}°C`;
                }
                if (humidityEl && latest[11] !== undefined) {
                    humidityEl.textContent = `${Math.round(latest[11])}%`;
                }
                if (windEl && latest[14] !== undefined) {
                    windEl.textContent = `${latest[14].toFixed(1)} m/s`;
                }
                if (pressureEl && latest[8] !== undefined) {
                    pressureEl.textContent = `${Math.round(latest[8])} hPa`;
                }
                
                // Show weather widget
                const weatherInfo = document.getElementById('weather-info');
                if (weatherInfo) {
                    weatherInfo.style.display = 'flex';
                }
                
            } catch (err) {
                console.error('Error loading weather:', err);
            }
        },

        async loadSolarWidget() {
            try {
                // Get current solar production
                const currentResponse = await fetch('/custom/api/solar.php?action=current');
                if (!currentResponse.ok) throw new Error('Solar current API error');
                const current = await currentResponse.json();
                
                // Get today's total (last 24 hours, but we'll filter to today only)
                const todayResponse = await fetch('/custom/api/solar.php?period=hours&zoom=24');
                if (!todayResponse.ok) throw new Error('Solar today API error');
                const today = await todayResponse.json();
                
                // Update widget
                const powerEl = document.getElementById('solar-header-power');
                const todayEl = document.getElementById('solar-header-today');
                
                if (powerEl && current && current.power !== undefined) {
                    powerEl.textContent = this.formatPower(current.power);
                }
                
                if (todayEl && today && today.chartData) {
                    // Get midnight of today (00:00:00) as Unix timestamp
                    const now = new Date();
                    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const midnightTimestamp = Math.floor(todayMidnight.getTime() / 1000);
                    
                    // Filter data to only include records from today (after midnight)
                    const todayData = today.chartData.filter(point => {
                        const pointTimestamp = point.unixTimestamp || 0;
                        return pointTimestamp >= midnightTimestamp;
                    });
                    
                    // Calculate total energy for today only
                    const totalEnergy = todayData.reduce((sum, point) => {
                        return sum + (parseFloat(point.production) || 0);
                    }, 0);
                    todayEl.textContent = totalEnergy.toFixed(2) + ' kWh';
                }
                
                // Show solar widget
                const solarWidget = document.getElementById('solar-widget');
                if (solarWidget) {
                    solarWidget.style.display = 'flex';
                }
                
            } catch (err) {
                console.error('Error loading solar widget:', err);
                // Don't show widget if solar data unavailable
                const solarWidget = document.getElementById('solar-widget');
                if (solarWidget) {
                    solarWidget.style.display = 'none';
                }
            }
        },

        formatPower(watts) {
            const w = parseFloat(watts) || 0;
            if (w >= 1000) {
                return (w / 1000).toFixed(2) + ' kW';
            }
            return Math.round(w) + ' W';
        }
    };

    // Auto-init on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        HeaderManager.init();
    });

})();