"""Official provider APIs for the local admin. No passwords or browser cookies.

Garmin contracts: developer.garmin.com/gc-developer-program/personal/swagger-docs/
Strava contracts: developers.strava.com/docs/reference/
"""
import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request

GARMIN = 'https://personal.connectapi.garmin.com'
STRAVA = 'https://www.strava.com/api/v3'


class ApiError(RuntimeError):
    def __init__(self, provider, status):
        self.status = status
        super().__init__('%s API HTTP %s. Reconnect for 401/403; retry later for 429/5xx.' % (provider, status))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward an Authorization header to a redirect target.


def request(url, token=None, params=None, form=None, api_key=None, binary=False):
    if params:
        url += '?' + urllib.parse.urlencode(params)
    headers = {'Accept': 'application/octet-stream' if binary else 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if api_key:
        headers['Authorization'] = 'ApiKey ' + api_key
    data = urllib.parse.urlencode(form).encode() if form is not None else (b'' if api_key else None)
    req = urllib.request.Request(url, data=data, headers=headers)
    if form is not None:
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    provider = 'Garmin' if url.startswith(GARMIN) else 'Strava'
    for attempt in range(3):
        try:
            with urllib.request.build_opener(NoRedirect).open(req, timeout=45) as res:
                body = res.read(64 * 1024 * 1024 + 1)
                if len(body) > 64 * 1024 * 1024:
                    raise RuntimeError('Provider response exceeds 64 MB; import manually.')
                return body if binary else (json.loads(body) if body else None)
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt < 2:
                delay = exc.headers.get('Retry-After', '')
                # Do not retry early when the provider requests a longer delay.
                if delay.isdigit() and int(delay) > 30:
                    raise ApiError(provider, exc.code) from None
                time.sleep(int(delay) if delay.isdigit() else 2 ** attempt)
                continue
            raise ApiError(provider, exc.code) from None
        except (urllib.error.URLError, TimeoutError):
            raise RuntimeError(provider + ' connection failed; check internet access and retry.') from None


def timestamp(value):
    if isinstance(value, (int, float)):
        return dt.datetime.fromtimestamp(value / 1000, dt.timezone.utc).isoformat()
    date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if date.tzinfo is None:
        date = date.replace(tzinfo=dt.timezone.utc)
    return date.astimezone(dt.timezone.utc).isoformat()


def normalize_activity(provider, raw):
    """API units differ from Garmin account-export units. Keep mappings separate."""
    if provider == 'garmin':
        s = raw['summaryDTO']
        kind = raw['activityTypeDTO']['typeKey']
        sport = 'running' if kind in ('running', 'treadmill_running', 'track_running', 'trail_running', 'indoor_running', 'ultra_running') else kind
        setting = {'running': 'generic', 'treadmill_running': 'treadmill', 'track_running': 'track', 'trail_running': 'trail'}.get(kind)
        row = dict(name=raw.get('activityName'), description=raw.get('description'), sport=sport,
                   sub_sport=setting, start_utc=timestamp(s['startTimeGMT']), distance_m=s.get('distance'),
                   timer_s=s.get('duration'), moving_s=s.get('movingDuration'), elapsed_s=s.get('elapsedDuration'),
                   avg_hr_bpm=s.get('averageHR'), max_hr_bpm=s.get('maxHR'), ascent_m=s.get('elevationGain'),
                   descent_m=s.get('elevationLoss'), avg_power_w=s.get('averagePower'),
                   avg_cadence_spm=s.get('averageRunCadence') if sport == 'running' else None,
                   calories=s.get('calories'), pace_basis='garmin_api_moving_time')
        metrics = dict(activity_type=kind, sport=sport, sub_sport=setting, start_utc=row['start_utc'],
                       distance_m=row['distance_m'], timer_s=row['timer_s'], moving_s=row['moving_s'], elapsed_s=row['elapsed_s'])
        mapping = {'ground_contact_ms': ('groundContactTime', 1), 'vertical_oscillation_mm': ('verticalOscillation', 10),
                   'step_length_m': ('strideLength', .01), 'vertical_ratio_pct': ('verticalRatio', 1),
                   'ground_contact_balance_left_pct': ('groundContactBalanceLeft', 1),
                   'cadence_spm': ('averageRunCadence', 1), 'avg_power_w': ('averagePower', 1),
                   'normalized_power_w': ('normalizedPower', 1), 'aerobic_training_effect': ('trainingEffect', 1),
                   'anaerobic_training_effect': ('anaerobicTrainingEffect', 1),
                   'training_load': ('activityTrainingLoad', 1), 'lactate_threshold_bpm': ('lactateThresholdHeartRate', 1)}
        for dest, (field, factor) in mapping.items():
            metrics[dest] = s[field] * factor if s.get(field) is not None else None
        metrics['training_effect_label'] = s.get('trainingEffectLabel')
        aid = str(raw['activityId'])
    else:
        kind = raw.get('sport_type') or raw['type']
        sport = {'Run': 'running', 'TrailRun': 'running', 'VirtualRun': 'running', 'Ride': 'cycling',
                 'Walk': 'walking', 'Hike': 'hiking', 'Swim': 'swimming'}.get(kind, kind.lower())
        # Trainer implies treadmill for running; virtual runs are not necessarily treadmill.
        setting = 'treadmill' if sport == 'running' and raw.get('trainer') else ('trail' if kind == 'TrailRun' else None)
        row = dict(name=raw.get('name'), description=raw.get('description'), sport=sport, sub_sport=setting,
                   strava_activity_type=kind, start_utc=timestamp(raw['start_date']), distance_m=raw.get('distance'),
                   moving_s=raw.get('moving_time'), elapsed_s=raw.get('elapsed_time'),
                   avg_hr_bpm=raw.get('average_heartrate'), max_hr_bpm=raw.get('max_heartrate'),
                   ascent_m=raw.get('total_elevation_gain'), avg_power_w=raw.get('average_watts'),
                   avg_cadence_raw=raw.get('average_cadence'), gear=raw.get('gear_id'), calories=raw.get('calories'),
                   pace_basis='strava_api_moving_time')
        aid, metrics = str(raw['id']), None
    if not aid.isascii() or not aid.isdecimal():
        raise ValueError('Invalid provider activity ID')
    distance, moving = row['distance_m'], row['moving_s']
    if distance is None or distance < 0:
        raise ValueError('Missing or negative activity distance for ' + aid)
    row['avg_pace_s_km'] = moving * 1000 / distance if distance and moving else None
    row['raw_json'] = json.dumps(raw, ensure_ascii=False)
    return aid, row, metrics


class Garmin:
    def __init__(self, key):
        result = request(GARMIN + '/personalapitoken-service/personal-api/personal-api-key/token', api_key=key, binary=True)
        # Official client consumes response.text: this endpoint returns a raw JWT.
        self.token = result.decode().strip()
        if not isinstance(self.token, str) or not self.token:
            raise RuntimeError('Unexpected Garmin token response')

    def get(self, path, params=None, binary=False):
        return request(GARMIN + path, self.token, params=params, binary=binary)

    def activities(self, start_date, end_date):
        offset = 0
        seen = set()
        while True:
            batch = self.get('/activitylist-service/activities/search/activities',
                             dict(start=offset, limit=99, startDate=start_date, endDate=end_date))
            if not isinstance(batch, list):
                raise RuntimeError('Unexpected Garmin activity-list response')
            if not batch:
                break
            for row in batch:
                aid = str(row['activityId'])
                if aid in seen:
                    raise RuntimeError('Garmin pagination repeated an activity; retry sync.')
                seen.add(aid)
                yield aid
            offset += len(batch)

    def activity(self, aid):
        return self.get('/activity-service/activity/' + aid)

    def recording(self, aid):
        try:
            return self.get('/download-service/files/activity/' + aid, binary=True)
        except ApiError as exc:
            if exc.status == 404:
                return None  # Manual activities can have no original recording.
            raise


class Strava:
    def __init__(self, credentials, save):
        self.credentials = credentials
        if credentials.get('expires_at', 0) < time.time() + 120:
            result = request('https://www.strava.com/oauth/token', form=dict(client_id=credentials['client_id'],
                             client_secret=credentials['client_secret'], refresh_token=credentials['refresh_token'], grant_type='refresh_token'))
            credentials.update({k: result[k] for k in ('access_token', 'refresh_token', 'expires_at')})
            save(credentials)
        self.token = credentials['access_token']

    def get(self, path, params=None):
        return request(STRAVA + path, self.token, params=params)

    def activities(self, start_date, end_date):
        after = int(dt.datetime.fromisoformat(start_date).replace(tzinfo=dt.timezone.utc).timestamp()) - 1
        before = int((dt.datetime.fromisoformat(end_date) + dt.timedelta(days=1)).replace(tzinfo=dt.timezone.utc).timestamp())
        page, seen = 1, set()
        while True:
            batch = self.get('/athlete/activities', dict(after=after, before=before, page=page, per_page=100))
            if not isinstance(batch, list):
                raise RuntimeError('Unexpected Strava activity-list response')
            if not batch:
                break
            for row in batch:
                aid = str(row['id'])
                if aid in seen:
                    raise RuntimeError('Strava pagination repeated an activity; retry sync.')
                seen.add(aid)
                yield aid
            page += 1

    def activity(self, aid):
        return self.get('/activities/' + aid)

    def recording(self, aid):
        try:
            return self.get('/activities/' + aid + '/streams', dict(keys='time,distance,heartrate,cadence,watts,altitude,velocity_smooth,moving', key_by_type='true'))
        except ApiError as exc:
            if exc.status == 404:
                return None
            raise
