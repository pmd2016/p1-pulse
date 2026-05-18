/**
 * P1 Monitor Logger
 * Debug logging utility with enable/disable support.
 *
 * Enable debug logging:
 *   - Add ?debug to the URL, or
 *   - Run P1Logger.enable() in the browser console
 *
 * Disable debug logging:
 *   - Run P1Logger.disable() in the browser console
 *
 * Behaviour:
 *   - log() and warn() only output when debug mode is active
 *   - error() always outputs regardless of debug mode
 */

(function() {
    'use strict';

    const Logger = {
        _debugEnabled: null,

        isDebugEnabled() {
            if (this._debugEnabled === null) {
                this._debugEnabled =
                    localStorage.getItem('p1mon_debug') === 'true' ||
                    new URLSearchParams(window.location.search).has('debug');
            }
            return this._debugEnabled;
        },

        log(...args) {
            if (this.isDebugEnabled()) {
                console.log(...args);
            }
        },

        warn(...args) {
            if (this.isDebugEnabled()) {
                console.warn(...args);
            }
        },

        error(...args) {
            console.error(...args);
        },

        enable() {
            localStorage.setItem('p1mon_debug', 'true');
            this._debugEnabled = true;
            console.log('[P1Logger] Debug logging enabled');
        },

        disable() {
            localStorage.removeItem('p1mon_debug');
            this._debugEnabled = false;
            console.log('[P1Logger] Debug logging disabled');
        }
    };

    window.P1Logger = Logger;
})();
