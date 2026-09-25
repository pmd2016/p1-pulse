<?php
/**
 * Navigation: the one list of pages, used by the sidebar (all widths) and
 * the bottom tab bar (phones).
 */

/**
 * Pages to show, in order, honouring P1 Monitor's visibility settings.
 * @return array list of ['key', 'label', 'short', 'icon']
 */
function nav_items(array $visibility) {
    $items = [
        ['key' => 'dashboard',   'label' => 'Dashboard',     'short' => 'Dashboard', 'icon' => 'home'],
        ['key' => 'electricity', 'label' => 'Elektriciteit', 'short' => 'Stroom',    'icon' => 'zap'],
        ['key' => 'gas',         'label' => 'Gas',           'short' => 'Gas',       'icon' => 'flame'],
        ['key' => 'water',       'label' => 'Water',         'short' => 'Water',     'icon' => 'droplet'],
        ['key' => 'solar',       'label' => 'Zonnepanelen',  'short' => 'Zon',       'icon' => 'sun'],
        ['key' => 'costs',       'label' => 'Kosten',        'short' => 'Kosten',    'icon' => 'euro'],
    ];

    return array_values(array_filter($items, function ($item) use ($visibility) {
        if ($item['key'] === 'gas') return empty($visibility['hide_gas']);
        if ($item['key'] === 'water') return empty($visibility['hide_water']);
        return true;
    }));
}

/**
 * aria-current and class for a nav link
 */
function nav_link_attrs($key, $currentPage, $class) {
    $active = $key === $currentPage;
    return 'class="' . $class . ($active ? ' active' : '') . '"'
        . ($active ? ' aria-current="page"' : '');
}
