<!-- Main content area -->
        <main class="main-content">
            <div class="page-header">
                <h2 class="page-title">Dashboard</h2>
                <div class="update-timer">
                    <span id="timer-text">Laden...</span>
                </div>
            </div>
            
            <div class="content-wrapper">
                <!-- Error container -->
                <div id="error-container"></div>
                
                <!-- Dashboard grid -->
                <div class="dashboard-grid">
                    
                    <!-- Electricity Card -->
                    <div class="dashboard-card electricity-card">
                        <div class="card-header">
                            <h3 class="card-title">
                                <span class="card-icon">⚡</span>
                                Elektriciteit
                            </h3>
                            <a href="?page=electricity" class="card-link">Details →</a>
                        </div>
                        <div class="card-body">
                            <div class="current-reading">
                                <div class="reading-value" id="elec-current-power">-- W</div>
                                <div class="reading-label">Huidig vermogen</div>
                            </div>
                            <div class="card-stats">
                                <div class="stat-item">
                                    <span class="stat-label">Verbruik vandaag:</span>
                                    <span class="stat-value consumption" id="elec-consumption-today">-- kWh</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Productie vandaag:</span>
                                    <span class="stat-value production" id="elec-production-today">-- kWh</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Netto vandaag:</span>
                                    <span class="stat-value net" id="elec-net-today">-- kWh</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <?php if (!$visibility['hide_gas']): ?>
                    <!-- Gas Card -->
                    <div class="dashboard-card gas-card">
                        <div class="card-header">
                            <h3 class="card-title">
                                <span class="card-icon">🔥</span>
                                Gas
                            </h3>
                            <a href="?page=gas" class="card-link">Details →</a>
                        </div>
                        <div class="card-body">
                            <div class="current-reading">
                                <div class="reading-value" id="gas-current-flow">-- m³/h</div>
                                <div class="reading-label">Huidig debiet</div>
                            </div>
                            <div class="card-stats">
                                <div class="stat-item">
                                    <span class="stat-label">Verbruik vandaag:</span>
                                    <span class="stat-value" id="gas-consumption-today">-- m³</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Geschatte kosten:</span>
                                    <span class="stat-value" id="gas-cost-today">€ --</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <?php endif; ?>
                    
                    <!-- Solar Card -->
                    <div class="dashboard-card solar-card">
                        <div class="card-header">
                            <h3 class="card-title">
                                <span class="card-icon">☀️</span>
                                Zonnepanelen
                            </h3>
                            <a href="?page=solar" class="card-link">Details →</a>
                        </div>
                        <div class="card-body">
                            <div class="current-reading">
                                <div class="reading-value" id="solar-current-power">-- W</div>
                                <div class="reading-label">Huidige productie</div>
                            </div>
                            <div class="card-stats">
                                <div class="stat-item">
                                    <span class="stat-label">Opgewekt vandaag:</span>
                                    <span class="stat-value production" id="solar-energy-today">-- kWh</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Piek vermogen:</span>
                                    <span class="stat-value" id="solar-peak-today">-- W</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Capaciteitsfactor:</span>
                                    <span class="stat-value" id="solar-capacity-today">--%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <?php if (!$visibility['hide_water']): ?>
                    <!-- Water Card -->
                    <div class="dashboard-card water-card">
                        <div class="card-header">
                            <h3 class="card-title">
                                <span class="card-icon">💧</span>
                                Water
                            </h3>
                            <a href="?page=water" class="card-link">Details →</a>
                        </div>
                        <div class="card-body">
                            <div class="current-reading">
                                <div class="reading-value" id="water-current-flow">-- L/min</div>
                                <div class="reading-label">Huidig debiet</div>
                            </div>
                            <div class="card-stats">
                                <div class="stat-item">
                                    <span class="stat-label">Verbruik vandaag:</span>
                                    <span class="stat-value" id="water-consumption-today">-- L</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Geschatte kosten:</span>
                                    <span class="stat-value" id="water-cost-today">€ --</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <?php endif; ?>
                    
                    <!-- Costs Summary Card -->
                    <div class="dashboard-card costs-card">
                        <div class="card-header">
                            <h3 class="card-title">
                                <span class="card-icon">💰</span>
                                Kosten Overzicht
                            </h3>
                            <a href="?page=costs" class="card-link">Details →</a>
                        </div>
                        <div class="card-body">
                            <div class="current-reading">
                                <div class="reading-value" id="costs-today-total">€ --</div>
                                <div class="reading-label">Totaal vandaag</div>
                            </div>
                            <div class="card-stats">
                                <div class="stat-item">
                                    <span class="stat-label">Elektriciteit:</span>
                                    <span class="stat-value" id="costs-elec-today">€ --</span>
                                </div>
                                <?php if (!$visibility['hide_gas']): ?>
                                <div class="stat-item">
                                    <span class="stat-label">Gas:</span>
                                    <span class="stat-value" id="costs-gas-today">€ --</span>
                                </div>
                                <?php endif; ?>
                                <div class="stat-item">
                                    <span class="stat-label">Besparing zonneenergie:</span>
                                    <span class="stat-value production" id="costs-solar-savings">€ --</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </main>