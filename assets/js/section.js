/**
 * P1Section - period and range controller for a section page
 *
 * Drives the period tabs (.period-tab) and the range buttons, and calls
 * `onLoad(period, zoom)` whenever either changes. Responses that arrive
 * after a newer request was started are dropped, so quickly tapping
 * through tabs never leaves the chart showing an older period.
 *
 * Usage:
 *   const section = P1Section.create({
 *       zoomButtonsId: 'zoom-buttons',
 *       onLoad: async (period, zoom, isCurrent) => { ... }
 *   });
 *   section.init();
 */

(function() {
    'use strict';

    const P1Section = {
        create(config) {
            const section = {
                period: config.defaultPeriod || 'hours',
                zoom: null,
                loadId: 0,

                init() {
                    this.zoom = P1Utils.defaultZooms[this.period];

                    document.querySelectorAll('.period-tab').forEach(tab => {
                        tab.setAttribute('aria-selected', tab.dataset.period === this.period ? 'true' : 'false');
                        tab.addEventListener('click', () => {
                            if (!tab.disabled) this.setPeriod(tab.dataset.period);
                        });
                    });

                    const tabs = document.querySelector('.period-tabs');
                    if (tabs) tabs.setAttribute('role', 'tablist');
                    document.querySelectorAll('.period-tab').forEach(tab => tab.setAttribute('role', 'tab'));

                    this.renderZoomButtons();
                    this.reload();
                },

                setPeriod(period) {
                    if (period === this.period) return;
                    this.period = period;
                    this.zoom = P1Utils.defaultZooms[period];

                    document.querySelectorAll('.period-tab').forEach(tab => {
                        const active = tab.dataset.period === period;
                        tab.classList.toggle('active', active);
                        tab.setAttribute('aria-selected', active ? 'true' : 'false');
                    });

                    this.renderZoomButtons();
                    this.reload();
                },

                setZoom(zoom) {
                    if (zoom === this.zoom) return;
                    this.zoom = zoom;
                    this.renderZoomButtons();
                    this.reload();
                },

                renderZoomButtons() {
                    const container = document.getElementById(config.zoomButtonsId);
                    if (!container) return;

                    container.replaceChildren();
                    (P1Utils.zoomOptions[this.period] || []).forEach(opt => {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'control-button';
                        btn.dataset.zoom = opt.value;
                        btn.textContent = opt.label;
                        const active = opt.value === this.zoom;
                        btn.classList.toggle('active', active);
                        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
                        btn.addEventListener('click', () => this.setZoom(opt.value));
                        container.appendChild(btn);
                    });
                },

                /**
                 * Load data for the current period and zoom.
                 * onLoad receives isCurrent(): false once a newer load started.
                 */
                async reload() {
                    const id = ++this.loadId;
                    const isCurrent = () => id === this.loadId;
                    await config.onLoad(this.period, this.zoom, isCurrent);
                }
            };

            return section;
        }
    };

    window.P1Section = P1Section;

})();
