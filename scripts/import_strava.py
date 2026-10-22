#!/usr/bin/env python3
"""Build Strava activity base with resumable per-recording Parquet conversion."""
import collections, concurrent.futures, csv, datetime as dt, gzip, hashlib, io, json, math, os, shutil, sys, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import duckdb
from fitparse import FitFile

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw/strava'
CACHE=ROOT/'data/recordings'
VERSION=2
SCHEMAS={
 'samples': {'activity_key':'VARCHAR','file_key':'VARCHAR','sequence':'BIGINT','timestamp_utc':'VARCHAR','distance_m':'DOUBLE','speed_m_s':'DOUBLE','altitude_m':'DOUBLE','hr_bpm':'DOUBLE','cadence_raw':'DOUBLE','cadence_spm':'DOUBLE','power_w':'DOUBLE','temperature_c':'DOUBLE','latitude_deg':'DOUBLE','longitude_deg':'DOUBLE','ground_contact_ms':'DOUBLE','vertical_oscillation_mm':'DOUBLE','step_length_mm':'DOUBLE','vertical_ratio_pct':'DOUBLE','distance_origin':'VARCHAR'},
 'laps': {'activity_key':'VARCHAR','file_key':'VARCHAR','sequence':'BIGINT','start_utc':'VARCHAR','distance_m':'DOUBLE','timer_s':'DOUBLE','elapsed_s':'DOUBLE','avg_hr_bpm':'DOUBLE','max_hr_bpm':'DOUBLE','avg_power_w':'DOUBLE','trigger':'VARCHAR','raw_json':'VARCHAR'},
 'events': {'activity_key':'VARCHAR','file_key':'VARCHAR','sequence':'BIGINT','timestamp_utc':'VARCHAR','event':'VARCHAR','event_type':'VARCHAR','raw_json':'VARCHAR'},
 'sessions': {'activity_key':'VARCHAR','file_key':'VARCHAR','sequence':'BIGINT','start_utc':'VARCHAR','sport':'VARCHAR','sub_sport':'VARCHAR','distance_m':'DOUBLE','timer_s':'DOUBLE','elapsed_s':'DOUBLE','moving_s':'DOUBLE','avg_cadence_spm':'DOUBLE','raw_json':'VARCHAR'},
}

def serial(x):
 if isinstance(x,(dt.datetime,dt.date,dt.time)): return x.isoformat()
 if isinstance(x,bytes): return x.hex()
 raise TypeError(type(x).__name__)

def utc(x):
 if isinstance(x,dt.datetime): return x.replace(tzinfo=dt.timezone.utc).isoformat()
 return x

def first(v,*keys): return next((v[k] for k in keys if v.get(k) is not None),None)
def num(x): return float(x) if x not in ('',None) else None
def cad(v,key,frac):
 return 2*(v[key]+(v.get(frac) or 0)) if v.get(key) is not None else None

def quote(x): return "'"+str(x).replace("'","''")+"'"

