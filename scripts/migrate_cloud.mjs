import fs from 'node:fs/promises';
import pg from 'pg';
import vm from 'node:vm';
import {put} from '@vercel/blob';
process.loadEnvFile('.env.local');
const db=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED});await db.connect();
try{
 const schema=await fs.readFile('cloud/schema.sql','utf8');
 // Test DDL on an empty migration transaction first, then apply it.
 await db.query('BEGIN');await db.query(schema);await db.query('ROLLBACK');await db.query(schema);
 const existing=await db.query('SELECT id FROM cloud_settings WHERE id=1');
 if(existing.rows.length){console.log('Cloud dataset already initialized; no overwrite.');}
 else{
  const backup=await put('migration/baseline-2026-10-24.zip',await fs.readFile('data/cloud/baseline.zip'),{access:'private',addRandomSuffix:false,allowOverwrite:false,token:process.env.BLOB_READ_WRITE_TOKEN,multipart:true});
  const metadata=JSON.parse(await fs.readFile('data/cloud/metadata.json','utf8'));
  const context=vm.createContext({window:{}});vm.runInContext(await fs.readFile('dashboard/data.js','utf8'),context);
  await db.query('BEGIN');
  await db.query('INSERT INTO cloud_settings(id,dataset_url,metadata) VALUES (1,$1,$2)',[backup.url,JSON.stringify(metadata)]);
  const activities=context.window.RUNNING_DATA.activities;
  await db.query("INSERT INTO cloud_activities SELECT item->>'activity_key',item FROM jsonb_array_elements($1::jsonb) AS item ON CONFLICT DO NOTHING",[JSON.stringify(activities)]);
  const {rows:[counts]}=await db.query('SELECT count(*)::integer AS n FROM cloud_activities');
  if(counts.n!==activities.length)throw new Error('Activity migration count mismatch');
  await db.query('COMMIT');console.log('Verified migration:',counts.n,'activity summaries; private master snapshot connected.');
 }
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
