# Phase 3 Installation Guide: Solar API Backend

## Overview
Phase 3 implements the backend API endpoint that serves solar production data to the frontend dashboard.

## Prerequisites
- ✅ Phase 2 complete (database exists at `/p1mon/www/custom/data/solar.db`)
- ✅ Data collector running (`solar-collector.php` via cron)
- ✅ At least 24-48 hours of collected data

## Installation Steps

### Step 1: Deploy API File
```bash
# Copy solar.php to API directory
sudo cp solar.php /p1mon/www/custom/api/solar.php
sudo chown www-data:www-data /p1mon/www/custom/api/solar.php
sudo chmod 644 /p1mon/www/custom/api/solar.php
```

### Step 2: Verify API Directory Structure
```bash
ls -la /p1mon/www/custom/api/
# Should show:
# solar.php  (newly added)
# (possibly other API files if they exist)
```

### Step 3: Test API Endpoints

#### Test 1: Current Data
```bash
curl "http://localhost/custom/api/solar.php?action=current" | jq
```

**Expected output:**
```json
{
  "current": {
    "power": 1870,
    "timestamp": 1736956800
  },
  "today": {
    "energy": 2800,
    "peak_power": 2950,
    "peak_time": "13:45:00",
    "sunlight_hours": 6.5,
    "capacity_factor": 31.2
  },
  "month": {
    "energy": 23400,
    "avg_daily": 1560,
    "days_with_data": 15
  },
  "system": {
    "capacity": 3780,
    "inverter": "Zeversolar 3000TL",
    "panels": 14
  }
}
```

#### Test 2: Hourly Data
```bash
curl "http://localhost/custom/api/solar.php?period=hours&zoom=24" | jq
```

**Expected output:**
```json
{
  "period": "hours",
  "zoom": 24,
  "chartData": [
    {
      "timestamp": "2026-01-15 14:00:00",
      "unixTimestamp": 1736950800,
      "production": 2.850,
      "power": 2450,
      "powerMax": 2980
    }
    // ... more records
  ],
  "stats": {
    "totalEnergy": 18.45,
    "avgPower": 1823,
    "peakPower": {
      "value": 2980,
      "time": "2026-01-15 13:30:00"
    }
  }
}
```

#### Test 3: Daily Data
```bash
curl "http://localhost/custom/api/solar.php?period=days&zoom=7" | jq
```

#### Test 4: Monthly Data
```bash
curl "http://localhost/custom/api/solar.php?period=months&zoom=12" | jq
```

#### Test 5: Yearly Data
```bash
curl "http://localhost/custom/api/solar.php?period=years&zoom=5" | jq
```

### Step 4: Run Comprehensive Test Script
```bash
# Copy test script
sudo cp test-solar-api.php /p1mon/www/custom/scripts/
sudo chmod +x /p1mon/www/custom/scripts/test-solar-api.php

# Run tests
php /p1mon/www/custom/scripts/test-solar-api.php
```

**Expected output:**
```
=============================================================================
SOLAR API TEST SCRIPT
=============================================================================

>>> Testing Current Data Endpoint

TEST: Get current/realtime solar data
--------------------------------------------------------------------------------
✅ SUCCESS
{
  "current": { ... },
  "today": { ... },
  ...
}

>>> Testing Hourly Historical Data

TEST: Get last 24 hours of data
--------------------------------------------------------------------------------
✅ SUCCESS
...

TEST SUITE COMPLETE
=============================================================================
```

## Troubleshooting

### Issue: "Database not available"
**Cause:** Database file doesn't exist or isn't readable

**Solution:**
```bash
# Check database exists
ls -la /p1mon/www/custom/data/solar.db

# If missing, run database initialization
php /p1mon/www/custom/scripts/init-solar-database.php

# Fix permissions if needed
sudo chown www-data:www-data /p1mon/www/custom/data/solar.db
sudo chmod 644 /p1mon/www/custom/data/solar.db
```

### Issue: Empty chartData arrays
**Cause:** No data collected yet

