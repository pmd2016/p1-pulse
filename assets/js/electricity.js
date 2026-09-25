/**
 * Electricity page
 *
 * Data comes from P1API.getElectricityData; P1Section drives the toolbar,
 * KPI cards and chart states, P1Chart draws the chart and its legend.
 */

(function() {
    'use strict';

    const fmt = (v, d) => P1Utils.formatNumber(v, d);
    const kwh = (v) => `${fmt(v, 3)} kWh`;
    const eur = (v) => `€ ${fmt(v, 2)}`;

    const ElectricityPage = {
        chart: null,
        section: null,

        init() {
            this.chart = P1Chart.create(document.getElementById('electricity-chart'), {
                unit: 'kWh',
                decimals: 3,
                legendEl: document.getElementById('electricity-legend'),
                series: [
                    { key: 'consumption', label: 'Verbruik', type: 'bar', token: 'series-import' },
                    { key: 'production', label: 'Teruglevering', type: 'bar', token: 'series-export' },
                    { key: 'net', label: 'Netto', type: 'line', token: 'series-net' }
                ]
            });

            this.section = P1Section.create({
                id: 'electricity',
                chart: this.chart,
                load: (state, isCurrent) => this.load(state, isCurrent),
                live: () => this.loadLive()
            });

            this.section.init();
        },

        async load({ period, zoom, page, temperature }, isCurrent) {
            const data = await window.P1API.getElectricityData(period, zoom, temperature, { page });
            if (!isCurrent()) return null;

            if (!data) {
                this.chart.setData([], period);
                return { empty: true, hasOlder: false };
            }

            this.chart.setData(data.chartData, period, { temperature });
            this.updateKpis(data, period);

            return { from: data.stats.from, to: data.stats.to, hasOlder: data.hasOlder };
        },

        updateKpis({ stats, previous }, period) {
            const s = this.section;
            const per = P1Utils.periodLabelsSingular[period] || 'periode';
            const prev = previous || {};

            s.setKpi('total', {
                value: kwh(stats.totalConsumption),
                sub: previous ? `vorige: ${kwh(prev.totalConsumption)}` : '',
                delta: { current: stats.totalConsumption, previous: prev.totalConsumption, goodWhen: 'down' }
            });

            s.setKpi('cost', {
                value: eur(stats.totalCost),
                sub: [stats.costIsEstimate ? 'geschat' : '', previous ? `vorige: ${eur(prev.totalCost)}` : '']
                    .filter(Boolean).join(' · '),
                delta: { current: stats.totalCost, previous: prev.totalCost, goodWhen: 'down', format: eur }
            });

            s.setKpi('average', {
                value: kwh(stats.average),
                sub: `per ${per}`,
                delta: { current: stats.average, previous: prev.average, goodWhen: 'down' }
            });

            s.setKpi('peak', {
                value: kwh(stats.peakConsumption.value),
                sub: P1Utils.formatPeakTime(stats.peakConsumption.time, period),
                delta: null
            });

            s.setKpi('extra', {
                value: kwh(stats.totalProduction),
                sub: `netto ${kwh(stats.netConsumption)}`,
                delta: { current: stats.totalProduction, previous: prev.totalProduction, goodWhen: 'up' }
            });
        },

        /**
         * Live net power from the smart meter: positive is import
         */
        async loadLive() {
            const rows = await window.P1API.getSmartMeter(1);
            const latest = rows && rows[0];
            if (!latest) return;

            const net = (parseFloat(latest.CONSUMPTION_W) || 0) - (parseFloat(latest.PRODUCTION_W) || 0);
            this.section.setKpi('now', {
                value: `${fmt(Math.abs(net), 0)} W`,
                sub: net < 0 ? 'teruglevering' : 'afname van het net',
                tone: net < 0 ? 'is-export' : 'is-import'
            });
        }
    };

    function start() {
        if (document.body.dataset.page === 'electricity') ElectricityPage.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.ElectricityPage = ElectricityPage;

})();
