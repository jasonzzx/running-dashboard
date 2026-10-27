import fs from 'node:fs/promises';
export const dynamic = 'force-dynamic';
export async function GET() {
  const source = await fs.readFile(process.cwd() + '/reports/training_history_for_ai.md', 'utf8');
  return new Response(source, {headers: {'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store'}});
}
