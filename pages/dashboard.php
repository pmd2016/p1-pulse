        <!-- Main content area -->
        <main class="main-content">
            <div class="page-header">
                <h2 class="page-title">Dashboard</h2>
                <div class="update-timer">
                    <span id="timer-text">Laden...</span>
                </div>
            </div>
            
            <div class="content-wrapper">
                <!-- Error/Status container -->
                <div id="error-container"></div>
                
                <!-- Loading state (hidden after first load) -->
                <div id="loading-container" class="loading" style="display: none;">
                    <span style="font-size: 2rem;">⚡</span>
                    <p>P1 Monitor data laden...</p>
                </div>
                
<!-- Peak Information Section -->
                <?php if (!$visibility['hide_peak_kw']): ?>
                <div class="peak-info-section">
                    <div class="card">
                        <div class="card-header">
                            <div class="card-icon" style="background-color: rgba(139, 92, 246, 0.1); color: #8b5cf6;">📊</div>
                            <div>
                                <div class="card-title">Piekvermogens Vandaag</div>
                                <div class="card-subtitle">Maximale en minimale belasting</div>
                            </div>
                        </div>
                        
                        <div class="peak-grid">
                            <div class="peak-item">
                                <div class="peak-label">Hoogste Verbruik</div>
                                <div class="peak-value consumption" id="peak-consumption">-- kW</div>
                                <div class="peak-time" id="peak-consumption-time">--:--:--</div>
                            </div>
                            <div class="peak-item">
                                <div class="peak-label">Laagste Verbruik</div>
                                <div class="peak-value consumption" id="low-consumption">-- kW</div>
                                <div class="peak-time" id="low-consumption-time">--:--:--</div>
                            </div>
                            <div class="peak-item">
                                <div class="peak-label">Hoogste Productie</div>
                                <div class="peak-value production" id="peak-production">-- kW</div>
                                <div class="peak-time" id="peak-production-time">--:--:--</div>
                            </div>
                            <div class="peak-item">
                                <div class="peak-label">Laagste Productie</div>
                                <div class="peak-value production" id="low-production">-- kW</div>
                                <div class="peak-time" id="low-production-time">--:--:--</div>
                            </div>
                        </div>
                    </div>
                </div>
                <?php endif; ?>
                
                <!-- Main Dashboard Grid -->
                <div class="dashboard-grid">
                    
                    <!-- Consumption Card -->
                    <div class="card consumption-card">
                        <div class="card-header">
                            <div class="card-icon consumption">⚡</div>
                            <div>
                                <div class="card-title">Verbruik</div>
                                <div class="card-subtitle">Elektriciteit</div>
                            </div>
                        </div>
                        
                        <div class="gauge-container">
                            <canvas id="gauge-consumption" width="200" height="200"></canvas>
                            <div class="gauge-value">
                                <span class="gauge-number" id="current-consumption">0.000</span>
                                <span class="gauge-unit">kW</span>
                            </div>
                        </div>
                        
                        <div class="stats-grid">
                            <div class="stat-item">
                                <div class="stat-label">Piek Totaal</div>
                                <div class="stat-value consumption" id="consumption-peak-total">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Dal Totaal</div>
                                <div class="stat-value consumption" id="consumption-offpeak-total">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Piek Vandaag</div>
                                <div class="stat-value consumption" id="consumption-peak-day">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Dal Vandaag</div>
                                <div class="stat-value consumption" id="consumption-offpeak-day">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Totaal Vandaag</div>
                                <div class="stat-value consumption" id="consumption-total-day">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Kosten Vandaag</div>
                                <div class="stat-value consumption" id="consumption-cost">€ 0.00</div>
                            </div>
                        </div>
                        
                        <!-- Phase Information -->
                        <div id="phase-consumption-section" style="display: none;">
                            <div class="phase-divider"></div>
                            <div class="phase-header">Fase Verdeling</div>
                            <div class="phase-bars" id="phase-consumption-bars"></div>
                        </div>
                    </div>
                    
                    <!-- Production Card -->
                    <div class="card production-card">
                        <div class="card-header">
                            <div class="card-icon production">☀️</div>
                            <div>
                                <div class="card-title">Teruglevering</div>
                                <div class="card-subtitle">Zonnepanelen</div>
                            </div>
                        </div>
                        
                        <div class="gauge-container">
                            <canvas id="gauge-production" width="200" height="200"></canvas>
                            <div class="gauge-value">
                                <span class="gauge-number" id="current-production">0.000</span>
                                <span class="gauge-unit">kW</span>
                            </div>
                        </div>
                        
                        <div class="stats-grid">
                            <div class="stat-item">
                                <div class="stat-label">Piek Totaal</div>
                                <div class="stat-value production" id="production-peak-total">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Dal Totaal</div>
                                <div class="stat-value production" id="production-offpeak-total">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Piek Vandaag</div>
                                <div class="stat-value production" id="production-peak-day">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Dal Vandaag</div>
                                <div class="stat-value production" id="production-offpeak-day">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Totaal Vandaag</div>
                                <div class="stat-value production" id="production-total-day">0.000 kWh</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Opbrengst Vandaag</div>
                                <div class="stat-value production" id="production-revenue">€ 0.00</div>
                            </div>
                        </div>
                        
                        <!-- Phase Information -->
                        <div id="phase-production-section" style="display: none;">
                            <div class="phase-divider"></div>
                            <div class="phase-header">Fase Verdeling</div>
                            <div class="phase-bars" id="phase-production-bars"></div>
                        </div>
                    </div>
                    
