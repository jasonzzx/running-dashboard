(() => {
  const names = ['data', 'source', 'plan', 'pace-tool'];
  const links = [...document.querySelectorAll('.app-tabs [data-tab]')];
  const views = Object.fromEntries(names.map(name => [name, document.getElementById(name + '-view')]));
  const source = document.getElementById('source-content');
  let sourceLoaded = false;
  function show(name, updateUrl = false) {
    if (!names.includes(name)) name = 'data';
    for (const key of names) views[key].hidden = key !== name;
    for (const link of links) {
      if (link.dataset.tab === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (updateUrl) { const url = new URL(location.href); url.searchParams.set('tab', name); url.hash = ''; history.pushState({tab:name}, '', url); }
    if (name === 'source' && !sourceLoaded) {
      const path = location.protocol === 'file:' ? '../reports/training_history_for_ai.md' : '/api/training-source';
      fetch(path).then(r => { if (!r.ok) throw Error(); return r.text(); }).then(text => {source.textContent = text; sourceLoaded = true;}).catch(() => {source.textContent = 'Unable to load the source here. Open reports/training_history_for_ai.md directly or use the hosted app.';});
    }
  }
  links.forEach(link => link.addEventListener('click', e => {e.preventDefault(); show(link.dataset.tab, true); window.scrollTo(0, 0);}));
  window.addEventListener('popstate', () => show(new URL(location.href).searchParams.get('tab') || 'data'));
  show(new URL(location.href).searchParams.get('tab') || 'data');
  document.getElementById('copy-source').addEventListener('click', async () => {
    if (!sourceLoaded) return;
    try {await navigator.clipboard.writeText(source.textContent); document.getElementById('copy-source').textContent = 'Copied';}
    catch {document.getElementById('copy-source').textContent = 'Copy unavailable';}
  });
})();
