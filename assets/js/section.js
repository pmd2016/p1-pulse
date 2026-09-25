/**
 * P1Section - controller for a section page (Elektriciteit, Gas, Zon, ...)
 *
 * Drives the markup from components/section.php:
 *   - toolbar: period tabs, back/forward through history, range, temperature
 *   - KPI cards: value, subtitle and change vs the previous period
 *   - chart card: loading / ready / empty / error states, retry
 *   - the live "Nu" card, refreshed while the page is visible
 *
 * State (period, range, page back, temperature) is kept in the URL so a
 * view can be shared or reloaded, and the last period/range/temperature
 * per section is remembered in localStorage.
 *
 * Usage:
 *   const section = P1Section.create({
 *       id: 'gas',
 *       chart,                 // the page's P1Chart, for "Toon als tabel"
 *       load: async (state, isCurrent) => {
 *           // fetch, then if (!isCurrent()) return; render chart + KPIs
 *           return { empty: false, from, to, hasOlder: true };
 *       },
 *       live: async () => { section.setKpi('now', { ... }); }
 *   });
 *   section.init();
 *
 * state = { period, zoom, page, temperature }. page 0 is the newest window,
 * page 1 the one before it, and so on.
 */

(function() {
    'use strict';

    const PERIODS = ['hours', 'days', 'months', 'years'];
    const STORAGE_PREFIX = 'p1pulse.section.';

    function readStorage(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch (e) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // Storage unavailable (private mode): the URL still carries the state
        }
    }

    function validZoom(period, zoom) {
        return (P1Utils.zoomOptions[period] || []).some(o => o.value === zoom);
    }

    /**
     * Update one KPI card.
     * @param {string} key - data-kpi attribute
     * @param {Object} kpi - { value, sub, delta: { current, previous, goodWhen, previousText, format } }
     *   goodWhen: 'down' (usage, cost) or 'up' (production); omit for neutral
     *   format: formats an absolute difference, shown instead of a
     *   percentage when the previous value is zero or below (net costs)
     *   compareLabel: what `previous` is, for the tooltip (default "de vorige periode")
     */
    function setKpi(key, kpi) {
        const el = document.querySelector(`[data-kpi="${key}"]`);
        if (!el) return;

        if (kpi.value !== undefined) el.querySelector('.kpi-value').textContent = kpi.value;
        if (kpi.sub !== undefined) el.querySelector('.kpi-sub').textContent = kpi.sub;
        if (kpi.tone) {
            el.classList.remove('is-import', 'is-export', 'is-net', 'is-solar', 'is-gas', 'is-water', 'is-cost', 'is-neutral');
            el.classList.add(kpi.tone);
        }

        const deltaEl = el.querySelector('.kpi-delta');
        if (deltaEl && 'delta' in kpi) renderDelta(deltaEl, kpi.delta);
    }

    function renderDelta(el, delta) {
        el.classList.remove('is-better', 'is-worse', 'is-same');

        const hide = () => {
            el.hidden = true;
            el.textContent = '';
            el.removeAttribute('title');
            el.removeAttribute('aria-label');
        };

        if (!delta || !Number.isFinite(delta.current) || !Number.isFinite(delta.previous)) {
            return hide();
        }

        // A percentage of a zero or negative base means nothing
        // (net costs can be negative): show the difference instead
        const diff = delta.current - delta.previous;
        const percentage = delta.previous > 1e-9;
        if (!percentage && typeof delta.format !== 'function') {
            return hide();
        }

        const change = percentage
            ? Math.round((diff / delta.previous) * 100)
            : (Math.abs(diff) < 0.005 ? 0 : diff);
        const amount = percentage ? `${Math.abs(change)}%` : delta.format(Math.abs(diff));

        let arrow = '→';
        let direction = 'gelijk aan';
        let cls = 'is-same';

        if (change !== 0) {
            const up = change > 0;
            arrow = up ? '▲' : '▼';
            direction = up ? 'hoger dan' : 'lager dan';
            if (delta.goodWhen) {
                const good = (delta.goodWhen === 'up') === up;
                cls = good ? 'is-better' : 'is-worse';
            }
        }

        el.hidden = false;
        el.classList.add(cls);
        el.textContent = `${arrow} ${amount}`;

        const context = `${amount} ${direction} ${delta.compareLabel || 'de vorige periode'}`
            + (delta.previousText ? ` (${delta.previousText})` : '');
        el.title = context;
        el.setAttribute('aria-label', context);
    }

    const P1Section = {
        create(config) {
            const root = document;
            const toolbar = root.querySelector('[data-section-toolbar]');
            const card = root.querySelector('[data-chart-card]');

            const section = {
                state: null,
                loadId: 0,
                hasOlder: true,
                liveTimer: null,

                init() {
                    this.state = this.initialState();
                    this.bindToolbar();
                    this.renderToolbar();

                    if (card) {
                        const retry = card.querySelector('[data-retry]');
                        if (retry) retry.addEventListener('click', () => this.reload());
                        this.bindTableToggle();
                    }

                    this.reload();
                    this.startLive();
                },

                /**
                 * "Toon als tabel": swap the canvas for a table of the same
                 * data (config.chart), remembered per section
                 */
                bindTableToggle() {
                    const button = card.querySelector('[data-table-toggle]');
                    const tableEl = card.querySelector('[data-chart-table]');
                    if (!button || !tableEl || !config.chart) return;

                    const apply = (on) => {
                        button.setAttribute('aria-pressed', on ? 'true' : 'false');
                        card.classList.toggle('shows-table', on);
                        tableEl.hidden = !on;
                        config.chart.showTable(on ? tableEl : null);
                    };

                    apply(!!(readStorage(STORAGE_PREFIX + config.id) || {}).table);

                    button.addEventListener('click', () => {
                        const on = button.getAttribute('aria-pressed') !== 'true';
                        apply(on);
                        const stored = readStorage(STORAGE_PREFIX + config.id) || {};
                        writeStorage(STORAGE_PREFIX + config.id, { ...stored, table: on });
                    });
                },

                /**
                 * URL first, then the remembered choice, then defaults
                 */
                initialState() {
                    const params = new URLSearchParams(window.location.search);
                    const stored = readStorage(STORAGE_PREFIX + config.id) || {};
                    const periods = this.periods();

                    let period = params.get('period') || stored.period || periods[0];
                    if (!periods.includes(period)) period = periods[0];

                    let zoom = parseInt(params.get('range') || stored.zoom, 10);
                    if (!validZoom(period, zoom)) zoom = P1Utils.defaultZooms[period];

                    const page = Math.max(0, parseInt(params.get('offset'), 10) || 0);

                    const temperature = params.has('temp')
                        ? params.get('temp') === '1'
                        : !!stored.temperature;

                    return { period, zoom, page, temperature };
                },

                /**
                 * Periods this page offers: the tabs section_toolbar() rendered
                 */
                periods() {
                    const tabs = toolbar ? [...toolbar.querySelectorAll('.period-tab')].map(t => t.dataset.period) : [];
                    const offered = PERIODS.filter(p => tabs.includes(p));
                    return offered.length ? offered : PERIODS;
                },

                persistState() {
                    const { period, zoom, page, temperature } = this.state;
                    const stored = readStorage(STORAGE_PREFIX + config.id) || {};
                    writeStorage(STORAGE_PREFIX + config.id, { ...stored, period, zoom, temperature });

                    const params = new URLSearchParams(window.location.search);
                    params.set('period', period);
                    params.set('range', zoom);
                    if (page > 0) params.set('offset', page); else params.delete('offset');
                    if (temperature) params.set('temp', '1'); else params.delete('temp');

                    const url = `${window.location.pathname}?${params.toString()}`;
                    try {
                        window.history.replaceState(null, '', url);
                    } catch (e) {
                        // Some embedded viewers disallow history changes; state still works
                    }
                },

                bindToolbar() {
                    if (!toolbar) return;

                    const tabs = [...toolbar.querySelectorAll('.period-tab')];
                    tabs.forEach((tab, i) => {
                        tab.addEventListener('click', () => this.setPeriod(tab.dataset.period));
                        tab.addEventListener('keydown', (e) => {
                            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                            e.preventDefault();
                            const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
                            next.focus();
                            this.setPeriod(next.dataset.period);
                        });
                    });

                    toolbar.querySelector('[data-nav="prev"]')?.addEventListener('click', () => this.setPage(this.state.page + 1));
                    toolbar.querySelector('[data-nav="next"]')?.addEventListener('click', () => this.setPage(this.state.page - 1));

                    toolbar.querySelector('[data-range-select]')?.addEventListener('change', (e) => {
                        this.setZoom(parseInt(e.target.value, 10));
                    });

                    toolbar.querySelector('[data-toggle="temperature"]')?.addEventListener('click', () => {
                        this.state.temperature = !this.state.temperature;
                        this.renderToolbar();
                        this.reload();
                    });
                },

                renderToolbar() {
                    if (!toolbar) return;
                    const { period, zoom, page, temperature } = this.state;

                    toolbar.querySelectorAll('.period-tab').forEach(tab => {
                        const active = tab.dataset.period === period;
                        tab.classList.toggle('active', active);
                        tab.setAttribute('aria-selected', active ? 'true' : 'false');
                        tab.tabIndex = active ? 0 : -1;
                    });

                    const options = P1Utils.zoomOptions[period] || [];

                    const select = toolbar.querySelector('[data-range-select]');
                    if (select) {
                        select.replaceChildren(...options.map(opt => {
                            const o = document.createElement('option');
                            o.value = opt.value;
                            o.textContent = opt.label;
                            o.selected = opt.value === zoom;
                            return o;
                        }));
                    }

                    const buttons = toolbar.querySelector('[data-range-buttons]');
                    if (buttons) {
                        buttons.replaceChildren(...options.map(opt => {
                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.className = 'control-button';
                            btn.textContent = opt.label;
                            const active = opt.value === zoom;
                            btn.classList.toggle('active', active);
                            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
                            btn.addEventListener('click', () => this.setZoom(opt.value));
                            return btn;
                        }));
                    }

                    const next = toolbar.querySelector('[data-nav="next"]');
                    if (next) next.disabled = page === 0;
                    const prev = toolbar.querySelector('[data-nav="prev"]');
                    if (prev) prev.disabled = !this.hasOlder;

                    const temp = toolbar.querySelector('[data-toggle="temperature"]');
                    if (temp) temp.setAttribute('aria-pressed', temperature ? 'true' : 'false');
                },

                setPeriod(period) {
                    if (period === this.state.period || !this.periods().includes(period)) return;
                    this.state.period = period;
                    this.state.zoom = P1Utils.defaultZooms[period];
                    this.state.page = 0;
                    this.hasOlder = true;
                    this.renderToolbar();
                    this.reload();
                },

                setZoom(zoom) {
                    if (zoom === this.state.zoom || !validZoom(this.state.period, zoom)) return;
                    this.state.zoom = zoom;
                    this.state.page = 0;
                    this.hasOlder = true;
                    this.renderToolbar();
                    this.reload();
                },

                setPage(page) {
                    if (page < 0 || page === this.state.page) return;
                    this.state.page = page;
                    this.renderToolbar();
                    this.reload();
                },

                setCardState(state, message) {
                    if (!card) return;
                    card.dataset.state = state;
                    if (state === 'error') {
                        const text = card.querySelector('[data-error-text]');
                        if (text) text.textContent = message || 'Fout bij ophalen data';
                    }
                },

                setPeriodLabel(from, to) {
                    const label = toolbar && toolbar.querySelector('[data-period-label]');
                    if (!label) return;
                    label.textContent = from && to
                        ? P1Utils.formatRange(from, to, this.state.period)
                        : P1Utils.rangeLabel(this.state.period, this.state.zoom);
                },

                /**
                 * Load data for the current state. The page's load() must
                 * check isCurrent() before rendering: a slower response for
                 * an older request is dropped.
                 */
                async reload() {
                    const id = ++this.loadId;
                    const isCurrent = () => id === this.loadId;

                    this.persistState();
                    if (card) card.classList.add('is-busy');
                    this.setCardState(card && card.classList.contains('has-data') ? 'ready' : 'loading');

                    try {
                        const result = await config.load({ ...this.state }, isCurrent);
                        if (!isCurrent()) return;

                        const r = result || {};
                        this.hasOlder = r.hasOlder !== false;
                        this.setPeriodLabel(r.from, r.to);
                        this.renderToolbar();

                        if (r.empty) {
                            this.setCardState('empty');
                        } else {
                            if (card) card.classList.add('has-data');
                            this.setCardState('ready');
                        }
                    } catch (error) {
                        if (!isCurrent()) return;
                        P1Logger.error(`[${config.id}] load failed:`, error);
                        this.setCardState('error', error && error.userMessage);
                    } finally {
                        if (isCurrent() && card) card.classList.remove('is-busy');
                    }
                },

                setKpi(key, kpi) {
                    P1Section.setKpi(key, kpi);
                },

                /**
                 * Refresh the live "Nu" card while the page is visible
                 */
                startLive() {
                    if (!config.live) return;

                    const interval = Math.max(window.P1MonConfig?.updateInterval || 10000, 10000);
                    const tick = () => config.live().catch(err => P1Logger.warn(`[${config.id}] live update failed:`, err));

                    const start = () => {
                        if (this.liveTimer) return;
                        tick();
                        this.liveTimer = setInterval(tick, interval);
                    };
                    const stop = () => {
                        clearInterval(this.liveTimer);
                        this.liveTimer = null;
                    };

                    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
                    window.addEventListener('beforeunload', stop);
                    if (!document.hidden) start();
                }
            };

            return section;
        },

        /**
         * Update any KPI card (section pages and dashboard), see setKpi() above
         */
        setKpi,

        /**
         * Error with a message meant for the user (shown in the chart card)
         */
        userError(message) {
            const error = new Error(message);
            error.userMessage = message;
            return error;
        }
    };

    window.P1Section = P1Section;

})();
