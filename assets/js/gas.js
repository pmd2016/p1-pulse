/**
 * Gas Page Manager - CONSERVATIVE FIX
 * Handles chart rendering and interactivity for gas data
 * 
 * FIXES:
 * 1. Fixed fillMissingData() to not lose data points in same period
 * 2. Fixed statistics to show consumption per period (not cumulative)
 */

(function() {
    'use strict';

    const GasManager = {
        currentPeriod: 'hours',
        currentZoom: 24,
        data: null,
        canvas: null,
        ctx: null,
        plotValues: [],
        degreeDaysData: null,
        showDegreeDays: true, // Changed from false to true - visible by default
        showTemp: false,
        temperatureData: null,
        hoverState: {
            x: -1,
            y: -1,
            isHovering: false
        },

        // Zoom options per period
        zoomOptions: {
            hours: [
                { value: 24, label: '24 uur' },
                { value: 48, label: '48 uur' },
                { value: 72, label: '72 uur' }
            ],
            days: [
                { value: 7, label: '7 dagen' },
                { value: 14, label: '14 dagen' },
                { value: 30, label: '30 dagen' }
            ],
            months: [
                { value: 12, label: '12 maanden' },
                { value: 24, label: '24 maanden' }
            ],
            years: [
                { value: 5, label: '5 jaar' },
                { value: 10, label: '10 jaar' }
            ]
        },

        init() {
            this.canvas = document.getElementById('gas-chart');
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                this.setupChartHover();
            }

            this.setupEventListeners();
            this.updateZoomButtons();
            this.updateLegend(); // Initialize legend state
            this.loadData();

            window.addEventListener('resize', () => this.redrawChart());
        },

        setupChartHover() {
            if (!this.canvas) return;
            this.canvas.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                this.hoverState.x = e.clientX - rect.left;
                this.hoverState.y = e.clientY - rect.top;
                this.hoverState.isHovering = true;
                this.redrawChart();
            });

            this.canvas.addEventListener('mouseleave', () => {
                this.hoverState.isHovering = false;
                this.redrawChart();
            });
        },

        setupEventListeners() {
            document.querySelectorAll('.period-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const period = tab.dataset.period;
                    this.changePeriod(period);
                });
            });

            document.querySelectorAll('#zoom-buttons-gas [data-zoom], #zoom-buttons-gas .control-button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const zoom = parseInt(btn.dataset.zoom || btn.getAttribute('data-zoom'));
                    if (!isNaN(zoom)) this.changeZoom(zoom);
                });
            });

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
                    
                    // Fetch temperature data if enabling
                    if (this.showTemp && !this.temperatureData) {
                        await this.fetchTemperatureData();
                    }
                    
                    this.redrawChart();
                });
            }
        },

        updateZoomButtons() {
            const container = document.getElementById('zoom-buttons-gas');
            if (!container) return;
            container.innerHTML = '';
            const options = this.zoomOptions[this.currentPeriod] || this.zoomOptions.hours;
            options.forEach((opt, i) => {
                const btn = document.createElement('button');
                btn.className = 'control-button';
                btn.dataset.zoom = opt.value;
                btn.textContent = opt.label;
                if (i === 0) btn.classList.add('active');
                btn.addEventListener('click', () => this.changeZoom(opt.value));
                container.appendChild(btn);
            });
        },

        changePeriod(period) {
            this.currentPeriod = period;
            document.querySelectorAll('.period-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.period === period));
            const defaults = { hours: 24, days: 7, months: 12, years: 5 };
            this.currentZoom = defaults[period] || 24;
            console.log('Period changed to:', period, 'zoom set to:', this.currentZoom);
            this.updateZoomButtons();
            this.loadData();
        },

        changeZoom(zoom) {
            this.currentZoom = zoom;
            document.querySelectorAll('#zoom-buttons-gas .control-button').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.zoom) === zoom));
            this.loadData();
        },

        async loadData() {
            try {
                this.showLoading();
                const payload = await window.P1API.getElectricityData(this.currentPeriod, this.currentZoom, false);
                if (!payload || !payload.chartData) {
                    this.showError('Geen data beschikbaar');
                    console.warn('No chartData returned for period:', this.currentPeriod, 'zoom:', this.currentZoom);
                    return;
                }

                console.log('Gas data loaded for period:', this.currentPeriod, 'items:', payload.chartData.length);
                this.data = payload.chartData;
                this.data = this.fillMissingData(this.data, this.currentPeriod);
                console.log('After fillMissingData:', this.data.length, 'items');
                
                // Fetch degree days data
                await this.fetchDegreeDays();
                
                // Fetch temperature data if enabled
                if (this.showTemp) {
                    await this.fetchTemperatureData();
                }
                
                this.updateStatistics();
                this.redrawChart();
                this.hideError();
            } catch (err) {
                console.error('Error loading gas data', err);
                this.showError('Fout bij ophalen gasdata');
            } finally {
                this.hideLoading();
            }
        },

        updateStatistics() {
            if (!this.data || this.data.length === 0) return;

            // FIX: For HOURLY data, gas field contains cumulative meter readings
            // For DAILY/MONTHLY/YEARLY, it contains per-period consumption
            let gasValues;
            
            if (this.currentPeriod === 'hours') {
                // Calculate deltas (consumption per hour) from cumulative readings
                const raw = this.data.map(d => parseFloat(d.gas) || 0);
                gasValues = [];
                
                for (let i = 0; i < raw.length; i++) {
                    if (i === 0) {
                        // First data point: can't calculate delta, assume 0
                        gasValues.push(0);
                    } else {
                        let delta = raw[i] - raw[i - 1];
                        if (delta < 0) delta = 0; // Handle meter resets
                        gasValues.push(delta);
                    }
                }
            } else {
                // For days/months/years, use values directly (already per-period)
                gasValues = this.data.map(d => parseFloat(d.gas) || 0);
            }
            
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

            // Update UI
            if (this.currentPeriod === 'hours') {
                const currentConsumption = gasValues[gasValues.length - 1] || 0;
                if (currentConsumption > 0.001) {
                    this.updateElement('stat-total-gas', this.formatNumber(currentConsumption, 3) + ' m³');
                    this.updateElement('stat-gas-period', `Huidig uur`);
                } else {
                    this.updateElement('stat-total-gas', '0.000 m³');
                    this.updateElement('stat-gas-period', `Geen verbruik`);
                }
            } else {
                if (hasConsumption) {
                    this.updateElement('stat-total-gas', this.formatNumber(total, 3) + ' m³');
                    this.updateElement('stat-gas-period', `Laatste ${this.currentZoom} ${this.getPeriodLabel()}`);
                } else {
                    this.updateElement('stat-total-gas', '0.000 m³');
                    this.updateElement('stat-gas-period', `Geen verbruik`);
                }
            }
            
            if (hasConsumption) {
                this.updateElement('stat-gas-cost', '€ ' + this.formatNumber(total * 1.5, 2));
                this.updateElement('stat-gas-cost-period', `Geschat`);
            } else {
                this.updateElement('stat-gas-cost', '€ 0.00');
                this.updateElement('stat-gas-cost-period', `Geen verbruik`);
            }
            
            this.updateElement('stat-gas-average', this.formatNumber(avg, 3) + ' m³');
            this.updateElement('stat-gas-average-period', `per ${this.getPeriodLabelSingular()}`);
            
            if (flow > 0.001) {
                this.updateElement('stat-gas-flow', this.formatNumber(flow, 3) + ' m³/h');
            } else {
                this.updateElement('stat-gas-flow', '0.000 m³/h');
            }
            
            if (hasConsumption && peakValue > 0.001) {
                this.updateElement('stat-gas-peak', this.formatNumber(peakValue, 3) + ' m³');
                this.updateElement('stat-gas-peak-time', this.formatPeakTime(peakTime));
            } else {
                this.updateElement('stat-gas-peak', '--');
                this.updateElement('stat-gas-peak-time', 'Geen verbruik');
            }
        },

        formatPeakTime(ts) {
            if (!ts) return '--:--';
            if (typeof ts === 'number' || /^\d+$/.test(String(ts))) {
                const d = new Date((parseInt(ts) || 0) * 1000);
                return d.toLocaleString();
            }
            return ts;
        },

        formatNumber(v, decimals = 2) { 
            return (Math.round((v || 0) * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals); 
        },

        calculateNiceTicks(min, max, count) {
            const range = max - min;
            if (range <= 0) return [0, max];
            const roughStep = range / (count - 1);
            const step = this.calculateNiceStep(roughStep);
            const niceMin = Math.floor(min / step) * step;
            const niceMax = Math.ceil(max / step) * step;
            const ticks = [];
            for (let i = niceMin; i <= niceMax + step / 2; i += step) {
                ticks.push(Math.round(i * 1000) / 1000);
            }
            return ticks.slice(0, count);
        },

        calculateNiceStep(rough) {
            const log = Math.log10(Math.abs(rough));
            const exponent = Math.floor(log);
            const fraction = rough / Math.pow(10, exponent);
            let niceFraction;
            if (fraction <= 1) niceFraction = 1;
            else if (fraction <= 2) niceFraction = 2;
            else if (fraction <= 5) niceFraction = 5;
            else niceFraction = 10;
            return niceFraction * Math.pow(10, exponent);
        },

        getPeriodKey(ts, period) {
            const date = new Date(ts * 1000);
            if (period === 'hours') {
                return Math.floor(ts / 3600);
            } else if (period === 'days') {
                return date.toDateString();
            } else if (period === 'months') {
                return date.getFullYear() + '-' + (date.getMonth() + 1);
            } else if (period === 'years') {
                return date.getFullYear();
            } else {
                return ts;
            }
        },

        /**
         * FIX: Modified to handle multiple data points per period correctly
         */
        fillMissingData(data, period) {
            if (data.length === 0) return data;

            data.sort((a, b) => (a.unixTimestamp || 0) - (b.unixTimestamp || 0));

            const filled = [];
            const startTs = data[0].unixTimestamp || 0;
            const endTs = data[data.length - 1].unixTimestamp || 0;
            const startDate = new Date(startTs * 1000);
            const endDate = new Date(endTs * 1000);

            // FIX: Store arrays instead of single values to prevent data loss
            const dataMap = new Map();
            data.forEach(d => {
                const ts = d.unixTimestamp || 0;
                const key = this.getPeriodKey(ts, period);
                if (!dataMap.has(key)) {
                    dataMap.set(key, []);
                }
                dataMap.get(key).push(d);
            });

            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const ts = Math.floor(currentDate.getTime() / 1000);
                const key = this.getPeriodKey(ts, period);
                
                if (dataMap.has(key)) {
                    // FIX: Get all data points and use the most recent one
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

        async fetchDegreeDays() {
            try {
                if (!this.data || this.data.length === 0) {
                    this.degreeDaysData = null;
                    return;
                }

                // Determine which weather endpoint to use based on period
                let weatherEndpoint;
                if (this.currentPeriod === 'hours') {
                    weatherEndpoint = `${window.P1API.BASE_PATH}/v1/weather/hour?limit=${this.currentZoom}`;
                } else if (this.currentPeriod === 'days') {
                    weatherEndpoint = `${window.P1API.BASE_PATH}/v1/weather/day?limit=${this.currentZoom}`;
                } else if (this.currentPeriod === 'months') {
                    weatherEndpoint = `${window.P1API.BASE_PATH}/v1/weather/month?limit=${this.currentZoom}`;
                } else if (this.currentPeriod === 'years') {
                    weatherEndpoint = `${window.P1API.BASE_PATH}/v1/weather/year?limit=${this.currentZoom}`;
                } else {
                    this.degreeDaysData = null;
                    return;
                }

                const weatherData = await window.P1API.fetch(weatherEndpoint);
                
                if (!weatherData || weatherData.length === 0) {
                    console.warn('No weather data available');
                    this.degreeDaysData = null;
                    return;
                }

                // Weather data structure (based on API docs):
                // [0] = TIMESTAMP_LOCAL
                // [1] = TIMESTAMP_UTC
                // [19] = DEGREE_DAYS (last field)
                
                // Reverse to match our data order (oldest first)
                weatherData.reverse();
                
                // Extract degree days and align with gas data
                const degreeDays = [];
                const weatherMap = new Map();
                
                weatherData.forEach(record => {
                    const timestamp = parseInt(record[1]);
                    const degreeDaysValue = parseFloat(record[19]) || 0;
                    const key = this.getPeriodKey(timestamp, this.currentPeriod);
                    weatherMap.set(key, degreeDaysValue);
                });
                
                // Match degree days to gas data points
                this.data.forEach(gasPoint => {
                    const key = this.getPeriodKey(gasPoint.unixTimestamp, this.currentPeriod);
                    const ddValue = weatherMap.get(key) || 0;
                    degreeDays.push(ddValue);
                });
                
                this.degreeDaysData = degreeDays;
                console.log('Degree days loaded:', degreeDays.length, 'values');
                
            } catch (error) {
                console.warn('Could not fetch degree days:', error);
                this.degreeDaysData = null;
            }
        },

        async fetchTemperatureData() {
            try {
                if (!this.data || this.data.length === 0) {
                    this.temperatureData = null;
                    return;
                }

                // Determine which weather endpoint to use based on period
                let weatherEndpoint;
                if (this.currentPeriod === 'hours') {
                    weatherEndpoint = `${window.P1API.BASE_PATH}/v1/weather/hour?limit=${this.currentZoom}`;
                } else if (this.currentPeriod === 'days') {
                    weatherEndpoint = `${window.P1API.BASE_PATH}/v1/weather/day?limit=${this.currentZoom}`;
                } else if (this.currentPeriod === 'months') {
                    weatherEndpoint = `${window.P1API.BASE_PATH}/v1/weather/month?limit=${this.currentZoom}`;
                } else if (this.currentPeriod === 'years') {
                    weatherEndpoint = `${window.P1API.BASE_PATH}/v1/weather/year?limit=${this.currentZoom}`;
                } else {
                    this.temperatureData = null;
                    return;
                }

                const weatherData = await window.P1API.fetch(weatherEndpoint);
                
                if (!weatherData || weatherData.length === 0) {
                    console.warn('No weather data available for temperature');
                    this.temperatureData = null;
                    return;
                }

                // Weather data structure:
                // [4] = TEMPERATURE_LOW
                // [5] = TEMPERATURE_AVERAGE
                // [6] = TEMPERATURE_HIGH
                
                // Reverse to match our data order (oldest first)
                weatherData.reverse();
                
                // Extract temperature values and align with gas data
                const tempMap = new Map();
                
                weatherData.forEach(record => {
                    const timestamp = parseInt(record[1]);
                    const tempLow = parseFloat(record[4]);
                    const tempAvg = parseFloat(record[5]);
                    const tempHigh = parseFloat(record[6]);
                    
                    if (!isNaN(timestamp) && !isNaN(tempLow) && !isNaN(tempAvg) && !isNaN(tempHigh)) {
                        const key = this.getPeriodKey(timestamp, this.currentPeriod);
                        tempMap.set(key, {
                            min: tempLow,
                            avg: tempAvg,
                            max: tempHigh
                        });
                    }
                });
                
                // Create temperature arrays aligned with gas data
                const tempData = {
                    min: [],
                    avg: [],
                    max: []
                };
                
                this.data.forEach(gasPoint => {
                    const key = this.getPeriodKey(gasPoint.unixTimestamp, this.currentPeriod);
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
                console.log('Temperature data loaded:', tempData.min.filter(v => v !== null).length, 'valid points');
                
            } catch (error) {
                console.warn('Could not fetch temperature data:', error);
                this.temperatureData = null;
            }
        },

        updateLegend() {
            const degreeDaysLegend = document.getElementById('legend-degree-days');
            if (degreeDaysLegend) {
                degreeDaysLegend.style.display = this.showDegreeDays ? 'inline-flex' : 'none';
            }
            
            // Update temperature legend items
            const tempLegendIds = ['legend-temp-max', 'legend-temp-avg', 'legend-temp-min'];
            tempLegendIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = this.showTemp ? 'inline-flex' : 'none';
            });
        },

        getPeriodLabel() {
            return this.currentPeriod === 'hours' ? 'uren' : this.currentPeriod === 'days' ? 'dagen' : this.currentPeriod === 'months' ? 'maanden' : 'jaren';
        },

        getPeriodLabelSingular() {
            return this.currentPeriod === 'hours' ? 'uur' : this.currentPeriod === 'days' ? 'dag' : this.currentPeriod === 'months' ? 'maand' : 'jaar';
        },

        updateElement(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        },

        showError(msg) {
            const el = document.getElementById('error-container');
            if (el) el.innerHTML = `<div class="error">${msg}</div>`;
        },

        hideError() { 
            const el = document.getElementById('error-container'); 
            if (el) el.innerHTML = ''; 
        },

        showLoading() { 
            const l = document.getElementById('loading-container'); 
            if (l) l.style.display = 'block'; 
        },
        
        hideLoading() { 
            const l = document.getElementById('loading-container'); 
            if (l) l.style.display = 'none'; 
        },

        redrawChart() {
            if (!this.data || !this.canvas || !this.ctx) return;

            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            const width = this.canvas.width;
            const height = this.canvas.height;
            const paddingLeft = 60;
            const paddingRight = (this.showDegreeDays || this.showTemp) ? 60 : 20; // Space for secondary axis
            const paddingTop = 30;
            const paddingBottom = 60;
            const graphWidth = width - paddingLeft - paddingRight;
            const graphHeight = height - paddingTop - paddingBottom;

            this.ctx.clearRect(0,0,width,height);

            const isDark = document.body.classList.contains('dark-theme');
            const gridColor = isDark ? '#334155' : '#e2e8f0';
            const textColor = isDark ? '#94a3b8' : '#64748b';

            const values = (this.plotValues && this.plotValues.length > 0) ? this.plotValues : this.data.map(d => parseFloat(d.gas) || 0);
            const maxV = Math.max(...values, 0.001);
            const gridLines = 4;
            const ticks = this.calculateNiceTicks(0, maxV, gridLines + 1);
            const niceMax = Math.max(...ticks);
            
            this.ctx.strokeStyle = gridColor;
            this.ctx.fillStyle = textColor;
            this.ctx.font = '12px sans-serif';

            ticks.forEach(v => {
                const y = paddingTop + graphHeight - (graphHeight * (v / niceMax));
                this.ctx.beginPath();
                this.ctx.moveTo(paddingLeft, y);
                this.ctx.lineTo(width - paddingRight, y);
                this.ctx.stroke();
                this.ctx.textAlign = 'right';
                this.ctx.fillText(this.formatNumber(v, 2) + ' m³', paddingLeft - 8, y + 4);
            });

            this.ctx.strokeStyle = gridColor;
            this.ctx.beginPath();
            this.ctx.moveTo(paddingLeft, height - paddingBottom);
            this.ctx.lineTo(width - paddingRight, height - paddingBottom);
            this.ctx.stroke();

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

            // Draw degree days line if enabled
            if (this.showDegreeDays && this.degreeDaysData && this.degreeDaysData.length > 0) {
                this.drawDegreeDaysLine(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, totalBarWidth);
            }

            // Draw temperature lines if enabled
            if (this.showTemp && this.temperatureData) {
                this.drawTemperatureLines(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, totalBarWidth);
            }

            this.drawXAxisLabels(paddingLeft, paddingBottom, graphWidth, graphHeight, height, textColor);

            if (this.hoverState.isHovering) {
                this.drawTooltip(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, height, totalBarWidth, textColor, isDark);
            }
        },

        drawDegreeDaysLine(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, totalBarWidth) {
            if (!this.degreeDaysData || this.degreeDaysData.length === 0) return;

            // Calculate scale for degree days using nice ticks
            const maxDD = Math.max(...this.degreeDaysData, 0.1);
            const minDD = Math.min(...this.degreeDaysData, 0);
            
            // Use the same nice tick calculation as gas consumption
            const ddTicks = this.calculateNiceTicks(minDD, maxDD, 5); // 5 ticks (0-4)
            const niceMinDD = Math.min(...ddTicks);
            const niceMaxDD = Math.max(...ddTicks);
            const ddRange = niceMaxDD - niceMinDD;
            
            const getDDY = (value) => {
                const ratio = (value - niceMinDD) / (ddRange || 1);
                return paddingTop + graphHeight - (ratio * graphHeight);
            };

            // Draw degree days line (blue color)
            this.ctx.strokeStyle = '#3b82f6';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([]);
            this.ctx.beginPath();

            this.degreeDaysData.forEach((dd, idx) => {
                const x = paddingLeft + (idx * totalBarWidth) + totalBarWidth / 2;
                const y = getDDY(dd);
                
                if (idx === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            });

            this.ctx.stroke();

            // Draw right Y-axis for degree days
            const isDark = document.body.classList.contains('dark-theme');
            const textColor = isDark ? '#94a3b8' : '#64748b';
            const width = paddingLeft + graphWidth + paddingRight;
            const rightX = paddingLeft + graphWidth;

            this.ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(rightX, paddingTop);
            this.ctx.lineTo(rightX, paddingTop + graphHeight);
            this.ctx.stroke();

            // Draw tick marks and labels using nice ticks
            this.ctx.fillStyle = textColor;
            this.ctx.font = '11px sans-serif';
            this.ctx.textAlign = 'left';

            ddTicks.forEach(ddValue => {
                const y = getDDY(ddValue);

                // Tick mark
                this.ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
                this.ctx.beginPath();
                this.ctx.moveTo(rightX, y);
                this.ctx.lineTo(rightX + 5, y);
                this.ctx.stroke();

                // Label - format based on value size
                let label;
                if (Math.abs(ddValue) >= 10) {
                    label = Math.round(ddValue).toString();
                } else {
                    label = ddValue.toFixed(1);
                }
                this.ctx.fillText(label, rightX + 8, y + 4);
            });
        },

        drawTemperatureLines(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, totalBarWidth) {
            if (!this.temperatureData) return;

            const isDark = document.body.classList.contains('dark-theme');
            const textColor = isDark ? '#94a3b8' : '#64748b';
            const gridColor = isDark ? '#334155' : '#e2e8f0';

            // Find temperature range from all three series
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

            // Add padding to scale (10%)
            const tempRange = maxTemp - minTemp;
            const padding = Math.max(tempRange * 0.1, 1); // At least 1 degree padding
            minTemp -= padding;
            maxTemp += padding;
            const tempScale = maxTemp - minTemp;

            // Draw secondary Y-axis
            this.drawTemperatureAxis(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, minTemp, maxTemp, tempScale, textColor, gridColor);

            // Helper to calculate Y position
            const getTempY = (temp) => {
                if (temp === null || isNaN(temp)) return null;
                const ratio = (temp - minTemp) / tempScale;
                return paddingTop + graphHeight - (ratio * graphHeight);
            };

            const dataCount = this.temperatureData.min.length;

            // Create points arrays for all three temperature series
            const createPoints = (series) => {
                const points = [];
                for (let i = 0; i < dataCount; i++) {
                    const temp = this.temperatureData[series][i];
                    const y = getTempY(temp);
                    if (y !== null) {
                        const x = paddingLeft + (i * totalBarWidth) + totalBarWidth / 2;
                        points.push({ x, y });
                    }
                }
                return points;
            };

            const maxPoints = createPoints('max');
            const avgPoints = createPoints('avg');
            const minPoints = createPoints('min');

            // Fill area between min and max temperature
            if (maxPoints.length > 1 && minPoints.length > 1) {
                this.ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'; // Light blue with transparency
                this.ctx.beginPath();
                
                // Start at first min point
                this.ctx.moveTo(minPoints[0].x, minPoints[0].y);
                
                // Draw smooth curve through min points
                for (let i = 1; i < minPoints.length; i++) {
                    const current = minPoints[i];
                    const previous = minPoints[i - 1];
                    const controlX = (previous.x + current.x) / 2;
                    const controlY = (previous.y + current.y) / 2;
                    this.ctx.quadraticCurveTo(previous.x, previous.y, controlX, controlY);
                    if (i === minPoints.length - 1) {
                        this.ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
                    }
                }
                
                // Draw to last max point
                this.ctx.lineTo(maxPoints[maxPoints.length - 1].x, maxPoints[maxPoints.length - 1].y);
                
                // Draw smooth curve back through max points (in reverse)
                for (let i = maxPoints.length - 2; i >= 0; i--) {
                    const current = maxPoints[i];
                    const next = maxPoints[i + 1];
                    const controlX = (current.x + next.x) / 2;
                    const controlY = (current.y + next.y) / 2;
                    this.ctx.quadraticCurveTo(next.x, next.y, controlX, controlY);
                    if (i === 0) {
                        this.ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
                    }
                }
                
                this.ctx.closePath();
                this.ctx.fill();
            }

            // Function to draw smooth curve through points
            const drawSmooth = (points, color, dashed = false) => {
                if (points.length === 0) return;

                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 2;
                if (dashed) this.ctx.setLineDash([5, 5]);
                else this.ctx.setLineDash([]);

                this.ctx.beginPath();
                this.ctx.moveTo(points[0].x, points[0].y);

                for (let i = 0; i < points.length - 1; i++) {
                    const current = points[i];
                    const next = points[i + 1];
                    const xMid = (current.x + next.x) / 2;
                    const yMid = (current.y + next.y) / 2;

                    if (i === 0) {
                        this.ctx.lineTo(xMid, yMid);
                    } else {
                        this.ctx.quadraticCurveTo(current.x, current.y, xMid, yMid);
                    }
                }

                // Draw to last point
                if (points.length > 1) {
                    const secondLast = points[points.length - 2];
                    const last = points[points.length - 1];
                    this.ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
                }

                this.ctx.stroke();
                this.ctx.setLineDash([]);
            };

            // Draw temperature lines (order matters: max, avg, min on top)
            drawSmooth(maxPoints, '#ef4444', true);  // Red, dashed
            drawSmooth(avgPoints, '#374151', false); // Dark gray, solid (matching electricity)
            drawSmooth(minPoints, '#3b82f6', true);  // Blue, dashed
        },

        drawTemperatureAxis(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, minTemp, maxTemp, tempScale, textColor, gridColor) {
            const rightX = paddingLeft + graphWidth;

            // Draw axis line
            this.ctx.strokeStyle = gridColor;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(rightX, paddingTop);
            this.ctx.lineTo(rightX, paddingTop + graphHeight);
            this.ctx.stroke();

            // Calculate nice ticks
            const tempTicks = this.calculateNiceTicks(minTemp, maxTemp, 5);

            // Draw tick marks and labels
            this.ctx.fillStyle = textColor;
            this.ctx.font = '11px sans-serif';
            this.ctx.textAlign = 'left';

            tempTicks.forEach(temp => {
                const ratio = (temp - minTemp) / tempScale;
                const y = paddingTop + graphHeight - (ratio * graphHeight);

                // Tick mark
                this.ctx.strokeStyle = gridColor;
                this.ctx.beginPath();
                this.ctx.moveTo(rightX, y);
                this.ctx.lineTo(rightX + 5, y);
                this.ctx.stroke();

                // Label
                this.ctx.fillText(`${Math.round(temp)}°C`, rightX + 8, y + 4);
            });
        },

        drawXAxisLabels(paddingLeft, paddingBottom, graphWidth, graphHeight, height, textColor) {
            if (!this.data || this.data.length === 0) return;

            const dataCount = this.data.length;
            const totalBarWidth = graphWidth / dataCount;
            const isMobile = window.innerWidth <= 768;

            this.ctx.fillStyle = textColor;
            this.ctx.textAlign = 'center';
            this.ctx.font = isMobile ? '9px sans-serif' : '11px sans-serif';

            let labelInterval = 1;
            if (this.currentPeriod === 'hours') {
                if (isMobile || dataCount > 24) {
                    labelInterval = Math.ceil(dataCount / 6);
                } else if (dataCount > 12) {
                    labelInterval = 2;
                }
            } else if (this.currentPeriod === 'days') {
                if (isMobile && dataCount > 7) {
                    labelInterval = Math.ceil(dataCount / 5);
                } else if (dataCount > 14) {
                    labelInterval = Math.ceil(dataCount / 7);
                } else if (dataCount > 7) {
                    labelInterval = 2;
                }
            } else if (this.currentPeriod === 'months') {
                if (isMobile && dataCount > 6) {
                    labelInterval = Math.ceil(dataCount / 4);
                } else if (dataCount > 12) {
                    labelInterval = 2;
                }
            } else if (this.currentPeriod === 'years') {
                labelInterval = 1;
            }

            this.data.forEach((point, index) => {
                if (index % labelInterval !== 0 && index !== dataCount - 1) return;

                const x = paddingLeft + (index * totalBarWidth) + totalBarWidth / 2;
                const y = height - paddingBottom + 20;

                let label = '';
                const ts = point.unixTimestamp || (typeof point.timestamp === 'string' && parseInt(point.timestamp));
                const date = ts ? new Date(ts * 1000) : new Date();

                if (this.currentPeriod === 'hours') {
                    label = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                } else if (this.currentPeriod === 'days') {
                    const day = date.getDate();
                    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
                    label = `${day} ${months[date.getMonth()]}`;
                } else if (this.currentPeriod === 'months') {
                    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
                    label = isMobile ? `${months[date.getMonth()]}` : `${months[date.getMonth()]} ${date.getFullYear()}`;
                } else if (this.currentPeriod === 'years') {
                    label = `${date.getFullYear()}`;
                }

                if (isMobile && totalBarWidth < 30) {
                    this.ctx.save();
                    this.ctx.translate(x, y);
                    this.ctx.rotate(-Math.PI / 4);
                    this.ctx.textAlign = 'right';
                    this.ctx.fillText(label, 0, 0);
                    this.ctx.restore();
                } else {
                    this.ctx.fillText(label, x, y);
                }
            });
        },

        drawTooltip(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, height, totalBarWidth, textColor, isDark) {
            if (!this.data) return;

            const mouseX = this.hoverState.x;
            const dataCount = this.data.length;
            const index = Math.floor((mouseX - paddingLeft) / totalBarWidth);

            if (index < 0 || index >= dataCount) return;

            const point = this.data[index];
            const x = paddingLeft + (index * totalBarWidth) + totalBarWidth / 2;

            this.ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(x, paddingTop);
            this.ctx.lineTo(x, height - paddingBottom);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            const ts = point.unixTimestamp || (typeof point.timestamp === 'string' && parseInt(point.timestamp));
            const date = ts ? new Date(ts * 1000) : new Date();
            const timeText = this.formatTooltipTime(date);
            const gasValue = this.plotValues && this.plotValues[index] !== undefined ? this.plotValues[index] : (parseFloat(point.gas) || 0);
            const gasText = `Verbruik: ${this.formatNumber(gasValue, 3)} m³`;

            // Add degree days if shown
            let ddText = '';
            if (this.showDegreeDays && this.degreeDaysData && this.degreeDaysData[index] !== undefined) {
                const ddValue = this.degreeDaysData[index];
                ddText = `Graaddagen: ${this.formatNumber(ddValue, 1)}`;
            }

            // Add temperature if shown
            let tempTexts = [];
            if (this.showTemp && this.temperatureData && index < this.temperatureData.min.length) {
                const tempMin = this.temperatureData.min[index];
                const tempAvg = this.temperatureData.avg[index];
                const tempMax = this.temperatureData.max[index];
                
                if (tempMin !== null && tempAvg !== null && tempMax !== null) {
                    tempTexts = [
                        `Max: ${this.formatNumber(tempMax, 1)}°C`,
                        `Gem: ${this.formatNumber(tempAvg, 1)}°C`,
                        `Min: ${this.formatNumber(tempMin, 1)}°C`
                    ];
                }
            }

            const tooltipPadding = 12;
            this.ctx.font = 'bold 13px sans-serif';
            const timeWidth = this.ctx.measureText(timeText).width;
            this.ctx.font = '12px sans-serif';
            const gasWidth = this.ctx.measureText(gasText).width;
            let ddWidth = 0;
            if (ddText) {
                ddWidth = this.ctx.measureText(ddText).width;
            }
            
            let maxWidth = Math.max(timeWidth, gasWidth, ddWidth);
            if (tempTexts.length > 0) {
                this.ctx.font = '11px sans-serif';
                tempTexts.forEach(t => {
                    maxWidth = Math.max(maxWidth, this.ctx.measureText(t).width + 20);
                });
            }

            const tooltipWidth = maxWidth + tooltipPadding * 2;
            let tooltipHeight = ddText ? 85 : 65;
            if (tempTexts.length > 0) {
                tooltipHeight += 60; // Add space for temperature section
            }

            let tooltipX = x + 15;
            let tooltipY = paddingTop + 20;

            if (tooltipX + tooltipWidth > this.canvas.width - paddingRight) {
                tooltipX = x - tooltipWidth - 15;
            }

            if (tooltipX < paddingLeft + 10) {
                tooltipX = paddingLeft + 10;
            }

            if (tooltipY + tooltipHeight > this.canvas.height - paddingBottom) {
                tooltipY = this.canvas.height - paddingBottom - tooltipHeight - 10;
            }

            this.ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
            this.ctx.strokeStyle = isDark ? '#475569' : '#e2e8f0';
            this.ctx.lineWidth = 1;

            const radius = 6;
            this.ctx.beginPath();
            this.ctx.moveTo(tooltipX + radius, tooltipY);
            this.ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
            this.ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
            this.ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
            this.ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
            this.ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
            this.ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
            this.ctx.lineTo(tooltipX, tooltipY + radius);
            this.ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.textAlign = 'left';
            this.ctx.fillStyle = textColor;
            this.ctx.font = 'bold 13px sans-serif';
            this.ctx.fillText(timeText, tooltipX + tooltipPadding, tooltipY + 20);

            this.ctx.font = '12px sans-serif';
            this.ctx.fillStyle = '#fb923c';
            this.ctx.fillText(gasText, tooltipX + tooltipPadding, tooltipY + 40);

            // Draw degree days if present
            if (ddText) {
                this.ctx.fillStyle = '#3b82f6';
                this.ctx.fillText(ddText, tooltipX + tooltipPadding, tooltipY + 60);
            }

            // Draw temperature if present
            if (tempTexts.length > 0) {
                let yOffset = ddText ? tooltipY + 85 : tooltipY + 65;
                
                // Draw separator line
                this.ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
                this.ctx.beginPath();
                this.ctx.moveTo(tooltipX + tooltipPadding, yOffset - 5);
                this.ctx.lineTo(tooltipX + tooltipWidth - tooltipPadding, yOffset - 5);
                this.ctx.stroke();

                // Draw temperature label
                this.ctx.fillStyle = textColor;
                this.ctx.font = 'bold 11px sans-serif';
                this.ctx.fillText('Temperatuur:', tooltipX + tooltipPadding, yOffset + 5);
                
                yOffset += 15;
                
                // Draw temperature values
                this.ctx.font = '11px sans-serif';
                const colors = ['#ef4444', '#374151', '#3b82f6']; // Red, dark gray, blue
                tempTexts.forEach((text, i) => {
                    this.ctx.fillStyle = colors[i];
                    this.ctx.fillText(text, tooltipX + tooltipPadding, yOffset);
                    yOffset += 14;
                });
            }
        },

        formatTooltipTime(date) {
            if (this.currentPeriod === 'hours') {
                const days = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${days[date.getDay()]} ${hours}:${minutes}`;
            } else if (this.currentPeriod === 'days') {
                const day = date.getDate();
                const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
                return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`;
            } else if (this.currentPeriod === 'months') {
                const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
                return `${months[date.getMonth()]} ${date.getFullYear()}`;
            } else if (this.currentPeriod === 'years') {
                return `${date.getFullYear()}`;
            }
            return date.toLocaleString('nl-NL');
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (window.P1MonConfig && window.P1MonConfig.currentPage === 'gas') {
            GasManager.init();
        }
    });

})();