"""Additive merge into the existing database. Caller owns the transaction."""
import datetime as dt
import hashlib
import io
import json
import zipfile

from fitparse import FitFile
from sync_api import timestamp


def rows(result):
    names = [d[0] for d in result.description]
    return [dict(zip(names, row)) for row in result.fetchall()]


def insert(db, table, row):
    columns = {r[0] for r in db.execute('DESCRIBE ' + table).fetchall()}
    row = {k: v for k, v in row.items() if k in columns}
    db.execute('INSERT INTO ' + table + ' (' + ','.join('"' + k + '"' for k in row) + ') VALUES (' + ','.join('?' for _ in row) + ')', list(row.values()))


def fill_missing(db, table, keys, values, exclude=()):
    where = ' AND '.join('"' + k + '" IS NOT DISTINCT FROM ?' for k in keys)
    existing = rows(db.execute('SELECT * FROM ' + table + ' WHERE ' + where, list(keys.values())))
    if len(existing) > 1:
        raise RuntimeError('Ambiguous existing row in ' + table)
    if not existing:
        insert(db, table, dict(values, **keys))
        return True
    changes = {k: v for k, v in values.items() if k in existing[0] and k not in keys and k not in exclude and v is not None and existing[0][k] is None}
    if changes:
        db.execute('UPDATE ' + table + ' SET ' + ','.join('"' + k + '"=?' for k in changes) + ' WHERE ' + where,
                   list(changes.values()) + list(keys.values()))
    return bool(changes)


def initialize(db):
    db.execute('CREATE TABLE IF NOT EXISTS sync_state (provider VARCHAR PRIMARY KEY, through_date DATE)')
    db.execute('CREATE TABLE IF NOT EXISTS sync_review (provider VARCHAR, provider_id VARCHAR, reason VARCHAR, raw_json VARCHAR, PRIMARY KEY(provider,provider_id))')
    db.execute('CREATE TABLE IF NOT EXISTS sync_imports (run_id VARCHAR PRIMARY KEY, completed_utc VARCHAR, summary_json VARCHAR)')
    db.execute('CREATE TABLE IF NOT EXISTS sync_pending_recordings (provider VARCHAR, provider_id VARCHAR, activity_key VARCHAR, PRIMARY KEY(provider,provider_id))')


def known(db, provider, aid):
    return db.execute('SELECT activity_key FROM sources WHERE source=? AND source_activity_id=?', [provider, aid]).fetchone()


def merge_activity(db, provider, aid, row, metrics, source_path):
    linked = known(db, provider, aid)
    if linked:
        return linked[0], 'skipped'
    # Match across providers only. A second distinct ID from the same provider
    # must not silently collapse into a recording already linked to that provider.
    near = rows(db.execute('''SELECT a.* FROM activities a WHERE sport=?
        AND abs(epoch(CAST(start_utc AS TIMESTAMPTZ))-epoch(CAST(? AS TIMESTAMPTZ)))<=15''', [row['sport'], row['start_utc']]))
    compatible = []
    for old in near:
        seconds = abs((dt.datetime.fromisoformat(old['start_utc']) - dt.datetime.fromisoformat(row['start_utc'])).total_seconds())
        distance = old['distance_m'] is not None and abs(old['distance_m'] - row['distance_m']) <= max(100, row['distance_m'] * .02)
        # Strava elapsed time and Garmin elapsed time share a definition; timer and moving time do not.
        duration = old['elapsed_s'] is not None and row.get('elapsed_s') is not None and abs(old['elapsed_s'] - row['elapsed_s']) <= 30
        other_id = db.execute('SELECT 1 FROM sources WHERE activity_key=? AND source=?', [old['activity_key'], provider]).fetchone()
        if seconds <= 5 and distance and duration and not other_id:
            compatible.append(old)
    if len(compatible) == 1:
        key, outcome = compatible[0]['activity_key'], 'enriched'
        fill_missing(db, 'activities', {'activity_key': key}, row,
                     exclude=('raw_json', 'pace_basis', 'source_filename', 'file_key', 'avg_pace_s_km'))
        db.execute('''UPDATE activities SET avg_pace_s_km=moving_s*1000/distance_m
                      WHERE activity_key=? AND avg_pace_s_km IS NULL AND moving_s>0 AND distance_m>0''', [key])
    elif near:
        db.execute('INSERT OR REPLACE INTO sync_review VALUES (?,?,?,?)',
                   [provider, aid, 'Overlapping activity requires review; not added to totals.', row['raw_json']])
        return None, 'review'
    else:
        key, outcome = provider + ':' + aid, 'added'
        insert(db, 'activities', dict(row, activity_key=key, source=provider,
               source_activity_id=('garmin-' + aid if provider == 'garmin' else aid), source_filename=source_path,
               sample_count=0, detail_status='api_summary_only', quality_flags='{}', multi_session_file=False))
    insert(db, 'sources', dict(activity_key=key, source=provider, source_activity_id=aid, path=source_path, match_method='api_unique_start_distance_elapsed'))
    if metrics is not None:
        fill_missing(db, 'garmin_activity_metrics', {'activity_key': key}, dict(metrics, garmin_activity_id=aid,
                     source_path=source_path, raw_json=row['raw_json']))
    return key, outcome


