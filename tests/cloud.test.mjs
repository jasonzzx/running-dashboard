import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {owner,encrypt,decrypt,validAsset,sameOrigin} from '../lib/security.js';
test('only the verified owner is authorized',()=>{
 assert(owner({email:'jasonzzx@gmail.com',emailVerified:true}));
 assert(!owner({email:'jasonzzx@gmail.com',emailVerified:false}));
 assert(!owner({email:'someone@example.com',emailVerified:true}));
 assert(!owner(null));
});
test('provider encryption interoperates with Python and rejects tampering',()=>{
 process.env.CLOUD_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 const original={access_token:'test-token',expires_at:123},sealed=encrypt(original);
 assert.deepEqual(decrypt(sealed),original);
 const tampered=Buffer.from(sealed,'base64');tampered[15]^=1;assert.throws(()=>decrypt(tampered.toString('base64')));
 const python=spawnSync('.venv-cloud/bin/python',['-c','import sys;sys.path.insert(0,"cloud");from worker import decrypt;import json;print(json.dumps(decrypt(sys.stdin.read())))'],{input:sealed,encoding:'utf8',env:process.env});
 assert.equal(python.status,0,python.stderr);assert.deepEqual(JSON.parse(python.stdout),original);
});
test('only published dashboard artifact names are eligible for public serving',()=>{
 for(const name of ['data.js','details/garmin-123.js','reports/analysis-zh.html'])assert(validAsset(name));
 for(const name of ['../credentials.json','data/running.duckdb','details/../../.env','reports/import_status.json'])assert(!validAsset(name));
});
test('admin mutations reject cross-origin requests',()=>{
 assert(sameOrigin(new Request('https://example.com/api/admin',{method:'POST',headers:{origin:'https://example.com'}})));
 assert(!sameOrigin(new Request('https://example.com/api/admin',{method:'POST',headers:{origin:'https://attacker.test'}})));
});
