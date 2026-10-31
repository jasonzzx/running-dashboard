(() => {
  const defaults = [0.4, 1, 3, 5, 10, 21.0975, 42.195];
  const paceAt = (distance, anchor) => anchor.pace + 10 * Math.log2(distance / anchor.distance);
  const distanceAt = (pace, anchor) => anchor.distance * 2 ** ((pace - anchor.pace) / 10);
  const format = seconds => { const s = Math.round(seconds); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const formatElapsed = seconds => {
    const total = Math.round(seconds), hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60), remainder = String(total % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
  };
  const parse = text => { const m = /^(\d+):([0-5]\d)$/.exec(text.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  const parseElapsed = text => {
    const parts = text.trim().split(':');
    return parts.length === 2 ? parse(text) : parts.length === 3 && /^\d+:[0-5]\d:[0-5]\d$/.test(text.trim()) ? Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]) : NaN;
  };
  window.PaceToolModel = {paceAt, distanceAt, format, formatElapsed, parse, parseElapsed};
  const root = document.getElementById('pace-tool-content');
  if (!root) return;
  const key = 'running-pace-tool-v1';
  let distances = [...defaults], anchor = {distance: 5, pace: 205};
  const valid = (ds, a) => Array.isArray(ds) && new Set(ds).size === ds.length && ds.every(d => Number.isFinite(d) && d > 0) && a && Number.isFinite(a.distance) && a.distance > 0 && Number.isFinite(a.pace) && a.pace >= 1 && ds.every(d => Number.isFinite(paceAt(d, a)) && paceAt(d, a) >= 1 && Number.isFinite(d * paceAt(d, a)));
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved && valid(saved.distances, saved.anchor)) { distances = [...new Set(saved.distances)].sort((a,b) => a-b); anchor = saved.anchor; } } catch (_) {}
  const save = () => { try { localStorage.setItem(key, JSON.stringify({distances, anchor})); } catch (_) {} };
  let t;
  const locked = d => d === 21.0975 || d === 42.195;
  const sameDistance = d => distances.some(value => Math.abs(value - d) <= 1e-10 * Math.max(value, d));
  function render() {
    const zh = window.dashboardLanguage !== 'en';
    t = (en, cn) => zh ? cn : en;
    const label = d => d === 21.0975 ? t('Half marathon', '半程马拉松') : d === 42.195 ? t('Full marathon', '全程马拉松') : d < 1 ? `${d * 1000 >= 1 ? Math.round(d * 1000) : Number((d * 1000).toPrecision(3))}m` : `${Number(d.toFixed(3))}k`;
    const field = (r, name, title, value, fixed = false) => `<label class="pace-tool-field">${title}<span class="pace-tool-spinner"><input id="${name}-input-${r.d}" data-field="${name}" value="${value}" ${name === 'distance' ? 'type="number" min="0" step="any"' : 'type="text" maxlength="12"'} ${fixed ? 'readonly aria-readonly="true"' : ''} aria-label="${label(r.d)} ${title}"><span class="pace-tool-stepper"><button type="button" data-step="1" data-field="${name}" aria-label="${t('Increase','增加')} ${label(r.d)} ${title}" ${fixed ? 'disabled' : ''}>▲</button><button type="button" data-step="-1" data-field="${name}" aria-label="${t('Decrease','减少')} ${label(r.d)} ${title}" ${fixed ? 'disabled' : ''}>▼</button></span></span></label>`;
    const rows = distances.map(d => ({d, p: paceAt(d, anchor), elapsed: paceAt(d, anchor) * d}));
    const width = Math.max(840, rows.length * 85), left = 75, right = width-80;
    const lo = Math.log2(distances[0] || 1), hi = rows.length > 1 ? Math.log2(distances.at(-1)) : lo + 1;
    const x = d => rows.length === 1 ? (left + right) / 2 : left + (Math.log2(d)-lo)/(hi-lo)*(right-left);
    const min = Math.floor(((rows[0]?.p || 200)-5)/10)*10, max = Math.ceil(((rows.at(-1)?.p || 240)+5)/10)*10;
    const y = p => 265-(p-min)/(max-min)*220;
    let grid = '';
    for (let p = Math.max(0,min); p<=max; p+=Math.max(10,Math.ceil((max-min)/80)*10)) grid += `<line x1="${left}" x2="${right}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${left-12}" y="${y(p)+4}" text-anchor="end">${format(p)}</text>`;
    root.innerHTML = `<div class="pace-tool-heading"><div><div class="eyebrow">${t('YOUR 10-SECOND RULE','你的 10 秒法则')}</div><h1>${t('Pace Tool','配速工具')}</h1></div><div class="language-switch" role="group" aria-label="Language"><button type="button" data-pace-language="zh-CN" aria-pressed="${zh}">中文</button><button type="button" data-pace-language="en" aria-pressed="${!zh}">EN</button></div></div>
      <p class="lede">${t('Double the distance, add 10 seconds per kilometre. Halve the distance, subtract 10 seconds. Edit distance, pace or elapsed time below to recalculate the whole line.','距离翻倍，每公里慢 10 秒；距离减半，每公里快 10 秒。修改距离、配速或用时，整条线随之调整。')}</p>
      <div class="panel"><h2>${t('Pace by distance','距离与配速')}</h2><p class="caption">${t('Distance uses a logarithmic scale: every doubling has equal spacing. Labels show pace and elapsed time. Select a point to edit its pace.','距离使用对数刻度：每次翻倍的间隔相同。标签显示配速和用时。选择一个点以修改配速。')}</p><div class="pace-tool-chart chart"><svg viewBox="0 0 ${width} 375" style="min-width:${width}px" role="img" aria-label="${t('Pace in min/km against distance on a logarithmic scale','配速（分/公里）与对数距离图')}">${grid}<text x="${left}" y="20">${t('Pace · min/km','配速 · 分/公里')}</text><path d="${rows.map((r,i)=>`${i?'L':'M'}${x(r.d)},${y(r.p)}`).join(' ')}" fill="none" stroke="#2163b5" stroke-width="3"/>${rows.map(r=>`<g><circle cx="${x(r.d)}" cy="${y(r.p)}" r="${r.d===anchor.distance?8:6}" fill="${r.d===anchor.distance?'#b36238':'#2163b5'}" tabindex="0" role="button" data-distance="${r.d}" aria-label="${label(r.d)} ${format(r.p)}/km · ${t('Elapsed time','用时')} ${formatElapsed(r.elapsed)}"><title>${label(r.d)} · ${format(r.p)}/km · ${t('Elapsed time','用时')} ${formatElapsed(r.elapsed)}</title></circle><text x="${x(r.d)}" y="${y(r.p)-16}" text-anchor="middle">${format(r.p)}</text><text class="pace-tool-chart-elapsed" data-elapsed-distance="${r.d}" x="${x(r.d)}" y="${y(r.p)-32}" text-anchor="middle">${formatElapsed(r.elapsed)}</text><text transform="translate(${x(r.d)},290) rotate(35)">${label(r.d)}</text></g>`).join('')}<text x="${width/2}" y="365" text-anchor="middle">${t('Distance · logarithmic scale','距离 · 对数刻度')}</text></svg></div></div>
      <div class="panel"><div class="panel-head"><h2>${t('Distance, pace & time','距离、配速与用时')}</h2><button type="button" class="primary-action" id="pace-add-entry">${t('Add entry','添加条目')}</button></div><p class="caption">${t('Edit a field, then press Enter or leave it to update. Changing distance keeps that row’s pace; changing time calculates its pace. The edited row becomes the reference. ▲/▼ adjust distance by 0.1 km and pace or time by 1 second. Marathon distances stay fixed. Times use m:ss or h:mm:ss and round to whole seconds; calculations retain full precision.','修改后按回车或离开输入框即可更新。修改距离时保留该行配速；修改用时则计算配速。修改的行成为参考点。▲/▼ 每次调整 0.1 公里或 1 秒。半马及全马距离固定。时间使用 分:秒 或 时:分:秒，显示四舍五入至整秒，计算保留完整精度。')}</p><div class="pace-tool-rows">${rows.map(r=>`<div class="pace-tool-row" data-distance="${r.d}"><div class="pace-tool-row-name"><strong>${label(r.d)}</strong><span>${r.d===anchor.distance?t('Reference','参考点'):''}${locked(r.d)?' · '+t('Fixed distance','固定距离'):''}</span></div>${field(r,'distance',t('Distance · km','距离 · 公里'),Number(r.d.toPrecision(12)),locked(r.d))}${field(r,'pace',t('Pace · min/km','配速 · 分/公里'),format(r.p))}${field(r,'time',t('Elapsed time','用时'),formatElapsed(r.elapsed))}<button type="button" class="pace-tool-remove" data-remove="${r.d}" aria-label="${t('Remove','删除')} ${label(r.d)}">×</button></div>`).join('') || `<p class="caption">${t('Add an entry to start.','请添加条目以开始。')}</p>`}</div></div><p class="caption">${t('Model: pace = reference pace + 10 × log₂(distance / reference distance), in seconds/km. Settings are saved in this browser.','模型：配速 = 参考配速 + 10 × log₂(距离 / 参考距离)，单位为秒/公里。设置保存在此浏览器中。')}</p><p id="pace-tool-status" role="status" aria-live="polite"></p>`;
    root.querySelectorAll('[data-pace-language]').forEach(b=>b.addEventListener('click',()=>window.dashboardSetLanguage(b.dataset.paceLanguage)));
    root.querySelectorAll('circle').forEach(c => { const focus = () => { const input = document.getElementById('pace-input-'+c.dataset.distance); input.focus(); input.select(); }; c.addEventListener('click',focus); c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus();}}); });
    function update(row, name, raw, step = 0) {
      if (!step && raw === row.querySelector(`input[data-field="${name}"]`).defaultValue) return Number(row.dataset.distance);
      const old = Number(row.dataset.distance), currentPace = paceAt(old, anchor);
      let d = old, pace = currentPace;
      const value = name === 'distance' ? Number(raw) : name === 'time' ? parseElapsed(raw) : parse(raw);
      if (name === 'distance') {
        if (locked(old)) return;
        d = step ? Number((value + step * 0.1).toPrecision(12)) : value;
        if (d !== old && sameDistance(d)) return status(t('That distance already exists.','该距离已存在。'));
      } else if (name === 'pace') pace = value + step;
      else pace = (value + step) / d;
      const nextDistances = distances.map(v => v === old ? d : v).sort((a,b)=>a-b);
      const next = {distance:d, pace};
      if (!raw.trim() || !valid(nextDistances, next)) {
        row.querySelector(`input[data-field="${name}"]`).setAttribute('aria-invalid', 'true');
        return status(t('Enter a positive distance or a valid positive time (m:ss or h:mm:ss). All calculated paces must remain positive.','请输入正距离或有效正时间（分:秒 或 时:分:秒），所有计算配速须为正值。'));
      }
      distances = nextDistances; anchor = next; save(); render();
      status(t('All values updated.','所有数值已更新。'));
      return d;
    }
    root.querySelectorAll('.pace-tool-row').forEach(row => {
      row.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', () => {
          if (input.value !== input.defaultValue) update(row, input.dataset.field, input.value);
        });
        input.addEventListener('keydown', e => {
          if (input.readOnly) return;
          if (['Enter','ArrowUp','ArrowDown'].includes(e.key)) {
            e.preventDefault();
            const d = update(row, input.dataset.field, input.value, e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0);
            if (d !== undefined) document.getElementById(`${input.dataset.field}-input-${d}`)?.focus();
          }
        });
      });
      row.querySelectorAll('[data-step]').forEach(button => {
        button.addEventListener('mousedown', e => e.preventDefault());
        button.addEventListener('click', () => {
          const input = row.querySelector(`input[data-field="${button.dataset.field}"]`);
          const d = update(row, button.dataset.field, input.value, Number(button.dataset.step));
          if (d !== undefined) root.querySelector(`.pace-tool-row[data-distance="${d}"] [data-field="${button.dataset.field}"][data-step="${button.dataset.step}"]`)?.focus();
        });
      });
    });
    root.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{
      distances=distances.filter(v=>v!==Number(b.dataset.remove)); save(); render();
      status(t('Entry removed.','条目已删除。'));
    }));
    document.getElementById('pace-add-entry').addEventListener('click', () => {
      let d = 1;
      while (sameDistance(d) || paceAt(d, anchor) < 1) d *= 2;
      if (!valid([...distances,d],anchor)) return status(t('Unable to add a distance for this reference.','无法为此参考点添加距离。'));
      distances.push(d); distances.sort((a,b)=>a-b); save(); render();
      const input = document.getElementById('distance-input-'+d); input.focus(); input.select();
      status(t('Entry added. Edit its distance, pace or time.','条目已添加，可修改距离、配速或用时。'));
    });
  }
  function status(message) { document.getElementById('pace-tool-status').textContent=message; }
  document.addEventListener('dashboardlanguagechange',render);
  render();
})();
