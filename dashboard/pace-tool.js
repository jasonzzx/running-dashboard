(() => {
  const defaults = [0.4, 1, 3, 5, 10, 21.0975, 42.195];
  const paceAt = (distance, anchor) => anchor.pace + 10 * Math.log2(distance / anchor.distance);
  const format = seconds => { const s = Math.round(seconds); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const parse = text => { const m = /^(\d+):([0-5]\d)$/.exec(text.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  window.PaceToolModel = {paceAt, format, parse};
  const root = document.getElementById('pace-tool-content');
  if (!root) return;
  const key = 'running-pace-tool-v1';
  let distances = [...defaults], anchor = {distance: 5, pace: 205};
  const valid = (ds, a) => Array.isArray(ds) && defaults.every(d => ds.includes(d)) && ds.every(d => Number.isFinite(d) && d > 0) && a && ds.includes(a.distance) && Number.isFinite(a.pace) && ds.every(d => Number.isFinite(paceAt(d, a)) && paceAt(d, a) >= 1);
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved && valid(saved.distances, saved.anchor)) { distances = [...new Set(saved.distances)].sort((a,b) => a-b); anchor = saved.anchor; } } catch (_) {}
  const save = () => { try { localStorage.setItem(key, JSON.stringify({distances, anchor})); } catch (_) {} };
  let t;
  function render() {
    const zh = window.dashboardLanguage !== 'en';
    t = (en, cn) => zh ? cn : en;
    const label = d => d === 21.0975 ? t('Half marathon', '半程马拉松') : d === 42.195 ? t('Full marathon', '全程马拉松') : d < 1 ? `${Number((d*1000).toPrecision(10))}m` : `${d}k`;
    const rows = distances.map(d => ({d, p: paceAt(d, anchor)}));
    const width = Math.max(840, rows.length * 85), left = 75, right = width-80;
    const lo = Math.log2(distances[0]), hi = Math.log2(distances.at(-1));
    const x = d => left + (Math.log2(d)-lo)/(hi-lo)*(right-left);
    const min = Math.floor((rows[0].p-5)/10)*10, max = Math.ceil((rows.at(-1).p+5)/10)*10;
    const y = p => 265-(p-min)/(max-min)*220;
    let grid = '';
    for (let p = Math.max(0,min); p<=max; p+=Math.max(10,Math.ceil((max-min)/80)*10)) grid += `<line x1="${left}" x2="${right}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${left-12}" y="${y(p)+4}" text-anchor="end">${format(p)}</text>`;
    root.innerHTML = `<div class="pace-tool-heading"><div><div class="eyebrow">${t('YOUR 10-SECOND RULE','你的 10 秒法则')}</div><h1>${t('Pace Tool','配速工具')}</h1></div><div class="language-switch" role="group" aria-label="Language"><button type="button" data-pace-language="zh-CN" aria-pressed="${zh}">中文</button><button type="button" data-pace-language="en" aria-pressed="${!zh}">EN</button></div></div>
      <p class="lede">${t('Double the distance, add 10 seconds per kilometre. Halve the distance, subtract 10 seconds. Edit any pace below to move the whole line.','距离翻倍，每公里慢 10 秒；距离减半，每公里快 10 秒。修改任意配速，整条线随之调整。')}</p>
      <div class="panel"><h2>${t('Pace by distance','距离与配速')}</h2><p class="caption">${t('Distance uses a logarithmic scale: every doubling has equal spacing. Select a point to edit its pace.','距离使用对数刻度：每次翻倍的间隔相同。选择一个点以修改配速。')}</p><div class="pace-tool-chart chart"><svg viewBox="0 0 ${width} 375" style="min-width:${width}px" role="img" aria-label="${t('Pace in min/km against distance on a logarithmic scale','配速（分/公里）与对数距离图')}">${grid}<text x="${left}" y="20">${t('Pace · min/km','配速 · 分/公里')}</text><path d="${rows.map((r,i)=>`${i?'L':'M'}${x(r.d)},${y(r.p)}`).join(' ')}" fill="none" stroke="#2163b5" stroke-width="3"/>${rows.map(r=>`<g><circle cx="${x(r.d)}" cy="${y(r.p)}" r="${r.d===anchor.distance?8:6}" fill="${r.d===anchor.distance?'#b36238':'#2163b5'}" tabindex="0" role="button" data-distance="${r.d}" aria-label="${label(r.d)} ${format(r.p)}/km"><title>${label(r.d)} · ${format(r.p)}/km</title></circle><text x="${x(r.d)}" y="${y(r.p)-16}" text-anchor="middle">${format(r.p)}</text><text transform="translate(${x(r.d)},290) rotate(35)">${label(r.d)}</text></g>`).join('')}<text x="${width/2}" y="365" text-anchor="middle">${t('Distance · logarithmic scale','距离 · 对数刻度')}</text></svg></div></div>
      <div class="panel"><h2>${t('Set a pace','设置配速')}</h2><p class="caption">${t('Enter minutes:seconds and apply. The last point you edit becomes the reference. Paces display rounded to whole seconds; calculations retain full precision.','输入 分:秒 并应用。最后修改的点成为参考点。显示配速四舍五入至整秒，计算保留完整精度。')}</p><div class="pace-tool-rows">${rows.map(r=>`<form class="pace-tool-row" data-distance="${r.d}"><label for="pace-input-${r.d}"><strong>${label(r.d)}</strong><span>${r.d} km${r.d===anchor.distance?' · '+t('Reference','参考点'):''}</span></label><input id="pace-input-${r.d}" aria-label="${label(r.d)} ${t('pace in min/km','配速（分/公里）')}" value="${format(r.p)}" required pattern="[0-9]+:[0-5][0-9]" inputmode="text" maxlength="12"><span>min/km</span><button class="quiet" type="submit">${t('Apply','应用')}</button>${!defaults.includes(r.d)?`<button type="button" class="quiet" data-remove="${r.d}">${t('Remove','删除')}</button>`:''}</form>`).join('')}</div></div>
      <form class="panel pace-tool-add" id="pace-add"><h2>${t('Add a distance','添加距离')}</h2><label>${t('Distance','距离')}<input name="distance" type="number" min="0" step="any" required placeholder="8"></label><label>${t('Unit','单位')}<select name="unit"><option value="1">km</option><option value="0.001">m</option></select></label><button class="primary-action" type="submit">${t('Add point','添加点')}</button></form><p class="caption">${t('Model: pace = reference pace + 10 × log₂(distance / reference distance), in seconds/km. Settings are saved in this browser.','模型：配速 = 参考配速 + 10 × log₂(距离 / 参考距离)，单位为秒/公里。设置保存在此浏览器中。')}</p><p id="pace-tool-status" role="status" aria-live="polite"></p>`;
    root.querySelectorAll('[data-pace-language]').forEach(b=>b.addEventListener('click',()=>window.dashboardSetLanguage(b.dataset.paceLanguage)));
    root.querySelectorAll('circle').forEach(c => { const focus = () => { const input = document.getElementById('pace-input-'+c.dataset.distance); input.focus(); input.select(); }; c.addEventListener('click',focus); c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus();}}); });
    root.querySelectorAll('.pace-tool-row').forEach(form=>form.addEventListener('submit',e=>{
      e.preventDefault(); const next = {distance:Number(form.dataset.distance), pace:parse(form.querySelector('input').value)};
      if(!valid(distances,next)) return status(t('Enter a valid m:ss pace that keeps all calculated paces positive.','请输入有效的 分:秒 配速，并确保所有计算配速均为正值。'));
      anchor=next; save(); render(); status(t('All paces updated.','所有配速已更新。'));
    }));
    root.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{
      const d=Number(b.dataset.remove);
      if(anchor.distance===d) anchor={distance:5,pace:paceAt(5,anchor)};
      distances=distances.filter(v=>v!==d); save(); render();
    }));
    document.getElementById('pace-add').addEventListener('submit',e=>{
      e.preventDefault(); const form=e.currentTarget; const d=Number((Number(form.elements.distance.value)*Number(form.elements.unit.value)).toPrecision(12));
      if(distances.includes(d)) return status(t('That distance already exists.','该距离已存在。'));
      if(!valid([...distances,d],anchor)) return status(t('Enter a positive distance with a positive calculated pace.','请输入正距离，并确保计算配速为正值。'));
      distances.push(d); distances.sort((a,b)=>a-b); save(); render(); status(t('Distance added.','距离已添加。'));
    });
  }
  function status(message) { document.getElementById('pace-tool-status').textContent=message; }
  document.addEventListener('dashboardlanguagechange',render);
  render();
})();
