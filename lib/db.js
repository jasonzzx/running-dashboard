import pg from 'pg';
import {attachDatabasePool} from '@vercel/functions';
let instance;
export function pool(){
 if(!instance){instance=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:15000,idleTimeoutMillis:10000});attachDatabasePool(instance);}
 return instance;
}
export async function sql(text,values=[]){return (await pool().query(text,values)).rows;}
export async function transaction(fn){const c=await pool().connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
