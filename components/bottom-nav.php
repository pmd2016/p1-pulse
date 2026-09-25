<?php
/**
 * Bottom tab bar: the only menu on phones (below 600px, see layout.css).
 * Shows every page from nav_items(): five today, six with a water meter.
 * Inloggen sits in the header on phones.
 */
?>
        <nav class="bottom-nav" aria-label="Hoofdmenu">
            <?php foreach (nav_items($visibility) as $item): ?>
            <a href="?page=<?php echo $item['key']; ?>" <?php echo nav_link_attrs($item['key'], $currentPage, 'bottom-nav-item'); ?>>
                <?php echo icon($item['icon'], 22); ?>
                <span><?php echo $item['short']; ?></span>
            </a>
            <?php endforeach; ?>
        </nav>
