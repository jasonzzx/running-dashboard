import {requireOwner} from '../../../../lib/auth';
import {sql} from '../../../../lib/db';
import {decrypt,encrypt,digest} from '../../../../lib/security';
export async function GET(request){
 try{
  const user=await requireOwner(request),url=new URL(request.url);
  const state=url.searchParams.get('state');
  if(!state||!url.searchParams.get('scope')?.split(',').includes('activity:read_all'))throw new Error('Invalid authorization');
  const [pending]=await sql('DELETE FROM cloud_oauth_states WHERE digest=$1 AND user_id=$2 AND expires_at>now() RETURNING encrypted',[digest(state),user.id]);
  if(!pending)throw new Error('Authorization expired; reconnect');
  if((await sql("SELECT id FROM cloud_jobs WHERE status IN ('queued','running','validating')")).length)throw new Error('Wait for the active sync before reconnecting');
  const config=decrypt(pending.encrypted);
  const response=await fetch('https://www.strava.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...config,code:url.searchParams.get('code'),grant_type:'authorization_code'}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Strava authorization failed');
  const token=await response.json();
  const [settings]=await sql('SELECT metadata FROM cloud_settings WHERE id=1');
  if(String(token.athlete?.id)!==String(settings.metadata.strava_account))throw new Error('Use the original Strava account');
  const value={...config,account_id:String(token.athlete.id),access_token:token.access_token,refresh_token:token.refresh_token,expires_at:token.expires_at};
  await sql('INSERT INTO cloud_connections(provider,encrypted) VALUES ($1,$2) ON CONFLICT(provider) DO UPDATE SET encrypted=excluded.encrypted,updated_at=now()',['strava',encrypt(value)]);
  return Response.redirect(new URL('/admin?connected=strava',process.env.APP_ORIGIN),303);
 }catch(e){return new Response('Connection failed. Return to /admin and reconnect. '+e.message,{status:400,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}
