import {requireOwner} from '../../../lib/auth';
import {sql} from '../../../lib/db';
export const dynamic='force-dynamic';
export async function GET(request){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
 try{
  try{await requireOwner(request);}catch(e){if(e.message==='Unauthorized')return Response.json({owner:false},{headers});throw e;}
  const [s]=await sql("SELECT public_snapshot, metadata->>'master_job' AS master_job, updated_at FROM cloud_settings WHERE id=1");
  return Response.json({owner:true,syncedAt:s?.updated_at,unpublished:Boolean(s?.master_job&&s.master_job!==s.public_snapshot)},{headers});
 }catch{return Response.json({error:'Status unavailable'},{status:503,headers});}
}
