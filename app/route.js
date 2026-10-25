import fs from 'node:fs/promises';
import {sql} from '../lib/db';
export const dynamic='force-dynamic';
export async function GET(){
 let html=await fs.readFile(process.cwd()+'/dashboard/index.html','utf8');
 const [settings]=await sql('SELECT public_snapshot FROM cloud_settings WHERE id=1');
 const id=settings?.public_snapshot;
 html=html.replace('href="admin.html"','href="/admin"');
 if(id){
  const prefix='/api/snapshots/'+id+'/';
  for(const name of ['data.js','analysis-data.js','garmin-data.js','pace-data.js'])html=html.replace('src="'+name+'"','src="'+prefix+name+'"');
  html=html.replace('<script src="i18n.js">','<script>window.cloudSnapshotPrefix='+JSON.stringify(prefix)+';</script><script src="i18n.js">');
 }
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