def convert(task):
 aid,filename,sport=task
 folder=CACHE/aid
 folder.mkdir(parents=True,exist_ok=True)
 data=(RAW/filename).read_bytes()
 if filename.endswith('.gz'): data=gzip.decompress(data)
 digest=hashlib.sha256(data).hexdigest()
 status_path=folder/'status.json'
 if status_path.exists():
  prior=json.loads(status_path.read_text())
  if prior.get('version')==VERSION and prior.get('file_key')==digest and prior.get('ok') and all((folder/(k+'.parquet')).exists() for k in SCHEMAS): return prior
 handles={k:(folder/(k+'.jsonl.tmp')).open('w') for k in SCHEMAS}
 counts=collections.Counter(); unknown=collections.Counter(); qa=collections.Counter()
 start=None; end=None; prev_t=None; prev_d=None; sessions=[]
 def emit(table,row):
  nonlocal start,end,prev_t,prev_d
  row={'activity_key':('garmin:'+aid[7:] if aid.startswith('garmin-') else 'strava:'+aid),'file_key':digest,**row}
  handles[table].write(json.dumps(row,default=serial)+'\n'); counts[table]+=1
  if table=='samples':
   t=row.get('timestamp_utc'); d=row.get('distance_m'); h=row.get('hr_bpm')
   if not t: qa['missing_timestamp']+=1
   else:
    if prev_t and t<prev_t: qa['backward_timestamps']+=1
    if prev_t==t: qa['repeated_timestamps']+=1
    start=start or t;end=t;prev_t=t
   if d is not None:
    if prev_d is not None and d<prev_d: qa['distance_decreases']+=1
    prev_d=d
   if h is None: qa['missing_hr_samples']+=1
   elif h<25 or h>240: qa['hr_outlier_samples']+=1
   if row.get('latitude_deg') is None: qa['missing_gps_samples']+=1
   if row.get('speed_m_s') is not None and sport=='Run' and row['speed_m_s']>12: qa['speed_over_12m_s_samples']+=1
 try:
  if '.fit' in filename.lower():
   fit=FitFile(data,check_crc=True)
   running=sport=='Run'
   indices=collections.Counter()
   for m in fit.get_messages():
    kind=m.name; v=m.get_values(); n=indices[kind];indices[kind]+=1
    if kind.startswith('unknown_'): unknown[kind]+=1
    if kind=='record':
     lat,lon=v.get('position_lat'),v.get('position_long')
     emit('samples',dict(sequence=n,timestamp_utc=utc(v.get('timestamp')),distance_m=v.get('distance'),speed_m_s=first(v,'enhanced_speed','speed'),altitude_m=first(v,'enhanced_altitude','altitude'),hr_bpm=v.get('heart_rate'),cadence_raw=v.get('cadence'),cadence_spm=cad(v,'cadence','fractional_cadence') if running else None,power_w=v.get('power'),temperature_c=v.get('temperature'),latitude_deg=lat*180/2**31 if lat is not None else None,longitude_deg=lon*180/2**31 if lon is not None else None,ground_contact_ms=v.get('stance_time'),vertical_oscillation_mm=v.get('vertical_oscillation'),step_length_mm=v.get('step_length'),vertical_ratio_pct=v.get('vertical_ratio'),distance_origin='recorded'))
    elif kind=='lap':
     emit('laps',dict(sequence=n,start_utc=utc(v.get('start_time')),distance_m=v.get('total_distance'),timer_s=v.get('total_timer_time'),elapsed_s=v.get('total_elapsed_time'),avg_hr_bpm=v.get('avg_heart_rate'),max_hr_bpm=v.get('max_heart_rate'),avg_power_w=v.get('avg_power'),trigger=str(v['lap_trigger']) if v.get('lap_trigger') is not None else None,raw_json=json.dumps(v,default=serial)))
    elif kind=='event': emit('events',dict(sequence=n,timestamp_utc=utc(v.get('timestamp')),event=str(v.get('event')),event_type=str(v.get('event_type')),raw_json=json.dumps(v,default=serial)))
    elif kind=='session':
     s=dict(sequence=n,start_utc=utc(v.get('start_time')),sport=str(v.get('sport')),sub_sport=str(v.get('sub_sport')),distance_m=v.get('total_distance'),timer_s=v.get('total_timer_time'),elapsed_s=v.get('total_elapsed_time'),moving_s=v.get('total_moving_time'),avg_cadence_spm=cad(v,'avg_running_cadence','avg_fractional_cadence') if running else None,raw_json=json.dumps(v,default=serial))
     sessions.append(s);emit('sessions',s)
  else:
   root=ET.fromstring(data); n=0; distance=0
   for seg in root.iter():
    if seg.tag.split('}')[-1]!='trkseg': continue
    previous=None
    for point in seg:
     if point.tag.split('}')[-1]!='trkpt':continue
     lat=float(point.attrib['lat']);lon=float(point.attrib['lon'])
     if previous:
      a,b=map(math.radians,previous);c,d=map(math.radians,(lat,lon))
      h=math.sin((c-a)/2)**2+math.cos(a)*math.cos(c)*math.sin((d-b)/2)**2
      distance+=6371000*2*math.asin(min(1,math.sqrt(h)))
     previous=(lat,lon)
     values={x.tag.split('}')[-1]:x.text for x in point.iter() if x.text and x.text.strip()}
     t=values.get('time')
     if t: t=dt.datetime.fromisoformat(t.replace('Z','+00:00')).astimezone(dt.timezone.utc).isoformat()
     emit('samples',dict(sequence=n,timestamp_utc=t,distance_m=distance,speed_m_s=None,altitude_m=num(values.get('ele')),hr_bpm=num(values.get('hr')),cadence_raw=num(values.get('cad')),cadence_spm=None,power_w=num(values.get('power')),temperature_c=num(values.get('atemp')),latitude_deg=lat,longitude_deg=lon,ground_contact_ms=None,vertical_oscillation_mm=None,step_length_mm=None,vertical_ratio_pct=None,distance_origin='gps_haversine_within_segments'))
     n+=1
  for f in handles.values():f.close()
  con=duckdb.connect();con.execute('SET threads=1')
  for name,schema in SCHEMAS.items():
   temp=folder/(name+'.jsonl.tmp'); dest=folder/(name+'.parquet')
   if counts[name]: con.read_json(str(temp),columns=schema,format='newline_delimited').create_view('current_rows',replace=True)
   # Keep the same view scope in both branches. A TEMP view shadows the
   # relation created by create_view() on the next table, which can make a
   # later non-empty table inherit an earlier empty table's schema.
   else: con.execute('CREATE OR REPLACE VIEW current_rows AS SELECT '+','.join('CAST(NULL AS '+t+') AS '+k for k,t in schema.items())+' WHERE false')
   con.execute('COPY current_rows TO '+quote(dest)+" (FORMAT PARQUET, COMPRESSION ZSTD)")
   temp.unlink()
  con.close()
  result=dict(activity_id=aid,file_key=digest,filename=filename,version=VERSION,ok=True,counts=dict(counts),quality=dict(qa),unknown_messages=dict(unknown),first_sample_utc=start,last_sample_utc=end,sessions=[{k:v for k,v in s.items() if k!='raw_json'} for s in sessions])
 except Exception as e:
  for f in handles.values(): f.close()
  result=dict(activity_id=aid,file_key=digest,filename=filename,version=VERSION,ok=False,error=str(e))
 status_path.write_text(json.dumps(result,indent=2))
 return result


