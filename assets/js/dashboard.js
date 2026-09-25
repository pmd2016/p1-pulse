/**
 * Dashboard
 *
 * Top row: live values (net power, solar, weather). Net power is polled
 * here; solar and weather come from the header, which already fetches them
 * (window.P1Live / 'p1:live' event, see header.js).
 *
 * Cards: today from midnight, each with the change vs yesterday up to the
 * same time, a sparkline per hour (P1Chart compact) and two key figures.
 *
 * Refresh: live values every P1MonConfig.updateInterval (at least 10 s),
 * today's cards every minute, nothing while the tab is hidden.
 */

(function() {
    'use strict';

    const LIVE_MIN_INTERVAL = 10000;
    const TODAY_INTERVAL = 60000;
    const HOUR = 3600;
    const COMPARE = 'gisteren tot dit uur';

    const fmt = (v, d) => P1Utils.formatNumber(v, d);
    const kwh = (v) => `${fmt(v, 2)} kWh`;
    const m3 = (v) => `${fmt(v, 3)} m³`;
    const eur = (v) => `€ ${fmt(v, 2)}`;
    const power = (w) => (Math.abs(w) >= 1000 ? `${fmt(w / 1000, 2)} kW` : `${Math.round(w)} W`);

    const Dashboard = {
        sparks: {},
        timers: [],
        lastUpdate: null,

        init() {
            this.createSparklines();
            this.bindLive();
            this.start();

            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.stop();
                else this.start();
            });
            window.addEventListener('beforeunload', () => this.stop());
        },

        start() {
            if (this.timers.length) return;
            const liveInterval = Math.max(window.P1MonConfig?.updateInterval || LIVE_MIN_INTERVAL, LIVE_MIN_INTERVAL);

            this.refreshLive();
            this.refreshToday();
            this.timers.push(setInterval(() => this.refreshLive(), liveInterval));
            this.timers.push(setInterval(() => this.refreshToday(), TODAY_INTERVAL));
        },

        stop() {
            this.timers.forEach(clearInterval);
            this.timers = [];
        },

        createSparklines() {
            const make = (key, unit, series) => {
                const canvas = document.getElementById(`${key}-spark`);
                if (!canvas) return;
                this.sparks[key] = P1Chart.create(canvas, { compact: true, unit, decimals: 3, series });
            };

            make('elec', 'kWh', [
                { key: 'consumption', label: 'Verbruik', type: 'bar', token: 'series-import' },
                { key: 'production', label: 'Teruglevering', type: 'bar', token: 'series-export' }
            ]);
            make('gas', 'm³', [{ key: 'gas', label: 'Gas', type: 'bar', token: 'series-gas' }]);
            make('solar', 'kWh', [{ key: 'production', label: 'Opgewekt', type: 'bar', token: 'series-solar' }]);
        },

        // ------------------------------------------------------------------
        // Live values
        // ------------------------------------------------------------------

        bindLive() {
            const live = window.P1Live || {};
            if ('weather' in live) this.showWeather(live.weather);
            if ('solar' in live) this.showSolarNow(live.solar);

            document.addEventListener('p1:live', (e) => {
                if (e.detail.key === 'weather') this.showWeather(e.detail.value);
                if (e.detail.key === 'solar') this.showSolarNow(e.detail.value);
            });
        },

        async refreshLive() {
            try {
                const rows = await window.P1API.getSmartMeter(1);
                const latest = rows && rows[0];
                if (!latest) throw new Error('No smart meter reading');

                const net = (parseFloat(latest.CONSUMPTION_W) || 0) - (parseFloat(latest.PRODUCTION_W) || 0);
                P1Section.setKpi('now-power', {
                    value: power(Math.abs(net)),
                    sub: net < 0 ? 'teruglevering' : 'afname van het net',
                    tone: net < 0 ? 'is-export' : 'is-import'
                });
                this.markUpdated(true);
            } catch (err) {
                P1Logger.warn('[Dashboard] live update failed:', err);
                this.markUpdated(false);
            }
        },

        showSolarNow(solar) {
            P1Section.setKpi('now-solar', solar
                ? { value: power(solar.power), sub: `vandaag ${kwh(solar.todayKWh)}` }
                : { value: '--', sub: 'niet beschikbaar' });
        },

        showWeather(weather) {
            if (!weather || weather.TEMPERATURE === undefined) return;
            const parts = [];
            if (weather.WIND_SPEED !== undefined) parts.push(`${fmt(weather.WIND_SPEED, 1)} m/s`);
            if (weather.HUMIDITY !== undefined) parts.push(`${Math.round(weather.HUMIDITY)}%`);
            P1Section.setKpi('now-weather', {
                value: `${Math.round(weather.TEMPERATURE)}°C`,
                sub: parts.join(' · ')
            });
        },

        // ------------------------------------------------------------------
        // Today
        // ------------------------------------------------------------------

        /**
         * Today from local midnight, plus yesterday up to the same time
         */
        windows() {
            const midnight = new Date();
            midnight.setHours(0, 0, 0, 0);
            const start = Math.floor(midnight.getTime() / 1000);
            const now = Math.floor(Date.now() / 1000);
            return {
                start,
                now,
                isToday: (ts) => ts >= start,
                isYesterdaySoFar: (ts) => ts >= start - 24 * HOUR && ts < now - 24 * HOUR
            };
        },

        /**
         * 24 hourly slots from midnight; hours still to come stay null so
         * the sparkline fills up through the day
         */
        daySlots(points, start, keys) {
            const slots = [];
            for (let h = 0; h < 24; h++) {
                const slot = { unixTimestamp: start + h * HOUR };
                keys.forEach(k => { slot[k] = null; });
                slots.push(slot);
            }
            points.forEach(p => {
                const h = Math.floor((p.unixTimestamp - start) / HOUR);
                if (h >= 0 && h < 24) keys.forEach(k => { slots[h][k] = p[k]; });
            });
            return slots;
        },

        async refreshToday() {
            const w = this.windows();
            const [hours, solar, financial] = await Promise.allSettled([
                window.P1API.getHistoryHour(48),
                this.fetchSolarHours(),
                window.P1API.getFinancial(1)
            ]);

            const p1Rows = hours.status === 'fulfilled' && Array.isArray(hours.value) ? hours.value : null;
            const solarPoints = solar.status === 'fulfilled' ? solar.value : null;
            const todayCosts = financial.status === 'fulfilled' ? this.todayFinancial(financial.value) : null;

            const energy = p1Rows ? this.showEnergy(p1Rows, w) : null;
            const solarToday = this.showSolar(solarPoints, w);
            this.showCosts(energy, solarToday, todayCosts);

            this.markUpdated(!!p1Rows);
        },

        async fetchSolarHours() {
            const response = await fetch('/custom/api/solar.php?period=hours&zoom=48');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (payload.error) throw new Error(payload.error);
            return payload.chartData || [];
        },

        /**
         * Electricity and gas cards from the P1 hourly history
         */
        showEnergy(rows, w) {
            const points = rows.map(r => ({
                unixTimestamp: parseInt(r.TIMESTAMP_UTC),
                consumption: parseFloat(r.CONSUMPTION_DELTA_KWH) || 0,
                production: parseFloat(r.PRODUCTION_DELTA_KWH) || 0,
                gas: parseFloat(r.CONSUMPTION_GAS_DELTA_M3) || 0
            }));

            const sum = (list, key) => list.reduce((s, p) => s + p[key], 0);
            const today = points.filter(p => w.isToday(p.unixTimestamp));
            const yesterday = points.filter(p => w.isYesterdaySoFar(p.unixTimestamp));

            const t = {
                consumption: sum(today, 'consumption'),
                production: sum(today, 'production'),
                gas: sum(today, 'gas')
            };
            const y = {
                consumption: yesterday.length ? sum(yesterday, 'consumption') : undefined,
                gas: yesterday.length ? sum(yesterday, 'gas') : undefined
            };

            P1Section.setKpi('elec-today', {
                value: kwh(t.consumption),
                delta: { current: t.consumption, previous: y.consumption, goodWhen: 'down', compareLabel: COMPARE }
            });
            P1Utils.updateElement('elec-export-today', kwh(t.production));
            P1Utils.updateElement('elec-net-today', kwh(t.consumption - t.production));
            this.setSpark('elec', today, w.start, ['consumption', 'production']);

            P1Section.setKpi('gas-today', {
                value: m3(t.gas),
                delta: { current: t.gas, previous: y.gas, goodWhen: 'down', compareLabel: COMPARE }
            });
            const newest = points[0];
            P1Utils.updateElement('gas-last-hour', newest ? m3(newest.gas) : '--');
            this.setSpark('gas', today, w.start, ['gas']);

            return t;
        },

        /**
         * Solar card; blanks itself when the solar database is unavailable
         */
        showSolar(points, w) {
            if (!points) {
                P1Section.setKpi('solar-today', { value: '--', sub: 'niet beschikbaar', delta: null });
                P1Utils.updateElement('solar-peak-today', '--');
                P1Utils.updateElement('solar-capacity-today', '--');
                this.setSpark('solar', [], w.start, ['production']);
                return null;
            }

            const today = points.filter(p => w.isToday(p.unixTimestamp));
            const yesterday = points.filter(p => w.isYesterdaySoFar(p.unixTimestamp));
            const sum = (list) => list.reduce((s, p) => s + (parseFloat(p.production) || 0), 0);
            const energy = sum(today);

            P1Section.setKpi('solar-today', {
                value: kwh(energy),
                sub: 'opgewekt vandaag',
                delta: { current: energy, previous: yesterday.length ? sum(yesterday) : undefined, goodWhen: 'up', compareLabel: COMPARE }
            });

            const peak = today.reduce((best, p) => {
                const v = parseFloat(p.powerMax) || parseFloat(p.power) || 0;
                return v > best.value ? { value: v, time: p.unixTimestamp } : best;
            }, { value: 0, time: null });
            P1Utils.updateElement('solar-peak-today', peak.time ? `${power(peak.value)} · ${P1Utils.formatPeakTime(peak.time, 'hours')}` : '--');

            // Share of what the panels could have produced since midnight
            const capacityKW = (window.P1MonConfig?.systemCapacityW ?? 3780) / 1000;
            const hoursSoFar = (w.now - w.start) / HOUR;
            const factor = hoursSoFar > 0 ? (energy / (capacityKW * hoursSoFar)) * 100 : 0;
            P1Utils.updateElement('solar-capacity-today', `${fmt(factor, 1)}%`);

            this.setSpark('solar', today, w.start, ['production']);
            return energy;
        },

        /**
         * Today's row from /financial/day, if P1 Monitor has one for today
         */
        todayFinancial(rows) {
            const row = Array.isArray(rows) ? rows[0] : null;
            if (!row) return null;
            const date = P1Utils.toDate(row.TIMESTAMP_lOCAL);
            if (!date || date.toDateString() !== new Date().toDateString()) return null;

            return {
                electricity: (parseFloat(row.CONSUMPTION_COST_ELECTRICITY_HIGH) || 0)
                    + (parseFloat(row.CONSUMPTION_COST_ELECTRICITY_LOW) || 0)
                    - (parseFloat(row.PRODUCTION_REVENUES_ELECTRICITY_HIGH) || 0)
                    - (parseFloat(row.PRODUCTION_REVENUES_ELECTRICITY_LOW) || 0),
                gas: parseFloat(row.CONSUMPTION_COST_GAS) || 0
            };
        },

        showCosts(energy, solarKWh, financial) {
            const tariffs = P1Utils.tariffs();
            const hasGas = !!document.getElementById('costs-gas-today');

            let elec = null;
            let gas = null;
            let estimated = false;
            if (financial) {
                elec = financial.electricity;
                gas = financial.gas;
            } else if (energy) {
                elec = P1Utils.estimateElectricityCost(energy.consumption, energy.production);
                gas = energy.gas * tariffs.gas;
                estimated = true;
            }

            if (elec === null) {
                P1Section.setKpi('costs-today', { value: '--', sub: 'totaal vandaag' });
                return;
            }

            const total = elec + (hasGas ? gas : 0);
            P1Section.setKpi('costs-today', {
                value: eur(total),
                sub: estimated ? 'totaal vandaag · geschat' : 'totaal vandaag'
            });
            P1Utils.updateElement('costs-elec-today', eur(elec));
            if (hasGas) {
                P1Utils.updateElement('costs-gas-today', eur(gas));
                P1Utils.updateElement('gas-cost-today', eur(gas));
            }
            P1Utils.updateElement('costs-solar-today', solarKWh === null ? '--' : eur(solarKWh * tariffs.import));

            this.showCostSplit(elec, hasGas ? gas : 0);
        },

        /**
         * Bar showing how today's costs split between electricity and gas.
         * Only meaningful when both are costs: with net export revenue
         * (negative electricity) a share would mislead, so it is hidden.
         */
        showCostSplit(elec, gas) {
            const bar = document.getElementById('cost-split');
            if (!bar) return;

            const total = elec + gas;
            bar.replaceChildren();
            bar.hidden = !(elec > 0 && gas > 0);
            if (bar.hidden) return;

            [['is-import', elec], ['is-gas', gas]].forEach(([tone, value]) => {
                const seg = document.createElement('span');
                seg.className = tone;
                seg.style.flexGrow = value / total;
                bar.appendChild(seg);
            });
        },

        setSpark(key, points, start, keys) {
            const chart = this.sparks[key];
            if (!chart) return;
            chart.setData(this.daySlots(points, start, keys), 'hours');
            chart.canvas.closest('.sparkline').dataset.state = points.length ? 'ready' : 'empty';
        },

        // ------------------------------------------------------------------
        // Update status
        // ------------------------------------------------------------------

        markUpdated(ok) {
            const el = document.getElementById('update-status');
            const text = document.getElementById('update-status-text');
            if (!el || !text) return;

            const time = (d) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            if (ok) {
                this.lastUpdate = new Date();
                el.dataset.state = 'ok';
                text.textContent = `Bijgewerkt ${time(this.lastUpdate)}`;
            } else {
                el.dataset.state = 'stale';
                text.textContent = this.lastUpdate
                    ? `Geen verbinding · laatste update ${time(this.lastUpdate)}`
                    : 'Geen verbinding met P1 Monitor';
            }
        }
    };

    function start() {
        if (document.body.dataset.page === 'dashboard') Dashboard.init();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    window.Dashboard = Dashboard;

})();
