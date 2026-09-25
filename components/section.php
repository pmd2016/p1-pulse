<?php
/**
 * Building blocks for section pages (Elektriciteit, Gas, Zon, ...)
 *
 * Every section page is the same three parts, in this order:
 *   section_toolbar()  period tabs, back/forward, range, overlays
 *   kpi_strip()        the KPI cards, in the fixed order
 *                      Nu, Totaal, Kosten, Gemiddeld, Piek, one extra
 *   chart_card()       chart with legend and loading / empty / error states
 *
 * The markup is filled and driven by assets/js/section.js (P1Section).
 */

/**
 * @param array $opts ['temperature' => bool]  show the temperature toggle
 */
function section_toolbar(array $opts = []) {
    $periods = [
        'hours'  => ['Uren', 'clock'],
        'days'   => ['Dagen', 'calendar'],
        'months' => ['Maanden', 'calendar-range'],
        'years'  => ['Jaren', 'trending-up'],
    ];
    ?>
                <div class="section-toolbar" data-section-toolbar>
                    <div class="period-tabs" role="tablist" aria-label="Periode">
                        <?php foreach ($periods as $key => [$label, $iconName]): ?>
                        <button type="button" class="period-tab" role="tab" data-period="<?php echo $key; ?>" aria-selected="false">
                            <span class="tab-icon"><?php echo icon($iconName, 16); ?></span>
                            <span class="tab-label"><?php echo $label; ?></span>
                        </button>
                        <?php endforeach; ?>
                    </div>

                    <div class="toolbar-row">
                        <div class="period-nav">
                            <button type="button" class="icon-button" data-nav="prev" aria-label="Vorige periode" title="Vorige periode">
                                <?php echo icon('chevron-left', 20); ?>
                            </button>
                            <div class="period-label" data-period-label aria-live="polite">&nbsp;</div>
                            <button type="button" class="icon-button" data-nav="next" aria-label="Volgende periode" title="Volgende periode" disabled>
                                <?php echo icon('chevron-right', 20); ?>
                            </button>
                        </div>

                        <div class="toolbar-controls">
                            <label class="sr-only" for="range-select">Bereik</label>
                            <select id="range-select" class="range-select" data-range-select></select>
                            <div class="button-group range-buttons" data-range-buttons role="group" aria-label="Bereik"></div>

                            <?php if (!empty($opts['temperature'])): ?>
                            <button type="button" class="chip-toggle" data-toggle="temperature" aria-pressed="false" title="Temperatuur tonen">
                                <?php echo icon('thermometer', 16); ?>
                                <span class="chip-label">Temperatuur</span>
                            </button>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
    <?php
}

/**
 * @param array $kpis list of ['key', 'label', 'icon', 'tone']
 *                    tone is a series helper class such as 'is-import'
 * @param string $modifier extra class, e.g. 'is-now' for the dashboard's
 *                    row of equal live tiles
 */
function kpi_strip(array $kpis, $modifier = '') {
    ?>
                <div class="kpi-strip <?php echo htmlspecialchars($modifier); ?>">
                    <?php foreach ($kpis as $kpi): ?>
                    <div class="kpi-card <?php echo htmlspecialchars($kpi['tone'] ?? 'is-neutral'); ?>" data-kpi="<?php echo htmlspecialchars($kpi['key']); ?>">
                        <div class="kpi-head">
                            <span class="kpi-icon"><?php echo icon($kpi['icon'], 16); ?></span>
                            <span class="kpi-label"><?php echo htmlspecialchars($kpi['label']); ?></span>
                        </div>
                        <div class="kpi-value">--</div>
                        <div class="kpi-foot">
                            <span class="kpi-delta" hidden></span>
                            <span class="kpi-sub">&nbsp;</span>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
    <?php
}

/**
 * @param array $opts ['id' => 'gas', 'title' => 'Gasverbruik', 'aria' => 'Grafiek van ...']
 */
function chart_card(array $opts) {
    $id = htmlspecialchars($opts['id']);
    ?>
                <div class="card chart-card" data-chart-card data-state="loading">
                    <div class="chart-header">
                        <h3 class="chart-title"><?php echo htmlspecialchars($opts['title']); ?></h3>
                        <div class="chart-legend" id="<?php echo $id; ?>-legend" aria-label="Reeksen tonen of verbergen"></div>
                    </div>
                    <div class="chart-body">
                        <div class="chart-container-large">
                            <canvas id="<?php echo $id; ?>-chart" role="img" aria-label="<?php echo htmlspecialchars($opts['aria']); ?>"></canvas>
                        </div>
                        <div class="chart-state chart-state-loading" aria-hidden="true">
                            <div class="skeleton-bars"><?php for ($i = 0; $i < 12; $i++): ?><span></span><?php endfor; ?></div>
                        </div>
                        <div class="chart-state chart-state-empty">
                            <?php echo icon('inbox', 28); ?>
                            <p>Geen data voor deze periode</p>
                        </div>
                        <div class="chart-state chart-state-error" role="alert">
                            <?php echo icon('alert', 28); ?>
                            <p data-error-text>Fout bij ophalen data</p>
                            <button type="button" class="button" data-retry>
                                <?php echo icon('refresh', 16); ?>
                                <span>Opnieuw proberen</span>
                            </button>
                        </div>
                    </div>
                </div>
    <?php
}
