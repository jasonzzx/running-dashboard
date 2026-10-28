import {requireOwner} from '../../../lib/auth';
import {sql} from '../../../lib/db';
import {validPlan} from '../../../lib/plan-validation.mjs';
export const dynamic='force-dynamic';
const empty={version:2,days:{},targets:{},links:{},placements:{}};
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request){
 try{
  await requireOwner(request);
  const [settings]=await sql("SELECT metadata->'training_plan' AS plan, COALESCE((metadata->>'training_plan_revision')::integer,0) AS revision, metadata->>'master_job' AS master_job, updated_at FROM cloud_settings WHERE id=1");
  if(!settings)return response({error:'Cloud dataset is not initialized.'},503);
  const activities=await sql("SELECT payload FROM cloud_activities ORDER BY payload->>'start_utc'");
  const [job]=settings.master_job?await sql('SELECT updated_at,status FROM cloud_jobs WHERE id=$1',[settings.master_job]):[];
  return response({plan:settings.plan||empty,revision:settings.revision,activities:activities.map(x=>x.payload),sync:job||null});
 }catch(e){return response({error:e.message==='Unauthorized'?'Sign in as owner to save and sync across devices.':'Unable to load the cloud plan.'},e.message==='Unauthorized'?401:503);}
}
export async function PUT(request){
 try{
  await requireOwner(request);
  const raw=await request.text();if(raw.length>500000)return response({error:'Plan is too large.'},413);
  const body=JSON.parse(raw);
  if(!Number.isInteger(body.revision)||body.revision<0||!validPlan(body.plan))return response({error:'Invalid plan data.'},400);
  const rows=await sql("UPDATE cloud_settings SET metadata=jsonb_set(jsonb_set(metadata,'{training_plan}',$1::jsonb,true),'{training_plan_revision}',to_jsonb($2::integer),true) WHERE id=1 AND COALESCE((metadata->>'training_plan_revision')::integer,0)=$3 RETURNING (metadata->>'training_plan_revision')::integer AS revision",[JSON.stringify(body.plan),body.revision+1,body.revision]);
  return rows.length?response({revision:rows[0].revision}):response({error:'The cloud plan changed on another device. Reload before saving; export your local edits first.'},409);
 }catch(e){return response({error:['Unauthorized','Forbidden origin'].includes(e.message)?'Sign in as owner to save.':'Unable to save the cloud plan.'},['Unauthorized','Forbidden origin'].includes(e.message)?401:500);}
}
