<!-- Main content area -->
        <main class="main-content">
            <div class="page-header">
                <h2 class="page-title">Zonnepanelen</h2>
            </div>

            <div class="content-wrapper">
<?php
section_toolbar(['temperature' => true]);

kpi_strip([
    ['key' => 'now',     'label' => 'Nu',                'icon' => 'activity',  'tone' => 'is-solar'],
    ['key' => 'total',   'label' => 'Opgewekt',          'icon' => 'sun',       'tone' => 'is-solar'],
    ['key' => 'cost',    'label' => 'Waarde',            'icon' => 'euro',      'tone' => 'is-cost'],
    ['key' => 'average', 'label' => 'Gemiddeld',         'icon' => 'bar-chart', 'tone' => 'is-neutral'],
    ['key' => 'peak',    'label' => 'Piekvermogen',      'icon' => 'arrow-up',  'tone' => 'is-neutral'],
    ['key' => 'extra',   'label' => 'Capaciteitsfactor', 'icon' => 'percent',   'tone' => 'is-neutral'],
]);
?>
                <div class="chart-section">
<?php
chart_card([
    'id'    => 'solar',
    'title' => 'Opgewekte zonne-energie',
    'aria'  => 'Grafiek van opgewekte zonne-energie en vermogen',
]);
?>
                </div>
            </div>
        </main>
