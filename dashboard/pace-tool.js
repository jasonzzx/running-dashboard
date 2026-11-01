(() => {
  const defaults = [0.4, 1, 3, 5, 10, 21.0975, 42.195];
  const prDefinitions = [
    ['400m', '400米', 0.4, 65, '7071592834'],
    ['1/2 mile', '半英里', 0.804672, 147, '11776571630'],
    ['1K', '1公里', 1, 183, '9070783318'],
    ['1 mile', '1英里', 1.609344, 327, '14926265906'],
    ['2 mile', '2英里', 3.218688, 667, '18414035803'],
    ['5K', '5公里', 5, 1039, '18414035803'],
    ['10K', '10公里', 10, 2149, '18451607318'],
    ['15K', '15公里', 15, 3366, '7936698463'],
    ['10 mile', '10英里', 16.09344, 3621, '7936698463'],
    ['20K', '20公里', 20, 4549, '7936698463'],
    ['Half-Marathon', '半程马拉松', 21.0975, 4823, '7936698463'],
    ['30K', '30公里', 30, 7052, '20636797187'],
    ['Marathon', '全程马拉松', 42.195, 10053, '20636797187'],
  ].map(([en, zh, distance, time, activity], id) => ({id, en, zh, distance, time, activity}));
  const prKey = 'running-pace-tool-pr-v1';
  let prTimes = prDefinitions.map(pr => pr.time);
  try {
    const saved = JSON.parse(localStorage.getItem(prKey));
    if (Array.isArray(saved) && saved.length === prDefinitions.length && saved.every(v => v === null || Number.isSafeInteger(v) && v > 0)) prTimes = saved;
  } catch (_) {}
  const savePr = () => { try { localStorage.setItem(prKey, JSON.stringify(prTimes)); } catch (_) {} };
  let selectedModel = '10s';
  // Daniels–Gilbert equations: distance in km, elapsed time in minutes.
  const vdot = (distance, minutes) => {
    const speed = distance * 1000 / minutes;
    const oxygen = -4.60 + 0.182258 * speed + 0.000104 * speed * speed;
    const fraction = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes);
    return oxygen / fraction;
  };
  const danielsPace = (distance, anchor) => {
    const score = vdot(anchor.distance, anchor.distance * anchor.pace / 60);
    if (!(score > 0) || !Number.isFinite(score) || !(distance > 0) || !Number.isFinite(distance)) return NaN;
    if (distance === anchor.distance) return anchor.pace;
    let low = 0, high = Math.max(1, distance * anchor.pace / 60);
    for (let i = 0; i < 100 && vdot(distance, high) > score; i++) high *= 2;
    if (!Number.isFinite(high) || !(vdot(distance, high) <= score)) return NaN;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      if (vdot(distance, mid) > score) low = mid;
      else high = mid;
    }
    return (low + high) / 2 * 60 / distance;
  };
  const paceAt = (distance, anchor, model = selectedModel) => model === 'vdot' ? danielsPace(distance, anchor) : anchor.pace + 10 * Math.log2(distance / anchor.distance);
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
  window.PaceToolModel = {paceAt, danielsPace, vdot, distanceAt, format, formatElapsed, parse, parseElapsed};
  const root = document.getElementById('pace-tool-content');
  if (!root) return;
  const key = 'running-pace-tool-v1';
  let distances = [...defaults], anchor = {distance: 5, pace: 205};
  const valid = (ds, a, model = selectedModel) => Array.isArray(ds) && new Set(ds).size === ds.length && ds.every(d => Number.isFinite(d) && d > 0) && a && Number.isFinite(a.distance) && a.distance > 0 && Number.isFinite(a.pace) && a.pace >= 1 && (model !== 'vdot' || Number.isFinite(danielsPace(a.distance, a))) && ds.every(d => Number.isFinite(paceAt(d, a, model)) && paceAt(d, a, model) >= 1 && Number.isFinite(d * paceAt(d, a, model)));
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved && valid(saved.distances, saved.anchor, saved.model === 'vdot' ? 'vdot' : '10s')) { distances = [...new Set(saved.distances)].sort((a,b) => a-b); anchor = saved.anchor; selectedModel = saved.model === 'vdot' ? 'vdot' : '10s'; } } catch (_) {}
  const save = () => { try { localStorage.setItem(key, JSON.stringify({distances, anchor, model:selectedModel})); } catch (_) {} };
  let t, addDistanceText = '', addDistanceUnit = 'km';
  const locked = d => d === 21.0975 || d === 42.195;
  const sameDistance = d => distances.some(value => Math.abs(value - d) <= 1e-10 * Math.max(value, d));
  function render() {
    const zh = window.dashboardLanguage !== 'en';
    t = (en, cn) => zh ? cn : en;
    const modelName = selectedModel === 'vdot' ? 'VDOT' : t('10s rule','10 秒法则');
    const label = d => d === 21.0975 ? t('Half marathon', '半程马拉松') : d === 42.195 ? t('Full marathon', '全程马拉松') : d < 1 ? `${d * 1000 >= 1 ? Math.round(d * 1000) : Number((d * 1000).toPrecision(3))}m` : `${Number(d.toFixed(3))}k`;
    const field = (r, name, title, value, fixed = false) => `<label class="pace-tool-field">${title}<span class="pace-tool-spinner"><input id="${name}-input-${r.d}" data-field="${name}" value="${value}" ${name === 'distance' ? 'type="number" min="0" step="any"' : 'type="text" maxlength="12"'} ${fixed ? 'readonly aria-readonly="true"' : ''} aria-label="${label(r.d)} ${title}"><span class="pace-tool-stepper"><button type="button" data-step="1" data-field="${name}" aria-label="${t('Increase','增加')} ${label(r.d)} ${title}" ${fixed ? 'disabled' : ''}>▲</button><button type="button" data-step="-1" data-field="${name}" aria-label="${t('Decrease','减少')} ${label(r.d)} ${title}" ${fixed ? 'disabled' : ''}>▼</button></span></span></label>`;
    const rows = distances.map(d => ({d, p: paceAt(d, anchor), elapsed: paceAt(d, anchor) * d}));
    const curve = rows.length < 2 ? rows : Array.from({length:97}, (_,i) => {
      const d = distances[0] * (distances.at(-1) / distances[0]) ** (i / 96);
      return {d, p:paceAt(d,anchor)};
    });
    const prs = prDefinitions.filter(pr => prTimes[pr.id] !== null).map(pr => ({...pr, elapsed:prTimes[pr.id], p:prTimes[pr.id] / pr.distance}));
    const chartDistances = [...new Set([...distances, ...prs.map(pr => pr.distance)])].sort((a,b)=>a-b);
    const width = Math.max(840, chartDistances.length * 85), left = 75, right = width-80;
    const lo = Math.log2(chartDistances[0] || 1), hi = chartDistances.length > 1 ? Math.log2(chartDistances.at(-1)) : lo + 1;
    const x = d => chartDistances.length === 1 ? (left + right) / 2 : left + (Math.log2(d)-lo)/(hi-lo)*(right-left);
    const allPaces = [...curve.map(r => r.p), ...rows.map(r => r.p), ...prs.map(pr => pr.p)];
    const min = Math.floor(((allPaces.length ? Math.min(...allPaces) : 200)-5)/10)*10, max = Math.ceil(((allPaces.length ? Math.max(...allPaces) : 240)+5)/10)*10;
    const y = p => 265-(p-min)/(max-min)*220;
    let grid = '';
    for (let p = Math.max(0,min); p<=max; p+=Math.max(10,Math.ceil((max-min)/80)*10)) grid += `<line x1="${left}" x2="${right}" y1="${y(p)}" y2="${y(p)}" class="grid"/><text x="${left-12}" y="${y(p)+4}" text-anchor="end">${format(p)}</text>`;
    root.innerHTML = `<div class="pace-tool-heading"><div><div class="eyebrow">${t('RACE PACE PREDICTIONS','赛事配速预测')}</div><h1>${t('Pace Tool','配速工具')}</h1></div><div class="language-switch" role="group" aria-label="Language"><button type="button" data-pace-language="zh-CN" aria-pressed="${zh}">中文</button><button type="button" data-pace-language="en" aria-pressed="${!zh}">EN</button></div></div>
      <label class="pace-tool-model-control" for="pace-model">${t('Calculation model','计算模型')}<select id="pace-model"><option value="10s" ${selectedModel === '10s' ? 'selected' : ''}>${t('10s rule','10 秒法则')}</option><option value="vdot" ${selectedModel === 'vdot' ? 'selected' : ''}>VDOT</option></select></label>
      <p class="lede">${selectedModel === 'vdot' ? t('Predict equivalent race paces and times with the Daniels model. Edit any row to set the reference performance.','使用 Daniels 模型预测等效赛事配速和用时。修改任意一行即可设置参考成绩。') : t('Double the distance, add 10 seconds per kilometre. Halve the distance, subtract 10 seconds. Edit distance, pace or elapsed time below to recalculate the whole line.','距离翻倍，每公里慢 10 秒；距离减半，每公里快 10 秒。修改距离、配速或用时，整条线随之调整。')}</p>
      <p class="caption pace-model-reference">${t('Reference','参考点')}: ${label(anchor.distance)} · ${format(anchor.pace)}/km · ${formatElapsed(anchor.distance * anchor.pace)}${selectedModel === 'vdot' ? ' · '+t('Short sprint distances are extrapolations; equivalent race times assume preparation for the target distance.','短距离冲刺为外推估算；等效用时假设已针对目标距离进行训练。') : ''}</p>
      <div class="panel"><h2>${t('Pace by distance','距离与配速')}</h2><p class="caption">${t('Distance uses a logarithmic scale: every doubling has equal spacing. Labels show pace and elapsed time. Select a point to edit its pace.','距离使用对数刻度：每次翻倍的间隔相同。标签显示配速和用时。选择一个点以修改配速。')}</p><div class="pace-tool-legend"><span><i class="pace-tool-model-key"></i>${modelName}</span><span><i class="pace-tool-pr-key"></i>${t('Personal records','个人最佳纪录')}</span></div><div class="pace-tool-chart chart"><svg viewBox="0 0 ${width} 375" style="min-width:${width}px" role="img" aria-label="${t('Pace in min/km against distance on a logarithmic scale','配速（分/公里）与对数距离图')}">${grid}<text x="${left}" y="20">${t('Pace · min/km','配速 · 分/公里')}</text><path d="${curve.map((r,i)=>`${i?'L':'M'}${x(r.d)},${y(r.p)}`).join(' ')}" fill="none" stroke="#2163b5" stroke-width="3"/>${rows.map(r=>`<g><circle cx="${x(r.d)}" cy="${y(r.p)}" r="${r.d===anchor.distance?8:6}" fill="${r.d===anchor.distance?'#b36238':'#2163b5'}" tabindex="0" role="button" data-distance="${r.d}" aria-label="${label(r.d)} ${format(r.p)}/km · ${t('Elapsed time','用时')} ${formatElapsed(r.elapsed)}"><title>${label(r.d)} · ${format(r.p)}/km · ${t('Elapsed time','用时')} ${formatElapsed(r.elapsed)}</title></circle><text x="${x(r.d)}" y="${y(r.p)-16}" text-anchor="middle">${format(r.p)}</text><text class="pace-tool-chart-elapsed" data-elapsed-distance="${r.d}" x="${x(r.d)}" y="${y(r.p)-32}" text-anchor="middle">${formatElapsed(r.elapsed)}</text><text transform="translate(${x(r.d)},290) rotate(35)">${label(r.d)}</text></g>`).join('')}${prs.map(pr => `<circle class="pace-tool-pr-dot" cx="${x(pr.distance)}" cy="${y(pr.p)}" r="7" tabindex="0" role="button" data-pr-id="${pr.id}" aria-label="PR ${t(pr.en,pr.zh)} · ${formatElapsed(pr.elapsed)} · ${format(pr.p)}/km"><title>PR ${t(pr.en,pr.zh)} · ${formatElapsed(pr.elapsed)} · ${format(pr.p)}/km</title></circle>`).join('')}${chartDistances.filter(d => !distances.includes(d)).map((d,i) => `<text transform="translate(${x(d)},${i % 2 ? 315 : 290}) rotate(35)">${t(prs.find(pr => pr.distance === d).en, prs.find(pr => pr.distance === d).zh)}</text>`).join('')}<text x="${width/2}" y="365" text-anchor="middle">${t('Distance · logarithmic scale','距离 · 对数刻度')}</text></svg></div><p id="pace-pr-detail" class="caption" role="status" aria-live="polite">${t('Select a PR dot to view and edit its recorded time.','选择 PR 圆点以查看和修改纪录用时。')}</p></div>
      <div class="panel"><div class="panel-head"><h2>${t('Distance, pace & time','距离、配速与用时')}</h2><form id="pace-add-entry-form" class="pace-tool-add-controls"><label for="pace-add-distance">${t('Distance','距离')}<input id="pace-add-distance" type="number" inputmode="decimal" min="0" step="any" required placeholder="${addDistanceUnit === 'km' ? '10' : addDistanceUnit === 'mile' ? '1' : '100'}"></label><label for="pace-add-unit">${t('Unit','单位')}<select id="pace-add-unit"><option value="km" ${addDistanceUnit === 'km' ? 'selected' : ''}>km</option><option value="mile" ${addDistanceUnit === 'mile' ? 'selected' : ''}>mile</option><option value="m" ${addDistanceUnit === 'm' ? 'selected' : ''}>meter</option></select></label><button type="submit" class="primary-action" id="pace-add-entry">${t('Add entry','添加条目')}</button></form></div><p class="caption">${t('Edit a field, then press Enter or leave it to update. Changing distance keeps that row’s pace; changing time calculates its pace. The edited row becomes the reference. ▲/▼ adjust distance by 0.1 km and pace or time by 1 second. Marathon distances stay fixed. Times use m:ss or h:mm:ss and round to whole seconds; calculations retain full precision.','修改后按回车或离开输入框即可更新。修改距离时保留该行配速；修改用时则计算配速。修改的行成为参考点。▲/▼ 每次调整 0.1 公里或 1 秒。半马及全马距离固定。时间使用 分:秒 或 时:分:秒，显示四舍五入至整秒，计算保留完整精度。')}</p><div class="pace-tool-rows">${rows.map(r=>`<div class="pace-tool-row" data-distance="${r.d}"><div class="pace-tool-row-name"><strong>${label(r.d)}</strong><span>${r.d===anchor.distance?t('Reference','参考点'):''}${locked(r.d)?' · '+t('Fixed distance','固定距离'):''}</span></div>${field(r,'distance',t('Distance · km','距离 · 公里'),Number(r.d.toPrecision(12)),locked(r.d))}${field(r,'pace',t('Pace · min/km','配速 · 分/公里'),format(r.p))}${field(r,'time',t('Elapsed time','用时'),formatElapsed(r.elapsed))}<button type="button" class="pace-tool-remove" data-remove="${r.d}" aria-label="${t('Remove','删除')} ${label(r.d)}">×</button></div>`).join('') || `<p class="caption">${t('Add an entry to start.','请添加条目以开始。')}</p>`}</div></div><div class="panel pace-pr-panel"><h2>${t('Personal records','个人最佳纪录')}</h2><p class="caption">${t('Your supplied PRs are prefilled. Edit elapsed time and press Enter or leave the field to save. Clear a time to hide its dot. PR pace is elapsed time ÷ distance; these records do not change the prediction line. Edits are saved in this browser.','已填入你提供的个人纪录。修改用时后按回车或离开输入框即可保存。清空用时以隐藏圆点。PR 配速 = 用时 ÷ 距离；个人纪录不会改变预测曲线。修改保存在此浏览器中。')}</p><div class="pace-pr-rows">${prDefinitions.map(pr => `<div class="pace-pr-row" data-pr-row="${pr.id}"><div class="pace-tool-row-name"><strong>${t(pr.en,pr.zh)}</strong><span>${pr.distance} km</span></div><label>${t('Elapsed time','用时')}<span class="pace-tool-spinner"><input id="pr-time-${pr.id}" data-pr-time="${pr.id}" value="${prTimes[pr.id] === null ? '' : formatElapsed(prTimes[pr.id])}" placeholder="m:ss / h:mm:ss" maxlength="12" aria-label="PR ${t(pr.en,pr.zh)} ${t('Elapsed time','用时')}"><span class="pace-tool-stepper"><button type="button" data-pr-step="1" data-pr="${pr.id}" aria-label="${t('Increase PR time','增加 PR 用时')} ${t(pr.en,pr.zh)}">▲</button><button type="button" data-pr-step="-1" data-pr="${pr.id}" aria-label="${t('Decrease PR time','减少 PR 用时')} ${t(pr.en,pr.zh)}">▼</button></span></span></label><div class="pace-pr-pace"><span>${t('Pace · min/km','配速 · 分/公里')}</span><output>${prTimes[pr.id] === null ? '—' : format(prTimes[pr.id] / pr.distance)}</output></div><a href="https://www.strava.com/activities/${pr.activity}/best-efforts" target="_blank" rel="noopener noreferrer">${t('View on Strava ↗','查看 Strava ↗')}</a></div>`).join('')}</div></div><p class="caption">${selectedModel === 'vdot' ? t('VDOT uses the Daniels–Gilbert equivalent-performance equations to calculate pace and time from the reference. Settings are saved in this browser.','VDOT 使用 Daniels–Gilbert 等效成绩公式，根据参考成绩计算配速及用时。设置保存在此浏览器中。') : t('Model: pace = reference pace + 10 × log₂(distance / reference distance), in seconds/km. Settings are saved in this browser.','模型：配速 = 参考配速 + 10 × log₂(距离 / 参考距离)，单位为秒/公里。设置保存在此浏览器中。')}</p><p id="pace-tool-status" role="status" aria-live="polite"></p>`;
    document.getElementById('pace-model').addEventListener('change', e => {
      const next = e.target.value;
      if (!valid(distances, anchor, next)) {
        e.target.value = selectedModel;
        return status(t('This reference cannot produce valid predictions in the selected model. Adjust its pace or time first.','此参考成绩无法在所选模型中生成有效预测，请先调整配速或用时。'));
      }
      selectedModel = next; save(); render(); document.getElementById('pace-model').focus();
      status(t('Calculation model updated.','计算模型已更新。'));
    });
    root.querySelectorAll('[data-pace-language]').forEach(b=>b.addEventListener('click',()=>window.dashboardSetLanguage(b.dataset.paceLanguage)));
    root.querySelectorAll('circle[data-distance]').forEach(c => { const focus = () => { const input = document.getElementById('pace-input-'+c.dataset.distance); input.focus(); input.select(); }; c.addEventListener('click',focus); c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus();}}); });
    function updatePr(id, raw, step = 0) {
      const value = raw.trim() ? parseElapsed(raw) + step : step ? Math.max(1, step) : null;
      if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
        document.getElementById('pr-time-'+id).setAttribute('aria-invalid','true');
        return status(t('Enter a positive PR time (m:ss or h:mm:ss), or clear it to hide the dot.','请输入有效正用时（分:秒 或 时:分:秒），或清空以隐藏圆点。'));
      }
      prTimes[id] = value; savePr(); render();
      status(t('PR updated.','个人纪录已更新。'));
      return true;
    }
    root.querySelectorAll('[data-pr-time]').forEach(input => {
      input.addEventListener('change', () => { if (input.value !== input.defaultValue) updatePr(Number(input.dataset.prTime),input.value); });
      input.addEventListener('keydown', e => {
        if (['Enter','ArrowUp','ArrowDown'].includes(e.key)) {
          e.preventDefault();
          if (updatePr(Number(input.dataset.prTime),input.value,e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0)) document.getElementById(input.id)?.focus();
        }
      });
    });
    root.querySelectorAll('[data-pr-step]').forEach(button => {
      button.addEventListener('mousedown', e => e.preventDefault());
      button.addEventListener('click', () => {
        const id = Number(button.dataset.pr);
        if (updatePr(id,document.getElementById('pr-time-'+id).value,Number(button.dataset.prStep))) root.querySelector(`[data-pr="${id}"][data-pr-step="${button.dataset.prStep}"]`)?.focus();
      });
    });
    root.querySelectorAll('[data-pr-id]').forEach(dot => {
      const select = () => {
        const id = Number(dot.dataset.prId), pr = prDefinitions[id];
        document.getElementById('pace-pr-detail').textContent = `PR ${t(pr.en,pr.zh)} · ${formatElapsed(prTimes[id])} · ${format(prTimes[id]/pr.distance)}/km`;
        const input = document.getElementById('pr-time-'+id); input.focus(); input.select();
      };
      dot.addEventListener('click',select);
      dot.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();select();} });
    });
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
        return status(t('Enter a positive distance or a valid positive time (m:ss or h:mm:ss). The selected model must produce valid positive paces.','请输入正距离或有效正时间（分:秒 或 时:分:秒），所选模型须能生成有效正配速。'));
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
    const addInput = document.getElementById('pace-add-distance');
    addInput.value = addDistanceText;
    addInput.addEventListener('input', () => { addDistanceText = addInput.value; });
    document.getElementById('pace-add-unit').addEventListener('change', e => {
      addDistanceUnit = e.target.value;
      addInput.placeholder = addDistanceUnit === 'km' ? '10' : addDistanceUnit === 'mile' ? '1' : '100';
    });
    document.getElementById('pace-add-entry-form').addEventListener('submit', e => {
      e.preventDefault();
      const d = Number((Number(addInput.value) * (addDistanceUnit === 'mile' ? 1.609344 : addDistanceUnit === 'm' ? 0.001 : 1)).toPrecision(12));
      if (Number.isFinite(d) && d > 0 && sameDistance(d)) return status(t('That distance already exists.','该距离已存在。'));
      if (!addInput.value.trim() || !(d > 0) || !valid([...distances,d],anchor)) return status(t('Enter a positive distance that produces a valid pace in the selected model.','请输入能在所选模型中生成有效配速的正距离。'));
      distances.push(d); distances.sort((a,b)=>a-b); addDistanceText = ''; save(); render();
      const input = document.getElementById('pace-input-'+d); input.focus(); input.select();
      status(t('Entry added. Edit its distance, pace or time.','条目已添加，可修改距离、配速或用时。'));
    });
  }
  function status(message) { document.getElementById('pace-tool-status').textContent=message; }
  document.addEventListener('dashboardlanguagechange',render);
  render();
})();
