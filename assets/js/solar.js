/**
 * Solar Page Manager
 * Handles chart rendering and interactivity for solar production data
 * Uses ChartBase for common functionality
 */

(function() {
    'use strict';

    const SolarManager = window.ChartBase.createManager({
        canvasId: 'solar-chart',
        zoomButtonsId: 'zoom-buttons-solar',
        pageName: 'solar',
        defaultPeriod: 'hours',
        defaultZoom: 24,
        features: {},

        onInit() {
            this.showSmoothed = true;
            this.showTemp = false;
            this.temperatureData = null;
            // System capacity from config.php (default: 3780W for 14 × 270Wp panels)
            this.systemCapacity = window.P1MonConfig?.systemCapacityW ?? 3780;
        },

        onSetupEventListeners() {
            const smoothToggle = document.getElementById('toggle-solar-smoothed');
            if (smoothToggle) {
                smoothToggle.addEventListener('change', (e) => {
                    this.showSmoothed = e.target.checked;
                    this.redrawChart();
                });
            }

            const tempToggle = document.getElementById('toggle-solar-temp');
            if (tempToggle) {
                tempToggle.addEventListener('change', (e) => {
                    this.showTemp = e.target.checked;
                    this.toggleTemperatureLegend(e.target.checked);
                    if (e.target.checked && !this.temperatureData) {
                        this.loadTemperatureData();
                    } else {
                        this.redrawChart();
                    }
                });
            }
        },

        async onLoadData() {
            try {
                ChartBase.showLoading();

                const url = `/custom/api/solar.php?period=${this.currentPeriod}&zoom=${this.currentZoom}`;
                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const payload = await response.json();

                if (!payload || !payload.chartData) {
                    ChartBase.showError('Geen data beschikbaar');
                    return;
                }

                this.data = payload.chartData;
                this.updateStatistics(payload.stats);

                if (this.showTemp) {
                    await this.loadTemperatureData();
                } else {
                    this.redrawChart();
                }

                ChartBase.hideError();
            } catch (err) {
                P1Logger.error('Error loading solar data:', err);
                ChartBase.showError('Fout bij ophalen zonnedata');
            } finally {
                ChartBase.hideLoading();
            }
        },

        onUpdateStatistics() {
            // Called by base, but we handle stats in updateStatistics with payload
        },

        onDrawChart(dimensions, theme) {
            const { paddingLeft, paddingRight, paddingTop, paddingBottom, graphWidth, graphHeight, width, height } = dimensions;

            // Update features based on current state
            this.features.showTemp = this.showTemp;

            const values = this.data.map(d => parseFloat(d.production) || 0);
            const maxV = Math.max(...values, 0.001);
            const ticks = ChartBase.calculateNiceTicks(0, maxV, 5);
            const niceMax = Math.max(...ticks);

            // Draw Y-axis
            ChartBase.drawYAxis(this.ctx, dimensions, theme, ticks, niceMax, 'kWh');
            ChartBase.drawXAxisLine(this.ctx, dimensions, theme);

            // Draw production bars with gradient
            const count = values.length;
            const totalBarWidth = graphWidth / count;
            const barWidth = Math.max(totalBarWidth - 2, 1);

            const gradient = this.ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
            gradient.addColorStop(0, '#fbbf24');
            gradient.addColorStop(1, '#f59e0b');

            this.ctx.fillStyle = gradient;

            values.forEach((v, idx) => {
                const x = paddingLeft + idx * totalBarWidth + 1;
                const h = (v / niceMax) * graphHeight;
                const y = paddingTop + graphHeight - h;
                this.ctx.fillRect(x, y, barWidth, h);
            });

            // Draw power line if enabled
            if (this.showSmoothed) {
                this.drawPowerLine(dimensions, totalBarWidth);
            }

            // Draw temperature overlay if enabled
            if (this.showTemp && this.temperatureData) {
                this.drawTemperatureOverlay(dimensions, theme);
            }

            // Draw X-axis labels
            ChartBase.drawXAxisLabels(this.ctx, dimensions, theme, this.data, this.currentPeriod);
        },

        onDrawTooltipContent(point, index) {
            const date = new Date(point.unixTimestamp * 1000);
            const header = ChartBase.formatTooltipTime(date, this.currentPeriod);

            const production = parseFloat(point.production) || 0;
            const power = parseFloat(point.power) || 0;

            const lines = [
                { text: `Productie: ${ChartBase.formatNumber(production, 3)} kWh`, color: '#f59e0b' },
                { text: `Vermogen: ${ChartBase.formatNumber(power, 0)} W`, color: '#ea580c' }
            ];

            if (this.showTemp && this.temperatureData) {
                const tempData = this.temperatureData[point.unixTimestamp];
                if (tempData) {
                    lines.push({
                        text: `Temp: ${ChartBase.formatNumber(tempData.min, 1)}°C - ${ChartBase.formatNumber(tempData.max, 1)}°C`,
                        color: '#666'
                    });
                }
            }

            return { header, lines };
        }
    });

    // Custom methods for solar-specific functionality
    Object.assign(SolarManager, {
        toggleTemperatureLegend(show) {
            ['legend-temp-max', 'legend-temp-avg', 'legend-temp-min'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = show ? 'inline-flex' : 'none';
            });
        },

        updateStatistics(stats) {
            if (!stats) {
                if (!this.data || this.data.length === 0) return;

                const totalEnergy = this.data.reduce((sum, d) => sum + (parseFloat(d.production) || 0), 0);
                const powers = this.data.map(d => parseFloat(d.power) || 0);
                const maxPower = Math.max(...powers);
                const maxIndex = powers.indexOf(maxPower);
                const peakTime = maxIndex >= 0 ? this.data[maxIndex].timestamp : '';

                stats = {
                    totalEnergy: totalEnergy,
                    peakPower: { value: maxPower, time: peakTime }
                };
            }

            const periodLabel = ChartBase.periodLabels[this.currentPeriod] || 'uren';

            const currentPower = this.data && this.data.length > 0 ?
                (parseFloat(this.data[this.data.length - 1].power) || 0) : 0;
            ChartBase.updateElement('stat-current-power', ChartBase.formatNumber(currentPower, 0) + ' W');

            ChartBase.updateElement('stat-total-energy', ChartBase.formatNumber(stats.totalEnergy || 0, 2) + ' kWh');
            ChartBase.updateElement('stat-energy-period', `Laatste ${this.currentZoom} ${periodLabel}`);

            const peakPower = stats.peakPower?.value || 0;
            ChartBase.updateElement('stat-peak-power', ChartBase.formatNumber(peakPower, 0) + ' W');
            ChartBase.updateElement('stat-peak-time', this.formatPeakTime(stats.peakPower?.time));

            const capacityFactor = this.calculateCapacityFactor(stats.totalEnergy || 0);
            ChartBase.updateElement('stat-capacity-factor', ChartBase.formatNumber(capacityFactor, 1) + '%');
            ChartBase.updateElement('stat-capacity-period', `Laatste ${this.currentZoom} ${periodLabel}`);

            const sunlightHours = this.calculateSunlightHours();
            ChartBase.updateElement('stat-sunlight-hours', ChartBase.formatNumber(sunlightHours, 1) + ' uur');
        },

        calculateCapacityFactor(totalEnergyKWh) {
            let hours = this.currentZoom;
            if (this.currentPeriod === 'days') hours *= 24;
            else if (this.currentPeriod === 'months') hours = this.currentZoom * 30 * 24;
            else if (this.currentPeriod === 'years') hours = this.currentZoom * 365 * 24;

            const systemCapacityKW = this.systemCapacity / 1000;
            const theoreticalMaxKWh = systemCapacityKW * hours;

            if (theoreticalMaxKWh === 0) return 0;
            return (totalEnergyKWh / theoreticalMaxKWh) * 100;
        },

        calculateSunlightHours() {
            if (!this.data || this.data.length === 0) return 0;

            const threshold = 10;
            let productiveHours = 0;

            this.data.forEach(point => {
                const power = parseFloat(point.power) || 0;
                if (power > threshold) {
                    if (this.currentPeriod === 'hours') {
                        productiveHours += 1;
                    } else if (this.currentPeriod === 'days') {
                        const production = parseFloat(point.production) || 0;
                        if (production > 0) productiveHours += 8;
                    } else {
                        const production = parseFloat(point.production) || 0;
                        const avgPower = 1000;
                        productiveHours += (production * 1000) / avgPower;
                    }
                }
            });

            return productiveHours;
        },

        formatPeakTime(ts) {
            if (!ts) return '--:--';

            let timestamp;
            if (typeof ts === 'string') {
                const date = new Date(ts);
                if (!isNaN(date.getTime())) {
                    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
                }
                timestamp = parseInt(ts);
            } else {
                timestamp = ts;
            }

            if (timestamp && !isNaN(timestamp)) {
                const date = new Date(timestamp * 1000);
                return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
            }

            return String(ts);
        },

        async loadTemperatureData() {
            try {
                let hoursNeeded = this.currentZoom;
                if (this.currentPeriod === 'days') hoursNeeded *= 24;
                else if (this.currentPeriod === 'months') hoursNeeded = this.currentZoom * 30 * 24;
                else if (this.currentPeriod === 'years') hoursNeeded = this.currentZoom * 365 * 24;

                const url = `/api/v1/weather/hour?limit=${hoursNeeded}&json=object`;
                const response = await fetch(url);

                if (!response.ok) {
                    P1Logger.warn('Failed to load temperature data');
                    return;
                }

                const weatherData = await response.json();
                this.temperatureData = this.processTemperatureData(weatherData);
                this.redrawChart();
            } catch (err) {
                P1Logger.error('Error loading temperature data:', err);
            }
        },

        processTemperatureData(weatherData) {
            if (!Array.isArray(weatherData)) return {};

            const tempMap = {};

            weatherData.forEach(record => {
                const timestamp = parseInt(record.TIMESTAMP_UTC);
                const tempLow = parseFloat(record.TEMPERATURE_LOW);
                const tempAvg = parseFloat(record.TEMPERATURE_AVERAGE);
                const tempHigh = parseFloat(record.TEMPERATURE_HIGH);

                let key;
                if (this.currentPeriod === 'hours') {
                    key = Math.floor(timestamp / 3600) * 3600;
                } else {
                    const date = new Date(timestamp * 1000);
                    date.setHours(0, 0, 0, 0);
                    key = Math.floor(date.getTime() / 1000);
                }

                if (!tempMap[key]) {
                    tempMap[key] = { min: tempLow, avg: tempAvg, max: tempHigh };
                } else {
                    tempMap[key].min = Math.min(tempMap[key].min, tempLow);
                    tempMap[key].max = Math.max(tempMap[key].max, tempHigh);
                    tempMap[key].avg = (tempMap[key].avg + tempAvg) / 2;
                }
            });

            return tempMap;
        },

        drawPowerLine(dimensions, totalBarWidth) {
            const { paddingLeft, paddingTop, graphHeight } = dimensions;

            const powers = this.data.map(d => parseFloat(d.power) || 0);
            const maxPower = Math.max(...powers, 1);

            const points = powers.map((power, idx) => ({
                x: paddingLeft + (idx * totalBarWidth) + totalBarWidth / 2,
                y: paddingTop + graphHeight - ((power / maxPower) * graphHeight * 0.7)
            }));

            this.ctx.strokeStyle = '#ea580c';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();

            points.forEach((point, idx) => {
                if (idx === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });

            this.ctx.stroke();
        },

        drawTemperatureOverlay(dimensions, theme) {
            if (!this.temperatureData) return;

            const { paddingLeft, paddingTop, paddingRight, graphWidth, graphHeight } = dimensions;

            // Find temperature range
            let minTemp = Infinity;
            let maxTemp = -Infinity;

            this.data.forEach(point => {
                const ts = point.unixTimestamp;
                const tempData = this.temperatureData[ts];
                if (tempData) {
                    minTemp = Math.min(minTemp, tempData.min);
                    maxTemp = Math.max(maxTemp, tempData.max);
                }
            });

            if (!isFinite(minTemp) || !isFinite(maxTemp)) return;

            const tempPadding = (maxTemp - minTemp) * 0.1;
            minTemp -= tempPadding;
            maxTemp += tempPadding;
            const tempRange = maxTemp - minTemp;
            const tempScale = { min: minTemp, max: maxTemp, range: tempRange };

            // Draw temperature axis
            const rightX = paddingLeft + graphWidth;
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(rightX, paddingTop);
            this.ctx.lineTo(rightX, paddingTop + graphHeight);
            this.ctx.stroke();

            this.ctx.fillStyle = '#666';
            this.ctx.font = '11px sans-serif';
            this.ctx.textAlign = 'left';

            for (let i = 0; i <= 4; i++) {
                const ratio = i / 4;
                const temp = minTemp + (tempRange * ratio);
                const y = paddingTop + graphHeight - (ratio * graphHeight);

                this.ctx.beginPath();
                this.ctx.moveTo(rightX, y);
                this.ctx.lineTo(rightX + 5, y);
                this.ctx.stroke();

                this.ctx.fillText(`${Math.round(temp)}°C`, rightX + 8, y + 4);
            }

            const getTempY = (temp) => {
                const ratio = (temp - minTemp) / tempRange;
                return paddingTop + graphHeight - (ratio * graphHeight);
            };

            const totalBarWidth = graphWidth / this.data.length;

            // Draw temperature lines
            ['max', 'avg', 'min'].forEach(type => {
                const colors = { max: '#ef4444', avg: '#f59e0b', min: '#3b82f6' };
                const dashed = type !== 'avg';

                this.ctx.strokeStyle = colors[type];
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash(dashed ? [5, 5] : []);
                this.ctx.beginPath();

                let started = false;
                this.data.forEach((point, idx) => {
                    const ts = point.unixTimestamp;
                    const tempData = this.temperatureData[ts];

                    if (tempData && tempData[type] !== undefined) {
                        const x = paddingLeft + (idx * totalBarWidth) + totalBarWidth / 2;
                        const y = getTempY(tempData[type]);

                        if (!started) {
                            this.ctx.moveTo(x, y);
                            started = true;
                        } else {
                            this.ctx.lineTo(x, y);
                        }
                    }
                });

                this.ctx.stroke();
            });

            this.ctx.setLineDash([]);
        }
    });

    // Auto-init when on solar page
    document.addEventListener('DOMContentLoaded', () => {
        if (window.P1MonConfig && window.P1MonConfig.currentPage === 'solar') {
            SolarManager.init();
        }
    });

})();
