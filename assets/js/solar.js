/**
 * Solar Page Manager
 * Handles chart rendering and interactivity for solar production data
 */

(function() {
    'use strict';

    const SolarManager = {
        currentPeriod: 'hours',
        currentZoom: 24,
        data: null,
        canvas: null,
        ctx: null,
        showSmoothed: true,
        showTemp: false,
        temperatureData: null,
        systemCapacity: 3780, // 14 × 270Wp panels = 3780W
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
            this.canvas = document.getElementById('solar-chart');
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                this.setupChartHover();
            }

            this.setupEventListeners();
            this.updateZoomButtons();
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
            // Period tabs
            document.querySelectorAll('.period-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const period = tab.dataset.period;
                    this.changePeriod(period);
                });
            });

            // Smoothed toggle
            const smoothToggle = document.getElementById('toggle-solar-smoothed');
            if (smoothToggle) {
                smoothToggle.addEventListener('change', (e) => {
                    this.showSmoothed = e.target.checked;
                    this.redrawChart();
                });
            }

            // Temperature toggle
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

        toggleTemperatureLegend(show) {
            ['legend-temp-max', 'legend-temp-avg', 'legend-temp-min'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = show ? 'inline-flex' : 'none';
            });
        },

        updateZoomButtons() {
            const container = document.getElementById('zoom-buttons-solar');
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
            
            document.querySelectorAll('.period-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.period === period);
            });
            
            // Set default zoom for period
            const defaults = { hours: 24, days: 7, months: 12, years: 5 };
            this.currentZoom = defaults[period] || 24;
            
            this.updateZoomButtons();
            this.loadData();
        },

        changeZoom(zoom) {
            this.currentZoom = zoom;
            
            document.querySelectorAll('#zoom-buttons-solar .control-button').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.zoom) === zoom);
            });
            
            this.loadData();
        },

        async loadData() {
            try {
                this.showLoading();
                
                // Use solar API endpoint
                const url = `/custom/api/solar.php?period=${this.currentPeriod}&zoom=${this.currentZoom}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const payload = await response.json();
                
                if (!payload || !payload.chartData) {
                    this.showError('Geen data beschikbaar');
                    console.warn('No chartData returned:', payload);
                    return;
                }

                console.log('Solar data loaded:', this.currentPeriod, 'items:', payload.chartData.length);
                
                this.data = payload.chartData;
                this.updateStatistics(payload.stats);
                
                if (this.showTemp) {
                    await this.loadTemperatureData();
                } else {
                    this.redrawChart();
                }
                
                this.hideError();
            } catch (err) {
                console.error('Error loading solar data:', err);
                this.showError('Fout bij ophalen zonnedata');
            } finally {
                this.hideLoading();
            }
        },

        async loadTemperatureData() {
            try {
                // Calculate hours needed based on period and zoom
                let hoursNeeded = this.currentZoom;
                if (this.currentPeriod === 'days') hoursNeeded *= 24;
                else if (this.currentPeriod === 'months') hoursNeeded = this.currentZoom * 30 * 24;
                else if (this.currentPeriod === 'years') hoursNeeded = this.currentZoom * 365 * 24;

                const url = `/api/v1/weather/hour?limit=${hoursNeeded}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    console.warn('Failed to load temperature data');
                    return;
                }
                
                const weatherData = await response.json();
                this.temperatureData = this.processTemperatureData(weatherData);
                this.redrawChart();
            } catch (err) {
                console.error('Error loading temperature data:', err);
            }
        },

        processTemperatureData(weatherData) {
            if (!Array.isArray(weatherData)) return {};
            
            const tempMap = {};
            
            weatherData.forEach(record => {
                // record[1] = unix timestamp
                // record[4] = temp low, record[5] = temp avg, record[6] = temp high
                const timestamp = parseInt(record[1]);
                const tempLow = parseFloat(record[4]);
                const tempAvg = parseFloat(record[5]);
                const tempHigh = parseFloat(record[6]);
                
                // Group by hour for hourly period, or by day for other periods
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
                    // If multiple records for same period, take extremes
                    tempMap[key].min = Math.min(tempMap[key].min, tempLow);
                    tempMap[key].max = Math.max(tempMap[key].max, tempHigh);
                    tempMap[key].avg = (tempMap[key].avg + tempAvg) / 2;
                }
            });
            
            return tempMap;
        },

        updateStatistics(stats) {
            if (!stats) {
                // Calculate from data if stats not provided
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

            // Current power (from last data point or stats)
            const currentPower = this.data && this.data.length > 0 ? 
                (parseFloat(this.data[this.data.length - 1].power) || 0) : 0;
            this.updateElement('stat-current-power', this.formatNumber(currentPower, 0) + ' W');

            // Total energy
            this.updateElement('stat-total-energy', this.formatNumber(stats.totalEnergy || 0, 2) + ' kWh');
            this.updateElement('stat-energy-period', `Laatste ${this.currentZoom} ${this.getPeriodLabel()}`);

            // Peak power
            const peakPower = stats.peakPower?.value || 0;
            this.updateElement('stat-peak-power', this.formatNumber(peakPower, 0) + ' W');
            this.updateElement('stat-peak-time', this.formatPeakTime(stats.peakPower?.time));

            // Capacity factor
            const capacityFactor = this.calculateCapacityFactor(stats.totalEnergy || 0);
            this.updateElement('stat-capacity-factor', this.formatNumber(capacityFactor, 1) + '%');
            this.updateElement('stat-capacity-period', `Laatste ${this.currentZoom} ${this.getPeriodLabel()}`);

            // Sunlight hours
            const sunlightHours = this.calculateSunlightHours();
            this.updateElement('stat-sunlight-hours', this.formatNumber(sunlightHours, 1) + ' uur');
        },

        calculateCapacityFactor(totalEnergyKWh) {
            // Capacity factor = (actual energy / theoretical max energy) × 100
            // Theoretical max = system capacity (kW) × hours × 100%
            
            let hours = this.currentZoom;
            if (this.currentPeriod === 'days') hours *= 24;
            else if (this.currentPeriod === 'months') hours = this.currentZoom * 30 * 24; // approximate
            else if (this.currentPeriod === 'years') hours = this.currentZoom * 365 * 24;
            
            const systemCapacityKW = this.systemCapacity / 1000;
            const theoreticalMaxKWh = systemCapacityKW * hours;
            
            if (theoreticalMaxKWh === 0) return 0;
            return (totalEnergyKWh / theoreticalMaxKWh) * 100;
        },

        calculateSunlightHours() {
            // Count hours with meaningful production (>10W average)
            if (!this.data || this.data.length === 0) return 0;
            
            const threshold = 10; // W
            let productiveHours = 0;
            
            this.data.forEach(point => {
                const power = parseFloat(point.power) || 0;
                if (power > threshold) {
                    if (this.currentPeriod === 'hours') {
                        productiveHours += 1;
                    } else if (this.currentPeriod === 'days') {
                        // Assume 8-10 productive hours per day with production
                        const production = parseFloat(point.production) || 0;
                        if (production > 0) productiveHours += 8;
                    } else {
                        // For months/years, estimate based on energy
                        const production = parseFloat(point.production) || 0;
                        const avgPower = 1000; // Assume 1kW average during production
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
                // Try parsing as ISO string first
                const date = new Date(ts);
                if (!isNaN(date.getTime())) {
                    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
                }
                // Try parsing as unix timestamp
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

        formatNumber(v, decimals = 2) {
            return (Math.round((v || 0) * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals);
        },

        getPeriodLabel() {
            const labels = { hours: 'uren', days: 'dagen', months: 'maanden', years: 'jaren' };
            return labels[this.currentPeriod] || 'uren';
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
            const paddingRight = this.showTemp ? 60 : 20;
            const paddingTop = 30;
            const paddingBottom = 60;
            const graphWidth = width - paddingLeft - paddingRight;
            const graphHeight = height - paddingTop - paddingBottom;

            this.ctx.clearRect(0, 0, width, height);

            // Get theme colors
            const isDark = document.body.classList.contains('dark-theme');
            const gridColor = isDark ? '#334155' : '#e2e8f0';
            const textColor = isDark ? '#94a3b8' : '#64748b';

            // Get production values
            const values = this.data.map(d => parseFloat(d.production) || 0);
            const maxV = Math.max(...values, 0.001);
            
            // Calculate nice ticks for Y-axis
            const ticks = this.calculateNiceTicks(0, maxV, 5);
            const niceMax = Math.max(...ticks);

            // Draw Y-axis grid and labels (Energy - kWh)
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
                this.ctx.fillText(this.formatNumber(v, 2) + ' kWh', paddingLeft - 8, y + 4);
            });

            // Draw X-axis line
            this.ctx.strokeStyle = gridColor;
            this.ctx.beginPath();
            this.ctx.moveTo(paddingLeft, height - paddingBottom);
            this.ctx.lineTo(width - paddingRight, height - paddingBottom);
            this.ctx.stroke();

            // Draw production bars
            const count = values.length;
            const totalBarWidth = graphWidth / count;
            const barWidth = Math.max(totalBarWidth - 2, 1);
            
            // Solar yellow/orange gradient
            const gradient = this.ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
            gradient.addColorStop(0, '#fbbf24'); // Lighter yellow
            gradient.addColorStop(1, '#f59e0b'); // Darker orange
            
            this.ctx.fillStyle = gradient;
            
            values.forEach((v, idx) => {
                const x = paddingLeft + idx * totalBarWidth + 1;
                const h = (v / niceMax) * graphHeight;
                const y = paddingTop + graphHeight - h;
                this.ctx.fillRect(x, y, barWidth, h);
            });

            // Draw smooth power line if enabled
            if (this.showSmoothed) {
                this.drawPowerLine(paddingLeft, paddingTop, graphWidth, graphHeight, totalBarWidth);
            }

            // Draw temperature overlay if enabled
            if (this.showTemp && this.temperatureData) {
                this.drawTemperatureOverlay(paddingLeft, paddingTop, paddingRight, graphWidth, graphHeight);
            }

            // Draw X-axis labels
            this.drawXAxisLabels(paddingLeft, paddingBottom, graphWidth, graphHeight, height, textColor);

            // Draw hover tooltip
            if (this.hoverState.isHovering) {
                this.drawTooltip(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, height, totalBarWidth, textColor, isDark);
            }
        },

        drawPowerLine(paddingLeft, paddingTop, graphWidth, graphHeight, totalBarWidth) {
            const powers = this.data.map(d => parseFloat(d.power) || 0);
            const maxPower = Math.max(...powers, 1);
            
            this.ctx.strokeStyle = '#ea580c'; // Darker orange for power line
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            
            powers.forEach((power, idx) => {
                const x = paddingLeft + (idx * totalBarWidth) + totalBarWidth / 2;
                // Scale power to fit in graph (as secondary indicator)
                const ratio = power / maxPower;
                const y = paddingTop + graphHeight - (ratio * graphHeight * 0.7); // Use 70% of height
                
                if (idx === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            });
            
            this.ctx.stroke();
        },

        drawTemperatureOverlay(paddingLeft, paddingTop, paddingRight, graphWidth, graphHeight) {
            if (!this.temperatureData) return;

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

            // Add padding to temperature range
            const tempPadding = (maxTemp - minTemp) * 0.1;
            minTemp -= tempPadding;
            maxTemp += tempPadding;
            const tempRange = maxTemp - minTemp;

            // Draw temperature axis (right side)
            const rightX = paddingLeft + graphWidth;
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(rightX, paddingTop);
            this.ctx.lineTo(rightX, paddingTop + graphHeight);
            this.ctx.stroke();

            // Temperature axis labels
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

            // Helper function to calculate Y position for temperature
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

        drawXAxisLabels(paddingLeft, paddingBottom, graphWidth, graphHeight, height, textColor) {
            if (!this.data || this.data.length === 0) return;

            const dataCount = this.data.length;
            const totalBarWidth = graphWidth / dataCount;
            const isMobile = window.innerWidth <= 768;

            this.ctx.fillStyle = textColor;
            this.ctx.textAlign = 'center';
            this.ctx.font = isMobile ? '9px sans-serif' : '11px sans-serif';

            // Determine label interval
            let labelInterval = 1;
            if (this.currentPeriod === 'hours') {
                if (isMobile || dataCount > 24) labelInterval = Math.ceil(dataCount / 6);
                else if (dataCount > 12) labelInterval = 2;
            } else if (this.currentPeriod === 'days') {
                if (isMobile && dataCount > 7) labelInterval = Math.ceil(dataCount / 5);
                else if (dataCount > 14) labelInterval = Math.ceil(dataCount / 7);
                else if (dataCount > 7) labelInterval = 2;
            } else if (this.currentPeriod === 'months') {
                if (isMobile && dataCount > 6) labelInterval = Math.ceil(dataCount / 4);
                else if (dataCount > 12) labelInterval = 2;
            }

            this.data.forEach((point, index) => {
                if (index % labelInterval !== 0 && index !== dataCount - 1) return;

                const x = paddingLeft + (index * totalBarWidth) + totalBarWidth / 2;
                const y = height - paddingBottom + 20;

                const date = new Date(point.unixTimestamp * 1000);
                let label = '';

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

            // Draw vertical line
            this.ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(x, paddingTop);
            this.ctx.lineTo(x, height - paddingBottom);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // Prepare tooltip content
            const date = new Date(point.unixTimestamp * 1000);
            const timeText = this.formatTooltipTime(date);
            const production = parseFloat(point.production) || 0;
            const power = parseFloat(point.power) || 0;
            
            const lines = [
                { text: `Productie: ${this.formatNumber(production, 3)} kWh`, color: '#f59e0b' },
                { text: `Vermogen: ${this.formatNumber(power, 0)} W`, color: '#ea580c' }
            ];

            // Add temperature if available
            if (this.showTemp && this.temperatureData) {
                const tempData = this.temperatureData[point.unixTimestamp];
                if (tempData) {
                    lines.push({ text: `Temp: ${this.formatNumber(tempData.min, 1)}°C - ${this.formatNumber(tempData.max, 1)}°C`, color: '#666' });
                }
            }

            // Calculate tooltip dimensions
            const tooltipPadding = 12;
            this.ctx.font = 'bold 13px sans-serif';
            const timeWidth = this.ctx.measureText(timeText).width;
            
            this.ctx.font = '12px sans-serif';
            const maxLineWidth = Math.max(timeWidth, ...lines.map(l => this.ctx.measureText(l.text).width));
            
            const tooltipWidth = maxLineWidth + tooltipPadding * 2;
            const tooltipHeight = 50 + (lines.length * 20);

            // Position tooltip
            let tooltipX = x + 15;
            let tooltipY = paddingTop + 20;

            if (tooltipX + tooltipWidth > this.canvas.width - paddingRight) {
                tooltipX = x - tooltipWidth - 15;
            }

            // Draw tooltip background
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

            // Draw tooltip text
            this.ctx.textAlign = 'left';
            this.ctx.fillStyle = textColor;
            this.ctx.font = 'bold 13px sans-serif';
            this.ctx.fillText(timeText, tooltipX + tooltipPadding, tooltipY + 20);

            this.ctx.font = '12px sans-serif';
            lines.forEach((line, i) => {
                this.ctx.fillStyle = line.color;
                this.ctx.fillText(line.text, tooltipX + tooltipPadding, tooltipY + 40 + (i * 20));
            });
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

    // Auto-init when on solar page
    document.addEventListener('DOMContentLoaded', () => {
        if (window.P1MonConfig && window.P1MonConfig.currentPage === 'solar') {
            SolarManager.init();
        }
    });

})();