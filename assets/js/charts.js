/**
 * ChartBase - Shared chart functionality
 * Eliminates duplication across electricity.js, gas.js, solar.js
 */

(function() {
    'use strict';

    /**
     * Base chart configuration and utilities
     */
    const ChartBase = {
        // Common zoom options used across all chart types
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

        // Default zoom values per period
        defaultZooms: {
            hours: 24,
            days: 7,
            months: 12,
            years: 5
        },

        // Period labels
        periodLabels: {
            hours: 'uren',
            days: 'dagen',
            months: 'maanden',
            years: 'jaren'
        },

        periodLabelsSingular: {
            hours: 'uur',
            days: 'dag',
            months: 'maand',
            years: 'jaar'
        },

        // Dutch day names
        dayNames: ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'],

        // Dutch month names (short)
        monthNamesShort: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],

        // Dutch month names (full)
        monthNamesFull: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],

        // Dutch month names (capitalized)
        monthNamesCapitalized: ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'],

        /**
         * Create a new chart manager instance
         * @param {Object} config - Configuration object
         * @returns {Object} Chart manager instance
         */
        createManager(config) {
            const manager = {
                // State
                currentPeriod: config.defaultPeriod || 'hours',
                currentZoom: config.defaultZoom || 24,
                data: null,
                canvas: null,
                ctx: null,
                hoverState: { x: -1, y: -1, isHovering: false },

                // Config
                canvasId: config.canvasId,
                zoomButtonsId: config.zoomButtonsId,
                pageName: config.pageName,

                // Callbacks
                onLoadData: config.onLoadData,
                onUpdateStatistics: config.onUpdateStatistics,
                onDrawChart: config.onDrawChart,
                onDrawTooltipContent: config.onDrawTooltipContent,

                // Optional features
                features: config.features || {},

                /**
                 * Initialize the chart manager
                 */
                init() {
                    this.canvas = document.getElementById(this.canvasId);
                    if (this.canvas) {
                        this.ctx = this.canvas.getContext('2d');
                        ChartBase.setupChartHover(this);
                    }

                    this.setupEventListeners();
                    this.updateZoomButtons();

                    if (config.onInit) config.onInit.call(this);

                    this.loadData();

                    window.addEventListener('resize', () => this.redrawChart());
                },

                /**
                 * Setup common event listeners
                 */
                setupEventListeners() {
                    // Period tabs
                    document.querySelectorAll('.period-tab').forEach(tab => {
                        tab.addEventListener('click', () => {
                            if (tab.disabled) return;
                            this.changePeriod(tab.dataset.period);
                        });
                    });

                    // Custom event listeners from config
                    if (config.onSetupEventListeners) {
                        config.onSetupEventListeners.call(this);
                    }
                },

                /**
                 * Update zoom buttons for current period
                 */
                updateZoomButtons() {
                    const container = document.getElementById(this.zoomButtonsId);
                    if (!container) return;

                    container.replaceChildren();
                    const options = ChartBase.zoomOptions[this.currentPeriod] || ChartBase.zoomOptions.hours;

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

                /**
                 * Change period
                 */
                changePeriod(period) {
                    this.currentPeriod = period;

                    document.querySelectorAll('.period-tab').forEach(tab => {
                        tab.classList.toggle('active', tab.dataset.period === period);
                    });

                    this.currentZoom = ChartBase.defaultZooms[period] || 24;
                    this.updateZoomButtons();
                    this.loadData();
                },

                /**
                 * Change zoom level
                 */
                changeZoom(zoom) {
                    this.currentZoom = zoom;

                    const container = document.getElementById(this.zoomButtonsId);
                    if (container) {
                        container.querySelectorAll('.control-button').forEach(btn => {
                            btn.classList.toggle('active', parseInt(btn.dataset.zoom) === zoom);
                        });
                    }

                    this.loadData();
                },

                /**
                 * Load data (delegates to config callback)
                 */
                async loadData() {
                    if (this.onLoadData) {
                        await this.onLoadData.call(this);
                    }
                },

                /**
                 * Update statistics (delegates to config callback)
                 */
                updateStatistics() {
                    if (this.onUpdateStatistics) {
                        this.onUpdateStatistics.call(this);
                    }
                },

                /**
                 * Redraw the chart
                 */
                redrawChart() {
                    if (!this.data || !this.canvas || !this.ctx) return;

                    const dimensions = ChartBase.setupCanvas(this.canvas, this.ctx, this.features);
                    const theme = ChartBase.getThemeColors();

                    if (this.onDrawChart) {
                        this.onDrawChart.call(this, dimensions, theme);
                    }

                    // Draw hover tooltip
                    if (this.hoverState.isHovering && this.onDrawTooltipContent) {
                        ChartBase.drawTooltip(this, dimensions, theme);
                    }
                },

                // Utility methods bound to instance
                formatNumber: ChartBase.formatNumber,
                getPeriodLabel: () => ChartBase.periodLabels[manager.currentPeriod] || 'periodes',
                getPeriodLabelSingular: () => ChartBase.periodLabelsSingular[manager.currentPeriod] || 'periode',
                showError: ChartBase.showError,
                hideError: ChartBase.hideError,
                showLoading: ChartBase.showLoading,
                hideLoading: ChartBase.hideLoading,
                updateElement: ChartBase.updateElement
            };

            return manager;
        },

        /**
         * Setup canvas dimensions and return chart dimensions
         */
        setupCanvas(canvas, ctx, features = {}) {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;

            const width = canvas.width;
            const height = canvas.height;
            const paddingLeft = features.largePaddingLeft ? 80 : 60;
            const paddingRight = features.showSecondaryAxis ? 60 : (features.showTemp ? 70 : 20);
            const paddingTop = features.largePaddingTop ? 40 : 30;
            const paddingBottom = 60;
            const graphWidth = width - paddingLeft - paddingRight;
            const graphHeight = height - paddingTop - paddingBottom;

            ctx.clearRect(0, 0, width, height);

            return {
                width,
                height,
                paddingLeft,
                paddingRight,
                paddingTop,
                paddingBottom,
                graphWidth,
                graphHeight
            };
        },

        /**
         * Get current theme colors
         */
        getThemeColors() {
            const isDark = document.body.classList.contains('dark-theme');
            return {
                isDark,
                gridColor: isDark ? '#334155' : '#e2e8f0',
                textColor: isDark ? '#94a3b8' : '#64748b',
                tooltipBg: isDark ? '#1e293b' : '#ffffff',
                tooltipBorder: isDark ? '#475569' : '#e2e8f0',
                hoverLine: isDark ? '#64748b' : '#94a3b8'
            };
        },

        /**
         * Setup hover listeners for a chart
         */
        setupChartHover(manager) {
            if (!manager.canvas) return;

            manager.canvas.addEventListener('mousemove', (e) => {
                const rect = manager.canvas.getBoundingClientRect();
                manager.hoverState.x = e.clientX - rect.left;
                manager.hoverState.y = e.clientY - rect.top;
                manager.hoverState.isHovering = true;
                manager.redrawChart();
            });

            manager.canvas.addEventListener('mouseleave', () => {
                manager.hoverState.isHovering = false;
                manager.redrawChart();
            });
        },

        /**
         * Calculate nice tick values for an axis
         */
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

        /**
         * Calculate a nice step value
         */
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
         * Draw Y-axis grid lines and labels
         */
        drawYAxis(ctx, dimensions, theme, ticks, niceMax, unit) {
            const { paddingLeft, paddingRight, paddingTop, graphWidth, graphHeight, width } = dimensions;

            ctx.strokeStyle = theme.gridColor;
            ctx.fillStyle = theme.textColor;
            ctx.font = '12px sans-serif';
            ctx.lineWidth = 1;

            ticks.forEach(v => {
                const y = paddingTop + graphHeight - (graphHeight * (v / niceMax));

                ctx.beginPath();
                ctx.moveTo(paddingLeft, y);
                ctx.lineTo(width - paddingRight, y);
                ctx.stroke();

                ctx.textAlign = 'right';
                ctx.fillText(this.formatNumber(v, 2) + ' ' + unit, paddingLeft - 8, y + 4);
            });
        },

        /**
         * Draw X-axis line
         */
        drawXAxisLine(ctx, dimensions, theme) {
            const { paddingLeft, paddingRight, paddingBottom, width, height } = dimensions;

            ctx.strokeStyle = theme.gridColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(paddingLeft, height - paddingBottom);
            ctx.lineTo(width - paddingRight, height - paddingBottom);
            ctx.stroke();
        },

        /**
         * Draw X-axis labels
         */
        drawXAxisLabels(ctx, dimensions, theme, data, currentPeriod) {
            if (!data || data.length === 0) return;

            const { paddingLeft, paddingBottom, graphWidth, height } = dimensions;
            const dataCount = data.length;
            const totalBarWidth = graphWidth / dataCount;
            const isMobile = window.innerWidth <= 768;

            ctx.fillStyle = theme.textColor;
            ctx.textAlign = 'center';
            ctx.font = isMobile ? '9px sans-serif' : '11px sans-serif';

            // Calculate label interval
            let labelInterval = 1;
            if (currentPeriod === 'hours') {
                if (isMobile || dataCount > 24) labelInterval = Math.ceil(dataCount / 6);
                else if (dataCount > 12) labelInterval = 2;
            } else if (currentPeriod === 'days') {
                if (isMobile && dataCount > 7) labelInterval = Math.ceil(dataCount / 5);
                else if (dataCount > 14) labelInterval = Math.ceil(dataCount / 7);
                else if (dataCount > 7) labelInterval = 2;
            } else if (currentPeriod === 'months') {
                if (isMobile && dataCount > 6) labelInterval = Math.ceil(dataCount / 4);
                else if (dataCount > 12) labelInterval = 2;
            }

            data.forEach((point, index) => {
                if (index % labelInterval !== 0 && index !== dataCount - 1) return;

                const x = paddingLeft + (index * totalBarWidth) + totalBarWidth / 2;
                const y = height - paddingBottom + 20;

                // Get timestamp from data point
                const ts = point.unixTimestamp || (typeof point.timestamp === 'string' ? parseInt(point.timestamp) : point.timestamp);
                const date = ts ? new Date(ts * 1000) : new Date(point.timestamp);

                const label = this.formatXAxisLabel(date, currentPeriod, isMobile);

                if (isMobile && totalBarWidth < 30) {
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(-Math.PI / 4);
                    ctx.textAlign = 'right';
                    ctx.fillText(label, 0, 0);
                    ctx.restore();
                } else {
                    ctx.fillText(label, x, y);
                }
            });
        },

        /**
         * Format X-axis label based on period
         */
        formatXAxisLabel(date, period, isMobile) {
            if (period === 'hours') {
                return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            } else if (period === 'days') {
                return `${date.getDate()} ${this.monthNamesShort[date.getMonth()]}`;
            } else if (period === 'months') {
                if (isMobile) {
                    return this.monthNamesShort[date.getMonth()];
                }
                return `${this.monthNamesShort[date.getMonth()]} ${date.getFullYear()}`;
            } else if (period === 'years') {
                return `${date.getFullYear()}`;
            }
            return '';
        },

        /**
         * Format tooltip time based on period
         */
        formatTooltipTime(date, period) {
            if (period === 'hours') {
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${this.dayNames[date.getDay()]} ${hours}:${minutes}`;
            } else if (period === 'days') {
                return `${date.getDate()} ${this.monthNamesFull[date.getMonth()]} ${date.getFullYear()}`;
            } else if (period === 'months') {
                return `${this.monthNamesCapitalized[date.getMonth()]} ${date.getFullYear()}`;
            } else if (period === 'years') {
                return `${date.getFullYear()}`;
            }
            return date.toLocaleString('nl-NL');
        },

        /**
         * Draw tooltip with rounded corners
         */
        drawTooltip(manager, dimensions, theme) {
            const { paddingLeft, paddingTop, paddingRight, paddingBottom, graphWidth, height } = dimensions;
            const data = manager.data;
            const dataCount = Array.isArray(data) ? data.length : (data.chartData ? data.chartData.length : 0);
            const chartData = Array.isArray(data) ? data : data.chartData;

            if (!chartData || dataCount === 0) return;

            const totalBarWidth = graphWidth / dataCount;
            const mouseX = manager.hoverState.x;
            const index = Math.floor((mouseX - paddingLeft) / totalBarWidth);

            if (index < 0 || index >= dataCount) return;

            const point = chartData[index];
            const x = paddingLeft + (index * totalBarWidth) + totalBarWidth / 2;

            // Draw vertical line
            manager.ctx.strokeStyle = theme.hoverLine;
            manager.ctx.lineWidth = 1;
            manager.ctx.setLineDash([5, 5]);
            manager.ctx.beginPath();
            manager.ctx.moveTo(x, paddingTop);
            manager.ctx.lineTo(x, height - paddingBottom);
            manager.ctx.stroke();
            manager.ctx.setLineDash([]);

            // Get tooltip content from callback
            const content = manager.onDrawTooltipContent.call(manager, point, index);
            if (!content) return;

            // Measure text
            const tooltipPadding = 12;
            manager.ctx.font = 'bold 13px sans-serif';
            const headerWidth = manager.ctx.measureText(content.header).width;

            manager.ctx.font = '12px sans-serif';
            let maxLineWidth = headerWidth;
            content.lines.forEach(line => {
                const w = manager.ctx.measureText(line.text).width;
                maxLineWidth = Math.max(maxLineWidth, w);
            });

            const tooltipWidth = maxLineWidth + tooltipPadding * 2;
            const tooltipHeight = 30 + (content.lines.length * 17) + (content.extraHeight || 0);

            // Position tooltip
            let tooltipX = x + 15;
            let tooltipY = paddingTop + 20;

            if (tooltipX + tooltipWidth > manager.canvas.width - paddingRight) {
                tooltipX = x - tooltipWidth - 15;
            }
            if (tooltipX < paddingLeft + 10) {
                tooltipX = paddingLeft + 10;
            }
            if (tooltipY + tooltipHeight > manager.canvas.height - paddingBottom) {
                tooltipY = manager.canvas.height - paddingBottom - tooltipHeight - 10;
            }

            // Draw rounded rectangle background
            this.drawRoundedRect(manager.ctx, tooltipX, tooltipY, tooltipWidth, tooltipHeight, 6, theme.tooltipBg, theme.tooltipBorder);

            // Draw header
            manager.ctx.textAlign = 'left';
            manager.ctx.fillStyle = theme.textColor;
            manager.ctx.font = 'bold 13px sans-serif';
            manager.ctx.fillText(content.header, tooltipX + tooltipPadding, tooltipY + 20);

            // Draw lines
            manager.ctx.font = '12px sans-serif';
            content.lines.forEach((line, i) => {
                manager.ctx.fillStyle = line.color || theme.textColor;
                manager.ctx.fillText(line.text, tooltipX + tooltipPadding, tooltipY + 37 + (i * 17));
            });

            // Draw extra content if provided
            if (content.onDrawExtra) {
                content.onDrawExtra(tooltipX + tooltipPadding, tooltipY + 37 + (content.lines.length * 17));
            }
        },

        /**
         * Draw a rounded rectangle
         */
        drawRoundedRect(ctx, x, y, width, height, radius, fillColor, strokeColor) {
            ctx.fillStyle = fillColor;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();

            ctx.fill();
            ctx.stroke();
        },

        /**
         * Draw bars on the chart
         */
        drawBars(ctx, dimensions, values, maxValue, color, barSpacing = 2) {
            const { paddingLeft, paddingTop, graphWidth, graphHeight } = dimensions;
            const count = values.length;
            const totalBarWidth = graphWidth / count;
            const barWidth = Math.max(totalBarWidth - barSpacing, 1);

            ctx.fillStyle = color;

            values.forEach((v, idx) => {
                const x = paddingLeft + idx * totalBarWidth + barSpacing / 2;
                const h = (v / maxValue) * graphHeight;
                const y = paddingTop + graphHeight - h;
                ctx.fillRect(x, y, barWidth, h);
            });

            return { totalBarWidth, barWidth };
        },

        /**
         * Draw a smooth line through points
         */
        drawSmoothLine(ctx, points, color, lineWidth = 2, dashed = false) {
            if (points.length < 2) return;

            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineJoin = 'round';
            ctx.setLineDash(dashed ? [5, 5] : []);

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            for (let i = 1; i < points.length; i++) {
                const current = points[i];
                const previous = points[i - 1];
                const controlX = (previous.x + current.x) / 2;
                const controlY = (previous.y + current.y) / 2;

                ctx.quadraticCurveTo(previous.x, previous.y, controlX, controlY);

                if (i === points.length - 1) {
                    ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
                }
            }

            ctx.stroke();
            ctx.setLineDash([]);
        },

        /**
         * Draw temperature lines (min, avg, max) with filled area
         */
        drawTemperatureLines(ctx, dimensions, tempData, tempScale) {
            if (!tempData || !tempScale) return;

            const { paddingLeft, paddingTop, graphWidth, graphHeight } = dimensions;
            const totalBarWidth = graphWidth / tempData.length;

            const getTempY = (temp) => {
                if (temp === null || isNaN(temp)) return null;
                const ratio = (temp - tempScale.min) / tempScale.range;
                return paddingTop + graphHeight - (ratio * graphHeight);
            };

            // Collect points
            const maxPoints = [];
            const avgPoints = [];
            const minPoints = [];

            tempData.forEach((temp, idx) => {
                if (!temp) return;
                const x = paddingLeft + (idx * totalBarWidth) + totalBarWidth / 2;

                if (temp.max !== null && temp.max !== undefined) {
                    const y = getTempY(temp.max);
                    if (y !== null) maxPoints.push({ x, y });
                }
                if (temp.avg !== null && temp.avg !== undefined) {
                    const y = getTempY(temp.avg);
                    if (y !== null) avgPoints.push({ x, y });
                }
                if (temp.min !== null && temp.min !== undefined) {
                    const y = getTempY(temp.min);
                    if (y !== null) minPoints.push({ x, y });
                }
            });

            // Fill area between min and max
            if (maxPoints.length > 1 && minPoints.length > 1) {
                ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
                ctx.beginPath();
                ctx.moveTo(minPoints[0].x, minPoints[0].y);

                // Forward through min points
                for (let i = 1; i < minPoints.length; i++) {
                    const current = minPoints[i];
                    const previous = minPoints[i - 1];
                    const controlX = (previous.x + current.x) / 2;
                    const controlY = (previous.y + current.y) / 2;
                    ctx.quadraticCurveTo(previous.x, previous.y, controlX, controlY);
                    if (i === minPoints.length - 1) {
                        ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
                    }
                }

                // Connect to max
                ctx.lineTo(maxPoints[maxPoints.length - 1].x, maxPoints[maxPoints.length - 1].y);

                // Backward through max points
                for (let i = maxPoints.length - 2; i >= 0; i--) {
                    const current = maxPoints[i];
                    const next = maxPoints[i + 1];
                    const controlX = (current.x + next.x) / 2;
                    const controlY = (current.y + next.y) / 2;
                    ctx.quadraticCurveTo(next.x, next.y, controlX, controlY);
                    if (i === 0) {
                        ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
                    }
                }

                ctx.closePath();
                ctx.fill();
            }

            // Draw lines
            this.drawSmoothLine(ctx, maxPoints, '#ef4444', 2, true);  // Red, dashed
            this.drawSmoothLine(ctx, avgPoints, '#374151', 2.5, false); // Dark gray, solid
            this.drawSmoothLine(ctx, minPoints, '#3b82f6', 2, true);  // Blue, dashed
        },

        /**
         * Draw secondary Y-axis (right side) for temperature
         */
        drawTemperatureAxis(ctx, dimensions, theme, tempScale) {
            if (!tempScale) return;

            const { paddingLeft, paddingTop, graphWidth, graphHeight } = dimensions;
            const rightX = paddingLeft + graphWidth;
            const isMobile = window.innerWidth <= 768;

            // Draw axis line
            ctx.strokeStyle = theme.textColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(rightX, paddingTop);
            ctx.lineTo(rightX, paddingTop + graphHeight);
            ctx.stroke();

            // Draw tick marks and labels
            ctx.fillStyle = theme.textColor;
            ctx.font = isMobile ? '9px sans-serif' : '11px sans-serif';
            ctx.textAlign = 'left';

            const ticks = this.calculateNiceTicks(tempScale.min, tempScale.max, 5);

            ticks.forEach(temp => {
                const ratio = (temp - tempScale.min) / tempScale.range;
                const y = paddingTop + graphHeight - (ratio * graphHeight);

                // Tick mark
                ctx.strokeStyle = theme.textColor;
                ctx.beginPath();
                ctx.moveTo(rightX, y);
                ctx.lineTo(rightX + 5, y);
                ctx.stroke();

                // Label
                ctx.fillText(`${Math.round(temp)}°C`, rightX + 8, y + 4);
            });
        },

        /**
         * Calculate temperature scale from data
         */
        calculateTemperatureScale(tempData) {
            if (!tempData || tempData.length === 0) return null;

            let minTemp = Infinity;
            let maxTemp = -Infinity;

            tempData.forEach(temp => {
                if (!temp) return;
                if (temp.min !== null && temp.min !== undefined && !isNaN(temp.min)) {
                    minTemp = Math.min(minTemp, temp.min);
                }
                if (temp.max !== null && temp.max !== undefined && !isNaN(temp.max)) {
                    maxTemp = Math.max(maxTemp, temp.max);
                }
            });

            if (!isFinite(minTemp) || !isFinite(maxTemp)) return null;

            // Add padding
            const range = maxTemp - minTemp;
            const padding = Math.max(range * 0.1, 1);
            minTemp -= padding;
            maxTemp += padding;

            return {
                min: minTemp,
                max: maxTemp,
                range: maxTemp - minTemp
            };
        },

        /**
         * Get period key for timestamp (used for data grouping)
         */
        getPeriodKey(timestamp, period) {
            const date = new Date(timestamp * 1000);
            if (period === 'hours') {
                return Math.floor(timestamp / 3600);
            } else if (period === 'days') {
                return date.toDateString();
            } else if (period === 'months') {
                return date.getFullYear() + '-' + (date.getMonth() + 1);
            } else if (period === 'years') {
                return date.getFullYear();
            }
            return timestamp;
        },

        // Utility methods
        formatNumber(value, decimals = 2) {
            return (Math.round((value || 0) * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals);
        },

        updateElement(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        },

        showError(message) {
            const el = document.getElementById('error-container');
            if (!el) return;
            el.textContent = '';
            const div = document.createElement('div');
            div.className = 'error';
            div.textContent = message;
            el.appendChild(div);
        },

        hideError() {
            const el = document.getElementById('error-container');
            if (el) el.textContent = '';
        },

        showLoading() {
            const el = document.getElementById('loading-container');
            if (el) el.style.display = 'block';
        },

        hideLoading() {
            const el = document.getElementById('loading-container');
            if (el) el.style.display = 'none';
        }
    };

    // Expose globally
    window.ChartBase = ChartBase;

})();
