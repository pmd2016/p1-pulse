/**
 * Costs page
 *
 * P1 Monitor's own financial figures (P1API.getCostData), per day, month
 * or year: costs per utility stacked above zero, export revenue below it,
 * and the net result as a line. Fixed charges (vastrecht) are not in
 * P1 Monitor's financial data and so not included.
 */

(function() {
    'use strict';

    const fmt = (v, d) => P1Utils.formatNumber(v, d);
    const eur = (v) => `€ ${fmt(v, 2)}`;

    const CostsPage = {
        chart: null,
        section: null,

        init() {
            const visibility = window.P1MonConfig?.visibility || {};
            const series = [
                { key: 'electricity', label: 'Elektriciteit', type: 'bar', token: 'series-import' }
            ];
            if (!visibility.hide_gas) {
                series.push({ key: 'gas', label: 'Gas', type: 'bar', token: 'series-gas' });
            }
            if (!visibility.hide_water) {
                series.push({ key: 'water', label: 'Water', type: 'bar', token: 'series-water' });
            }
            series.push(
                { key: 'revenue', label: 'Teruglevering', type: 'bar', token: 'series-export' },
                { key: 'net', label: 'Netto', type: 'line', token: 'series-net' }
            );

            this.chart = P1Chart.create(document.getElementById('costs-chart'), {
                unit: '',
                prefix: '€ ',
                decimals: 2,
                stacked: true,
                legendEl: document.getElementById('costs-legend'),
                series
            });

            this.section = P1Section.create({
                id: 'costs',
                load: (state, isCurrent) => this.load(state, isCurrent),
                live: () => this.loadLive()
            });

            this.section.init();
        },

        async load({ period, zoom, page }, isCurrent) {
            const data = await window.P1API.getCostData(period, zoom, { page });
            if (!isCurrent()) return null;

            if (!data) {
                this.chart.setData([], period);
                return { empty: true, hasOlder: false };
            }

            this.chart.setData(data.chartData, period);
            this.updateKpis(data, period);

            return { from: data.stats.from, to: data.stats.to, hasOlder: data.hasOlder };
        },

        updateKpis({ stats, previous }, period) {
            const s = this.section;
            const prev = previous || {};
            const vorige = (v) => (previous ? `vorige: ${eur(v)}` : '');

            s.setKpi('total', {
                value: eur(stats.net),
                sub: [vorige(prev.net), 'excl. vastrecht'].filter(Boolean).join(' · '),
                delta: { current: stats.net, previous: prev.net, goodWhen: 'down', format: eur }
            });

            const split = [`stroom ${eur(stats.electricity)}`];
            if (!(window.P1MonConfig?.visibility || {}).hide_gas) split.push(`gas ${eur(stats.gas)}`);
            s.setKpi('cost', {
                value: eur(stats.gross),
                sub: split.join(' · '),
                delta: { current: stats.gross, previous: prev.gross, goodWhen: 'down', format: eur }
            });

            s.setKpi('average', {
                value: eur(stats.average),
                sub: `netto per ${P1Utils.periodLabelsSingular[period] || 'periode'}`,
                delta: { current: stats.average, previous: prev.average, goodWhen: 'down', format: eur }
            });

            s.setKpi('peak', {
                value: stats.peak.time ? eur(stats.peak.value) : '--',
                sub: stats.peak.time ? P1Utils.formatPeakTime(stats.peak.time, period) : '',
                delta: null
            });

            s.setKpi('extra', {
                value: eur(stats.revenue),
                sub: vorige(prev.revenue),
                delta: { current: stats.revenue, previous: prev.revenue, goodWhen: 'up', format: eur }
            });
        },

        /**
         * What energy costs right now, per hour: live electricity at the
         * configured tariffs plus gas at last hour's rate. An estimate.
         */
        async loadLive() {
            const [meter, hours] = await Promise.all([
                window.P1API.getSmartMeter(1),
                window.P1API.getHistoryHour(1)
            ]);
            const latest = meter && meter[0];
            if (!latest) return;

            const t = P1Utils.tariffs();
            const importKW = (parseFloat(latest.CONSUMPTION_W) || 0) / 1000;
            const exportKW = (parseFloat(latest.PRODUCTION_W) || 0) / 1000;
            const electricity = P1Utils.estimateElectricityCost(importKW, exportKW);

            const hideGas = (window.P1MonConfig?.visibility || {}).hide_gas;
            const gasM3 = hideGas ? 0 : (parseFloat(hours && hours[0] && hours[0].CONSUMPTION_GAS_DELTA_M3) || 0);
            const perHour = electricity + gasM3 * t.gas;

            this.section.setKpi('now', {
                value: `${eur(perHour)}/u`,
                sub: hideGas ? 'stroom, geschat' : 'stroom + gas, geschat',
                tone: perHour < 0 ? 'is-export' : 'is-cost'
            });
        }
    };

    function start() {
        if (document.body.dataset.page === 'costs') CostsPage.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.CostsPage = CostsPage;

})();
