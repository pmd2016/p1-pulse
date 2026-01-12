<!-- Main content area -->
        <main class="main-content">
            <div class="page-header">
                <h2 class="page-title">Elektriciteit</h2>
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
                    <div class="stats-grid" id="electricity-stats">
                        <div class="stat-card consumption">
                            <div class="stat-icon">⚡</div>
                            <div class="stat-content">
                                <div class="stat-label">Totaal Verbruik</div>
                                <div class="stat-value" id="stat-total-consumption">-- kWh</div>
                                <div class="stat-subtitle" id="stat-consumption-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card production">
                            <div class="stat-icon">☀️</div>
                            <div class="stat-content">
                                <div class="stat-label">Totaal Productie</div>
                                <div class="stat-value" id="stat-total-production">-- kWh</div>
                                <div class="stat-subtitle" id="stat-production-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card net">
                            <div class="stat-icon">⚖️</div>
                            <div class="stat-content">
                                <div class="stat-label">Netto</div>
                                <div class="stat-value" id="stat-net">-- kWh</div>
                                <div class="stat-subtitle">Verbruik - Productie</div>
                            </div>
                        </div>
                        
                        <div class="stat-card cost">
                            <div class="stat-icon">💰</div>
                            <div class="stat-content">
                                <div class="stat-label">Kosten</div>
                                <div class="stat-value" id="stat-cost">€ --</div>
                                <div class="stat-subtitle" id="stat-cost-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card average">
                            <div class="stat-icon">📊</div>
                            <div class="stat-content">
                                <div class="stat-label">Gemiddeld</div>
                                <div class="stat-value" id="stat-average">-- kWh</div>
                                <div class="stat-subtitle" id="stat-average-period">per uur</div>
                            </div>
                        </div>
                        
                        <div class="stat-card peak">
                            <div class="stat-icon">🔼</div>
                            <div class="stat-content">
                                <div class="stat-label">Piek Moment</div>
                                <div class="stat-value" id="stat-peak-value">-- kWh</div>
                                <div class="stat-subtitle" id="stat-peak-time">--:--</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Chart controls -->
                <div class="chart-controls-section">
                    <div class="chart-controls">
                        <div class="control-group">
                            <label class="control-label">Zoom:</label>
                            <div class="button-group" id="zoom-buttons">
                                <!-- Zoom buttons will be dynamically updated based on period -->
                                <button class="control-button active" data-zoom="24">24 uur</button>
                                <button class="control-button" data-zoom="48">48 uur</button>
                                <button class="control-button" data-zoom="72">72 uur</button>
                            </div>
                        </div>
                        
                        <div class="control-group">
                            <label class="control-label">Toon:</label>
                            <div class="toggle-group">
                                <label class="toggle-switch">
                                    <input type="checkbox" id="toggle-net" checked>
                                    <span class="toggle-slider"></span>
                                    <span class="toggle-label">Netto lijn</span>
                                </label>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="toggle-temp" disabled>
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
                            <h3 class="chart-title">Elektriciteit Verbruik & Productie</h3>
                            <div class="chart-legend">
                                <span class="legend-item consumption">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Verbruik</span>
                                </span>
                                <span class="legend-item production">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Productie</span>
                                </span>
                                <span class="legend-item net">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Netto</span>
                                </span>
                                <span class="legend-item temp-max" id="legend-temp-max" style="display: none;">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Temp Max</span>
                                </span>
                                <span class="legend-item temp-avg" id="legend-temp-avg" style="display: none;">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Temp Gem</span>
                                </span>
                                <span class="legend-item temp-min" id="legend-temp-min" style="display: none;">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Temp Min</span>
                                </span>
                            </div>
                        </div>
                        <div class="chart-container-large">
                            <canvas id="electricity-chart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </main>