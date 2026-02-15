</div> <!-- .app-container -->
    
    <?php includeJS(); ?>
    
    <!-- Dashboard specific script (only loads on dashboard page) -->
    <?php if ($currentPage === 'dashboard'): ?>
    <script src="<?php echo CUSTOM_BASE_URL; ?>/assets/js/dashboard.js"></script>
    <?php endif; ?>
    
    <!-- Electricity specific script (only loads on electricity page) -->
    <?php if ($currentPage === 'electricity'): ?>
    <script src="<?php echo CUSTOM_BASE_URL; ?>/assets/js/electricity.js"></script>
    <?php endif; ?>

    <!-- Gas specific script (only loads on gas page) -->
    <?php if ($currentPage === 'gas'): ?>
    <script src="<?php echo CUSTOM_BASE_URL; ?>/assets/js/gas.js"></script>
    <?php endif; ?>
    
    <!-- Solar specific script (only loads on solar page) -->
    <?php if ($currentPage === 'solar'): ?>
    <script src="<?php echo CUSTOM_BASE_URL; ?>/assets/js/solar.js"></script>
    <?php endif; ?>

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