<!-- Main content area -->
        <main class="main-content">
            <div class="page-header">
                <h2 class="page-title">Gas</h2>
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
                    <div class="stats-grid" id="gas-stats">
                        <div class="stat-card consumption">
                            <div class="stat-icon">🔥</div>
                            <div class="stat-content">
                                <div class="stat-label">Totaal Verbruik</div>
                                <div class="stat-value" id="stat-total-gas">-- m³</div>
                                <div class="stat-subtitle" id="stat-gas-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card cost">
                            <div class="stat-icon">💰</div>
                            <div class="stat-content">
                                <div class="stat-label">Kosten</div>
                                <div class="stat-value" id="stat-gas-cost">€ --</div>
                                <div class="stat-subtitle" id="stat-gas-cost-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card average">
                            <div class="stat-icon">📊</div>
                            <div class="stat-content">
                                <div class="stat-label">Gemiddeld</div>
                                <div class="stat-value" id="stat-gas-average">-- m³</div>
                                <div class="stat-subtitle" id="stat-gas-average-period">per uur</div>
                            </div>
                        </div>
                        
                        <div class="stat-card flow">
                            <div class="stat-icon">💨</div>
                            <div class="stat-content">
                                <div class="stat-label">Huidige Debiet</div>
                                <div class="stat-value" id="stat-gas-flow">-- m³/h</div>
                                <div class="stat-subtitle">Actuele verbruiksnelheid</div>
                            </div>
                        </div>
                        
                        <div class="stat-card peak">
                            <div class="stat-icon">🔼</div>
                            <div class="stat-content">
                                <div class="stat-label">Piek Moment</div>
                                <div class="stat-value" id="stat-gas-peak">-- m³</div>
                                <div class="stat-subtitle" id="stat-gas-peak-time">--:--</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Chart controls -->
                <div class="chart-controls-section">
                    <div class="chart-controls">
                        <div class="control-group">
                            <label class="control-label">Zoom:</label>
                            <div class="button-group" id="zoom-buttons-gas">
                                <button class="control-button active" data-zoom="24">24 uur</button>
                                <button class="control-button" data-zoom="48">48 uur</button>
                                <button class="control-button" data-zoom="72">72 uur</button>
                            </div>
                        </div>
                        
                        <div class="control-group">
                            <label class="control-label">Toon:</label>
                            <div class="toggle-group">
                                <label class="toggle-switch">
                                    <input type="checkbox" id="toggle-gas-smoothed" checked>
                                    <span class="toggle-slider"></span>
                                    <span class="toggle-label">Glad gemiddelde</span>
                                </label>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="toggle-gas-temp" disabled>
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
                            <h3 class="chart-title">Gasverbruik</h3>
                            <div class="chart-legend">
                                <span class="legend-item consumption">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Verbruik (m³)</span>
                                </span>
                                <span class="legend-item flow">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Debiet (m³/h)</span>
                                </span>
                                <span class="legend-item cost" id="legend-gas-cost" style="display: none;">
                                    <span class="legend-color"></span>
                                    <span class="legend-text">Kosten</span>
                                </span>
                            </div>
                        </div>
                        <div class="chart-container-large">
                            <canvas id="gas-chart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </main>