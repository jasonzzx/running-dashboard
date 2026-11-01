(() => {
  const names = ['data', 'source', 'plan', 'pace-tool'];
  const links = [...document.querySelectorAll('.app-tabs [data-tab]')];
  const views = Object.fromEntries(names.map(name => [name, document.getElementById(name + '-view')]));
  const source = document.getElementById('source-content');
  let sourceLoaded = false;
  let sourceRequest = 0;
  async function loadSource() {
    const request = ++sourceRequest;
    sourceLoaded = false;
    source.textContent = 'Loading training history…';
    const status = document.getElementById('source-status');
    status.textContent = 'Checking snapshot…';
    try {
      const local = location.protocol === 'file:';
      let response = await fetch(local ? 'training-source.md' : '/api/training-source', {cache:'no-store'});
      if (local && !response.ok) response = await fetch('../reports/training_history_for_ai.md');
      if (!response.ok) throw Error();
      const text = await response.text();
      if (request !== sourceRequest) return;
      source.textContent = text;
      sourceLoaded = true;
      const scope = response.headers.get('X-Training-Source');
      status.textContent = scope === 'accepted' ? 'Latest validated sync · owner view' : scope === 'published' ? 'Published snapshot · newer syncs appear after publication' : scope === 'historical' ? 'Historical October 2026 snapshot · automatic refresh pending' : 'Local snapshot · see generation and coverage dates below';
    } catch {
      if (request !== sourceRequest) return;
      source.textContent = 'Unable to load the source. Retry, or open dashboard/training-source.md directly for a local build.';
      status.textContent = 'Snapshot unavailable';
    }
  }
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
