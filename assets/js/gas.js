/**
 * Gas Page Manager
 * Handles chart rendering and interactivity for gas data
 * Uses ChartBase for common functionality
 */

(function() {
    'use strict';

    const GasManager = window.ChartBase.createManager({
        canvasId: 'gas-chart',
        zoomButtonsId: 'zoom-buttons-gas',
        pageName: 'gas',
        defaultPeriod: 'hours',
        defaultZoom: 24,
        features: {
            showSecondaryAxis: true
        },

        onInit() {
            this.plotValues = [];
            this.degreeDaysData = null;
            this.showDegreeDays = true;
            this.showTemp = false;
            this.temperatureData = null;
            this.updateLegend();
        },

        onSetupEventListeners() {
            const degreeDaysToggle = document.getElementById('toggle-gas-degree-days');
            if (degreeDaysToggle) {
                degreeDaysToggle.addEventListener('change', (e) => {
                    this.showDegreeDays = e.target.checked;
                    this.updateLegend();
                    this.redrawChart();
                });
            }

            const tempToggle = document.getElementById('toggle-gas-temp');
            if (tempToggle) {
                tempToggle.addEventListener('change', async (e) => {
                    this.showTemp = e.target.checked;
                    this.updateLegend();

                    if (this.showTemp && !this.temperatureData) {
                        await this.fetchTemperatureData();
                    }

                    this.redrawChart();
                });
            }
        },

        async onLoadData() {
            try {
                ChartBase.showLoading();

                const payload = await window.P1API.getElectricityData(this.currentPeriod, this.currentZoom, false);

                if (!payload || !payload.chartData) {
                    ChartBase.showError('Geen data beschikbaar');
                    return;
                }

                this.data = this.fillMissingData(payload.chartData, this.currentPeriod);

                await this.fetchDegreeDays();

                if (this.showTemp) {
                    await this.fetchTemperatureData();
                }

                this.updateStatistics();
                this.redrawChart();
                ChartBase.hideError();
            } catch (err) {
                P1Logger.error('Error loading gas data', err);
                ChartBase.showError('Fout bij ophalen gasdata');
            } finally {
                ChartBase.hideLoading();
            }
        },

        onUpdateStatistics() {
            if (!this.data || this.data.length === 0) return;

            const gasValues = this.data.map(d => parseFloat(d.gas) || 0);
            this.plotValues = gasValues;

            const total = gasValues.reduce((s, v) => s + v, 0);
            const avg = gasValues.length > 0 ? total / gasValues.length : 0;
            const hasConsumption = total > 0.001;

            let peakValue = 0;
            let peakTime = '';
            gasValues.forEach((v, idx) => {
                if (v > peakValue) {
                    peakValue = v;
                    const p = this.data[idx];
                    peakTime = p ? (p.timestamp || p.unixTimestamp || '') : '';
                }
            });

            let flow = 0;
            if (this.currentPeriod === 'hours' && gasValues.length > 0) {
                flow = gasValues[gasValues.length - 1] || 0;
            } else if (this.currentPeriod === 'days' && gasValues.length > 0) {
                flow = (gasValues[gasValues.length - 1] || 0) / 24;
            } else if (gasValues.length >= 2) {
                const lastValue = gasValues[gasValues.length - 1];
                const secondLastValue = gasValues[gasValues.length - 2];
                const avgRecent = (lastValue + secondLastValue) / 2;
                if (this.currentPeriod === 'months') {
                    flow = avgRecent / (30 * 24);
                } else if (this.currentPeriod === 'years') {
                    flow = avgRecent / (365 * 24);
                }
            }

            const periodLabel = ChartBase.periodLabels[this.currentPeriod] || 'periodes';
            const periodLabelSingular = ChartBase.periodLabelsSingular[this.currentPeriod] || 'periode';

            if (this.currentPeriod === 'hours') {
                const currentConsumption = gasValues[gasValues.length - 1] || 0;
                if (currentConsumption > 0.001) {
                    ChartBase.updateElement('stat-total-gas', ChartBase.formatNumber(currentConsumption, 3) + ' m³');
                    ChartBase.updateElement('stat-gas-period', `Huidig uur`);
                } else {
                    ChartBase.updateElement('stat-total-gas', '0.000 m³');
                    ChartBase.updateElement('stat-gas-period', `Geen verbruik`);
                }
            } else {
                if (hasConsumption) {
                    ChartBase.updateElement('stat-total-gas', ChartBase.formatNumber(total, 3) + ' m³');
                    ChartBase.updateElement('stat-gas-period', `Laatste ${this.currentZoom} ${periodLabel}`);
                } else {
                    ChartBase.updateElement('stat-total-gas', '0.000 m³');
                    ChartBase.updateElement('stat-gas-period', `Geen verbruik`);
                }
            }

            if (hasConsumption) {
                // Gas cost uses config value from config.php (default: €1.50/m³)
                const gasCost = window.P1MonConfig?.gasCostPerM3 ?? 1.50;
                ChartBase.updateElement('stat-gas-cost', '€ ' + ChartBase.formatNumber(total * gasCost, 2));
                ChartBase.updateElement('stat-gas-cost-period', `Geschat`);
            } else {
                ChartBase.updateElement('stat-gas-cost', '€ 0.00');
                ChartBase.updateElement('stat-gas-cost-period', `Geen verbruik`);
            }

            ChartBase.updateElement('stat-gas-average', ChartBase.formatNumber(avg, 3) + ' m³');
            ChartBase.updateElement('stat-gas-average-period', `per ${periodLabelSingular}`);

            if (flow > 0.001) {
                ChartBase.updateElement('stat-gas-flow', ChartBase.formatNumber(flow, 3) + ' m³/h');
            } else {
                ChartBase.updateElement('stat-gas-flow', '0.000 m³/h');
            }

            if (hasConsumption && peakValue > 0.001) {
                ChartBase.updateElement('stat-gas-peak', ChartBase.formatNumber(peakValue, 3) + ' m³');
                ChartBase.updateElement('stat-gas-peak-time', this.formatPeakTime(peakTime));
            } else {
                ChartBase.updateElement('stat-gas-peak', '--');
                ChartBase.updateElement('stat-gas-peak-time', 'Geen verbruik');
            }
        },

        onDrawChart(dimensions, theme) {
            const { paddingLeft, paddingRight, paddingTop, paddingBottom, graphWidth, graphHeight, width, height } = dimensions;

            const values = this.plotValues.length > 0 ? this.plotValues : this.data.map(d => parseFloat(d.gas) || 0);
            const maxV = Math.max(...values, 0.001);
            const ticks = ChartBase.calculateNiceTicks(0, maxV, 5);
            const niceMax = Math.max(...ticks);

            // Draw Y-axis
            ChartBase.drawYAxis(this.ctx, dimensions, theme, ticks, niceMax, 'm³');
            ChartBase.drawXAxisLine(this.ctx, dimensions, theme);

            // Draw bars
            const count = values.length;
            const totalBarWidth = graphWidth / count;
            const barWidth = Math.max(totalBarWidth - 2, 1);

            this.ctx.fillStyle = '#fb923c';
            values.forEach((v, idx) => {
                const x = paddingLeft + idx * totalBarWidth + 1;
                const h = (v / niceMax) * graphHeight;
                const y = paddingTop + graphHeight - h;
                this.ctx.fillRect(x, y, barWidth, h);
            });

            // Draw degree days line
            if (this.showDegreeDays && this.degreeDaysData && this.degreeDaysData.length > 0) {
                this.drawDegreeDaysLine(dimensions, theme, totalBarWidth);
            }

            // Draw temperature lines
            if (this.showTemp && this.temperatureData) {
                this.drawTemperatureOverlay(dimensions, theme, totalBarWidth);
            }

            // Draw X-axis labels
            ChartBase.drawXAxisLabels(this.ctx, dimensions, theme, this.data, this.currentPeriod);
        },

        onDrawTooltipContent(point, index) {
            const ts = point.unixTimestamp || (typeof point.timestamp === 'string' && parseInt(point.timestamp));
            const date = ts ? new Date(ts * 1000) : new Date();
            const header = ChartBase.formatTooltipTime(date, this.currentPeriod);

            const gasValue = this.plotValues[index] !== undefined ? this.plotValues[index] : (parseFloat(point.gas) || 0);
            const lines = [
                { text: `Verbruik: ${ChartBase.formatNumber(gasValue, 3)} m³`, color: '#fb923c' }
            ];

            if (this.showDegreeDays && this.degreeDaysData && this.degreeDaysData[index] !== undefined) {
                lines.push({ text: `Graaddagen: ${ChartBase.formatNumber(this.degreeDaysData[index], 1)}`, color: '#3b82f6' });
            }

            if (this.showTemp && this.temperatureData && index < this.temperatureData.min.length) {
                const tempMin = this.temperatureData.min[index];
                const tempAvg = this.temperatureData.avg[index];
                const tempMax = this.temperatureData.max[index];

                if (tempMin !== null && tempAvg !== null && tempMax !== null) {
                    lines.push({ text: `Max: ${ChartBase.formatNumber(tempMax, 1)}°C`, color: '#ef4444' });
                    lines.push({ text: `Gem: ${ChartBase.formatNumber(tempAvg, 1)}°C`, color: '#374151' });
                    lines.push({ text: `Min: ${ChartBase.formatNumber(tempMin, 1)}°C`, color: '#3b82f6' });
                }
            }

            return { header, lines };
        }
    });

    // Custom methods for gas-specific functionality
    Object.assign(GasManager, {
        updateLegend() {
            const degreeDaysLegend = document.getElementById('legend-degree-days');
            if (degreeDaysLegend) {
                degreeDaysLegend.style.display = this.showDegreeDays ? 'inline-flex' : 'none';
            }

            ['legend-temp-max', 'legend-temp-avg', 'legend-temp-min'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = this.showTemp ? 'inline-flex' : 'none';
            });
        },

        formatPeakTime(ts) {
            if (!ts) return '--:--';
            if (typeof ts === 'number' || /^\d+$/.test(String(ts))) {
                const d = new Date((parseInt(ts) || 0) * 1000);
                return d.toLocaleString();
            }
            return ts;
        },

        fillMissingData(data, period) {
            if (data.length === 0) return data;

            data.sort((a, b) => (a.unixTimestamp || 0) - (b.unixTimestamp || 0));

            const filled = [];
            const startTs = data[0].unixTimestamp || 0;
            const endTs = data[data.length - 1].unixTimestamp || 0;
            const startDate = new Date(startTs * 1000);
            const endDate = new Date(endTs * 1000);

            const dataMap = new Map();
            data.forEach(d => {
                const ts = d.unixTimestamp || 0;
                const key = ChartBase.getPeriodKey(ts, period);
                if (!dataMap.has(key)) {
                    dataMap.set(key, []);
                }
                dataMap.get(key).push(d);
            });

            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const ts = Math.floor(currentDate.getTime() / 1000);
                const key = ChartBase.getPeriodKey(ts, period);

                if (dataMap.has(key)) {
                    const dataPoints = dataMap.get(key);
                    filled.push(dataPoints[dataPoints.length - 1]);
                } else {
                    filled.push({
                        timestamp: ts.toString(),
                        unixTimestamp: ts,
                        gas: 0
                    });
                }

                if (period === 'hours') {
                    currentDate.setHours(currentDate.getHours() + 1);
                } else if (period === 'days') {
                    currentDate.setDate(currentDate.getDate() + 1);
                } else if (period === 'months') {
                    currentDate.setMonth(currentDate.getMonth() + 1);
                } else if (period === 'years') {
                    currentDate.setFullYear(currentDate.getFullYear() + 1);
                } else {
                    currentDate.setHours(currentDate.getHours() + 1);
                }
            }

            return filled;
        },

        getWeatherEndpoint() {
            const periodMap = { hours: 'hour', days: 'day', months: 'month', years: 'year' };
            const endpoint = periodMap[this.currentPeriod];
            if (!endpoint) return null;
            return `${window.P1API.BASE_PATH}/v1/weather/${endpoint}?limit=${this.currentZoom}`;
        },

        async fetchDegreeDays() {
            try {
                if (!this.data || this.data.length === 0) {
                    this.degreeDaysData = null;
                    return;
                }

                const weatherEndpoint = this.getWeatherEndpoint();
                if (!weatherEndpoint) {
                    this.degreeDaysData = null;
                    return;
                }

                const weatherData = await window.P1API.fetch(weatherEndpoint);

                if (!weatherData || weatherData.length === 0) {
                    this.degreeDaysData = null;
                    return;
                }

                const degreeDays = [];
                const weatherMap = new Map();

                weatherData.forEach(record => {
                    const timestamp = parseInt(record.TIMESTAMP_UTC);
                    const degreeDaysValue = parseFloat(record.DEGREE_DAYS) || 0;
                    const key = ChartBase.getPeriodKey(timestamp, this.currentPeriod);
                    weatherMap.set(key, degreeDaysValue);
                });

                this.data.forEach(gasPoint => {
                    const key = ChartBase.getPeriodKey(gasPoint.unixTimestamp, this.currentPeriod);
                    degreeDays.push(weatherMap.get(key) || 0);
                });

                this.degreeDaysData = degreeDays;
            } catch (error) {
                P1Logger.warn('Could not fetch degree days:', error);
                this.degreeDaysData = null;
            }
        },

        async fetchTemperatureData() {
            try {
                if (!this.data || this.data.length === 0) {
                    this.temperatureData = null;
                    return;
                }

                const weatherEndpoint = this.getWeatherEndpoint();
                if (!weatherEndpoint) {
                    this.temperatureData = null;
                    return;
                }

                const weatherData = await window.P1API.fetch(weatherEndpoint);

                if (!weatherData || weatherData.length === 0) {
                    this.temperatureData = null;
                    return;
                }

                const tempMap = new Map();
                weatherData.forEach(record => {
                    const timestamp = parseInt(record.TIMESTAMP_UTC);
                    const tempLow = parseFloat(record.TEMPERATURE_LOW);
                    const tempAvg = parseFloat(record.TEMPERATURE_AVERAGE);
                    const tempHigh = parseFloat(record.TEMPERATURE_HIGH);

                    if (!isNaN(timestamp) && !isNaN(tempLow) && !isNaN(tempAvg) && !isNaN(tempHigh)) {
                        const key = ChartBase.getPeriodKey(timestamp, this.currentPeriod);
                        tempMap.set(key, { min: tempLow, avg: tempAvg, max: tempHigh });
                    }
                });

                const tempData = { min: [], avg: [], max: [] };

                this.data.forEach(gasPoint => {
                    const key = ChartBase.getPeriodKey(gasPoint.unixTimestamp, this.currentPeriod);
                    const temp = tempMap.get(key);
                    if (temp) {
                        tempData.min.push(temp.min);
                        tempData.avg.push(temp.avg);
                        tempData.max.push(temp.max);
                    } else {
                        tempData.min.push(null);
                        tempData.avg.push(null);
                        tempData.max.push(null);
                    }
                });

                this.temperatureData = tempData;
            } catch (error) {
                P1Logger.warn('Could not fetch temperature data:', error);
                this.temperatureData = null;
            }
        },

        drawDegreeDaysLine(dimensions, theme, totalBarWidth) {
            const { paddingLeft, paddingTop, paddingRight, graphWidth, graphHeight } = dimensions;

            const maxDD = Math.max(...this.degreeDaysData, 0.1);
            const minDD = Math.min(...this.degreeDaysData, 0);

            const ddTicks = ChartBase.calculateNiceTicks(minDD, maxDD, 5);
            const niceMinDD = Math.min(...ddTicks);
            const niceMaxDD = Math.max(...ddTicks);
            const ddRange = niceMaxDD - niceMinDD;

            const getDDY = (value) => {
                const ratio = (value - niceMinDD) / (ddRange || 1);
                return paddingTop + graphHeight - (ratio * graphHeight);
            };

            // Draw degree days line
            const points = this.degreeDaysData.map((dd, idx) => ({
                x: paddingLeft + (idx * totalBarWidth) + totalBarWidth / 2,
                y: getDDY(dd)
            }));

            this.ctx.strokeStyle = '#3b82f6';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([]);
            this.ctx.beginPath();

            points.forEach((point, idx) => {
                if (idx === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            });

            this.ctx.stroke();

            // Draw right Y-axis for degree days
            const rightX = paddingLeft + graphWidth;

            this.ctx.strokeStyle = theme.gridColor;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(rightX, paddingTop);
            this.ctx.lineTo(rightX, paddingTop + graphHeight);
            this.ctx.stroke();

            this.ctx.fillStyle = theme.textColor;
            this.ctx.font = '11px sans-serif';
            this.ctx.textAlign = 'left';

            ddTicks.forEach(ddValue => {
                const y = getDDY(ddValue);

                this.ctx.strokeStyle = theme.gridColor;
                this.ctx.beginPath();
                this.ctx.moveTo(rightX, y);
                this.ctx.lineTo(rightX + 5, y);
                this.ctx.stroke();

                const label = Math.abs(ddValue) >= 10 ? Math.round(ddValue).toString() : ddValue.toFixed(1);
                this.ctx.fillText(label, rightX + 8, y + 4);
            });
        },

        drawTemperatureOverlay(dimensions, theme, totalBarWidth) {
            const { paddingLeft, paddingTop, graphWidth, graphHeight } = dimensions;

            let minTemp = Infinity;
            let maxTemp = -Infinity;

            ['min', 'avg', 'max'].forEach(series => {
                this.temperatureData[series].forEach(t => {
                    if (t !== null && !isNaN(t)) {
                        minTemp = Math.min(minTemp, t);
                        maxTemp = Math.max(maxTemp, t);
                    }
                });
            });

            if (!isFinite(minTemp) || !isFinite(maxTemp)) return;

            const tempRange = maxTemp - minTemp;
            const padding = Math.max(tempRange * 0.1, 1);
            minTemp -= padding;
            maxTemp += padding;
            const tempScale = { min: minTemp, max: maxTemp, range: maxTemp - minTemp };

            // Convert temperature data to format expected by ChartBase
            const tempData = [];
            for (let i = 0; i < this.temperatureData.min.length; i++) {
                tempData.push({
                    min: this.temperatureData.min[i],
                    avg: this.temperatureData.avg[i],
                    max: this.temperatureData.max[i]
                });
            }

            ChartBase.drawTemperatureLines(this.ctx, dimensions, tempData, tempScale);
            ChartBase.drawTemperatureAxis(this.ctx, dimensions, theme, tempScale);
        }
    });

    // Auto-initialize
    document.addEventListener('DOMContentLoaded', () => {
        if (window.P1MonConfig && window.P1MonConfig.currentPage === 'gas') {
            GasManager.init();
        }
    });

})();
