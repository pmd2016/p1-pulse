# Phase 6 Parallel Work: Historical Data Backfill

## Objective
Populate solar database with historical production data from Solplanet API to enable meaningful charts immediately, rather than waiting weeks/months for new data collection.

## Why Do This Now
- Phase 3 complete: API and database structure proven
- Phase 4 frontend: Will benefit from historical data for testing
- API available: Solplanet stores historical data
- Non-blocking: Can run in parallel with Phase 4 development

## Current Database State
- **Realtime table**: 1 record (just started fresh collection)
- **Hourly table**: Empty (needs aggregation from realtime)
- **Daily table**: Empty
- **Monthly table**: Empty  
- **Yearly table**: Empty

Target: Backfill 30+ days minimum for useful charts.

## Available API Endpoints

From Phase 2 documentation, Solplanet API has historical endpoints:

### Known Endpoints
1. **getPlantOverview()** - Current snapshot only
2. **getInverterData($sn)** - Inverter status (may have date param)
3. **Possibly**: Historical data endpoints (need to discover)

### What We Need to Find
- Does API support date range queries?
- What's the maximum historical range available?
- Response format for historical data
- Rate limits for bulk requests

## Implementation Strategy

### Phase 6a: API Discovery (30 min)
1. **Check SolplanetAPI.php methods**:
   ```bash
   grep "function get" /p1mon/www/custom/lib/SolplanetAPI.php
   ```
   Look for historical/date-related methods

2. **Test historical calls** (create discovery script):
   - Try date parameters on existing methods
   - Check Python reference: https://github.com/PatMan6889/AISWEI-Solplanet-Cloud-API
   - Look for methods like: `getHistoricalData()`, `getEnergyByDate()`, etc.

3. **Document findings**:
   - Available methods
   - Date range limits
   - Response format
   - Rate limits

### Phase 6b: Backfill Script (1-2 hours)

Create `/p1mon/www/custom/scripts/solar-backfill.php`:

**Key Requirements:**
```php
// Strategy: Fill from newest to oldest (so recent data available ASAP)

// 1. Determine last existing data point in database
// 2. Request data from Solplanet API for missing date range
// 3. Insert into solar_realtime with proper timestamps
// 4. Trigger aggregation for each complete hour/day/month
// 5. Respect API rate limits (6 calls/min safe, 100/min max)
// 6. Progress logging
// 7. Resume capability if interrupted
```

**Pseudo-structure:**
```php
<?php
// Backfill configuration
$startDate = '2025-12-15';  // Start from 1 month ago
$endDate = date('Y-m-d');   // Up to today
$batchSize = 24;            // Hours per API call (if supported)

// 1. Connect to database
// 2. Check what data already exists
// 3. Determine missing ranges
// 4. Loop through missing periods:
//    - Call API for period
//    - Parse response
//    - Insert realtime records
//    - Sleep to respect rate limits
//    - Trigger aggregation
// 5. Log progress
```

### Phase 6c: Data Validation (30 min)
After backfill:
```bash
# Check record counts
sqlite3 /p1mon/www/custom/data/solar.db "SELECT COUNT(*) FROM solar_hourly;"
sqlite3 /p1mon/www/custom/data/solar.db "SELECT COUNT(*) FROM solar_daily;"

# Verify data quality
sqlite3 /p1mon/www/custom/data/solar.db "SELECT date, energy_produced/1000 as kWh FROM solar_daily ORDER BY date DESC LIMIT 10;"

# Check for gaps
# (Create gap detection query)
```

## Critical Considerations

### API Response Format Unknown
**Problem**: Don't know if historical data uses same format as current data.

**Mitigation**:
1. Test one day first
2. Verify response structure matches expectations
3. Adjust parsing if needed

### Unit Conversions (CRITICAL)
**Must verify**: Historical API returns same units as current API?
- Power in W? (not KW)
- Energy in KWh? (need to convert to Wh)

**Check**: Create test that compares current vs historical format.

### Timestamp Handling
**Database expects**: Unix timestamps
**API might return**: ISO strings, local time, UTC

**Solution**: Convert all timestamps to Unix + verify timezone.

### Data Conflicts
**Problem**: Backfill might overlap with live collector.

**Prevention**:
- Use `INSERT OR IGNORE` for realtime
- Or stop collector during backfill
- Or backfill only up to 1 day before current

### Aggregation Performance
**Problem**: Aggregating 30 days × 24 hours = 720 records might be slow.

**Solution**:
- Aggregate in batches (per day)
- Only aggregate complete periods
- Monitor script execution time

## Recommended Backfill Targets

### Minimum (Quick Win)
- **7 days** of hourly data
- Enables: Meaningful hourly/daily charts immediately
- Time: ~5-10 minutes to backfill
- API calls: ~168 hours ≈ 28 calls (if hourly batches)

### Optimal (Good Charts)
- **30 days** of hourly data  
- Enables: Full daily charts, monthly view starts working
- Time: ~20-30 minutes to backfill
- API calls: ~720 hours ≈ 120 calls

### Maximum (Full History)
- **All available history** from API
- Enables: Complete yearly views, trend analysis
- Time: Unknown (depends on API limits)
- API calls: Could be thousands

**Start with minimum, expand if API supports it.**

## Rate Limit Strategy

### Conservative Approach (Recommended)
```php
$callDelay = 10; // seconds between calls = 6 calls/min
// For 168 hours (7 days): ~28 min total
```

