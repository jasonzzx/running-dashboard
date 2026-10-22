#!/usr/bin/env python3
"""Time/distance histograms from original recording intervals, never run averages."""
import json
from pathlib import Path
import duckdb
ROOT = Path(__file__).resolve().parents[1]


def build():
    db = duckdb.connect(str(ROOT / 'data/running.duckdb'), read_only=True)
    db.execute('SET threads=2')
    # A stopped timer at either end, or any stop within the interval, excludes it.
    rows = db.execute("""
    WITH timer AS (
      SELECT activity_key, epoch(CAST(timestamp_utc AS TIMESTAMPTZ)) t, event_type
      FROM events WHERE event='timer'
    ), points AS (
      SELECT s.activity_key, s.sequence, s.distance_m,
        epoch(CAST(s.timestamp_utc AS TIMESTAMPTZ)) t
      FROM samples s JOIN activities a USING(activity_key)
      WHERE a.sport='running' AND coalesce(a.sub_sport,'')!='treadmill'
    ), intervals AS (
      SELECT *, lag(t) OVER w t0, distance_m-lag(distance_m) OVER w dm
      FROM points WINDOW w AS (PARTITION BY activity_key ORDER BY sequence)
    ), checked AS (
      SELECT *, t-t0 AS seconds,
        (SELECT event_type FROM timer e WHERE e.activity_key=i.activity_key AND e.t<=i.t0 ORDER BY e.t DESC LIMIT 1) state,
        EXISTS(SELECT 1 FROM timer e WHERE e.activity_key=i.activity_key AND e.t>i.t0 AND e.t<=i.t AND e.event_type LIKE 'stop%') stopped
      FROM intervals i WHERE t0 IS NOT NULL
    ), classified AS (
      SELECT *, seconds>0 AND seconds<=30 AND dm>0 AND dm/seconds<=10
        AND isfinite(dm) AND isfinite(seconds)
        AND coalesce(state,'start') NOT LIKE 'stop%' AND NOT stopped AS valid
      FROM checked
    )
    SELECT activity_key,
      CASE WHEN valid THEN CASE WHEN 1000*seconds/dm<180 THEN 0
        WHEN 1000*seconds/dm>=480 THEN 11
        ELSE 1+floor((1000*seconds/dm-180)/30)::INTEGER END ELSE -1 END bin,
      sum(CASE WHEN seconds>0 AND isfinite(seconds) THEN seconds ELSE 0 END),
      sum(CASE WHEN dm>0 AND isfinite(dm) THEN dm ELSE 0 END), count(*)
    FROM classified GROUP BY activity_key, bin ORDER BY activity_key, bin
    """).fetchall()
    data = {}
    for key, bin_id, seconds, metres, count in rows:
        data.setdefault(key, []).append([bin_id, seconds, metres, count])
    (ROOT / 'dashboard/pace-data.js').write_text('window.PACE_DISTRIBUTION=' + json.dumps(data, separators=(',', ':')) + ';\n')
    print(f'Pace distributions: {len(data)} non-treadmill running recordings')
    db.close()

if __name__ == '__main__':
    build()
