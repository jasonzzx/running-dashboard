import fs from 'node:fs/promises';
import {get} from '@vercel/blob';
import {requireOwner} from '../../../lib/auth';
import {sql} from '../../../lib/db';
import {trainingSource} from '../../../lib/training-source.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  return trainingSource(request, {
    requireOwner, sql,
    get: (url, options) => get(url, {...options, token:process.env.BLOB_READ_WRITE_TOKEN}),
    readHistorical: () => fs.readFile(process.cwd() + '/reports/training_history_for_ai.md', 'utf8'),
  });
}