**Solution:**
```bash
# Check if collector is running
tail -f /tmp/solar-collector.log

# Force manual collection
php /p1mon/www/custom/scripts/solar-collector.php --verbose --force

# Wait 10 minutes and try again
# Or wait 24 hours for proper historical data
```

### Issue: API returns error 500
**Cause:** PHP syntax error or missing function

**Solution:**
```bash
# Check PHP error log
sudo tail -f /var/log/apache2/error.log
# or
sudo tail -f /var/log/nginx/error.log

# Test API file syntax
php -l /p1mon/www/custom/api/solar.php
```

### Issue: Permission denied accessing database
**Cause:** Web server can't read database file

**Solution:**
```bash
# Fix database permissions
sudo chown www-data:www-data /p1mon/www/custom/data/solar.db
sudo chmod 644 /p1mon/www/custom/data/solar.db

# Fix directory permissions
sudo chown www-data:www-data /p1mon/www/custom/data
sudo chmod 755 /p1mon/www/custom/data
```

## Verification Checklist

- [ ] API file deployed to `/p1mon/www/custom/api/solar.php`
- [ ] File has correct permissions (644, www-data:www-data)
- [ ] Current data endpoint returns valid JSON
- [ ] Hourly endpoint returns data for 24/48/72 hours
- [ ] Daily endpoint returns data for 7/14/30 days
- [ ] Monthly endpoint returns data (if available)
- [ ] Yearly endpoint returns data (if available)
- [ ] Stats calculations are correct (totals, averages, peaks)
- [ ] Timestamps are in correct format
- [ ] Energy units are in kWh (not Wh)
- [ ] Power units are in W

## API Response Data Quality Checks

### Hourly Data Validation
```bash
# Check that production values make sense
curl -s "http://localhost/custom/api/solar.php?period=hours&zoom=24" | jq '.chartData[].production'

# Should see values like:
# 0.000 (nighttime)
# 2.850 (peak production)
# 0.150 (morning/evening)
```

### Daily Data Validation
```bash
# Check capacity factor is reasonable (0-100%)
curl -s "http://localhost/custom/api/solar.php?period=days&zoom=7" | jq '.chartData[].capacityFactor'

# Should see values like:
# 12.5
# 15.8
# 8.3  (cloudy day)
# 0.0  (no sun)
```

### Stats Validation
```bash
# Verify peak power and time are set
curl -s "http://localhost/custom/api/solar.php?period=hours&zoom=24" | jq '.stats.peakPower'

# Should see:
# {
#   "value": 2980,
#   "time": "2026-01-15 13:30:00"
# }
```

## Next Steps

Once all tests pass:

1. **Proceed to Phase 4:** Frontend dashboard implementation
   - Create `/p1mon/www/custom/pages/solar.php`
   - Create `/p1mon/www/custom/assets/js/solar.js`
   - Create `/p1mon/www/custom/assets/css/solar.css`

2. **Test frontend integration:**
   - Verify charts render correctly
   - Test period switching (hours/days/months/years)
   - Test zoom controls
   - Verify statistics display

3. **Phase 5:** Header widget and navigation integration

## Files Created in Phase 3

```
/p1mon/www/custom/
├── api/
│   └── solar.php                    # ✅ Main API endpoint
├── scripts/
│   └── test-solar-api.php           # ✅ Test script
└── docs/
    ├── SOLAR_API_DOCUMENTATION.md   # ✅ API reference
    └── PHASE3_INSTALLATION.md       # ✅ This file
```

## Support

If you encounter issues:

1. Check `/var/log/apache2/error.log` for PHP errors
2. Run `php solar-diagnostics.php` to verify database status
3. Ensure collector has run for at least 24 hours
4. Verify database has data: `sqlite3 /p1mon/www/custom/data/solar.db "SELECT COUNT(*) FROM solar_hourly;"`

## Status: Phase 3 Complete ✅

The backend API is now ready to serve solar data to the frontend dashboard!