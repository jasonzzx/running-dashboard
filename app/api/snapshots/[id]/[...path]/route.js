import {get} from '@vercel/blob';
import {sql} from '../../../../../lib/db';
import {validAsset} from '../../../../../lib/security';
export async function GET(request,{params}){
 const {id,path}=await params,key=path.join('/');
 if(!/^[0-9a-f-]{36}$/.test(id)||!validAsset(key))return new Response('Not found',{status:404});
 const [snapshot]=await sql('SELECT manifest FROM cloud_snapshots WHERE id=$1 AND published_at IS NOT NULL',[id]);
 if(!snapshot)return new Response('Not found',{status:404});
 const url=snapshot.manifest[key];
 if(!url)return Response.redirect(new URL('/'+key,request.url),307);
 const file=await get(url,{access:'private',token:process.env.BLOB_READ_WRITE_TOKEN});
 if(!file||file.statusCode!==200)return new Response('Unavailable',{status:503});
 return new Response(file.stream,{headers:{'Content-Type':key.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}
