<!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
            <nav class="sidebar-nav" aria-label="Hoofdmenu">
                <?php foreach (nav_items($visibility) as $item): ?>
                <a href="?page=<?php echo $item['key']; ?>" <?php echo nav_link_attrs($item['key'], $currentPage, 'nav-item'); ?>>
                    <span class="nav-icon"><?php echo icon($item['icon'], 22); ?></span>
                    <span class="nav-label"><?php echo $item['label']; ?></span>
                </a>
                <?php endforeach; ?>
            </nav>

            <div class="sidebar-footer">
                <a href="/login.php" class="sidebar-login-link">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
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
