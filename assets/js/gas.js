/**
 * Gas Page Manager
 * Handles chart rendering and interactivity for gas data
 * 
 * FIXES:
 * 1. Corrected fillMissingData() to handle period boundaries properly
 * 2. Fixed statistics to show consumption per period, not cumulative totals
 * 3. Added proper zero-consumption handling
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

            const toggle = document.getElementById('toggle-gas-smoothed');
            if (toggle) toggle.addEventListener('change', () => this.redrawChart());
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
            // defaults
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
                // Reuse electricity data endpoint which also contains gas in column 9
                const payload = await window.P1API.getElectricityData(this.currentPeriod, this.currentZoom, false);
                if (!payload || !payload.chartData) {
                    this.showError('Geen data beschikbaar');
                    console.warn('No chartData returned for period:', this.currentPeriod, 'zoom:', this.currentZoom, 'payload:', payload);
                    return;
                }

                console.log('Gas data loaded for period:', this.currentPeriod, 'items:', payload.chartData.length);
                this.data = payload.chartData;
                
                // FIX: Fill missing data BEFORE updating statistics
                this.data = this.fillMissingData(this.data, this.currentPeriod);
                console.log('After fillMissingData:', this.data.length, 'items');
                
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

            // FIX: The 'gas' field in the API response is the CONSUMPTION PER PERIOD (column 9)
            // NOT cumulative meter readings. It's already the per-period volume.
            const gasValues = this.data.map(d => parseFloat(d.gas) || 0);
            
            // Save for charting
            this.plotValues = gasValues;

            // Calculate totals and statistics
            const total = gasValues.reduce((s, v) => s + v, 0);
            const avg = gasValues.length > 0 ? total / gasValues.length : 0;
            
            // Check if there's actual consumption
            const hasConsumption = total > 0.001;
            
            // Find peak
            let peakValue = 0;
            let peakTime = '';
            gasValues.forEach((v, idx) => {
                if (v > peakValue) {
                    peakValue = v;
                    const p = this.data[idx];
                    peakTime = p ? (p.timestamp || p.unixTimestamp || '') : '';
                }
            });

            // Estimate current flow (m3/h) from last value
            let flow = 0;
            if (this.data.length >= 1) {
                // For hourly data, the gas value IS the flow rate
                if (this.currentPeriod === 'hours') {
                    flow = gasValues[gasValues.length - 1] || 0;
                } else if (this.currentPeriod === 'days') {
                    // For daily: divide by 24 to get hourly rate
                    flow = (gasValues[gasValues.length - 1] || 0) / 24;
                } else {
                    // For longer periods, estimate from last two points
                    if (this.data.length >= 2) {
                        const lastValue = gasValues[gasValues.length - 1];
                        const secondLastValue = gasValues[gasValues.length - 2];
                        const avgRecent = (lastValue + secondLastValue) / 2;
                        
                        if (this.currentPeriod === 'months') {
                            flow = avgRecent / (30 * 24); // rough estimate
                        } else if (this.currentPeriod === 'years') {
                            flow = avgRecent / (365 * 24); // rough estimate
                        }
                    }
                }
            }

            // FIX: Display consumption per period, not cumulative
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
            
            // Update cost
            if (hasConsumption) {
                this.updateElement('stat-gas-cost', '€ ' + this.formatNumber(total * 1.5, 2));
                this.updateElement('stat-gas-cost-period', `Geschat`);
            } else {
                this.updateElement('stat-gas-cost', '€ 0.00');
                this.updateElement('stat-gas-cost-period', `Geen verbruik`);
            }
            
            // Update average
            this.updateElement('stat-gas-average', this.formatNumber(avg, 3) + ' m³');
            this.updateElement('stat-gas-average-period', `per ${this.getPeriodLabelSingular()}`);
            
            // Update flow
            if (flow > 0.001) {
                this.updateElement('stat-gas-flow', this.formatNumber(flow, 3) + ' m³/h');
            } else {
                this.updateElement('stat-gas-flow', '0.000 m³/h');
            }
            
            // Update peak
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

        /**
         * FIX: Normalize a date to the start of a period
         */
        normalizeToPerio dStart(date, period) {
            const normalized = new Date(date);
            
            if (period === 'hours') {
                normalized.setMinutes(0, 0, 0);
            } else if (period === 'days') {
                normalized.setHours(0, 0, 0, 0);
            } else if (period === 'months') {
                normalized.setDate(1);
                normalized.setHours(0, 0, 0, 0);
            } else if (period === 'years') {
                normalized.setMonth(0, 1);
                normalized.setHours(0, 0, 0, 0);
            }
            
            return normalized;
        },

        /**
         * FIX: Get a normalized period key for grouping data
         */
        getPeriodKey(ts, period) {
            const date = new Date(ts * 1000);
            
            if (period === 'hours') {
                // Normalize to hour boundary
                date.setMinutes(0, 0, 0);
                return Math.floor(date.getTime() / 1000);
            } else if (period === 'days') {
                // Normalize to day boundary (midnight)
                date.setHours(0, 0, 0, 0);
                return Math.floor(date.getTime() / 1000);
            } else if (period === 'months') {
                // Normalize to first day of month at midnight
                date.setDate(1);
                date.setHours(0, 0, 0, 0);
                return Math.floor(date.getTime() / 1000);
            } else if (period === 'years') {
                // Normalize to Jan 1 at midnight
                date.setMonth(0, 1);
                date.setHours(0, 0, 0, 0);
                return Math.floor(date.getTime() / 1000);
            }
            
            return ts;
        },

        /**
         * FIX: Completely rewritten fillMissingData to handle period boundaries correctly
         */
        fillMissingData(data, period) {
            if (data.length === 0) return data;

            // Sort by timestamp
            data.sort((a, b) => (a.unixTimestamp || 0) - (b.unixTimestamp || 0));

            // Create a map that groups data by normalized period keys
            // Use array values to handle multiple data points per period
            const dataMap = new Map();
            
            data.forEach(d => {
                const ts = d.unixTimestamp || 0;
                const key = this.getPeriodKey(ts, period);
                
                if (!dataMap.has(key)) {
                    dataMap.set(key, []);
                }
                dataMap.get(key).push(d);
            });

            // Get the range of periods to fill
            const startTs = data[0].unixTimestamp || 0;
            const endTs = data[data.length - 1].unixTimestamp || 0;
            
            // Normalize start and end to period boundaries
            const startDate = this.normalizeToPerio dStart(new Date(startTs * 1000), period);
            const endDate = this.normalizeToPerio dStart(new Date(endTs * 1000), period);

            const filled = [];
            let currentDate = new Date(startDate);
            
            // Iterate through all periods in the range
            while (currentDate <= endDate) {
                const currentTs = Math.floor(currentDate.getTime() / 1000);
                const key = this.getPeriodKey(currentTs, period);
                
                if (dataMap.has(key)) {
                    // Get all data points for this period
                    const dataPoints = dataMap.get(key);
                    
                    // Use the LAST (most recent) data point for this period
                    // This ensures we get the latest reading if multiple exist
                    const selectedPoint = dataPoints[dataPoints.length - 1];
                    
                    // Use the normalized timestamp for consistency
                    filled.push({
                        ...selectedPoint,
                        unixTimestamp: currentTs,
                        timestamp: new Date(currentTs * 1000).toISOString().slice(0, 19).replace('T', ' ')
                    });
                } else {
                    // No data for this period - fill with zero
                    filled.push({
                        timestamp: new Date(currentTs * 1000).toISOString().slice(0, 19).replace('T', ' '),
                        unixTimestamp: currentTs,
                        gas: 0
                    });
                }

                // Increment to next period
                if (period === 'hours') {
                    currentDate.setHours(currentDate.getHours() + 1);
                } else if (period === 'days') {
                    currentDate.setDate(currentDate.getDate() + 1);
                } else if (period === 'months') {
                    currentDate.setMonth(currentDate.getMonth() + 1);
                } else if (period === 'years') {
                    currentDate.setFullYear(currentDate.getFullYear() + 1);
                }
            }

            console.log(`fillMissingData: ${data.length} raw → ${filled.length} filled (period: ${period})`);
            return filled;
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
            const paddingRight = 20;
            const paddingTop = 30;
            const paddingBottom = 60;
            const graphWidth = width - paddingLeft - paddingRight;
            const graphHeight = height - paddingTop - paddingBottom;

            this.ctx.clearRect(0,0,width,height);

            // Get theme colors
            const isDark = document.body.classList.contains('dark-theme');
            const gridColor = isDark ? '#334155' : '#e2e8f0';
            const textColor = isDark ? '#94a3b8' : '#64748b';

            // Use plotValues for rendering (these are the per-period consumption values)
            const values = (this.plotValues && this.plotValues.length > 0) ? this.plotValues : this.data.map(d => parseFloat(d.gas) || 0);
            const maxV = Math.max(...values, 0.001);
            const gridLines = 4;
            const ticks = this.calculateNiceTicks(0, maxV, gridLines + 1);
            const niceMax = Math.max(...ticks);
            
            this.ctx.strokeStyle = gridColor;
            this.ctx.fillStyle = textColor;
            this.ctx.font = '12px sans-serif';

            // Draw Y-axis grid and labels
            ticks.forEach(v => {
                const y = paddingTop + graphHeight - (graphHeight * (v / niceMax));
                this.ctx.beginPath();
                this.ctx.moveTo(paddingLeft, y);
                this.ctx.lineTo(width - paddingRight, y);
                this.ctx.stroke();
                this.ctx.textAlign = 'right';
                this.ctx.fillText(this.formatNumber(v, 2) + ' m³', paddingLeft - 8, y + 4);
            });

            // Draw X-axis line
            this.ctx.strokeStyle = gridColor;
            this.ctx.beginPath();
            this.ctx.moveTo(paddingLeft, height - paddingBottom);
            this.ctx.lineTo(width - paddingRight, height - paddingBottom);
            this.ctx.stroke();

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

            // Draw X-axis labels
            this.drawXAxisLabels(paddingLeft, paddingBottom, graphWidth, graphHeight, height, textColor);

            // Draw hover tooltip
            if (this.hoverState.isHovering) {
                this.drawTooltip(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, height, totalBarWidth, textColor, isDark);
            }
        },

        drawXAxisLabels(paddingLeft, paddingBottom, graphWidth, graphHeight, height, textColor) {
            if (!this.data || this.data.length === 0) return;

            const dataCount = this.data.length;
            const totalBarWidth = graphWidth / dataCount;
            const isMobile = window.innerWidth <= 768;

            this.ctx.fillStyle = textColor;
            this.ctx.textAlign = 'center';
            this.ctx.font = isMobile ? '9px sans-serif' : '11px sans-serif';

            // Show fewer labels on small screens or with many data points
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

            // Find closest data point
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
            const ts = point.unixTimestamp || (typeof point.timestamp === 'string' && parseInt(point.timestamp));
            const date = ts ? new Date(ts * 1000) : new Date();
            const timeText = this.formatTooltipTime(date);
            
            // Use plotValues for tooltip (per-period consumption)
            const gasValue = this.plotValues && this.plotValues[index] !== undefined ? this.plotValues[index] : (parseFloat(point.gas) || 0);
            const gasText = `Verbruik: ${this.formatNumber(gasValue, 3)} m³`;

            // Calculate tooltip dimensions
            const tooltipPadding = 12;
            this.ctx.font = 'bold 13px sans-serif';
            const timeWidth = this.ctx.measureText(timeText).width;
            this.ctx.font = '12px sans-serif';
            const gasWidth = this.ctx.measureText(gasText).width;

            const maxWidth = Math.max(timeWidth, gasWidth);
            const tooltipWidth = maxWidth + tooltipPadding * 2;
            const tooltipHeight = 65;

            // Position tooltip
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
            this.ctx.fillStyle = '#fb923c';
            this.ctx.fillText(gasText, tooltipX + tooltipPadding, tooltipY + 40);
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

    // Auto-init when on gas page
    document.addEventListener('DOMContentLoaded', () => {
        if (window.P1MonConfig && window.P1MonConfig.currentPage === 'gas') {
            GasManager.init();
        }
    });

})();