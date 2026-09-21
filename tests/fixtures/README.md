# API Fixtures

Captured responses from the P1 Monitor API and the custom solar API, used to exercise
the data-shaping code without a live device.

Generate them by running, **on the P1 Monitor host**:

```bash
php scripts/dump-fixtures.php --anonymise
```

## Privacy: only commit anonymised fixtures

This repository is public. A raw dump contains real meter readings and the hourly
consumption pattern of a specific household, which is a reliable occupancy signal —
it shows when the house is empty. Do not commit one.

`--anonymise` applies a whole-day date shift and multiplies every measurement by a
single constant factor. Because the factor is constant, the fixtures stay internally
consistent: sums still equal the sum of their parts, and ratios between series are
preserved — so a discrepancy such as the solar backfill issue remains visible and
diagnosable.

It is a reasonable precaution, not a guarantee. The *shape* of consumption survives by
design, because that is what makes the fixtures useful. Treat anonymised fixtures as
publishable, not as anonymous.

Weather fields, counts, durations, identifiers and enumerations are left untouched.

## Layout

```
tests/fixtures/
├── manifest.json        what was captured, what failed, and whether it was anonymised
├── p1/                  P1 Monitor API responses (as received, with json=object)
│   ├── smartmeter.json
│   ├── powergas-{hour,day,month,year}.json
│   ├── financial-{day,month,year}.json
│   ├── weather-{current,hour,day,month,year}.json
│   ├── watermeter-{day,month}.json
│   ├── status.json
│   └── configuration.json
└── solar/               custom solar API responses
    ├── current.json
    └── {hours-24,hours-72,days-7,days-30,months-12,years-5}.json
```

## Reading manifest.json

Always check the manifest before trusting a fixture's absence or emptiness. Each entry
records the HTTP status, record count, byte size and any error.

An empty `watermeter-*` fixture is expected on an installation without a water meter:
P1 Monitor answers 200 with `[]` rather than 404, so the entry is `ok` with
`records: 0`. Any non-`ok` entry is a real problem worth chasing — an empty fixture and
a failed fetch look identical once written to disk, which is exactly what the manifest
is there to disambiguate.

`anonymised`, `scale_factor` and `date_offset_s` record how the data was transformed.
`base_url` is redacted in anonymised runs.
