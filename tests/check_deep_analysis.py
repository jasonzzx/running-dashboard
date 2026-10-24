"""Verify report totals independently against canonical database rows."""
import hashlib
import json
import math
from pathlib import Path
import duckdb
root=Path(__file__).resolve().parents[1]
a=json.loads((root/'dashboard/analysis-data.js').read_text().split('=',1)[1].rstrip(';\n'))
d=a['deep']
db=duckdb.connect(str(root/'data/running.duckdb'),read_only=True)
assert d['source_sha256']==hashlib.sha256((root/'dashboard/data.js').read_bytes()).hexdigest()
for r in d['blocks']+d['weekly']+d['ytd']+d['marathon']['pre_weeks']:
    n,km,days=db.execute("SELECT count(*),sum(distance_m)/1000,count(distinct CAST(start_utc AS DATE)) FROM activities WHERE sport='running' AND CAST(start_utc AS DATE) BETWEEN ? AND ?",[r['start'],r['end']]).fetchone()
    assert n==r['n'] and days==r['days'] and math.isclose(km or 0,r['km'],abs_tol=1e-8),r
assert math.isclose(sum(r['km'] for r in d['weekly']),sum(r['km'] for r in d['blocks']),abs_tol=1e-8)
for c in a['cohorts'].values():
    for m in c['matched']:
        assert len(m['ids'])==m['n']
        if m['hr_range']: assert m['hr_range'][0]<=m['hr']<=m['hr_range'][1]
    assert c['intervals']['covered']<=c['intervals']['eligible']
segments=d['marathon']['segments']
base=next(r for r in segments if r['start_km']==5 and r['end_km']==30)
pieces=[r for r in segments if r['end_km']-r['start_km']==5 and r['end_km']<=30]
assert math.isclose(sum(r['pace']*5 for r in pieces)/25,base['pace'],abs_tol=1e-8)
late=next(r for r in segments if r['start_km']==33)
original=next(r for r in a['long'] if r['id']==d['marathon']['id'])
assert math.isclose(late['pace'],original['late'],abs_tol=1e-8)
for lang in ['en','zh']:
    report=(root/f'dashboard/reports/analysis-{lang}.html').read_text()
    assert d['source_sha256'][:16] in report and a['as_of'] in report
    assert '<script' not in report
print('PASS: database totals, aligned windows, matched sample counts, split interpolation consistency, both independent report fingerprints')
