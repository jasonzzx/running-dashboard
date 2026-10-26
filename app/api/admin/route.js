import {randomUUID} from 'node:crypto';
import {send} from '@vercel/queue';
import {requireOwner} from '../../../lib/auth';
import {sql,transaction} from '../../../lib/db';
import {encrypt} from '../../../lib/security';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request){
 try{
  await requireOwner(request);
  const connections=await sql("SELECT provider,updated_at FROM cloud_connections WHERE provider='garmin'");
  const jobs=await sql('SELECT id,status,created_at,updated_at,result->\'summary\' AS summary,error FROM cloud_jobs ORDER BY created_at DESC LIMIT 12');
  const [state]=await sql('SELECT metadata,public_snapshot FROM cloud_settings WHERE id=1');
  const [{count}]=await sql('SELECT count(*) FROM cloud_activities');
  return Response.json({connections,jobs,activities:Number(count),initialized:Boolean(state),publicSnapshot:state?.public_snapshot},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e.message==='Unauthorized'?'Unauthorized':'Admin service unavailable'},{status:e.message==='Unauthorized'?401:503});}
}
export async function POST(request){
 try{
  const user=await requireOwner(request),text=await request.text();
  if(text.length>16384)throw new Error('Request too large');
  const body=JSON.parse(text);
  const active=await sql("SELECT id FROM cloud_jobs WHERE status IN ('queued','running','validating')");
  if(active.length)throw new Error('A sync is already running / 同步正在进行');
  const [settings]=await sql('SELECT * FROM cloud_settings WHERE id=1');
  if(!settings)throw new Error('Dataset migration is not ready / 数据迁移尚未完成');
  if(body.action==='garmin'){
   if(typeof body.key!=='string'||body.key.length<10)throw new Error('Enter a Garmin Personal API key');
   const base='https://personal.connectapi.garmin.com';
   const token=await fetch(base+'/personalapitoken-service/personal-api/personal-api-key/token',{method:'POST',headers:{Authorization:'ApiKey '+body.key.trim()},redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!token.ok)throw new Error('Garmin rejected the API key / Garmin 密钥验证失败');
   const jwt=await token.text();
   const r=await fetch(base+'/activity-service/activity/'+settings.metadata.garmin_anchor,{headers:{Authorization:'Bearer '+jwt.trim()},redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!r.ok)throw new Error('Cannot verify Garmin account / 无法验证 Garmin 账户');
   const activity=await r.json();
   if(String(activity.userProfileId)!==String(settings.metadata.garmin_account))throw new Error('Use the original Garmin account / 请使用原 Garmin 账户');
   await sql('INSERT INTO cloud_connections(provider,encrypted) VALUES ($1,$2) ON CONFLICT(provider) DO UPDATE SET encrypted=excluded.encrypted,updated_at=now()',['garmin',encrypt({api_key:body.key.trim(),account_id:String(activity.userProfileId)})]);
   return Response.json({ok:true});
  }
  if(body.action==='sync'){
   if(!(await sql("SELECT provider FROM cloud_connections WHERE provider='garmin'")).length)throw new Error('Connect an account first / 请先连接账户');
   const id=randomUUID();
   await sql("INSERT INTO cloud_jobs(id,status) VALUES ($1,'queued')",[id]);
   try{await send('running-sync',{id},{idempotencyKey:id,region:'iad1'});}catch(e){await sql("UPDATE cloud_jobs SET status='failed',error='Could not enqueue; retry sync',updated_at=now() WHERE id=$1 AND status='queued'",[id]);throw new Error('Could not start sync; retry / 无法启动同步，请重试');}
   return Response.json({id});
  }
  if(body.action==='publish'){
   if(!/^[0-9a-f-]{36}$/.test(body.id||''))throw new Error('Invalid sync');
   await transaction(async c=>{
    const {rows:[job]}=await c.query("SELECT id,result FROM cloud_jobs WHERE id=$1 AND status='ready' FOR UPDATE",[body.id]);
    const {rows:[current]}=await c.query('SELECT metadata FROM cloud_settings WHERE id=1 FOR UPDATE');
    if(!job||current.metadata.master_job!==body.id)throw new Error('Publish the latest validated sync / 请发布最新已验证的数据');
    await c.query('UPDATE cloud_snapshots SET published_at=now() WHERE id=$1',[body.id]);
    await c.query('UPDATE cloud_settings SET public_snapshot=$1,updated_at=now() WHERE id=1',[body.id]);
    await c.query("UPDATE cloud_jobs SET status='published',updated_at=now() WHERE id=$1",[body.id]);
   });
   return Response.json({ok:true});
  }
  throw new Error('Unknown action');
 }catch(e){const denied=['Unauthorized','Forbidden origin'].includes(e.message);return Response.json({error:denied?'Unauthorized':e.message},{status:denied?403:400});}
}
