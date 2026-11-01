import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingSource} from '../lib/training-source.mjs';
import {validAsset} from '../lib/security.js';
const request = new Request('https://example.com/api/training-source');
function dependencies(owner = false) {
  const seen = [];
  return {seen,
    requireOwner: async () => {if (!owner) throw Error('Unauthorized');},
    sql: async query => query.includes('cloud_settings') ? [{public_snapshot:'published-id', metadata:{current_manifest:{'training-source.md':'private-current'}}}] : [{manifest:{'training-source.md':'public-published'}}],
    get: async url => {seen.push(url); return {statusCode:200, stream:new Response('Generated '+url).body};},
    readHistorical: async () => 'Original October report',
  };
}
test('owner gets accepted source, visitor only published; responses cannot be cached', async () => {
  for (const owner of [true, false]) {
    const deps = dependencies(owner), response = await trainingSource(request, deps);
    assert.equal(response.status, 200);
    assert.deepEqual(deps.seen, [owner ? 'private-current' : 'public-published']);
    assert.equal(response.headers.get('X-Training-Source'), owner ? 'accepted' : 'published');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const text = await response.text();
    assert.match(text, /Archived reference/); assert.match(text, /Original October report/);
  }
});
test('legacy snapshots are explicitly historical and do not access private candidates', async () => {
  const deps = dependencies(); deps.sql = async () => [{metadata:{current_manifest:{'training-source.md':'private-current'}}}];
  const response = await trainingSource(request, deps);
  assert.equal(response.headers.get('X-Training-Source'), 'historical');
  assert.match(await response.text(), /automatic refresh pending/); assert.deepEqual(deps.seen, []);
});
test('owner with legacy master can read published source', async () => {
  const deps = dependencies(true); const sql = deps.sql;
  deps.sql = async query => query.includes('cloud_settings') ? [{public_snapshot:'published-id',metadata:{}}] : sql(query);
  assert.equal((await trainingSource(request, deps)).headers.get('X-Training-Source'), 'published');
});
test('storage, authentication and database failures do not silently serve stale history', async () => {
  for (const key of ['get','requireOwner','sql']) {
    const deps = dependencies(true); deps[key] = async () => {throw Error('Service down');};
    const response = await trainingSource(request, deps);
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /Original October/);
  }
});
test('only exact Markdown artifact is allowed', () => {
  assert(validAsset('training-source.md'));
  for (const name of ['../training-source.md','reports/private.md','training-source.md/secret']) assert(!validAsset(name));
});

test('focused preset requests preserve public visibility and reject unknown presets', async () => {
 const deps=dependencies();const response=await trainingSource(new Request(request.url+'?preset=weekly&archive=0'),deps);
 assert.equal(response.headers.get('X-Training-Source'),'published');
 assert.deepEqual(deps.seen,['public-published']);
 assert.doesNotMatch(await response.text(),/Original October report/);
 const invalid=await trainingSource(new Request(request.url+'?preset=invalid'),dependencies());assert.equal(invalid.status,400);
});
