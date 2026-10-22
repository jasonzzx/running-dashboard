"""Post-import reconciliation and source-unit checks; does not mutate data."""
import json,datetime as dt
from pathlib import Path
import duckdb
ROOT=Path(__file__).resolve().parents[1]
db=duckdb.connect(str(ROOT/'data/running.duckdb'),read_only=True)
r=json.loads((ROOT/'reports/garmin_import_report.json').read_text())
assert r['garmin_summary_count']==r['matched_existing']+r['new_activities']+r['ambiguous']
assert db.execute('SELECT count(*)=count(distinct activity_key) FROM activities').fetchone()[0]
assert db.execute('SELECT count(*) FROM activities').fetchone()[0]==2775+r['new_activities']
assert db.execute('SELECT count(*) FROM activities WHERE source=\'strava\'').fetchone()[0]==2775
db.execute("ATTACH '"+str(ROOT/'data/pre_garmin.duckdb').replace("'","''")+"' AS original (READ_ONLY)")
assert db.execute("SELECT count(*) FROM (SELECT * FROM activities WHERE source='strava' EXCEPT ALL SELECT * FROM original.activities)").fetchone()[0]==0
assert db.execute('SELECT count(*) FROM garmin_matches').fetchone()[0]==r['matched_existing']
assert db.execute('SELECT count(*) FROM garmin_match_review').fetchone()[0]==r['ambiguous']
assert db.execute('SELECT count(*) FROM samples s LEFT JOIN activities a USING(activity_key) WHERE a.activity_key IS NULL').fetchone()[0]==0
assert db.execute('SELECT count(*) FROM (SELECT activity_key,sequence,count(*) n FROM samples GROUP BY 1,2 HAVING n>1)').fetchone()[0]==0
for row in db.execute('SELECT raw_json,distance_m,timer_s,vertical_oscillation_mm,step_length_m,cadence_spm FROM garmin_activity_metrics').fetchall():
 raw=json.loads(row[0])
 for key,v,scale in [('distance',row[1],.01),('duration',row[2],.001),('avgVerticalOscillation',row[3],10),('avgStrideLength',row[4],.01),('avgDoubleCadence',row[5],1)]:
  if raw.get(key) is not None:assert abs(v-raw[key]*scale)<1e-6
for table in ['activities','garmin_activity_metrics','garmin_sleep','garmin_daily','garmin_daily_metrics','samples','sources']:
 assert db.execute('SELECT count(*) FROM '+table).fetchone()==db.execute('SELECT count(*) FROM read_parquet(?)',[str(ROOT/'data/parquet'/(table+'.parquet'))]).fetchone()
assert db.execute('SELECT count(*) FILTER(WHERE calendar_date IS NOT NULL)=count(distinct calendar_date) FROM garmin_sleep').fetchone()[0]
print('PASS: activity reconciliation, unique sample keys, Garmin unit conversions, daily deduplication, Parquet counts')
