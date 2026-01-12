# P1 Monitor Custom UI - AI Coding Guidelines

## Architecture Overview
This is a custom web interface for P1 Monitor, a system that monitors energy data from Dutch smart meters (P1 port). The application fetches real-time data from P1 Monitor's API endpoints and displays it in a responsive dashboard.

**Key Components:**
- `p1mon.php`: Main entry point that routes to pages based on `?page=` URL parameter
- `config.php`: Central configuration with `P1Config` class for user prefs and P1 Monitor integration
- `pages/`: Page templates (dashboard.php, electricity.php, etc.) with conditional rendering
- `components/`: Reusable PHP includes (header.php, sidebar.php, footer.php)
- `assets/js/`: Modular JavaScript for API calls, charts, and page-specific logic
- `assets/css/`: Organized stylesheets (variables.css for theming, components.css, etc.)

**Data Flow:**
1. PHP renders initial HTML with config passed via `window.P1MonConfig`
2. JavaScript fetches data from `/api/*` endpoints every 10s (or 1s in fast mode)
3. DOM updates with real-time data, charts redraw automatically
4. User preferences stored in PHP sessions

## Coding Patterns

### PHP Structure
- Use `extract($data)` in included files to access variables from `renderPage()`
- Sanitize URL parameters: `preg_replace('/[^a-z0-9_]/', '', strtolower($_GET['page']))`
- Check page validity against `$validPages` array before including
- Integrate with P1 Monitor via `config_read($key)` for settings like visibility flags

### JavaScript Modules
- Wrap code in IIFE: `(function() { 'use strict'; const Module = { ... }; })();`
- Use `window.P1MonConfig` for PHP-passed configuration
- Implement caching in API calls (5-second duration) to reduce server load
- Handle connection failures with retry logic and user notifications

### Styling Approach
- Use CSS custom properties in `variables.css` for theming (e.g., `--primary-color`, `--background-color`)
- Apply themes via body classes: `<body class="dark-theme">`
- Organize CSS by purpose: base.css (resets), layout.css (grid/flex), components.css (widgets)

### Page Development Workflow
1. Add page name to `$validPages` in `p1mon.php`
2. Create `pages/newpage.php` with HTML structure and PHP conditionals
3. Add navigation link in `components/sidebar.php`
4. Create `assets/js/newpage.js` for page-specific logic
5. Include JS conditionally in `footer.php`: `<?php if ($currentPage === 'newpage'): ?>`

### API Integration
- Fetch from P1 Monitor endpoints: `/api/electricity`, `/api/gas`, `/api/water`, `/api/solar`, `/api/weather`
- Use `P1API.fetch()` wrapper for error handling and connection monitoring
- Respect visibility settings from P1 Monitor config (e.g., hide gas/water utilities)

### Deployment
- No build process required - copy files directly to web server `/custom/` directory
- Ensure P1 Monitor's `util/p1mon-util.php` is accessible for `config_read()` function
- Set permissions: `chmod 755` on directories, `644` on files

## Key Files to Reference
- `config.php`: P1Config class and renderPage() function
- `assets/js/api.js`: API wrapper with caching and error handling
- `pages/dashboard.php`: Example of data display with conditional sections
- `pages/electricity.php`: Electricity page with chart integration
- `pages/gas.php`: Gas page with utility-specific logic
- `assets/css/variables.css`: Theming variables and color scheme