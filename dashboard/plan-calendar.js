(() => {
  'use strict';
  const key = 'london-2027-calendar-v1';
  const start = '2026-10-26', race = '2027-04-24';
  const DAY = 86400000;
  const parse = s => new Date(s + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const longs = [0,60,75,85,95,105,90,110,115,120,95,120,125,130,105,130,135,140,110,140,145,115,135,105,75,0];
  const easy = '4:45–5:30/km · conversational effort';
  const threshold = '3:40–3:48/km · controlled threshold';
  const marathon = '3:51–3:55/km · goal pace, only if controlled';
  const work = (title, pace, notes) => ({title, pace, notes});
  function defaultWorkout(date) {
    if (date < start || date > race) return work('No workout', '', 'Outside the initial plan. Add your own workout.');
    const diff = Math.floor((parse(date) - parse(start)) / DAY), week = Math.floor(diff / 7), dow = diff % 7;
    if (date === race) return work('London Marathon', '3:51/km average · 2:42:30 goal', 'Race day. Start controlled; adjust pacing for conditions and how you feel.');
    if (week === 0) return dow === 0 || dow === 3 ? work('Rest or gentle walk', 'No pace target', 'Recover from Toronto. No hard running while sore.') : work('Optional easy recovery', '5:10–5:50/km · very easy', '20–35 minutes only if legs feel ready. Walk or rest instead if sore.');
    if (week === 1) return dow === 0 || dow === 4 ? work('Rest', 'No pace target', 'Optional gentle mobility.') : work('Easy return', '5:00–5:40/km · conversational', dow === 6 ? 'Up to 60 minutes only if fully comfortable; shorten or rest as needed.' : '30–45 minutes easy. No workout intensity yet.');
    if (week === 25) return [work('Rest', 'No pace target', 'Travel, sleep and hydration.'),work('Easy + strides', easy, '35 minutes easy; 4 × 20 seconds relaxed strides, full walking recovery.'),work('Easy run', easy, '30 minutes easy.'),work('Race-pace tune-up', marathon, '20 minutes easy, 2 × 5 minutes at goal pace with 3 minutes easy between, then 10 minutes easy.'),work('Rest', 'No pace target', 'Keep the day relaxed.'),work('Shakeout', '5:00–5:40/km · very easy', '15–20 minutes easy, optional 3 relaxed strides.'),work('Rest', 'No pace target', '')][dow];
    if (week === 24) return [work('Rest', 'No pace target', 'Mobility if comfortable.'),work('Short threshold', threshold, '15 minutes easy, 3 × 5 minutes controlled with 2 minutes easy jog, 10 minutes easy.'),work('Easy run', easy, '45 minutes easy.'),work('Marathon rhythm', marathon, '15 minutes easy, 2 × 10 minutes at goal pace with 3 minutes easy, 10 minutes easy.'),work('Rest', 'No pace target', 'Optional gentle mobility.'),work('Easy + strides', easy, '35–40 minutes easy and 4 × 20 seconds relaxed strides.'),work('Long easy run', easy, '75 minutes easy, no fast finish.')][dow];
    const cutback = [6,10,14,18,21,23].includes(week);
    const early = week <= 5, specific = week >= 11;
    const recovery = work('Rest', 'No pace target', 'Optional gentle mobility or walking.');
    if (dow === 0) return recovery;
    if (dow === 1) {
      if (week === 2) return work('Easy + strides', easy, '40 minutes easy; 4 × 20 seconds relaxed strides with full recovery, only if fully recovered.');
      if (week === 3) return work('Easy + strides', easy, '45 minutes easy; 4–6 × 20 seconds relaxed strides with full recovery.');
      const sets = week < 7 ? '3 × 6 minutes' : week < 15 ? '4 × 6 minutes' : week < 22 ? '3 × 10 minutes' : '3 × 6 minutes';
      return work(cutback ? 'Controlled tempo' : 'Threshold intervals', threshold, `15–20 minutes easy, ${cutback ? '3 × 5 minutes' : sets} at controlled threshold with 2 minutes easy jog between; 10–15 minutes easy. Shorten if effort is excessive.`);
    }
    if (dow === 2) return work('Easy run', easy, `${early ? 45 : cutback ? 45 : 55} minutes conversational. Optional light strength after the run.`);
    if (dow === 3) {
      if (week < 4) return work('Easy run', easy, '40–45 minutes comfortable.');
      if (!specific || cutback) return work('Steady aerobic run', '4:20–4:40/km · controlled', `15 minutes easy, ${cutback ? 15 : 20} minutes steady, then 10–15 minutes easy. Stay below threshold.`);
      const reps = week < 16 ? '2 × 15 minutes' : week < 22 ? '3 × 15 minutes' : '2 × 10 minutes';
      return work('Marathon-pace intervals', marathon, `15–20 minutes easy, ${reps} at goal pace with 3 minutes easy jog between; 10–15 minutes easy. Back off if goal pace is not controlled.`);
    }
    if (dow === 4) return recovery;
    if (dow === 5) return work('Easy run + strides', easy, `${early ? 40 : cutback ? 40 : 50} minutes easy; optionally 4 × 20 seconds relaxed strides with full recovery.`);
    return work('Long easy run', '4:45–5:25/km · conversational', `${longs[week]} minutes easy. Practice fueling and hydration on longer runs; keep effort comfortable. Shorten if tired.`);
  }
  const calendar = document.getElementById('plan-calendar'), monthLabel = document.getElementById('plan-month'), status = document.getElementById('plan-status');
  const editor = document.getElementById('plan-editor'), title = document.getElementById('plan-title'), pace = document.getElementById('plan-pace'), notes = document.getElementById('plan-notes');
  let edits = {}, selected = '', today = new Date();
  let month = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));
  try { const stored = JSON.parse(localStorage.getItem(key) || '{}'); if (stored && typeof stored === 'object' && !Array.isArray(stored)) edits = stored; } catch { status.textContent = 'Saved edits could not be read; export a backup if available.'; }
  function save() { try { localStorage.setItem(key, JSON.stringify(edits)); status.textContent = 'Saved on this browser and device.'; return true; } catch {status.textContent = 'Could not save to browser storage. Export edits before leaving.'; return false;} }
  function render() {
    monthLabel.textContent = month.toLocaleDateString('en-CA', {month:'long', year:'numeric', timeZone:'UTC'});
    calendar.replaceChildren();
    const offset = (month.getUTCDay() + 6) % 7, first = new Date(month.getTime() - offset * DAY);
    for (let i = 0; i < 42; i++) {
      const d = new Date(first.getTime() + i * DAY), date = iso(d), current = d.getUTCMonth() === month.getUTCMonth(), item = edits[date] || defaultWorkout(date);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day' + (current ? '' : ' other-month') + (date === race ? ' race-day' : '') + (edits[date] ? ' edited-day' : '');
      const number = document.createElement('span'); number.className = 'calendar-date'; number.textContent = d.getUTCDate();
      const label = document.createElement('strong'); label.textContent = item.title;
      const target = document.createElement('span'); target.className = 'calendar-pace'; target.textContent = item.pace || 'No pace target';
      button.append(number, label, target); button.setAttribute('aria-label', `${date}: ${item.title}, ${item.pace || 'no pace target'}${edits[date] ? ', edited' : ''}`);
      button.addEventListener('click', () => open(date)); calendar.append(button);
    }
  }
  function open(date) { selected = date; const item = edits[date] || defaultWorkout(date); document.getElementById('plan-edit-date').textContent = parse(date).toLocaleDateString('en-CA', {weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}); title.value = item.title; pace.value = item.pace; notes.value = item.notes; editor.showModal(); }
  document.getElementById('plan-form').addEventListener('submit', e => {e.preventDefault(); if (!title.value.trim()) return; edits[selected] = {title:title.value.trim(), pace:pace.value.trim(), notes:notes.value.trim()}; save(); editor.close(); render();});
  document.getElementById('plan-cancel').addEventListener('click', () => editor.close());
  document.getElementById('plan-reset-day').addEventListener('click', () => {delete edits[selected]; save(); editor.close(); render();});
  document.getElementById('plan-prev').addEventListener('click', () => {month.setUTCMonth(month.getUTCMonth()-1); render();});
  document.getElementById('plan-next').addEventListener('click', () => {month.setUTCMonth(month.getUTCMonth()+1); render();});
  document.getElementById('plan-today').addEventListener('click', () => {today = new Date(); month = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1)); render();});
  document.getElementById('plan-export').addEventListener('click', () => {const blob = new Blob([JSON.stringify({version:1, edits}, null, 2)], {type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download='london-2027-plan-edits.json'; a.click(); URL.revokeObjectURL(url);});
  document.getElementById('plan-import').addEventListener('change', async e => {try {const file = e.target.files[0]; if (!file || file.size > 1000000) throw Error(); const data = JSON.parse(await file.text()); if (data.version !== 1 || !data.edits || typeof data.edits !== 'object' || Array.isArray(data.edits)) throw Error(); for (const [date, item] of Object.entries(data.edits)) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100 || typeof item.pace !== 'string' || item.pace.length > 120 || typeof item.notes !== 'string' || item.notes.length > 800) throw Error(); } edits = {...edits, ...data.edits}; save(); render(); } catch {status.textContent = 'Could not import edits. Choose a valid London plan export.';} finally {e.target.value = '';}});
  render();
})();
