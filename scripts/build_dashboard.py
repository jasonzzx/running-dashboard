#!/usr/bin/env python3
"""Export a local, buildless dashboard; plots are reduced, source database stays complete."""
import bisect,datetime as dt,json,math,os
from pathlib import Path
import duckdb
ROOT=Path(os.environ.get('RUNNING_DATA_ROOT',Path(__file__).resolve().parents[1]))
OUT=ROOT/'dashboard'

def js_json(value):
 return json.dumps(value,ensure_ascii=False,separators=(',',':'),default=str).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')

def dicts(result):
 names=[c[0] for c in result.description]
 return [dict(zip(names,r)) for r in result.fetchall()]

def late_split(rows):
 points=[(float(d),float(t)) for d,t in rows if d is not None and t is not None]
 if len(points)<2:return None
 if any(b[0]<a[0] or b[1]<a[1] for a,b in zip(points,points[1:])):return None
 distances=[p[0] for p in points]
 if distances[0]>5000 or distances[-1]<35000:return None
 def crossing(target):
  i=bisect.bisect_left(distances,target)
  if i>=len(points):return None
  if i==0:return points[0][1]
  d1,t1=points[i-1];d2,t2=points[i]
  return t1+(t2-t1)*(target-d1)/(d2-d1) if d2>d1 else t2
 a,b,c=crossing(5000),crossing(30000),crossing(33000)
 return dict(baseline_s_km=(b-a)/25,late_s_km=(points[-1][1]-c)/((distances[-1]-33000)/1000),end_km=distances[-1]/1000,method='Elapsed-time interpolation at recorded-distance crossings; pauses included')

def main():
 status=json.loads((ROOT/'reports/import_status.json').read_text())
 if not status.get('strava_activity_history_imported'):raise SystemExit('Strava import must finish successfully before dashboard build.')
 db=duckdb.connect(str(ROOT/'data/running.duckdb'),read_only=True); db.execute('SET threads=2')
 rows=dicts(db.execute('SELECT source_activity_id AS id,activity_key,source,name,sport,sub_sport,CAST(start_utc AS VARCHAR) AS start_utc,distance_m,moving_s,elapsed_s,avg_pace_s_km AS pace_s,avg_hr_bpm,avg_power_w,ascent_m,sample_count,description,private_note,source_filename FROM activities ORDER BY start_utc DESC'))
 for r in rows:r['date']=r['start_utc'][:10]
 OUT.mkdir(exist_ok=True);(OUT/'details').mkdir(exist_ok=True)
 for i,r in enumerate(rows):
  changed=os.environ.get('RUNNING_CHANGED_IDS')
  target=OUT/'details'/(r['id']+'.js')
  if changed is not None and r['id'] not in json.loads(changed) and target.exists():continue
  # Read the canonical tables so API imports need no historical cache rebuild.
  db.execute('CREATE OR REPLACE TEMP VIEW detail_samples AS SELECT * FROM samples WHERE activity_key='+"'"+r['activity_key'].replace("'","''")+"'")
  if not r['sample_count']:
   result=dict(points=[],laps=[],late=None,description=r['description'],private_note=r['private_note'],filename=r['source_filename'],sample_count=0,session_count=0,quality={},source=r['source'],summary_only=True)
   temp=target.with_suffix('.tmp');temp.write_text('window.receiveDetail('+json.dumps(r['id'])+','+js_json(result)+');\n');temp.replace(target)
   continue
  query='''WITH s AS (SELECT *,epoch(CAST(timestamp_utc AS TIMESTAMPTZ)) AS seconds FROM detail_samples), t AS (SELECT *,seconds-min(seconds) OVER () AS elapsed FROM s) SELECT avg(distance_m)/1000,avg(elapsed)/60,avg(speed_m_s),avg(hr_bpm),avg(power_w),avg(cadence_spm),avg(altitude_m),avg(ground_contact_ms),avg(vertical_oscillation_mm),avg(step_length_mm)/1000,avg(vertical_ratio_pct) FROM t GROUP BY floor(elapsed/15) ORDER BY min(sequence)'''
  points=db.execute(query).fetchall()
  points=[[round(x,4) if x is not None and math.isfinite(x) else None for x in p] for p in points]
  l=late_split(db.execute('SELECT distance_m,epoch(CAST(timestamp_utc AS TIMESTAMPTZ)) FROM detail_samples ORDER BY sequence').fetchall()) if r['distance_m'] and r['distance_m']>=30000 else None
  laps=dicts(db.execute('SELECT sequence,distance_m,timer_s,elapsed_s,avg_hr_bpm,avg_power_w FROM laps WHERE activity_key=? ORDER BY sequence',[r['activity_key']]))
  sessions=db.execute('SELECT count(*) FROM sessions WHERE activity_key=?',[r['activity_key']]).fetchone()[0]
  quality=db.execute('SELECT quality_flags FROM activities WHERE activity_key=?',[r['activity_key']]).fetchone()[0]
  result=dict(source=r['source'],points=points,laps=laps,late=l,description=r['description'],private_note=r['private_note'],filename=r['source_filename'],sample_count=r['sample_count'],session_count=sessions,quality=json.loads(quality or '{}'))
  temp=target.with_suffix('.tmp');temp.write_text('window.receiveDetail('+json.dumps(r['id'])+','+js_json(result)+');\n');temp.replace(target)
  if (i+1)%500==0:print('Dashboard details '+str(i+1)+'/'+str(len(rows)),flush=True)
 clean=[{k:v for k,v in r.items() if k not in ['private_note','source_filename']} for r in rows]
 (OUT/'data.js').write_text('window.RUNNING_DATA='+js_json(dict(status=status,activities=clean))+';\n')
 print('Dashboard ready: '+str(OUT/'index.html'),flush=True)
 db.close()
 from build_pace_distribution import build as build_pace
 build_pace()
 from build_analysis import build
 build()
 from build_garmin_dashboard import build as build_garmin
 build_garmin()
 import subprocess
 if os.environ.get('RUNNING_DEFER_REPORTS')!='1':
  subprocess.run(['node',str(Path(__file__).resolve().parent/'build_analysis_reports.mjs')],check=True)
if __name__=='__main__':main()
