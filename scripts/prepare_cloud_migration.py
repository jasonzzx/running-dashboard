"""Prepare the migration locally without modifying the canonical dataset."""
import json,sys,hashlib
from pathlib import Path
import duckdb
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'cloud'))
from archive import pack
folder=ROOT/'data/cloud';folder.mkdir(parents=True,exist_ok=True)
db=duckdb.connect(str(ROOT/'data/running.duckdb'),read_only=True)
anchor,raw=db.execute('SELECT garmin_activity_id,raw_json FROM garmin_activity_metrics WHERE raw_json IS NOT NULL ORDER BY garmin_activity_id DESC LIMIT 1').fetchone()
account=json.loads(raw).get('userProfileId')
if account is None:raise ValueError('Garmin account identity missing')
metadata={'garmin_anchor':str(anchor),'garmin_account':str(account),'strava_account':'49417615'}
pack(ROOT,folder/'baseline.zip')
metadata['baseline_sha256']=hashlib.sha256((folder/'baseline.zip').read_bytes()).hexdigest()
(folder/'metadata.json').write_text(json.dumps(metadata))
print('Prepared private migration snapshot:',(folder/'baseline.zip').stat().st_size,'bytes')
