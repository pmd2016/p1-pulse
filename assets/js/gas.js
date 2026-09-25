/**
 * Gas page
 *
 * Gas usage comes from the P1 power/gas history (P1API.getElectricityData),
 * degree days and temperature from the weather history. P1Section handles
 * the period and range controls, P1Chart draws the chart and its legend.
 */

(function() {
    'use strict';

    const GasPage = {
        chart: null,
        section: null,
        showTemp: false,

        init() {
            this.chart = P1Chart.create(document.getElementById('gas-chart'), {
                unit: 'm³',
                decimals: 3,
                legendEl: document.getElementById('gas-legend'),
                series: [
                    { key: 'gas', label: 'Verbruik', type: 'bar', token: 'series-gas' },
                    { key: 'degreeDays', label: 'Graaddagen', type: 'line', token: 'series-degreedays', axis: 'y2' }
                ],
                axes: { y2: { unit: '', decimals: 1, title: 'Graaddagen' } }
            });

            this.section = P1Section.create({
                zoomButtonsId: 'zoom-buttons-gas',
                onLoad: (period, zoom, isCurrent) => this.load(period, zoom, isCurrent)
            });

            const tempToggle = document.getElementById('toggle-gas-temp');
            if (tempToggle) {
                tempToggle.addEventListener('change', (e) => {
                    this.showTemp = e.target.checked;
                    this.section.reload();
                });
            }

            this.section.init();
        },

        async load(period, zoom, isCurrent) {
            try {
                const payload = await window.P1API.getElectricityData(period, zoom, false);
                if (!isCurrent()) return;

                if (!payload || !payload.chartData) {
                    P1Utils.showError('Geen data beschikbaar');
                    return;
                }

                let points = this.fillMissingData(payload.chartData, period);
                points = await window.P1API.attachWeather(points, period, zoom);
                if (!isCurrent()) return;

                this.updateStatistics(points, period, zoom);
                this.chart.setData(points, period, { temperature: this.showTemp });
                P1Utils.hideError();
            } catch (err) {
                if (!isCurrent()) return;
                P1Logger.error('Error loading gas data', err);
                P1Utils.showError('Fout bij ophalen gasdata');
            }
        },

        updateStatistics(points, period, zoom) {
            const fmt = P1Utils.formatNumber;
            const gasValues = points.map(d => parseFloat(d.gas) || 0);

            const total = gasValues.reduce((s, v) => s + v, 0);
            const avg = gasValues.length > 0 ? total / gasValues.length : 0;
            const hasConsumption = total > 0.001;

            let peakValue = 0;
            let peakTime = '';
            gasValues.forEach((v, idx) => {
                if (v > peakValue) {
                    peakValue = v;
                    peakTime = points[idx].timestamp || points[idx].unixTimestamp;
                }
            });

            // Estimated current flow in m³/h, from the most recent bucket(s)
            let flow = 0;
            const last = gasValues[gasValues.length - 1] || 0;
            if (period === 'hours') {
                flow = last;
            } else if (period === 'days') {
                flow = last / 24;
            } else if (gasValues.length >= 2) {
                const avgRecent = (last + gasValues[gasValues.length - 2]) / 2;
                flow = period === 'months' ? avgRecent / (30 * 24) : avgRecent / (365 * 24);
            }

            if (period === 'hours') {
                P1Utils.updateElement('stat-total-gas', fmt(last, 3) + ' m³');
                P1Utils.updateElement('stat-gas-period', last > 0.001 ? 'Huidig uur' : 'Geen verbruik');
            } else {
                P1Utils.updateElement('stat-total-gas', fmt(total, 3) + ' m³');
                P1Utils.updateElement('stat-gas-period', hasConsumption ? P1Utils.rangeLabel(period, zoom) : 'Geen verbruik');
            }

            // Gas cost uses config value from config.php (default: €1.50/m³)
            const gasCost = window.P1MonConfig?.gasCostPerM3 ?? 1.50;
            P1Utils.updateElement('stat-gas-cost', '€ ' + fmt(total * gasCost, 2));
            P1Utils.updateElement('stat-gas-cost-period', hasConsumption ? 'Geschat' : 'Geen verbruik');

            P1Utils.updateElement('stat-gas-average', fmt(avg, 3) + ' m³');
            P1Utils.updateElement('stat-gas-average-period', `per ${P1Utils.periodLabelsSingular[period] || 'periode'}`);

            P1Utils.updateElement('stat-gas-flow', fmt(flow > 0.001 ? flow : 0, 3) + ' m³/h');

            if (hasConsumption && peakValue > 0.001) {
                P1Utils.updateElement('stat-gas-peak', fmt(peakValue, 3) + ' m³');
                P1Utils.updateElement('stat-gas-peak-time', P1Utils.formatPeakTime(peakTime, period));
            } else {
                P1Utils.updateElement('stat-gas-peak', '--');
                P1Utils.updateElement('stat-gas-peak-time', 'Geen verbruik');
            }
        },

        /**
         * P1 Monitor skips buckets without a meter reading; fill them with
         * zero so the x-axis stays continuous
         */
        fillMissingData(data, period) {
            if (data.length === 0) return data;

            data = [...data].sort((a, b) => (a.unixTimestamp || 0) - (b.unixTimestamp || 0));

            const byKey = new Map();
            data.forEach(d => {
                const key = P1Utils.getPeriodKey(d.unixTimestamp || 0, period);
                byKey.set(key, d); // last reading in a bucket wins
            });

            const filled = [];
            const current = new Date((data[0].unixTimestamp || 0) * 1000);
            const end = new Date((data[data.length - 1].unixTimestamp || 0) * 1000);

            while (current <= end) {
                const ts = Math.floor(current.getTime() / 1000);
                const key = P1Utils.getPeriodKey(ts, period);
                filled.push(byKey.get(key) || { timestamp: String(ts), unixTimestamp: ts, gas: 0 });

                if (period === 'days') current.setDate(current.getDate() + 1);
                else if (period === 'months') current.setMonth(current.getMonth() + 1);
                else if (period === 'years') current.setFullYear(current.getFullYear() + 1);
                else current.setHours(current.getHours() + 1);
            }

            return filled;
        }
    };

    function start() {
        if (document.body.dataset.page === 'gas') GasPage.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.GasPage = GasPage;

})();
