import {randomUUID} from 'node:crypto';
import {send} from '@vercel/queue';
import {sql} from './db';

// The database's partial unique index serializes manual and scheduled starts.
export async function startSync(){
 const [settings]=await sql('SELECT id FROM cloud_settings WHERE id=1');
 if(!settings)throw new Error('Dataset migration is not ready / 数据迁移尚未完成');
 if(!(await sql("SELECT provider FROM cloud_connections WHERE provider='garmin'")).length)throw new Error('Connect an account first / 请先连接账户');
 const id=randomUUID();
 try{await sql("INSERT INTO cloud_jobs(id,status) VALUES ($1,'queued')",[id]);}
 catch(e){
  if(e.code!=='23505')throw e;
  const [active]=await sql("SELECT id,status FROM cloud_jobs WHERE status IN ('queued','running','validating') LIMIT 1");
  if(active)return {...active,resumed:true};
  throw e;
 }
 try{await send('running-sync',{id},{idempotencyKey:id,region:'iad1'});}
 catch(e){await sql("UPDATE cloud_jobs SET status='failed',error='Could not enqueue; retry sync',updated_at=now() WHERE id=$1 AND status='queued'",[id]);throw new Error('Could not start sync; retry / 无法启动同步，请重试');}
 return {id};
}
