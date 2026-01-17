# Phase 3 Handover: Solar API Backend

## Overall Goal
Implement backend API endpoints for solar panel production data to enable frontend dashboard integration in custom P1 Monitor UI. System: 14×270Wp panels (3,780Wp total), Zeversolar 3000TL inverter, Solplanet cloud monitoring.

## Current Status: Phase 3 Complete ✅

### Completed Components
- ✅ **API Endpoint**: `/p1mon/www/custom/api/solar.php`
  - Current/realtime data: `?action=current`
  - Historical data: `?period={hours|days|months|years}&zoom={N}`
  - Matches electricity API structure for frontend compatibility
  - Returns energy in kWh, power in W
  - Proper aggregation from SQLite database
  
- ✅ **Critical Bug Fixed**: Collector power unit conversion
  - **Root cause**: Solplanet API returns power in W, not KW as initially documented
  - **Problem**: Collector was multiplying by 1000, storing values 1000x too large
  - **Solution**: Removed `* 1000` multiplication from `$powerCurrent` line in collector
  - **Database**: Reinitialized with correct values
  
- ✅ **Test Scripts**:
  - `test-solar-api.php` - Comprehensive endpoint testing
  - `check-db-values.php` - Database value verification
  - `check-api-units.php` - API response format diagnostic
  - `quick-api-test.php` - API/database comparison
  
- ✅ **Documentation**:
  - `SOLAR_API_DOCUMENTATION.md` - Complete API reference
  - `PHASE3_INSTALLATION.md` - Installation guide
  - `COLLECTOR_FIX_INSTRUCTIONS.md` - Bug fix documentation

### Working Endpoints
```bash
# Current data - WORKING
curl "http://localhost/custom/api/solar.php?action=current"

# Historical (empty until data accumulates)
curl "http://localhost/custom/api/solar.php?period=hours&zoom=24"
curl "http://localhost/custom/api/solar.php?period=days&zoom=7"
curl "http://localhost/custom/api/solar.php?period=months&zoom=12"
curl "http://localhost/custom/api/solar.php?period=years&zoom=5"
```

### Data Quality Verified
- Database: `power_current: 83 W` ✅ (was 83000 W before fix)
- API: Returns matching value `"power": 83` ✅
- Energy values: Always correct (5700 Wh = 5.7 kWh)

## Unfinished Tasks

### Phase 4: Frontend Dashboard
Create solar monitoring interface matching electricity/gas dashboard patterns:

**Required Files:**
1. `/p1mon/www/custom/pages/solar.php` - Dashboard HTML (copy/adapt electricity.php)
2. `/p1mon/www/custom/assets/js/solar.js` - Chart rendering (copy/adapt electricity.js)
3. `/p1mon/www/custom/assets/css/solar.css` - Styling (minimal, reuse existing)

**Features Needed:**
- Period tabs: hours/days/months/years
- Zoom controls per period (24h/48h/72h for hours, etc.)
- Statistics cards:
  - Current power output
  - Today's total production
  - Peak power and time
  - Capacity factor percentage
  - Sunlight hours
- Production chart:
  - Bars for production
  - Optional smooth line overlay
  - Hover tooltips with detailed data
- Optional temperature overlay (reuse from electricity dashboard)

### Phase 5: Integration
- Header widget showing current production
- Navigation sidebar link
- Dashboard summary card

### Phase 6: Historical Backfill
- Backfill 30 days of historical data (if available from API)
- Extended backfill for months/years (if needed)

## Key Decisions & Conclusions

### API Unit Discovery
**Critical finding**: Solplanet API returns **dynamic units**:
- Power < 1000W: Returns in W (e.g., `"unit": "W", "value": 162`)
- Power ≥ 1000W: Returns in KW (e.g., `"unit": "KW", "value": 1.87`)

This caused initial confusion. Solution: Use raw value without unit-specific conversion.

### Data Storage Standards
- **Database stores**: Power in W, Energy in Wh
- **API returns**: Power in W, Energy in kWh (converts Wh÷1000)
- **Aggregation**: Hourly → Daily → Monthly → Yearly
- **Retention**: Realtime 7 days, aggregated permanent

### Frontend Compatibility
API structure matches electricity endpoint pattern:
```json
{
  "period": "hours",
  "zoom": 24,
  "chartData": [
    {
      "timestamp": "2026-01-17 16:00:00",
      "unixTimestamp": 1768662000,
      "production": 2.850,    // kWh
      "power": 2450,          // W
      "powerMax": 2980        // W
    }
  ],
  "stats": {
    "totalEnergy": 18.45,     // kWh
    "avgPower": 1823,         // W
    "peakPower": {"value": 2980, "time": "..."}
  }
}
```

This allows reusing chart rendering code from electricity dashboard.

## Important Constraints

### Technical
- Pure PHP/JavaScript/CSS (no Python in frontend)
- SQLite database (read-only access for concurrent safety)
- No cURL extension (must use `file_get_contents()`)
- API rate limit: 100 calls/min (currently 6/hour safe)

### System Specifications
- **Capacity**: 3780W (14 × 270Wp panels)
- **Inverter**: Zeversolar 3000TL
- **Serial**: BS300060115A0044
- **Typical peak**: 2500-3200W on sunny day
- **Capacity factor**: 10-35% typical range

