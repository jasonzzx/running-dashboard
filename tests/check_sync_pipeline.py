"""Exercise real staging/build/export/promotion with fake APIs, in an isolated copy.

No external calls, Git mutations, or writes to the user's real dataset.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import duckdb
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from sync_runner import sync


class FakeStrava:
    def activities(self,start,end):
        yield '999999999999'
    def activity(self,aid):
        return dict(id=int(aid),type='Run',sport_type='Run',name='INTEGRATION TEST ONLY',
                    start_date='2026-10-23T12:00:00Z',distance=10000,moving_time=3000,elapsed_time=3000)
    def recording(self,aid):
        return {key:{'data':value} for key,value in dict(time=list(range(0,3001,15)),
                    distance=[i*10/3 for i in range(0,3001,15)],heartrate=[140]*201,moving=[True]*201).items()}


class BrokenStrava(FakeStrava):
    def recording(self,aid):
        raise RuntimeError('Simulated failed download')


def main():
    with tempfile.TemporaryDirectory(prefix='running-sync-test-') as folder:
        root=Path(folder)
        # Git snapshot avoids hydrating every unchanged iCloud-backed detail file.
        archive=subprocess.Popen(['git','archive','HEAD','dashboard'],cwd=ROOT,stdout=subprocess.PIPE)
        subprocess.run(['tar','-x','-C',folder],stdin=archive.stdout,check=True)
        archive.stdout.close();assert archive.wait()==0
        for name in ('scripts','tests'):(root/name).symlink_to(ROOT/name,target_is_directory=True)
        (root/'data').mkdir();(root/'reports').mkdir()
        shutil.copy2(ROOT/'data/running.duckdb',root/'data/running.duckdb')
        shutil.copy2(ROOT/'reports/import_status.json',root/'reports/import_status.json')
        shutil.copy2(ROOT/'reports/garmin_import_report.json',root/'reports/garmin_import_report.json')
        before=hashlib.sha256((root/'data/running.duckdb').read_bytes()).hexdigest()
        try:sync(print,root,clients={'strava':BrokenStrava()})
        except RuntimeError as exc:assert 'Simulated failed download' in str(exc)
        else:raise AssertionError('Failed download was accepted')
        assert hashlib.sha256((root/'data/running.duckdb').read_bytes()).hexdigest()==before
        result=sync(print,root,clients={'strava':FakeStrava()})
        assert result['added']==1 and result['samples']==201 and result['validated']
        with duckdb.connect(str(root/'data/running.duckdb'),read_only=True) as db:
            db.execute("ATTACH '"+str(ROOT/'data/running.duckdb').replace("'","''")+"' AS original (READ_ONLY)")
            # Every existing activity and sample remains exactly unchanged.
            for table in ('activities','samples','garmin_daily','garmin_sleep'):
                assert db.execute('SELECT count(*) FROM (SELECT * FROM original.'+table+' EXCEPT ALL SELECT * FROM '+table+')').fetchone()[0]==0,table
            assert db.execute('SELECT count(*) FROM activities').fetchone()[0]==3184
            assert db.execute('SELECT count(*) FROM read_parquet(?)',[str(root/'data/parquet/activities.parquet')]).fetchone()[0]==3184
        result2=sync(print,root,clients={'strava':FakeStrava()})
        assert result2['added']==0 and result2['skipped']==1 and result2['samples']==0
        detail=root/'dashboard/details/999999999999.js'
        assert detail.exists() and 'INTEGRATION TEST ONLY' in (root/'dashboard/data.js').read_text()
        print('PASS: failed downloads preserve live data; staged build and Parquet validate; history is unchanged; repeat sync adds no duplicates.')


if __name__=='__main__':main()
