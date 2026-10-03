/**
 * Header Manager
 * Handles header widgets: time, weather, and solar production
 *
 * The latest weather and solar readings are also published for other
 * scripts (the dashboard shows them on phones, where the header hides
 * them): window.P1Live.{weather,solar} plus a 'p1:live' event with
 * detail { key, value }. solar is { power, todayKWh } or null when the
 * solar database is unavailable.
 */

(function() {
    'use strict';

    const HeaderManager = {
        timers: [],

        init() {
            P1Logger.log('[Header] Initialized');
            this.start();

            // No polling while the tab is in the background
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.destroy();
                else this.start();
            });
        },

        start() {
            if (this.timers.length) return;

            this.updateTime();
            this.loadWeather();
            this.loadSolarWidget();
            this.loadUpdateNotice();

            // Update time every second
            this.timers.push(setInterval(() => this.updateTime(), 1000));

            // Update weather every 5 minutes
            this.timers.push(setInterval(() => {
                P1Logger.log('[Header] Refreshing weather data');
                this.loadWeather();
            }, 300000));

            // P1 Monitor checks for new releases itself, about daily; hourly is plenty
            this.timers.push(setInterval(() => this.loadUpdateNotice(), 3600000));

            // Update solar widget every 10 seconds
            this.timers.push(setInterval(() => {
                P1Logger.log('[Header] Refreshing solar widget');
                this.loadSolarWidget();
            }, 10000));
        },

        publish(key, value) {
            window.P1Live = window.P1Live || {};
            window.P1Live[key] = value;
            document.dispatchEvent(new CustomEvent('p1:live', { detail: { key, value } }));
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
                // Use P1 Monitor weather API.
                // limit=1 matters: without it this endpoint returns the entire
                // weather history (~3000 records, ~900KB) and we use only the
                // newest one. Records come back newest first.
                const response = await fetch('/api/v1/weather?limit=1&json=object');
                if (!response.ok) return;

                const data = await response.json();
                if (!Array.isArray(data) || data.length === 0) return;

                // Get most recent weather record (named properties via ?json=object)
                const latest = data[0];
                this.publish('weather', latest);

                // Update weather display
                const tempEl = document.getElementById('weather-temp');
                const humidityEl = document.getElementById('weather-humidity');
                const windEl = document.getElementById('weather-wind');
                const pressureEl = document.getElementById('weather-pressure');

                if (tempEl && latest.TEMPERATURE !== undefined) {
                    tempEl.textContent = `${Math.round(latest.TEMPERATURE)}°C`;
                }
                if (humidityEl && latest.HUMIDITY !== undefined) {
                    humidityEl.textContent = `${Math.round(latest.HUMIDITY)}%`;
                }
                if (windEl && latest.WIND_SPEED !== undefined) {
                    windEl.textContent = `${P1Utils.formatNumber(latest.WIND_SPEED, 1)} m/s`;
                }
                if (pressureEl && latest.PRESSURE !== undefined) {
                    pressureEl.textContent = `${Math.round(latest.PRESSURE)} hPa`;
                }
                
                // Show weather widget
                const weatherInfo = document.getElementById('weather-info');
                if (weatherInfo) {
                    weatherInfo.style.display = 'flex';
                }
                
            } catch (err) {
                P1Logger.error('Error loading weather:', err);
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

                // Reaching the catch below hides the widget, which is the right
                // outcome when the database is unavailable: better absent than
                // reporting zero production.
                if ((current && current.error) || (today && today.error)) {
                    throw new Error(current.error || today.error);
                }

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
                    todayEl.textContent = P1Utils.formatNumber(totalEnergy, 2) + ' kWh';
                    this.publish('solar', { power: parseFloat(current.power) || 0, todayKWh: totalEnergy });
                }
                
                // Show solar widget
                const solarWidget = document.getElementById('solar-widget');
                if (solarWidget) {
                    solarWidget.style.display = 'flex';
                }
                
            } catch (err) {
                P1Logger.error('Error loading solar widget:', err);
                this.publish('solar', null);
                // Don't show widget if solar data unavailable
                const solarWidget = document.getElementById('solar-widget');
                if (solarWidget) {
                    solarWidget.style.display = 'none';
                }
            }
        },

        /**
         * P1 Monitor's own update notice. Its status table carries the flags:
         *   136 new software version available   66 version, 86 release URL
         *   137 new patch available              133 patch number, 134 patch URL
         * A flag is "1" when set. The badge hides when neither is, or when the
         * status cannot be read.
         */
        async loadUpdateNotice() {
            const badge = document.getElementById('update-badge');
            if (!badge) return;
            try {
                const response = await fetch('/api/v1/status?json=object');
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const rows = await response.json();
                if (!Array.isArray(rows)) throw new Error('Unexpected status payload');

                const status = {};
                rows.forEach(row => { status[row.STATUS_ID] = String(row.STATUS ?? '').trim(); });

                const newVersion = status[136] === '1';
                const newPatch = status[137] === '1';
                if (!newVersion && !newPatch) {
                    badge.hidden = true;
                    return;
                }

                const patchNr = /^[1-9]\d*$/.test(status[133] || '') ? status[133] : '';
                const versionText = status[66] ? `Update ${status[66]}` : 'Update';
                const patchText = patchNr ? `Patch ${patchNr}` : 'Patch';
                const text = newVersion ? versionText : patchText;
                const detail = [
                    newVersion ? `Nieuwe P1 Monitor-versie beschikbaar${status[66] ? ': ' + status[66] : ''}` : '',
                    newPatch ? `Nieuwe patch beschikbaar${patchNr ? ': ' + patchNr : ''}` : ''
                ].filter(Boolean).join('. ');

                // Only link to http(s) addresses
                const url = (newVersion ? status[86] : status[134]) || status[86] || status[134] || '';
                const safeUrl = /^https?:\/\//i.test(url) ? url : 'https://www.p1-monitor.nl/';

                document.getElementById('update-badge-text').textContent = text;
                badge.href = safeUrl;
                badge.title = detail;
                badge.setAttribute('aria-label', detail);
                badge.hidden = false;
            } catch (err) {
                P1Logger.error('Error loading update notice:', err);
                badge.hidden = true;
            }
        },

        formatPower(watts) {
            const w = parseFloat(watts) || 0;
            if (w >= 1000) {
                return P1Utils.formatNumber(w / 1000, 2) + ' kW';
            }
            return Math.round(w) + ' W';
        },

        destroy() {
            this.timers.forEach(id => clearInterval(id));
            this.timers = [];
        }
    };

    // Auto-init on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        HeaderManager.init();
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        HeaderManager.destroy();
    });

})();