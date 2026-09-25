<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#1e293b" media="(prefers-color-scheme: dark)">
    <meta name="robots" content="noindex">
<?php
    $pageTitle = 'Dashboard';
    foreach (nav_items($visibility) as $navItem) {
        if ($navItem['key'] === ($currentPage ?? 'dashboard')) $pageTitle = $navItem['label'];
    }
?>
    <title><?php echo $pageTitle; ?> · P1 Monitor</title>
    <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico">
    
    <script>
        // Apply a stored theme choice before first paint (no flash).
        // Without a stored choice the CSS follows prefers-color-scheme.
        try {
            var t = localStorage.getItem('p1mon_theme');
            if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
        } catch (e) {}
    </script>
    <?php includeCSS(); ?>
</head>
<body data-page="<?php echo $currentPage ?? 'dashboard'; ?>">
    <a class="skip-link" href="#main">Naar inhoud</a>

    <div class="app-container">
        <!-- Header bar -->
        <header class="app-header">
            <div class="header-left">
                <button id="sidebar-toggle" class="icon-button" aria-label="Menu" aria-controls="sidebar" aria-expanded="false">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <h1 class="header-title">
                    <span class="header-icon"><?php echo icon('zap', 22); ?></span>
                    P1 Monitor
                </h1>
            </div>
            
            <div class="header-center">
                <!-- Solar production widget -->
                <div id="solar-widget" class="header-widget solar-widget" style="display: none;">
                    <div class="widget-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                            <circle cx="12" cy="12" r="5"></circle>
                            <line x1="12" y1="1" x2="12" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="23"></line>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                            <line x1="1" y1="12" x2="3" y2="12"></line>
                            <line x1="21" y1="12" x2="23" y2="12"></line>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                        </svg>
                    </div>
                    <div class="widget-content">
                        <div class="widget-value" id="solar-header-power">-- W</div>
                        <div class="widget-label">
                            <span id="solar-header-today">-- kWh</span> vandaag
                        </div>
                    </div>
                </div>
                
                <!-- Weather info -->
                <div id="weather-info" class="weather-info" style="display: none;">
                    <div class="weather-item" title="Temperatuur">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>
                        </svg>
                        <span id="weather-temp">--°C</span>
                    </div>
                    <div class="weather-item" title="Luchtvochtigheid">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                        </svg>
                        <span id="weather-humidity">--%</span>
                    </div>
                    <div class="weather-item" title="Windsnelheid">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path>
                        </svg>
                        <span id="weather-wind">-- m/s</span>
                    </div>
                    <div class="weather-item" title="Luchtdruk">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span id="weather-pressure">---- hPa</span>
                    </div>
                </div>
                
                <!-- Current time -->
                <div class="header-time">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false">
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