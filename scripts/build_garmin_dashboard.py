"""Export Garmin-only metrics without profile IDs or GPS for local dashboard."""
import json,statistics,datetime as dt,os
from pathlib import Path
import duckdb
ROOT=Path(os.environ.get('RUNNING_DATA_ROOT',Path(__file__).resolve().parents[1]))
def build():
 db=duckdb.connect(str(ROOT/'data/running.duckdb'),read_only=True)
 def rows(sql):
  cur=db.execute(sql);return [dict(zip([c[0] for c in cur.description],r)) for r in cur.fetchall()]
 if not db.execute("select count(*) from information_schema.tables where table_name='garmin_activity_metrics'").fetchone()[0]:return
 activities=rows('''SELECT a.source_activity_id AS id,a.name,a.sport,a.sub_sport,substr(a.start_utc,1,10) AS date,a.distance_m,a.avg_pace_s_km AS pace_s,g.* EXCLUDE(activity_key,raw_json,source_path,device_id,sport,sub_sport,distance_m,start_utc) FROM activities a JOIN garmin_activity_metrics g USING(activity_key)''')
 days=rows('''WITH dates AS (SELECT calendar_date FROM garmin_sleep WHERE calendar_date IS NOT NULL UNION SELECT calendar_date FROM garmin_daily WHERE calendar_date IS NOT NULL UNION SELECT calendar_date FROM garmin_daily_metrics WHERE calendar_date IS NOT NULL), metric AS (SELECT calendar_date,avg(value) FILTER(WHERE metric='readiness_score') readiness_score,avg(value) FILTER(WHERE metric='hrv_weekly_average_ms') hrv_weekly_average_ms,avg(value) FILTER(WHERE metric='acute_load') acute_load,avg(value) FILTER(WHERE metric='chronic_load') chronic_load FROM garmin_daily_metrics GROUP BY 1) SELECT dates.calendar_date AS date,s.sleep_seconds,s.score AS sleep_score,d.resting_hr_bpm,d.stress,d.steps,d.duration_ms,m.* EXCLUDE(calendar_date) FROM dates LEFT JOIN garmin_sleep s USING(calendar_date) LEFT JOIN garmin_daily d USING(calendar_date) LEFT JOIN metric m USING(calendar_date) ORDER BY 1''')
 # Per-run phase means for long-run durability. Comparing each run with itself
 # avoids mixing sample-rich recordings with sparse ones in the cohort result.
 durability=rows('''WITH marked AS (
   SELECT a.activity_key,a.source_activity_id AS id,a.name,a.sub_sport,
     substr(a.start_utc,1,10) AS date,a.distance_m AS activity_distance_m,
     s.distance_m,s.cadence_spm,s.step_length_mm/1000 AS step_length_m,
     s.ground_contact_ms,s.vertical_oscillation_mm,s.vertical_ratio_pct,
     s.power_w,s.hr_bpm,
     max(s.distance_m) OVER(PARTITION BY a.activity_key) AS recorded_distance_m
   FROM activities a JOIN samples s USING(activity_key)
   WHERE a.sport='running' AND a.distance_m>=18000 AND s.distance_m IS NOT NULL
 ), phases AS (
   SELECT activity_key,id,name,sub_sport,date,activity_distance_m,recorded_distance_m,
     count(*) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.25 AND recorded_distance_m*.50) AS reference_samples,
     count(*) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.75 AND recorded_distance_m*.98) AS late_samples,
     avg(cadence_spm) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.25 AND recorded_distance_m*.50) AS reference_cadence_spm,
     avg(cadence_spm) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.75 AND recorded_distance_m*.98) AS late_cadence_spm,
     avg(step_length_m) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.25 AND recorded_distance_m*.50) AS reference_step_length_m,
     avg(step_length_m) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.75 AND recorded_distance_m*.98) AS late_step_length_m,
     avg(ground_contact_ms) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.25 AND recorded_distance_m*.50) AS reference_ground_contact_ms,
     avg(ground_contact_ms) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.75 AND recorded_distance_m*.98) AS late_ground_contact_ms,
     avg(vertical_oscillation_mm) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.25 AND recorded_distance_m*.50) AS reference_vertical_oscillation_mm,
     avg(vertical_oscillation_mm) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.75 AND recorded_distance_m*.98) AS late_vertical_oscillation_mm,
     avg(vertical_ratio_pct) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.25 AND recorded_distance_m*.50) AS reference_vertical_ratio_pct,
     avg(vertical_ratio_pct) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.75 AND recorded_distance_m*.98) AS late_vertical_ratio_pct,
     avg(power_w) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.25 AND recorded_distance_m*.50) AS reference_power_w,
     avg(power_w) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.75 AND recorded_distance_m*.98) AS late_power_w,
     avg(hr_bpm) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.25 AND recorded_distance_m*.50) AS reference_hr_bpm,
     avg(hr_bpm) FILTER(WHERE distance_m BETWEEN recorded_distance_m*.75 AND recorded_distance_m*.98) AS late_hr_bpm
   FROM marked GROUP BY ALL
 ) SELECT * FROM phases
   WHERE recorded_distance_m>=16000 AND reference_samples>=30 AND late_samples>=30
   ORDER BY date''')
 # Compare within the same marathon; samples are original full resolution.
 marathon=rows("""SELECT CASE WHEN distance_m>=5000 AND distance_m<30000 THEN '5–30 km' ELSE '33 km to finish' END segment,count(*) samples,avg(hr_bpm) hr_bpm,avg(power_w) power_w,avg(cadence_spm) cadence_spm,avg(ground_contact_ms) ground_contact_ms,avg(vertical_oscillation_mm) vertical_oscillation_mm,avg(step_length_mm)/1000 step_length_m,avg(vertical_ratio_pct) vertical_ratio_pct FROM samples WHERE activity_key='strava:20636797187' AND ((distance_m>=5000 AND distance_m<30000) OR distance_m>=33000) GROUP BY 1 ORDER BY 1""")
 report=json.loads((ROOT/'reports/garmin_import_report.json').read_text())
 out=dict(activities=activities,days=days,durability=durability,marathon_dynamics=marathon,report=report)
 (ROOT/'dashboard/garmin-data.js').write_text('window.GARMIN_DATA='+json.dumps(out,default=str,separators=(',',':')).replace('<','\\u003c')+';\n')
 (ROOT/'reports/garmin_analysis.json').write_text(json.dumps(dict(marathon_dynamics=marathon,latest_wellness=days[-14:],coverage=report['metric_coverage']),default=str,indent=2))
 db.close();print('Garmin dashboard ready:',len(activities),'linked activities;',len(days),'daily records;',len(durability),'long-run durability records')
if __name__=='__main__':build()