### Aggressive Approach (If Needed)
```php  
$callDelay = 1; // seconds between calls = 60 calls/min
// For 168 hours (7 days): ~3 min total
// Risk: Might hit rate limit
```

### Batch Approach (If API Supports)
```php
// Request full day at once instead of hourly
// Reduces API calls by 24x
// Check if API supports date range queries
```

## Data Quality Checks

### Must Verify
1. **Power values reasonable**: 0-3780W range
2. **Energy values sensible**: Daily totals 0-30 kWh typical
3. **No gaps**: Consecutive timestamps
4. **No duplicates**: UNIQUE constraint working
5. **Aggregations correct**: Hourly sums = daily totals

### Red Flags
- Power > 3780W (system max)
- Power values still 1000x too large (unit bug not fixed in historical)
- Negative energy values
- Missing hours in a day
- Capacity factor > 100%

## Example Discovery Script

```php
#!/usr/bin/env php
<?php
/**
 * Discover Solplanet historical data API capabilities
 */

require_once '/p1mon/www/custom/lib/SolarConfig.php';
require_once '/p1mon/www/custom/lib/SolplanetAPI.php';

// Load credentials
$api = new SolplanetAPI(
    SolarConfig::get('app_key'),
    SolarConfig::get('app_secret'),
    SolarConfig::get('api_key'),
    SolarConfig::get('token'),
    SolarConfig::get('sn')
);

echo "Testing Historical Data API...\n\n";

// Test 1: Check available methods
echo "Available methods in SolplanetAPI:\n";
$methods = get_class_methods($api);
foreach ($methods as $method) {
    if (stripos($method, 'get') === 0) {
        echo "  - $method\n";
    }
}
echo "\n";

// Test 2: Try yesterday's data
$yesterday = date('Y-m-d', strtotime('-1 day'));
echo "Testing date parameter: $yesterday\n";

try {
    // Try different method signatures
    // $data = $api->getHistoricalData($yesterday);
    // $data = $api->getInverterData($sn, $yesterday);
    // $data = $api->getEnergyData($yesterday);
    
    echo "Method found! Response:\n";
    print_r($data);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

// Test 3: Check Python reference
echo "\nCheck Python library for historical methods:\n";
echo "https://github.com/PatMan6889/AISWEI-Solplanet-Cloud-API/blob/master/solplanet_api.py\n";
```

## Deliverables for Phase 6

### Required
1. **Discovery script** - Find historical API methods
2. **Backfill script** - Populate database with historical data
3. **Validation script** - Verify data quality

### Optional
4. **Gap filler** - Detect and fill missing periods
5. **Re-aggregation** - Rebuild aggregations if data changes

## Success Criteria

- [ ] Historical API method identified
- [ ] Response format documented
- [ ] 7+ days of hourly data in database
- [ ] Aggregations populated (daily/monthly tables)
- [ ] Data quality verified (power in 0-3780W range)
- [ ] No gaps in timeline
- [ ] Frontend charts display historical data
- [ ] Backfill script can be re-run safely

## Risks & Mitigations

### Risk: API Doesn't Support Historical Data
**Mitigation**: Accept current data only, wait for natural accumulation

### Risk: Historical Data Uses Different Format
**Mitigation**: Create adapter/parser, validate carefully

### Risk: Rate Limit Hit During Backfill
**Mitigation**: Add delays, retry logic, resume capability

### Risk: Backfill Conflicts with Live Collection
**Mitigation**: Temporarily stop cron, or use `INSERT OR IGNORE`

## Timeline Estimate

### Discovery (Day 1)
- 30 min: Find API methods
- 30 min: Test historical calls
- 30 min: Document response format
**Total: 1.5 hours**

### Implementation (Day 1-2)
- 1 hour: Create backfill script
- 30 min: Test with 1 day
- 30 min: Run full backfill (7-30 days)
- 30 min: Validate data
**Total: 2.5 hours**

### Grand Total: ~4 hours
Can be split across multiple sessions.

## Integration with Phase 4

### Coordination
- Phase 4 frontend can develop with placeholder data
- Once backfill complete, refresh frontend
- Historical charts immediately useful for testing

### Testing Benefits
- Frontend developer sees realistic charts
- Can test zoom levels with real data
- Edge cases visible (cloudy days, zero production)

## Next Steps

1. **Start discovery**: Run discovery script to find API methods
2. **Share findings**: Post what historical methods exist
3. **Create backfill**: Build script based on API capabilities
4. **Run backfill**: Start with 7 days (safe, quick)
5. **Validate**: Check data quality
6. **Expand**: If successful, backfill more history

## Quick Reference

```bash
# Check if historical methods exist
grep "function" /p1mon/www/custom/lib/SolplanetAPI.php | grep -i hist

# Test API method
php discover-historical-api.php

# Run backfill (once created)
php solar-backfill.php --days=7 --verbose

# Validate results
sqlite3 /p1mon/www/custom/data/solar.db "SELECT date, energy_produced/1000 FROM solar_daily ORDER BY date DESC LIMIT 10;"
```

## Context for AI Assistant

- User wants historical data to make Phase 4 frontend immediately useful
- Willing to work in parallel on Phase 6 while Phase 4 develops
- Prefers starting small (7 days) then expanding
- Database structure is solid (tested in Phase 3)
- Collector bug is fixed (power units correct)
- API credentials already configured and working

## Status

**Phase 6 Status**: Not started - awaiting API discovery

**Blocker**: Need to identify which Solplanet API method provides historical data

**First Action**: Create and run discovery script to find historical API capabilities