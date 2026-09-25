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
                    <div class="stats-grid" id="solar-stats">
                        <div class="stat-card is-solar">
                            <div class="stat-icon"><?php echo icon('activity'); ?></div>
                            <div class="stat-content">
                                <div class="stat-label">Huidig Vermogen</div>
                                <div class="stat-value" id="stat-current-power">-- W</div>
                                <div class="stat-subtitle">Actuele productie</div>
                            </div>
                        </div>
                        
                        <div class="stat-card is-solar">
                            <div class="stat-icon"><?php echo icon('sun'); ?></div>
                            <div class="stat-content">
                                <div class="stat-label">Totaal Opgewekt</div>
                                <div class="stat-value" id="stat-total-energy">-- kWh</div>
                                <div class="stat-subtitle" id="stat-energy-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card is-neutral">
                            <div class="stat-icon"><?php echo icon('arrow-up'); ?></div>
                            <div class="stat-content">
                                <div class="stat-label">Piek Vermogen</div>
                                <div class="stat-value" id="stat-peak-power">-- W</div>
                                <div class="stat-subtitle" id="stat-peak-time">--:--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card is-neutral">
                            <div class="stat-icon"><?php echo icon('percent'); ?></div>
                            <div class="stat-content">
                                <div class="stat-label">Capaciteitsfactor</div>
                                <div class="stat-value" id="stat-capacity-factor">--%</div>
                                <div class="stat-subtitle" id="stat-capacity-period">--</div>
                            </div>
                        </div>
                        
                        <div class="stat-card is-neutral">
                            <div class="stat-icon"><?php echo icon('cloud-sun'); ?></div>
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
                            <label class="control-label">Extra:</label>
                            <div class="toggle-group">
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
                            <h3 class="chart-title">Opgewekte zonne-energie</h3>
                            <div class="chart-legend" id="solar-legend" aria-label="Reeksen tonen of verbergen"></div>
                        </div>
                        <div class="chart-container-large">
                            <canvas id="solar-chart" role="img" aria-label="Grafiek van opgewekte zonne-energie en vermogen"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </main>