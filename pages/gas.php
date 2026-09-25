<!-- Main content area -->
        <main class="main-content" id="main" tabindex="-1">
            <div class="page-header">
                <h2 class="page-title">Gas</h2>
            </div>

            <div class="content-wrapper">
<?php
section_toolbar(['temperature' => true]);

kpi_strip([
    ['key' => 'now',     'label' => 'Nu',         'icon' => 'activity',    'tone' => 'is-gas'],
    ['key' => 'total',   'label' => 'Verbruik',   'icon' => 'flame',       'tone' => 'is-gas'],
    ['key' => 'cost',    'label' => 'Kosten',     'icon' => 'euro',        'tone' => 'is-cost'],
    ['key' => 'average', 'label' => 'Gemiddeld',  'icon' => 'bar-chart',   'tone' => 'is-neutral'],
    ['key' => 'peak',    'label' => 'Piek',       'icon' => 'arrow-up',    'tone' => 'is-neutral'],
    ['key' => 'extra',   'label' => 'Graaddagen', 'icon' => 'thermometer', 'tone' => 'is-neutral'],
]);
?>
                <div class="chart-section">
<?php
chart_card([
    'id'    => 'gas',
    'title' => 'Gasverbruik',
    'aria'  => 'Grafiek van gasverbruik en graaddagen',
]);
?>
                </div>
            </div>
        </main>
