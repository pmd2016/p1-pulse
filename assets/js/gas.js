/**
 * Gas Page Manager
 * Handles chart rendering and interactivity for gas data
 */

(function() {
    'use strict';

    const GasManager = {
        currentPeriod: 'hours',
        currentZoom: 24,
        data: null,
        canvas: null,
        ctx: null,

        init() {
            this.canvas = document.getElementById('gas-chart');
            if (this.canvas) this.ctx = this.canvas.getContext('2d');

            this.setupEventListeners();
            this.updateZoomButtons();
            this.loadData();

            window.addEventListener('resize', () => this.redrawChart());
        },

        setupEventListeners() {
            document.querySelectorAll('.period-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const period = tab.dataset.period;
                    this.changePeriod(period);
                });
            });

            document.querySelectorAll('#zoom-buttons-gas [data-zoom], #zoom-buttons-gas .control-button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const zoom = parseInt(btn.dataset.zoom || btn.getAttribute('data-zoom'));
                    if (!isNaN(zoom)) this.changeZoom(zoom);
                });
            });

            const toggle = document.getElementById('toggle-gas-smoothed');
            if (toggle) toggle.addEventListener('change', () => this.redrawChart());
        },

        updateZoomButtons() {
            const container = document.getElementById('zoom-buttons-gas');
            if (!container) return;
            // keep simple fixed options
            container.innerHTML = '';
            const options = [24, 48, 72];
            options.forEach((v, i) => {
                const btn = document.createElement('button');
                btn.className = 'control-button';
                btn.dataset.zoom = v;
                btn.textContent = v === 24 ? '24 uur' : `${v} uur`;
                if (i === 0) btn.classList.add('active');
                btn.addEventListener('click', () => this.changeZoom(v));
                container.appendChild(btn);
            });
        },

        changePeriod(period) {
            this.currentPeriod = period;
            document.querySelectorAll('.period-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.period === period));
            // defaults
            const defaults = { hours: 24, days: 7, months: 12, years: 5 };
            this.currentZoom = defaults[period] || 24;
            this.updateZoomButtons();
            this.loadData();
        },

        changeZoom(zoom) {
            this.currentZoom = zoom;
            document.querySelectorAll('#zoom-buttons-gas .control-button').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.zoom) === zoom));
            this.loadData();
        },

        async loadData() {
            try {
                this.showLoading();
                // Reuse electricity data endpoint which also contains gas in column 9
                const payload = await window.P1API.getElectricityData(this.currentPeriod, this.currentZoom, false);
                if (!payload || !payload.chartData) {
                    this.showError('Geen data beschikbaar');
                    return;
                }

                this.data = payload.chartData;
                this.updateStatistics();
                this.redrawChart();
                this.hideError();
            } catch (err) {
                console.error('Error loading gas data', err);
                this.showError('Fout bij ophalen gasdata');
            } finally {
                this.hideLoading();
            }
        },

        updateStatistics() {
            if (!this.data || this.data.length === 0) return;

            const total = this.data.reduce((s, p) => s + (parseFloat(p.gas) || 0), 0);
            const avg = total / this.data.length;
            let peak = { value: 0, time: '' };
            for (const p of this.data) {
                const v = parseFloat(p.gas) || 0;
                if (v > peak.value) { peak.value = v; peak.time = p.timestamp || p.unixTimestamp || ''; }
            }

            // estimate current flow (m3/h) from last two points
            let flow = 0;
            if (this.data.length >= 2) {
                const a = this.data[this.data.length - 2];
                const b = this.data[this.data.length - 1];
                const delta = (parseFloat(b.gas) || 0) - (parseFloat(a.gas) || 0);
                const tA = a.unixTimestamp || 0;
                const tB = b.unixTimestamp || 0;
                const hours = (tB - tA) / 3600 || 1;
                flow = delta / hours;
            }

            this.updateElement('stat-total-gas', this.formatNumber(total, 3) + ' m³');
            this.updateElement('stat-gas-period', `Laatste ${this.currentZoom} ${this.getPeriodLabel()}`);
            this.updateElement('stat-gas-cost', '€ ' + this.formatNumber(total * 1.5, 2));
            this.updateElement('stat-gas-cost-period', `Geschat`);
            this.updateElement('stat-gas-average', this.formatNumber(avg, 3) + ' m³');
            this.updateElement('stat-gas-average-period', `per ${this.getPeriodLabelSingular()}`);
            this.updateElement('stat-gas-flow', this.formatNumber(flow, 3) + ' m³/h');
            this.updateElement('stat-gas-peak', this.formatNumber(peak.value, 3) + ' m³');
            this.updateElement('stat-gas-peak-time', this.formatPeakTime(peak.time));
        },

        formatPeakTime(ts) {
            if (!ts) return '--:--';
            if (typeof ts === 'number' || /^\d+$/.test(String(ts))) {
                const d = new Date((parseInt(ts) || 0) * 1000);
                return d.toLocaleString();
            }
            return ts;
        },

        formatNumber(v, decimals = 2) { return (Math.round((v || 0) * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals); },

        getPeriodLabel() {
            return this.currentPeriod === 'hours' ? 'uren' : this.currentPeriod === 'days' ? 'dagen' : this.currentPeriod === 'months' ? 'maanden' : 'jaren';
        },

        getPeriodLabelSingular() {
            return this.currentPeriod === 'hours' ? 'uur' : this.currentPeriod === 'days' ? 'dag' : this.currentPeriod === 'months' ? 'maand' : 'jaar';
        },

        updateElement(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        },

        showError(msg) {
            const el = document.getElementById('error-container');
            if (el) el.innerHTML = `<div class="error">${msg}</div>`;
        },

        hideError() { const el = document.getElementById('error-container'); if (el) el.innerHTML = ''; },

        showLoading() { const l = document.getElementById('loading-container'); if (l) l.style.display = 'block'; },
        hideLoading() { const l = document.getElementById('loading-container'); if (l) l.style.display = 'none'; },

        redrawChart() {
            if (!this.data || !this.canvas || !this.ctx) return;

            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            const width = this.canvas.width;
            const height = this.canvas.height;
            const paddingLeft = 60;
            const paddingRight = 20;
            const paddingTop = 30;
            const paddingBottom = 40;
            const graphWidth = width - paddingLeft - paddingRight;
            const graphHeight = height - paddingTop - paddingBottom;

            this.ctx.clearRect(0,0,width,height);

            // Y scale
            const values = this.data.map(d => parseFloat(d.gas) || 0);
            const maxV = Math.max(...values, 0.001);
            const gridLines = 4;
            this.ctx.strokeStyle = '#2b3948';
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.font = '12px sans-serif';

            for (let i = 0; i <= gridLines; i++) {
                const v = maxV * (i / gridLines);
                const y = paddingTop + graphHeight - (graphHeight * (i / gridLines));
                this.ctx.beginPath();
                this.ctx.moveTo(paddingLeft, y);
                this.ctx.lineTo(width - paddingRight, y);
                this.ctx.stroke();
                this.ctx.textAlign = 'right';
                this.ctx.fillText(this.formatNumber(v, 2) + ' m³', paddingLeft - 8, y + 4);
            }

            // Draw bars
            const count = this.data.length;
            const barWidth = Math.max(graphWidth / count - 2, 1);
            this.ctx.fillStyle = '#fb923c';
            this.data.forEach((pt, idx) => {
                const v = parseFloat(pt.gas) || 0;
                const x = paddingLeft + idx * (graphWidth / count) + 1;
                const h = (v / maxV) * graphHeight;
                const y = paddingTop + graphHeight - h;
                this.ctx.fillRect(x, y, barWidth, h);
            });
        }
    };

    // Auto-init when on gas page
    document.addEventListener('DOMContentLoaded', () => {
        if (window.P1MonConfig && window.P1MonConfig.currentPage === 'gas') {
            GasManager.init();
        }
    });

})();
