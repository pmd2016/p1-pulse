<?php
/**
 * Dashboard: live values on top, then one card per utility for today.
 * Every card has the same anatomy: header, today's total with the change
 * vs yesterday, a sparkline of today by hour, and two key figures.
 */

function dashboard_card($key, $title, $icon, $link, $tone, $totalLabel, array $rows, $chart = true) {
    ?>
                    <section class="dashboard-card <?php echo $tone; ?>" aria-labelledby="card-<?php echo $key; ?>-title">
                        <div class="card-header">
                            <h3 class="card-title" id="card-<?php echo $key; ?>-title">
                                <span class="card-icon"><?php echo icon($icon, 20); ?></span>
                                <?php echo htmlspecialchars($title); ?>
                            </h3>
                            <a href="<?php echo $link; ?>" class="card-link">Details<?php echo icon('chevron-right', 16); ?></a>
                        </div>
                        <div class="card-body">
                            <div class="dash-figure" data-kpi="<?php echo $key; ?>-today">
                                <div class="kpi-value">--</div>
                                <div class="kpi-foot">
                                    <span class="kpi-delta" hidden></span>
                                    <span class="kpi-sub"><?php echo htmlspecialchars($totalLabel); ?></span>
                                </div>
                            </div>
                            <?php if ($chart): ?>
                            <div class="sparkline" data-state="loading">
                                <canvas id="<?php echo $key; ?>-spark" role="img" aria-label="<?php echo htmlspecialchars($title); ?> vandaag per uur"></canvas>
                                <div class="sparkline-axis" aria-hidden="true"><span>00:00</span><span>12:00</span><span>24:00</span></div>
                            </div>
                            <?php else: ?>
                            <div class="cost-split" id="cost-split" aria-hidden="true"></div>
                            <?php endif; ?>
                            <dl class="card-stats">
                                <?php foreach ($rows as $id => $label): ?>
                                <div class="stat-item">
                                    <dt class="stat-label"><?php echo htmlspecialchars($label); ?></dt>
                                    <dd class="stat-value" id="<?php echo $id; ?>">--</dd>
                                </div>
                                <?php endforeach; ?>
                            </dl>
                        </div>
                    </section>
    <?php
}
?>
<!-- Main content area -->
        <main class="main-content">
            <div class="page-header">
                <h2 class="page-title">Dashboard</h2>
                <div class="update-status" id="update-status" data-state="loading" aria-live="polite">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span id="update-status-text">Laden…</span>
                </div>
            </div>

            <div class="content-wrapper">
<?php
kpi_strip([
    ['key' => 'now-power',   'label' => 'Net nu',  'icon' => 'zap',         'tone' => 'is-import'],
    ['key' => 'now-solar',   'label' => 'Zon nu',  'icon' => 'sun',         'tone' => 'is-solar'],
    ['key' => 'now-weather', 'label' => 'Buiten',  'icon' => 'thermometer', 'tone' => 'is-neutral'],
], 'is-now');
?>

                <div class="dashboard-grid">
<?php
dashboard_card('elec', 'Elektriciteit', 'zap', '?page=electricity', 'is-import', 'verbruikt vandaag', [
    'elec-export-today' => 'Teruggeleverd',
    'elec-net-today'    => 'Netto',
]);

if (!$visibility['hide_gas']) {
    dashboard_card('gas', 'Gas', 'flame', '?page=gas', 'is-gas', 'verbruikt vandaag', [
        'gas-cost-today' => 'Kosten',
        'gas-last-hour'  => 'Laatste uur',
    ]);
}

dashboard_card('solar', 'Zonnepanelen', 'sun', '?page=solar', 'is-solar', 'opgewekt vandaag', [
    'solar-peak-today'     => 'Piekvermogen',
    'solar-capacity-today' => 'Capaciteitsfactor',
]);

dashboard_card('costs', 'Kosten', 'euro', '?page=costs', 'is-cost', 'totaal vandaag', array_filter([
    'costs-elec-today'  => 'Elektriciteit',
    'costs-gas-today'   => $visibility['hide_gas'] ? null : 'Gas',
    'costs-solar-today' => 'Bespaard met zon (geschat)',
]), false);
?>
                </div>
            </div>
        </main>
