import {timingSafeEqual} from 'node:crypto';
import {startSync} from '../../../../lib/start-sync';
export const dynamic='force-dynamic';
export async function GET(request){
 const secret=process.env.CRON_SECRET;
 const supplied=request.headers.get('authorization')||'';
 const expected=secret?`Bearer ${secret}`:'';
 if(!expected || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return new Response('Unauthorized',{status:401});
 try{return Response.json(await startSync(),{headers:{'Cache-Control':'no-store'}});}
 catch(error){console.error('Scheduled sync could not start:',error.message);return Response.json({error:'Scheduled sync could not start.'},{status:503});}
}
