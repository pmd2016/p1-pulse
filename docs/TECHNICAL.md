# P1 Pulse - Technical Documentation

This document provides detailed technical information for developers and advanced users of P1 Pulse.

> Scope note: this file documents what the code in this repository actually does. Where behaviour is
> known to be wrong or unfinished, it is listed under [Known Issues](#known-issues) rather than
> described as if it worked.

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

P1 Pulse is a PHP/JavaScript web application that provides a modern dashboard for P1 Monitor. It uses
no build tools, package managers or third-party runtime libraries — files are served directly.
Charts are drawn by hand on a `<canvas>` element; there is no charting library.

### Code Statistics

| Language   | Lines of Code | Files |
|------------|---------------|-------|
| PHP        | ~5,200        | 30    |
| JavaScript | ~3,900        | 10    |
| CSS        | ~2,400        | 4     |
| **Total**  | **~11,500**   | **44**|

### Request Lifecycle

```
p1mon.php
  ├── requires config.php (session start, P1 Monitor util include, P1Config)
  ├── sanitises ?page= and validates against $validPages
  ├── collects config/visibility/maxValues/energyConfig into $pageData
  └── renderPage($page, $pageData)
        ├── extract($data)              → variables visible to all includes
        ├── components/header.php       → <!DOCTYPE> … opens <html>, <body>, .app-container
        ├── components/sidebar.php      → navigation
        ├── pages/{page}.php            → page body (a fragment, not a full document)
        └── components/footer.php       → includeJS(), page-specific script, window.P1MonConfig,
                                          closes </body></html>
```

Pages are **fragments**. `header.php` opens the document and `footer.php` closes it, so no file in
`pages/` can be rendered standalone.

### Key Design Patterns

- **PHP→JS config bridge**: `components/footer.php` emits `window.P1MonConfig`. This is the only
  channel by which server-side configuration reaches the browser.
- **Module managers**: each JS file is an IIFE exposing one object with `init()` /
  `setupEventListeners()` / `destroy()`, auto-initialising on `DOMContentLoaded` when
  `window.P1MonConfig.currentPage` matches.
- **ChartBase factory**: `assets/js/charts.js` exposes `ChartBase.createManager(config)`. The
  electricity, gas and solar pages are all built from it and supply behaviour through hooks
  (`onInit`, `onSetupEventListeners`, `onLoadData`, `onUpdateStatistics`, `onDrawChart`,
  `onDrawTooltipContent`). New chart pages should go through this factory.
- **CSS custom properties**: `--x-light` / `--x-dark` pairs defined on `:root`, remapped to semantic
  names under the `.light-theme` / `.dark-theme` body classes.
- **Configuration-driven UI**: visibility flags read from P1 Monitor via `config_read()`.

---

## API Reference

### P1 Monitor Native API

These are the endpoints `assets/js/api.js` actually calls. `P1API.fetch()` automatically appends
`json=object` to any URL beginning with `/api`, so responses arrive as objects with named fields
rather than positional arrays.

| Endpoint | Wrapper | Notes |
|----------|---------|-------|
| `GET /api/v1/smartmeter?limit=N` | `getSmartMeter(limit)` | Real-time readings; `CONSUMPTION_W`, `PRODUCTION_W` |
| `GET /api/v1/status` | `getStatus()` | Status rows keyed by `STATUS_ID`; source for `getPhases()` |
| `GET /api/v1/configuration` | `getConfiguration()` | Cached |
| `GET /api/v1/powergas/hour?limit=N` | `getHistoryHour(limit)` | Cached |
| `GET /api/v1/powergas/day?limit=N` | `getHistoryDay(limit)` | |
| `GET /api/v1/powergas/month?limit=N` | `getHistoryMonth(limit)` | |
| `GET /api/v1/powergas/year?limit=N` | `getHistoryYear(limit)` | |
| `GET /api/v1/financial/day?limit=N` | `getFinancial(limit)` | |
| `GET /api/v1/financial/month?limit=N` | `getFinancialMonth(limit)` | |
| `GET /api/v1/financial/year?limit=N` | `getFinancialYear(limit)` | |
| `GET /api/v2/watermeter/day?limit=N` | `getWaterMeter(limit)` | Not called by any page yet |
| `GET /api/v2/watermeter/month?limit=N` | `getWaterMeterMonth(limit)` | Not called by any page yet |
| `GET /api/v1/weather/{hour,day,month,year}?limit=N` | `getWeatherHistory(period, limit)` | Pre-aggregated `TEMPERATURE_LOW/AVERAGE/HIGH` |
| `GET /api/v1/weather?limit=1` | — | Called directly by `header.js` for the current conditions widget. `limit=1` is required: without it the endpoint returns the entire weather history (~3,000 records, ~900KB) for the sake of one record |

History endpoints return newest-first; `getElectricityData()` clones and reverses into chronological
order before building chart data.

Field-name quirk: P1 Monitor spells the local timestamp `TIMESTAMP_lOCAL` (lower-case `l`). The code
matches the API, so do not "correct" it.

### P1API behaviour

- **Caching**: `fetchCached()` only. 5-second TTL, `Map`-backed, expired entries evicted on write.
  Plain `fetch()` is uncached — most calls use it.
- **Connection monitoring**: three consecutive failures flips `connectionStatus.isOnline` to false
  and dispatches a `p1connection` CustomEvent on `document`.
- **No retry logic.** A failed request logs, updates the failure counter, and rethrows. The caller
  decides what to do.

### Custom Solar API

**Location**: `api/solar.php`. **URL**: `/custom/api/solar.php` (hard-coded in the JS callers).
Read-only, unauthenticated, SQLite-backed. Output passes through `JSON_NUMERIC_CHECK`, so numeric
strings are emitted as JSON numbers.

#### Current/realtime data

```
GET /custom/api/solar.php?action=current
```

```json
{
  "power": 1250,
  "energy": 4821.35,
  "energyToday": 8.5,
  "energyMonth": 285.0,
  "status": "normal",
  "timestamp": "2026-01-16 12:40:00"
}
```

`power` is Watts; `energy` (lifetime), `energyToday` and `energyMonth` are kWh, converted from the
Wh stored in the database. `status` is `"normal"` when `inverter_status == 1`, otherwise
`"offline"`. When the table is empty the same shape is returned with zeroes, no `timestamp`, and
`status: "offline"`. On a database or query failure the response is `{"error": "..."}` — callers
must handle a payload with no `power` key.

#### Failure reporting

Both routes distinguish three unavailable states, rather than degrading silently to zero:

| `error` | Meaning |
|---------|---------|
| `Database not found, or not readable by the web server` | `file_exists()` is false — absent, or the directory is not traversable |
| `Database exists but is not readable by the web server` | Present, but file permissions deny the web user |
| `Database schema is missing or incomplete` | Opens, but a required table is absent — typically an empty file left by a PDO connect |
| `Query failed` | Any other query error; details go to the PHP error log, not the response |

On the history routes the key is **additive**: `chartData` and `stats` are still present and
still empty, so a client that ignores `error` behaves exactly as before. An initialised database
with no rows yet returns **no** `error` key — that is a normal state, not a fault.
`assets/js/solar.js` surfaces it as a message instead of an empty chart; the dashboard card and
header widget blank themselves rather than claim zero production.

#### Historical data

```
GET /custom/api/solar.php?period={hours|days|months|years}&zoom={N}
```

`zoom` is clamped server-side: below 1 → 24; hours ≤ 168, days ≤ 365, months ≤ 24, years ≤ 10.

```json
{
  "period": "hours",
  "zoom": 24,
  "chartData": [
    { "timestamp": "2026-01-16 12:00:00", "unixTimestamp": 1768564800,
      "production": 1.234, "power": 820, "powerMax": 1430 }
  ],
  "stats": {
    "totalEnergy": 8.5,
    "avgPower": 640,
    "peakPower": { "value": 2800, "time": "2026-01-16 12:00:00" },
    "capacityFactor": 9.37
  }
}
```

`production` is kWh per bucket; `power` and `powerMax` are Watts; `capacityFactor` is a percentage.

Per-period differences:

| Period | Extra `chartData` fields | `stats` shape |
|--------|--------------------------|---------------|
| `hours` | — | `totalEnergy`, `avgPower`, `peakPower`, `capacityFactor` |
| `days` | `sunlightHours`, `capacityFactor` | `totalEnergy`, `avgDaily`, `peakPower`, `capacityFactor` (mean of stored daily values) |
| `months` | `avgDaily`, `daysWithData` | `totalEnergy`, `avgMonthly`, `peakPower` (no `capacityFactor`) |
| `years` | `avgMonthly`, `monthsWithData` | `totalEnergy`, `avgYearly`, `peakPower` (no `capacityFactor`) |

`timestamp` is a datetime string for `hours`, `YYYY-MM-DD` for `days`, `YYYY-MM` for `months`, and
the year for `years`. Use `unixTimestamp` for anything date-arithmetic-related.

Callers use raw `fetch()` against this endpoint, **not** `P1API`, so none of the caching or
connection monitoring above applies to solar data.

---

## Database Schema

Solar data is stored in SQLite at `/p1mon/www/custom/data/solar.db`. The path is a constant in
`api/solar.php` and in every script; the `data/` directory is not part of this repository.

`scripts/solar-schema.sql` is the authoritative schema definition. It is read by
`scripts/init-solar-database.php` at install time and by the test harness when building a
temporary database, so the two cannot drift apart. Seven tables:

### solar_realtime

One row per collector run (nominally every 10 minutes), pruned to 7 days by the collector.

```sql
CREATE TABLE solar_realtime (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    power_current INTEGER NOT NULL,           -- Current power in W
    energy_today INTEGER NOT NULL,            -- Today's production in Wh
    energy_month INTEGER NOT NULL,            -- Month's production in Wh
    energy_total INTEGER NOT NULL,            -- Lifetime production in Wh
    inverter_status INTEGER DEFAULT 1,        -- 0=offline, 1=normal, 2=warning, 3=error
    collected_at INTEGER NOT NULL,
    UNIQUE(timestamp)
);
```

### solar_hourly

```sql
CREATE TABLE solar_hourly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,               -- Start of hour (unix)
    energy_produced INTEGER NOT NULL,         -- Wh for this hour
    power_avg INTEGER DEFAULT 0,              -- W
    power_max INTEGER DEFAULT 0,              -- W
    power_min INTEGER DEFAULT 0,              -- W
    samples INTEGER DEFAULT 0,                -- realtime rows aggregated
    aggregated_at INTEGER NOT NULL,
    UNIQUE(timestamp)
);
```

Hourly energy is derived from `energy_today`, the inverter's own running daily counter, read **at
the hour boundaries**: `E(hourEnd) - E(hourStart)`, where each is the most recent online reading at
or before that moment. It is not integrated from power samples.

Evaluating at the boundaries is what makes consecutive hours telescope — one hour's closing reading
is the next hour's opening one — so the sum of the hours equals the counter's movement across the
day. Taking the first and last sample *inside* each hour instead, as this once did, dropped the gap
between the last sample of one hour and the first of the next from both buckets: a third of every
hour at three samples per hour.

Two boundaries need care, and `energyCounterAt()` handles both. Readings are restricted to the local
day containing the hour, because `energy_today` restarts at zero each midnight: without that, a
reading taken at 00:00 would be treated as the closing value of the 23:00 hour and report the day's
last hour as zero. And before the day's first reading the counter is taken as zero rather than
unknown, so the first productive hour counts from the start of the day.

Only samples with `inverter_status = 1` take part. While the inverter is offline the API reports
zeros across every field, including `energy_today`, so those rows are absence of data shaped like a
measurement. Counting them put the entire day's production into whichever hour the inverter came
back, and discarded any hour that ended offline. An hour with no online samples gets no row at all.

One limitation remains: `E-Today` is reported to 0.1 kWh, so an individual hour is quantised to
100 Wh steps. Because the hours telescope, that granularity does not accumulate — daily and longer
totals still match the inverter exactly.

### solar_daily

```sql
CREATE TABLE solar_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,                       -- YYYY-MM-DD
    timestamp INTEGER NOT NULL,               -- Start of day (unix)
    energy_produced INTEGER NOT NULL,         -- Wh
    power_peak INTEGER DEFAULT 0,             -- W
    power_peak_time INTEGER DEFAULT 0,        -- unix
    hours_sunlight REAL DEFAULT 0,            -- hours with production > 10W
    capacity_factor REAL DEFAULT 0,           -- percent of rated capacity
    aggregated_at INTEGER NOT NULL,
    UNIQUE(date)
);
```

### solar_monthly

```sql
CREATE TABLE solar_monthly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,                   -- 1-12
    timestamp INTEGER NOT NULL,
    energy_produced INTEGER NOT NULL,         -- Wh
    power_peak INTEGER DEFAULT 0,
    days_with_data INTEGER DEFAULT 0,
    avg_daily_production INTEGER DEFAULT 0,   -- Wh/day
    capacity_factor REAL DEFAULT 0,
    aggregated_at INTEGER NOT NULL,
    UNIQUE(year, month)
);
```

### solar_yearly

```sql
CREATE TABLE solar_yearly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    energy_produced INTEGER NOT NULL,         -- Wh
    power_peak INTEGER DEFAULT 0,
    months_with_data INTEGER DEFAULT 0,
    avg_monthly_production INTEGER DEFAULT 0, -- Wh/month
    capacity_factor REAL DEFAULT 0,
    aggregated_at INTEGER NOT NULL,
    UNIQUE(year)
);
```

### api_cache

Declared for caching Solplanet responses (`endpoint`, `params`, `response`, `cached_at`,
`expires_at`, `UNIQUE(endpoint, params)`). **Currently unused** — nothing reads or writes it.

### collection_metadata

Key/value bookkeeping (`key` TEXT PRIMARY KEY, `value` TEXT, `updated_at` INTEGER). Seeded keys:

| Key | Purpose |
|-----|---------|
| `last_collection_timestamp` | Throttles the collector to one run per 300s unless `--force` |
| `last_hourly_aggregation` | Watermark for hourly rollup |
| `last_daily_aggregation` | Watermark for daily rollup |
| `last_monthly_aggregation` | Watermark for monthly rollup |
| `last_yearly_aggregation` | Watermark for yearly rollup |
| `backfill_status` | `pending` / set by the backfill script |
| `backfill_oldest_date` | Earliest backfilled date |

### Energy units

**Everything in the database is stored in Wh and Watts.** Conversion to kWh happens once, at the
`api/solar.php` boundary.

On the way in, every Solplanet measurement declares its own unit, and the units differ between
fields of the same kind:

```json
"Power":   { "unit": "KW",  "value": 1.22  }
"E-Today": { "unit": "KWh", "value": 12    }
"E-Month": { "unit": "KWh", "value": 239.78 }
"E-Total": { "unit": "MWh", "value": 39.09 }
```

Note the non-SI spellings — `KW` and `KWh` with a capital K, and `KWh` with a capital W.

`lib/SolarUnits.php` converts from the declared unit rather than from a per-field assumption.
`SolarUnits::toWatts()` and `SolarUnits::toWattHours()` match case-insensitively and return `null`
for anything they do not recognise, including a power unit passed where an energy unit belongs.
The collector treats a `null` as fatal for that collection rather than storing a partial reading:
a gap can be backfilled, but a wrong value silently corrupts every aggregate derived from it.

This replaced four hardcoded multipliers, one per field. `Power` was assumed to already be in
Watts when it is in kW, so every stored power reading was 1000× low and `(int)` truncation threw
away the fraction on top — `1.22 kW` became `1 W`.

---

## Solar Integration (Solplanet Cloud)

P1 Monitor has no inverter integration, so solar production is collected separately from the
Solplanet Cloud "End User API" (`https://eu-api-genergal.aisweicloud.com`).

### Authentication

`lib/SolplanetAPI.php` signs each request with HMAC-SHA256 over a canonical string built from the
method, `Accept`, `Content-Type`, the `X-Ca-Key` header and the query string (parameters sorted
alphabetically). Two details are load-bearing and must not be "tidied":

- there is **no space** after the colon in the `X-Ca-Key:` line of the string to sign;
- query parameters are sorted alphabetically before signing *and* before sending.

### Credentials

`lib/SolarConfig.php` resolves credentials in this order:

1. **Environment variables** (highest priority — all five must be present or the whole set is skipped)
2. `/p1mon/config/solplanet.ini` (recommended: outside the web root)
3. `/etc/p1mon/solplanet.ini`
4. `/home/claude/solplanet.ini`
5. `<repo>/config/solplanet.ini`

**solplanet.ini format:**

```ini
[solplanet]
enabled = 1
app_key = your-app-key
app_secret = your-app-secret
api_key = your-plant-api-key
token = your-token
sn = your-inverter-serial
system_capacity_wp = 3780
collection_interval = 10
retention_days = 7
cache_enabled = 1
cache_ttl = 300
log_enabled = 1
log_level = INFO
```

`app_key`, `app_secret`, `api_key` and `sn` are required; the collector aborts without them.
`token` is accepted, stored and then ignored — the End User API does not use it.
Values are rejected if they still start with `YOUR_` or contain `HERE`.

**Environment variables (alternative):**

```bash
export SOLPLANET_APP_KEY="..."       # required
export SOLPLANET_APP_SECRET="..."    # required
export SOLPLANET_API_KEY="..."       # required
export SOLPLANET_TOKEN="..."         # required to be present, otherwise unused
export SOLPLANET_SN="..."            # required
export SOLPLANET_ENABLED="true"      # "false" disables collection
export SOLPLANET_CAPACITY="3780"
export SOLPLANET_INTERVAL="10"
export SOLPLANET_RETENTION="7"
export SOLPLANET_CACHE="true"
export SOLPLANET_CACHE_TTL="300"
export SOLPLANET_LOG="true"
export SOLPLANET_LOG_LEVEL="INFO"
```

### Endpoints used

| Method | Solplanet endpoint | Used by |
|--------|--------------------|---------|
| `getPlantOverview()` | `/getPlantOverview` | `solar-collector.php` — current power and totals |
| `getPlantOutput($period, $date)` | `/getPlantOutput` | `solar-backfill.php` — 72 × 20-minute readings per day |
| `getDeviceList()` | `/devicelist` | connectivity tests |
| `getPlantEvent()` | `/getPlantEvent` | diagnostics |
| `getInverterOverview()` | `/getInverterOverview` | diagnostics |
| `getInverterData()` | `/getInverterData` | diagnostics |
| `testConnection()` | — | runs the first three and summarises |

### Setup Steps

1. **Initialize the database:**
   ```bash
   php scripts/init-solar-database.php
   ```

2. **Test API connectivity:**
   ```bash
   php scripts/test-solar-api.php
   ```

3. **Set up cron for data collection (every 10 minutes):**
   ```bash
   */10 * * * * /usr/bin/php /p1mon/www/custom/scripts/solar-collector.php >> /tmp/solar-collector.log 2>&1
   ```
   The collector self-throttles to one run per 300 seconds regardless of how often cron fires.

4. **Backfill historical data (optional):**
   ```bash
   php scripts/solar-backfill.php --days=30
   ```
   See [Known Issues](#known-issues) before trusting backfilled totals.

### System Capacity

Rated capacity is currently **3,780 W** (14 × 270 Wp panels). It is declared in four places and
they must be kept in step:

| Location | Form |
|----------|------|
| `config.php` → `P1Config::getEnergyConfig()` | `system_capacity_w` — reaches the browser as `P1MonConfig.systemCapacityW` |
| `api/solar.php` | `SYSTEM_CAPACITY_W` constant |
| `solplanet.ini` / `SOLPLANET_CAPACITY` | `system_capacity_wp` |
| `dashboard.js`, `solar.js` | `?? 3780` fallbacks if `P1MonConfig` is absent |

---

## Utility Scripts

All scripts live in `scripts/`, are CLI-only (`#!/usr/bin/env php`), and use hard-coded absolute
paths under `/p1mon/www/custom`. They will not run from an arbitrary checkout.

### Core Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `init-solar-database.php` | Create the SQLite schema (idempotent) | `php init-solar-database.php` |
| `solar-collector.php` | Fetch current data, store, aggregate, prune | `php solar-collector.php [--force] [--verbose]` |
| `solar-backfill.php` | Import historical data from Solplanet | `php solar-backfill.php [--days=N \| --start=DATE --end=DATE] [--delay=N] [--verbose] [--dry-run] [--force] [--help]` |
| `validate-solar-data.php` | Check record counts, gaps, aggregation consistency | `php validate-solar-data.php` |

`--force` on the collector bypasses both the `enabled` config check and the 300-second throttle.
The backfill defaults to a window ending *yesterday*, to avoid racing the live collector.

#### Finding out what history exists

Solplanet answers a request for a date it has no data with a **full day of zero-valued points**,
not an error and not an empty array. A range that starts before the plant existed therefore imports
thousands of empty days rather than failing, and each one writes a `solar_daily` row that marks the
day as already imported — making the emptiness permanent without `--force`.

`--survey` asks per year instead of per day, so it finishes in seconds:

```bash
php scripts/solar-backfill.php --start=2016-01-01 --end=2026-09-20 --survey
```

It reports which years hold production and names the earliest, then prints the import command for
that range. `--verbose` additionally dumps each raw response, which is worth having: the shape of a
`byyear` response is not documented and may not match the daily one.

The importer also refuses to write a day whose total production is zero, reporting it as "no data"
and moving on.

#### Backfilling a long range

The backfill makes one API call per day, with `--delay` seconds between them (default 10), so a
multi-year range runs for hours. It prints an estimate up front when the range is large enough to
matter.

It is resumable, and cheaply so: a day already present in `solar_daily` is skipped **without an API
call and without the delay**, so an interrupted run can be restarted with the same arguments and
will race through what it already has. Run it detached:

```bash
nohup php scripts/solar-backfill.php --start=2016-06-01 --end=2026-09-20 \
  > /tmp/backfill.log 2>&1 &
tail -f /tmp/backfill.log
```

Monthly and yearly aggregates are rebuilt from `solar_daily` at the end of each run, so they are
correct as long as the run reaches completion. Re-running after an interruption rebuilds them.

`--force` disables the skip, which is what re-imports days whose stored values are wrong. Use it for
a bounded window rather than a decade, or delete the affected rows and re-run without it.

### Diagnostic Scripts

| Script | Purpose |
|--------|---------|
| `solar-diagnostics.php` | Table-by-table database status (`--table=NAME`, `--limit=N`) |
| `test-solar-api.php` | Solplanet connectivity check |
| `diagnose-solar-api.php` | Deeper API failure diagnosis |
| `check-api-units.php` | Verify API unit formats against expectations |
| `check-db-values.php` | Spot-check stored values |
| `check-schema.php` | Verify the live schema matches `init-solar-database.php` |

### Development Scripts

| Script | Purpose |
|--------|---------|
| `solar-debug.php` | Ad-hoc debugging |
| `debug-solar-dashboard.php` | Reproduce what the dashboard sees |
| `quick-api-test.php` | Minimal API smoke test |
| `discover-historical-api.php` | Explore Solplanet endpoint shapes |
| `test-getopt.php` | Argument-parsing scratch file |

There is also `solar-diagnostics.html` in the repository root — a standalone browser-side diagnostic
page that calls the solar API directly.

---

## JavaScript Modules

Load order is fixed by `config.php::includeJS()`: `logger`, `theme`, `sidebar`, `api`, `header`,
`charts` — then the page-specific module appended by `components/footer.php`.

### logger.js (62 lines)

`P1Logger`. Use this instead of `console` throughout.

- `log()` / `warn()` output only in debug mode; `error()` always outputs.
- Enable with `?debug` in the URL or `P1Logger.enable()`; disable with `P1Logger.disable()`.
- State persists in `localStorage` under `p1mon_debug`.

### api.js (582 lines)

`P1API`. See [API Reference](#api-reference) for the full method list. The one method doing real
work is `getElectricityData(period, limit, includeTemperature)`, which fetches power/gas history plus
optional financial and weather data and returns:

```javascript
{
  period, limit,
  chartData: [{ timestamp, unixTimestamp, consumption, production, net, gas, tempMin?, tempMax?, tempAvg? }],
  stats: { totalConsumption, totalProduction, netConsumption, totalCost, average, peakConsumption: { value, time } }
}
```

It is used by the electricity page, the gas page (for `chartData[].gas`) and the dashboard.
When financial data is unavailable, `totalCost` falls back to
`net × P1MonConfig.electricityCostPerKwh`.

### charts.js (845 lines)

`ChartBase` — shared chart machinery and the `createManager()` factory.

Provides: canvas sizing, theme colour resolution, nice-tick calculation, Y/X axis drawing, Dutch
date/label formatting, tooltips with hover tracking, rounded rects, bars, smooth lines, temperature
overlays and a secondary temperature axis, plus `showError()` / `hideError()` /
`showLoading()` / `hideLoading()` / `updateElement()` helpers.

Managers created by the factory get `currentPeriod`, `currentZoom`, `data`, `canvas`, `ctx`,
`hoverState` and the methods `init()`, `setupEventListeners()`, `updateZoomButtons()`,
`changePeriod()`, `changeZoom()`, `loadData()`, `updateStatistics()`, `redrawChart()`.

### dashboard.js (333 lines)

Overview cards for electricity, gas and solar, each with a hand-drawn arc gauge. Refreshes on
`P1MonConfig.updateInterval` with a visible countdown. Solar figures are filtered to
today-since-midnight client-side.

### electricity.js (255 lines)

Electricity page: period tabs, zoom controls, net-line and temperature toggles, statistics cards,
tooltips. Built on `ChartBase.createManager`.

### gas.js (530 lines)

Gas page: consumption bars, degree-days overlay, temperature overlay, gap-filling for missing
periods, dynamic legend. Sources its data from `P1API.getElectricityData()` and reads the `gas`
field.

### solar.js (450 lines)

Solar page: production bars, power line, capacity factor, peak power, estimated sunlight hours,
optional temperature overlay. Fetches `/custom/api/solar.php` directly rather than through `P1API`.

### header.js (164 lines)

Clock (1s), weather widget (5 min) and solar production widget (10s). Interval IDs are collected in
`this.timers` and cleared on `beforeunload`.

### theme.js (245 lines)

Dark/light switching via `.light-theme` / `.dark-theme` on `<body>`, persisted to `localStorage`
(`p1mon_theme`), falling back to `prefers-color-scheme`. Also updates `<meta name="theme-color">`,
dispatches a `themechange` event, and binds Ctrl/Cmd+Shift+L. See
[Known Issues](#known-issues) regarding the server-side sync.

### sidebar.js (412 lines)

Collapse/expand with `localStorage` persistence (`p1mon_sidebar_collapsed`), mobile drawer behaviour
below 1024px, click-outside-to-close, and hiding of nav items per `P1MonConfig.visibility`.

---

## Configuration Reference

### P1 Monitor Config Values

Read via `config_read()` in `P1Config`. When P1 Monitor's `util/p1mon-util.php` is not present,
`config_read()` does not exist, `P1Config::get()` returns `null`, and every flag falls back to its
default.

| Config ID | Read as | Purpose |
|-----------|---------|---------|
| 52 | `maxValues['consumption']` (default 10) | Gauge maximum, kW |
| 53 | `maxValues['production']` (default 10) | Gauge maximum, kW |
| 61 | `show_phase_info` = `(61 == 1)` | Three-phase info — **computed but never consumed** |
| 96 | `hide_water` = `(96 == 0)` | Hides the water utility when the value is 0 |
| 154 | `isFastMode` = `(154 == 1)` | Fast telegram mode → 1s refresh instead of 10s |
| 158 | `hide_gas` = `(158 == 1)` | Hides the gas utility |
| 206 | `hide_peak_kw` = `(206 == 1)` | Peak kW info — **computed but never consumed** |

Note on 96: earlier documentation claimed water visibility was config 157. The code reads **96**,
inverted (hidden when 0, i.e. when no water meter is configured). Config 157 is not read anywhere.

### window.P1MonConfig

Emitted by `components/footer.php`; the only server→client configuration channel.

```javascript
{
  currentPage,              // routes JS module auto-init
  isFastMode,
  maxConsumption,           // kW
  maxProduction,            // kW — currently unused by any module
  updateInterval,           // ms: 1000 in fast mode, else 10000
  visibility,               // { hide_gas, hide_water, hide_peak_kw, show_phase_info }
  systemCapacityW,          // 3780
  electricityCostPerKwh,    // 0.30
  gasCostPerM3              // 1.50
}
```

Cost and capacity values come from `P1Config::getEnergyConfig()` in `config.php`; edit them there.
They are fallbacks used when P1 Monitor's financial API is unavailable.

### User Preferences

`P1Config::getUserPrefs()` seeds a PHP session array:

```php
[
    'theme' => 'dark',
    'sidebar_collapsed' => false,
    'default_page' => 'dashboard',
    'update_interval' => 10
]
```

Only `theme` is read (by `header.php`, for the initial `<body>` class). `sidebar_collapsed`,
`default_page` and `update_interval` are never read, and `P1Config::setUserPref()` is never called —
see [Known Issues](#known-issues). Client-side state lives in `localStorage` instead.

### CSS Variables

Defined in `assets/css/variables.css` as light/dark pairs on `:root`, remapped under the theme body
classes. Also defines spacing (`--space-1` … `--space-12`), radii, transitions, layout dimensions
(`--sidebar-width`, `--header-height`) and a z-index scale.

```css
/* Paired, remapped by .light-theme / .dark-theme */
--bg-primary, --bg-secondary, --bg-card, --bg-hover
--text-primary, --text-secondary
--border-color, --shadow, --shadow-hover

/* Accents (identical in both themes) */
--accent-consumption: #f59e0b;
--accent-production:  #10b981;
--accent-gas:         #3b82f6;
--accent-water:       #06b6d4;
--accent-solar:       #f59e0b;
--accent-cost:        #8b5cf6;
```

Chart code does not read these variables; `ChartBase.getThemeColors()` hard-codes its palette based
on the presence of `.dark-theme`.

---

## Data Flow

### P1 Monitor data (live, not stored)

```
Browser
  └── P1API.fetch('/api/v1/...?json=object')
        └── P1 Monitor API  →  JSON  →  DOM + canvas
              └── re-poll every 10s (1s in fast mode)
```

### Solar data (collected and stored)

```
cron (10 min)
  └── solar-collector.php
        ├── SolarConfig  →  credentials
        ├── SolplanetAPI.getPlantOverview()  →  Solplanet Cloud
        ├── INSERT solar_realtime           (Wh / W)
        ├── aggregate → solar_hourly / _daily / _monthly / _yearly
        └── DELETE solar_realtime older than 7 days

Browser
  └── fetch('/custom/api/solar.php?...')
        └── api/solar.php  →  SQLite  →  JSON (Wh→kWh)  →  DOM + canvas
```

### Data Storage Summary

| Data Type | Storage | Retention |
|-----------|---------|-----------|
| Theme choice | `localStorage` (`p1mon_theme`) | Permanent |
| Sidebar state | `localStorage` (`p1mon_sidebar_collapsed`) | Permanent |
| Debug flag | `localStorage` (`p1mon_debug`) | Permanent |
| Session prefs | PHP session | Session lifetime (largely unused) |
| Solar realtime | SQLite | 7 days |
| Solar aggregated | SQLite | Permanent |
| P1 Monitor data | API only | Not stored |

---

## Known Issues

### Backfilled history before the unit fix is wrong and must be re-imported

**Resolved in code, but existing rows are still bad.** `solar-backfill.php` read the response's
`dataunit` into a variable and then ignored it, treating every power reading as watts. When the API
reports kW, that divided the whole import by a thousand.

The fingerprint of an affected row is `samples = 3` — the backfill writes one sample per
20-minute reading, where the live collector writes one per collection — together with single-digit
`power_avg` and `energy_produced` during daylight hours.

`docs/PHASE6A_HANDOVER.md` recorded this as "roughly 3× too low", which was a misdiagnosis of the
same fault measured against a different comparison.

**Action required**: rows imported before the fix are not salvageable in place; re-run
`solar-backfill.php --force` for the affected range.

### Device-only state is not in this repository

Three things live only on the P1 Monitor host and are restored by no deployment:
`data/solar.db`, `/p1mon/config/solplanet.ini`, and the collector's cron entry. Losing the
SD card or reinstalling P1 Monitor loses all three at once. `.gitignore` keeps the first two
out of this public repository; the README documents restoring all three.

### `file_exists()` cannot distinguish absent from unreadable

`getSolarDB()` and the collector both gate on `file_exists()`, which returns false when the
file is missing *and* when the web server user cannot traverse the containing directory. The
API therefore reports "Database not found, or not readable by the web server" rather than
asserting which. Diagnosing it needs `ls -la` on the device.

This bit in practice: the web server reported the database as unavailable while the same
file opened fine from a CLI shell.

### Theme is never persisted server-side

`theme.js::syncThemeToServer()` POSTs to `?action=set_theme`, but `p1mon.php` has no action handling
at all. The request returns the dashboard HTML, `response.json()` throws, and the `.catch()` swallows
it silently. Consequences:

- `P1Config::setUserPref()` is dead code;
- the PHP-rendered `<body>` class always reflects the session default rather than the user's choice;
- the theme is re-applied by JS after first paint, so there is a visible flash on load.

### Capacity factor is calculated three different ways

For the same underlying data:

- `api/solar.php` divides by `zoom` hours (and approximates months as 30 days, years as 365);
- `solar.js::calculateCapacityFactor()` divides by the zoom window, same approximations;
- `dashboard.js::calculateSolarTotals()` divides by *hours elapsed so far today*.

The dashboard card and the solar page will therefore disagree about the same day. There is no single
agreed definition in the codebase.

### Hard-coded absolute paths

`api/solar.php` and every script hard-code `/p1mon/www/custom/...`, and the JS callers hard-code
`/custom/api/solar.php`, while `config.php` defines an unused `CUSTOM_BASE_URL`. The installation is
not relocatable, despite the README suggesting `/var/www/html/custom`.

### Unimplemented pages and unused surface

- `pages/water.php` and `pages/costs.php` are placeholders.
- Peak kW display and three-phase info are read from config and passed to the browser but never
  rendered; `P1API.getPhases()`, `getStatus()` and both watermeter methods have no callers.
- The `api_cache` table is created but never used.
- `P1MonConfig.maxProduction` is emitted but never read.

### Duplicated solar polling

`header.js` and `dashboard.js` each poll both solar endpoints on independent 10-second timers, using
raw `fetch()` outside `P1API`. On the dashboard that is four uncached requests per 10 seconds, and
the "filter to today since midnight" logic is duplicated in both files.

---

## Security Considerations

- Page routing validates against an explicit whitelist after stripping everything but `[a-z0-9_]`.
- `api/solar.php` is read-only and uses prepared statements; `zoom` is cast to `int` and clamped.
- The solar API is **unauthenticated** — anyone who can reach the P1 Monitor host can read solar
  production history. Consider this when exposing the host beyond the LAN.
- `<meta name="robots" content="noindex">` on every page.
- Solplanet credentials belong in a file outside the web root (`/p1mon/config/solplanet.ini`) or in
  environment variables. `SolarConfig::getAll()` masks them by default.
- No CSRF protection exists; there are currently no state-changing endpoints to protect.

---

## Development

### Adding a New Page

1. Create `pages/newpage.php` as a fragment (no `<html>`/`<body>`; 8-space base indent to match).
2. Add the page name to `$validPages` in `p1mon.php`.
3. Add a navigation link in `components/sidebar.php`.
4. Create `assets/js/newpage.js` as an IIFE exposing a manager that auto-inits when
   `P1MonConfig.currentPage` matches.
5. Register the script in the page-specific block in `components/footer.php`
   (**not** in `config.php::includeJS()`, which is for globally loaded modules only).

For a chart page, build the manager with `ChartBase.createManager()` rather than driving the canvas
directly.

### Running the tests

```bash
php tests/run-all.php                          # every suite; exit 0 on success, 1 on any failure

php tests/run-solar-units-tests.php            # unit conversion only
php tests/run-solar-collector-tests.php        # collector aggregation only
php tests/run-solar-api-tests.php              # the solar API only
php tests/run-solar-api-tests.php --verbose    # also print every response body
php tests/run-solar-api-tests.php --keep       # leave the temporary databases for inspection
```

`tests/assert.php` holds the shared assertion helpers. `tests/run-solar-units-tests.php` pins
`SolarUnits` against a real `getPlantOverview` response recorded in the file, so the expectations
are measured against something that actually happened rather than an invented example.

The harness builds a temporary SQLite database from `scripts/solar-schema.sql`, seeds it with
known values, and checks `api/solar.php` against them: unit conversion, chronological ordering,
statistics, zoom clamping, per-period response shapes, and the empty and missing database cases.

Each request runs in its own process via `tests/solar-api-request.php`, because `api/solar.php`
declares functions and constants at file scope and can only be included once per process. That
shim pre-defines `SOLAR_DB_PATH` and `SYSTEM_CAPACITY_W`, which `api/solar.php` honours through
`if (!defined(...))` guards; nothing defines them in normal use, so production behaviour is
unchanged.

There is no test framework — the project has no package manager and no dependencies, and the
harness keeps it that way.

### Code Conventions

- **PHP**: static `P1Config`, no instantiation. Includes read variables placed in scope by
  `extract()` inside `renderPage()`.
- **JavaScript**: one IIFE per file, `'use strict'`, a single `XManager` object literal with
  `init()` / `setupEventListeners()` / `destroy()`. Timers tracked and cleared on `beforeunload`.
- **Logging**: `P1Logger` only, never bare `console`.
- **DOM**: `textContent` and `replaceChildren()`; never `innerHTML` with data.
- **CSS**: organised by purpose — `variables`, `base`, `layout`, `components`.
- **Language**: UI strings in Dutch, code and comments in English.

---

*Last updated: September 2026*
