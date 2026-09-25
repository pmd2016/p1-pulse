/**
 * Gas page
 *
 * Gas usage comes from the P1 power/gas history (P1API.getElectricityData),
 * degree days and temperature from the weather history. P1Section drives
 * the toolbar, KPI cards and chart states, P1Chart draws the chart.
 */

(function() {
    'use strict';

    const fmt = (v, d) => P1Utils.formatNumber(v, d);
    const m3 = (v) => `${fmt(v, 3)} m³`;
    const eur = (v) => `€ ${fmt(v, 2)}`;

    const GasPage = {
        chart: null,
        section: null,

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
                id: 'gas',
                chart: this.chart,
                load: (state, isCurrent) => this.load(state, isCurrent),
                live: () => this.loadLive()
            });

            this.section.init();
        },

        async load({ period, zoom, page, temperature }, isCurrent) {
            const [data, weatherRows] = await Promise.all([
                window.P1API.getElectricityData(period, zoom, false, { page }),
                // Current and previous window, for degree days in both
                window.P1API.getWeatherHistory(period, zoom * (page + 2))
            ]);
            if (!isCurrent()) return null;

            if (!data || !data.chartData.length) {
                this.chart.setData([], period);
                return { empty: true, hasOlder: false };
            }

            const weather = window.P1API.processTemperatureData(weatherRows, period);
            const points = window.P1API.joinWeather(this.fillMissingData(data.chartData, period), weather, period);

            this.chart.setData(points, period, { temperature });
            this.updateKpis(points, data, weatherRows, period);

            return { from: data.stats.from, to: data.stats.to, hasOlder: data.hasOlder };
        },

        updateKpis(points, { stats, previous }, weatherRows, period) {
            const s = this.section;
            const prev = previous || {};
            const values = points.map(p => parseFloat(p.gas) || 0);
            const total = values.reduce((sum, v) => sum + v, 0);

            s.setKpi('total', {
                value: m3(total),
                sub: previous ? `vorige: ${m3(prev.totalGas)}` : '',
                delta: { current: total, previous: prev.totalGas, goodWhen: 'down' }
            });

            s.setKpi('cost', {
                value: eur(stats.gasCost),
                sub: [stats.costIsEstimate ? 'geschat' : '', previous ? `vorige: ${eur(prev.gasCost)}` : '']
                    .filter(Boolean).join(' · '),
                delta: { current: stats.gasCost, previous: prev.gasCost, goodWhen: 'down', format: eur }
            });

            const average = values.length ? total / values.length : 0;
            const previousAverage = previous ? prev.totalGas / points.length : undefined;
            s.setKpi('average', {
                value: m3(average),
                sub: `per ${P1Utils.periodLabelsSingular[period] || 'periode'}`,
                delta: { current: average, previous: previousAverage, goodWhen: 'down' }
            });

            const peak = values.reduce((best, v, i) => (v > best.value ? { value: v, index: i } : best), { value: 0, index: -1 });
            s.setKpi('peak', {
                value: peak.index >= 0 ? m3(peak.value) : '--',
                sub: peak.index >= 0 ? P1Utils.formatPeakTime(points[peak.index].timestamp || points[peak.index].unixTimestamp, period) : 'geen verbruik',
                delta: null
            });

            // Degree days: a measure of heating demand, so no good or bad direction
            const hasDegreeDays = points.some(p => p.degreeDays !== undefined && p.degreeDays !== null);
            const degreeDays = points.reduce((sum, p) => sum + (p.degreeDays || 0), 0);
            let previousDegreeDays;
            if (previous) {
                const inPrevious = weatherRows.filter(r => {
                    const ts = parseInt(r.TIMESTAMP_UTC);
                    return ts >= prev.from && ts <= prev.to;
                });
                if (inPrevious.length) {
                    previousDegreeDays = inPrevious.reduce((sum, r) => sum + (parseFloat(r.DEGREE_DAYS) || 0), 0);
                }
            }
            s.setKpi('extra', {
                value: hasDegreeDays ? fmt(degreeDays, 1) : '--',
                sub: previousDegreeDays !== undefined ? `vorige: ${fmt(previousDegreeDays, 1)}` : '',
                delta: { current: hasDegreeDays ? degreeDays : undefined, previous: previousDegreeDays }
            });
        },

        /**
         * Gas used in the most recent hour. The meter reports gas in steps,
         * so this is the latest hourly delta rather than a true flow.
         */
        async loadLive() {
            const rows = await window.P1API.getHistoryHour(1);
            const latest = rows && rows[0];
            if (!latest) return;

            this.section.setKpi('now', {
                value: m3(parseFloat(latest.CONSUMPTION_GAS_DELTA_M3) || 0),
                sub: 'laatste uur'
            });
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
