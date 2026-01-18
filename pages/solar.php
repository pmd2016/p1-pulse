<!-- Main content area -->
        <main class="main-content">
            <div class="page-header">
                <h2 class="page-title">Zonnepanelen</h2>
            </div>
            
            <div class="content-wrapper">
                <!-- Error container -->
                <div id="error-container"></div>
                
                <!-- Period selector tabs -->
                <div class="period-tabs">
                    <button class="period-tab active" data-period="hours">
                        <span class="tab-icon">🕐</span>
                        <span class="tab-label">Uren</span>
                    </button>
                    <button class="period-tab" data-period="days">
                        <span class="tab-icon">📅</span>
                        <span class="tab-label">Dagen</span>
                    </button>
                    <button class="period-tab" data-period="months">
                        <span class="tab-icon">📆</span>
                        <span class="tab-label">Maanden</span>
                    </button>
                    <button class="period-tab" data-period="years">
                        <span class="tab-icon">📈</span>
                        <span class="tab-label">Jaren</span>
                    </button>
                </div>
                
                <!-- Statistics cards -->
                <div class="stats-section">
                    <div class="stats-grid" id="solar-stats">
                        <div class="stat-card production">
                            <div class="stat-icon">☀️</div>
                            <div class="stat-content">
                                <div class="stat-label">Huidig Vermogen</div>
                                <div class="stat-value" id="stat-current-power">-- W</div>
                                <div class="stat-subtitle">Actuele productie</div>
                            </div>
                        </div>
                        
                        <div class="stat-card energy">
                            <div class="stat-icon">⚡</div>
                            <div class="stat-content">
                                <div class="stat-label">Totaal Opgewekt</div>
                                <div class="stat-value" id="stat-total-energy">-- kWh</div>
                                <div class="stat-subtitle" id="stat-energy-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card peak">
                            <div class="stat-icon">🔼</div>
                            <div class="stat-content">
                                <div class="stat-label">Piek Vermogen</div>
                                <div class="stat-value" id="stat-peak-power">-- W</div>
                                <div class="stat-subtitle" id="stat-peak-time">--:--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card capacity">
                            <div class="stat-icon">📊</div>
                            <div class="stat-content">
                                <div class="stat-label">Capaciteitsfactor</div>
                                <div class="stat-value" id="stat-capacity-factor">--%</div>
                                <div class="stat-subtitle" id="stat-capacity-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card sunlight">
                            <div class="stat-icon">🌤️</div>
                            <div class="stat-content">
                                <div class="stat-label">Zonuren</div>
                                <div class="stat-value" id="stat-sunlight-hours">-- uur</div>
                                <div class="stat-subtitle">Productieve uren</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Chart controls -->
                <div class="chart-controls-section">
                    <div class="chart-controls">
                        <div class="control-group">
                            <label class="control-label">Zoom:</label>
                            <div class="button-group" id="zoom-buttons-solar">
                                <button class="control-button active" data-zoom="24">24 uur</button>
                                <button class="control-button" data-zoom="48">48 uur</button>
                                <button class="control-button" data-zoom="72">72 uur</button>
                            </div>
                        </div>
                        
                        <div class="control-group">
                            <label class="control-label">Toon:</label>
                            <div class="toggle-group">
                                <label class="toggle-switch">
                                    <input type="checkbox" id="toggle-solar-smoothed" checked>
                                    <span class="toggle-slider"></span>
                                    <span class="toggle-label">Glad gemiddelde</span>
                                </label>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="toggle-solar-temp">
                                    <span class="toggle-slider"></span>
                                    <span class="toggle-label">Temperatuur</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Main chart -->
                <div class="chart-section">
                    <div class="card chart-card">
                        <div class="chart-header">
                            <h3 class="chart-title">Zonne-energie Productie</h3>
                            <div class="chart-legend">
                                <span class="legend-item production">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Productie (kWh)</span>
                                </span>
                                <span class="legend-item power">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Vermogen (W)</span>
                                </span>
                                <span class="legend-item temp-max" id="legend-temp-max" style="display: none;">
                                    <span class="legend-color" style="background: #ef4444; border-style: dashed;"></span>
                                    <span class="legend-text">Temp Max</span>
                                </span>
                                <span class="legend-item temp-avg" id="legend-temp-avg" style="display: none;">
                                    <span class="legend-color" style="background: #f59e0b;"></span>
                                    <span class="legend-text">Temp Gem</span>
                                </span>
                                <span class="legend-item temp-min" id="legend-temp-min" style="display: none;">
                                    <span class="legend-color" style="background: #3b82f6; border-style: dashed;"></span>
                                    <span class="legend-text">Temp Min</span>
                                </span>
                            </div>
                        </div>
                        <div class="chart-container-large">
                            <canvas id="solar-chart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </main>