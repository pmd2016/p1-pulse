/**
 * P1Chart - the one chart component used by every section
 *
 * A thin layer over Chart.js (assets/vendor/chartjs) that gives every page
 * the same visual language:
 *   - amounts per bucket (kWh, m³, L, €) are bars, grouped side by side
 *   - rates and derived values (W, net) are lines
 *   - temperature is a min-max band plus an average line on a right axis
 *
 * Colours come from the --series-* tokens in variables.css and are
 * re-read when the theme changes. The legend is rendered as HTML buttons
 * so series can be shown or hidden by tapping them.
 *
 * Usage:
 *   const chart = P1Chart.create(canvas, {
 *       unit: 'kWh',
 *       decimals: 'period',         // or a number; 'period' = P1Utils.amountDecimals
 *       legendEl: document.getElementById('electricity-legend'),
 *       series: [
 *           { key: 'consumption', label: 'Verbruik', type: 'bar', token: 'series-import' },
 *           { key: 'net', label: 'Netto', type: 'line', token: 'series-net' },
 *           { key: 'power', label: 'Vermogen', type: 'line', token: 'series-solar-power', axis: 'y2' }
 *       ],
 *       axes: { y2: { unit: 'W', decimals: 0, title: '' } }   // optional right-hand axis
 *   });
 *   chart.setData(points, 'hours', { temperature: true });
 *
 * Each point needs `unixTimestamp` (seconds) plus one field per series key;
 * a value of null leaves that slot empty (e.g. the rest of today).
 *
 * `compact: true` draws a sparkline: no axes, grid or legend, tooltips kept.
 * Tooltips are HTML (renderTooltip), so they can extend past the canvas.
 * `stacked: true` stacks the bar series (negative values below zero);
 * line series stay unstacked. `prefix: '€ '` puts a currency before values.
 * With temperature enabled, points may carry tempMin, tempAvg and tempMax.
 */

