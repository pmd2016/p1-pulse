# Phase 6 Solar Data Backfill - Handover Summary

## Objective
Populate P1 Monitor's solar database with historical production data from Solplanet API to enable immediate chart functionality instead of waiting weeks for live collection.

## Current Status

### ✅ Completed
- **API Discovery**: Identified working endpoint `getPlantOutput('bydays', date)` returns 72 × 20-minute power readings per day
- **Backfill Script Created**: `solar-backfill.php` fetches historical data, processes into hourly/daily/monthly/yearly aggregations
- **Validation Script Created**: `validate-solar-data.php` checks data quality, record counts, gaps, aggregations
- **Schema Verification**: Confirmed backfill script matches `init-solar-database.php` schema exactly
- **API Fix Deployed**: Fixed `solar.php` API to use `ORDER BY DESC LIMIT N` instead of time-range filtering (works with historical data)
- **Data Import Successful**: 174 hourly records, 7 daily records imported

### ⚠️ Critical Bug Discovered
**Major unit conversion error in imported data:**
- Solplanet shows: 6.74 kWh (2026-01-14)
- solar.db shows: 0.007 kWh (same day)
- Ratio: ~1000× too small

**Database record for 2026-01-16:**
```
energy_produced: 2896 Wh = 2.896 kWh
power_peak: 730 W
```

**Expected from API test (2026-01-16):**
```
Peak: 730W at 12:40 ✓ (correct)
Total: ~7.3 kWh ✗ (database has 2.896 kWh = 2896 Wh)
```

**Discrepancy**: Database has ~2.9 kWh but should have ~7.3 kWh

## Root Cause Analysis

### API Response Format (from discovery test)
```json
{
  "dataunit": "W",
  "data": [
    {"time": "08:40", "value": "62.00"},   // Power in Watts
    {"time": "12:40", "value": "730.00"},  // Peak
    ...
  ]
}
```

### Backfill Processing Logic
```php
// For each 20-minute interval:
$powerW = floatval($point['value']);  // e.g., 730W
$energyWh = $powerW * (20 / 60);      // Energy = Power × Time
$dailyTotalWh += $energyWh;           // Sum all intervals
```

### Issue Hypothesis
**The calculation is mathematically correct** but produces values ~3× too low:
- Expected: 7.3 kWh
- Actual: 2.9 kWh
- Factor: ~2.5×

**Possible causes:**
1. **Missing intervals**: API returns 72 points but some might be zero/missing
2. **Power vs Energy confusion**: API might return energy per interval (not power)
3. **Unit mismatch**: "dataunit: W" might be incorrect, could be Wh per 20-min interval
4. **Integration error**: 20-minute power readings need different integration method

## Key Data Points

### System Specifications
- Capacity: 3780W (14 × 270Wp panels)
- Inverter: Zeversolar 3000TL
- Location: Zwolle, NL
- Winter production typical: 5-15 kWh/day

### Database Schema (Confirmed Correct)
```sql
solar_hourly (
  energy_produced INTEGER,  -- Wh
  power_avg INTEGER,        -- W
  power_max INTEGER         -- W
)

solar_daily (
  energy_produced INTEGER,  -- Wh
  power_peak INTEGER,       -- W
  capacity_factor REAL      -- %
)
```

### Backfill Data Flow
```
API: 72 × 20-min power readings (W)
  ↓
Calculate: Energy per interval = Power × (20/60) hours
  ↓
Aggregate: Sum into hourly buckets
  ↓
Store: energy_produced in Wh (integer)
```

## What Has Been Tried

### ✅ Working
- API connectivity and authentication
- Data retrieval from Solplanet
- Database insertion (schema matches)
- Chart rendering (after API fix)
- Duplicate detection (--force flag)

### ❌ Not Working
- Energy totals are ~3× too low
- Unit conversion appears incorrect

### Not Yet Tested
- Direct comparison: Solplanet API response vs what's stored
- Alternative calculation methods (trapezoidal integration, average power)
- Verification that all 72 intervals are processed
- Check if API "power" values are actually energy values

## Important Constraints

### API Limitations
- End User API (not Pro API)
- `getInverterData()` returns 403 Forbidden
- Must use `getPlantOutput('bydays')` only
- Rate limit: 6 calls/min safe, 100/min max
- 20-minute granularity only

### Database Requirements
- Units: Wh for energy, W for power (integers)
- All aggregations must match schema
- Must be idempotent (safe re-run)
- Must not interfere with live collector

### Time Range Issues
- Backfilled data is historical (past dates)
- API queries by date, not time range
- Must get "most recent N records" not "last N hours from now"

## Open Questions

1. **What does API actually return?**
   - Is "value" in API response power (W) or energy (Wh)?
   - Does "dataunit: W" mean instantaneous power or energy per interval?
   - Are there missing/zero intervals in the 72 points?

2. **How does Solplanet calculate daily totals?**
   - Do they use same 72 × 20-min intervals?
   - Different integration method?
   - Different data source internally?

3. **What's the correct conversion?**
   - Current: `Energy = Power × (20/60)` → too low by ~3×
   - Alternative: `Energy = Value directly` (if API returns Wh already)?
   - Alternative: `Energy = Power × (1/3)` with different assumption?

## Recommended Next Steps

### Immediate Action: Diagnostic Script
Create script to directly compare API response to database storage:

```php
// For a specific known date (e.g., 2026-01-14):
1. Fetch API response for that date
2. Show all 72 power values
3. Calculate energy using current method
4. Calculate energy using alternative methods
5. Compare to Solplanet dashboard value
6. Compare to database stored value
```

### Investigation Path
```
1. Dump raw API response for 2026-01-14
   → Verify all 72 values present
   → Check if any are zero/missing
   
2. Manual calculation with actual values
   → Sum all power values
   → Try: sum × (20/60) / 1000 = kWh
   → Try: sum / 3 / 1000 = kWh (if values are Wh not W)
   → Try: sum / 1000 = kWh (if already total Wh)
   
3. Compare manual result to Solplanet's 6.74 kWh
   → Identify which formula matches
   
4. Fix backfill script with correct formula
   
5. Re-run: php solar-backfill.php --days=7 --force
```

### Files Ready for Debugging
- `solar-backfill.php` - contains current (potentially wrong) calculation
- `diagnose-solar-api.php` - checks API response format
- `validate-solar-data.php` - verifies database after fix

## Critical Code Section (Needs Fix)

**Location**: `solar-backfill.php` lines ~185-200

```php
foreach ($dataPoints as $point) {
    $time = $point['time']; // "HH:MM"
    $powerW = floatval($point['value']); // ← Is this really power?
    
    $energyWh = $powerW * (20 / 60); // ← Is this formula correct?
    $dailyTotalWh += $energyWh;
}
```

**This is where the bug likely exists.** Need to determine correct interpretation of `$point['value']`.

## Success Criteria
- Daily totals in solar.db match Solplanet dashboard (±5%)
- Capacity factor calculations reasonable (5-25% winter)
- Hourly aggregations sum to daily totals
- Charts display accurate production data