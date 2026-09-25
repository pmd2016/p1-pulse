/**
 * Solar page
 *
 * Production comes from the local solar API (api/solar.php), temperature
 * from the P1 weather history. P1Section drives the toolbar, KPI cards and
 * chart states, P1Chart draws the chart and its legend.
 */

(function() {
    'use strict';

    const fmt = (v, d) => P1Utils.formatNumber(v, d);
    const kwh = (v) => `${fmt(v, 2)} kWh`;
    const eur = (v) => `€ ${fmt(v, 2)}`;
    const HOURS_PER = { hours: 1, days: 24, months: 30 * 24, years: 365 * 24 };

    const SolarPage = {
        chart: null,
        section: null,
        // System capacity from config.php (default: 3780W for 14 × 270Wp panels)
        systemCapacity: 3780,

        init() {
            this.systemCapacity = window.P1MonConfig?.systemCapacityW ?? 3780;

            this.chart = P1Chart.create(document.getElementById('solar-chart'), {
                unit: 'kWh',
                decimals: 3,
                legendEl: document.getElementById('solar-legend'),
                series: [
                    { key: 'production', label: 'Opgewekt', type: 'bar', token: 'series-solar' },
                    { key: 'power', label: 'Gem. vermogen', type: 'line', token: 'series-solar-power', axis: 'y2' }
                ],
                axes: { y2: { unit: 'W', decimals: 0 } }
            });

            this.section = P1Section.create({
                id: 'solar',
                load: (state, isCurrent) => this.load(state, isCurrent),
                live: () => this.loadLive()
            });

            this.section.init();
        },

        async fetchWindow(period, zoom, offset) {
            const response = await fetch(`/custom/api/solar.php?period=${period}&zoom=${zoom}&offset=${offset}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();

            // An unavailable database returns empty chartData, which would
            // otherwise render as a flat chart indistinguishable from a
            // night with no production.
            if (payload && payload.error) {
                P1Logger.error('Solar API unavailable:', payload.error);
                throw P1Section.userError('Zonnedata niet beschikbaar — controleer de solar database op de server.');
            }
            return payload || {};
        },

        async load({ period, zoom, page, temperature }, isCurrent) {
            const [current, previous] = await Promise.all([
                this.fetchWindow(period, zoom, page * zoom),
                this.fetchWindow(period, zoom, (page + 1) * zoom)
            ]);
            if (!isCurrent()) return null;

            let points = current.chartData || [];
            if (!points.length) {
                this.chart.setData([], period);
                return { empty: true, hasOlder: false };
            }

            if (temperature) {
                points = await window.P1API.attachWeather(points, period, zoom * (page + 1));
                if (!isCurrent()) return null;
            }

            const previousPoints = previous.chartData || [];
            this.chart.setData(points, period, { temperature });
            this.updateKpis(points, current.stats, previousPoints.length === zoom ? previousPoints : null, period, zoom);

            return {
                from: points[0].unixTimestamp,
                to: points[points.length - 1].unixTimestamp,
                hasOlder: previousPoints.length > 0
            };
        },

        totals(points, stats, period, zoom) {
            const energy = stats && stats.totalEnergy !== undefined
                ? stats.totalEnergy
                : points.reduce((sum, d) => sum + (parseFloat(d.production) || 0), 0);
            // Estimated value of the energy at the configured tariff
            const tariff = window.P1MonConfig?.electricityCostPerKwh ?? 0.30;
            const maxKWh = (this.systemCapacity / 1000) * zoom * (HOURS_PER[period] || 1);

            return {
                energy,
                value: energy * tariff,
                average: points.length ? energy / points.length : 0,
                capacityFactor: maxKWh > 0 ? (energy / maxKWh) * 100 : 0
            };
        },

        updateKpis(points, stats, previousPoints, period, zoom) {
            const s = this.section;
            const cur = this.totals(points, stats, period, zoom);
            const prev = previousPoints ? this.totals(previousPoints, null, period, zoom) : {};

            s.setKpi('total', {
                value: kwh(cur.energy),
                sub: previousPoints ? `vorige: ${kwh(prev.energy)}` : '',
                delta: { current: cur.energy, previous: prev.energy, goodWhen: 'up' }
            });

            s.setKpi('cost', {
                value: eur(cur.value),
                sub: ['geschat', previousPoints ? `vorige: ${eur(prev.value)}` : ''].filter(Boolean).join(' · '),
                delta: { current: cur.value, previous: prev.value, goodWhen: 'up', format: eur }
            });

            s.setKpi('average', {
                value: kwh(cur.average),
                sub: `per ${P1Utils.periodLabelsSingular[period] || 'periode'}`,
                delta: { current: cur.average, previous: prev.average, goodWhen: 'up' }
            });

            // Peak power is momentary, so keep the time of day
            let peak = stats && stats.peakPower;
            if (!peak || !peak.value) {
                const best = points.reduce((b, p) => ((p.powerMax || p.power || 0) > b.value
                    ? { value: p.powerMax || p.power, time: p.unixTimestamp } : b), { value: 0, time: null });
                peak = best;
            }
            s.setKpi('peak', {
                value: `${fmt(peak.value || 0, 0)} W`,
                sub: P1Utils.formatPeakTime(peak.time, period, true),
                delta: null
            });

            s.setKpi('extra', {
                value: `${fmt(cur.capacityFactor, 1)}%`,
                sub: `van ${fmt(this.systemCapacity / 1000, 2)} kWp`,
                delta: { current: cur.capacityFactor, previous: prev.capacityFactor, goodWhen: 'up' }
            });
        },

        async loadLive() {
            const response = await fetch('/custom/api/solar.php?action=current');
            if (!response.ok) return;
            const current = await response.json();

            if (!current || current.error) {
                this.section.setKpi('now', { value: '--', sub: 'niet beschikbaar' });
                return;
            }

            this.section.setKpi('now', {
                value: `${fmt(current.power || 0, 0)} W`,
                sub: `vandaag ${kwh(current.energyToday || 0)}`
            });
        }
    };

    function start() {
        if (document.body.dataset.page === 'solar') SolarPage.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.SolarPage = SolarPage;

})();
