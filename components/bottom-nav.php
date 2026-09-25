<?php
/**
 * Bottom tab bar, phones only (hidden from 600px, see layout.css).
 * Shows the first five pages; the hamburger menu always lists all of them.
 */
$bottomNavItems = array_slice(nav_items($visibility), 0, 5);
?>
        <nav class="bottom-nav" aria-label="Snelmenu">
            <?php foreach ($bottomNavItems as $item): ?>
            <a href="?page=<?php echo $item['key']; ?>" <?php echo nav_link_attrs($item['key'], $currentPage, 'bottom-nav-item'); ?>>
                <?php echo icon($item['icon'], 22); ?>
                <span><?php echo $item['short']; ?></span>
            </a>
            <?php endforeach; ?>
        </nav>
