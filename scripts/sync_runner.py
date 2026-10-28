"""Stage, validate and promote weekly additions. Never rebuild from the old base."""
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid
import tempfile

import duckdb
from sync_api import Garmin, Strava, normalize_activity, ApiError
from sync_store import initialize, known, merge_activity, add_recording, merge_wellness

ROOT = Path(__file__).resolve().parents[1]


class BuildError(RuntimeError):
    """Bounded diagnostics for credential-free dashboard commands."""
    def __init__(self, command, result):
        self.diagnostic = dict(command=Path(command[1]).name, returncode=result.returncode,
                               output=(result.stderr or result.stdout)[-2500:])
        super().__init__('Dashboard command failed')


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, default=str)
        handle.flush()
        os.fsync(handle.fileno())
    temp.replace(path)


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def credentials(root=ROOT):
    return read_json(root / 'data/admin/credentials.json', {})


def save_provider(provider, value, root=ROOT):
    config = credentials(root)
    config[provider] = value
    write_json(root / 'data/admin/credentials.json', config)


def run_command(command, root=ROOT, env=None):
    result = subprocess.run(command, cwd=root, env=env, capture_output=True, text=True, timeout=1800)
    if result.returncode:
        # These commands never receive credentials. Keep output bounded.
        raise BuildError(command, result)
    return result.stdout.strip()


def sync_dates(db, provider):
    current = db.execute('SELECT through_date FROM sync_state WHERE provider=?', [provider]).fetchone()
    # Freeze the imported baseline. The first sync starts at its latest day,
    # rather than fetching years of Garmin-only history back into Strava.
    if not current:
        latest = db.execute('SELECT max(CAST(start_utc AS DATE)) FROM activities').fetchone()[0]
        if provider == 'wellness':
            latest = db.execute('SELECT max(calendar_date) FROM garmin_daily').fetchone()[0] or latest
        return latest
    return current[0] - dt.timedelta(days=7)


def archive_json(folder, name, value):
    path = folder / name
    write_json(path, value)
    return path


def promote(root, stage, manifest):
    """Journal makes interrupted file promotion resumable on next server launch."""
    for relative in manifest['files']:
        source, destination = stage / relative, root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp = destination.with_name(destination.name + '.sync-tmp')
        shutil.copy2(source, temp)
        temp.replace(destination)
    write_json(root / 'data/admin/last-sync.json', manifest['summary'])
    (root / 'data/admin/promotion.json').unlink(missing_ok=True)


def recover(root=ROOT):
    journal = read_json(root / 'data/admin/promotion.json')
    if journal:
        stage = (root / journal['stage']).resolve()
        if not stage.is_relative_to((root / 'data/admin/staging').resolve()):
            raise RuntimeError('Invalid sync recovery directory')
        promote(root, stage, journal)