<!-- Gas Card -->
                    <?php if (!$visibility['hide_gas']): ?>
                    <div class="card gas-card">
                        <div class="card-header">
                            <div class="card-icon gas">🔥</div>
                            <div>
                                <div class="card-title">Gas</div>
                                <div class="card-subtitle">Verbruik</div>
                            </div>
                        </div>
                        
                        <div class="gauge-container">
                            <canvas id="gauge-gas" width="200" height="200"></canvas>
                            <div class="gauge-value">
                                <span class="gauge-number" id="current-gas-rate">0.00</span>
                                <span class="gauge-unit">m³/uur</span>
                            </div>
                        </div>
                        
                        <div class="stats-grid">
                            <div class="stat-item">
                                <div class="stat-label">Totaal</div>
                                <div class="stat-value gas" id="gas-total">0.000 m³</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Vandaag</div>
                                <div class="stat-value gas" id="gas-day">0.000 m³</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Gem. per uur</div>
                                <div class="stat-value gas" id="gas-per-hour">0.00 m³/u</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Status</div>
                                <div class="stat-value" id="gas-status">Actief</div>
                            </div>
                        </div>
                    </div>
                    <?php endif; ?>
                    
                    <!-- Water Card -->
                    <?php if (!$visibility['hide_water']): ?>
                    <div class="card water-card">
                        <div class="card-header">
                            <div class="card-icon water">💧</div>
                            <div>
                                <div class="card-title">Water</div>
                                <div class="card-subtitle">Verbruik</div>
                            </div>
                        </div>
                        
                        <div class="large-value-container">
                            <div class="large-value water" id="water-current">0.000</div>
                            <div class="large-value-unit">m³ totaal</div>
                        </div>
                        
                        <div class="stats-grid">
                            <div class="stat-item">
                                <div class="stat-label">Vandaag</div>
                                <div class="stat-value water" id="water-day">0.0 liter</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Status</div>
                                <div class="stat-value" id="water-status">Actief</div>
                            </div>
                        </div>
                    </div>
                    <?php endif; ?>
                </div>
                
                <!-- Charts Section -->
                <div class="charts-section">
                    <div class="card chart-card">
                        <div class="card-header">
                            <div class="card-icon" style="background-color: rgba(245, 158, 11, 0.1); color: #f59e0b;">📈</div>
                            <div>
                                <div class="card-title">Realtime Verbruik</div>
                                <div class="card-subtitle">Laatste 10 minuten</div>
                            </div>
                        </div>
                        <div class="chart-container">
                            <canvas id="chart-consumption"></canvas>
                        </div>
                    </div>
                    
                    <div class="card chart-card">
                        <div class="card-header">
                            <div class="card-icon" style="background-color: rgba(16, 185, 129, 0.1); color: #10b981;">📈</div>
                            <div>
                                <div class="card-title">Realtime Productie</div>
                                <div class="card-subtitle">Laatste 10 minuten</div>
                            </div>
                        </div>
                        <div class="chart-container">
                            <canvas id="chart-production"></canvas>
                        </div>
                    </div>
                </div>
                
            </div>
        </main>
        
        <script>
            // Initialize dashboard when page loads
            if (typeof DashboardManager !== 'undefined') {
                DashboardManager.init();
            }
        </script>