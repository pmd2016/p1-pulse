/**
 * P1Utils - shared helpers for all pages
 *
 * Period configuration, Dutch date formatting, number formatting, design
 * token access and small DOM helpers. Charts live in p1chart.js, the
 * period/range controls in section.js.
 */

(function() {
    'use strict';

    const P1Utils = {
        // Range options per period (first one is the default)
        zoomOptions: {
            hours: [
                { value: 24, label: '24 uur' },
                { value: 48, label: '48 uur' },
                { value: 72, label: '72 uur' }
            ],
            days: [
                { value: 7, label: '7 dagen' },
                { value: 14, label: '14 dagen' },
                { value: 30, label: '30 dagen' }
            ],
            months: [
                { value: 12, label: '12 maanden' },
                { value: 24, label: '24 maanden' }
            ],
            years: [
                { value: 5, label: '5 jaar' },
                { value: 10, label: '10 jaar' }
            ]
        },

        defaultZooms: {
            hours: 24,
            days: 7,
            months: 12,
            years: 5
        },

        periodLabels: {
            hours: 'uren',
            days: 'dagen',
            months: 'maanden',
            years: 'jaren'
        },

        periodLabelsSingular: {
            hours: 'uur',
            days: 'dag',
            months: 'maand',
            years: 'jaar'
        },

        dayNames: ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'],
        monthNamesShort: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
        monthNamesFull: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
        monthNamesCapitalized: ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'],

        /**
         * "Laatste 24 uren", "Laatste 12 maanden"
         */
        rangeLabel(period, zoom) {
            return `Laatste ${zoom} ${this.periodLabels[period] || 'periodes'}`;
        },

        /**
         * Parse a timestamp as P1 Monitor and the solar API deliver them:
         * unix seconds (number or numeric string) or 'YYYY-MM-DD HH:MM:SS'.
         */
        toDate(value) {
            if (value === null || value === undefined || value === '') return null;
            if (typeof value === 'number' || /^\d+$/.test(String(value))) {
                return new Date(parseInt(value, 10) * 1000);
            }
            const date = new Date(String(value).replace(' ', 'T'));
            return isNaN(date.getTime()) ? null : date;
        },

        /**
         * Short label for chart axes
         */
        formatXAxisLabel(date, period, isPhone) {
            if (period === 'hours') {
                return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            } else if (period === 'days') {
                return `${date.getDate()} ${this.monthNamesShort[date.getMonth()]}`;
            } else if (period === 'months') {
                return isPhone
                    ? this.monthNamesShort[date.getMonth()]
                    : `${this.monthNamesShort[date.getMonth()]} ${date.getFullYear()}`;
            } else if (period === 'years') {
                return `${date.getFullYear()}`;
            }
            return '';
        },

        /**
         * Full label for tooltip titles
         */
        formatTooltipTime(date, period) {
            if (period === 'hours') {
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${this.dayNames[date.getDay()]} ${hours}:${minutes}`;
            } else if (period === 'days') {
                return `${date.getDate()} ${this.monthNamesFull[date.getMonth()]} ${date.getFullYear()}`;
            } else if (period === 'months') {
                return `${this.monthNamesCapitalized[date.getMonth()]} ${date.getFullYear()}`;
            } else if (period === 'years') {
                return `${date.getFullYear()}`;
            }
            return date.toLocaleString('nl-NL');
        },

        /**
         * When a peak happened, at the precision of the period:
         * "17:00", "27 apr", "apr 2025", "2025".
         * withTime: for momentary peaks (power), always give the moment:
         * "17:00" within hours, otherwise "27 apr 13:05".
         */
        formatPeakTime(value, period, withTime = false) {
            const date = this.toDate(value);
            if (!date) return '--';

            const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            if (period === 'hours') {
                return time;
            } else if (withTime) {
                return `${date.getDate()} ${this.monthNamesShort[date.getMonth()]} ${time}`;
            } else if (period === 'days') {
                return `${date.getDate()} ${this.monthNamesShort[date.getMonth()]}`;
            } else if (period === 'months') {
                return `${this.monthNamesShort[date.getMonth()]} ${date.getFullYear()}`;
            }
            return String(date.getFullYear());
        },

        /**
         * Label for the window shown in the toolbar, from the first and last
         * bucket timestamps (unix seconds):
         *   hours   "14 jan 10:00 – 15 jan 09:00" (one date if on the same day)
         *   days    "8 – 14 jan", "28 dec 2025 – 3 jan 2026"
         *   months  "jan – dec 2025", "feb 2024 – jan 2025"
         *   years   "2021 – 2025"
         */
        formatRange(from, to, period) {
            const a = this.toDate(from);
            const b = this.toDate(to);
            if (!a || !b) return '';

            const nowYear = new Date().getFullYear();
            const mon = (d) => this.monthNamesShort[d.getMonth()];
            const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const sameDay = a.toDateString() === b.toDateString();
            const sameYear = a.getFullYear() === b.getFullYear();

            if (period === 'hours') {
                return sameDay
                    ? `${a.getDate()} ${mon(a)} ${hm(a)} – ${hm(b)}`
                    : `${a.getDate()} ${mon(a)} ${hm(a)} – ${b.getDate()} ${mon(b)} ${hm(b)}`;
            }
            if (period === 'days') {
                if (sameYear && a.getMonth() === b.getMonth()) {
                    return `${a.getDate()} – ${b.getDate()} ${mon(b)}${b.getFullYear() !== nowYear ? ' ' + b.getFullYear() : ''}`;
                }
                if (sameYear) {
                    return `${a.getDate()} ${mon(a)} – ${b.getDate()} ${mon(b)}${b.getFullYear() !== nowYear ? ' ' + b.getFullYear() : ''}`;
                }
                return `${a.getDate()} ${mon(a)} ${a.getFullYear()} – ${b.getDate()} ${mon(b)} ${b.getFullYear()}`;
            }
            if (period === 'months') {
                return sameYear
                    ? `${mon(a)} – ${mon(b)} ${b.getFullYear()}`
                    : `${mon(a)} ${a.getFullYear()} – ${mon(b)} ${b.getFullYear()}`;
            }
            return a.getFullYear() === b.getFullYear() ? `${a.getFullYear()}` : `${a.getFullYear()} – ${b.getFullYear()}`;
        },

        /**
         * Key that identifies the bucket a timestamp falls in, used to join
         * weather data onto energy data
         */
        getPeriodKey(timestamp, period) {
            const date = new Date(timestamp * 1000);
            if (period === 'hours') {
                return Math.floor(timestamp / 3600);
            } else if (period === 'days') {
                return date.toDateString();
            } else if (period === 'months') {
                return date.getFullYear() + '-' + (date.getMonth() + 1);
            } else if (period === 'years') {
                return date.getFullYear();
            }
            return timestamp;
        },

        formatNumber(value, decimals = 2) {
            return (Math.round((value || 0) * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals);
        },

        /**
         * Read a design token from CSS, e.g. color('series-gas').
         * Series colours live in variables.css; never hard-code them in JS.
         */
        color(name) {
            return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
        },

        /**
         * Phone breakpoint, matches the 600px breakpoint in the CSS
         */
        isPhone() {
            return window.innerWidth < 600;
        },

        updateElement(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        },

        showError(message) {
            const el = document.getElementById('error-container');
            if (!el) return;
            el.textContent = '';
            const div = document.createElement('div');
            div.className = 'error';
            div.setAttribute('role', 'alert');
            div.textContent = message;
            el.appendChild(div);
        },

        hideError() {
            const el = document.getElementById('error-container');
            if (el) el.textContent = '';
        }
    };

    window.P1Utils = P1Utils;

})();
