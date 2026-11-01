(() => {
  const names = ['data', 'source', 'plan', 'pace-tool'];
  const links = [...document.querySelectorAll('.app-tabs [data-tab]')];
  const views = Object.fromEntries(names.map(name => [name, document.getElementById(name + '-view')]));
  const source = document.getElementById('source-content');
  const preset=document.getElementById('source-preset');
  const archive=document.getElementById('source-archive');
  let sourceLoaded = false;
  let sourceRequest = 0;
  async function loadSource() {
    const request = ++sourceRequest;
    sourceLoaded = false;
    source.textContent = 'Loading training history…';
    document.getElementById('source-preview')?.replaceChildren();
    const size=document.getElementById('source-size');if(size)size.textContent='';
    const status = document.getElementById('source-status');
    status.textContent = 'Checking snapshot…';
    try {
      const local = location.protocol === 'file:';
      let response = await fetch(local ? 'training-source.md' : '/api/training-source?preset='+encodeURIComponent(preset?.value||'weekly')+'&archive='+(archive?.checked?'1':'0'), {cache:'no-store'});
      if (local && !response.ok) response = await fetch('../reports/training_history_for_ai.md');
      if (!response.ok) throw Error();
      let text = await response.text();
      if(local){
        const {exportDocument}=await import('./source-exports.mjs');
        let historical='';if(archive?.checked){const r=await fetch('../reports/training_history_for_ai.md');if(!r.ok)throw Error();historical=await r.text();}
        text=exportDocument(text,historical,{preset:preset?.value||'weekly',archive:archive?.checked||false});
      }
      if (request !== sourceRequest) return;
      source.textContent = text;
      sourceLoaded = true;
      renderPreview(text);
      const size=document.getElementById('source-size');if(size)size.textContent=(new Blob([text]).size/1024).toFixed(1)+' KB · '+text.length.toLocaleString()+' characters';
      const scope = response.headers.get('X-Training-Source');
      status.textContent = scope === 'accepted' ? 'Latest validated sync · owner view' : scope === 'published' ? 'Published snapshot · newer syncs appear after publication' : scope === 'historical' ? 'Historical October 2026 snapshot · automatic refresh pending' : 'Local snapshot · see generation and coverage dates below';
    } catch {
      if (request !== sourceRequest) return;
      source.textContent = 'Unable to load the source. Retry, or open dashboard/training-source.md directly for a local build.';
      status.textContent = 'Snapshot unavailable';
    }
  }
  function renderPreview(text){
    const preview=document.getElementById('source-preview');if(!preview)return;
    preview.replaceChildren();
    let table=null,shown=0;
    for(const line of text.split('\n')){
      if(!line.trim())continue;
      if(line.startsWith('|')){
        if(/^\|[ \-:|]+$/.test(line))continue;
        if(!table){table=document.createElement('table');const wrap=document.createElement('div');wrap.className='table-wrap';wrap.append(table);preview.append(wrap);shown=0;}
        if(shown++>=8)continue;
        const row=document.createElement('tr');for(const value of line.slice(1,-1).split(/(?<!\\)\|/)){const cell=document.createElement(shown===1?'th':'td');cell.textContent=value.trim();row.append(cell);}table.append(row);continue;
      }
      if(table&&shown>8){const p=document.createElement('p');p.textContent='Preview shows the first 7 records per table. Copy and download include every selected record.';preview.append(p);}table=null;
      const heading=/^(#{1,3}) (.*)/.exec(line);const el=document.createElement(heading?'h'+Math.min(3,heading[1].length+1):'p');el.textContent=heading?heading[2]:line;preview.append(el);
    }
  }
  preset?.addEventListener('change',loadSource);archive?.addEventListener('change',loadSource);
  function show(name, updateUrl = false) {
    if (!names.includes(name)) name = 'data';
    for (const key of names) views[key].hidden = key !== name;
    for (const link of links) {
      if (link.dataset.tab === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (updateUrl) { const url = new URL(location.href); url.searchParams.set('tab', name); url.hash = ''; history.pushState({tab:name}, '', url); }
    if (name === 'source') loadSource();
  }
  document.getElementById('refresh-source').addEventListener('click', loadSource);
  document.getElementById('download-source').addEventListener('click', e => {
    e.preventDefault();
    if (!sourceLoaded) return;
    const url = URL.createObjectURL(new Blob([source.textContent], {type:'text/markdown;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'training_history_for_ai.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  links.forEach(link => link.addEventListener('click', e => {e.preventDefault(); show(link.dataset.tab, true); window.scrollTo(0, 0);}));
  window.addEventListener('popstate', () => show(new URL(location.href).searchParams.get('tab') || 'data'));
  show(new URL(location.href).searchParams.get('tab') || 'data');
  document.getElementById('copy-source').addEventListener('click', async () => {
    if (!sourceLoaded) return;
    try {await navigator.clipboard.writeText(source.textContent); document.getElementById('copy-source').textContent = 'Copied';}
    catch {document.getElementById('copy-source').textContent = 'Copy unavailable';}
  });
})();