def add_recording(db, key, provider, content):
    """Preserve existing full series; only supply a series when none exists."""
    if not content or db.execute('SELECT 1 FROM samples WHERE activity_key=? LIMIT 1', [key]).fetchone():
        return 0
    sport = db.execute('SELECT sport FROM activities WHERE activity_key=?', [key]).fetchone()[0]
    sample_rows, lap_rows, session_rows, event_rows = [], [], [], []
    if provider == 'garmin':
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            files = [x for x in archive.infolist() if x.filename.lower().endswith('.fit')]
            if len(files) != 1 or files[0].file_size > 64 * 1024 * 1024:
                raise ValueError('Expected one FIT recording under 64 MB; manual review required.')
            binary = archive.read(files[0])
        file_key = hashlib.sha256(binary).hexdigest()
        def cadence(v, k, fraction):
            return 2 * (v[k] + (v.get(fraction) or 0)) if sport == 'running' and v.get(k) is not None else None
        def number(v, *keys):
            return next((v[k] for k in keys if v.get(k) is not None), None)
        for message in FitFile(binary, check_crc=True).get_messages():
            v = message.get_values()
            if message.name == 'record' and v.get('timestamp'):
                sample_rows.append(dict(sequence=len(sample_rows), timestamp_utc=timestamp(v['timestamp'].isoformat()),
                    distance_m=v.get('distance'), speed_m_s=number(v, 'enhanced_speed', 'speed'),
                    altitude_m=number(v, 'enhanced_altitude', 'altitude'), hr_bpm=v.get('heart_rate'),
                    cadence_raw=v.get('cadence'), cadence_spm=cadence(v, 'cadence', 'fractional_cadence'),
                    power_w=v.get('power'), temperature_c=v.get('temperature'),
                    latitude_deg=v['position_lat'] * 180 / 2**31 if v.get('position_lat') is not None else None,
                    longitude_deg=v['position_long'] * 180 / 2**31 if v.get('position_long') is not None else None,
                    ground_contact_ms=v.get('stance_time'), vertical_oscillation_mm=v.get('vertical_oscillation'),
                    step_length_mm=v.get('step_length'), vertical_ratio_pct=v.get('vertical_ratio'), distance_origin='recorded'))
            elif message.name in ('lap', 'session'):
                target = lap_rows if message.name == 'lap' else session_rows
                item = dict(sequence=len(target), start_utc=timestamp(v['start_time'].isoformat()) if v.get('start_time') else None,
                    distance_m=v.get('total_distance'), timer_s=v.get('total_timer_time'), elapsed_s=v.get('total_elapsed_time'),
                    avg_hr_bpm=v.get('avg_heart_rate'), max_hr_bpm=v.get('max_heart_rate'), avg_power_w=v.get('avg_power'),
                    raw_json=json.dumps(v, default=str), sport=v.get('sport'), sub_sport=v.get('sub_sport'),
                    avg_cadence_spm=cadence(v, 'avg_running_cadence', 'avg_fractional_cadence'))
                target.append(item)
            elif message.name == 'event' and v.get('timestamp'):
                event_rows.append(dict(sequence=len(event_rows), timestamp_utc=timestamp(v['timestamp'].isoformat()),
                    event=str(v.get('event')), event_type=str(v.get('event_type')), raw_json=json.dumps(v, default=str)))
        if len(session_rows) > 1:
            raise ValueError('Multi-session FIT needs manual review; no data merged.')
    else:
        file_key = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
        start = dt.datetime.fromisoformat(db.execute('SELECT start_utc FROM activities WHERE activity_key=?', [key]).fetchone()[0])
        times = content.get('time', {}).get('data', [])
        fields = {'distance_m': 'distance', 'hr_bpm': 'heartrate', 'power_w': 'watts', 'altitude_m': 'altitude',
                  'speed_m_s': 'velocity_smooth', 'cadence_raw': 'cadence'}
        for stream in content.values():
            if isinstance(stream, dict) and 'data' in stream and len(stream['data']) != len(times):
                raise ValueError('Strava streams have inconsistent lengths')
        previous_moving = None
        for i, seconds in enumerate(times):
            item = dict(sequence=i, timestamp_utc=(start + dt.timedelta(seconds=seconds)).isoformat(), distance_origin='strava_stream')
            for dest, source in fields.items():
                values = content.get(source, {}).get('data')
                item[dest] = values[i] if values else None
            sample_rows.append(item)
            moving = content.get('moving', {}).get('data', [])
            if moving and moving[i] != previous_moving:
                event_rows.append(dict(sequence=len(event_rows), timestamp_utc=item['timestamp_utc'], event='timer',
                                       event_type='start' if moving[i] else 'stop', raw_json='{"source":"strava_moving_stream"}'))
                previous_moving = moving[i]
    # Insert chunks through a JSON relation to retain the established table schema.
    for table, items in [('samples', sample_rows), ('laps', lap_rows), ('sessions', session_rows), ('events', event_rows)]:
        if db.execute('SELECT 1 FROM ' + table + ' WHERE activity_key=? LIMIT 1', [key]).fetchone():
            continue
        if items:
            schema = {r[0] for r in db.execute('DESCRIBE ' + table).fetchall()}
            columns = sorted((set().union(*(r.keys() for r in items)) | {'activity_key', 'file_key'}) & schema)
            payload = [dict(item, activity_key=key, file_key=file_key) for item in items]
            db.executemany('INSERT INTO ' + table + ' (' + ','.join('"'+c+'"' for c in columns) + ') VALUES (' + ','.join('?' for _ in columns) + ')',
                           [[item.get(c) for c in columns] for item in payload])
    if sample_rows:
        db.execute('UPDATE activities SET sample_count=?,file_key=coalesce(file_key,?),detail_status=? WHERE activity_key=?',
                   [len(sample_rows), file_key, 'api_recording_imported', key])
        db.execute('UPDATE sources SET file_key=coalesce(file_key,?) WHERE activity_key=? AND source=?', [file_key, key, provider])
        if session_rows:
            fill_missing(db, 'activities', {'activity_key': key}, {k: session_rows[0].get(k) for k in ('sub_sport', 'timer_s', 'avg_cadence_spm')})
    return len(sample_rows)