def sync(log, root=ROOT, clients=None, finalize=True, isolated=False):
    if isolated and not root.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve()):
        raise ValueError('Isolated sync requires a disposable temporary directory')
    admin = root / 'data/admin'
    admin.mkdir(parents=True, exist_ok=True)
    with (admin / 'sync.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        recover(root)
        config = credentials(root)
        if clients is None:
            clients = {}
            if config.get('strava', {}).get('refresh_token'):
                clients['strava'] = Strava(config['strava'], lambda value: save_provider('strava', value, root))
            if config.get('garmin', {}).get('api_key'):
                clients['garmin'] = Garmin(config['garmin']['api_key'])
        if not clients:
            raise RuntimeError('Connect at least one provider first.')
        run_id = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8]
        stage = root if isolated else admin / 'staging' / run_id
        (stage / 'data/parquet').mkdir(parents=True, exist_ok=True)
        (stage / 'reports').mkdir(exist_ok=True)
        raw_folder = root / 'data/raw/api' / run_id
        raw_folder.mkdir(parents=True)
        log('Preparing a separate database snapshot / 正在准备独立数据库快照')
        if not isolated:
            shutil.copy2(root / 'data/running.duckdb', stage / 'data/running.duckdb')
            shutil.copy2(root / 'reports/import_status.json', stage / 'reports/import_status.json')
            shutil.copy2(root / 'reports/garmin_import_report.json', stage / 'reports/garmin_import_report.json')
        summary = dict(run_id=run_id, added=0, enriched=0, skipped=0, review=0, samples=0, wellness=0, providers=list(clients))
        changed = set()
        # Today is omitted for wellness to avoid freezing a partial day's totals.
        today = dt.datetime.now().astimezone().date()
        end = today.isoformat()
        with duckdb.connect(str(stage / 'data/running.duckdb')) as db:
            db.execute('SET threads=2')
            initialize(db)
            db.execute('BEGIN TRANSACTION')
            # Strava first keeps the historical choice of summary source for new pairs.
            for provider in ('strava', 'garmin'):
                if provider not in clients:
                    continue
                client, start = clients[provider], sync_dates(db, provider)
                log(provider + ': ' + str(start) + ' → ' + end)
                for aid in client.activities(str(start), end):
                    if known(db, provider, aid):
                        summary['skipped'] += 1
                        continue
                    raw = client.activity(aid)
                    parsed_id, row, metrics = normalize_activity(provider, raw)
                    if parsed_id != aid:
                        raise RuntimeError('Provider returned the wrong activity ID')
                    # API access must continue to refer to the account connected at setup.
                    account = config.get(provider, {}).get('account_id')
                    actual = raw.get('userProfileId') if provider == 'garmin' else (raw.get('athlete') or {}).get('id')
                    if account and str(account) != str(actual):
                        raise RuntimeError(provider + ' account changed; reconnect the original account.')
                    path = archive_json(raw_folder, provider + '-' + aid + '.json', raw)
                    key, outcome = merge_activity(db, provider, aid, row, metrics, str(path.relative_to(root)))
                    summary[outcome] += 1
                    if key:
                        db.execute('INSERT OR IGNORE INTO sync_pending_recordings VALUES (?,?,?)', [provider, aid, key])
                        changed.add(db.execute('SELECT source_activity_id FROM activities WHERE activity_key=?', [key]).fetchone()[0])
                    log(provider + ' ' + aid + ': ' + outcome)
                db.execute('INSERT OR REPLACE INTO sync_state VALUES (?,?)', [provider, today])
            # Prefer Garmin originals when both sources arrive together; Strava
            # metadata retains the established canonical summary precedence.
            pending = db.execute("SELECT provider,provider_id,activity_key FROM sync_pending_recordings ORDER BY CASE WHEN provider='garmin' THEN 0 ELSE 1 END").fetchall()
            for provider, aid, key in pending:
                if db.execute('SELECT 1 FROM samples WHERE activity_key=? LIMIT 1', [key]).fetchone():
                    db.execute('DELETE FROM sync_pending_recordings WHERE provider=? AND provider_id=?', [provider, aid])
                    continue
                if provider not in clients:
                    continue
                recording = clients[provider].recording(aid)
                if isinstance(recording, bytes):
                    (raw_folder / (provider + '-' + aid + '.zip')).write_bytes(recording)
                elif recording:
                    archive_json(raw_folder, provider + '-' + aid + '-streams.json', recording)
                count = add_recording(db, key, provider, recording)
                summary['samples'] += count
                if count:
                    db.execute('DELETE FROM sync_pending_recordings WHERE provider=? AND provider_id=?', [provider, aid])
                    changed.add(db.execute('SELECT source_activity_id FROM activities WHERE activity_key=?', [key]).fetchone()[0])
            summary['pending_recordings'] = db.execute('SELECT count(*) FROM sync_pending_recordings').fetchone()[0]
            if 'garmin' in clients:
                client = clients['garmin']
                start = sync_dates(db, 'wellness')
                last = today - dt.timedelta(days=1)
                # Chunk by day; retain a clear retry boundary and never request a bulk history export.
                date = start
                while date <= last:
                    day = date.isoformat()
                    for kind, endpoint, params in [
                        ('daily', '/usersummary-service/v2/dailysummaries', dict(startDate=day, endDate=day)),
                        ('sleep', '/sleep-service/sleep/dailySleep', dict(date=day)),
                        ('hrv', '/hrv-service/hrv/' + day, None)]:
                        try:
                            raw = client.get(endpoint, params)
                        except ApiError as exc:
                            if exc.status != 404:
                                raise
                            raw = None
                        path = archive_json(raw_folder, kind + '-' + day + '.json', raw)
                        summary['wellness'] += merge_wellness(db, kind, raw, str(path.relative_to(root)))
                    date += dt.timedelta(days=1)
                db.execute('INSERT OR REPLACE INTO sync_state VALUES (?,?)', ['wellness', last])
            summary['completed_utc'] = dt.datetime.now(dt.timezone.utc).isoformat()
            counts = {name: db.execute('SELECT count(*) FROM ' + name).fetchone()[0] for name in
                      ('activities', 'running_activities', 'samples', 'laps', 'events', 'sessions', 'sources', 'duplicate_candidates')}
            if db.execute('SELECT count(*)-count(DISTINCT activity_key) FROM activities').fetchone()[0]:
                raise RuntimeError('Duplicate canonical activities')
            if db.execute('SELECT count(*) FROM (SELECT source,source_activity_id FROM sources GROUP BY ALL HAVING count(*)>1)').fetchone()[0]:
                raise RuntimeError('Duplicate source links')
            db.execute('INSERT INTO sync_imports VALUES (?,?,?)', [run_id, summary['completed_utc'], json.dumps(summary)])
            db.execute('COMMIT')
            status = read_json(stage / 'reports/import_status.json')
            status.update(counts=counts, updated_utc=summary['completed_utc'],
                          date_range_utc=list(db.execute('SELECT min(start_utc),max(start_utc) FROM activities').fetchone()),
                          running_km=db.execute('SELECT sum(distance_m)/1000 FROM running_activities').fetchone()[0])
            status['diagnostics']['activities_without_samples'] = db.execute('SELECT count(*) FROM activities WHERE sample_count=0').fetchone()[0]
            write_json(stage / 'reports/import_status.json', status)
            log('Exporting Parquet snapshot / 正在导出 Parquet 快照')
            tables = [r[0] for r in db.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='main' AND table_type='BASE TABLE'").fetchall()]
            for table in tables + ['activity_features']:
                db.execute('COPY (SELECT * FROM "' + table + '") TO ? (FORMAT PARQUET, COMPRESSION ZSTD)', [str(stage / 'data/parquet' / (table + '.parquet'))])
        log('Rebuilding and validating dashboard / 正在生成并验证仪表盘')
        if not isolated:
            shutil.copytree(root / 'dashboard', stage / 'dashboard', ignore=shutil.ignore_patterns('details'))
            # Unchanged details are hard-linked; changed details are replaced atomically by the builder.
            shutil.copytree(root / 'dashboard/details', stage / 'dashboard/details', copy_function=os.link)
        env = dict(os.environ, RUNNING_DATA_ROOT=str(stage), RUNNING_CHANGED_IDS=json.dumps(sorted(changed)))
        if not finalize:
            env['RUNNING_DEFER_REPORTS'] = '1'
        run_command([sys.executable, str(root / 'scripts/build_dashboard.py')], root, env)
        if finalize:
            run_command(['node', str(root / 'tests/check_deployment.mjs')], root, env)
        summary['latest_activity'] = status['date_range_utc'][1]
        summary['validated'] = finalize
        generated = ['data.js', 'analysis-data.js', 'garmin-data.js', 'pace-data.js']
        if finalize:
            generated += ['reports/analysis-en.html', 'reports/analysis-zh.html']
        generated += ['details/' + aid + '.js' for aid in sorted(changed)]
        summary['publish_files'] = {'dashboard/' + name: hashlib.sha256((stage / 'dashboard' / name).read_bytes()).hexdigest() for name in generated}
        if isolated:
            return summary
        files = ['data/running.duckdb', 'reports/import_status.json', 'reports/training_analysis.json']
        files += [str(p.relative_to(stage)) for p in (stage / 'data/parquet').glob('*.parquet')]
        files += ['dashboard/' + name for name in generated]
        backup = admin / 'backups' / run_id
        backup.mkdir(parents=True)
        shutil.copy2(root / 'data/running.duckdb', backup / 'running.duckdb')
        shutil.copy2(root / 'reports/import_status.json', backup / 'import_status.json')
        manifest = dict(stage=str(stage.relative_to(root)), files=files, summary=summary)
        write_json(admin / 'promotion.json', manifest)
        promote(root, stage, manifest)
        log('Sync complete; ready to publish / 同步完成，可发布')
        return summary


def publish(log, root=ROOT):
    """Publish only generated dashboard paths, never credentials or raw data."""
    if (root / 'data/admin/promotion.json').exists():
        raise RuntimeError('Finish sync recovery before publishing.')
    latest = read_json(root / 'data/admin/last-sync.json', {})
    if not latest.get('validated'):
        raise RuntimeError('Complete a successful sync before publishing.')
    if run_command(['git', 'branch', '--show-current'], root) != 'main':
        raise RuntimeError('Publishing requires the main branch.')
    if run_command(['git', 'diff', '--cached', '--name-only'], root):
        raise RuntimeError('Git has staged changes. Commit or unstage them before publishing.')
    remote = run_command(['git', 'remote', 'get-url', 'origin'], root)
    if remote not in ('https://github.com/jasonzzx/running-dashboard.git', 'git@github.com:jasonzzx/running-dashboard.git'):
        raise RuntimeError('Git origin is not the configured running-dashboard repository.')
    files = latest.get('publish_files', {})
    if not files:
        raise RuntimeError('Sync snapshot has no publication manifest. Sync again.')
    for relative, digest in files.items():
        path = (root / relative).resolve()
        if not path.is_relative_to((root / 'dashboard').resolve()) or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Dashboard changed after validation. Sync again before publishing.')
    run_command(['node', str(root / 'tests/check_deployment.mjs')], root)
    run_command(['git', 'add', '--'] + sorted(files), root)
    if run_command(['git', 'diff', '--cached', '--name-only'], root):
        run_command(['git', 'commit', '-m', 'Refresh dashboard with weekly API additions'], root)
    log('Pushing dashboard to GitHub / 正在推送仪表盘到 GitHub')
    run_command(['git', 'push', 'origin', 'main'], root)
    return {'pushed': True, 'message': 'GitHub push complete; Vercel deployment is triggered separately.'}
