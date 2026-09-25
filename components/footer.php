</div> <!-- .app-container -->
    
    <?php includeJS(); ?>
    
    <?php
    // Page-specific scripts, relative to /assets
    $currentPage = $currentPage ?? 'dashboard';
    $chartScripts = ['vendor/chartjs/chart.umd.min.js', 'js/p1chart.js', 'js/section.js'];
    $pageScripts = [
        'dashboard'   => ['js/dashboard.js'],
        'electricity' => array_merge($chartScripts, ['js/electricity.js']),
        'gas'         => array_merge($chartScripts, ['js/gas.js']),
        'solar'       => array_merge($chartScripts, ['js/solar.js']),
    ];

    foreach ($pageScripts[$currentPage] ?? [] as $script) {
        echo "<script src='" . CUSTOM_BASE_URL . "/assets/{$script}'></script>\n";
    }
    ?>
    
    <script>
        // Pass PHP config to JavaScript
        window.P1MonConfig = {
            currentPage: '<?php echo $currentPage ?? 'dashboard'; ?>',
            isFastMode: <?php echo $isFastMode ? 'true' : 'false'; ?>,
            maxConsumption: <?php echo $maxValues['consumption']; ?>,
            maxProduction: <?php echo $maxValues['production']; ?>,
            updateInterval: <?php echo $isFastMode ? 1000 : 10000; ?>,
            visibility: <?php echo json_encode($visibility); ?>,
            // Energy configuration (configurable in config.php)
            systemCapacityW: <?php echo $energyConfig['system_capacity_w'] ?? 3780; ?>,
            electricityCostPerKwh: <?php echo $energyConfig['electricity_cost_per_kwh'] ?? 0.30; ?>,
            gasCostPerM3: <?php echo $energyConfig['gas_cost_per_m3'] ?? 1.50; ?>
        };
    </script>
</body>
</html>