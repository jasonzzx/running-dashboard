#!/usr/bin/env python3
"""Loopback-only administration. Launch on the Mac with --open for access."""
import argparse
import fcntl
import hmac
import json
import mimetypes
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import threading
import time
import urllib.parse
import webbrowser

import duckdb
from sync_api import Garmin, request
from sync_runner import ROOT, credentials, save_provider, sync, publish, recover, read_json


class AdminServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, root=ROOT):
        super().__init__(('127.0.0.1', port), Handler)
        self.root = root
        self.origin = 'http://127.0.0.1:' + str(self.server_port)
        self.launch_key = secrets.token_urlsafe(32)
        self.sessions = {}
        self.oauth = {}
        self.guard = threading.Lock()
        self.job = {'running': False, 'log': [], 'result': None, 'error': None}

    def start_job(self, action):
        with self.guard:
            if self.job['running']:
                raise ValueError('A job is already running / 操作正在运行')
            self.job = {'running': True, 'log': [], 'result': None, 'error': None}
        def log(message):
            with self.guard:
                self.job['log'].append(message)
                self.job['log'] = self.job['log'][-100:]
        def work():
            try:
                result = action(log, self.root)
                with self.guard:
                    self.job['result'] = result
            except Exception as exc:
                with self.guard:
                    self.job['error'] = str(exc)
            finally:
                with self.guard:
                    self.job['running'] = False
        threading.Thread(target=work, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # OAuth codes, cookies and launch tokens never go to access logs.

    def host_ok(self):
        return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)

    def session(self):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            value = cookie['running_admin'].value if 'running_admin' in cookie else ''
        except Exception:
            return None
        session = self.server.sessions.get(value)
        return session if session and session['expires'] > time.time() else None

    def send(self, status, body, content_type='application/json; charset=utf-8', headers=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False, default=str).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.host_ok():
            return self.send(403, {'error': 'Invalid host'})
        url = urllib.parse.urlsplit(self.path)
        if url.path == '/oauth/strava/callback':
            return self.callback(url)
        if url.path == '/api/status':
            session = self.session()
            if not session:
                return self.send(401, {'error': 'Launch the local admin to sign in / 请从 Mac 启动管理面板'})
            config = credentials(self.server.root)
            connected = {name: bool(config.get(name, {}).get(field)) for name, field in [('garmin', 'api_key'), ('strava', 'refresh_token')]}
            with self.server.guard:
                job = dict(self.server.job)
            return self.send(200, dict(csrf=session['csrf'], connected=connected, job=job,
                             latest=read_json(self.server.root / 'data/admin/last-sync.json'),
                             public_url='https://running-dashboard-jason.vercel.app/'))
        # Serve only explicit admin assets, never the data directory or repository.
        assets = {'/': 'index.html', '/admin.js': 'admin.js', '/admin.css': 'admin.css'}
        if url.path in assets:
            path = self.server.root / 'admin' / assets[url.path]
            return self.send(200, path.read_bytes(), mimetypes.guess_type(str(path))[0] or 'text/plain')
        return self.send(404, {'error': 'Not found'})

    def do_POST(self):
        if not self.host_ok() or self.headers.get('Origin') != self.server.origin:
            return self.send(403, {'error': 'Invalid origin'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.send(415, {'error': 'JSON required'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 16384:
                return self.send(413, {'error': 'Invalid request size'})
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('Expected an object')
            if self.path == '/api/unlock':
                key = body.get('key', '')
                if not isinstance(key, str) or not hmac.compare_digest(key, self.server.launch_key):
                    return self.send(403, {'error': 'Use the browser window opened by Start Admin.command'})
                token = secrets.token_urlsafe(32)
                self.server.sessions[token] = dict(csrf=secrets.token_urlsafe(32), expires=time.time() + 8 * 3600)
                return self.send(200, {'ok': True}, headers={'Set-Cookie': 'running_admin=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'})
            session = self.session()
            if not session or not hmac.compare_digest(self.headers.get('X-CSRF-Token', ''), session['csrf']):
                return self.send(403, {'error': 'Please reopen the local admin / 请重新打开本地管理面板'})
            if self.path == '/api/sync':
                self.server.start_job(sync)
                return self.send(202, {'ok': True})
            if self.path == '/api/publish':
                self.server.start_job(publish)
                return self.send(202, {'ok': True})
            with self.server.guard:
                if self.server.job['running']:
                    return self.send(409, {'error': 'Wait for the running job before changing accounts'})
            if self.path == '/api/connect/garmin':
                key = str(body.get('key', '')).strip()
                if not key:
                    raise ValueError('Enter your Garmin Personal API key')
                client = Garmin(key)
                # Verify against an existing activity owned by the historical account.
                with duckdb.connect(str(self.server.root / 'data/running.duckdb'), read_only=True) as db:
                    anchor = db.execute("SELECT garmin_activity_id,json_extract_string(raw_json,'$.userProfileId') FROM garmin_activity_metrics ORDER BY start_utc DESC LIMIT 1").fetchone()
                if not anchor:
                    raise ValueError('Historical Garmin identity is unavailable')
                activity = client.activity(anchor[0])
                account = str(activity.get('userProfileId', ''))
                if not account or (anchor[1] and account != anchor[1]):
                    raise ValueError('Connect the Garmin account used for your historical dataset')
                save_provider('garmin', {'api_key': key, 'account_id': account}, self.server.root)
                return self.send(200, {'ok': True})
            if self.path == '/api/connect/strava':
                client_id = str(body.get('client_id', '')).strip()
                secret = str(body.get('client_secret', '')).strip()
                if not client_id.isdecimal() or not secret:
                    raise ValueError('Enter the Strava application client ID and secret')
                state = secrets.token_urlsafe(32)
                self.server.oauth[state] = dict(client_id=client_id, client_secret=secret, expires=time.time() + 600)
                query = urllib.parse.urlencode(dict(client_id=client_id, redirect_uri=self.server.origin + '/oauth/strava/callback',
                    response_type='code', approval_prompt='force', scope='activity:read_all', state=state))
                return self.send(200, {'url': 'https://www.strava.com/oauth/authorize?' + query})
            return self.send(404, {'error': 'Not found'})
        except Exception as exc:
            self.send(400, {'error': str(exc)})

    def callback(self, url):
        args = urllib.parse.parse_qs(url.query)
        pending = self.server.oauth.pop(args.get('state', [''])[0], None)
        if not pending or pending['expires'] < time.time():
            return self.send(403, 'Expired authorization. Reopen local admin.', 'text/plain')
        try:
            if 'error' in args or 'code' not in args:
                raise ValueError('Strava authorization was cancelled')
            if 'activity:read_all' not in args.get('scope', [''])[0].split(','):
                raise ValueError('Activity read permission is required')
            result = request('https://www.strava.com/oauth/token', form=dict(client_id=pending['client_id'],
                             client_secret=pending['client_secret'], code=args['code'][0], grant_type='authorization_code'))
            account = str(result['athlete']['id'])
            # This dataset's preserved export has the athlete ID in its filename.
            archives = list((self.server.root / 'data/raw/strava').glob('strava_export_*.zip'))
            expected = {p.stem.removeprefix('strava_export_') for p in archives}
            previous = credentials(self.server.root).get('strava', {}).get('account_id')
            if (expected and account not in expected) or (previous and account != previous):
                raise ValueError('Connect the Strava account used for your historical dataset')
            if not expected and not previous:
                raise ValueError('Cannot verify Strava account against the preserved export')
            save_provider('strava', dict(client_id=pending['client_id'], client_secret=pending['client_secret'],
                account_id=account, **{k: result[k] for k in ('access_token', 'refresh_token', 'expires_at')}), self.server.root)
            return self.send(303, b'', headers={'Location': '/'})
        except Exception as exc:
            return self.send(400, str(exc) + '\nReturn to the admin panel and reconnect.', 'text/plain; charset=utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    try:
        server = AdminServer(args.port)
    except OSError:
        raise SystemExit('Port 8765 is busy. Use the existing admin window or stop that server first.')
    admin = ROOT / 'data/admin'
    admin.mkdir(parents=True, exist_ok=True)
    with (admin / 'sync.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        recover()
    url = server.origin + '/#key=' + server.launch_key
    if args.open:
        webbrowser.open(url)
    else:
        print('Open this private local login URL (do not share): ' + url, flush=True)
    print('Local admin running. Keep this window open; Ctrl+C stops it.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