def read_metadata(archive):
 with zipfile.ZipFile(archive) as z:
  table=list(csv.reader(io.TextIOWrapper(z.open('activities.csv'),encoding='utf-8-sig')))
  header=table[0];seen=collections.Counter();unique=[]
  for h in header:
   seen[h]+=1;unique.append(h if seen[h]==1 else h+'__'+str(seen[h]))
  # Explicit checks protect against quietly reading a new schema with old column positions.
  assert header[0]=='Activity ID' and header[12]=='Filename' and header[17]=='Distance' and header[31]=='Average Heart Rate'
  records=[]; tasks=[]
  for r in table[1:]:
   aid=r[0];filename=r[12];d=num(r[17]);moving=num(r[16]);elapsed=num(r[15])
   start=dt.datetime.strptime(r[1],'%b %d, %Y, %I:%M:%S %p').replace(tzinfo=dt.timezone.utc).isoformat()
   records.append(dict(activity_key='strava:'+aid,source='strava',source_activity_id=aid,name=r[2],sport={'Run':'running','Ride':'cycling','Walk':'walking','Hike':'hiking'}.get(r[3],r[3].lower()),strava_activity_type=r[3],start_utc=start,description=r[4] or None,private_note=r[10] or None,gear=r[11] or None,source_filename=filename,distance_m=d,moving_s=moving,elapsed_s=elapsed,timer_s=None,avg_pace_s_km=moving*1000/d if moving and d else None,pace_basis='strava_moving_time',avg_hr_bpm=num(r[31]),max_hr_bpm=num(r[30]),ascent_m=num(r[20]),descent_m=num(r[21]),avg_power_w=num(r[33]),avg_cadence_raw=num(r[29]),avg_cadence_spm=None,relative_effort=num(r[37]),perceived_exertion=num(r[43]),calories=num(r[34]),training_load_source_value=num(r[88]),weather_temperature_c=num(r[56]),raw_json=json.dumps(dict(zip(unique,r)))))
   if filename:
    member=Path(filename)
    if member.is_absolute() or '..' in member.parts or member.parts[0]!='activities': raise ValueError('Unexpected member path: '+filename)
    destination=RAW/member;destination.parent.mkdir(parents=True,exist_ok=True)
    content=z.read(filename)
    if not destination.exists() or hashlib.sha256(destination.read_bytes()).digest()!=hashlib.sha256(content).digest(): destination.write_bytes(content)
    tasks.append((aid,filename,r[3]))
  for name in ['activities.csv','shoes.csv','bikes.csv','structured_details.csv']:
   (RAW/name).write_bytes(z.read(name))
 return records,tasks