### Data Collection
- Collector runs every 10 minutes via cron
- First data point collected after reinitializing database
- Need 24 hours for meaningful hourly charts
- Need 7 days for meaningful daily charts

## Key Terms & Concepts

### Power vs Energy
- **Power** (W): Instantaneous generation rate (like speed)
- **Energy** (Wh/kWh): Accumulated production over time (like distance)
- **Conversion**: 1 kWh = 1000 Wh

### Capacity Factor
- Percentage of theoretical maximum production
- Formula: `(actual_energy / (rated_capacity × hours)) × 100`
- Example: 30% means system produced 30% of its theoretical max
- Typical range: 10-35% depending on weather/season

### Sunlight Hours
- Time periods with meaningful production (>10W average)
- Not the same as daylight hours
- Indicates productive generation time

### Aggregation Buckets
- **Realtime**: Raw API data, 10-min intervals, 7-day retention
- **Hourly**: Aggregated from realtime, permanent
- **Daily**: Aggregated from hourly, permanent
- **Monthly**: Aggregated from daily, permanent
- **Yearly**: Aggregated from monthly, permanent

## What Didn't Work

### Attempt 1: API Unit Assumptions
- **Tried**: Assumed API returns power in KW, multiplied by 1000
- **Result**: Database stored values 1000x too large (162000 W instead of 162 W)
- **Root cause**: API returns W when power < 1000W
- **Fix**: Remove multiplication, use raw value

### Attempt 2: API Compensation
- **Tried**: Divide API results by 100 to compensate for collector bug
- **Result**: Worked temporarily but not sustainable
- **Better solution**: Fix collector at source, reinitialize database

### Attempt 3: Test Script Function Redeclaration
- **Tried**: Include API file multiple times in test script
- **Result**: PHP fatal error "Cannot redeclare getSolarDB()"
- **Fix**: Execute each test in separate PHP process using `shell_exec()`

## Open Questions

### None - Phase 3 Complete

All technical issues resolved. Data collection working correctly. API returning valid data.

## File Locations

```
/p1mon/www/custom/
├── api/
│   └── solar.php                         # ✅ Backend API endpoint
├── scripts/
│   ├── solar-collector.php               # ✅ Fixed (removed * 1000)
│   ├── test-solar-api.php                # ✅ Test suite
│   ├── check-db-values.php               # ✅ DB diagnostic
│   ├── check-api-units.php               # ✅ API diagnostic
│   └── quick-api-test.php                # ✅ Quick verification
├── data/
│   └── solar.db                          # ✅ Reinitialized with correct data
└── lib/
    ├── SolarConfig.php                   # ✅ Configuration (static methods)
    └── SolplanetAPI.php                  # ✅ API client (5 params)
```

## Recommended Next Step

**Proceed to Phase 4: Frontend Dashboard Implementation**

Start by creating solar.php page using electricity.php as template:

1. **Copy structure**: Use `/p1mon/www/custom/pages/electricity.php` as base
2. **Adapt for solar**:
   - Remove consumption/production split (solar only produces)
   - Change "Verbruik/Productie" to just "Productie"
   - Update stats cards for solar metrics (capacity factor, sunlight hours)
   - Keep period tabs and zoom controls (same pattern)
   
3. **Chart rendering**: Copy `/p1mon/www/custom/assets/js/electricity.js` as base
   - Simplify to single production bars (no consumption)
   - Add capacity factor visualization
   - Reuse smooth line option
   - Reuse temperature overlay capability

4. **API integration**: 
   - Use `window.P1API.getSolarData(period, zoom)` pattern
   - Endpoint: `/custom/api/solar.php`
   - Response format already matches electricity structure

5. **Testing approach**:
   - Start with current data display (works immediately)
   - Chart will show single data point initially
   - Full charts populate as more data collects

**Estimated effort**: 2-3 hours (mostly copying/adapting existing code)

## Quick Reference Commands

```bash
# Verify collector is fixed
grep "powerCurrent" /p1mon/www/custom/scripts/solar-collector.php
# Should show: $powerCurrent = isset($data['Power']['value']) ? (int)$data['Power']['value'] : 0;
# NOT: * 1000

# Check database has correct values
php /p1mon/www/custom/scripts/check-db-values.php
# Should show power: ~100-200 W (not 100000+)

# Test API
php /p1mon/www/custom/scripts/quick-api-test.php
# Should show: ✅ CORRECT - API matches database

# Manual data collection
php /p1mon/www/custom/scripts/solar-collector.php --verbose --force

# View API response
curl "http://localhost/custom/api/solar.php?action=current" | jq
```

## Context for AI Assistant

- User is experienced with PHP/JS/CSS
- Prefers clean, sustainable solutions over quick hacks
- System is production P1 Monitor installation
- User has already: electricity dashboard, gas dashboard working
- Architecture: Pure PHP backend, vanilla JS frontend, no frameworks
- Coding style: Matches existing P1 Monitor patterns
- Database: SQLite for simplicity
- Server: Apache/Nginx running P1 Monitor

## Summary

Phase 3 backend complete. Critical bug fixed (power units). Database reinitialized. API working correctly. Ready for Phase 4 frontend implementation following electricity dashboard patterns.