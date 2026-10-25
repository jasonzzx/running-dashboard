"""Test the disposable cloud worker mode without contacting cloud services."""
import hashlib,json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
from check_sync_pipeline import ROOT,FakeStrava
from sync_runner import sync
sys.path.insert(0,str(ROOT/'cloud'))
from archive import pack,unpack

before=hashlib.sha256((ROOT/'data/running.duckdb').read_bytes()).hexdigest()
try:sync(print,ROOT,clients={'strava':FakeStrava()},finalize=False,isolated=True)
except ValueError:pass
else:raise AssertionError('Cloud mode accepted the real master directory')
with tempfile.TemporaryDirectory(prefix='running-cloud-test-') as folder:
    root=Path(folder)
    a=subprocess.Popen(['git','archive','HEAD','dashboard'],cwd=ROOT,stdout=subprocess.PIPE)
    subprocess.run(['tar','-x','-C',folder],stdin=a.stdout,check=True);a.stdout.close();assert a.wait()==0
    for name in ('scripts','tests'):(root/name).symlink_to(ROOT/name,target_is_directory=True)
    (root/'data').mkdir();(root/'reports').mkdir()
    shutil.copy2(ROOT/'data/running.duckdb',root/'data/running.duckdb')
    for name in ('import_status.json','garmin_import_report.json'):shutil.copy2(ROOT/'reports'/name,root/'reports'/name)
    result=sync(print,root,clients={'strava':FakeStrava()},finalize=False,isolated=True)
    assert result['added']==1 and result['validated'] is False
    assert not (root/'data/admin/backups').exists()
    env=dict(os.environ,RUNNING_DATA_ROOT=folder)
    subprocess.run(['node',str(ROOT/'scripts/build_analysis_reports.mjs')],env=env,check=True)
    subprocess.run(['node',str(ROOT/'tests/check_deployment.mjs')],env=env,check=True)
    # Cloud archives must contain no credentials, lockfiles, or local backups.
    (root/'data/admin/credentials.json').write_text('{"fake":"must-not-leave"}')
    pack(root,root/'candidate.zip')
    import zipfile
    with zipfile.ZipFile(root/'candidate.zip') as z:
        assert 'data/admin/credentials.json' not in z.namelist()
        assert 'data/running.duckdb' in z.namelist()
assert hashlib.sha256((ROOT/'data/running.duckdb').read_bytes()).hexdigest()==before
print('PASS: isolated cloud merge, separate validation, credential exclusion, real master unchanged.')
