/**
 * Electricity Page Manager
 * Handles chart rendering and interactivity for electricity data
 * Uses ChartBase for common functionality
 */

(function() {
    'use strict';

    const ElectricityManager = window.ChartBase.createManager({
        canvasId: 'electricity-chart',
        zoomButtonsId: 'zoom-buttons',
        pageName: 'electricity',
        defaultPeriod: 'hours',
        defaultZoom: 24,
        features: {
            largePaddingLeft: true,
            largePaddingTop: true
        },

        onInit() {
            this.showNet = true;
            this.showTemp = false;
        },

        onSetupEventListeners() {
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
                toggleTemp.disabled = false;
                toggleTemp.addEventListener('change', (e) => {
                    this.showTemp = e.target.checked;
                    this.toggleTemperatureLegend(e.target.checked);
                    this.loadData();
                });
            }
        },

        async onLoadData() {
            try {
                ChartBase.showLoading();

                const data = await window.P1API.getElectricityData(this.currentPeriod, this.currentZoom, this.showTemp);

                if (!data) {
                    ChartBase.showError('Geen data beschikbaar voor deze periode');
                    return;
                }

                this.data = data;
                this.updateStatistics();
                this.redrawChart();
                ChartBase.hideError();

            } catch (error) {
                P1Logger.error('Error loading electricity data:', error);
                ChartBase.showError('Fout bij ophalen data');
            } finally {
                ChartBase.hideLoading();
            }
        },

        onUpdateStatistics() {
            if (!this.data) return;

            const stats = this.data.stats;
            const periodLabel = ChartBase.periodLabels[this.currentPeriod] || 'periodes';
            const periodLabelSingular = ChartBase.periodLabelsSingular[this.currentPeriod] || 'periode';

            ChartBase.updateElement('stat-total-consumption', ChartBase.formatNumber(stats.totalConsumption, 3) + ' kWh');
            ChartBase.updateElement('stat-consumption-period', `Laatste ${this.currentZoom} ${periodLabel}`);

            ChartBase.updateElement('stat-total-production', ChartBase.formatNumber(stats.totalProduction, 3) + ' kWh');
            ChartBase.updateElement('stat-production-period', `Laatste ${this.currentZoom} ${periodLabel}`);

            ChartBase.updateElement('stat-net', ChartBase.formatNumber(stats.netConsumption, 3) + ' kWh');

            ChartBase.updateElement('stat-cost', '€ ' + ChartBase.formatNumber(stats.totalCost, 2));
            ChartBase.updateElement('stat-cost-period', `Laatste ${this.currentZoom} ${periodLabel}`);

            ChartBase.updateElement('stat-average', ChartBase.formatNumber(stats.average, 3) + ' kWh');
            ChartBase.updateElement('stat-average-period', `per ${periodLabelSingular}`);

            ChartBase.updateElement('stat-peak-value', ChartBase.formatNumber(stats.peakConsumption.value, 3) + ' kWh');

            // Format peak time
            let peakTimeFormatted = stats.peakConsumption.time;
            if (this.currentPeriod === 'hours') {
                peakTimeFormatted = stats.peakConsumption.time.substring(11, 16);
            } else if (this.currentPeriod === 'days') {
                const date = new Date(stats.peakConsumption.time);
                peakTimeFormatted = `${date.getDate()} ${ChartBase.monthNamesShort[date.getMonth()]}`;
            }
            ChartBase.updateElement('stat-peak-time', peakTimeFormatted);
        },

        onDrawChart(dimensions, theme) {
            const { paddingLeft, paddingRight, paddingTop, paddingBottom, graphWidth, graphHeight, width, height } = dimensions;

            if (this.data.chartData.length === 0) return;

            // Update features based on current state
            this.features.showTemp = this.showTemp;

            // Calculate max value for Y-axis
            const maxConsumption = Math.max(...this.data.chartData.map(d => d.consumption));
            const maxProduction = Math.max(...this.data.chartData.map(d => d.production));
            const dataMax = Math.max(maxConsumption, maxProduction, 0.1);

            // Calculate increment
            let increment = 1;
            if (dataMax > 5000) increment = 1000;
            else if (dataMax > 2000) increment = 500;
            else if (dataMax > 1000) increment = 200;
            else if (dataMax > 500) increment = 100;
            else if (dataMax > 200) increment = 50;
            else if (dataMax > 100) increment = 20;
            else if (dataMax > 50) increment = 10;
            else if (dataMax > 20) increment = 5;
            else if (dataMax > 10) increment = 2;

            const maxValue = Math.ceil(dataMax / increment) * increment;

            // Draw Y-axis grid and labels
            this.ctx.strokeStyle = theme.gridColor;
            this.ctx.lineWidth = 1;

            for (let i = 0; i <= maxValue; i += increment) {
                const y = paddingTop + graphHeight - (graphHeight / maxValue) * i;

                this.ctx.beginPath();
                this.ctx.moveTo(paddingLeft, y);
                this.ctx.lineTo(width - paddingRight, y);
                this.ctx.stroke();

                this.ctx.fillStyle = theme.textColor;
                this.ctx.font = '12px sans-serif';
                this.ctx.textAlign = 'right';
                this.ctx.fillText(i + ' kWh', paddingLeft - 10, y + 4);
            }

            // Draw X-axis line
            ChartBase.drawXAxisLine(this.ctx, dimensions, theme);

            // Calculate bar dimensions
            const dataCount = this.data.chartData.length;
            const barSpacing = 4;
            const totalBarWidth = graphWidth / dataCount;
            const barWidth = Math.max(totalBarWidth - barSpacing, 2);

            // Draw bars and collect net line points
            const netLinePoints = [];

            this.data.chartData.forEach((point, index) => {
                const x = paddingLeft + (index * totalBarWidth) + barSpacing / 2;
                const consHeight = (point.consumption / maxValue) * graphHeight;
                const prodHeight = (point.production / maxValue) * graphHeight;

                // Draw consumption bar (orange)
                this.ctx.fillStyle = '#f59e0b';
                this.ctx.fillRect(x, paddingTop + graphHeight - consHeight, barWidth, consHeight);

                // Draw production bar (green)
                if (point.production > 0) {
                    this.ctx.fillStyle = '#10b981';
                    this.ctx.fillRect(x, paddingTop + graphHeight - prodHeight, barWidth, prodHeight);
                }

                // Collect net line points
                if (this.showNet) {
                    const netHeight = (point.net / maxValue) * graphHeight;
                    const netY = paddingTop + graphHeight - netHeight;
                    netLinePoints.push({ x: x + barWidth / 2, y: netY });
                }
            });

            // Draw net consumption line
            if (this.showNet && netLinePoints.length > 1) {
                ChartBase.drawSmoothLine(this.ctx, netLinePoints, '#64748b', 2);
            }

            // Draw temperature lines if enabled
            if (this.showTemp) {
                const tempData = this.data.chartData.map(p => ({
                    min: p.tempMin,
                    avg: p.tempAvg,
                    max: p.tempMax
                }));
                const tempScale = ChartBase.calculateTemperatureScale(tempData);

                if (tempScale) {
                    ChartBase.drawTemperatureLines(this.ctx, dimensions, tempData, tempScale);
                    ChartBase.drawTemperatureAxis(this.ctx, dimensions, theme, tempScale);
                }
            }

            // Draw X-axis labels
            ChartBase.drawXAxisLabels(this.ctx, dimensions, theme, this.data.chartData, this.currentPeriod);
        },

        onDrawTooltipContent(point, index) {
            const ts = point.timestamp;
            const date = new Date(ts);
            const header = ChartBase.formatTooltipTime(date, this.currentPeriod);

            const lines = [
                { text: `Verbruik: ${ChartBase.formatNumber(point.consumption, 3)} kWh`, color: '#f59e0b' },
                { text: `Productie: ${ChartBase.formatNumber(point.production, 3)} kWh`, color: '#10b981' },
                { text: `Netto: ${ChartBase.formatNumber(point.net, 3)} kWh`, color: '#64748b' }
            ];

            // Add temperature if available
            if (this.showTemp && point.tempMin !== undefined) {
                lines.push({ text: `Max: ${point.tempMax.toFixed(1)}°C`, color: '#ef4444' });
                lines.push({ text: `Gem: ${point.tempAvg.toFixed(1)}°C`, color: '#374151' });
                lines.push({ text: `Min: ${point.tempMin.toFixed(1)}°C`, color: '#3b82f6' });
            }

            return { header, lines };
        }
    });

    // Add helper method
    ElectricityManager.toggleTemperatureLegend = function(show) {
        ['legend-temp-max', 'legend-temp-avg', 'legend-temp-min'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = show ? 'inline-flex' : 'none';
        });
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
