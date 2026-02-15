/**
 * Dashboard Manager
 * Handles real-time data updates for all dashboard cards
 */

(function() {
    'use strict';

    const DashboardManager = {
        updateInterval: null,
        updateTimer: null,
        countdown: 0,
        gauges: {
            elec: null,
            gas: null,
            solar: null,
            water: null
        },

        init() {
            P1Logger.log('Dashboard initialized');
            this.initializeGauges();
            this.loadAllData();
            this.setupAutoUpdate();
        },

        initializeGauges() {
            // Initialize gauge canvases
            this.gauges.elec = document.getElementById('elec-gauge');
            this.gauges.gas = document.getElementById('gas-gauge');
            this.gauges.solar = document.getElementById('solar-gauge');
            this.gauges.water = document.getElementById('water-gauge');
        },

        drawGauge(canvas, value, max, color, label) {
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            
            // Set canvas resolution
            canvas.width = width * 2;
            canvas.height = height * 2;
            ctx.scale(2, 2);
            
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 2 - 10;
            const lineWidth = 12;
            
            // Clear canvas
            ctx.clearRect(0, 0, width, height);
            
            // Draw background arc
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border-color').trim() || '#e2e8f0';
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();
            
            // Calculate angle for value
            const percentage = Math.min(Math.max(value / max, 0), 1);
            const angle = 0.75 * Math.PI + (percentage * 1.5 * Math.PI);
            
            // Draw value arc
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, angle);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();
        },

        setupAutoUpdate() {
            // Update every 10 seconds (or based on P1MonConfig)
            const interval = (window.P1MonConfig && window.P1MonConfig.updateInterval) || 10000;
            this.countdown = interval / 1000;
            
            P1Logger.log(`[Dashboard] Auto-update initialized: ${interval}ms (${this.countdown}s)`);
            
            this.updateInterval = setInterval(() => {
                P1Logger.log('[Dashboard] Auto-refresh triggered - loading all data');
                this.loadAllData();
                this.countdown = interval / 1000;
            }, interval);

            // Update countdown timer every second
            this.updateTimer = setInterval(() => {
                this.countdown--;
                const timerEl = document.getElementById('timer-text');
                if (timerEl) {
                    timerEl.textContent = `Update over ${this.countdown}s`;
                }
                if (this.countdown === 5) {
                    P1Logger.log('[Dashboard] Refresh in 5 seconds...');
                }
            }, 1000);
        },

        async loadAllData() {
            try {
                await Promise.all([
                    this.loadElectricityData(),
                    this.loadGasData(),
                    this.loadSolarData()
                ]);
                this.hideError();
            } catch (err) {
                P1Logger.error('Error loading dashboard data:', err);
                this.showError('Fout bij ophalen dashboard gegevens');
            }
        },

        async loadElectricityData() {
            try {
                // Get today's data (use hours period with 24h zoom for today)
                const today = await window.P1API.getElectricityData('hours', 24, false);
                if (today && today.chartData && today.chartData.length > 0) {
                    // Calculate totals
                    const totals = this.calculateElectricityTotals(today.chartData);
                    this.updateElement('elec-consumption-today', this.formatEnergy(totals.consumption));
                    this.updateElement('elec-production-today', this.formatEnergy(totals.production));
                    this.updateElement('elec-net-today', this.formatEnergy(totals.net));
                    
                    // Get current power from most recent data point
                    const latest = today.chartData[today.chartData.length - 1];
                    if (latest) {
                        // Calculate net power: consumption - production
                        const consumption = parseFloat(latest.consumption) || 0;
                        const production = parseFloat(latest.production) || 0;
                        const netPower = consumption - production;
                        const netWatts = netPower * 1000; // kWh to W
                        
                        this.updateElement('elec-current-power', this.formatPower(netWatts));
                        
                        // Draw gauge (max from P1MonConfig or default 10kW)
                        const maxPower = (window.P1MonConfig && window.P1MonConfig.maxConsumption) || 10;
                        const maxWatts = maxPower * 1000;
                        const gaugeValue = Math.abs(netWatts);
                        const gaugeColor = netWatts < 0 ? '#22c55e' : '#3b82f6'; // Green if producing, blue if consuming
                        this.drawGauge(this.gauges.elec, gaugeValue, maxWatts, gaugeColor, 'Elektriciteit');
                    }
                }
            } catch (err) {
                P1Logger.error('Error loading electricity data:', err);
            }
        },

        async loadGasData() {
            const gasEl = document.getElementById('gas-current-flow');
            if (!gasEl) return; // Gas is hidden in config
            
            try {
                // Get electricity data which includes gas
                const data = await window.P1API.getElectricityData('hours', 24, false);
                if (data && data.chartData && data.chartData.length > 0) {
                    // Current flow = most recent hourly delta value
                    const latest = data.chartData[data.chartData.length - 1];
                    const flow = parseFloat(latest.gas) || 0;
                    this.updateElement('gas-current-flow', this.formatNumber(flow, 3) + ' m³/h');

                    // Draw gauge (max 5 m³/h typical residential)
                    this.drawGauge(this.gauges.gas, flow, 5, '#fb923c', 'Gas');

                    // Calculate today's total
                    const gasValues = data.chartData.map(d => parseFloat(d.gas) || 0);
                    const total = this.calculateGasTotal(gasValues);
                    this.updateElement('gas-consumption-today', this.formatNumber(total, 3) + ' m³');
                    // Gas cost uses config value from config.php (default: €1.50/m³)
                    const gasCost = window.P1MonConfig?.gasCostPerM3 ?? 1.50;
                    this.updateElement('gas-cost-today', '€ ' + this.formatNumber(total * gasCost, 2));
                }
            } catch (err) {
                P1Logger.error('Error loading gas data:', err);
            }
        },

        async loadSolarData() {
            try {
                // Get current production
                const response = await fetch('/custom/api/solar.php?action=current');
                if (!response.ok) throw new Error('Solar API error');
                const current = await response.json();
                
                if (current && current.power !== undefined) {
                    const power = parseFloat(current.power) || 0;
                    this.updateElement('solar-current-power', this.formatPower(power));

                    // Draw gauge using system capacity from config.php
                    const systemCapacity = window.P1MonConfig?.systemCapacityW ?? 3780;
                    this.drawGauge(this.gauges.solar, power, systemCapacity, '#fbbf24', 'Zonneenergie');
                }

                // Get today's totals (last 24 hours, but we'll filter to today only)
                const todayResponse = await fetch('/custom/api/solar.php?period=hours&zoom=24');
                if (!todayResponse.ok) throw new Error('Solar today API error');
                const today = await todayResponse.json();
                
                if (today && today.chartData) {
                    // Get midnight of today (00:00:00) as Unix timestamp
                    const now = new Date();
                    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    const midnightTimestamp = Math.floor(todayMidnight.getTime() / 1000);
                    
                    // Filter data to only include records from today (after midnight)
                    const todayData = today.chartData.filter(point => {
                        const pointTimestamp = point.unixTimestamp || 0;
                        return pointTimestamp >= midnightTimestamp;
                    });
                    
                    // Calculate totals using today's data only
                    const totals = this.calculateSolarTotals(todayData);
                    this.updateElement('solar-energy-today', this.formatEnergy(totals.energy));
                    this.updateElement('solar-peak-today', this.formatPower(totals.peak));
                    this.updateElement('solar-capacity-today', this.formatNumber(totals.capacityFactor, 1) + '%');
                    
                    // Update costs card with solar savings (today only)
                    // Uses electricity cost from config.php
                    const electricityCost = window.P1MonConfig?.electricityCostPerKwh ?? 0.30;
                    const savings = totals.energy * electricityCost;
                    this.updateElement('costs-solar-savings', '€ ' + this.formatNumber(savings, 2));
                }
            } catch (err) {
                P1Logger.error('Error loading solar data:', err);
                // Don't show error - solar might not be available yet
                this.updateElement('solar-current-power', '-- W');
                this.updateElement('solar-energy-today', '-- kWh');
                this.updateElement('solar-peak-today', '-- W');
                this.updateElement('solar-capacity-today', '--%');
            }
        },

        calculateElectricityTotals(data) {
            let consumption = 0;
            let production = 0;
            
            data.forEach(point => {
                consumption += parseFloat(point.consumption) || 0;
                production += parseFloat(point.production) || 0;
            });
            
            return {
                consumption: consumption,
                production: production,
                net: consumption - production
            };
        },

        calculateGasTotal(values) {
            // API returns per-period deltas (CONSUMPTION_GAS_DELTA_M3), just sum them
            return values.reduce((sum, v) => sum + v, 0);
        },

        calculateSolarTotals(data) {
            let totalEnergy = 0;
            let peakPower = 0;
            
            data.forEach(point => {
                const energy = parseFloat(point.production) || 0;
                const power = parseFloat(point.powerMax) || parseFloat(point.power) || 0;
                totalEnergy += energy;
                if (power > peakPower) peakPower = power;
            });
            
            // Calculate capacity factor: (actual / theoretical) × 100
            const systemCapacityKw = (window.P1MonConfig?.systemCapacityW ?? 3780) / 1000;
            const now = new Date();
            const hoursElapsedToday = now.getHours() + (now.getMinutes() / 60);
            const theoreticalMax = systemCapacityKw * hoursElapsedToday;
            const capacityFactor = theoreticalMax > 0 ? (totalEnergy / theoreticalMax) * 100 : 0;
            
            return {
                energy: totalEnergy,
                peak: peakPower,
                capacityFactor: capacityFactor
            };
        },

        formatPower(watts) {
            const w = parseFloat(watts) || 0;
            if (w >= 1000) {
                return this.formatNumber(w / 1000, 2) + ' kW';
            }
            return Math.round(w) + ' W';
        },

        formatEnergy(kwh) {
            return this.formatNumber(kwh, 2) + ' kWh';
        },

        formatNumber(value, decimals = 2) {
            const v = parseFloat(value) || 0;
            return v.toFixed(decimals);
        },

        updateElement(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        },

        showError(msg) {
            const el = document.getElementById('error-container');
            if (!el) return;
            el.textContent = '';
            const div = document.createElement('div');
            div.className = 'error';
            div.textContent = msg;
            el.appendChild(div);
        },

        hideError() {
            const el = document.getElementById('error-container');
            if (el) el.textContent = '';
        },

        destroy() {
            if (this.updateInterval) clearInterval(this.updateInterval);
            if (this.updateTimer) clearInterval(this.updateTimer);
        }
    };

    // Auto-init when on dashboard page
    document.addEventListener('DOMContentLoaded', () => {
        if (window.P1MonConfig && window.P1MonConfig.currentPage === 'dashboard') {
            DashboardManager.init();
        }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        DashboardManager.destroy();
    });

})();