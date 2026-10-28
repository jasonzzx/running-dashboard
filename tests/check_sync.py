"""Meaningful additive-merge and local admin security regression tests."""
import datetime as dt
import http.client
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

import duckdb
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from sync_store import initialize, merge_activity, merge_wellness, add_recording, insert, rows
from sync_api import normalize_activity, Garmin
from sync_runner import sync_dates, write_json, run_command
from admin_server import AdminServer


class BuildRuntimeTests(unittest.TestCase):
    def test_snapshot_builder_preserves_bundled_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            vendor=root/'vendor';vendor.mkdir()
            (vendor/'bundled_dependency.py').write_text('VALUE="dependency found"')
            snapshot=root/'snapshot';snapshot.mkdir()
            builder=root/'builder.py';builder.write_text('from bundled_dependency import VALUE\nprint(VALUE)')
            with patch.object(sys,'path',[str(vendor),*sys.path]):
                result=run_command([sys.executable,str(builder)],snapshot,dict(os.environ,RUNNING_DEFER_REPORTS='1'))
            self.assertEqual(result,'dependency found')


class MergeTests(unittest.TestCase):
    def setUp(self):
        self.db = duckdb.connect()
        self.db.execute("ATTACH '" + str(ROOT / 'data/running.duckdb').replace("'", "''") + "' AS original (READ_ONLY)")
        for name in ['activities','sources','samples','laps','sessions','events','garmin_activity_metrics','garmin_daily','garmin_sleep','garmin_daily_metrics']:
            self.db.execute('CREATE TABLE ' + name + ' AS SELECT * FROM original.' + name + ' LIMIT 0')
        self.db.execute('DETACH original')
        initialize(self.db)

    def tearDown(self):
        self.db.close()

    def strava(self, aid=999, **kw):
        return dict(id=aid, type='Run', sport_type='Run', name='New run', start_date='2026-10-23T12:00:00Z',
                    distance=10000, moving_time=3000, elapsed_time=3010, **kw)

    def garmin(self, aid=888, **kw):
        summary = dict(startTimeGMT='2026-10-23T12:00:00.000', distance=10000, duration=3000, movingDuration=3000,
                       elapsedDuration=3010, averageHR=140, strideLength=125, verticalOscillation=8, averageRunCadence=180)
        summary.update(kw)
        return dict(activityId=aid, activityName='Garmin run', activityTypeDTO={'typeKey':'running'}, summaryDTO=summary)

    def merge(self, provider, raw):
        aid,row,metrics=normalize_activity(provider,raw)
        return merge_activity(self.db,provider,aid,row,metrics,'fixture.json')

    def test_new_repeat_and_cross_provider_enrichment(self):
        key,result=self.merge('strava',self.strava())
        self.assertEqual(result,'added')
        self.assertEqual(self.merge('strava',self.strava())[1],'skipped')
        before=rows(self.db.execute('SELECT * FROM activities'))[0]
        self.assertEqual(self.merge('garmin',self.garmin()),(key,'enriched'))
        after=rows(self.db.execute('SELECT * FROM activities'))[0]
        for field,value in before.items():
            if value is not None:
                self.assertEqual(after[field],value,field)
        self.assertEqual(after['avg_hr_bpm'],140)
        self.assertEqual(after['sub_sport'],'generic')
        self.assertEqual(self.db.execute('SELECT count(*) FROM activities').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT step_length_m,vertical_oscillation_mm,cadence_spm FROM garmin_activity_metrics').fetchone(),(1.25,80,180))

    def test_reverse_arrival_preserves_id(self):
        key,_=self.merge('garmin',self.garmin())
        self.assertEqual(self.merge('strava',self.strava()),(key,'enriched'))
        self.assertEqual(self.db.execute('SELECT source_activity_id FROM activities').fetchone()[0],'garmin-888')

    def test_ambiguous_and_same_provider_overlap_held(self):
        self.merge('strava',self.strava())
        self.assertEqual(self.merge('strava',self.strava(aid=1000))[1],'review')
        self.assertEqual(self.merge('garmin',self.garmin(distance=30000))[1],'review')
        self.assertEqual(self.db.execute('SELECT count(*) FROM activities').fetchone()[0],1)

    def test_wellness_no_overwrite_and_missing_fill(self):
        first=dict(calendarDate='2026-10-23',sleepTimeSeconds=25000,sleepScores={})
        self.assertEqual(merge_wellness(self.db,'sleep',first,'first'),1)
        later=dict(first,sleepTimeSeconds=26000,sleepScores={'overall':{'value':90}})
        self.assertEqual(merge_wellness(self.db,'sleep',later,'later'),1)
        self.assertEqual(self.db.execute('SELECT sleep_seconds,score,source_path FROM garmin_sleep').fetchone(),(25000,90,'first'))
        daily={'data':[{'calendarDate':'2026-10-23','heartRate':{'restingValue':45},'movement':{'steps':{'value':10000}},'stress':{'avgLevel':20}}]}
        merge_wellness(self.db,'daily',daily,'daily')
        self.assertEqual(self.db.execute('SELECT resting_hr_bpm,steps,stress FROM garmin_daily').fetchone(),(45,10000,20))

    def test_streams_and_repeat_preserve_recording(self):
        key,_=self.merge('strava',self.strava())
        streams={k:{'data':v} for k,v in dict(time=[0,1,2],distance=[0,3,6],moving=[True,False,True],heartrate=[100,101,102]).items()}
        self.assertEqual(add_recording(self.db,key,'strava',streams),3)
        self.assertEqual(add_recording(self.db,key,'strava',streams),0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM samples').fetchone()[0],3)
        self.assertEqual(self.db.execute('SELECT count(*) FROM events').fetchone()[0],3)

    def test_rollback_and_initial_boundary(self):
        self.merge('strava',self.strava())
        self.assertEqual(sync_dates(self.db,'garmin'),dt.date(2026,10,23))
        self.db.execute('BEGIN')
        self.merge('garmin',self.garmin())
        self.db.execute('ROLLBACK')
        self.assertEqual(self.db.execute('SELECT count(*) FROM sources').fetchone()[0],1)

    def test_garmin_token_is_plain_text(self):
        with patch('sync_api.urllib.request.build_opener') as build:
            response=build.return_value.open.return_value.__enter__.return_value
            response.read.return_value=b'header.payload.signature'
            self.assertEqual(Garmin('dummy').token,'header.payload.signature')
            request=build.return_value.open.call_args.args[0]
            self.assertEqual(request.get_header('Accept'),'text/plain')
            self.assertEqual(request.get_method(),'POST')


    def test_garmin_recording_accepts_zip_or_fit(self):
        with patch('sync_api.urllib.request.build_opener') as build:
            response=build.return_value.open.return_value.__enter__.return_value
            response.read.side_effect=[b'header.payload.signature',b'PK-original-recording']
            client=Garmin('dummy')
            self.assertEqual(client.recording('123'),b'PK-original-recording')
            request=build.return_value.open.call_args.args[0]
            self.assertEqual(request.get_header('Accept'),'*/*')


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.server=AdminServer(0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()

    def call(self,method,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        h={'Origin':self.server.origin,'Content-Type':'application/json'};h.update(headers or {})
        conn.request(method,path,json.dumps(body) if body is not None else None,h)
        res=conn.getresponse();result=(res.status,dict(res.getheaders()),res.read());conn.close();return result

    def test_auth_host_origin_and_csrf(self):
        self.assertEqual(self.call('GET','/api/status')[0],401)
        self.assertEqual(self.call('GET','/api/status',headers={'Host':'evil.example'})[0],403)
        self.assertEqual(self.call('POST','/api/unlock',{'key':self.server.launch_key}, {'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.call('POST','/api/unlock',{'key':'wrong'})[0],403)
        status,headers,_=self.call('POST','/api/unlock',{'key':self.server.launch_key})
        self.assertEqual(status,200)
        cookie=headers['Set-Cookie'].split(';')[0]
        self.assertIn('HttpOnly',headers['Set-Cookie'])
        self.assertEqual(self.call('POST','/api/sync',{}, {'Cookie':cookie})[0],403)
        status,_,body=self.call('GET','/api/status',headers={'Cookie':cookie})
        self.assertEqual(status,200)
        self.assertNotIn('credentials',body.decode())
        for path in ['/data/running.duckdb','/../data/admin/credentials.json','/oauth/strava/callback?state=bad&code=bad']:
            self.assertIn(self.call('GET',path)[0],(403,404))

    def test_private_file_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'secret.json';write_json(file,{'key':'dummy'})
            self.assertEqual(file.stat().st_mode & 0o777,0o600)


if __name__=='__main__':unittest.main()