def build(records,statuses,archive):
 by_id={s['activity_id']:s for s in statuses};sources=[];errors=[]
 for r in records:
  s=by_id.get(r['source_activity_id']);r['file_key']=s.get('file_key') if s else None
  r['sample_count']=s.get('counts',{}).get('samples',0) if s else 0
  r['detail_status']='imported' if s and s['ok'] else 'error_or_missing'
  ss=s.get('sessions',[]) if s else []
  r['sub_sport']=ss[0]['sub_sport'] if len(ss)==1 else None
  r['timer_s']=ss[0]['timer_s'] if len(ss)==1 else None
  r['avg_cadence_spm']=ss[0]['avg_cadence_spm'] if len(ss)==1 else None
  r['quality_flags']=json.dumps(s.get('quality',{}) if s else {})
  r['multi_session_file']=len(ss)>1
  sources.append(dict(activity_key=r['activity_key'],source='strava',source_activity_id=r['source_activity_id'],file_key=r['file_key'],path='data/raw/strava/'+r['source_filename'],match_method='export_filename'))
  if s and not s['ok']:errors.append(s)
 # Link existing Garmin pilot using exact original-file content, without adding a second activity.
 for p in (ROOT/'data/raw/garmin').glob('*.zip'):
  with zipfile.ZipFile(p) as z:
   for name in z.namelist():
    if not name.lower().endswith('.fit'):continue
    sha=hashlib.sha256(z.read(name)).hexdigest()
    matches=[r for r in records if r['file_key']==sha]
    method='exact_sha256'
    if not matches:
     sessions=list(FitFile(z.read(name),check_crc=True).get_messages('session'))
     if len(sessions)==1:
      v=sessions[0].get_values()
      matches=[r for r in records if r['start_utc']==utc(v.get('start_time'))
       and r['distance_m'] is not None and v.get('total_distance') is not None
       and abs(r['distance_m']-v['total_distance'])<1
       and r['timer_s'] is not None and v.get('total_timer_time') is not None
       and abs(r['timer_s']-v['total_timer_time'])<1]
      if len(matches)!=1: matches=[]
      method='unique_exact_start_distance_timer'
    for r in matches:
     sources.append(dict(activity_key=r['activity_key'],source='garmin',source_activity_id=name.split('_')[0],file_key=sha,path=str(p.relative_to(ROOT))+'::'+name,match_method=method))
 norm=ROOT/'data/normalized';norm.mkdir(exist_ok=True)
 for name,rows in [('activities',records),('sources',sources),('recording_quality',statuses)]:
  (norm/(name+'.jsonl')).write_text(''.join(json.dumps(r,default=serial)+'\n' for r in rows))
 pending=ROOT/'data/running.pending.duckdb'
 if pending.exists():pending.unlink()
 db=duckdb.connect(str(pending));db.execute('SET threads=4');db.execute("SET TimeZone='UTC'")
 db.execute("SET memory_limit='1GB'")
 for name in ['activities','sources']:
  db.execute('CREATE TABLE '+name+' AS SELECT * FROM read_json_auto(?,sample_size=-1)',[str(norm/(name+'.jsonl'))])
 for name in SCHEMAS:
  paths=[str(CACHE/s['activity_id']/(name+'.parquet')) for s in statuses if s['ok']]
  db.read_parquet(paths,union_by_name=True).create(name)
 db.execute('CREATE TABLE recording_quality AS SELECT * FROM read_json_auto(?,sample_size=-1)',[str(norm/'recording_quality.jsonl')])
 # Preserve all source CSV columns, including repeated header names, as JSON in activities.raw_json.
 for name in ['shoes','bikes','structured_details']:
  with (RAW/(name+'.csv')).open(newline='') as f:
   reader=csv.reader(f);h=next(reader);data=list(reader)
  definitions=','.join('"'+x.replace('"','""')+'" VARCHAR' for x in h)
  db.execute('CREATE TABLE '+name+' ('+definitions+')')
  if data:db.executemany('INSERT INTO '+name+' VALUES ('+','.join('?' for _ in h)+')',data)
 db.execute('''CREATE VIEW duplicate_candidates AS SELECT a.activity_key AS first_key,b.activity_key AS second_key
 FROM activities a JOIN activities b ON a.activity_key<b.activity_key AND a.sport=b.sport
 AND abs(epoch(CAST(a.start_utc AS TIMESTAMPTZ))-epoch(CAST(b.start_utc AS TIMESTAMPTZ)))<=5
 AND abs(a.distance_m-b.distance_m)<=greatest(100,a.distance_m*0.01) AND abs(a.elapsed_s-b.elapsed_s)<=30''')
 db.execute('''CREATE VIEW running_activities AS SELECT * FROM activities WHERE sport='running' ''')
 db.execute('''CREATE VIEW monthly_running AS SELECT date_trunc('month',CAST(start_utc AS TIMESTAMPTZ)) AS month_utc,count(*) AS runs,sum(distance_m)/1000 AS distance_km,sum(moving_s)/3600 AS moving_hours FROM running_activities GROUP BY 1 ORDER BY 1''')
 counts={name:db.execute('SELECT count(*) FROM '+name).fetchone()[0] for name in ['activities','running_activities','samples','laps','events','sessions','sources','duplicate_candidates']}
 # These are diagnostics, not edits to either provider's totals.
 diagnostics={
 'csv_vs_fit_start_mismatch':db.execute("SELECT count(*) FROM activities a JOIN sessions s USING(activity_key) WHERE abs(epoch(CAST(a.start_utc AS TIMESTAMPTZ))-epoch(CAST(s.start_utc AS TIMESTAMPTZ)))>5").fetchone()[0],
 'distance_difference_over_1pct_or_100m':db.execute('SELECT count(*) FROM activities a JOIN sessions s USING(activity_key) WHERE abs(a.distance_m-s.distance_m)>greatest(100,a.distance_m*0.01)').fetchone()[0],
 'activities_without_samples':db.execute('SELECT count(*) FROM activities WHERE sample_count=0').fetchone()[0],
 'multi_session_activities':db.execute('SELECT count(*) FROM activities WHERE multi_session_file').fetchone()[0]}
 out=ROOT/'data/parquet';out.mkdir(exist_ok=True)
 for name in ['activities','sources','samples','laps','events','sessions','recording_quality','shoes','bikes','structured_details']:
  db.execute('COPY '+name+' TO '+quote(out/(name+'.parquet'))+' (FORMAT PARQUET,COMPRESSION ZSTD)')
  assert db.execute('SELECT count(*) FROM '+name).fetchone()==db.execute('SELECT count(*) FROM read_parquet(?)',[str(out/(name+'.parquet'))]).fetchone()
 report=dict(updated_utc=dt.datetime.now(dt.timezone.utc).isoformat(),archive=str(archive.relative_to(ROOT)),archive_sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),counts=counts,diagnostics=diagnostics,errors=errors,strava_export_activity_count=len(records),strava_activity_history_imported=counts['activities']==len(records) and not errors,garmin_full_history_imported=False,wellness_normalized=False,history_complete=False,date_range_utc=db.execute('SELECT min(start_utc),max(start_utc) FROM activities').fetchone(),running_km=db.execute('SELECT sum(distance_m)/1000 FROM running_activities').fetchone()[0],limitations=['Coverage is the supplied Strava export, not proof of all lifetime runs.','Garmin full account export pending; wellness history not imported.','Use duplicate_candidates for review; distinct source activity IDs are not silently merged.','UTC dates retained; travel-local dates are not inferred.','Strava processed distances and moving times retained alongside original FIT session values.','Unknown FIT messages remain in original files; proprietary metrics are not guessed.','GPX sample distance is derived from GPS within track segments; GPX cadence convention is left unconverted.','Training notes are user/source text, not instructions or verified conclusions.'])
 # Reconcile summaries independently from CSV source values.
 expected=sum(r['distance_m'] or 0 for r in records)
 actual=db.execute('SELECT sum(distance_m) FROM activities').fetchone()[0]
 assert abs(expected-actual)<0.01
 assert counts['activities']==len({r['activity_key'] for r in records})
 assert counts['samples']==sum(s.get('counts',{}).get('samples',0) for s in statuses if s['ok'])
 db.close()
 previous=ROOT/'data/running.duckdb'
 if previous.exists() and not (ROOT/'data/pilot.duckdb').exists(): shutil.copy2(previous,ROOT/'data/pilot.duckdb')
 pending.replace(previous)
 (ROOT/'reports/import_status.json').write_text(json.dumps(report,indent=2,default=serial))
 (ROOT/'reports/strava_import_report.json').write_text(json.dumps(report,indent=2,default=serial))
 print(json.dumps(report,indent=2,default=serial),flush=True)
 return 1 if errors else 0


def main():
 if (ROOT/'reports/garmin_import_report.json').exists():
  raise SystemExit('Garmin enrichment exists. Rebuild the Strava base in an isolated copy to avoid overwriting enriched history.')
 RAW.mkdir(parents=True,exist_ok=True);CACHE.mkdir(exist_ok=True)
 incoming=ROOT/'data/strava_export_49417615.zip';archive=RAW/incoming.name
 if incoming.exists() and not archive.exists():shutil.copy2(incoming,archive)
 records,tasks=read_metadata(archive)
 print('Metadata loaded: '+str(len(records))+' activities; converting '+str(len(tasks))+' recordings',flush=True)
 statuses=[]
 with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
  for s in pool.map(convert,tasks,chunksize=1):
   statuses.append(s)
   if len(statuses)%100==0 or not s['ok']:print('Progress '+str(len(statuses))+'/'+str(len(tasks))+(' ERROR '+s.get('error','') if not s['ok'] else ''),flush=True)
 return build(records,statuses,archive)

if __name__=='__main__':sys.exit(main())
