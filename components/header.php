<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>P1 Monitor - <?php echo ucfirst($currentPage ?? 'Dashboard'); ?></title>
    <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico">
    
    <?php includeCSS(); ?>
</head>
<body class="<?php echo $config['theme'] ?? 'dark'; ?>-theme" data-page="<?php echo $currentPage ?? 'dashboard'; ?>">
    
    <div class="app-container">
        <!-- Header bar -->
        <header class="app-header">
            <div class="header-left">
                <button id="sidebar-toggle" class="icon-button" aria-label="Toggle menu">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <h1 class="header-title">
                    <span class="header-icon">⚡</span>
                    P1 Monitor
                </h1>
            </div>
            
            <div class="header-center">
                <!-- Weather info -->
                <div id="weather-info" class="weather-info" style="display: none;">
                    <div class="weather-item" title="Temperatuur">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>
                        </svg>
                        <span id="weather-temp">--°C</span>
                    </div>
                    <div class="weather-item" title="Luchtvochtigheid">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                        </svg>
                        <span id="weather-humidity">--%</span>
                    </div>
                    <div class="weather-item" title="Windsnelheid">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path>
                        </svg>
                        <span id="weather-wind">-- m/s</span>
                    </div>
                    <div class="weather-item" title="Luchtdruk">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span id="weather-pressure">---- hPa</span>
                    </div>
                </div>
                
                <!-- Current time -->
                <div class="header-time">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span id="current-time">--:--</span>
                </div>
            </div>
            
            <div class="header-right">
                <?php include 'theme-toggle.php'; ?>
            </div>
        </header>