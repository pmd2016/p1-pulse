/**
 * Theme Management System
 * Handles dark/light mode switching with persistence
 */

(function() {
    'use strict';
    
    const ThemeManager = {
        // Storage keys
        STORAGE_KEY: 'p1mon_theme',
        SESSION_KEY: 'theme_preference',
        
        // Theme options
        THEMES: {
            LIGHT: 'light',
            DARK: 'dark'
        },
        
        /**
         * Initialize theme system
         */
        init() {
            // Set initial theme
            const theme = this.getStoredTheme();
            this.setTheme(theme, false);
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Listen for system theme changes
            this.watchSystemTheme();
            
            console.log('Theme system initialized:', theme);
        },
        
        /**
         * Get stored theme preference
         * Priority: localStorage > session > system preference
         */
        getStoredTheme() {
            // Check localStorage first
            const storedTheme = localStorage.getItem(this.STORAGE_KEY);
            if (storedTheme && this.isValidTheme(storedTheme)) {
                return storedTheme;
            }
            
            // Fall back to system preference
            return this.getSystemTheme();
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
         * Get current theme
         */
        getCurrentTheme() {
            if (document.body.classList.contains('dark-theme')) {
                return this.THEMES.DARK;
            }
            return this.THEMES.LIGHT;
        },
        
        /**
         * Set theme
         * @param {string} theme - 'light' or 'dark'
         * @param {boolean} persist - Whether to save to localStorage
         */
        setTheme(theme, persist = true) {
            if (!this.isValidTheme(theme)) {
                console.warn('Invalid theme:', theme);
                return;
            }
            
            const oldTheme = this.getCurrentTheme();
            
            // Remove old theme class
            document.body.classList.remove('light-theme', 'dark-theme');
            
            // Add new theme class
            document.body.classList.add(`${theme}-theme`);
            
            // Update meta theme-color for mobile browsers
            this.updateMetaThemeColor(theme);
            
            // Save to localStorage if requested
            if (persist) {
                localStorage.setItem(this.STORAGE_KEY, theme);
                
                // Also sync to server session via AJAX
                this.syncThemeToServer(theme);
            }
            
            // Dispatch custom event for other scripts to listen to
            this.dispatchThemeChangeEvent(theme, oldTheme);
            
            console.log('Theme changed:', oldTheme, '->', theme);
        },
        
        /**
         * Toggle between light and dark theme
         */
        toggleTheme() {
            const currentTheme = this.getCurrentTheme();
            const newTheme = currentTheme === this.THEMES.LIGHT 
                ? this.THEMES.DARK 
                : this.THEMES.LIGHT;
            
            this.setTheme(newTheme, true);
        },
        
        /**
         * Update meta theme-color for mobile browsers
         */
        updateMetaThemeColor(theme) {
            let metaThemeColor = document.querySelector('meta[name="theme-color"]');
            
            if (!metaThemeColor) {
                metaThemeColor = document.createElement('meta');
                metaThemeColor.name = 'theme-color';
                document.head.appendChild(metaThemeColor);
            }
            
            // Set color based on theme
            const color = theme === this.THEMES.DARK ? '#1e293b' : '#ffffff';
            metaThemeColor.content = color;
        },
        
        /**
         * Sync theme preference to server
         */
        syncThemeToServer(theme) {
            // Send AJAX request to save theme in PHP session
            fetch('?action=set_theme', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `theme=${theme}`
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('Theme synced to server');
                }
            })
            .catch(error => {
                console.warn('Failed to sync theme to server:', error);
            });
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
                const hasManualPreference = localStorage.getItem(this.STORAGE_KEY);
                
                if (!hasManualPreference) {
                    const newTheme = e.matches ? this.THEMES.DARK : this.THEMES.LIGHT;
                    this.setTheme(newTheme, false);
                    console.log('System theme changed, auto-switching to:', newTheme);
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
            localStorage.removeItem(this.STORAGE_KEY);
            const systemTheme = this.getSystemTheme();
            this.setTheme(systemTheme, false);
            console.log('Theme reset to system preference:', systemTheme);
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