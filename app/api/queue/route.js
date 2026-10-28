import {QueueClient} from '@vercel/queue';
import {get,put} from '@vercel/blob';
import {unzipSync} from 'fflate';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {sql,transaction} from '../../../lib/db';
import {workerSignature,validAsset} from '../../../lib/security';
export const maxDuration=300;
const queue=new QueueClient({region:'iad1'}),exec=promisify(execFile);
export const POST=queue.handleCallback(async({id},metadata)=>{
 try{
 if(!/^[0-9a-f-]{36}$/.test(id))throw new Error('Invalid job');
 const [job]=await sql('SELECT status,result FROM cloud_jobs WHERE id=$1',[id]);
 if(!job||['ready','published'].includes(job.status))return;
 if(job.status!=='validating'){
  const body=JSON.stringify({id}),stamp=String(Math.floor(Date.now()/1000));
  const r=await fetch(process.env.APP_ORIGIN+'/api/worker',{method:'POST',headers:{'Content-Type':'application/json','X-Worker-Time':stamp,'X-Worker-Signature':workerSignature(body,stamp)},body,signal:AbortSignal.timeout(280000)});
  if(!r.ok){
   const failure=await r.json().catch(()=>({}));
   const stages={startup:'startup',database:'database access',snapshot_download:'snapshot download',garmin_auth:'Garmin authentication',activity_sync:'activity sync',parquet_export:'Parquet export',dashboard_build:'dashboard build',artifact_upload:'artifact upload'};
   const stage=stages[failure.stage]||'worker execution';
   const provider=/^provider_(\d{3})$/.exec(failure.code||'');
   const error=new Error('Cloud worker failed');
   error.publicMessage=provider?`Garmin HTTP ${provider[1]} during ${stage}. Reconnect for 401/403; otherwise retry.`:`Sync failed during ${stage}. The accepted snapshot is unchanged.`;
   throw error;
  }
  await queue.send('running-sync',{id},{idempotencyKey:id+'-validate'});
  return;
 }
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'running-validate-'));
 try{
  const download=await get(job.result.dashboard_url,{access:'private',token:process.env.BLOB_READ_WRITE_TOKEN});
  if(!download||download.statusCode!==200)throw new Error('Missing candidate dashboard');
  const files=unzipSync(new Uint8Array(await new Response(download.stream).arrayBuffer()));
  for(const [name,bytes] of Object.entries(files)){
   const dest=path.resolve(root,name);
   if(!dest.startsWith(root+'/')||!name.startsWith('dashboard/'))throw new Error('Invalid archive path');
   await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);
  }
  // Always validate against the current renderer and page assets.
  for(const name of await fs.readdir(process.cwd()+'/dashboard'))if(/\.(js|css|html)$/.test(name)&&!['data.js','analysis-data.js','pace-data.js','garmin-data.js'].includes(name))await fs.copyFile(process.cwd()+'/dashboard/'+name,root+'/dashboard/'+name);
  const env={...process.env,RUNNING_DATA_ROOT:root};
  await exec(process.execPath,[process.cwd()+'/scripts/build_analysis_reports.mjs'],{env,timeout:45000});
  await exec(process.execPath,[process.cwd()+'/tests/check_deployment.mjs'],{env,timeout:45000});
  const generated=Object.keys(job.result.summary.publish_files).map(p=>p.replace(/^dashboard\//,''));
  generated.push('reports/analysis-en.html','reports/analysis-zh.html');
  const [settings]=await sql('SELECT metadata FROM cloud_settings WHERE id=1');
  const manifest={...(settings.metadata.current_manifest||{})};
  for(const name of generated){
   if(!validAsset(name))throw new Error('Invalid generated asset');
   let data=await fs.readFile(root+'/dashboard/'+name);
   if(name.endsWith('.html'))data=Buffer.from(data.toString().replaceAll('href="../style.css"','href="/style.css"').replaceAll('href="../#analysis"','href="/#analysis"'));
   const blob=await put('snapshots/'+id+'/'+name,data,{access:'private',token:process.env.BLOB_READ_WRITE_TOKEN,addRandomSuffix:false,allowOverwrite:true});manifest[name]=blob.url;
  }
  const context=vm.createContext({window:{}});vm.runInContext(await fs.readFile(root+'/dashboard/data.js','utf8'),context);
  const activities=context.window.RUNNING_DATA.activities;
  await transaction(async c=>{
   const {rows:[current]}=await c.query('SELECT status FROM cloud_jobs WHERE id=$1 FOR UPDATE',[id]);
   if(['ready','published'].includes(current.status))return;
   await c.query("INSERT INTO cloud_activities SELECT item->>'activity_key',item FROM jsonb_array_elements($1::jsonb) AS item ON CONFLICT(activity_key) DO UPDATE SET payload=excluded.payload",[JSON.stringify(activities)]);
   await c.query('INSERT INTO cloud_snapshots(id,manifest) VALUES ($1,$2) ON CONFLICT(id) DO NOTHING',[id,JSON.stringify(manifest)]);
   await c.query("UPDATE cloud_settings SET dataset_url=$1,metadata=metadata||$2::jsonb,updated_at=now() WHERE id=1",[job.result.dataset_url,JSON.stringify({master_job:id,current_manifest:manifest,dataset_sha256:job.result.dataset_sha256})]);
   const result={...job.result,summary:{...job.result.summary,validated:true}};
   await c.query("UPDATE cloud_jobs SET status='ready',result=$2,error=NULL,updated_at=now() WHERE id=$1",[id,JSON.stringify(result)]);
  });
 }finally{await fs.rm(root,{recursive:true,force:true});}
 }catch(error){
  await sql("UPDATE cloud_jobs SET error=$2,status=CASE WHEN $3>=3 THEN 'failed' ELSE status END,updated_at=now() WHERE id=$1 AND status NOT IN ('ready','published')",[id,error.publicMessage||'Cloud sync or validation failed; published data is unchanged. Retry is safe.',metadata.deliveryCount]);
  throw error;
 }
},{retry:async(error,metadata)=>{
 // Retry safely; the master pointer only changes after validation succeeds.
 if(metadata.deliveryCount>=3){
  return {acknowledge:true};
 }
 return {afterSeconds:60};
}});
