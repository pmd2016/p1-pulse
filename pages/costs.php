<!-- Main content area -->
        <main class="main-content">
            <div class="page-header">
                <h2 class="page-title">Kosten</h2>
            </div>

            <div class="content-wrapper">
<?php
// P1 Monitor has financial data per day, month and year, not per hour
section_toolbar(['periods' => ['days', 'months', 'years']]);

kpi_strip([
    ['key' => 'now',     'label' => 'Nu',        'icon' => 'activity',  'tone' => 'is-cost'],
    ['key' => 'total',   'label' => 'Netto',     'icon' => 'euro',      'tone' => 'is-cost'],
    ['key' => 'cost',    'label' => 'Kosten',    'icon' => 'zap',       'tone' => 'is-import'],
    ['key' => 'average', 'label' => 'Gemiddeld', 'icon' => 'bar-chart', 'tone' => 'is-neutral'],
    ['key' => 'peak',    'label' => 'Duurste',   'icon' => 'arrow-up',  'tone' => 'is-neutral'],
    ['key' => 'extra',   'label' => 'Opbrengst', 'icon' => 'sun',       'tone' => 'is-export'],
]);
?>
                <div class="chart-section">
<?php
chart_card([
    'id'    => 'costs',
    'title' => 'Kosten en opbrengst',
    'aria'  => 'Grafiek van kosten per energiesoort en opbrengst van teruglevering',
]);
?>
                </div>
            </div>
        </main>
