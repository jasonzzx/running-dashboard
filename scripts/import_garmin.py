#!/usr/bin/env python3
"""Idempotent Garmin enrichment; stage from immutable pre-Garmin database."""
import collections,datetime as dt,hashlib,json,shutil,zipfile,sys
from pathlib import Path
import duckdb
ROOT=Path(__file__).resolve().parents[1]; EXPORT=ROOT/'data/garmin_export/DI_CONNECT'
def dumps(v):return json.dumps(v,default=str,ensure_ascii=False)
def date(v):
 if isinstance(v,(float,int)):return dt.datetime.fromtimestamp(v/1000,dt.timezone.utc).date().isoformat()
 return str(v)[:10] if v else None
def iso(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).isoformat()
def sport(r):return {'running':'running','treadmill_running':'running','track_running':'running','trail_running':'running','indoor_running':'running','ultra_run':'running','walking':'walking','cycling':'cycling','mountaineering':'hiking','lap_swimming':'swimming','indoor_rowing':'rowing','floor_climbing':'workout','stair_climbing':'stair-stepper','meditation':'workout'}.get(r['activityType'],r['activityType'])
def setting(r):return {'running':'generic','treadmill_running':'treadmill','track_running':'track','trail_running':'trail','indoor_running':'indoor_running','ultra_run':'ultra_running'}.get(r['activityType'],r['activityType'])
def scaled(r,k,n=1):return r[k]/n if r.get(k) is not None else None
METRICS={'avgGroundContactTime':('ground_contact_ms',1),'avgVerticalOscillation':('vertical_oscillation_mm',.1),'avgStrideLength':('step_length_m',100),'avgVerticalRatio':('vertical_ratio_pct',1),'avgGroundContactBalance':('ground_contact_balance_left_pct',1),'avgDoubleCadence':('cadence_spm',1),'avgPower':('avg_power_w',1),'normPower':('normalized_power_w',1),'vO2MaxValue':('vo2max_ml_kg_min',1),'aerobicTrainingEffect':('aerobic_training_effect',1),'anaerobicTrainingEffect':('anaerobic_training_effect',1),'activityTrainingLoad':('training_load',1),'lactateThresholdBpm':('lactate_threshold_bpm',1)}
def main():
 backup=ROOT/'data/pre_garmin.duckdb';live=ROOT/'data/running.duckdb'
 if not backup.exists():shutil.copy2(live,backup)
 stage=ROOT/'data/garmin.pending.duckdb';shutil.copy2(backup,stage)
 db=duckdb.connect(str(stage));db.execute("SET TimeZone='UTC'");db.execute("SET memory_limit='1GB'");db.execute('SET threads=2')
 base=[dict(zip([d[0] for d in db.description],r)) for r in db.execute('SELECT * FROM activities').fetchall()]
 # description is read only after execute above.
 by=collections.defaultdict(list)
 for r in base:by[int(dt.datetime.fromisoformat(r['start_utc']).timestamp())].append(r)
 gs={};filemap={}
 for p in sorted(EXPORT.rglob('*summarizedActivities.json')):
  for group in json.loads(p.read_text()):
   for r in group['summarizedActivitiesExport']:
    aid=str(r['activityId'])
    if aid in gs:assert gs[aid]==r,'Conflicting Garmin summary ID'
    gs[aid]=r;filemap[aid]=str(p.relative_to(ROOT))
 matches=[];reviews=[];enriched=[];new=[];used=set()
 for aid,r in sorted(gs.items(),key=lambda x:x[1]['beginTimestamp']):
  t=r['beginTimestamp']/1000;distance=(r.get('distance') or 0)/100;timer=(r.get('duration')or 0)/1000;elapsed=(r.get('elapsedDuration')or r.get('duration')or 0)/1000
  near=[a for sec in range(int(t)-15,int(t)+16) for a in by[sec] if a['sport']==sport(r)]
  strict=[a for a in near if abs(dt.datetime.fromisoformat(a['start_utc']).timestamp()-t)<=5 and abs(a['distance_m']-distance)<=max(100,distance*.02) and (a['timer_s'] is None or abs(a['timer_s']-timer)<=max(30,timer*.02))]
  method='unique_start_distance_timer'
  if not strict:
   strict=[a for a in near if abs(dt.datetime.fromisoformat(a['start_utc']).timestamp()-t)<=1 and a['timer_s'] is not None and abs(a['timer_s']-timer)<1];method='unique_exact_start_timer_distance_conflict'
  if not strict:
   strict=[a for a in near if abs(a['distance_m']-distance)<=max(150,distance*.05) and abs(a['elapsed_s']-elapsed)<=20];method='unique_near_start_distance_elapsed'
  a=strict[0] if len(strict)==1 else None
  if a and a['activity_key'] in used:raise ValueError('Two Garmin IDs matched one activity: '+a['activity_key'])
  if a:
   key=a['activity_key'];used.add(key);matches.append(dict(garmin_id=aid,activity_key=key,method=method,distance_difference_m=distance-a['distance_m']))
  elif near:
   key=None;reviews.append(dict(garmin_id=aid,candidate_keys=[a['activity_key'] for a in near],reason='Potential overlap; not included as another canonical activity',start_utc=iso(r['beginTimestamp']),garmin_distance_m=distance))
  else:
   key='garmin:'+aid
   row={k:None for k in base[0]};row.update(activity_key=key,source='garmin',source_activity_id='garmin-'+aid,name=r.get('name'),sport=sport(r),start_utc=iso(r['beginTimestamp']),distance_m=distance,moving_s=scaled(r,'movingDuration',1000),elapsed_s=elapsed,timer_s=timer,avg_pace_s_km=scaled(r,'movingDuration')/distance if distance and r.get('movingDuration') else None,pace_basis='garmin_moving_time',avg_hr_bpm=r.get('avgHr'),max_hr_bpm=r.get('maxHr'),ascent_m=scaled(r,'elevationGain',100),descent_m=scaled(r,'elevationLoss',100),avg_power_w=r.get('avgPower'),avg_cadence_spm=r.get('avgDoubleCadence'),calories=scaled(r,'calories',4.184),raw_json=dumps(r),sub_sport=setting(r),sample_count=0,detail_status='garmin_summary_only',quality_flags='{}',multi_session_file=False,source_filename=filemap[aid])
   new.append(row)
  enriched.append(dict(activity_key=key,garmin_activity_id=aid,start_utc=iso(r['beginTimestamp']),activity_type=r['activityType'],sport=sport(r),sub_sport=setting(r),distance_m=distance,timer_s=timer,elapsed_s=elapsed,moving_s=scaled(r,'movingDuration',1000),device_id=str(r.get('deviceId','')),training_effect_label=r.get('trainingEffectLabel'),**{dest:scaled(r,src,n) for src,(dest,n) in METRICS.items()},source_path=filemap[aid],raw_json=dumps(r)))
 def table(name,rows,schema=None):
  path=ROOT/'data/normalized'/(name+'.jsonl');path.write_text(''.join(dumps(r)+'\n' for r in rows))
  if rows:db.execute('CREATE OR REPLACE TABLE '+name+' AS SELECT * FROM read_json_auto(?,sample_size=-1,maximum_object_size=67108864)',[str(path)])
  else:db.execute('CREATE OR REPLACE TABLE '+name+' ('+(schema or 'raw_json VARCHAR')+')')
 table('garmin_activity_metrics',enriched)
 table('garmin_matches',matches)
 table('garmin_match_review',reviews,'garmin_id VARCHAR,candidate_keys VARCHAR[],reason VARCHAR,start_utc VARCHAR,garmin_distance_m DOUBLE')
 if new:
  table('garmin_new_activities',new)
  db.execute('INSERT INTO activities BY NAME SELECT * FROM garmin_new_activities')
 # Preserve existing Strava summaries; add source links, not duplicate activity rows.
 db.execute("DELETE FROM sources WHERE source='garmin'")
 db.execute("INSERT INTO sources SELECT activity_key,'garmin',garmin_activity_id,NULL,source_path,'garmin_summary_link' FROM garmin_activity_metrics WHERE activity_key IS NOT NULL")
 # Normalize useful daily records and retain the rest of fitness/wellness/metrics JSON as queryable raw records.
 raw=[];sleep=[];daily=[];health=[];metrics=[]
 dirs=['DI-Connect-Metrics','DI-Connect-Wellness','DI-Connect-Aggregator','DI-Connect-Fitness']
 for directory in dirs:
  for p in sorted((EXPORT/directory).glob('*.json')):
   if 'summarizedActivities' in p.name:continue
   obj=json.loads(p.read_text());records=obj if isinstance(obj,list) else [obj]
   for i,r in enumerate(records):
    if not isinstance(r,dict):continue
    day=date(r.get('calendarDate') or r.get('asOfDateGmt') or r.get('metaData',{}).get('calendarDate'))
    src=str(p.relative_to(ROOT));raw.append(dict(source_path=src,record_index=i,calendar_date=day,record_type=p.name.split('_')[0] if directory!='DI-Connect-Wellness' else ('sleep' if 'sleepData' in p.name else 'health_status' if 'healthStatusData' in p.name else p.stem.split('_',1)[-1]),raw_json=dumps(r)))
    if 'sleepData' in p.name:
     parts=[r.get(k) for k in ['deepSleepSeconds','lightSleepSeconds','remSleepSeconds']]
     sleep.append(dict(calendar_date=day,start_utc=r.get('sleepStartTimestampGMT'),end_utc=r.get('sleepEndTimestampGMT'),sleep_seconds=sum(x or 0 for x in parts) if any(x is not None for x in parts) else None,awake_seconds=r.get('awakeSleepSeconds'),score=r.get('sleepScores',{}).get('overallScore'),source_path=src,raw_json=dumps(r)))
    if p.name.startswith('UDSFile'):
     stress=next((a.get('averageStressLevel') for a in r.get('allDayStress',{}).get('aggregatorList',[]) if a.get('type')=='TOTAL'),None)
     daily.append(dict(calendar_date=day,resting_hr_bpm=r.get('restingHeartRate'),steps=r.get('totalSteps'),stress=stress,duration_ms=r.get('durationInMilliseconds'),source_path=src,raw_json=dumps(r)))
    if 'healthStatusData' in p.name:
     for m in r.get('metrics',[]):health.append(dict(calendar_date=day,metric=m['type'],value=m.get('value'),status=m.get('status'),baseline_low=m.get('baselineLowerLimit'),baseline_high=m.get('baselineUpperLimit'),source_path=src))
    if directory=='DI-Connect-Metrics':
     typ=p.name.split('_')[0]
     mapping={'TrainingReadinessDTO':{'score':'readiness_score','hrvWeeklyAverage':'hrv_weekly_average_ms'},'MetricsMaxMetData':{'vo2MaxValue':'vo2max_ml_kg_min'},'MetricsAcuteTrainingLoad':{'dailyTrainingLoadAcute':'acute_load','dailyTrainingLoadChronic':'chronic_load'},'RunRacePredictions':{'raceTimeMarathon':'predicted_marathon_s','raceTimeHalf':'predicted_half_s','raceTime10K':'predicted_10k_s','raceTime5K':'predicted_5k_s'}}.get(typ,{})
     for srcfield,dest in mapping.items():
      if r.get(srcfield) is not None:metrics.append(dict(calendar_date=day,timestamp=str(r.get('timestamp') or r.get('updateTimestamp') or ''),metric=dest,value=r[srcfield],sport=r.get('sport'),device_id=str(r.get('deviceId','')),source_path=src,raw_json=dumps(r)))
 for name,rows in [('garmin_raw_records',raw),('garmin_sleep',sleep),('garmin_daily',daily),('garmin_health_status',health),('garmin_daily_metrics',metrics)]:table(name,rows)
 # Overlapping date-range export files are reconciled deterministically. Raw records remain intact.
 for name,partition,order in [('garmin_sleep','calendar_date','start_utc DESC'),('garmin_daily','calendar_date','duration_ms DESC'),('garmin_health_status','calendar_date,metric','source_path DESC'),('garmin_daily_metrics','calendar_date,metric,coalesce(sport,\'\'),device_id','timestamp DESC')]:
  db.execute(f'CREATE OR REPLACE TABLE {name} AS SELECT * EXCLUDE(rn) FROM (SELECT *,row_number() OVER(PARTITION BY {partition} ORDER BY {order}) rn FROM {name}) WHERE rn=1')
 db.close()
 report=dict(garmin_summary_count=len(gs),matched_existing=len(matches),new_activities=len(new),ambiguous=len(reviews),match_methods=dict(collections.Counter(r['method'] for r in matches)),dedicated_running_economy_field_found=False,metric_coverage={dest:sum(r[dest] is not None for r in enriched) for dest,n in METRICS.values()},unit_conversions={'distance':'centimetres / 100 → m','duration':'milliseconds / 1000 → s','vertical_oscillation':'cm × 10 → mm','stride_length':'cm / 100 → m','cadence':'avgDoubleCadence → steps/min (both feet)','calories':'kJ / 4.184 → kcal'},source='data/garmin_export',reviews=reviews)
 (ROOT/'reports/garmin_import_report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()
