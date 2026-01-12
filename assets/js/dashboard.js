/**
 * Dashboard Manager
 * Handles all dashboard functionality, data fetching, and visualization
 */

(function() {
    'use strict';
    
    const DashboardManager = {
        // Update timer
        updateTimer: 10,
        updateInterval: null,
        timerInterval: null,
        
        // Connection status
        connectionStatusEl: null,
        isShowingConnectionStatus: false,
        
        // Chart hover state
        chartHoverState: {
            consumption: { x: -1, y: -1, isHovering: false },
            production: { x: -1, y: -1, isHovering: false }
        },
        
        // Chart data
        chartData: {
            consumption: [],
            production: [],
            labels: []
        },
        
        // Chart instances
        charts: {
            consumption: null,
            production: null
        },
        
        /**
         * Initialize dashboard
         */
        init() {
            console.log('Initializing dashboard...');
            
            // Get config from global
            const config = window.P1MonConfig || {};
            this.updateInterval = config.updateInterval || 10000;
            this.updateTimer = this.updateInterval / 1000;
            
            // Initialize charts
            this.initCharts();
            
            // Set up connection monitoring
            this.setupConnectionMonitoring();
            
            // Start data loop
            this.startDataLoop();
            
            // Listen for sidebar changes to resize charts
            document.addEventListener('sidebarchange', () => {
                setTimeout(() => this.resizeCharts(), 300);
            });
            
            // Listen for window resize
            window.addEventListener('resize', () => {
                this.resizeCharts();
            });
            
            console.log('Dashboard initialized');
        },
        
        /**
         * Initialize all charts
         */
        initCharts() {
            const consumptionCanvas = document.getElementById('chart-consumption');
            const productionCanvas = document.getElementById('chart-production');
            
            if (consumptionCanvas) {
                this.charts.consumption = consumptionCanvas.getContext('2d');
                this.setupChartHover(consumptionCanvas, 'consumption');
            }
            
            if (productionCanvas) {
                this.charts.production = productionCanvas.getContext('2d');
                this.setupChartHover(productionCanvas, 'production');
            }
        },
        
        /**
         * Setup hover listeners for chart
         */
        setupChartHover(canvas, type) {
            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                this.chartHoverState[type].x = x;
                this.chartHoverState[type].y = y;
                this.chartHoverState[type].isHovering = true;
                
                this.drawChart(type, this.chartData[type], type === 'consumption' ? '#f59e0b' : '#10b981');
            });
            
            canvas.addEventListener('mouseleave', () => {
                this.chartHoverState[type].isHovering = false;
                this.drawChart(type, this.chartData[type], type === 'consumption' ? '#f59e0b' : '#10b981');
            });
        },
        
        /**
         * Set up connection monitoring
         */
        setupConnectionMonitoring() {
            // Listen for connection status changes
            document.addEventListener('p1connection', (e) => {
                const { status, isOnline } = e.detail;
                
                if (status === 'offline') {
                    this.showConnectionStatus('offline');
                    this.showError('Verbinding verloren met P1 Monitor. Bezig met opnieuw verbinden...');
                } else if (status === 'online') {
                    this.showConnectionStatus('online');
                    this.hideError();
                    // Auto-hide after 3 seconds
                    setTimeout(() => {
                        this.hideConnectionStatus();
                    }, 3000);
                }
            });
        },
        
        /**
         * Show connection status indicator
         */
        showConnectionStatus(status) {
            // Create element if it doesn't exist
            if (!this.connectionStatusEl) {
                this.connectionStatusEl = document.createElement('div');
                this.connectionStatusEl.className = 'connection-status';
                document.body.appendChild(this.connectionStatusEl);
            }
            
            // Update status
            this.connectionStatusEl.className = `connection-status ${status}`;
            
            const icon = '<span class="status-icon"></span>';
            const text = status === 'online' 
                ? 'Verbonden met P1 Monitor' 
                : 'Verbinding verbroken';
            
            this.connectionStatusEl.innerHTML = `${icon}<span>${text}</span>`;
            this.isShowingConnectionStatus = true;
        },
        
        /**
         * Hide connection status indicator
         */
        hideConnectionStatus() {
            if (this.connectionStatusEl) {
                this.connectionStatusEl.style.animation = 'slideInDown 0.3s ease-out reverse';
                setTimeout(() => {
                    if (this.connectionStatusEl) {
                        this.connectionStatusEl.remove();
                        this.connectionStatusEl = null;
                        this.isShowingConnectionStatus = false;
                    }
                }, 300);
            }
        },
        
        /**
         * Start the data update loop
         */
        startDataLoop() {
            // Show initial loading
            this.showLoading();
            
            // Initial load
            this.updateAllData().finally(() => {
                this.hideLoading();
            });
            
            // Set up timer display
            this.timerInterval = setInterval(() => {
                this.updateTimer--;
                const timerEl = document.getElementById('timer-text');
                if (timerEl) {
                    timerEl.textContent = `Update over ${this.updateTimer}s`;
                }
                
                if (this.updateTimer <= 0) {
                    this.updateTimer = this.updateInterval / 1000;
                    this.updateAllData();
                }
            }, 1000);
        },
        
        /**
         * Show loading state
         */
        showLoading() {
            const loading = document.getElementById('loading-container');
            if (loading) loading.style.display = 'block';
        },
        
        /**
         * Hide loading state
         */
        hideLoading() {
            const loading = document.getElementById('loading-container');
            if (loading) loading.style.display = 'none';
        },
        
        /**
         * Update all dashboard data
         */
        async updateAllData() {
            try {
                await Promise.all([
                    this.fetchSmartMeter(),
                    this.fetchStatus(),
                    this.fetchHistoryDay(),
                    this.fetchFinancial(),
                    this.fetchWaterMeter()
                ]);
                
                // If we got here, data was fetched successfully
                this.hideError();
                
            } catch (error) {
                console.error('Error updating dashboard data:', error);
                
                // Check if we're offline
                const connectionStatus = window.P1API.getConnectionStatus();
                if (!connectionStatus.isOnline) {
                    this.showError('Kan geen verbinding maken met P1 Monitor. Controleer of de API is ingeschakeld in het setup scherm.');
                } else {
                    this.showError('Fout bij ophalen data. Probeer de pagina te verversen.');
                }
            }
        },
        
        /**
         * Fetch smart meter data (real-time)
         */
        async fetchSmartMeter() {
            try {
                const data = await window.P1API.getSmartMeter(60);
                if (!data || data.length === 0) {
                    console.warn('No smart meter data available');
                    return;
                }
                
                const latest = data[0];
                
                // Update current values
                const currentCons = latest[8] / 1000; // Watt to kW
                const currentProd = latest[9] / 1000;
                
                this.updateElement('current-consumption', this.formatValue(currentCons));
                this.updateElement('current-production', this.formatValue(currentProd));
                
                // Draw gauges
                const maxCons = window.P1MonConfig?.maxConsumption || 10;
                const maxProd = window.P1MonConfig?.maxProduction || 10;
                
                this.drawGauge('gauge-consumption', currentCons, maxCons, '#f59e0b');
                this.drawGauge('gauge-production', currentProd, maxProd, '#10b981');
                
                // Update meter readings
                this.updateElement('consumption-peak-total', this.formatValue(latest[4]) + ' kWh');
                this.updateElement('consumption-offpeak-total', this.formatValue(latest[3]) + ' kWh');
                this.updateElement('production-peak-total', this.formatValue(latest[6]) + ' kWh');
                this.updateElement('production-offpeak-total', this.formatValue(latest[5]) + ' kWh');
                
                // Update chart data
                this.updateChartData(data);
                
            } catch (error) {
                console.error('Error fetching smart meter data:', error);
                // Don't throw - let other API calls continue
            }
        },
        
        /**
         * Fetch status data (peaks, phases)
         */
        async fetchStatus() {
            try {
                const data = await window.P1API.getStatus();
                if (!data) return;
                
                let peaks = {
                    peakCons: 0, peakConsTime: '',
                    peakProd: 0, peakProdTime: '',
                    lowCons: 0, lowConsTime: '',
                    lowProd: 0, lowProdTime: ''
                };
                
                let phases = {
                    consumption: [0, 0, 0],
                    production: [0, 0, 0]
                };
                
                data.forEach(item => {
                    switch(item[0]) {
                        case 1: peaks.peakCons = item[1]; break;
                        case 2: peaks.peakConsTime = item[1].substring(11); break;
                        case 3: peaks.peakProd = item[1]; break;
                        case 4: peaks.peakProdTime = item[1].substring(11); break;
                        case 8: this.updateElement('consumption-offpeak-day', this.formatValue(item[1]) + ' kWh'); break;
                        case 9: this.updateElement('consumption-peak-day', this.formatValue(item[1]) + ' kWh'); break;
                        case 10: this.updateElement('production-offpeak-day', this.formatValue(item[1]) + ' kWh'); break;
                        case 11: this.updateElement('production-peak-day', this.formatValue(item[1]) + ' kWh'); break;
                        case 43: this.updateElement('gas-total', this.formatValue(item[1]) + ' m³'); break;
                        case 44: this.updateElement('gas-day', this.formatValue(item[1]) + ' m³'); break;
                        case 50: 
                            const gasRate = parseFloat(item[1]);
                            this.updateElement('gas-per-hour', this.formatValue(gasRate, 2) + ' m³/u');
                            this.updateElement('current-gas-rate', this.formatValue(gasRate, 2));
                            this.drawGauge('gauge-gas', gasRate, 1, '#3b82f6');
                            break;
                        case 74: phases.consumption[0] = parseFloat(item[1]); break;
                        case 75: phases.consumption[1] = parseFloat(item[1]); break;
                        case 76: phases.consumption[2] = parseFloat(item[1]); break;
                        case 77: phases.production[0] = parseFloat(item[1]); break;
                        case 78: phases.production[1] = parseFloat(item[1]); break;
                        case 79: phases.production[2] = parseFloat(item[1]); break;
                        case 113: peaks.lowCons = item[1]; break;
                        case 114: peaks.lowConsTime = item[1].substring(11); break;
                        case 115: peaks.lowProd = item[1]; break;
                        case 116: peaks.lowProdTime = item[1].substring(11); break;
                    }
                });
                
                // Update peak values
                this.updateElement('peak-consumption', this.formatValue(peaks.peakCons, 2) + ' kW');
                this.updateElement('peak-consumption-time', peaks.peakConsTime);
                this.updateElement('peak-production', this.formatValue(peaks.peakProd, 2) + ' kW');
                this.updateElement('peak-production-time', peaks.peakProdTime);
                
                // Update low values
                this.updateElement('low-consumption', this.formatValue(peaks.lowCons, 2) + ' kW');
                this.updateElement('low-consumption-time', peaks.lowConsTime);
                this.updateElement('low-production', this.formatValue(peaks.lowProd, 2) + ' kW');
                this.updateElement('low-production-time', peaks.lowProdTime);
                
                // Update phase bars
                this.updatePhaseBars('consumption', phases.consumption);
                this.updatePhaseBars('production', phases.production);
                
            } catch (error) {
                console.error('Error fetching status data:', error);
            }
        },
        
        /**
         * Fetch history day data
         */
        async fetchHistoryDay() {
            try {
                const data = await window.P1API.getHistoryDay();
                if (!data || data.length === 0) return;
                
                const dayData = data[0];
                this.updateElement('consumption-total-day', this.formatValue(dayData[6]) + ' kWh');
                this.updateElement('production-total-day', this.formatValue(dayData[7]) + ' kWh');
                
            } catch (error) {
                console.error('Error fetching history data:', error);
            }
        },
        
        /**
         * Fetch financial data
         */
        async fetchFinancial() {
            try {
                const data = await window.P1API.getFinancial();
                if (!data || data.length === 0) return;
                
                const costs = data[0];
                const totalCost = costs[2] + costs[3] + costs[6] + costs[7];
                const totalRevenue = costs[4] + costs[5];
                
                this.updateElement('consumption-cost', '€ ' + this.formatValue(totalCost, 2));
                this.updateElement('production-revenue', '€ ' + this.formatValue(totalRevenue, 2));
                
            } catch (error) {
                console.error('Error fetching financial data:', error);
            }
        },
        
        /**
         * Fetch water meter data
         */
        async fetchWaterMeter() {
            try {
                const data = await window.P1API.getWaterMeter();
                
                if (!data || data.length === 0) {
                    console.log('No water meter data available - hiding water card');
                    this.hideWaterCard();
                    return;
                }
                
                // Check if water meter has actual data (not just zeros)
                const hasData = data[0][5] > 0 || data[0][4] > 0;
                
                if (!hasData) {
                    console.log('Water meter exists but has no readings - hiding water card');
                    this.hideWaterCard();
                    return;
                }
                
                this.updateElement('water-current', this.formatValue(data[0][5]));
                this.updateElement('water-day', this.formatValue(data[0][4], 1) + ' liter');
                
                // Show the water card since we have data
                this.showWaterCard();
                
            } catch (error) {
                console.log('Water meter error - hiding water card:', error);
                this.hideWaterCard();
            }
        },
        
        /**
         * Hide water card
         */
        hideWaterCard() {
            const waterCard = document.querySelector('.water-card');
            if (waterCard) {
                waterCard.style.display = 'none';
            }
            
            // Also hide water menu item in sidebar
            this.hideWaterMenuItem();
        },
        
        /**
         * Show water card
         */
        showWaterCard() {
            const waterCard = document.querySelector('.water-card');
            if (waterCard) {
                waterCard.style.display = 'block';
            }
            
            // Also show water menu item in sidebar
            this.showWaterMenuItem();
        },
        
        /**
         * Hide water menu item in sidebar
         */
        hideWaterMenuItem() {
            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                const href = item.getAttribute('href');
                if (href && href.includes('page=water')) {
                    item.style.display = 'none';
                }
            });
        },
        
        /**
         * Show water menu item in sidebar
         */
        showWaterMenuItem() {
            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                const href = item.getAttribute('href');
                if (href && href.includes('page=water')) {
                    item.style.display = 'flex';
                }
            });
        },
        
        /**
         * Update chart data and redraw
         */
        updateChartData(data) {
            this.chartData.labels = [];
            this.chartData.consumption = [];
            this.chartData.production = [];
            
            // Process data in reverse (oldest to newest)
            for (let i = data.length - 1; i >= 0; i--) {
                const timestamp = new Date(data[i][1] * 1000);
                this.chartData.labels.push(timestamp);
                this.chartData.consumption.push(data[i][8] / 1000); // W to kW
                this.chartData.production.push(data[i][9] / 1000);
            }
            
            this.drawChart('consumption', this.chartData.consumption, '#f59e0b');
            this.drawChart('production', this.chartData.production, '#10b981');
        },
        
        /**
         * Draw gauge meter
         */
        drawGauge(canvasId, value, maxValue, color) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = 80;
            
            ctx.clearRect(0, 0, width, height);
            
            // Get theme colors
            const isDark = document.body.classList.contains('dark-theme');
            const bgColor = isDark ? '#334155' : '#e2e8f0';
            
            // Background arc
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
            ctx.lineWidth = 20;
            ctx.strokeStyle = bgColor;
            ctx.stroke();
            
            // Value arc
            const percentage = Math.min(value / maxValue, 1);
            const endAngle = 0.75 * Math.PI + (percentage * 1.5 * Math.PI);
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, endAngle);
            ctx.lineWidth = 20;
            ctx.strokeStyle = color;
            ctx.lineCap = 'round';
            ctx.stroke();
        },
        
        /**
         * Draw line chart
         */
        drawChart(type, data, color) {
            const canvasId = `chart-${type}`;
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            
            const width = canvas.width;
            const height = canvas.height;
            const padding = 40;
            const graphWidth = width - padding * 2;
            const graphHeight = height - padding * 2;
            
            ctx.clearRect(0, 0, width, height);
            
            if (data.length === 0) return;
            
            // Get theme colors
            const isDark = document.body.classList.contains('dark-theme');
            const gridColor = isDark ? '#334155' : '#e2e8f0';
            const textColor = isDark ? '#94a3b8' : '#64748b';
            
            // Calculate max value and round up to nearest kW
            const dataMax = Math.max(...data, 0.1);
            const maxValue = Math.ceil(dataMax);
            
            // Draw grid lines with 1 kW increments
            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1;
            
            for (let i = 0; i <= maxValue; i++) {
                const y = padding + graphHeight - (graphHeight / maxValue) * i;
                
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
                ctx.stroke();
                
                // Y-axis labels (1 kW increments)
                ctx.fillStyle = textColor;
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(i + ' kW', padding - 5, y + 4);
            }
            
            // Draw X-axis time labels (every 2 minutes)
            ctx.fillStyle = textColor;
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            
            const labelInterval = 12; // ~2 minutes with 10-second intervals
            
            for (let i = 0; i < this.chartData.labels.length; i += labelInterval) {
                const timestamp = this.chartData.labels[i];
                const x = padding + (graphWidth / (data.length - 1)) * i;
                const y = height - padding + 15;
                
                const hours = String(timestamp.getHours()).padStart(2, '0');
                const minutes = String(timestamp.getMinutes()).padStart(2, '0');
                const timeLabel = `${hours}:${minutes}`;
                
                ctx.fillText(timeLabel, x, y);
            }
            
            // Draw X-axis line
            ctx.strokeStyle = gridColor;
            ctx.beginPath();
            ctx.moveTo(padding, height - padding);
            ctx.lineTo(width - padding, height - padding);
            ctx.stroke();
            
            // Draw line
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            
            data.forEach((value, index) => {
                const x = padding + (graphWidth / (data.length - 1)) * index;
                const y = padding + graphHeight - (value / maxValue * graphHeight);
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
            
            // Fill area under line
            ctx.lineTo(width - padding, padding + graphHeight);
            ctx.lineTo(padding, padding + graphHeight);
            ctx.closePath();
            ctx.fillStyle = color + '20';
            ctx.fill();
            
            // Draw hover tooltip
            const hoverState = this.chartHoverState[type];
            if (hoverState.isHovering && data.length > 0) {
                const mouseX = hoverState.x;
                
                // Find closest data point
                const dataPointWidth = graphWidth / (data.length - 1);
                const index = Math.round((mouseX - padding) / dataPointWidth);
                
                if (index >= 0 && index < data.length) {
                    const value = data[index];
                    const timestamp = this.chartData.labels[index];
                    
                    const pointX = padding + (graphWidth / (data.length - 1)) * index;
                    const pointY = padding + graphHeight - (value / maxValue * graphHeight);
                    
                    // Draw vertical line
                    ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(pointX, padding);
                    ctx.lineTo(pointX, height - padding);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    // Draw point
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(pointX, pointY, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Draw tooltip
                    const tooltipPadding = 8;
                    const hours = String(timestamp.getHours()).padStart(2, '0');
                    const minutes = String(timestamp.getMinutes()).padStart(2, '0');
                    const seconds = String(timestamp.getSeconds()).padStart(2, '0');
                    
                    const days = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
                    const dayName = days[timestamp.getDay()];
                    
                    const timeText = `${dayName} ${hours}:${minutes}:${seconds}`;
                    const valueText = `vermogen kW: ${value.toFixed(3)}`;
                    
                    ctx.font = 'bold 12px sans-serif';
                    const timeWidth = ctx.measureText(timeText).width;
                    ctx.font = '12px sans-serif';
                    const valueWidth = ctx.measureText(valueText).width;
                    const tooltipWidth = Math.max(timeWidth, valueWidth) + tooltipPadding * 2;
                    const tooltipHeight = 50;
                    
                    // Position tooltip
                    let tooltipX = pointX + 10;
                    let tooltipY = pointY - tooltipHeight - 10;
                    
                    // Keep tooltip in bounds
                    if (tooltipX + tooltipWidth > width - padding) {
                        tooltipX = pointX - tooltipWidth - 10;
                    }
                    if (tooltipY < padding) {
                        tooltipY = pointY + 10;
                    }
                    
                    // Draw tooltip background
                    ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
                    ctx.strokeStyle = isDark ? '#475569' : '#e2e8f0';
                    ctx.lineWidth = 1;
                    
                    // Rounded rectangle
                    const radius = 4;
                    ctx.beginPath();
                    ctx.moveTo(tooltipX + radius, tooltipY);
                    ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
                    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
                    ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
                    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
                    ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
                    ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
                    ctx.lineTo(tooltipX, tooltipY + radius);
                    ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    
                    // Draw tooltip text
                    ctx.fillStyle = textColor;
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillText(timeText, tooltipX + tooltipPadding, tooltipY + 18);
                    
                    ctx.font = '12px sans-serif';
                    ctx.fillStyle = color;
                    ctx.fillText(valueText, tooltipX + tooltipPadding, tooltipY + 35);
                }
            }
        },
        
        /**
         * Update phase bars
         */
        updatePhaseBars(type, phases) {
            const hasData = phases.some(p => p > 0);
            const sectionId = `phase-${type}-section`;
            const barsId = `phase-${type}-bars`;
            
            const section = document.getElementById(sectionId);
            const container = document.getElementById(barsId);
            
            if (!hasData || !container) {
                if (section) section.style.display = 'none';
                return;
            }
            
            if (section) section.style.display = 'block';
            
            const color = type === 'consumption' ? '#f59e0b' : '#10b981';
            const maxPhase = Math.max(...phases.filter(p => p > 0), 0.1);
            
            container.innerHTML = '';
            
            phases.forEach((value, index) => {
                if (value === 0) return;
                
                const percentage = (value / maxPhase) * 100;
                const bar = document.createElement('div');
                bar.className = 'phase-bar';
                bar.innerHTML = `
                    <div class="phase-label">L${index + 1}</div>
                    <div class="phase-fill-container">
                        <div class="phase-fill" style="height: ${percentage}%; background: ${color};"></div>
                        <div class="phase-value">${this.formatValue(value, 3)} kW</div>
                    </div>
                `;
                container.appendChild(bar);
            });
        },
        
        /**
         * Resize charts (called on window resize or sidebar toggle)
         */
        resizeCharts() {
            this.drawChart('consumption', this.chartData.consumption, '#f59e0b');
            this.drawChart('production', this.chartData.production, '#10b981');
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
         * Update element text content safely
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
        },
        
        /**
         * Cleanup on page unload
         */
        destroy() {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
        }
    };
    
    // Auto-initialize if on dashboard page
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.body.dataset.page === 'dashboard') {
                DashboardManager.init();
            }
        });
    } else {
        if (document.body.dataset.page === 'dashboard') {
            DashboardManager.init();
        }
    }
    
    // Expose globally
    window.DashboardManager = DashboardManager;
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        DashboardManager.destroy();
    });
    
})();