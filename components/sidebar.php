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
                    <?php echo icon('log-in', 14); ?>
                    <span>Inloggen</span>
                </a>
                <div class="sidebar-version">
                    <small>Custom UI v1.0</small>
                </div>
            </div>
        </aside>
