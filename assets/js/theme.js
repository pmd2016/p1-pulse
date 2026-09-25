/**
 * Theme Management System
 * Handles dark/light mode switching with persistence
 */

(function() {
    'use strict';
    
    const ThemeManager = {
        // Storage keys
        STORAGE_KEY: 'p1mon_theme',
        
        // Theme options
        THEMES: {
            LIGHT: 'light',
            DARK: 'dark'
        },
        
        /**
         * Initialize theme system
         * The inline script in header.php already applied a stored choice
         * to <html data-theme>; without one, CSS follows the system theme.
         */
        init() {
            const stored = this.getStoredTheme();
            if (stored) {
                this.applyTheme(stored);
            }

            this.setupEventListeners();
            this.watchSystemTheme();

            P1Logger.log('Theme system initialized:', this.getCurrentTheme(), stored ? '(stored)' : '(system)');
        },

        /**
         * Get the explicitly stored theme, or null when following the system
         */
        getStoredTheme() {
            try {
                const storedTheme = localStorage.getItem(this.STORAGE_KEY);
                return this.isValidTheme(storedTheme) ? storedTheme : null;
            } catch (e) {
                return null;
            }
        },

        /**
         * Get system theme preference
         */
        getSystemTheme() {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return this.THEMES.DARK;
            }
            return this.THEMES.LIGHT;
        },

        /**
         * Check if theme is valid
         */
        isValidTheme(theme) {
            return Object.values(this.THEMES).includes(theme);
        },

        /**
         * Get the theme currently in effect
         */
        getCurrentTheme() {
            const explicit = document.documentElement.dataset.theme;
            return this.isValidTheme(explicit) ? explicit : this.getSystemTheme();
        },

        /**
         * Set <html data-theme> without persisting
         */
        applyTheme(theme) {
            document.documentElement.dataset.theme = theme;

            // Browser chrome colour follows the explicit choice
            const color = theme === this.THEMES.DARK ? '#1e293b' : '#ffffff';
            document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
                meta.content = color;
            });
        },

        /**
         * Set theme
         * @param {string} theme - 'light' or 'dark'
         * @param {boolean} persist - Whether to save to localStorage
         */
        setTheme(theme, persist = true) {
            if (!this.isValidTheme(theme)) {
                P1Logger.warn('Invalid theme:', theme);
                return;
            }

            const oldTheme = this.getCurrentTheme();
            this.applyTheme(theme);

            if (persist) {
                try {
                    localStorage.setItem(this.STORAGE_KEY, theme);
                } catch (e) {
                    // Storage unavailable (private mode): the choice lasts for this page only
                }
            }

            this.dispatchThemeChangeEvent(theme, oldTheme);
            P1Logger.log('Theme changed:', oldTheme, '->', theme);
        },

        /**
         * Toggle between light and dark theme
         */
        toggleTheme() {
            const newTheme = this.getCurrentTheme() === this.THEMES.LIGHT
                ? this.THEMES.DARK
                : this.THEMES.LIGHT;

            this.setTheme(newTheme, true);
        },

        /**
         * Set up event listeners
         */
        setupEventListeners() {
            // Theme toggle button
            const toggleButton = document.getElementById('theme-toggle');
            if (toggleButton) {
                toggleButton.addEventListener('click', () => {
                    this.toggleTheme();
                });
            }
            
            // Keyboard shortcut (Ctrl/Cmd + Shift + L for Light/Dark)
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
                    e.preventDefault();
                    this.toggleTheme();
                }
            });
        },
        
        /**
         * Watch for system theme changes
         */
        watchSystemTheme() {
            if (!window.matchMedia) return;
            
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            // Listen for changes
            darkModeQuery.addEventListener('change', (e) => {
                // Only auto-switch if user hasn't manually set a preference
                const hasManualPreference = this.getStoredTheme();
                
                if (!hasManualPreference) {
                    const newTheme = e.matches ? this.THEMES.DARK : this.THEMES.LIGHT;
                    const oldTheme = newTheme === this.THEMES.DARK ? this.THEMES.LIGHT : this.THEMES.DARK;
                    this.dispatchThemeChangeEvent(newTheme, oldTheme);
                    P1Logger.log('System theme changed, following:', newTheme);
                }
            });
        },
        
        /**
         * Dispatch custom theme change event
         */
        dispatchThemeChangeEvent(newTheme, oldTheme) {
            const event = new CustomEvent('themechange', {
                detail: {
                    theme: newTheme,
                    oldTheme: oldTheme
                }
            });
            
            document.dispatchEvent(event);
        },
        
        /**
         * Reset theme to system preference
         */
        resetToSystem() {
            const oldTheme = this.getCurrentTheme();
            try {
                localStorage.removeItem(this.STORAGE_KEY);
            } catch (e) {
                // ignore
            }
            delete document.documentElement.dataset.theme;
            const systemTheme = this.getSystemTheme();
            this.dispatchThemeChangeEvent(systemTheme, oldTheme);
            P1Logger.log('Theme reset to system preference:', systemTheme);
        }
    };
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ThemeManager.init();
        });
    } else {
        ThemeManager.init();
    }
    
    // Expose ThemeManager globally for debugging and external use
    window.ThemeManager = ThemeManager;
    
})();