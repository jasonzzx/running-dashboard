'use strict';
function renderPaceDistribution(selection) {
  const source = window.PACE_DISTRIBUTION;
  const runs = selection.filter(r => r.sport === 'running' && r.sub_sport !== 'treadmill');
  const bins = Array.from({length:12}, (_, i) => ({seconds:0, metres:0, label:i===0?'<3:00':i===11?'≥8:00':`${pace(180+(i-1)*30)}–${pace(180+i*30)}`}));
  let excluded = 0, covered = 0;
  for (const run of runs) {
    let usable = false;
    for (const [bin, seconds, metres] of source?.[run.activity_key] || []) {
      if (bin < 0) { excluded += seconds; continue; }
      bins[bin].seconds += seconds; bins[bin].metres += metres; usable = true;
    }
    if (usable) covered++;
  }
  const totalTime = sum(bins,'seconds'), totalDistance = sum(bins,'metres');
  $('pace-coverage').textContent = !source ? 'Pace data is unavailable. Rebuild the dashboard to generate it.' : `${fmt(covered)} of ${fmt(runs.length)} eligible runs with usable intervals · ${fmt(totalTime/3600,2)} h · ${fmt(totalDistance/1000,2)} km included · ${fmt(excluded/3600,2)} h of recorded intervals excluded. Treadmill records contribute nothing to these totals.`;
  for (const [id, field, divisor, unit] of [['pace-time','seconds',3600,'h'],['pace-distance','metres',1000,'km']]) {
    const root = $(id), total = sum(bins,field), max = Math.max(1,...bins.map(b=>b[field]));
    if (!total) { root.innerHTML = `<div class="empty">${selection.some(r=>r.sub_sport==='treadmill')?'Treadmill runs are excluded. Choose Road / outdoor or another setting.':'No usable running intervals in this selection.'}</div>`; continue; }
    root.innerHTML = bins.map(b=>{
      const percent=b[field]/total*100, label=`${b.label} min/km: ${fmt(b[field]/divisor,2)} ${unit} (${fmt(percent,1)}%)`;
      return `<div class="pace-row" tabindex="0" aria-label="${esc(label)}" data-tip="${esc(label)}"><span>${b.label}</span><div class="pace-track"><div class="pace-fill" style="width:${b[field]/max*100}%"></div></div><span>${fmt(b[field]/divisor,2)} ${unit}<small>${fmt(percent,1)}%</small></span></div>`;
    }).join('');
    wireTips(root);
  }
}
