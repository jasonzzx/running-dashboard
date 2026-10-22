"""Link Garmin recordings, import new sample series and atomically promote the enriched database."""
import json,datetime as dt,zipfile,hashlib,collections,concurrent.futures
from pathlib import Path
import duckdb
import import_strava as parser
ROOT=Path(__file__).resolve().parents[1]
parser.RAW=ROOT/'data/raw/garmin'
def epoch(s):return dt.datetime.fromisoformat(str(s).replace('Z','+00:00')).replace(tzinfo=dt.timezone.utc).timestamp()
def main():
 ix=json.loads((ROOT/'data/garmin_index.json').read_text());report=json.loads((ROOT/'reports/garmin_import_report.json').read_text())
 db=duckdb.connect(str(ROOT/'data/garmin.pending.duckdb'));db.execute('SET threads=2')
 rows=db.execute('SELECT garmin_activity_id,activity_key,start_utc,timer_s,distance_m,sport FROM garmin_activity_metrics').fetchall();by=collections.defaultdict(list)
 for r in rows:by[int(epoch(r[2]))].append(r)
 links=[];ambiguous=[];seen=set();tasks=[]
 for f in ix['files']:
  if len(f['sessions'])!=1:continue
  s=f['sessions'][0];start=s.get('start_time')
  if not start:continue
  t=epoch(start)
  candidates=[r for sec in range(int(t)-2,int(t)+3) for r in by[sec] if s.get('total_timer_time') is not None and abs(r[3]-s['total_timer_time'])<2]
  if len(candidates)!=1:
   if len(candidates)>1:ambiguous.append(f['member'])
   continue
  aid,key,*_=candidates[0]
  if aid in seen:continue
  seen.add(aid);links.append(dict(garmin_activity_id=aid,activity_key=key,file_key=f['sha256'],archive=f['archive'],member=f['member']))
  if key and key.startswith('garmin:'):
   dest=parser.RAW/'activities'/f'{aid}.fit';dest.parent.mkdir(parents=True,exist_ok=True)
   with zipfile.ZipFile(ROOT/f['archive']) as z:dest.write_bytes(z.read(f['member']))
   tasks.append(('garmin-'+aid,'activities/'+aid+'.fit','Run' if candidates[0][5]=='running' else candidates[0][5]))
 print('Linked original recordings',len(links),'new recordings to convert',len(tasks),flush=True)
 path=ROOT/'data/normalized/garmin_recordings.jsonl';path.write_text(''.join(json.dumps(r)+'\n' for r in links))
 db.execute('CREATE OR REPLACE TABLE garmin_recordings AS SELECT * FROM read_json_auto(?)',[str(path)])
 db.execute("UPDATE sources SET file_key=r.file_key,path=r.archive||'::'||r.member FROM garmin_recordings r WHERE sources.source='garmin' AND sources.source_activity_id=r.garmin_activity_id")
 statuses=[]
 with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
  for s in pool.map(parser.convert,tasks,chunksize=1):
   statuses.append(s)
   if len(statuses)%50==0:print('Converted',len(statuses),'/',len(tasks),flush=True)
 errors=[s for s in statuses if not s['ok']]
 for s in statuses:
  if not s['ok']:continue
  aid=s['activity_id'];key='garmin:'+aid[7:]
  for name in parser.SCHEMAS:
   db.execute('INSERT INTO '+name+' BY NAME SELECT * FROM read_parquet(?)',[str(parser.CACHE/aid/(name+'.parquet'))])
  db.execute("UPDATE activities SET file_key=?,sample_count=?,detail_status='imported',source_filename=?,quality_flags=? WHERE activity_key=?",[s['file_key'],s['counts'].get('samples',0),s['filename'],json.dumps(s['quality']),key])
 if statuses:
  quality_path=ROOT/'data/normalized/garmin_recording_quality.jsonl'
  quality_path.write_text(''.join(json.dumps(s)+'\n' for s in statuses))
  schema={r[0]:r[1] for r in db.execute('DESCRIBE recording_quality').fetchall()}
  db.read_json(str(quality_path),columns=schema,format='newline_delimited').create_view('new_recording_quality')
  db.execute('INSERT INTO recording_quality BY NAME SELECT * FROM new_recording_quality')
 # Units validated against independently decoded FIT session values.
 unitchecks=db.execute("SELECT count(*),max(abs(a.distance_m-s.distance_m)),max(abs(a.timer_s-s.timer_s)) FROM garmin_activity_metrics a JOIN sessions s USING(activity_key)").fetchone()
 assert unitchecks[0]>2000
 assert db.execute('SELECT median(abs(a.timer_s-s.timer_s)) FROM garmin_activity_metrics a JOIN sessions s USING(activity_key)').fetchone()[0]<1
 report.update(recordings_linked=len(links),new_recordings_imported=sum(s['ok'] for s in statuses),recording_errors=errors,fit_index_errors=ix['errors'],unit_validation=dict(pairs=unitchecks[0],max_distance_difference_m=unitchecks[1],max_timer_difference_s=unitchecks[2],notes='Summary-vs-original differences can reflect treadmill calibration or edits; source values are retained separately.'))
 status=json.loads((ROOT/'reports/import_status.json').read_text())
 status['counts']={name:db.execute('SELECT count(*) FROM '+name).fetchone()[0] for name in ['activities','running_activities','samples','laps','events','sessions','sources','duplicate_candidates']}
 status.update(updated_utc=dt.datetime.now(dt.timezone.utc).isoformat(),garmin_full_history_imported=True,wellness_normalized=True,history_complete=False,date_range_utc=list(db.execute('SELECT min(start_utc),max(start_utc) FROM activities').fetchone()),running_km=db.execute('SELECT sum(distance_m)/1000 FROM running_activities').fetchone()[0],garmin=report)
 status['diagnostics']['activities_without_samples']=db.execute('SELECT count(*) FROM activities WHERE sample_count=0').fetchone()[0]
 status['limitations']=[s for s in status['limitations'] if 'pending' not in s and 'supplied Strava' not in s]+['Coverage is the union of supplied Strava and Garmin exports, not proof of all lifetime activity.','Ambiguous Garmin overlaps remain in garmin_match_review and are excluded from canonical totals until reviewed.','Garmin wellness calendar dates are source-local; activity dates remain UTC.','Garmin running dynamics are not a direct measurement of running economy; no dedicated economy field was found.','Garmin-only moving time is Garmin processed time; matched summaries retain Strava values.']
 assert db.execute('SELECT count(*)=count(distinct activity_key) FROM activities').fetchone()[0]
 assert report['garmin_summary_count']==report['matched_existing']+report['new_activities']+report['ambiguous']
 assert db.execute('SELECT count(*) FROM garmin_activity_metrics WHERE activity_key IS NOT NULL').fetchone()[0]==report['garmin_summary_count']-report['ambiguous']
 db.execute('''CREATE OR REPLACE VIEW activity_features AS SELECT a.*,g.garmin_activity_id,g.ground_contact_ms,g.vertical_oscillation_mm,g.step_length_m,g.vertical_ratio_pct,g.ground_contact_balance_left_pct,g.cadence_spm AS garmin_cadence_spm,g.avg_power_w AS garmin_avg_power_w,g.normalized_power_w,g.vo2max_ml_kg_min,g.aerobic_training_effect,g.anaerobic_training_effect,g.training_load,g.lactate_threshold_bpm,g.training_effect_label FROM activities a LEFT JOIN garmin_activity_metrics g USING(activity_key)''')
 exporttables=['activities','sources','recording_quality','samples','laps','events','sessions','garmin_activity_metrics','garmin_matches','garmin_match_review','garmin_recordings','garmin_raw_records','garmin_sleep','garmin_daily','garmin_health_status','garmin_daily_metrics','activity_features']
 for name in exporttables:
  db.execute('COPY '+name+' TO ? (FORMAT PARQUET, COMPRESSION ZSTD)',[str(ROOT/'data/parquet'/(name+'.parquet'))])
  assert db.execute('SELECT count(*) FROM '+name).fetchone()==db.execute('SELECT count(*) FROM read_parquet(?)',[str(ROOT/'data/parquet'/(name+'.parquet'))]).fetchone()
 for name in ['activities','sources']:
  db.execute('COPY '+name+' TO ? (FORMAT JSON)',[str(ROOT/'data/normalized'/(name+'.jsonl'))])
 db.close();(ROOT/'data/garmin.pending.duckdb').replace(ROOT/'data/running.duckdb')
 (ROOT/'reports/import_status.json').write_text(json.dumps(status,indent=2));(ROOT/'reports/garmin_import_report.json').write_text(json.dumps(report,indent=2))
 print(json.dumps(dict(counts=status['counts'],garmin=report),indent=2),flush=True)
if __name__=='__main__':main()
