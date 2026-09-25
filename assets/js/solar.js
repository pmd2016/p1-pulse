/**
 * Solar page
 *
 * Production comes from the local solar API (api/solar.php), temperature
 * from the P1 weather history. P1Section handles the period and range
 * controls, P1Chart draws the chart and its legend.
 */

(function() {
    'use strict';

    const SolarPage = {
        chart: null,
        section: null,
        showTemp: false,
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
                zoomButtonsId: 'zoom-buttons-solar',
                onLoad: (period, zoom, isCurrent) => this.load(period, zoom, isCurrent)
            });

            const tempToggle = document.getElementById('toggle-solar-temp');
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
                const response = await fetch(`/custom/api/solar.php?period=${period}&zoom=${zoom}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                if (!isCurrent()) return;

                // An unavailable database returns empty chartData, which would
                // otherwise render as a flat chart indistinguishable from a
                // night with no production.
                if (payload && payload.error) {
                    P1Logger.error('Solar API unavailable:', payload.error);
                    P1Utils.showError('Zonnedata niet beschikbaar — controleer de solar database op de server.');
                    return;
                }

                if (!payload || !payload.chartData) {
                    P1Utils.showError('Geen data beschikbaar');
                    return;
                }

                let points = payload.chartData;
                if (this.showTemp) {
                    points = await window.P1API.attachWeather(points, period, zoom);
                    if (!isCurrent()) return;
                }

                this.updateStatistics(points, payload.stats, period, zoom);
                this.chart.setData(points, period, { temperature: this.showTemp });
                P1Utils.hideError();
            } catch (err) {
                if (!isCurrent()) return;
                P1Logger.error('Error loading solar data:', err);
                P1Utils.showError('Fout bij ophalen zonnedata');
            }
        },

        updateStatistics(points, stats, period, zoom) {
            const fmt = P1Utils.formatNumber;

            if (!stats) {
                const powers = points.map(d => parseFloat(d.power) || 0);
                const maxPower = powers.length ? Math.max(...powers) : 0;
                const maxIndex = powers.indexOf(maxPower);
                stats = {
                    totalEnergy: points.reduce((sum, d) => sum + (parseFloat(d.production) || 0), 0),
                    peakPower: { value: maxPower, time: maxIndex >= 0 ? points[maxIndex].unixTimestamp : '' }
                };
            }

            const currentPower = points.length > 0 ? (parseFloat(points[points.length - 1].power) || 0) : 0;
            P1Utils.updateElement('stat-current-power', fmt(currentPower, 0) + ' W');

            P1Utils.updateElement('stat-total-energy', fmt(stats.totalEnergy || 0, 2) + ' kWh');
            P1Utils.updateElement('stat-energy-period', P1Utils.rangeLabel(period, zoom));

            P1Utils.updateElement('stat-peak-power', fmt(stats.peakPower?.value || 0, 0) + ' W');
            P1Utils.updateElement('stat-peak-time', P1Utils.formatPeakTime(stats.peakPower?.time, period, true));

            P1Utils.updateElement('stat-capacity-factor', fmt(this.capacityFactor(stats.totalEnergy || 0, period, zoom), 1) + '%');
            P1Utils.updateElement('stat-capacity-period', P1Utils.rangeLabel(period, zoom));

            P1Utils.updateElement('stat-sunlight-hours', fmt(this.sunlightHours(points, period), 1) + ' uur');
        },

        capacityFactor(totalEnergyKWh, period, zoom) {
            const hoursPer = { hours: 1, days: 24, months: 30 * 24, years: 365 * 24 };
            const theoreticalMaxKWh = (this.systemCapacity / 1000) * zoom * (hoursPer[period] || 1);
            return theoreticalMaxKWh === 0 ? 0 : (totalEnergyKWh / theoreticalMaxKWh) * 100;
        },

        sunlightHours(points, period) {
            const threshold = 10; // W
            let productiveHours = 0;

            points.forEach(point => {
                const power = parseFloat(point.power) || 0;
                if (power <= threshold) return;

                const production = parseFloat(point.production) || 0;
                if (period === 'hours') {
                    productiveHours += 1;
                } else if (period === 'days') {
                    if (production > 0) productiveHours += 8;
                } else {
                    // Rough estimate: energy at an average of 1 kW
                    productiveHours += production;
                }
            });

            return productiveHours;
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
