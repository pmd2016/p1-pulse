# P1 Pulse - Technical Documentation

This document provides detailed technical information for developers and advanced users of P1 Pulse.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Solar Integration (Solplanet Cloud)](#solar-integration-solplanet-cloud)
- [Utility Scripts](#utility-scripts)
- [JavaScript Modules](#javascript-modules)
- [Configuration Reference](#configuration-reference)
- [Data Flow](#data-flow)
- [Known Issues](#known-issues)

---

## Architecture Overview

P1 Pulse is a PHP/JavaScript web application that provides a modern dashboard for P1 Monitor. It uses no build tools or package managers - files are served directly.

### Code Statistics

| Language   | Lines of Code | Files |
|------------|---------------|-------|
| PHP        | ~5,600        | 23    |
| JavaScript | ~4,900        | 11    |
| CSS        | ~1,900        | 4     |
| **Total**  | **~12,400**   | **38**|

### Key Design Patterns

- **MVC-like separation**: Pages as views, api.js as model, components as layout
- **Modular JavaScript**: Object-based managers with `init()` / `setupEventListeners()` pattern
- **CSS Custom Properties**: Theme variables for dark/light mode switching
- **Configuration-driven UI**: Visibility settings read from P1 Monitor config

---

## API Reference

### P1 Monitor Native API

The dashboard communicates with P1 Monitor's built-in API endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/smartmeter` | Current electricity data |
| `GET /api/v1/gas` | Current gas data |
| `GET /api/v1/water` | Current water data |
| `GET /api/v1/weather` | Weather information |

### Custom Solar API

**Base URL**: `/custom/api/solar.php`

#### Current/Realtime Data

```
GET /api/solar.php?action=current
```

Returns current power, today's energy, peak power, monthly totals, and system info.

**Response:**
```json
{
  "success": true,
  "data": {
    "current_power": 1250,
    "today_energy": 8500,
    "peak_power": 2800,
    "monthly_energy": 285000,
    "system_capacity": 3780
  }
}
```

#### Historical Data

```
GET /api/solar.php?period={period}&zoom={zoom}
```

**Parameters:**

| Period | Zoom Options | Description |
|--------|--------------|-------------|
| `hours` | 24, 48, 72 | Hourly production data |
| `days` | 7, 14, 30 | Daily production data |
| `months` | 12, 24 | Monthly production data |
| `years` | 5, 10 | Yearly production data |

**Response:**
```json
{
  "success": true,
  "data": {
    "records": [...],
    "statistics": {
      "total_energy": 125000,
      "average_power": 1500,
      "peak_power": 2800,
      "capacity_factor": 0.42
    }
  }
}
```

### API Features

- **Caching**: 5-second response cache for efficiency
- **Connection monitoring**: Automatic detection of API failures
- **Retry logic**: Automatic retry on transient failures
- **Error handling**: Consistent error response format

---

## Database Schema

Solar data is stored in SQLite (`data/solar.db`).

### Tables

#### solar_realtime
Short-term storage for recent readings (7-day retention).

```sql
CREATE TABLE solar_realtime (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    power_w INTEGER,
    energy_wh INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### solar_hourly
Permanent hourly aggregations.

```sql
CREATE TABLE solar_hourly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL UNIQUE,
    energy_wh INTEGER,
    power_avg_w INTEGER,
    power_max_w INTEGER,
    capacity_factor REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### solar_daily
Permanent daily aggregations.

```sql
CREATE TABLE solar_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    energy_wh INTEGER,
    power_max_w INTEGER,
    capacity_factor REAL,
    sunlight_hours REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### solar_monthly / solar_yearly
Similar structure for monthly and yearly aggregations.

### Indexes

```sql
CREATE INDEX idx_realtime_timestamp ON solar_realtime(timestamp);
CREATE INDEX idx_hourly_timestamp ON solar_hourly(timestamp);
CREATE INDEX idx_daily_date ON solar_daily(date);
```

---

## Solar Integration (Solplanet Cloud)

P1 Pulse integrates with the Solplanet Cloud API to collect solar production data.

### Configuration

Create a configuration file at one of these locations (checked in order):

1. `/p1mon/config/solplanet.ini` (recommended for P1 Monitor)
2. `/etc/p1mon/solplanet.ini` (system-wide)
3. Environment variables (highest priority)

**solplanet.ini format:**
```ini
[solplanet]
email = your-email@example.com
password = your-password
plant_id = your-plant-id
```

**Environment variables (alternative):**
```bash
export SOLPLANET_EMAIL="your-email@example.com"
export SOLPLANET_PASSWORD="your-password"
export SOLPLANET_PLANT_ID="your-plant-id"
```

### Setup Steps

1. **Initialize the database:**
   ```bash
   php scripts/init-solar-database.php
   ```

2. **Test API connectivity:**
   ```bash
   php scripts/test-solar-api.php
   ```

3. **Set up cron job for data collection:**
   ```bash
   # Add to crontab (every 10 minutes)
   */10 * * * * php /var/www/html/custom/scripts/solar-collector.php
   ```

4. **Backfill historical data (optional):**
   ```bash
   php scripts/solar-backfill.php --days=30
   ```

### System Specifications

The current configuration assumes:
- **Panels**: 14 x 270Wp = 3,780W total capacity
- **Inverter**: Zeversolar 3000TL

To change these values, edit `lib/SolarConfig.php`.

---

## Utility Scripts

All scripts are located in the `scripts/` directory.

### Core Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `init-solar-database.php` | Create SQLite database schema | `php init-solar-database.php` |
| `solar-collector.php` | Collect current data from API | `php solar-collector.php` (run via cron) |
| `solar-backfill.php` | Import historical data | `php solar-backfill.php [--days=N] [--force]` |
| `validate-solar-data.php` | Check data quality | `php validate-solar-data.php` |

### Diagnostic Scripts

| Script | Purpose |
|--------|---------|
| `solar-diagnostics.php` | Comprehensive system diagnostics |
| `test-solar-api.php` | Test Solplanet API connectivity |
| `diagnose-solar-api.php` | Diagnose API issues |
| `check-api-units.php` | Verify API unit formats |
| `check-db-values.php` | Check database integrity |
| `check-schema.php` | Verify schema correctness |

### Development Scripts

| Script | Purpose |
|--------|---------|
| `solar-debug.php` | Development debugging tool |
| `debug-solar-dashboard.php` | Dashboard debugging |
| `quick-api-test.php` | Quick API testing |
| `discover-historical-api.php` | Explore API endpoints |

### Usage Examples

```bash
# Initialize database (safe to run multiple times)
php scripts/init-solar-database.php

# Test API connection
php scripts/test-solar-api.php

# Backfill last 30 days of data
php scripts/solar-backfill.php --days=30

# Force re-import (overwrites existing data)
php scripts/solar-backfill.php --days=7 --force

# Validate data quality
php scripts/validate-solar-data.php

# Run full diagnostics
php scripts/solar-diagnostics.php
```

---

## JavaScript Modules

### api.js (725 lines)

Central API wrapper with error handling and caching.

**Key features:**
- Request caching (5-second TTL)
- Connection status monitoring
- Automatic retry logic
- Custom events for connection state changes

**Methods:**
```javascript
P1API.getElectricityData()
P1API.getGasData()
P1API.getSolarData(period, zoom)
P1API.getWeatherData()
P1API.isConnected()
```

### dashboard.js (337 lines)

Main dashboard functionality.

**Features:**
- Real-time data updates (configurable interval)
- Canvas-based gauge drawing
- Card statistics updates
- Auto-refresh with countdown timer

### electricity.js (1,048 lines)

Electricity page with interactive charts.

**Features:**
- Period selection (hours/days/months/years)
- Zoom controls per period
- Consumption/production toggle
- Net energy display
- Cost calculations
- Hover tooltips

### gas.js (1,181 lines)

Gas consumption tracking.

**Features:**
- Consumption charts with degree-days overlay
- Temperature correlation display
- Missing data interpolation
- Dynamic zoom buttons

### solar.js (823 lines)

Solar production visualization.

**Features:**
- Production charts for all periods
- Capacity factor calculation
- Peak power tracking
- Smoothed data option

### theme.js (245 lines)

Theme management.

**Features:**
- Dark/light mode switching
- localStorage persistence
- System theme detection
- Real-time switching without reload
- Server sync via AJAX

### sidebar.js (408 lines)

Sidebar navigation.

**Features:**
- Toggle collapse/expand
- Smooth animations
- State persistence

### header.js (154 lines)

Header functionality.

**Features:**
- Weather information display
- Real-time clock updates

---

## Configuration Reference

### P1 Monitor Config Values

The dashboard reads these configuration values via `config_read()`:

| Config ID | Purpose | Values |
|-----------|---------|--------|
| 52 | Max consumption for gauge | Watts |
| 53 | Max production for gauge | Watts |
| 61 | Enable three-phase info | 0/1 |
| 154 | Fast telegram mode | 0/1 |
| 157 | Hide water utility | 0/1 |
| 158 | Hide gas utility | 0/1 |
| 206 | Hide peak kW info | 0/1 |

### User Preferences

Stored in PHP sessions:

```php
[
    'theme' => 'dark',              // 'dark' or 'light'
    'sidebar_collapsed' => false,   // Sidebar state
    'default_page' => 'dashboard',  // Landing page
    'update_interval' => 10         // Seconds between updates
]
```

### CSS Variables

Theme colors defined in `assets/css/variables.css`:

```css
/* Background colors */
--bg-primary-dark / --bg-primary-light
--bg-secondary-dark / --bg-secondary-light

/* Text colors */
--text-primary-dark / --text-primary-light
--text-secondary-dark / --text-secondary-light

/* Accent colors (same for both themes) */
--accent-consumption: #f97316;  /* Orange */
--accent-production: #22c55e;   /* Green */
--accent-gas: #3b82f6;          /* Blue */
--accent-water: #06b6d4;        /* Cyan */
--accent-solar: #eab308;        /* Amber */
```

---

## Data Flow

```
User Browser
    |
    v
HTML Page (p1mon.php)
    |
    v
JavaScript loads (api.js, dashboard.js, etc.)
    |
    v
P1API.fetch() --> P1 Monitor APIs / custom solar.php
    |
    v
Live Data / SQLite Database
    |
    v
JSON Response
    |
    v
DOM Updates + Chart Rendering
    |
    v
Auto-refresh (configurable interval)
```

### Data Storage Summary

| Data Type | Storage | Retention |
|-----------|---------|-----------|
| User preferences | PHP session | Session lifetime |
| Theme choice | localStorage + session | Permanent |
| Solar realtime | SQLite | 7 days |
| Solar aggregated | SQLite | Permanent |
| Live P1 Monitor data | API (not stored) | Real-time |

---

## Known Issues

### Solar Unit Conversion (Phase 6A)

**Issue**: Solar energy values may be approximately 3x too low in some historical data.

**Root cause**: Possible unit conversion error during backfill process. The Solplanet API returns power (W) vs energy (Wh) in different fields, and the conversion logic may have incorrect multipliers.

**Workaround**:
1. Run `php scripts/validate-solar-data.php` to check data quality
2. Compare database values against Solplanet Cloud dashboard
3. If values are incorrect, re-run backfill with `--force` flag after fixing the conversion

**Status**: Under investigation. See `docs/PHASE6A_HANDOVER.md` for details.

### Placeholder Pages

The following pages are not yet implemented:
- **Water** (`pages/water.php`) - Placeholder only
- **Costs** (`pages/costs.php`) - Placeholder only

---

## Security Considerations

- Page routing uses alphanumeric validation only
- URL parameters are sanitized
- X-Robots header prevents search engine indexing
- Session-based preferences (no sensitive data in client)
- API credentials stored in config files outside web root (when properly configured)

---

## Development

### Adding a New Page

1. Create a new file in `pages/` directory
2. Add page name to `$validPages` array in `p1mon.php`
3. Create corresponding JavaScript file in `assets/js/`
4. Add navigation link in `components/sidebar.php`
5. Link JavaScript in `config.php` `includeJS()` function

### Code Conventions

- **PHP**: Extract variables in includes, use P1Config static class
- **JavaScript**: Object-based managers with init/setupEventListeners pattern
- **CSS**: Organized by purpose (variables, base, layout, components)
- **HTML**: Semantic structure with conditional PHP rendering

---

*Last updated: January 2026*
