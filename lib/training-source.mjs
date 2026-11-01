import {exportDocument,presets} from './source-exports.mjs';
// Dependencies are supplied by the route so access and fallback behavior can be tested.
export async function trainingSource(request, {requireOwner, sql, get, readHistorical}) {
  const headers = {'Content-Type':'text/markdown; charset=utf-8', 'Cache-Control':'private, no-store', 'Vary':'Cookie', 'X-Content-Type-Options':'nosniff'};
  const params=new URL(request.url).searchParams;
  const preset=params.get('preset')||'full';
  if(!presets.includes(preset))return new Response('Unknown export preset',{status:400,headers});
  const archive=params.has('archive')?params.get('archive')==='1':!params.has('preset');
  try {
    const historical = await readHistorical();
    if (new URL(request.url).searchParams.get('historical') === '1') {
      return new Response(historical, {headers:{...headers, 'X-Training-Source':'historical'}});
    }
    let owner = false;
    try { await requireOwner(request); owner = true; }
    catch (error) { if (error.message !== 'Unauthorized') throw error; }
    const [settings] = await sql('SELECT public_snapshot, metadata FROM cloud_settings WHERE id=1');
    let url = owner ? settings?.metadata?.current_manifest?.['training-source.md'] : null;
    let scope = 'accepted';
    if (!url && settings?.public_snapshot) {
      const [snapshot] = await sql('SELECT manifest FROM cloud_snapshots WHERE id=$1 AND published_at IS NOT NULL', [settings.public_snapshot]);
      url = snapshot?.manifest?.['training-source.md'];
      scope = 'published';
    }
    if (!url && preset!=='full')return new Response('# Focused export unavailable\n\nNo generated source is available yet. Select Full history to read the archived October report, or sync and publish a generated snapshot.\n',{headers:{...headers,'X-Training-Source':'historical'}});
    if (!url) return new Response('# Historical snapshot — automatic refresh pending\n\nNo generated source is available for this view yet. The owner needs a successful sync; public visitors also need that snapshot published.\n\n' + historical, {headers:{...headers, 'X-Training-Source':'historical'}});
    const file = await get(url, {access:'private'});
    if (!file || file.statusCode !== 200) throw new Error('Source unavailable');
    const current = await new Response(file.stream).text();
    return new Response(exportDocument(current,historical,{preset,archive}), {headers:{...headers, 'X-Training-Source':scope, 'X-Source-Preset':preset}});
  } catch {
    return new Response('Unable to load the training source. Please retry.', {status:503, headers});
  }
}
