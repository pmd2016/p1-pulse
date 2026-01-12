<!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
            <nav class="sidebar-nav">
                <a href="?page=dashboard" class="nav-item <?php echo ($currentPage === 'dashboard') ? 'active' : ''; ?>">
                    <span class="nav-icon">🏠</span>
                    <span class="nav-label">Dashboard</span>
                </a>
                
                <a href="?page=electricity" class="nav-item <?php echo ($currentPage === 'electricity') ? 'active' : ''; ?>">
                    <span class="nav-icon">⚡</span>
                    <span class="nav-label">Elektriciteit</span>
                </a>
                
                <?php if (!$visibility['hide_gas']): ?>
                <a href="?page=gas" class="nav-item <?php echo ($currentPage === 'gas') ? 'active' : ''; ?>">
                    <span class="nav-icon">🔥</span>
                    <span class="nav-label">Gas</span>
                </a>
                <?php endif; ?>
                
                <?php if (!$visibility['hide_water']): ?>
                <a href="?page=water" class="nav-item <?php echo ($currentPage === 'water') ? 'active' : ''; ?>">
                    <span class="nav-icon">💧</span>
                    <span class="nav-label">Water</span>
                </a>
                <?php endif; ?>
                
                <a href="?page=solar" class="nav-item <?php echo ($currentPage === 'solar') ? 'active' : ''; ?>">
                    <span class="nav-icon">☀️</span>
                    <span class="nav-label">Zonnepanelen</span>
                </a>
                
                <a href="?page=costs" class="nav-item <?php echo ($currentPage === 'costs') ? 'active' : ''; ?>">
                    <span class="nav-icon">💰</span>
                    <span class="nav-label">Kosten</span>
                </a>
            </nav>
            
            <div class="sidebar-footer">
                <a href="/login.php" class="sidebar-login-link">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                        <polyline points="10 17 15 12 10 7"></polyline>
                        <line x1="15" y1="12" x2="3" y2="12"></line>
                    </svg>
                    <span>Inloggen</span>
                </a>
                <div class="sidebar-version">
                    <small>Custom UI v1.0</small>
                </div>
            </div>
        </aside>