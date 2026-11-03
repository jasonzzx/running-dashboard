'use strict';
function renderPaceDistribution(selection) {
  const source = window.PACE_DISTRIBUTION;
  const runs = selection.filter(r => r.sport === 'running' && r.sub_sport !== 'treadmill');
  const control = $('pace-range'), custom = $('pace-custom');
  const width = Number(control.value === 'custom' ? custom.value : control.value);
  $('pace-custom-label').hidden = control.value !== 'custom';
  control.onchange = custom.oninput = () => renderPaceDistribution(selection);
  const status = $('pace-range-status');
  const validWidth = Number.isFinite(width) && width > 0 && Number.isFinite(300 / width);
  custom.setAttribute('aria-invalid', String(control.value === 'custom' && !validWidth));
  status.textContent = !validWidth ? 'Enter a positive pace range in seconds/km.' : !source?._intervals && width !== 30 ? 'This snapshot only contains 30s ranges. Rebuild or sync the original recordings to use other ranges.' : '';
  if (status.textContent) { $('pace-time').innerHTML = ''; $('pace-distance').innerHTML = ''; $('pace-coverage').textContent = ''; return; }
  const bins = Array.from({length:12}, (_, i) => ({seconds:0, metres:0, label:i===0?'<3:00':i===11?'≥8:00':`${pace(180+(i-1)*30)}–${pace(180+i*30)}`}));
  const exactBins = new Map();
  const labelPace = value => `${Math.floor(value / 60)}:${Number((value % 60).toFixed(6)).toLocaleString('en-US', {minimumIntegerDigits:2, maximumFractionDigits:6, useGrouping:false})}`;
  function exactBin(value) {
    const index = value < 180 ? -1 : value >= 480 ? Infinity : Math.floor((value - 180) / width);
    if (!exactBins.has(index)) {
      const lower = 180 + index * width, upper = Math.min(480, lower + width);
      exactBins.set(index, {seconds:0, metres:0, label:index === -1 ? '<3:00' : index === Infinity ? '≥8:00' : `${labelPace(lower)}–${labelPace(upper)}`});
    }
    return exactBins.get(index);
  }
  if (source?._intervals && 300 / width <= 1000) {
    exactBin(0);
    for (let i = 0; i < Math.ceil(300 / width); i++) exactBin(180 + i * width + Math.min(width / 2, (300 - i * width) / 2));
    exactBin(480);
  }
  let excluded = 0, covered = 0;
  for (const run of runs) {
    let usable = false;
    for (const [bin, seconds, metres] of source?.[run.activity_key] || []) {
      if (bin < 0) { excluded += seconds; continue; }
      if (source?._intervals) continue;
      bins[bin].seconds += seconds; bins[bin].metres += metres; usable = true;
    }
    for (const [value, seconds, metres] of source?._intervals?.[run.activity_key] || []) {
      const bin = exactBin(value); bin.seconds += seconds; bin.metres += metres; usable = true;
    }
    if (usable) covered++;
  }
  if (source?._intervals) bins.splice(0, bins.length, ...[...exactBins.entries()].sort((a,b)=>a[0]-b[0]).map(([,bin])=>bin));
  const totalTime = sum(bins,'seconds'), totalDistance = sum(bins,'metres');
  $('pace-coverage').textContent = !source ? 'Pace data is unavailable. Rebuild the dashboard to generate it.' : `${fmt(covered)} of ${fmt(runs.length)} eligible runs with usable intervals · ${fmt(totalTime/3600,2)} h · ${fmt(totalDistance/1000,2)} km included · ${fmt(excluded/3600,2)} h of recorded intervals excluded. Treadmill records contribute nothing to these totals.`;
  for (const [id, field, divisor, unit] of [['pace-time','seconds',3600,'h'],['pace-distance','metres',1000,'km']]) {
    const root = $(id), total = sum(bins,field), max = Math.max(1,...bins.map(b=>b[field]));
    if (!total) { root.innerHTML = `<div class="empty">${selection.some(r=>r.sub_sport==='treadmill')?'Treadmill runs are excluded. Choose Road / outdoor or another setting.':'No usable running intervals in this selection.'}</div>`; continue; }
    root.innerHTML = bins.map(b=>{
      const percent=b[field]/total*100, label=`${b.label} min/km: ${fmt(b[field]/divisor,2)} ${unit} (${fmt(percent,1)}%)`;
      return `<div class="pace-row" tabindex="0" aria-label="${esc(label)}" data-tip="${esc(label)}"><span>${esc(b.label)}</span><div class="pace-track"><div class="pace-fill" style="width:${b[field]/max*100}%"></div></div><span>${fmt(b[field]/divisor,2)} ${unit}<small>${fmt(percent,1)}%</small></span></div>`;
    }).join('');
    wireTips(root);
  }
}
