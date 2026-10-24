// Verify the generated snapshot before Vercel publishes it. No database needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dashboard/', import.meta.url));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, asset] of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) {
  assert(fs.existsSync(path.join(root, asset)), `Missing page asset: ${asset}`);
}
const context = vm.createContext({ window: {} });
for (const name of ['data.js', 'analysis-data.js', 'garmin-data.js', 'pace-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
}
const activities = context.window.RUNNING_DATA.activities;
const analysis = context.window.TRAINING_ANALYSIS;
const sourceHash = createHash('sha256').update(fs.readFileSync(path.join(root,'data.js'))).digest('hex');
assert.equal(analysis.deep?.version, 2, 'Deep analysis must be rebuilt');
assert.equal(analysis.deep.source_sha256, sourceHash, 'Analysis and dashboard data are out of sync');
for (const lang of ['en','zh']) {
  const report = fs.readFileSync(path.join(root,'reports',`analysis-${lang}.html`),'utf8');
  assert(report.includes(sourceHash.slice(0,16)), `Stale ${lang} report`);
  assert(report.includes(analysis.deep.rebuilt_utc), `Report ${lang} is from an older analysis build`);
}
assert(html.indexOf('src="pace.js"') < html.indexOf('src="app.js"'), 'Load the pace renderer before the app');
assert(activities.length > 0, 'Dashboard has no activities');
assert.equal(new Set(activities.map(a => a.id)).size, activities.length, 'Duplicate activity IDs');
let details = 0;
context.window.receiveDetail = (id, detail) => {
  assert.equal(id, activities[details].id, 'Recording ID does not match its activity');
  assert(Array.isArray(detail.points), `Missing points array: ${id}`);
  assert(Array.isArray(detail.laps), `Missing laps array: ${id}`);
  details++;
};
for (const activity of activities) {
  assert(/^[a-zA-Z0-9_-]+$/.test(activity.id), 'Unsafe recording filename');
  const file = path.join(root, 'details', `${activity.id}.js`);
  const previous = details;
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  assert.equal(details, previous + 1, `Recording did not load: ${activity.id}`);
}
console.log(`PASS: page assets, four data bundles, ${activities.length} activities and ${details} recording details`);
