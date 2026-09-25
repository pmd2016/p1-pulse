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
                        <span class="tab-icon"><?php echo icon('clock', 16); ?></span>
                        <span class="tab-label">Uren</span>
                    </button>
                    <button class="period-tab" data-period="days">
                        <span class="tab-icon"><?php echo icon('calendar', 16); ?></span>
                        <span class="tab-label">Dagen</span>
                    </button>
                    <button class="period-tab" data-period="months">
                        <span class="tab-icon"><?php echo icon('calendar-range', 16); ?></span>
                        <span class="tab-label">Maanden</span>
                    </button>
                    <button class="period-tab" data-period="years">
                        <span class="tab-icon"><?php echo icon('trending-up', 16); ?></span>
                        <span class="tab-label">Jaren</span>
                    </button>
                </div>
                
                <!-- Statistics cards -->
                <div class="stats-section">
                    <div class="stats-grid" id="gas-stats">
                        <div class="stat-card is-gas">
                            <div class="stat-icon"><?php echo icon('flame'); ?></div>
                            <div class="stat-content">
                                <div class="stat-label">Totaal Verbruik</div>
                                <div class="stat-value" id="stat-total-gas">-- m³</div>
                                <div class="stat-subtitle" id="stat-gas-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card is-cost">
                            <div class="stat-icon"><?php echo icon('euro'); ?></div>
                            <div class="stat-content">
                                <div class="stat-label">Kosten</div>
                                <div class="stat-value" id="stat-gas-cost">€ --</div>
                                <div class="stat-subtitle" id="stat-gas-cost-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card is-neutral">
                            <div class="stat-icon"><?php echo icon('bar-chart'); ?></div>
                            <div class="stat-content">
                                <div class="stat-label">Gemiddeld</div>
                                <div class="stat-value" id="stat-gas-average">-- m³</div>
                                <div class="stat-subtitle" id="stat-gas-average-period">per uur</div>
                            </div>
                        </div>
                        
                        <div class="stat-card is-gas">
                            <div class="stat-icon"><?php echo icon('activity'); ?></div>
                            <div class="stat-content">
                                <div class="stat-label">Huidige Debiet</div>
                                <div class="stat-value" id="stat-gas-flow">-- m³/h</div>
                                <div class="stat-subtitle">Actuele verbruiksnelheid</div>
                            </div>
                        </div>
                        
                        <div class="stat-card is-neutral">
                            <div class="stat-icon"><?php echo icon('arrow-up'); ?></div>
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
                            <label class="control-label">Extra:</label>
                            <div class="toggle-group">
                                <label class="toggle-switch">
                                    <input type="checkbox" id="toggle-gas-temp">
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
                            <div class="chart-legend" id="gas-legend" aria-label="Reeksen tonen of verbergen"></div>
                        </div>
                        <div class="chart-container-large">
                            <canvas id="gas-chart" role="img" aria-label="Grafiek van gasverbruik en graaddagen"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </main>