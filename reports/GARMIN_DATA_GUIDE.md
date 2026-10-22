# Garmin enrichment: data guide

## Source and reconciliation

The untouched account export is `data/garmin_export/`; its original outer ZIP is also retained in `data/garmin_export.zip`. Fitness summaries are authoritative for the Garmin activity list. Uploaded FIT filenames are upload identifiers, not assumed to be Garmin activity IDs.

The importer starts from `data/pre_garmin.duckdb`, a preserved Strava snapshot. Matching requires a unique compatible sport/start/distance/timer combination. Exact start and timer can match calibrated-distance differences; a fallback allows near-start and closely matching distance/elapsed time. Every link and distance difference is recorded. Ambiguous overlapping records are retained separately and excluded from canonical counts.

Existing Strava keys and processed summaries stay unchanged. New activities use `activity_key = garmin:<Garmin ID>`. The dashboard cache ID for those activities is `garmin-<Garmin ID>`, while `sources.source_activity_id` retains the native Garmin ID. Do not sum activity distances after joining multiple provider sources.

One Garmin run (`5351268312`, 2020-08-07) is potentially a longer version of Strava `3879731046`: start times differ by three seconds, but the distances are about 5.10 km versus 1.24 km. It is held in `garmin_match_review` rather than silently merged or counted twice.

## Dashboard mechanics analyses

The **Dynamics & recovery** section keeps road, treadmill, track, and trail separate and now includes:

- Monthly mechanics trends for cadence, stride length, ground contact, vertical oscillation, vertical ratio, power, VO₂ max estimate, and training effect.
- Pace-band comparisons using medians of activity averages. Bands with fewer than five measured runs are omitted from the chart.
- Year-by-year median pace and mechanics, with run counts so sparse years remain visible.
- Long-run durability for 18 km, 25 km, or 30 km thresholds. Each run compares 25–50% of recorded distance with 75–98%, then contributes one change value to the cohort median. This prevents sample-rich recordings from dominating.

The durability analysis excludes the first quarter to reduce warm-up effects and the last 2% to reduce stopping artefacts. Pace, terrain, wind, workout design, sensor changes, and treadmill calibration remain confounders. The mechanics are observations, not automatic technique targets or a direct measurement of oxygen-cost running economy.

## Queryable tables

| Table | Contents |
|---|---|
| `activity_features` | One row per canonical activity with Garmin dynamics and training metrics joined safely |
| `activities` | Canonical merged activity history; Strava values preserved for matched activities |
| `garmin_activity_metrics` | Garmin activity ID, summary times/distances, running dynamics, VO₂ max, power, training effect/load, threshold HR, original JSON |
| `garmin_matches` | Match method and Garmin-minus-Strava distance difference |
| `garmin_match_review` | Possible overlaps requiring review |
| `garmin_recordings` | FIT archive member, SHA-256 and linked canonical activity |
| `samples`, `laps`, `sessions`, `events` | Existing original recordings plus decoded Garmin-only activities |
| `garmin_sleep` | Sleep stages summed into sleep seconds, awake seconds, sleep score, source date |
| `garmin_daily` | Daily resting HR, steps, stress and observed duration |
| `garmin_health_status` | Source health metrics and Garmin baseline/status labels |
| `garmin_daily_metrics` | Readiness, weekly-average HRV, VO₂ max, acute/chronic load, race predictions |
| `garmin_raw_records` | Queryable original records from fitness, wellness, metrics and daily aggregator JSON, including biometrics, zones, training history and other fields not normalized yet |

All these tables are exported to `data/parquet/` for use outside DuckDB. New Garmin recordings also have per-activity Parquet in `data/recordings/garmin-<ID>/`. Original uploaded monitoring FIT files remain in their source ZIPs; all of their high-frequency monitoring messages are not flattened into the running sample table.

## Units and time

Garmin account summaries are not in the same units as FIT:

| Raw summary field | Conversion / normalized meaning |
|---|---|
| distance, elevationGain/Loss | centimetres ÷ 100 → metres |
| duration, elapsedDuration, movingDuration | milliseconds ÷ 1,000 → seconds |
| avgVerticalOscillation | centimetres × 10 → millimetres |
| avgStrideLength | centimetres ÷ 100 → metres per step |
| avgGroundContactTime | milliseconds |
| avgVerticalRatio | percent |
| avgGroundContactBalance | left contact-time percentage |
| avgDoubleCadence | steps/minute, both feet; do not double again |
| calories | kilojoules ÷ 4.184 → kcal |
| vO2MaxValue | Garmin VO₂ max estimate in mL/kg/min |

FIT dynamics are independently decoded using the FIT profile. Both source values remain available when calibration or processing changes a distance. Activity timestamps remain UTC. Wellness `calendar_date` is Garmin's source-local date; it must not be blindly equated with the UTC activity date around midnight or travel. Overlapping daily export records are reconciled; full original rows remain in `garmin_raw_records`. A partial latest day is identified by the daily duration field.

## What this does and does not measure

No explicit running-economy, step-speed-loss or stiffness key was found in the supplied fitness, metrics and wellness JSON. Running dynamics, running power, VO₂ max and Garmin training estimates are available, but are not substitutes for a directly measured oxygen-cost running-economy result. Unknown FIT fields are retained in the original recordings without invented definitions.

The dashboard offers setting-separated monthly dynamics medians, full-resolution-derived individual dynamics charts, and recovery history. Its HRV chart uses Garmin's **weekly average** field, not nightly RMSSD. VO₂ max and readiness remain device estimates. Mechanics comparisons must account for pace, grade, sensor, fatigue and conditions before interpreting technique.

## Refresh safely

```sh
# Index all uploaded originals (can take several minutes):
.venv/bin/python scripts/index_garmin.py
# Rebuild staging database from the preserved pre-Garmin snapshot:
.venv/bin/python scripts/import_garmin.py
# Decode/link new recordings, validate, export and promote the staging database:
.venv/bin/python scripts/finalize_garmin.py
# Rebuild all dashboard data and analysis:
.venv/bin/python scripts/build_dashboard.py
```

For this unchanged export, a completed `data/garmin_index.json` can be reused. Import + finalize must run as a pair; do not run finalization twice against the same staging database. For a different future export, re-index it and revisit the preserved base strategy. Strava's original standalone importer now refuses to overwrite an enriched dataset.
