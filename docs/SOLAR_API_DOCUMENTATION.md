# Solar API Documentation

## Overview
The Solar API provides access to solar panel production data from your Solplanet-monitored system (14×270Wp = 3,780Wp capacity).

## Base URL
```
/p1mon/www/custom/api/solar.php
```

## Endpoints

### 1. Current/Realtime Data
Get the most recent solar production data and today's summary.

**Request:**
```
GET /api/solar.php?action=current
```

**Response:**
```json
{
    "current": {
        "power": 1870,              // Current power output in Watts
        "timestamp": 1736956800     // Unix timestamp of reading
    },
    "today": {
        "energy": 2800,             // Energy produced today in Wh
        "peak_power": 2950,         // Peak power today in W
        "peak_time": "13:45:00",    // Time of peak power
        "sunlight_hours": 6.5,      // Hours with meaningful production
        "capacity_factor": 31.2     // Percentage of rated capacity
    },
    "month": {
        "energy": 23400,            // Energy produced this month in Wh
        "avg_daily": 1560,          // Average daily production in Wh
        "days_with_data": 15        // Days with production data
    },
    "system": {
        "capacity": 3780,           // System capacity in Wp
        "inverter": "Zeversolar 3000TL",
        "panels": 14
    }
}
```

---

### 2. Historical Data (Hourly)
Get production data aggregated by hour.

**Request:**
```
GET /api/solar.php?period=hours&zoom=24
```

**Parameters:**
- `period`: Must be "hours"
- `zoom`: Number of hours (typically 24, 48, or 72)

**Response:**
```json
{
    "period": "hours",
    "zoom": 24,
    "chartData": [
        {
            "timestamp": "2026-01-15 14:00:00",
            "unixTimestamp": 1736950800,
            "production": 2.850,        // kWh produced in this hour
            "power": 2450,              // Average power in W
            "powerMax": 2980            // Peak power in W
        }
        // ... more hourly records
    ],
    "stats": {
        "totalEnergy": 18.45,           // Total kWh for period
        "avgPower": 1823,               // Average power in W
        "peakPower": {
            "value": 2980,              // Peak power in W
            "time": "2026-01-15 13:30:00"
        }
    }
}
```

---

### 3. Historical Data (Daily)
Get production data aggregated by day.

**Request:**
```
GET /api/solar.php?period=days&zoom=7
```

**Parameters:**
- `period`: Must be "days"
- `zoom`: Number of days (typically 7, 14, or 30)

**Response:**
```json
{
    "period": "days",
    "zoom": 7,
    "chartData": [
        {
            "timestamp": "2026-01-15",
            "unixTimestamp": 1736899200,
            "production": 12.450,       // kWh produced this day
            "powerMax": 2980,           // Peak power in W
            "sunlightHours": 7.2,       // Hours with meaningful production
            "capacityFactor": 13.7      // % of rated capacity
        }
        // ... more daily records
    ],
    "stats": {
        "totalEnergy": 85.20,           // Total kWh for period
        "avgDaily": 12.17,              // Average kWh per day
        "peakPower": {
            "value": 2980,
            "time": "2026-01-15 13:30:00"
        },
        "capacityFactor": 13.7          // Average % for period
    }
}
```

---

### 4. Historical Data (Monthly)
Get production data aggregated by month.

**Request:**
```
GET /api/solar.php?period=months&zoom=12
```

**Parameters:**
- `period`: Must be "months"
- `zoom`: Number of months (typically 12 or 24)

**Response:**
```json
{
    "period": "months",
    "zoom": 12,
    "chartData": [
        {
            "timestamp": "2026-01",
            "unixTimestamp": 1735689600,
            "production": 245.80,       // kWh produced this month
            "powerMax": 3050,           // Peak power in W
            "avgDaily": 7.93,           // Average kWh per day
            "daysWithData": 31          // Days with data
        }
        // ... more monthly records
    ],
    "stats": {
        "totalEnergy": 2450.50,         // Total kWh for period
        "avgMonthly": 204.21,           // Average kWh per month
        "peakPower": {
            "value": 3050,
            "time": null
        }
    }
}
```

---

### 5. Historical Data (Yearly)
Get production data aggregated by year.

**Request:**
```
GET /api/solar.php?period=years&zoom=5
```

**Parameters:**
- `period`: Must be "years"
- `zoom`: Number of years (typically 5 or 10)

**Response:**
```json
{
    "period": "years",
    "zoom": 5,
    "chartData": [
        {
            "timestamp": "2026",
            "unixTimestamp": 1735689600,
            "production": 3250.40,      // kWh produced this year
            "powerMax": 3100,           // Peak power in W
            "avgMonthly": 270.87,       // Average kWh per month
            "monthsWithData": 12        // Months with data
        }
        // ... more yearly records
    ],
    "stats": {
        "totalEnergy": 14520.80,        // Total kWh for period
        "avgYearly": 2904.16,           // Average kWh per year
        "peakPower": {
            "value": 3100,
            "time": null
        }
    }
}
```

---

## Data Units

### Power (Instantaneous)
- **W (Watts)**: Used for `power`, `powerMax`
- Represents instantaneous generation rate

### Energy (Accumulated)
- **kWh (Kilowatt-hours)**: Used for `production`, `totalEnergy`, `avgDaily`, etc.
- Represents actual energy produced over time
- Backend stores as Wh, API converts to kWh (÷ 1000)

### Capacity Factor
- **Percentage (%)**: Ratio of actual to theoretical maximum production
- Formula: `(energy_produced / (3780W × hours)) × 100`
- Example: 30% means system produced 30% of its theoretical max

### Sunlight Hours
- **Hours (decimal)**: Time periods with meaningful production (>10W average)
- Not the same as daylight hours
- Indicates productive generation time

---

## Error Responses

### Database Not Available
```json
{
    "error": "Database not available"
}
```

### Invalid Period
Defaults to "hours" if invalid period provided.

### No Data Available
```json
{
    "period": "days",
    "zoom": 7,
    "chartData": [],
    "stats": {
        "totalEnergy": 0,
        "avgDaily": 0,
        "peakPower": {
            "value": 0,
            "time": null
        }
    }
}
```

---

## Usage Examples

### JavaScript (Frontend)
```javascript
// Get current data
const response = await fetch('/custom/api/solar.php?action=current');
const data = await response.json();
console.log(`Current power: ${data.current.power}W`);

// Get last 24 hours
const history = await fetch('/custom/api/solar.php?period=hours&zoom=24');
const chartData = await history.json();
chartData.chartData.forEach(point => {
    console.log(`${point.timestamp}: ${point.production} kWh`);
});
```

### Command Line (Testing)
```bash
# Current data
curl "http://localhost/custom/api/solar.php?action=current" | jq

# Last week
curl "http://localhost/custom/api/solar.php?period=days&zoom=7" | jq

# Last year
curl "http://localhost/custom/api/solar.php?period=months&zoom=12" | jq
```

---

## Integration with Frontend

The API is designed to match the electricity API structure, making frontend integration straightforward:

1. **Same period/zoom parameters**
2. **Similar chartData structure** (timestamp, unixTimestamp, value fields)
3. **Compatible stats objects**
4. **Consistent JSON formatting**

This allows reusing chart rendering code from electricity dashboard with minimal modifications.