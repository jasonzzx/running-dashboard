#!/usr/bin/env python3
"""Offline FIT/ZIP importer. Originals are never modified; rebuilds derived data."""
import collections
import datetime as dt
import gzip
import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path

import duckdb
from fitparse import FitFile

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
OUT = ROOT / 'data/normalized'
PARQUET = ROOT / 'data/parquet'


def serial(value):
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    raise TypeError(type(value).__name__)


def utc(value):
    return value.replace(tzinfo=dt.timezone.utc).isoformat() if isinstance(value, dt.datetime) else None


def preferred(v, *keys):
    return next((v[k] for k in keys if v.get(k) is not None), None)


def members(name, data, depth=0):
    if depth > 5:
        raise ValueError('Archive nesting exceeds limit')
    if name.lower().endswith('.zip'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for item in archive.infolist():
                if not item.is_dir():
                    if item.file_size > 2_000_000_000:
                        raise ValueError('Archive member exceeds 2GB')
                    yield from members(name + '::' + item.filename, archive.read(item), depth + 1)
    elif name.lower().endswith('.gz'):
        yield from members(name[:-3], gzip.decompress(data), depth + 1)
    else:
        yield name, data


def cadence(v, key, fractional, running):
    n = v.get(key)
    return (n + (v.get(fractional) or 0)) * (2 if running else 1) if n is not None else None


def main():
    if (ROOT / "reports/strava_import_report.json").exists():
        raise SystemExit("Full Strava dataset exists. Use scripts/import_strava.py; pilot importer cannot overwrite it.")
    for folder in (OUT, PARQUET, ROOT / 'reports'):
        folder.mkdir(parents=True, exist_ok=True)
    rows = {k: [] for k in ('activities', 'laps', 'events', 'sources', 'inventory')}
    counts = collections.Counter()
    seen = set()
    errors = []
    temp_samples = OUT / 'samples.jsonl.tmp'
    with temp_samples.open('w') as samples:
        for path in sorted(RAW.rglob('*')):
            if not path.is_file() or path.name.startswith('.'):
                continue
            source = path.relative_to(RAW).parts[0]
            if path.suffix.lower() not in ('.zip', '.fit', '.gz', '.json', '.csv', '.tcx', '.gpx'):
                continue
            try:
                for name, data in members(str(path.relative_to(ROOT)), path.read_bytes()):
                    digest = hashlib.sha256(data).hexdigest()
                    is_fit = name.lower().endswith('.fit')
                    rows['inventory'].append(dict(source=source, path=name, sha256=digest,
                        bytes=len(data), status='fit' if is_fit else 'preserved_not_normalized'))
                    if not is_fit:
                        continue
                    rows['sources'].append(dict(file_key=digest, source=source, path=name))
                    if digest in seen:
                        counts['exact_duplicate_files'] += 1
                        continue
                    # Parse the entire FIT before adding rows, so corrupt files cannot partly import.
                    messages = list(FitFile(data, check_crc=True).get_messages())
                    sessions = [m.get_values() for m in messages if m.name == 'session']
                    if not sessions:
                        rows['inventory'][-1]['status'] = 'fit_without_activity_session'
                        continue
                    seen.add(digest)
                    counts['fit_files'] += 1
                    raw_messages = OUT / (digest + '.fit_messages.jsonl.gz')
                    with gzip.open(raw_messages, 'wt') as raw_output:
                        for i, m in enumerate(messages):
                            raw_output.write(json.dumps(dict(file_key=digest, sequence=i,
                                message=m.name, values=m.get_values(),
                                units={f.name:f.units for f in m if f.units}), default=serial) + '\n')
                    running = len(sessions) == 1 and sessions[0].get('sport') == 'running'
                    sample_count = sum(m.name == 'record' for m in messages)
                    unknown_count = sum(m.name.startswith('unknown_') for m in messages)
                    for i, v in enumerate(sessions):
                        match = re.search(r'(\d{8,})', name.split('::')[-1])
                        distance, timer = v.get('total_distance'), v.get('total_timer_time')
                        rows['activities'].append(dict(activity_key=f'{digest}:{i}', file_key=digest,
                            source=source, source_activity_id=match.group(1) if match else None,
                            session_index=i, start_utc=utc(v.get('start_time')), sport=v.get('sport'),
                            sub_sport=v.get('sub_sport'), distance_m=distance,
                            timer_s=timer, elapsed_s=v.get('total_elapsed_time'),
                            moving_s=v.get('total_moving_time'),
                            avg_pace_s_km=timer * 1000 / distance if timer and distance else None,
                            avg_hr_bpm=v.get('avg_heart_rate'), max_hr_bpm=v.get('max_heart_rate'),
                            avg_cadence_spm=cadence(v, 'avg_running_cadence', 'avg_fractional_cadence', True) if v.get('sport')=='running' else None,
                            ascent_m=v.get('total_ascent'), descent_m=v.get('total_descent'),
                            avg_power_w=v.get('avg_power'), sample_count=sample_count,
                            unknown_message_count=unknown_count,
                            quality_flags='multi_session_file_samples_unassigned' if len(sessions)>1 else '',
                            raw_json=json.dumps(v, default=serial)))
                    indices = collections.Counter()
                    for m in messages:
                        v = m.get_values()
                        kind = m.name
                        n = indices[kind]
                        indices[kind] += 1
                        base = dict(file_key=digest, sequence=n)
                        if kind == 'record':
                            lat, lon = v.get('position_lat'), v.get('position_long')
                            row = dict(base, timestamp_utc=utc(v.get('timestamp')),
                                distance_m=v.get('distance'), speed_m_s=preferred(v,'enhanced_speed','speed'),
                                altitude_m=preferred(v,'enhanced_altitude','altitude'),
                                hr_bpm=v.get('heart_rate'), cadence_raw=v.get('cadence'),
                                cadence_spm=cadence(v,'cadence','fractional_cadence', True) if running else None,
                                power_w=v.get('power'), temperature_c=v.get('temperature'),
                                latitude_deg=lat*180/2**31 if lat is not None else None,
                                longitude_deg=lon*180/2**31 if lon is not None else None,
                                ground_contact_ms=v.get('stance_time'),
                                vertical_oscillation_mm=v.get('vertical_oscillation'),
                                step_length_mm=v.get('step_length'))
                            samples.write(json.dumps(row, default=serial) + '\n')
                            counts['samples'] += 1
                        elif kind == 'lap':
                            rows['laps'].append(dict(base, start_utc=utc(v.get('start_time')),
                                distance_m=v.get('total_distance'), timer_s=v.get('total_timer_time'),
                                elapsed_s=v.get('total_elapsed_time'), avg_hr_bpm=v.get('avg_heart_rate'),
                                max_hr_bpm=v.get('max_heart_rate'), avg_power_w=v.get('avg_power'),
                                trigger=v.get('lap_trigger'), raw_json=json.dumps(v, default=serial)))
                        elif kind == 'event':
                            rows['events'].append(dict(base, timestamp_utc=utc(v.get('timestamp')),
                                event=v.get('event'), event_type=v.get('event_type'),
                                raw_json=json.dumps(v, default=serial)))
            except Exception as exc:
                errors.append(dict(path=str(path.relative_to(ROOT)), error=str(exc)))
    temp_samples.replace(OUT / 'samples.jsonl')
    for table, records in rows.items():
        with (OUT / (table + '.jsonl')).open('w') as f:
            for row in records:
                f.write(json.dumps(row, default=serial) + '\n')
    db = duckdb.connect(str(ROOT / 'data/running.duckdb'))
    db.execute("SET TimeZone='UTC'")
    for table in (*rows, 'samples'):
        path = OUT / (table + '.jsonl')
        if path.stat().st_size:
            db.execute(f'CREATE OR REPLACE TABLE {table} AS SELECT * FROM read_json_auto(?, maximum_object_size=33554432, sample_size=-1)', [str(path)])
            destination = str(PARQUET / (table + '.parquet')).replace("'", "''")
            db.execute(f"COPY {table} TO '{destination}' (FORMAT PARQUET, COMPRESSION ZSTD)")
            counts[table] = db.execute(f'SELECT count(*) FROM {table}').fetchone()[0]
    if rows['activities']:
        # Candidates are NOT silently collapsed: distinct files can be edited copies or separate recordings.
        db.execute('''CREATE OR REPLACE VIEW duplicate_candidates AS
            SELECT a.activity_key AS first_key, b.activity_key AS second_key
            FROM activities a JOIN activities b ON a.activity_key < b.activity_key
            AND a.sport=b.sport
            AND abs(epoch(CAST(a.start_utc AS TIMESTAMPTZ))-epoch(CAST(b.start_utc AS TIMESTAMPTZ))) <= 5
            AND abs(a.distance_m-b.distance_m) <= greatest(100, a.distance_m*0.01)
            AND abs(a.timer_s-b.timer_s) <= 30''')
        counts['duplicate_candidates'] = db.execute('SELECT count(*) FROM duplicate_candidates').fetchone()[0]
    db.close()
    report = dict(updated_utc=dt.datetime.now(dt.timezone.utc).isoformat(), counts=dict(counts),
        errors=errors, history_complete=False, wellness_normalized=False,
        limitations=['Full account archives pending', 'Only FIT activities normalized so far',
            'Non-identical duplicate candidates require review', 'Unknown FIT fields retained without guessed meanings',
            'Travel timezone not inferred; UTC retained', 'No continuous account sync configured'])
    (ROOT / 'reports/import_status.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
