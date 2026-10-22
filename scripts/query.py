#!/usr/bin/env python3
"""Query local running data without opening the database for writes."""
import json
import sys
from pathlib import Path
import duckdb

root = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: .venv/bin/python scripts/query.py "SELECT ..."')
with duckdb.connect(str(root / 'data/running.duckdb'), read_only=True) as db:
    result = db.execute(sys.argv[1])
    columns = [c[0] for c in result.description]
    for row in result.fetchall():
        print(json.dumps(dict(zip(columns, row)), default=str))
