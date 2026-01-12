/**
 * Sidebar Navigation System
 * Handles collapsible sidebar, mobile menu, and state persistence
 */

(function() {
    'use strict';
    
    const SidebarManager = {
        // Storage keys
        STORAGE_KEY: 'p1mon_sidebar_collapsed',
        
        // State
        isCollapsed: false,
        isMobile: false,
        isOpen: false,
        
        // Breakpoint for mobile/desktop (matches CSS)
        MOBILE_BREAKPOINT: 1024,
        
        /**
         * Initialize sidebar system
         */
        init() {
            // Check if we're on mobile
            this.checkMobile();
            
            // Restore sidebar state from localStorage
            this.restoreState();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Watch for window resize
            this.watchResize();
            
            // Hide nav items based on visibility settings
            this.applyVisibilitySettings();
            
            console.log('Sidebar system initialized');
        },
        
        /**
         * Apply visibility settings to navigation items
         */
        applyVisibilitySettings() {
            const config = window.P1MonConfig || {};
            
            // Hide water nav item if not available
            if (config.visibility && config.visibility.hide_water) {
                const navItems = document.querySelectorAll('.nav-item');
                navItems.forEach(item => {
                    const href = item.getAttribute('href');
                    if (href && href.includes('page=water')) {
                        item.style.display = 'none';
                    }
                });
            }
        },
        
        /**
         * Check if current viewport is mobile
         */
        checkMobile() {
            this.isMobile = window.innerWidth < this.MOBILE_BREAKPOINT;
            return this.isMobile;
        },
        
        /**
         * Restore sidebar state from localStorage
         */
        restoreState() {
            // Only restore collapsed state on desktop
            if (!this.isMobile) {
                const storedState = localStorage.getItem(this.STORAGE_KEY);
                
                if (storedState === 'true') {
                    this.collapse(false); // false = don't animate on initial load
                } else {
                    this.expand(false);
                }
            } else {
                // On mobile, sidebar is hidden by default
                this.close(false);
            }
        },
        
        /**
         * Save sidebar state to localStorage
         */
        saveState() {
            localStorage.setItem(this.STORAGE_KEY, this.isCollapsed);
        },
        
        /**
         * Set up event listeners
         */
        setupEventListeners() {
            // Toggle button
            const toggleButton = document.getElementById('sidebar-toggle');
            if (toggleButton) {
                toggleButton.addEventListener('click', () => {
                    this.toggle();
                });
            }
            
            // Close sidebar when clicking outside on mobile
            document.addEventListener('click', (e) => {
                if (this.isMobile && this.isOpen) {
                    const sidebar = document.querySelector('.sidebar');
                    const toggleButton = document.getElementById('sidebar-toggle');
                    
                    if (sidebar && !sidebar.contains(e.target) && 
                        toggleButton && !toggleButton.contains(e.target)) {
                        this.close();
                    }
                }
            });
            
            // Close sidebar when clicking on a nav link on mobile
            const navLinks = document.querySelectorAll('.nav-item');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    if (this.isMobile && this.isOpen) {
                        // Small delay so navigation starts before closing
                        setTimeout(() => this.close(), 100);
                    }
                });
            });
            
            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                // Escape key closes sidebar on mobile
                if (e.key === 'Escape' && this.isMobile && this.isOpen) {
                    this.close();
                }
                
                // Ctrl/Cmd + B toggles sidebar
                if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                    e.preventDefault();
                    this.toggle();
                }
            });
        },
        
        /**
         * Watch for window resize
         */
        watchResize() {
            let resizeTimeout;
            
            window.addEventListener('resize', () => {
                // Debounce resize events
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    const wasMobile = this.isMobile;
                    this.checkMobile();
                    
                    // If switching between mobile and desktop
                    if (wasMobile !== this.isMobile) {
                        this.handleBreakpointChange(wasMobile);
                    }
                }, 150);
            });
        },
        
        /**
         * Handle breakpoint changes (mobile <-> desktop)
         */
        handleBreakpointChange(wasMobile) {
            if (wasMobile && !this.isMobile) {
                // Switching from mobile to desktop
                document.body.classList.remove('sidebar-open');
                this.isOpen = false;
                this.restoreState();
                console.log('Switched to desktop view');
            } else if (!wasMobile && this.isMobile) {
                // Switching from desktop to mobile
                document.body.classList.remove('sidebar-collapsed');
                this.isCollapsed = false;
                this.close(false);
                console.log('Switched to mobile view');
            }
        },
        
        /**
         * Toggle sidebar (collapse/expand on desktop, open/close on mobile)
         */
        toggle(animate = true) {
            if (this.isMobile) {
                // On mobile: toggle open/close
                if (this.isOpen) {
                    this.close(animate);
                } else {
                    this.open(animate);
                }
            } else {
                // On desktop: toggle collapse/expand
                if (this.isCollapsed) {
                    this.expand(animate);
                } else {
                    this.collapse(animate);
                }
            }
        },
        
        /**
         * Collapse sidebar (desktop only)
         */
        collapse(animate = true) {
            if (this.isMobile) return;
            
            this.isCollapsed = true;
            
            if (!animate) {
                document.body.style.transition = 'none';
            }
            
            document.body.classList.add('sidebar-collapsed');
            
            if (!animate) {
                // Force reflow
                void document.body.offsetHeight;
                document.body.style.transition = '';
            }
            
            this.saveState();
            this.dispatchStateChangeEvent();
            
            console.log('Sidebar collapsed');
        },
        
        /**
         * Expand sidebar (desktop only)
         */
        expand(animate = true) {
            if (this.isMobile) return;
            
            this.isCollapsed = false;
            
            if (!animate) {
                document.body.style.transition = 'none';
            }
            
            document.body.classList.remove('sidebar-collapsed');
            
            if (!animate) {
                // Force reflow
                void document.body.offsetHeight;
                document.body.style.transition = '';
            }
            
            this.saveState();
            this.dispatchStateChangeEvent();
            
            console.log('Sidebar expanded');
        },
        
        /**
         * Open sidebar (mobile only)
         */
        open(animate = true) {
            if (!this.isMobile) return;
            
            this.isOpen = true;
            
            if (!animate) {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    sidebar.style.transition = 'none';
                }
            }
            
            document.body.classList.add('sidebar-open');
            
            if (!animate) {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    void sidebar.offsetHeight;
                    sidebar.style.transition = '';
                }
            }
            
            // Prevent body scroll when sidebar is open
            document.body.style.overflow = 'hidden';
            
            this.dispatchStateChangeEvent();
            
            console.log('Sidebar opened (mobile)');
        },
        
        /**
         * Close sidebar (mobile only)
         */
        close(animate = true) {
            if (!this.isMobile) return;
            
            this.isOpen = false;
            
            if (!animate) {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    sidebar.style.transition = 'none';
                }
            }
            
            document.body.classList.remove('sidebar-open');
            
            if (!animate) {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    void sidebar.offsetHeight;
                    sidebar.style.transition = '';
                }
            }
            
            // Restore body scroll
            document.body.style.overflow = '';
            
            this.dispatchStateChangeEvent();
            
            console.log('Sidebar closed (mobile)');
        },
        
        /**
         * Get current state
         */
        getState() {
            return {
                isCollapsed: this.isCollapsed,
                isOpen: this.isOpen,
                isMobile: this.isMobile
            };
        },
        
        /**
         * Dispatch custom state change event
         */
        dispatchStateChangeEvent() {
            const event = new CustomEvent('sidebarchange', {
                detail: this.getState()
            });
            
            document.dispatchEvent(event);
        },
        
        /**
         * Highlight active page in navigation
         */
        updateActiveNavItem(page) {
            const navItems = document.querySelectorAll('.nav-item');
            
            navItems.forEach(item => {
                const href = item.getAttribute('href');
                const itemPage = href ? href.split('page=')[1] : '';
                
                if (itemPage === page) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            
            console.log('Active nav item updated:', page);
        },
        
        /**
         * Add navigation item programmatically
         */
        addNavItem(config) {
            const nav = document.querySelector('.sidebar-nav');
            if (!nav) return;
            
            const item = document.createElement('a');
            item.href = config.href || '#';
            item.className = 'nav-item';
            if (config.active) item.classList.add('active');
            
            item.innerHTML = `
                <span class="nav-icon">${config.icon || '📄'}</span>
                <span class="nav-label">${config.label || 'Item'}</span>
            `;
            
            nav.appendChild(item);
            
            // Add click handler for mobile
            item.addEventListener('click', () => {
                if (this.isMobile && this.isOpen) {
                    setTimeout(() => this.close(), 100);
                }
            });
            
            return item;
        }
    };
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            SidebarManager.init();
        });
    } else {
        SidebarManager.init();
    }
    
    // Expose SidebarManager globally
    window.SidebarManager = SidebarManager;
    
})();