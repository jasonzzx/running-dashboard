import test from 'node:test';
import assert from 'node:assert/strict';
import {focusedSource,exportDocument} from '../lib/source-exports.mjs';
const source=`# Training history for AI analysis
Activity coverage (UTC): 2016-01-01 to 2026-10-31.
Wellness latest source-local date: 2026-11-01.
## Context and limitations
Treadmill distance, pace and HR excluded. Duration retained.
## Annual running totals by recorded setting
Annual context
## Full activity history (newest first)
| ID | Date | Note |
| --- | --- | --- |
| recent | 2026-10-31 | <script> |
| middle | 2026-09-10 | original |
| old | 2016-01-01 | original |
## Recent wellness (latest 90 recorded dates; gaps are not filled)
| Date | HR |
| --- | --- |
| 2026-11-01 | 45 |
| 2026-09-10 | 47 |
## Snapshot integrity
hash`;
test('weekly export retains metadata, limitations and recent records, including post-run recovery',()=>{
 const text=focusedSource(source,'weekly');assert.match(text,/2026-10-04 to 2026-10-31/);assert.match(text,/recent/);assert.match(text,/2026-11-01/);assert.match(text,/Treadmill distance/);assert.doesNotMatch(text,/middle|old \||Annual context/);
});
test('race export includes 84-day history and annual context, full remains intact',()=>{
 const text=focusedSource(source,'race');assert.match(text,/middle/);assert.match(text,/Annual context/);assert.doesNotMatch(text,/old \|/);assert.equal(focusedSource(source,'full'),source);
});
test('archive is optional, unknown presets rejected and historical-only input labelled',()=>{
 assert.doesNotMatch(exportDocument(source,'Old report',{preset:'weekly'}),/Old report/);
 assert.match(exportDocument(source,'Old report',{preset:'race',archive:true}),/Archived reference.*[\s\S]*Old report/);
 assert.throws(()=>focusedSource(source,'invalid'));
 assert.match(focusedSource('Historical only','weekly'),/Focused export unavailable/);
});
