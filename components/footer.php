</div> <!-- .app-container -->
    
    <?php includeJS(); ?>
    
    <?php
    // Load page-specific JavaScript
    $currentPage = $currentPage ?? 'dashboard';
    
    if ($currentPage === 'solar') {
        echo "<script src='" . CUSTOM_BASE_URL . "/assets/js/solar.js'></script>\n";
    } elseif ($currentPage === 'dashboard') {
        echo "<script src='" . CUSTOM_BASE_URL . "/assets/js/dashboard.js'></script>\n";
    } elseif ($currentPage === 'electricity') {
        echo "<script src='" . CUSTOM_BASE_URL . "/assets/js/electricity.js'></script>\n";
    } elseif ($currentPage === 'gas') {
        echo "<script src='" . CUSTOM_BASE_URL . "/assets/js/gas.js'></script>\n";
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