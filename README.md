# P1 Pulse - a custom UI for P1 Monitor

A modern, responsive web dashboard for monitoring real-time energy, gas, water, and solar data from P1 Monitor. Built with PHP, JavaScript, and a modern CSS framework for an intuitive user experience.

## 🌟 Features

- **Multi-page Dashboard**: Comprehensive views for electricity, gas, water, and solar energy monitoring
- **Real-time Data Updates**: Live consumption and production metrics with automatic refresh
- **Dark/Light Theme**: Toggle between dark and light themes for comfortable viewing
- **Responsive Design**: Mobile-friendly interface that works on all devices
- **Peak Analysis**: Daily peak consumption and production tracking
- **Weather Integration**: Display current weather conditions (temperature, humidity, wind speed)
- **Configurable UI**: Show/hide utilities based on P1 Monitor configuration
- **Phase Information**: Optional three-phase electricity monitoring
- **Cost Tracking**: View energy costs and savings
- **User Preferences**: Remember user settings (theme, sidebar state, update intervals)
- **Connection Monitoring**: Automatic detection and recovery from API failures

## 📋 Pages

- **Dashboard** - Overview of all utilities with gauges and peak information
- **Electricity** - Detailed electricity consumption and production analysis
- **Gas** - Gas consumption tracking and charts
- **Solar** - Solar production data and efficiency metrics (Solplanet Cloud integration)

### 🚧 Work in progress
- **Water** - Water usage monitoring
- **Costs** - Energy cost analysis and savings calculations

## 🛠️ Technology Stack

- **Backend**: PHP 7.4+
- **Frontend**: Vanilla JavaScript (ES6+)
- **Styling**: CSS3 with CSS Variables for theming
- **Data Visualization**: Chart.js for graphs and charts
- **API Integration**: Fetch API with built-in error handling and caching

## 📁 Project Structure

```
├── p1mon.php                    # Main entry point
├── config.php                   # Configuration and helper functions
├── api/                         # Custom API endpoints
│   └── solar.php                # Solar data API (Solplanet Cloud integration)
├── components/                  # Reusable UI components
│   ├── header.php               # Top navigation and branding
│   ├── sidebar.php              # Navigation menu
│   ├── footer.php               # Page footer
│   └── theme-toggle.php         # Theme switcher
├── data/                        # Data storage
│   └── solar.db                 # SQLite database for solar production data
├── docs/                        # Documentation
│   ├── TECHNICAL.md             # Detailed technical documentation
│   └── ...                      # Phase handover documents
├── lib/                         # PHP libraries
│   ├── SolarConfig.php          # Solplanet API configuration manager
│   └── SolplanetAPI.php         # Solplanet Cloud API client
├── pages/                       # Page templates
│   ├── dashboard.php            # Main dashboard view
│   ├── electricity.php          # Electricity details
│   ├── gas.php                  # Gas tracking
│   ├── water.php                # Water usage
│   ├── solar.php                # Solar production
│   └── costs.php                # Cost analysis
├── scripts/                     # Utility scripts (see docs/TECHNICAL.md)
│   ├── init-solar-database.php  # Initialize SQLite database
│   ├── solar-collector.php      # Data collection (for cron)
│   ├── solar-backfill.php       # Historical data import
│   └── ...                      # Additional debug/diagnostic tools
└── assets/                      # Static assets
    ├── css/                     # Stylesheets
    │   ├── variables.css        # CSS custom properties for theming
    │   ├── base.css             # Base styles and resets
    │   ├── components.css       # Component-specific styles
    │   └── layout.css           # Layout and grid system
    └── js/                      # JavaScript modules
        ├── api.js               # P1 Monitor API wrapper
        ├── charts.js            # Chart utilities
        ├── dashboard.js         # Dashboard functionality
        ├── electricity.js       # Electricity page logic
        ├── gas.js               # Gas page logic
        ├── solar.js             # Solar page logic
        ├── theme.js             # Theme switching logic
        ├── sidebar.js           # Sidebar interaction
        └── header.js            # Header functionality
```

## 🚀 Installation

### Requirements
- P1 Monitor installation (running on `/p1mon/` path)
- Apache/Nginx web server with PHP support
- PHP 7.4 or higher

