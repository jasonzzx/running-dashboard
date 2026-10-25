import {auth} from '../../../../lib/auth';
import {OWNER} from '../../../../lib/security';
async function handle(request,context){
 if(request.method==='POST'){
  const body=await request.clone().json().catch(()=>({}));
  if(body.email&&body.email.toLowerCase()!==OWNER)return Response.json({error:'Only the dashboard owner can sign in.'},{status:403});
 }
 return auth().handler()[request.method](request,context);
}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE,handle as PATCH};