(function() {
    'use strict';

    const TEMPERATURE_SERIES = [
        { key: 'tempMax', label: 'Temp max', token: 'series-temp-max', dashed: true },
        { key: 'tempMin', label: 'Temp min', token: 'series-temp-min', dashed: true },
        { key: 'tempAvg', label: 'Temp gem', token: 'series-temp-avg' }
    ];

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // prefix is for currencies ("€ 1.23"), unit for quantities ("1.23 kWh")
    function withUnit(n, unit, prefix) {
        const text = unit ? `${n} ${unit}` : `${n}`;
        return prefix ? `${prefix}${text}` : text;
    }

    function formatTick(value, unit, prefix) {
        // Axis ticks: at most 2 decimals, trailing zeros dropped
        return withUnit(P1Utils.formatCompact(value, 2), unit, prefix);
    }

    function formatValue(value, decimals, unit, prefix) {
        return withUnit(P1Utils.formatNumber(value, decimals), unit, prefix);
    }

    function toDate(point) {
        const ts = point.unixTimestamp || (typeof point.timestamp === 'string' ? Date.parse(point.timestamp) / 1000 : point.timestamp);
        return new Date(ts * 1000);
    }

    const P1Chart = {
        create(canvas, config) {
            if (!canvas || !window.Chart) {
                P1Logger.warn('[P1Chart] Chart.js or canvas missing');
                return null;
            }

            // Match the page font once; Chart.js caches defaults per chart
            window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

            const instance = Object.create(ChartProto);
            instance.canvas = canvas;
            instance.config = Object.assign({ unit: '', decimals: 2, series: [], axes: {} }, config);
            instance.hidden = new Set(config.hiddenByDefault || []);
            instance.points = [];
            instance.period = 'hours';
            instance.temperature = false;
            instance.chart = null;

            instance._onTheme = () => instance.render();
            document.addEventListener('themechange', instance._onTheme);

            return instance;
        }
    };

    const ChartProto = {
        /**
         * Replace the data and redraw
         * @param {Array} points - chronological data points
         * @param {string} period - 'hours' | 'days' | 'months' | 'years'
         * @param {Object} options - { temperature: boolean }
         */
        setData(points, period, options = {}) {
            this.points = points || [];
            this.period = period;
            this.temperature = !!options.temperature && this.points.some(p => p.tempAvg !== undefined);
            this.render();
        },

        /**
         * Show or hide a series by key
         */
        setSeriesVisible(key, visible) {
            if (visible) this.hidden.delete(key);
            else this.hidden.add(key);
            this.render();
        },

        /**
         * All series currently on the chart (configured + temperature)
         */
        activeSeries() {
            const series = this.config.series.slice();
            if (this.temperature) {
                TEMPERATURE_SERIES.forEach(s => series.push(Object.assign({ type: 'line', axis: 'temp' }, s)));
            }
            return series;
        },

        buildDatasets() {
            const color = (token) => P1Utils.color(token);

            return this.activeSeries().map((s, index) => {
                const data = this.points.map(p => {
                    const v = p[s.key];
                    return v === undefined || v === null || isNaN(v) ? null : Number(v);
                });
                const c = color(s.token);
                const base = {
                    label: s.label,
                    data,
                    hidden: this.hidden.has(s.key),
                    yAxisID: s.axis === 'temp' ? 'temp' : (s.axis || 'y'),
                    p1Key: s.key,
                    p1Index: index,
                    p1Dashed: !!s.dashed
                };

                if (s.type === 'bar') {
                    return Object.assign(base, {
                        type: 'bar',
                        backgroundColor: c,
                        hoverBackgroundColor: c,
                        borderRadius: this.config.compact ? 2 : 3,
                        categoryPercentage: this.config.compact ? 0.9 : 0.8,
                        barPercentage: this.config.compact ? 0.95 : 0.9,
                        stack: this.config.stacked ? 'bars' : undefined,
                        order: 2
                    });
                }

                const line = Object.assign(base, {
                    type: 'line',
                    borderColor: c,
                    backgroundColor: c,
                    borderWidth: s.axis === 'temp' ? 1.5 : 2,
                    borderDash: s.dashed ? [4, 4] : [],
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHitRadius: 8,
                    tension: 0.3,
                    cubicInterpolationMode: 'monotone', // no overshoot past real values
                    spanGaps: true,
                    fill: false,
                    order: 1
                });

                // Temperature band: fill between min and max
                if (s.key === 'tempMin') {
                    line.fill = { target: '-1' };
                    line.backgroundColor = color('series-temp-band');
                }

                return line;
            });
        },

        buildOptions() {
            const cfg = this.config;
            const period = this.period;
            const isPhone = P1Utils.isPhone();
            const text = P1Utils.color('chart-text');
            const grid = P1Utils.color('chart-grid');
            const dates = this.points.map(toDate);
            const tempVisible = this.temperature && TEMPERATURE_SERIES.some(s => !this.hidden.has(s.key));
            const y2 = Object.assign({ unit: '', decimals: 2 }, cfg.axes.y2 || {});
            const y2Visible = cfg.series.some(s => s.axis === 'y2' && !this.hidden.has(s.key));

            const options = {
                responsive: true,
                maintainAspectRatio: false,
                animation: prefersReducedMotion() ? false : { duration: 250 },
                interaction: { mode: 'index', intersect: false },
                layout: { padding: cfg.compact ? 0 : { top: 4 } },
                plugins: {
                    legend: { display: false },
                    // Area fills (the temperature band) go behind the bars
                    filler: { drawTime: 'beforeDatasetsDraw' },
                    /*
                     * Tooltip as an HTML element over the page (renderTooltip),
                     * not drawn on the canvas: a canvas tooltip is clipped to
                     * the canvas, so it was cut off on the 56px sparklines.
                     * Chart.js still computes which points are active.
                     */
                    tooltip: {
                        enabled: false,
                        external: (context) => this.renderTooltip(context),
                        itemSort: (a, b) => a.dataset.p1Index - b.dataset.p1Index,
                        filter: (item) => item.raw !== null,
                        callbacks: {
                            title: (items) => items.length ? P1Utils.formatTooltipTime(dates[items[0].dataIndex], period) : ''
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { color: grid },
                        ticks: {
                            color: text,
                            maxRotation: 0,
                            autoSkip: true,
                            autoSkipPadding: 12,
                            maxTicksLimit: isPhone ? 6 : 12,
                            callback: (value, index) => dates[index]
                                ? P1Utils.formatXAxisLabel(dates[index], period, isPhone)
                                : ''
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: grid },
                        border: { display: false },
                        ticks: {
                            color: text,
                            maxTicksLimit: isPhone ? 5 : 7,
                            callback: (value) => formatTick(value, cfg.unit, cfg.prefix)
                        }
                    },
                    y2: {
                        display: y2Visible,
                        position: 'right',
                        beginAtZero: true,
                        title: { display: !!y2.title && !isPhone, text: y2.title || '', color: text },
                        grid: { drawOnChartArea: false },
                        border: { display: false },
                        ticks: {
                            color: text,
                            maxTicksLimit: isPhone ? 5 : 7,
                            callback: (value) => formatTick(value, y2.unit)
                        }
                    },
                    temp: {
                        display: tempVisible,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        border: { display: false },
                        ticks: {
                            color: text,
                            maxTicksLimit: isPhone ? 5 : 7,
                            callback: (value) => `${Math.round(value)}°`
                        }
                    }
                }
            };

            if (cfg.stacked) {
                options.scales.x.stacked = true;
                options.scales.y.stacked = true;
                options.scales.y.beginAtZero = true;
            }

            if (cfg.compact) {
                Object.values(options.scales).forEach(scale => {
                    scale.display = false;
                });
                options.scales.y.grace = '5%';
            }

            return options;
        },

        /**
         * (Re)build the chart. Called on data, visibility and theme changes.
         */
        render() {
            const labels = this.points.map(p => p.unixTimestamp);
            const datasets = this.buildDatasets();
            const options = this.buildOptions();

            if (this.chart) {
                this.chart.data.labels = labels;
                this.chart.data.datasets = datasets;
                this.chart.options = options;
                this.chart.update();
            } else {
                this.chart = new window.Chart(this.canvas, {
                    type: 'bar',
                    data: { labels, datasets },
                    options
                });
            }

            this.renderLegend();
            if (this.tableEl) this.renderTable(this.tableEl);
        },

        /**
         * Show the data as a table in `el` (and keep it in sync with data
         * and legend changes), or stop with null. The accessible alternative
         * to the canvas.
         */
        showTable(el) {
            this.tableEl = el || null;
            if (this.tableEl) this.renderTable(this.tableEl);
        },

        /**
         * One row per bucket, one column per visible series, values formatted
         * as in the tooltip.
         */
        renderTable(el) {
            const series = this.activeSeries().filter(s => !this.hidden.has(s.key));
            const format = (s, v) => this.formatAmount(s.axis === 'temp' ? 'temp' : s.axis, v);

            const table = document.createElement('table');
            table.className = 'data-table';

            const head = table.createTHead().insertRow();
            const corner = document.createElement('th');
            corner.scope = 'col';
            corner.textContent = 'Periode';
            head.appendChild(corner);
            series.forEach(s => {
                const th = document.createElement('th');
                th.scope = 'col';
                th.textContent = s.label;
                head.appendChild(th);
            });

            const body = table.createTBody();
            this.points.forEach(p => {
                const row = body.insertRow();
                const th = document.createElement('th');
                th.scope = 'row';
                th.textContent = P1Utils.formatTooltipTime(toDate(p), this.period);
                row.appendChild(th);
                series.forEach(s => {
                    row.insertCell().textContent = format(s, p[s.key]);
                });
            });

            el.replaceChildren(table);
        },

        /**
         * HTML legend: one toggle button per series
         */
        renderLegend() {
            const el = this.config.legendEl;
            if (!el) return;

            el.replaceChildren();
            this.activeSeries().forEach(s => {
                const visible = !this.hidden.has(s.key);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'legend-item'
                    + (s.type === 'bar' ? '' : ' line')
                    + (s.dashed ? ' dashed' : '');
                btn.style.setProperty('--c', `var(--${s.token})`);
                btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
                btn.title = visible ? `${s.label} verbergen` : `${s.label} tonen`;

                const swatch = document.createElement('span');
                swatch.className = 'legend-color';
                const label = document.createElement('span');
                label.className = 'legend-text';
                label.textContent = s.label;

                btn.append(swatch, label);
                btn.addEventListener('click', () => this.setSeriesVisible(s.key, !visible));
                el.appendChild(btn);
            });
        },

        /**
         * Decimals for the main axis. `decimals: 'period'` follows the period
         * shown (P1Utils.amountDecimals: 3 for hours ... 1 for months/years).
         */
        decimals() {
            const d = this.config.decimals;
            return d === 'period' ? P1Utils.amountDecimals(this.period) : d;
        },

        /**
         * A value as shown in tooltips and tables, by axis ('temp', 'y2', main)
         */
        formatAmount(axis, v) {
            if (v === undefined || v === null || isNaN(v)) return '–';
            const cfg = this.config;
            if (axis === 'temp') return formatValue(v, 1, '°C');
            if (axis === 'y2') {
                const y2 = Object.assign({ unit: '', decimals: 2 }, cfg.axes.y2 || {});
                return formatValue(v, y2.decimals, y2.unit);
            }
            return formatValue(v, this.decimals(), cfg.unit, cfg.prefix);
        },

        /**
         * The tooltip element for this chart, created on first use. Fixed to
         * the viewport so no container can clip it; hidden from assistive
         * tech (the same data is in the table view and the KPI cards).
         */
        tooltipEl() {
            if (this._tooltip) return this._tooltip;

            const el = document.createElement('div');
            el.className = 'chart-tooltip';
            el.setAttribute('aria-hidden', 'true');
            el.hidden = true;
            document.body.appendChild(el);
            this._tooltip = el;

            // A tap elsewhere or a scroll dismisses it (touch has no mouseleave)
            this._hideTooltip = (e) => {
                if (e && e.type === 'touchstart' && e.target === this.canvas) return;
                el.hidden = true;
            };
            document.addEventListener('touchstart', this._hideTooltip, { passive: true });
            window.addEventListener('scroll', this._hideTooltip, { passive: true });
            window.addEventListener('resize', this._hideTooltip);

            return el;
        },

        /**
         * Chart.js `external` tooltip handler: title, then one row per active
         * series (swatch, label, value), placed above the hovered point and
         * kept inside the visible area between the header and the tab bar.
         */
        renderTooltip({ chart, tooltip }) {
            const el = this.tooltipEl();
            if (tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
                el.hidden = true;
                return;
            }

            const title = document.createElement('div');
            title.className = 'chart-tooltip-title';
            title.textContent = (tooltip.title || []).join(' ');

            const rows = document.createElement('div');
            rows.className = 'chart-tooltip-rows';
            tooltip.dataPoints.forEach(item => {
                const ds = item.dataset;
                const swatch = document.createElement('span');
                swatch.className = 'chart-tooltip-swatch'
                    + (ds.type === 'line' ? ' is-line' : '')
                    + (ds.p1Dashed ? ' is-dashed' : '');
                swatch.style.setProperty('--c', ds.type === 'line' ? ds.borderColor : ds.backgroundColor);

                const label = document.createElement('span');
                label.className = 'chart-tooltip-label';
                label.textContent = ds.label;

                const value = document.createElement('span');
                value.className = 'chart-tooltip-value';
                value.textContent = this.formatAmount(ds.yAxisID === 'y' ? 'main' : ds.yAxisID, item.raw);

                rows.append(swatch, label, value);
            });

            el.replaceChildren(title, rows);
            el.hidden = false;

            // Position: centred above the point, flipped below if there is no
            // room, and clamped to the space between header and bottom bar
            const margin = 8;
            const rect = chart.canvas.getBoundingClientRect();
            const header = document.querySelector('.app-header');
            const bar = document.querySelector('.bottom-nav');
            const minTop = (header ? header.getBoundingClientRect().bottom : 0) + margin;
            const barRect = bar && bar.offsetParent !== null ? bar.getBoundingClientRect() : null;
            const maxBottom = (barRect ? barRect.top : window.innerHeight) - margin;

            const w = el.offsetWidth;
            const h = el.offsetHeight;
            const x = rect.left + tooltip.caretX;
            const y = rect.top + tooltip.caretY;

            let left = Math.min(Math.max(x - w / 2, margin), window.innerWidth - w - margin);
            let top = y - h - 12;
            if (top < minTop) top = y + 12;
            top = Math.max(minTop, Math.min(top, maxBottom - h));

            el.style.left = `${Math.round(left)}px`;
            el.style.top = `${Math.round(top)}px`;
        },

        destroy() {
            document.removeEventListener('themechange', this._onTheme);
            if (this._tooltip) {
                document.removeEventListener('touchstart', this._hideTooltip);
                window.removeEventListener('scroll', this._hideTooltip);
                window.removeEventListener('resize', this._hideTooltip);
                this._tooltip.remove();
                this._tooltip = null;
            }
            if (this.chart) this.chart.destroy();
            this.chart = null;
        }
    };

    window.P1Chart = P1Chart;

})();
