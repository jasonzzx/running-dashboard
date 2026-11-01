import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('source reloads, ignores superseded responses, and copies/downloads visible content', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {textContent:'',children:[],append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}, handlers:{}, addEventListener(event, handler) {this.handlers[event]=handler;}});
    return nodes.get(id);
  };
  const pending = [];
  let copied, downloaded;
  class BrowserURL extends URL {
    static createObjectURL(blob) {downloaded=blob; return 'blob:test';}
    static revokeObjectURL() {}
  }
  const context = {
    document:{getElementById:node, querySelectorAll:() => [], createElement:() => ({textContent:'',append(){},click(){}})},
    window:{addEventListener(){},scrollTo(){}},
    location:{href:'https://example.com/?tab=source',protocol:'https:'},
    URL:BrowserURL, Blob, setTimeout:fn => fn(),
    navigator:{clipboard:{writeText:async text => {copied=text;}}},
    fetch:() => new Promise(resolve => pending.push(resolve)),
  };
  vm.runInNewContext(fs.readFileSync('dashboard/workspace.js','utf8'),context);
  const refresh = node('refresh-source').handlers.click();
  pending[1](new Response('New snapshot',{headers:{'X-Training-Source':'accepted'}}));
  await refresh;
  pending[0](new Response('Old snapshot'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('source-content').textContent,'New snapshot');
  assert.match(node('source-status').textContent,/owner view/);
  await node('copy-source').handlers.click();
  node('download-source').handlers.click({preventDefault(){}});
  assert.equal(copied,'New snapshot'); assert.equal(await downloaded.text(),'New snapshot');
  const failed = node('refresh-source').handlers.click();
  pending[2](new Response('Unavailable',{status:503})); await failed;
  assert.match(node('source-status').textContent,/unavailable/i);
  copied=null; await node('copy-source').handlers.click(); assert.equal(copied,null);
});
