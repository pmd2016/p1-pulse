<?php
/**
 * Tariff overview: the cost settings stored in P1 Monitor's configuration
 * (tariffs, vastrecht, dynamic surcharges), read by
 * P1Config::getTariffOverview(). Read-only; they are changed in P1 Monitor.
 */

// "€ 0,24079"; null means the value is not configured
function tariff_eur($value, $decimals) {
    if ($value === null) {
        return 'niet ingesteld';
    }
    return '€ ' . number_format($value, $decimals, ',', '.');
}

/**
 * @param array $t          P1Config::getTariffOverview()
 * @param array $visibility P1Config::getVisibility(); hidden utilities are left out
 */
function tariff_overview(array $t, array $visibility = []) {
    $e = $t['electricity'];
    $dynamic = $t['dynamic'];

    // [title, icon, tone, [[label, value, unit, decimals], ...]]
    $groups = [];

    $rows = [
        ['Verbruik piek/dag', $e['import_high'], 'kWh', 5],
        ['Verbruik dal/nacht', $e['import_low'], 'kWh', 5],
        ['Teruglevering piek/dag', $e['export_high'], 'kWh', 5],
        ['Teruglevering dal/nacht', $e['export_low'], 'kWh', 5],
    ];
    if ($dynamic) {
        $rows[] = ['Opslag dynamisch', $e['surcharge'], 'kWh', 5];
    }
    $rows[] = ['Vastrecht', $e['fixed'], 'maand', 2];
    $groups[] = ['Elektriciteit', 'zap', 'is-import', $rows];

    if (empty($visibility['hide_gas'])) {
        $rows = [['Verbruik', $t['gas']['price'], 'm³', 5]];
        if ($dynamic) {
            $rows[] = ['Opslag dynamisch', $t['gas']['surcharge'], 'm³', 5];
        }
        $rows[] = ['Vastrecht', $t['gas']['fixed'], 'maand', 2];
        $groups[] = ['Gas', 'flame', 'is-gas', $rows];
    }

    if (empty($visibility['hide_water'])) {
        $groups[] = ['Water', 'droplet', 'is-water', [
            ['Verbruik', $t['water']['price'], 'm³', 5],
            ['Vastrecht', $t['water']['fixed'], 'maand', 2],
        ]];
    }

    // Monthly fixed charges of the groups shown; null when none is configured
    $fixed = array_filter([
        $e['fixed'],
        empty($visibility['hide_gas']) ? $t['gas']['fixed'] : null,
        empty($visibility['hide_water']) ? $t['water']['fixed'] : null,
    ], fn($v) => $v !== null);
    $fixedMonth = $fixed ? array_sum($fixed) : null;
    ?>
                <div class="card tariff-card">
                    <div class="tariff-header">
                        <h3 class="chart-title">Tarieven</h3>
                        <span class="tariff-mode"><?php echo $dynamic ? 'Dynamische tarieven' : 'Vaste tarieven'; ?></span>
                    </div>
                    <div class="tariff-groups">
                        <?php foreach ($groups as [$title, $iconName, $tone, $rows]): ?>
                        <section class="tariff-group <?php echo $tone; ?>">
                            <h4 class="tariff-group-title">
                                <span class="kpi-icon"><?php echo icon($iconName, 16); ?></span>
                                <?php echo htmlspecialchars($title); ?>
                            </h4>
                            <dl class="tariff-list">
                                <?php foreach ($rows as [$label, $value, $unit, $decimals]): ?>
                                <div class="tariff-row<?php echo $value === null ? ' is-unset' : ''; ?>">
                                    <dt><?php echo htmlspecialchars($label); ?></dt>
                                    <dd class="tabular"><?php echo tariff_eur($value, $decimals); ?><?php if ($value !== null): ?><span class="tariff-unit"> / <?php echo $unit; ?></span><?php endif; ?></dd>
                                </div>
                                <?php endforeach; ?>
                            </dl>
                        </section>
                        <?php endforeach; ?>
                    </div>
                    <div class="tariff-footer">
                        <div class="tariff-total">
                            <span>Vastrecht totaal</span>
                            <span class="tabular">
                                <?php echo tariff_eur($fixedMonth, 2); ?><?php if ($fixedMonth !== null): ?><span class="tariff-unit"> / maand</span>
                                · <?php echo tariff_eur($fixedMonth * 12, 2); ?><span class="tariff-unit"> / jaar</span><?php endif; ?>
                            </span>
                        </div>
                        <p class="tariff-note">
                            <?php if ($dynamic): ?>
                            Bij dynamische tarieven rekent P1 Monitor met de uurprijzen plus de opslag; de vaste tarieven gelden dan niet.
                            <?php endif; ?>
                            Ingesteld in P1 Monitor. De kosten hierboven zijn exclusief vastrecht.
                        </p>
                    </div>
                </div>
    <?php
}
