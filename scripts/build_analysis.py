#!/usr/bin/env python3
"""Reproducible, evidence-linked analysis from the full imported running history."""
import datetime as dt, json, statistics as st
from pathlib import Path
import duckdb
ROOT=Path(__file__).resolve().parents[1]

def build():
 raw=(ROOT/'dashboard/data.js').read_text().split('=',1)[1].rstrip(';\n')
 data=json.loads(raw); runs=[r for r in data['activities'] if r['sport']=='running']
 end=max(dt.date.fromisoformat(r['date']) for r in runs)
 def summary(rows,days=None):
  km=sum(r['distance_m'] or 0 for r in rows)/1000
  timed=[r for r in rows if r['distance_m'] is not None and r['distance_m']>0 and r['moving_s'] is not None and r['moving_s']>0]
  timed_km=sum(r['distance_m'] for r in timed)/1000
  secs=sum(r['moving_s'] for r in timed)
  return dict(n=len(rows),km=km,hours=secs/3600 if timed else None,pace=secs/timed_km if timed_km else None,timed_n=len(timed),days=len(set(r['date'] for r in rows)),long25=sum(r['distance_m']>=25000 for r in rows),long30=sum(r['distance_m']>=30000 for r in rows),hr_n=sum(r['avg_hr_bpm'] is not None for r in rows),weekly_km=km/(days/7) if days else None)
 cohorts={}
 for key,sub in [('road','generic'),('treadmill','treadmill'),('track','track'),('trail','trail'),('other',None)]:
  rr=[r for r in runs if (r['sub_sport']==sub if sub else r['sub_sport'] not in ['generic','treadmill','track','trail'])]
  recent=[r for r in rr if r['date']>=(end-dt.timedelta(days=83)).isoformat()]
  annual=[]
  for year in sorted(set(r['date'][:4] for r in runs)):
   yr=[r for r in rr if r['date'][:4]==year]; annual.append(dict(year=year,**summary(yr)))
  blocks=[]
  for i in range(3):
   hi=end-dt.timedelta(days=i*28);lo=hi-dt.timedelta(days=27)
   b=[r for r in rr if lo.isoformat()<=r['date']<=hi.isoformat()]
   blocks.append(dict(start=str(lo),end=str(hi),**summary(b,28)))
  # Broad matched-distance and pace cohort; descriptive only, not an efficiency test.
  matched=[]
  for i in range(2):
   hi=end-dt.timedelta(days=i*42);lo=hi-dt.timedelta(days=41)
   m=[r for r in rr if lo.isoformat()<=r['date']<=hi.isoformat() and 8000<=r['distance_m']<=16000 and r['pace_s'] and 270<=r['pace_s']<=300 and r['avg_hr_bpm']]
   matched.append(dict(start=str(lo),end=str(hi),n=len(m),hr=st.median(r['avg_hr_bpm'] for r in m) if m else None,pace=st.median(r['pace_s'] for r in m) if m else None,ids=[r['id'] for r in m]))
  cohorts[key]=dict(all=summary(rr),recent=summary(recent,84),annual=annual,blocks=blocks,matched=matched,evidence=[dict(id=r['id'],date=r['date'],name=r['name'],km=r['distance_m']/1000) for r in recent[:8]])
 long=[]
 for r in runs:
  if r['distance_m']<35000:continue
  path=ROOT/'dashboard/details'/f"{r['id']}.js"
  detail=json.loads(path.read_text().split(',',1)[1].rstrip(');\n'))
  l=detail.get('late')
  if l and l.get('baseline_s_km') and l.get('late_s_km'):
   long.append(dict(id=r['id'],date=r['date'],name=r['name'],setting=r['sub_sport'],km=r['distance_m']/1000,elapsed_s=r['elapsed_s'],hr=r['avg_hr_bpm'],baseline=l['baseline_s_km'],late=l['late_s_km'],change=(l['late_s_km']/l['baseline_s_km']-1)*100))
 db=duckdb.connect(str(ROOT/'data/running.duckdb'),read_only=True)
 wellness={}
 for date,value in db.execute('SELECT calendar_date,sleep_seconds/3600.0 FROM garmin_sleep WHERE sleep_seconds>0 AND calendar_date<=?', [end]).fetchall():wellness.setdefault(date,{})['sleep_hours']=value
 for date,value in db.execute('SELECT calendar_date,score FROM garmin_sleep WHERE score IS NOT NULL AND calendar_date<=?', [end]).fetchall():wellness.setdefault(date,{})['sleep_score']=value
 for date,value in db.execute('SELECT calendar_date,resting_hr_bpm FROM garmin_daily WHERE resting_hr_bpm>0 AND calendar_date<=?', [end]).fetchall():wellness.setdefault(date,{})['resting_hr_bpm']=value
 for date,metric,value in db.execute("""SELECT calendar_date,metric,value FROM garmin_daily_metrics WHERE metric IN ('hrv_weekly_average_ms','readiness_score','acute_load') AND value IS NOT NULL AND calendar_date<=? QUALIFY row_number() OVER(PARTITION BY calendar_date,metric ORDER BY timestamp DESC)=1""",[end]).fetchall():wellness.setdefault(date,{})[metric]=value
 metrics=['sleep_hours','sleep_score','resting_hr_bpm','hrv_weekly_average_ms','readiness_score','acute_load']
 windows=[]
 for i in range(2):
  hi=end-dt.timedelta(days=i*28);lo=hi-dt.timedelta(days=27)
  vals={metric:[r[metric] for date,r in wellness.items() if lo<=date<=hi and metric in r] for metric in metrics}
  windows.append(dict(start=str(lo),end=str(hi),metrics={metric:dict(n=len(v),median=st.median(v) if v else None) for metric,v in vals.items()}))
 mechanics={}
 for key,sub in [('road','generic'),('treadmill','treadmill'),('track','track'),('trail','trail'),('other',None)]:
  rows=db.execute("""SELECT CAST(a.start_utc AS DATE),g.cadence_spm,g.step_length_m,g.ground_contact_ms,g.vertical_ratio_pct FROM activities a JOIN garmin_activity_metrics g USING(activity_key) WHERE a.sport='running' AND a.distance_m BETWEEN 8000 AND 16000 AND a.avg_pace_s_km BETWEEN 270 AND 300 AND CAST(a.start_utc AS DATE)<=? AND (CASE WHEN ? IS NULL THEN a.sub_sport NOT IN ('generic','treadmill','track','trail') OR a.sub_sport IS NULL ELSE a.sub_sport=? END)""",[end,sub,sub]).fetchall()
  periods=[]
  for i in range(2):
   hi=end-dt.timedelta(days=i*84);lo=hi-dt.timedelta(days=83)
   cohort=[r for r in rows if lo<=r[0]<=hi]
   vals={metric:[r[j] for r in cohort if r[j] is not None] for j,metric in enumerate(['cadence_spm','step_length_m','ground_contact_ms','vertical_ratio_pct'],1)}
   periods.append(dict(start=str(lo),end=str(hi),runs=len(cohort),metrics={metric:dict(n=len(v),median=st.median(v) if v else None) for metric,v in vals.items()}))
  mechanics[key]=periods
 db.close()
 out=dict(as_of=str(end),total=summary(runs),cohorts=cohorts,long=long,garmin=dict(wellness=windows,mechanics=mechanics),method='Combined Strava and Garmin running history; UTC activity dates. Aggregate moving pace uses only activities with positive distance and moving time; activity and distance totals still include runs without timing. Garmin wellness uses source-local calendar dates through the latest activity and daily medians for adjacent 28-day windows. Garmin mechanics medians use 8–16 km runs at activity-average 4:30–5:00/km within each setting and adjacent 84-day windows. Late-effort pace uses elapsed-time crossings in original full-resolution recordings.',limitations=data['status']['limitations'])
 (ROOT/'reports/training_analysis.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 (ROOT/'dashboard/analysis-data.js').write_text('window.TRAINING_ANALYSIS='+json.dumps(out,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')+';\n')
 print('Analysis ready: '+str(len(runs))+' runs; '+str(len(long))+' long-effort comparisons')
if __name__=='__main__':build()