### Setup Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/p1-monitor-ui.git
   cd p1-monitor-ui
   ```

2. **Copy to P1 Monitor Custom Directory**
   ```bash
   # Copy to P1 Monitor's custom directory (usually accessible at /custom/)
   cp -r * /var/www/html/custom/
   ```

3. **Set Permissions**
   ```bash
   chmod 755 /var/www/html/custom
   chmod 644 /var/www/html/custom/*.php
   chmod 644 /var/www/html/custom/assets/css/*
   chmod 644 /var/www/html/custom/assets/js/*
   ```

4. **Access the Dashboard**
   ```
   http://your-p1-monitor-ip/custom/p1mon.php
   ```

## ⚙️ Configuration

### Main Configuration (`config.php`)

The configuration file handles:
- **Session management** - User preferences and state
- **P1 Monitor integration** - Reading configuration values via `config_read()`
- **UI visibility settings** - Toggle utilities based on P1 Monitor config
- **User preferences** - Theme, sidebar state, update intervals

### User Preferences

Stored in PHP sessions with the following defaults:

```php
[
    'theme' => 'dark',              // 'dark' or 'light'
    'sidebar_collapsed' => false,   // Sidebar state
    'default_page' => 'dashboard',  // Landing page
    'update_interval' => 10         // Seconds between updates
]
```

### P1 Monitor Integration

The dashboard reads configuration from P1 Monitor's database via `config_read()`:
- **Config 52/53**: Max consumption/production for gauges
- **Config 61**: Enable three-phase information
- **Config 154**: Fast telegram mode status
- **Config 157**: Hide water utility
- **Config 158**: Hide gas utility
- **Config 206**: Hide peak kW information

## 🔌 API Integration

The dashboard communicates with P1 Monitor's API endpoints:

- `GET /api/electricity` - Current electricity data
- `GET /api/gas` - Current gas data
- `GET /api/water` - Current water data
- `GET /api/solar` - Current solar data
- `GET /api/weather` - Weather information (if available)

The API handler (`api.js`) includes:
- Automatic retry on failure
- Response caching (5-second duration)
- Connection status monitoring
- Error handling and user notifications

## 🎨 Theming

The dashboard uses CSS custom properties for easy theming:

- **Dark Theme** (default) - Optimized for night use
- **Light Theme** - Optimized for day use

Themes can be toggled via the theme button in the header. Preference is saved in user session.

### Customizing Colors

Edit `assets/css/variables.css` to customize colors:

```css
--primary-color
--secondary-color
--background-color
--surface-color
--text-color
--border-color
--success-color
--warning-color
--error-color
```

## 🔄 Real-time Updates

The dashboard automatically refreshes data at configurable intervals:
- Default: 10 seconds
- Configurable via user preferences
- Respects fast telegram mode setting from P1 Monitor
- Graceful error handling with connection status indicator

## 📊 Data Visualization

Charts are powered by Chart.js with support for:
- Line charts for time-series data
- Gauge charts for current consumption/production
- Bar charts for daily/monthly comparisons
- Real-time updates without page reload

## 🛡️ Security Features

- Page routing validation (alphanumeric only)
- Input sanitization for URL parameters
- Session-based user preferences
- X-Robots header to prevent search engine indexing
- CSRF token support (can be added)

## 🔧 Customization

### Adding a New Page

1. Create a new file in `pages/` directory
2. Add page name to `$validPages` array in `p1mon.php`
3. Create corresponding JavaScript file in `assets/js/`
4. Add navigation link in `components/sidebar.php`
5. Link JavaScript in `config.php` `includeJS()` function

### Modifying Styling

- **Global styles**: Edit `assets/css/base.css`
- **Layout**: Edit `assets/css/layout.css`
- **Components**: Edit `assets/css/components.css`
- **Colors/Variables**: Edit `assets/css/variables.css`

## 📱 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🐛 Troubleshooting

### Dashboard not loading
- Verify P1 Monitor installation
- Check web server error logs
- Ensure PHP session support is enabled
- Verify file permissions

### API data not updating
- Check P1 Monitor API availability
- Verify network connectivity
- Check browser console for errors
- Ensure `config.php` can access P1 Monitor utilities

### Theme not persisting
- Verify PHP sessions are working
- Check browser cookie settings
- Clear browser cache and retry

## 📚 Documentation

For detailed technical documentation, see [docs/TECHNICAL.md](docs/TECHNICAL.md), which includes:
- Complete API reference (P1 Monitor & custom Solar API)
- Database schema and data flow
- Solar integration setup (Solplanet Cloud)
- All utility scripts with usage examples
- JavaScript module documentation
- Known issues and troubleshooting

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Michiel Doetjes**

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests with improvements, bug fixes, or new features.

## 📞 Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Note**: This dashboard is designed to work as a custom interface for P1 Monitor. Ensure you have a working P1 Monitor installation before using this dashboard.
