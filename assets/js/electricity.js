/**
 * Electricity page
 *
 * Data comes from P1API.getElectricityData; P1Section handles the period
 * and range controls, P1Chart draws the chart and its legend.
 */

(function() {
    'use strict';

    const ElectricityPage = {
        chart: null,
        section: null,
        data: null,
        showTemp: false,

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
                zoomButtonsId: 'zoom-buttons',
                onLoad: (period, zoom, isCurrent) => this.load(period, zoom, isCurrent)
            });

            const toggleTemp = document.getElementById('toggle-temp');
            if (toggleTemp) {
                toggleTemp.disabled = false;
                toggleTemp.addEventListener('change', (e) => {
                    this.showTemp = e.target.checked;
                    this.section.reload();
                });
            }

            this.section.init();
        },

        async load(period, zoom, isCurrent) {
            try {
                const data = await window.P1API.getElectricityData(period, zoom, this.showTemp);
                if (!isCurrent()) return;

                if (!data) {
                    P1Utils.showError('Geen data beschikbaar voor deze periode');
                    return;
                }

                this.data = data;
                this.updateStatistics(period, zoom);
                this.chart.setData(data.chartData, period, { temperature: this.showTemp });
                P1Utils.hideError();
            } catch (error) {
                if (!isCurrent()) return;
                P1Logger.error('Error loading electricity data:', error);
                P1Utils.showError('Fout bij ophalen data');
            }
        },

        updateStatistics(period, zoom) {
            const stats = this.data.stats;
            const fmt = P1Utils.formatNumber;
            const rangeLabel = P1Utils.rangeLabel(period, zoom);

            P1Utils.updateElement('stat-total-consumption', fmt(stats.totalConsumption, 3) + ' kWh');
            P1Utils.updateElement('stat-consumption-period', rangeLabel);

            P1Utils.updateElement('stat-total-production', fmt(stats.totalProduction, 3) + ' kWh');
            P1Utils.updateElement('stat-production-period', rangeLabel);

            P1Utils.updateElement('stat-net', fmt(stats.netConsumption, 3) + ' kWh');

            P1Utils.updateElement('stat-cost', '€ ' + fmt(stats.totalCost, 2));
            P1Utils.updateElement('stat-cost-period', rangeLabel);

            P1Utils.updateElement('stat-average', fmt(stats.average, 3) + ' kWh');
            P1Utils.updateElement('stat-average-period', `per ${P1Utils.periodLabelsSingular[period] || 'periode'}`);

            P1Utils.updateElement('stat-peak-value', fmt(stats.peakConsumption.value, 3) + ' kWh');

            P1Utils.updateElement('stat-peak-time', P1Utils.formatPeakTime(stats.peakConsumption.time, period));
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
