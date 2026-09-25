<!-- Main content area -->
        <main class="main-content" id="main" tabindex="-1">
            <div class="page-header">
                <h2 class="page-title">Elektriciteit</h2>
            </div>

            <div class="content-wrapper">
<?php
section_toolbar(['temperature' => true]);

kpi_strip([
    ['key' => 'now',     'label' => 'Nu',            'icon' => 'activity',  'tone' => 'is-import'],
    ['key' => 'total',   'label' => 'Verbruik',      'icon' => 'zap',       'tone' => 'is-import'],
    ['key' => 'cost',    'label' => 'Kosten',        'icon' => 'euro',      'tone' => 'is-cost'],
    ['key' => 'average', 'label' => 'Gemiddeld',     'icon' => 'bar-chart', 'tone' => 'is-neutral'],
    ['key' => 'peak',    'label' => 'Piek',          'icon' => 'arrow-up',  'tone' => 'is-neutral'],
    ['key' => 'extra',   'label' => 'Teruglevering', 'icon' => 'sun',       'tone' => 'is-export'],
]);
?>
                <div class="chart-section">
<?php
chart_card([
    'id'    => 'electricity',
    'title' => 'Verbruik & teruglevering',
    'aria'  => 'Grafiek van elektriciteitsverbruik en teruglevering',
]);
?>
                </div>
            </div>
        </main>
