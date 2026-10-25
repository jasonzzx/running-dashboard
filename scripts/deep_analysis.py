"""Additional descriptive evidence; no fitness/causal estimates from wearables."""
import bisect
import datetime as dt
import hashlib
import json
import os
import statistics as st
from pathlib import Path

ROOT = Path(os.environ.get('RUNNING_DATA_ROOT',Path(__file__).resolve().parents[1]))

def enrich(db, runs, end, summary, cohorts):
    def between(rows, lo, hi):
        return [r for r in rows if str(lo) <= r['date'] <= str(hi)]

    def block(rows, lo, hi):
        a = between(rows, lo, hi)
        out = dict(start=str(lo), end=str(hi), **summary(a, (hi-lo).days+1))
        days = {}
        for r in a:
            days.setdefault(r['date'], []).append(r)
        out.update(no_run_days=(hi-lo).days+1-len(days), double_days=sum(len(v)>1 for v in days.values()),
                   longest_km=max((r['distance_m']/1000 for r in a),default=0),
                   long25_km=sum(r['distance_m']/1000 for r in a if r['distance_m']>=25000))
        return out

    weekly = [block(runs, end-dt.timedelta(days=7*i+6), end-dt.timedelta(days=7*i)) for i in range(12)]
    blocks = [block(runs, end-dt.timedelta(days=28*i+27), end-dt.timedelta(days=28*i)) for i in range(3)]
    ytd=[]
    for year in range(end.year-3,end.year+1):
        hi=end.replace(year=year, day=min(end.day,28) if end.month==2 else end.day)
        row=block(runs,dt.date(year,1,1),hi)
        row['year']=year
        for key,sub in [('road','generic'),('treadmill','treadmill')]:
            row[key+'_km']=sum(r['distance_m']/1000 for r in between(runs,dt.date(year,1,1),hi) if r['sub_sport']==sub)
        ytd.append(row)
    pace_data=json.loads((ROOT/'dashboard/pace-data.js').read_text().split('=',1)[1].rstrip(';\n'))
    for key,cohort in cohorts.items():
        sub={'road':'generic','treadmill':'treadmill','track':'track','trail':'trail'}.get(key)
        rows=[r for r in runs if (r['sub_sport']==sub if sub else r['sub_sport'] not in ['generic','treadmill','track','trail'])]
        recent=between(rows,end-dt.timedelta(days=83),end)
        cohort['structure']=block(rows,end-dt.timedelta(days=83),end)
        bins=[dict(seconds=0,metres=0) for _ in range(12)]
        covered=0; excluded=0
        for r in recent:
            if r['sub_sport']=='treadmill': continue
            valid=False
            for i,seconds,metres,*_ in pace_data.get(r['activity_key'],[]):
                if i<0: excluded+=seconds;continue
                bins[i]['seconds']+=seconds;bins[i]['metres']+=metres;valid=True
            covered+=int(valid)
        cohort['intervals']=dict(bins=bins,covered=covered,eligible=sum(r['sub_sport']!='treadmill' for r in recent),excluded_seconds=excluded)
        # Report distribution and sample size, not only a potentially unstable median.
        for matched in cohort['matched']:
            hr=sorted(r['avg_hr_bpm'] for r in rows if r['id'] in matched['ids'])
            matched['hr_range']=[min(hr),max(hr)] if hr else None
            matched['hr_iqr']=list(st.quantiles(hr,n=4,method='inclusive')[::2]) if len(hr)>=2 else None

    race=next((r for r in runs if 'marathon' in r['name'].lower() and 40000<=r['distance_m']<=44000 and r['sub_sport']=='generic'),None)
    marathon=None
    if race:
        result=db.execute('SELECT distance_m,epoch(CAST(timestamp_utc AS TIMESTAMPTZ)),hr_bpm,cadence_spm,step_length_mm/1000,ground_contact_ms,power_w FROM samples WHERE activity_key=? ORDER BY sequence',[race['activity_key']]).fetchall()
        points=[r for r in result if r[0] is not None and r[1] is not None]
        monotonic=all(a[0]<=b[0] and a[1]<=b[1] for a,b in zip(points,points[1:]))
        if points and monotonic and points[0][0]<=5000 and points[-1][0]>=35000:
            distances=[p[0] for p in points]
            def crossing(m):
                i=bisect.bisect_left(distances,m)
                if i==0:return points[0][1]
                if i>=len(points):return None
                a,b=points[i-1],points[i]
                return a[1]+(b[1]-a[1])*(m-a[0])/(b[0]-a[0]) if b[0]>a[0] else b[1]
            finish=points[-1][0]/1000
            segments=[]
            # Do not call the warm-up/first 5 km a steady-state comparison.
            for lo,hi in [(5,10),(10,15),(15,20),(20,25),(25,30),(30,33),(33,finish),(5,30),(10,30)]:
                pp=[p for p in points if lo*1000<=p[0]<(hi*1000)]
                metrics={name:dict(n=len(v),mean=st.mean(v) if v else None) for j,name in enumerate(['hr','cadence','stride','contact','power'],2) for v in [[p[j] for p in pp if p[j] is not None and p[j]>0]]}
                segments.append(dict(start_km=lo,end_km=hi,pace=(crossing(hi*1000)-crossing(lo*1000))/(hi-lo),samples=len(pp),metrics=metrics))
            race_day=dt.date.fromisoformat(race['date'])
            pre=[block(runs,race_day-dt.timedelta(days=i*7),race_day-dt.timedelta(days=(i-1)*7+1)) for i in range(1,9)]
            marathon=dict(id=race['id'],date=race['date'],name=race['name'],km=race['distance_m']/1000,elapsed_s=race['elapsed_s'],segments=segments,pre_weeks=pre,
                          source_samples=len(points),max_gap_seconds=max(b[1]-a[1] for a,b in zip(points,points[1:])))
    latest_wellness=str(db.execute('SELECT max(calendar_date) FROM garmin_daily').fetchone()[0])
    return dict(version=2,rebuilt_utc=dt.datetime.now(dt.timezone.utc).isoformat(),source_sha256=hashlib.sha256((ROOT/'dashboard/data.js').read_bytes()).hexdigest(),
                first_run=min(r['date'] for r in runs),latest_run=str(end),latest_wellness=latest_wellness,
                weekly=weekly,blocks=blocks,ytd=ytd,marathon=marathon,
                timing_missing=sum(not(r['moving_s'] and r['moving_s']>0 and r['distance_m'] and r['distance_m']>0) for r in runs))
