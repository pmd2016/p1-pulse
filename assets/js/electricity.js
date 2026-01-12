/**
 * Electricity Page Manager
 * Handles chart rendering and interactivity for electricity data
 */

(function() {
    'use strict';
    
    const ElectricityManager = {
        // Current state
        currentPeriod: 'hours',
        currentZoom: 24,
        showNet: true,
        showTemp: false,
        
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
        
        // Chart data
        data: null,
        
        // Chart hover state
        hoverState: {
            x: -1,
            y: -1,
            isHovering: false
        },
        
        // Canvas context
        canvas: null,
        ctx: null,
        
        /**
         * Initialize electricity page
         */
        init() {
            console.log('Initializing electricity page...');
            
            // Set up canvas
            this.canvas = document.getElementById('electricity-chart');
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                this.setupChartHover();
            }
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Initialize zoom buttons
            this.updateZoomButtons();
            
            // Load initial data
            this.loadData();
            
            // Listen for window resize
            window.addEventListener('resize', () => {
                this.redrawChart();
            });
            
            console.log('Electricity page initialized');
        },
        
        /**
         * Setup event listeners
         */
        setupEventListeners() {
            // Period tabs
            document.querySelectorAll('.period-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    if (tab.disabled) return;
                    
                    const period = tab.dataset.period;
                    this.changePeriod(period);
                });
            });
            
            // Zoom buttons
            document.querySelectorAll('[data-zoom]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const zoom = parseInt(btn.dataset.zoom);
                    this.changeZoom(zoom);
                });
            });
            
            // Toggle switches
            const toggleNet = document.getElementById('toggle-net');
            if (toggleNet) {
                toggleNet.addEventListener('change', (e) => {
                    this.showNet = e.target.checked;
                    this.redrawChart();
                });
            }
            
            const toggleTemp = document.getElementById('toggle-temp');
            if (toggleTemp) {
                // Enable the temperature toggle
                toggleTemp.disabled = false;
                
                toggleTemp.addEventListener('change', (e) => {
                    this.showTemp = e.target.checked;
                    
                    // Show/hide temperature legend items
                    const legendItems = ['legend-temp-max', 'legend-temp-avg', 'legend-temp-min'];
                    legendItems.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) {
                            el.style.display = this.showTemp ? 'inline-flex' : 'none';
                        }
                    });
                    
                    // Reload data with temperature when toggled on
                    this.loadData();
                });
            }
        },

        /**
         * Update zoom buttons based on current period
         */
        updateZoomButtons() {
            const container = document.getElementById('zoom-buttons');
            if (!container) return;
            
            const options = this.zoomOptions[this.currentPeriod];
            if (!options) return;
            
            // Clear existing buttons
            container.innerHTML = '';
            
            // Add new buttons based on period
            options.forEach((option, index) => {
                const button = document.createElement('button');
                button.className = 'control-button';
                button.dataset.zoom = option.value;
                button.textContent = option.label;
                
                // First button is active by default
                if (index === 0) {
                    button.classList.add('active');
                }
                
                // Add click handler
                button.addEventListener('click', () => {
                    this.changeZoom(option.value);
                });
                
                container.appendChild(button);
            });
        },
        
        /**
         * Setup hover listeners for chart
         */
        setupChartHover() {
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
        
        /**
         * Change period
         */
        changePeriod(period) {
            this.currentPeriod = period;
            
            // Update active tab
            document.querySelectorAll('.period-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.period === period);
            });
            
            // Set default zoom for new period
            const defaultZooms = {
                hours: 24,
                days: 7,
                months: 12,
                years: 5
            };
            this.currentZoom = defaultZooms[period] || 7;
            
            // Update zoom buttons
            this.updateZoomButtons();
            
            // Load data
            this.loadData();
        },
        
        /**
         * Change zoom level
         */
        changeZoom(zoom) {
            this.currentZoom = zoom;
            
            // Update active button
            document.querySelectorAll('[data-zoom]').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.zoom) === zoom);
            });
            
            this.loadData();
        },
        
        /**
         * Load data from API
         */
        async loadData() {
            try {
                this.showLoading();
                
                const data = await window.P1API.getElectricityData(this.currentPeriod, this.currentZoom, this.showTemp);
                
                if (!data) {
                    this.showError('Geen data beschikbaar voor deze periode');
                    return;
                }
                
                this.data = data;
                this.updateStatistics();
                this.redrawChart();
                this.hideError();
                
            } catch (error) {
                console.error('Error loading electricity data:', error);
                this.showError('Fout bij ophalen data');
            } finally {
                this.hideLoading();
            }
        },
        
        /**
         * Update statistics cards
         */
        updateStatistics() {
            if (!this.data) return;
            
            const stats = this.data.stats;
            
            // Total consumption
            this.updateElement('stat-total-consumption', this.formatValue(stats.totalConsumption) + ' kWh');
            this.updateElement('stat-consumption-period', `Laatste ${this.currentZoom} ${this.getPeriodLabel()}`);
            
            // Total production
            this.updateElement('stat-total-production', this.formatValue(stats.totalProduction) + ' kWh');
            this.updateElement('stat-production-period', `Laatste ${this.currentZoom} ${this.getPeriodLabel()}`);
            
            // Net consumption
            this.updateElement('stat-net', this.formatValue(stats.netConsumption) + ' kWh');
            
            // Cost
            this.updateElement('stat-cost', '€ ' + this.formatValue(stats.totalCost, 2));
            this.updateElement('stat-cost-period', `Laatste ${this.currentZoom} ${this.getPeriodLabel()}`);
            
            // Average
            this.updateElement('stat-average', this.formatValue(stats.average) + ' kWh');
            this.updateElement('stat-average-period', `per ${this.getPeriodLabelSingular()}`);
            
            // Peak
            this.updateElement('stat-peak-value', this.formatValue(stats.peakConsumption.value) + ' kWh');
            
            // Format peak time based on period
            let peakTimeFormatted = stats.peakConsumption.time;
            if (this.currentPeriod === 'hours') {
                // Show time only: "18:30"
                peakTimeFormatted = stats.peakConsumption.time.substring(11, 16);
            } else if (this.currentPeriod === 'days') {
                // Show date: "10 jan"
                const date = new Date(stats.peakConsumption.time);
                const day = date.getDate();
                const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
                peakTimeFormatted = `${day} ${months[date.getMonth()]}`;
            }
            
            this.updateElement('stat-peak-time', peakTimeFormatted);
        },
        
        /**
         * Redraw chart
         */
        redrawChart() {
            if (!this.data || !this.canvas || !this.ctx) return;
            
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            
            const width = this.canvas.width;
            const height = this.canvas.height;
            const paddingLeft = 80;  // More space for large numbers
            const paddingRight = this.showTemp ? 70 : 40;  // Extra space for temperature axis
            const paddingTop = 40;
            const paddingBottom = 60;
            const graphWidth = width - paddingLeft - paddingRight;
            const graphHeight = height - paddingTop - paddingBottom;
            
            this.ctx.clearRect(0, 0, width, height);
            
            if (this.data.chartData.length === 0) return;
            
            // Get theme colors
            const isDark = document.body.classList.contains('dark-theme');
            const gridColor = isDark ? '#334155' : '#e2e8f0';
            const textColor = isDark ? '#94a3b8' : '#64748b';
            
            // Calculate max value for Y-axis
            const maxConsumption = Math.max(...this.data.chartData.map(d => d.consumption));
            const maxProduction = Math.max(...this.data.chartData.map(d => d.production));
            const dataMax = Math.max(maxConsumption, maxProduction, 0.1);
            
            // Determine appropriate increment based on data range
            let increment = 1;
            if (dataMax > 5000) {
                increment = 1000;
            } else if (dataMax > 2000) {
                increment = 500;
            } else if (dataMax > 1000) {
                increment = 200;
            } else if (dataMax > 500) {
                increment = 100;
            } else if (dataMax > 200) {
                increment = 50;
            } else if (dataMax > 100) {
                increment = 20;
            } else if (dataMax > 50) {
                increment = 10;
            } else if (dataMax > 20) {
                increment = 5;
            } else if (dataMax > 10) {
                increment = 2;
            }
            
            // Round max value up to nearest increment
            const maxValue = Math.ceil(dataMax / increment) * increment;
            
            // Draw Y-axis grid and labels
            this.ctx.strokeStyle = gridColor;
            this.ctx.lineWidth = 1;
            
            for (let i = 0; i <= maxValue; i += increment) {
                const y = paddingTop + graphHeight - (graphHeight / maxValue) * i;
                
                this.ctx.beginPath();
                this.ctx.moveTo(paddingLeft, y);
                this.ctx.lineTo(width - paddingRight, y);
                this.ctx.stroke();
                
                // Y-axis labels
                this.ctx.fillStyle = textColor;
                this.ctx.font = '12px sans-serif';
                this.ctx.textAlign = 'right';
                this.ctx.fillText(i + ' kWh', paddingLeft - 10, y + 4);
            }
            
            // Draw X-axis line
            this.ctx.strokeStyle = gridColor;
            this.ctx.beginPath();
            this.ctx.moveTo(paddingLeft, height - paddingBottom);
            this.ctx.lineTo(width - paddingRight, height - paddingBottom);
            this.ctx.stroke();
            
            // Calculate bar width
            const dataCount = this.data.chartData.length;
            const barSpacing = 4;
            const totalBarWidth = graphWidth / dataCount;
            const barWidth = Math.max(totalBarWidth - barSpacing, 2);
            
            // Draw bars and collect line points
            const netLinePoints = [];
            
            this.data.chartData.forEach((point, index) => {
                const x = paddingLeft + (index * totalBarWidth) + barSpacing / 2;
                const consHeight = (point.consumption / maxValue) * graphHeight;
                const prodHeight = (point.production / maxValue) * graphHeight;
                
                // Draw consumption bar (orange)
                this.ctx.fillStyle = '#f59e0b';
                this.ctx.fillRect(
                    x,
                    paddingTop + graphHeight - consHeight,
                    barWidth,
                    consHeight
                );
                
                // Draw production bar (green) - overlaid
                if (point.production > 0) {
                    this.ctx.fillStyle = '#10b981';
                    this.ctx.fillRect(
                        x,
                        paddingTop + graphHeight - prodHeight,
                        barWidth,
                        prodHeight
                    );
                }
                
                // Collect net line points
                if (this.showNet) {
                    const netHeight = (point.net / maxValue) * graphHeight;
                    const netY = paddingTop + graphHeight - netHeight;
                    netLinePoints.push({ x: x + barWidth / 2, y: netY });
                }
            });
            
            // Draw net consumption line (smooth curve)
            if (this.showNet && netLinePoints.length > 1) {
                this.ctx.beginPath();
                this.ctx.strokeStyle = '#64748b';
                this.ctx.lineWidth = 2;
                this.ctx.lineJoin = 'round';
                
                // Start at first point
                this.ctx.moveTo(netLinePoints[0].x, netLinePoints[0].y);
                
                // Draw smooth curve through points
                for (let i = 1; i < netLinePoints.length; i++) {
                    const current = netLinePoints[i];
                    const previous = netLinePoints[i - 1];
                    
                    // Calculate control points for smooth curve
                    const controlX = (previous.x + current.x) / 2;
                    const controlY = (previous.y + current.y) / 2;
                    
                    // Use quadratic curve for smooth flow
                    this.ctx.quadraticCurveTo(previous.x, previous.y, controlX, controlY);
                    
                    // If this is the last point, draw to it
                    if (i === netLinePoints.length - 1) {
                        this.ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
                    }
                }
                
                this.ctx.stroke();
            }
            
            // Draw temperature lines if enabled
            if (this.showTemp) {
                const tempScale = this.calculateTemperatureScale();
                if (tempScale) {
                    this.drawTemperatureLines(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, tempScale, totalBarWidth);
                    this.drawTemperatureAxis(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, tempScale, textColor);
                }
            }
            
            // Draw X-axis labels
            this.drawXAxisLabels(paddingLeft, paddingBottom, graphWidth, graphHeight, height, textColor);
            
            // Draw hover tooltip
            if (this.hoverState.isHovering) {
                this.drawTooltip(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, height, maxValue, totalBarWidth, textColor, isDark);
            }
        },
        
        /**
         * Draw X-axis labels
         */
        drawXAxisLabels(paddingLeft, paddingBottom, graphWidth, graphHeight, height, textColor) {
            if (!this.data) return;

            const dataCount = this.data.chartData.length;
            const totalBarWidth = graphWidth / dataCount;
            const isMobile = window.innerWidth <= 768;

            this.ctx.fillStyle = textColor;
            this.ctx.textAlign = 'center';

            // Adjust font size and rotation for mobile
            if (isMobile) {
                this.ctx.font = '9px sans-serif';
            } else {
                this.ctx.font = '11px sans-serif';
            }

            // Show fewer labels on small screens or with many data points
            let labelInterval = 1;
            if (this.currentPeriod === 'hours') {
                if (isMobile || dataCount > 24) {
                    labelInterval = Math.ceil(dataCount / 6); // Show ~6 labels on mobile
                } else if (dataCount > 12) {
                    labelInterval = 2;
                }
            } else if (this.currentPeriod === 'days') {
                if (isMobile && dataCount > 7) {
                    labelInterval = Math.ceil(dataCount / 5); // Show ~5 labels on mobile
                } else if (dataCount > 14) {
                    labelInterval = Math.ceil(dataCount / 7);
                } else if (dataCount > 7) {
                    labelInterval = 2;
                }
            } else if (this.currentPeriod === 'months') {
                if (isMobile && dataCount > 6) {
                    labelInterval = Math.ceil(dataCount / 4); // Show ~4 labels on mobile
                } else if (dataCount > 12) {
                    labelInterval = 2;
                }
            } else if (this.currentPeriod === 'years') {
                labelInterval = 1; // Always show all years
            }

            this.data.chartData.forEach((point, index) => {
                if (index % labelInterval !== 0 && index !== dataCount - 1) return;

                const x = paddingLeft + (index * totalBarWidth) + totalBarWidth / 2;
                const y = height - paddingBottom + 20;

                let label = '';
                const date = new Date(point.timestamp);

                if (this.currentPeriod === 'hours') {
                    // Show time: "08:00"
                    label = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                } else if (this.currentPeriod === 'days') {
                    // Show date: "10 jan"
                    const day = date.getDate();
                    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
                    label = `${day} ${months[date.getMonth()]}`;
                } else if (this.currentPeriod === 'months') {
                    // Show month and year: "jan 2026" or just "jan" on mobile
                    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
                    if (isMobile) {
                        label = `${months[date.getMonth()]}`; // Shorter format on mobile
                    } else {
                        label = `${months[date.getMonth()]} ${date.getFullYear()}`;
                    }
                } else if (this.currentPeriod === 'years') {
                    // Show year: "2026"
                    label = `${date.getFullYear()}`;
                }

                // On mobile with tight spacing, rotate labels for better readability
                if (isMobile && totalBarWidth < 30) {
                    this.ctx.save();
                    this.ctx.translate(x, y);
                    this.ctx.rotate(-Math.PI / 4); // -45 degrees
                    this.ctx.textAlign = 'right';
                    this.ctx.fillText(label, 0, 0);
                    this.ctx.restore();
                } else {
                    this.ctx.fillText(label, x, y);
                }
            });
        },
        
        /**
         * Calculate temperature scale for the secondary Y-axis
         * @returns {Object|null} Temperature scale with min, max, range
         */
        calculateTemperatureScale() {
            if (!this.data || !this.data.chartData) return null;
            
            let minTemp = Infinity;
            let maxTemp = -Infinity;
            let hasTemp = false;
            
            this.data.chartData.forEach(point => {
                if (point.tempMin !== undefined && !isNaN(point.tempMin)) {
                    minTemp = Math.min(minTemp, point.tempMin);
                    hasTemp = true;
                }
                if (point.tempMax !== undefined && !isNaN(point.tempMax)) {
                    maxTemp = Math.max(maxTemp, point.tempMax);
                    hasTemp = true;
                }
            });
            
            if (!hasTemp || minTemp === Infinity || maxTemp === -Infinity) {
                return null;
            }
            
            // Add padding (10% on each side)
            const range = maxTemp - minTemp;
            const padding = range * 0.1;
            minTemp -= padding;
            maxTemp += padding;
            
            return {
                min: minTemp,
                max: maxTemp,
                range: maxTemp - minTemp
            };
        },
        
        /**
         * Draw temperature lines (min, avg, max)
         */
        drawTemperatureLines(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, tempScale, totalBarWidth) {
            if (!tempScale || !this.data) return;
            
            const dataCount = this.data.chartData.length;
            
            // Helper function to calculate Y position for temperature
            const getTempY = (temp) => {
                const ratio = (temp - tempScale.min) / tempScale.range;
                return paddingTop + graphHeight - (ratio * graphHeight);
            };
            
            // Collect points for each temperature line
            const maxPoints = [];
            const avgPoints = [];
            const minPoints = [];
            
            this.data.chartData.forEach((point, index) => {
                const x = paddingLeft + (index * totalBarWidth) + totalBarWidth / 2;
                
                if (point.tempMax !== undefined && !isNaN(point.tempMax)) {
                    maxPoints.push({ x, y: getTempY(point.tempMax) });
                }
                if (point.tempAvg !== undefined && !isNaN(point.tempAvg)) {
                    avgPoints.push({ x, y: getTempY(point.tempAvg) });
                }
                if (point.tempMin !== undefined && !isNaN(point.tempMin)) {
                    minPoints.push({ x, y: getTempY(point.tempMin) });
                }
            });
            
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
            
            // Draw max temperature line (red, dashed, smooth)
            if (maxPoints.length > 1) {
                this.ctx.strokeStyle = '#ef4444';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]);
                this.ctx.lineJoin = 'round';
                this.ctx.beginPath();
                this.ctx.moveTo(maxPoints[0].x, maxPoints[0].y);
                
                for (let i = 1; i < maxPoints.length; i++) {
                    const current = maxPoints[i];
                    const previous = maxPoints[i - 1];
                    const controlX = (previous.x + current.x) / 2;
                    const controlY = (previous.y + current.y) / 2;
                    this.ctx.quadraticCurveTo(previous.x, previous.y, controlX, controlY);
                    if (i === maxPoints.length - 1) {
                        this.ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
                    }
                }
                
                this.ctx.stroke();
            }
            
            // Draw avg temperature line (dark gray/off-black, solid, smooth)
            if (avgPoints.length > 1) {
                this.ctx.strokeStyle = '#374151'; // Darker gray (off-black)
                this.ctx.lineWidth = 2.5; // Slightly thicker to stand out
                this.ctx.setLineDash([]);
                this.ctx.lineJoin = 'round';
                this.ctx.beginPath();
                this.ctx.moveTo(avgPoints[0].x, avgPoints[0].y);
                
                for (let i = 1; i < avgPoints.length; i++) {
                    const current = avgPoints[i];
                    const previous = avgPoints[i - 1];
                    const controlX = (previous.x + current.x) / 2;
                    const controlY = (previous.y + current.y) / 2;
                    this.ctx.quadraticCurveTo(previous.x, previous.y, controlX, controlY);
                    if (i === avgPoints.length - 1) {
                        this.ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
                    }
                }
                
                this.ctx.stroke();
            }
            
            // Draw min temperature line (blue, dashed, smooth)
            if (minPoints.length > 1) {
                this.ctx.strokeStyle = '#3b82f6';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]);
                this.ctx.lineJoin = 'round';
                this.ctx.beginPath();
                this.ctx.moveTo(minPoints[0].x, minPoints[0].y);
                
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
                
                this.ctx.stroke();
            }
            
            // Reset line dash
            this.ctx.setLineDash([]);
        },
        
        /**
         * Draw secondary Y-axis for temperature on the right side
         */
        drawTemperatureAxis(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, tempScale, textColor) {
            if (!tempScale) return;
            
            const rightX = paddingLeft + graphWidth;
            const isMobile = window.innerWidth <= 768;
            
            // Draw axis line
            this.ctx.strokeStyle = textColor;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(rightX, paddingTop);
            this.ctx.lineTo(rightX, paddingTop + graphHeight);
            this.ctx.stroke();
            
            // Draw tick marks and labels (5 ticks)
            this.ctx.fillStyle = textColor;
            this.ctx.font = isMobile ? '9px sans-serif' : '11px sans-serif';
            this.ctx.textAlign = 'left';
            
            const numTicks = 5;
            for (let i = 0; i <= numTicks; i++) {
                const ratio = i / numTicks;
                const temp = tempScale.min + (tempScale.range * ratio);
                const yPos = paddingTop + graphHeight - (ratio * graphHeight);
                
                // Tick mark
                this.ctx.strokeStyle = textColor;
                this.ctx.beginPath();
                this.ctx.moveTo(rightX, yPos);
                this.ctx.lineTo(rightX + 5, yPos);
                this.ctx.stroke();
                
                // Label
                this.ctx.fillText(`${Math.round(temp)}°C`, rightX + 8, yPos + 4);
            }
        },
        
        /**
         * Draw tooltip on hover
         */
        drawTooltip(paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, graphHeight, height, maxValue, totalBarWidth, textColor, isDark) {
            if (!this.data) return;
            
            const mouseX = this.hoverState.x;
            const dataCount = this.data.chartData.length;
            
            // Find closest data point
            const index = Math.floor((mouseX - paddingLeft) / totalBarWidth);
            
            if (index < 0 || index >= dataCount) return;
            
            const point = this.data.chartData[index];
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
            const date = new Date(point.timestamp);
            const timeText = this.formatTooltipTime(date);
            const consText = `Verbruik: ${this.formatValue(point.consumption)} kWh`;
            const prodText = `Productie: ${this.formatValue(point.production)} kWh`;
            const netText = `Netto: ${this.formatValue(point.net)} kWh`;
            
            // Add temperature text if available
            const hasTemp = this.showTemp && point.tempMin !== undefined;
            const tempTexts = hasTemp ? [
                `Max: ${point.tempMax.toFixed(1)}°C`,
                `Gem: ${point.tempAvg.toFixed(1)}°C`,
                `Min: ${point.tempMin.toFixed(1)}°C`
            ] : [];
            
            // Calculate tooltip dimensions
            const tooltipPadding = 12;
            this.ctx.font = 'bold 13px sans-serif';
            const timeWidth = this.ctx.measureText(timeText).width;
            this.ctx.font = '12px sans-serif';
            const consWidth = this.ctx.measureText(consText).width;
            const prodWidth = this.ctx.measureText(prodText).width;
            const netWidth = this.ctx.measureText(netText).width;
            
            let maxWidth = Math.max(timeWidth, consWidth, prodWidth, netWidth);
            if (hasTemp) {
                tempTexts.forEach(text => {
                    const w = this.ctx.measureText(text).width;
                    maxWidth = Math.max(maxWidth, w);
                });
            }
            
            const tooltipWidth = maxWidth + tooltipPadding * 2;
            const tooltipHeight = hasTemp ? 155 : 85;  // Increased from 135 to 155 for temperature

            // Position tooltip (avoid edges)
            let tooltipX = x + 15;
            let tooltipY = paddingTop + 20;

            // Check right edge
            if (tooltipX + tooltipWidth > this.canvas.width - paddingRight) {
                tooltipX = x - tooltipWidth - 15;
            }

            // Check left edge (ensure tooltip doesn't go off-canvas towards Y-axis)
            if (tooltipX < paddingLeft + 10) {
                tooltipX = paddingLeft + 10;
            }

            // Check bottom edge
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
            this.ctx.fillStyle = '#f59e0b';
            this.ctx.fillText(consText, tooltipX + tooltipPadding, tooltipY + 40);
            
            this.ctx.fillStyle = '#10b981';
            this.ctx.fillText(prodText, tooltipX + tooltipPadding, tooltipY + 57);
            
            this.ctx.fillStyle = '#64748b';
            this.ctx.fillText(netText, tooltipX + tooltipPadding, tooltipY + 74);
            
            // Draw temperature data if available
            if (hasTemp) {
                this.ctx.fillStyle = textColor;
                this.ctx.font = 'bold 11px sans-serif';
                this.ctx.fillText('Temperatuur:', tooltipX + tooltipPadding, tooltipY + 95);
                
                this.ctx.font = '12px sans-serif';
                this.ctx.fillStyle = '#ef4444';
                this.ctx.fillText(tempTexts[0], tooltipX + tooltipPadding, tooltipY + 110);
                
                this.ctx.fillStyle = '#374151'; // Dark gray to match avg line
                this.ctx.fillText(tempTexts[1], tooltipX + tooltipPadding, tooltipY + 125);
                
                this.ctx.fillStyle = '#3b82f6';
                this.ctx.fillText(tempTexts[2], tooltipX + tooltipPadding, tooltipY + 140);
            }
        },
        
        /**
         * Format tooltip time based on period
         */
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
        },
        
        /**
         * Get period label (plural)
         */
        getPeriodLabel() {
            const labels = {
                'hours': 'uren',
                'days': 'dagen',
                'months': 'maanden',
                'years': 'jaren'
            };
            return labels[this.currentPeriod] || 'periodes';
        },
        
        /**
         * Get period label (singular)
         */
        getPeriodLabelSingular() {
            const labels = {
                'hours': 'uur',
                'days': 'dag',
                'months': 'maand',
                'years': 'jaar'
            };
            return labels[this.currentPeriod] || 'periode';
        },
        
        /**
         * Show loading state
         */
        showLoading() {
            // Could add a loading spinner here
        },
        
        /**
         * Hide loading state
         */
        hideLoading() {
            // Hide loading spinner
        },
        
        /**
         * Show error message
         */
        showError(message) {
            const container = document.getElementById('error-container');
            if (!container) return;
            
            container.innerHTML = `
                <div class="error">
                    <span style="font-size: 1.5rem;">⚠️</span>
                    <div>
                        <strong>Fout</strong><br>
                        ${message}
                    </div>
                </div>
            `;
        },
        
        /**
         * Hide error message
         */
        hideError() {
            const container = document.getElementById('error-container');
            if (container) {
                container.innerHTML = '';
            }
        },
        
        /**
         * Update element text safely
         */
        updateElement(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        },
        
        /**
         * Format number value
         */
        formatValue(value, decimals = 3) {
            return Number(value).toFixed(decimals);
        }
    };
    
    // Auto-initialize if on electricity page
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.body.dataset.page === 'electricity') {
                ElectricityManager.init();
            }
        });
    } else {
        if (document.body.dataset.page === 'electricity') {
            ElectricityManager.init();
        }
    }
    
    // Expose globally
    window.ElectricityManager = ElectricityManager;
    
})();