def merge_wellness(db, kind, raw, source_path):
    """Only add dates/metrics or fill NULLs. Never replace known historical values."""
    if not raw:
        return 0
    if kind == 'daily':
        entries = raw['data']
    elif kind == 'sleep':
        entries = [raw]
    else:
        entries = [raw.get('hrvSummary') or {}]
    changed = 0
    for item in entries:
        date = item.get('calendarDate')
        if not date:
            continue
        dt.date.fromisoformat(date)
        provenance = dict(source_path=source_path, raw_json=json.dumps(item, ensure_ascii=False))
        if kind == 'daily':
            values = dict(resting_hr_bpm=(item.get('heartRate') or {}).get('restingValue'),
                          steps=((item.get('movement') or {}).get('steps') or {}).get('value'),
                          stress=(item.get('stress') or {}).get('avgLevel'),
                          duration_ms=(item.get('wellnessChronology') or {}).get('totalDurationInMillis'))
            table, keys = 'garmin_daily', {'calendar_date': date}
        elif kind == 'sleep':
            values = dict(sleep_seconds=item.get('sleepTimeSeconds'), awake_seconds=item.get('awakeSleepSeconds'),
                          score=((item.get('sleepScores') or {}).get('overall') or {}).get('value'),
                          start_utc=timestamp(item['sleepStartTimestampGMT']) if item.get('sleepStartTimestampGMT') else None,
                          end_utc=timestamp(item['sleepEndTimestampGMT']) if item.get('sleepEndTimestampGMT') else None)
            table, keys = 'garmin_sleep', {'calendar_date': date}
        else:
            if item.get('weeklyAvg') is None:
                continue
            # Existing exports can contain multiple devices. Do not add a second
            # observation to an already measured daily metric.
            old = db.execute("SELECT value FROM garmin_daily_metrics WHERE calendar_date=? AND metric='hrv_weekly_average_ms' AND value IS NOT NULL", [date]).fetchone()
            if old:
                continue
            values = dict(value=item['weeklyAvg'], timestamp=item.get('createTimeStamp'))
            table, keys = 'garmin_daily_metrics', {'calendar_date': date, 'metric': 'hrv_weekly_average_ms', 'device_id': 'personal_api'}
        if any(v is not None for v in values.values()):
            changed += fill_missing(db, table, keys, dict(values, **provenance))
    return changed
