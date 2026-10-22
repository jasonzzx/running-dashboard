'use strict';
const G=window.GARMIN_DATA;
const median=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null};
const delta=(a,b)=>a!=null&&b!=null&&a!==0?(b/a-1)*100:null;
const signed=(v,n=1)=>v==null||!Number.isFinite(v)?'—':(v>0?'+':'')+fmt(v,n);
const metricInfo={ground_contact_ms:['Ground contact','ms',1],vertical_ratio_pct:['Vertical ratio','%',2],vertical_oscillation_mm:['Vertical oscillation','mm',1],step_length_m:['Stride length','m',2],cadence_spm:['Cadence','steps/min',1],avg_power_w:['Power','W',0],vo2max_ml_kg_min:['VO₂ max estimate','mL/kg/min',1],aerobic_training_effect:['Aerobic training effect','/5',1]};

function garminPlot(id,points,label){
 if(!points.length){$(id).innerHTML='<div class="empty">No measurements for this selection.</div>';return}
 const w=1000,h=270,[lo,hi]=bounds(points.map(p=>p.value)),[first,last]=bounds(points.map(p=>Date.parse(p.date+'T00:00:00Z'))),x=t=>52+(t-first)/(last-first)*(w-70),y=v=>20+(hi-v)/(hi-lo)*(h-60);
 let svg=svgFrame(w,h)+`<title>${esc(label)}</title>`+axes(w,h,first,last,lo,hi,v=>new Date(v).toISOString().slice(0,7),v=>fmt(v,1));
 points.forEach(p=>svg+=`<circle tabindex="0" cx="${x(Date.parse(p.date+'T00:00:00Z'))}" cy="${y(p.value)}" r="3.3" fill="#367acb" opacity=".75" data-tip="${esc(p.date+' · '+fmt(p.value,2)+' '+label+(p.n?' · '+p.n+' observations':''))}"/>`);
 $(id).innerHTML=svg+'</svg>';wireTips($(id));
}
function categoryPlot(id,points,label,decimals=1){
 if(!points.length){$(id).innerHTML='<div class="empty">Not enough runs to form pace groups.</div>';return}
 const w=760,h=270,[lo,hi]=bounds(points.map(p=>p.value)),x=i=>62+i*(w-100)/Math.max(1,points.length-1),y=v=>20+(hi-v)/(hi-lo)*(h-67);
 let svg=svgFrame(w,h)+`<title>${esc(label)} by activity-average pace</title>`;
 for(let i=0;i<5;i++){const yy=20+(h-67)*i/4,v=hi-(hi-lo)*i/4;svg+=`<line class="grid" x1="52" x2="${w-18}" y1="${yy}" y2="${yy}"/><text x="43" y="${yy+4}" text-anchor="end">${fmt(v,decimals)}</text>`}
 svg+=`<polyline points="${points.map((p,i)=>x(i)+','+y(p.value)).join(' ')}" fill="none" stroke="#246fbe" stroke-width="2.5"/>`;
 points.forEach((p,i)=>{svg+=`<circle tabindex="0" cx="${x(i)}" cy="${y(p.value)}" r="5" fill="#367acb" data-tip="${esc(p.label+' · median '+fmt(p.value,decimals)+' · '+p.n+' runs')}"/><text x="${x(i)}" y="${h-19}" text-anchor="middle">${esc(p.short)}</text>`});
 $(id).innerHTML=svg+'</svg>';wireTips($(id));
}
function selectedGarminRuns(){const setting=$('garmin-setting').value;return G.activities.filter(r=>r.sport==='running'&&r.sub_sport===setting)}
function garminTrend(){
 const key=$('garmin-metric').value,label=$('garmin-metric').selectedOptions[0].text;
 const a=selectedGarminRuns().filter(r=>r[key]!=null&&Number.isFinite(r[key])),groups=new Map();
 a.forEach(r=>{const m=r.date.slice(0,7);if(!groups.has(m))groups.set(m,[]);groups.get(m).push(r[key])});
 garminPlot('garmin-trend',[...groups].sort().map(([m,values])=>({date:m+'-01',value:median(values),n:values.length})),label);
 $('garmin-context').innerHTML=`<p class="caption"><b>${fmt(a.length)} runs with this metric.</b> Each point is a monthly median of activity averages; runs have equal weight. Pace, incline, sensor and workout mix can change the trend.</p><p class="caption"><b>Running economy:</b> no dedicated economy field was found in this export. The available mechanics and power describe how the run was recorded, but they are not a direct oxygen-cost measurement. Do not force a lower contact time, cadence, or vertical ratio simply to improve a number.</p>`;
}

const paceBands=[[0,210,'Under 3:30','<3:30'],[210,225,'3:30–3:45','3:30'],[225,240,'3:45–4:00','3:45'],[240,255,'4:00–4:15','4:00'],[255,270,'4:15–4:30','4:15'],[270,300,'4:30–5:00','4:30'],[300,330,'5:00–5:30','5:00'],[330,360,'5:30–6:00','5:30'],[360,Infinity,'6:00 or slower','6:00+']];
function paceGroups(runs){return paceBands.map(([lo,hi,label,short])=>({label,short,runs:runs.filter(r=>r.pace_s>=lo&&r.pace_s<hi)})).filter(g=>g.runs.length)}
function mechanicsByPace(){
 const runs=selectedGarminRuns().filter(r=>r.pace_s>0&&r.pace_s<900),groups=paceGroups(runs),key=$('pace-mechanics-metric').value,[label,,decimals]=metricInfo[key];
 const points=groups.map(g=>({label:g.label,short:g.short,n:g.runs.filter(r=>r[key]!=null).length,value:median(g.runs.map(r=>r[key]))})).filter(g=>g.n>=5&&g.value!=null);
 categoryPlot('pace-mechanics-chart',points,label,decimals);
 const fields=[['cadence_spm','Cadence'],['step_length_m','Stride'],['ground_contact_ms','Contact'],['vertical_ratio_pct','Vertical ratio']];
 $('pace-mechanics-table').innerHTML='<table><thead><tr><th>Pace /km</th><th>Runs</th>'+fields.map(([,l])=>`<th>${l}</th>`).join('')+'</tr></thead><tbody>'+groups.filter(g=>g.runs.length>=5).map(g=>`<tr><td>${g.label}</td><td>${g.runs.length}</td>${fields.map(([k])=>{const v=median(g.runs.map(r=>r[k])),d=metricInfo[k][2],u=metricInfo[k][1];return `<td>${v==null?'—':fmt(v,d)+' '+u}</td>`}).join('')}</tr>`).join('')+'</tbody></table>';
 const measured=points.reduce((n,p)=>n+p.n,0),warning=$('garmin-setting').value==='treadmill'?' Treadmill pace and distance depend on watch calibration, so compare treadmill bands cautiously.':'';
 const faster=runs.filter(r=>r.pace_s>=225&&r.pace_s<255),easier=runs.filter(r=>r.pace_s>=270&&r.pace_s<330),fc=median(faster.map(r=>r.cadence_spm)),ec=median(easier.map(r=>r.cadence_spm)),fs=median(faster.map(r=>r.step_length_m)),es=median(easier.map(r=>r.step_length_m)),fg=median(faster.map(r=>r.ground_contact_ms)),eg=median(easier.map(r=>r.ground_contact_ms));
 const personal=faster.length>=20&&easier.length>=20&&fc&&ec&&fs&&es?`<p class="caption"><b>Your 3:45–4:15 versus 4:30–5:30 pattern:</b> median cadence changes by ${signed(fc-ec,1)} steps/min, stride length by ${signed(delta(es,fs),1)}%, and ground contact by ${signed(delta(eg,fg),1)}%. In these activity groups, the larger pace separation appears in stride length while cadence stays comparatively stable. This is a descriptive pattern, not a cue to overstride.${fg==null||eg==null?' Ground-contact coverage is incomplete in these groups.':''}</p>`:'';
 $('pace-mechanics-summary').innerHTML=`<p class="caption"><b>${fmt(measured)} measured runs across ${points.length} pace bands for ${label.toLowerCase()}.</b> Faster pace normally changes cadence, stride length and contact time together. This view controls one major confounder by grouping similar activity-average pace, but it does not control hills, intervals, fatigue, shoes or weather.${warning}</p>${personal}`;
}

function yearlyMechanics(){
 const groups=new Map();selectedGarminRuns().forEach(r=>{const y=r.date.slice(0,4);if(!groups.has(y))groups.set(y,[]);groups.get(y).push(r)});
 const years=[...groups].sort().map(([year,runs])=>({year,runs,pace:median(runs.map(r=>r.pace_s)),cadence:median(runs.map(r=>r.cadence_spm)),stride:median(runs.map(r=>r.step_length_m)),ground:median(runs.map(r=>r.ground_contact_ms)),ratio:median(runs.map(r=>r.vertical_ratio_pct))}));
 $('year-mechanics').innerHTML='<table><thead><tr><th>Year</th><th>Runs</th><th>Median pace</th><th>Cadence</th><th>Stride</th><th>Contact</th><th>Vertical ratio</th></tr></thead><tbody>'+years.map(y=>`<tr><td><b>${y.year}</b></td><td>${y.runs.length}</td><td>${pace(y.pace)} /km</td><td>${fmt(y.cadence,1)}</td><td>${fmt(y.stride,2)} m</td><td>${fmt(y.ground,1)} ms</td><td>${fmt(y.ratio,2)}%</td></tr>`).join('')+'</tbody></table>';
 $('year-mechanics-summary').innerHTML='<p class="caption">Each cell is a median of activity averages and may reflect the year’s workout mix. Compare the pace column first: a mechanics change alongside a pace change is not automatically a form improvement or decline.</p>';
}

const durabilityFields=[['cadence_spm','Cadence','spm',1],['step_length_m','Stride length','%',1],['ground_contact_ms','Ground contact','%',1],['vertical_ratio_pct','Vertical ratio','%',1]];
function runDelta(r,key,asPercent=true){const a=r['reference_'+key],b=r['late_'+key];return asPercent?delta(a,b):(a!=null&&b!=null?b-a:null)}
function durability(){
 const setting=$('garmin-setting').value,minKm=+$('durability-distance').value,runs=(G.durability||[]).filter(r=>r.sub_sport===setting&&r.activity_distance_m>=minKm*1000);
 $('durability-summary').innerHTML=durabilityFields.map(([key,label,unit,decimals])=>{const vals=runs.map(r=>runDelta(r,key,key!=='cadence_spm')).filter(Number.isFinite),v=median(vals);return `<div class="insight"><span class="eyebrow">${label} change</span><span class="number">${v==null?'—':signed(v,decimals)} ${unit}</span><p>Median late-minus-reference change · ${vals.length} runs</p></div>`}).join('');
 const recent=[...runs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
 $('durability-table').innerHTML=recent.length?'<table><thead><tr><th>Date</th><th>Run</th><th>Distance</th><th>Cadence Δ</th><th>Stride Δ</th><th>Contact Δ</th><th>Vertical ratio Δ</th><th></th></tr></thead><tbody>'+recent.map(r=>`<tr><td>${r.date}</td><td>${esc(r.name)}</td><td>${fmt(r.activity_distance_m/1000,1)} km</td><td>${signed(runDelta(r,'cadence_spm',false),1)} spm</td><td>${signed(runDelta(r,'step_length_m'),1)}%</td><td>${signed(runDelta(r,'ground_contact_ms'),1)}%</td><td>${signed(runDelta(r,'vertical_ratio_pct'),1)}%</td><td><button class="quiet" data-id="${esc(r.id)}">Inspect</button></td></tr>`).join('')+'</tbody></table>':'<div class="empty">No qualifying long runs with original dynamics samples.</div>';
 $('durability-table').querySelectorAll('button').forEach(b=>b.onclick=()=>selectRun(b.dataset.id,true));
 $('durability-context').innerHTML=`<p class="caption"><b>${runs.length} ${minKm} km+ runs qualify.</b> Each run contributes one change value, so long recordings do not dominate. A shorter stride or longer contact time late in a run describes the recorded pattern; it does not by itself prove fatigue. Pace, hills, wind, stops and workout design can create the same pattern. The first quarter is excluded to reduce warm-up effects, and the final 2% is excluded to reduce finish-line stopping artefacts.</p>`;
}
function renderGarminAnalyses(){garminTrend();mechanicsByPace();yearlyMechanics();durability()}

function wellness(){
 const key=$('wellness-metric').value,label=$('wellness-metric').selectedOptions[0].text,period=$('wellness-period').value,latest=G.days.at(-1)?.date;if(!latest)return;
 let from=new Date(latest+'T00:00:00Z');if(period!=='all')from.setUTCDate(from.getUTCDate()-Number(period)+1);else from=new Date('1900-01-01T00:00:00Z');
 const a=G.days.filter(r=>r.date>=from.toISOString().slice(0,10)&&r[key]!=null).map(r=>({date:r.date,value:key==='sleep_seconds'?r[key]/3600:r[key]}));garminPlot('wellness-chart',a,label);
 const cut=new Date(latest+'T00:00:00Z');cut.setUTCDate(cut.getUTCDate()-6);const recent=G.days.filter(r=>r.date>=cut.toISOString().slice(0,10)&&r[key]!=null).map(r=>key==='sleep_seconds'?r[key]/3600:r[key]);
 const prevStart=new Date(cut);prevStart.setUTCDate(prevStart.getUTCDate()-28);const prior=G.days.filter(r=>r.date>=prevStart.toISOString().slice(0,10)&&r.date<cut.toISOString().slice(0,10)&&r[key]!=null).map(r=>key==='sleep_seconds'?r[key]/3600:r[key]);
 $('wellness-summary').innerHTML=`<p class="caption">Data through <b>${latest}</b>. In the displayed period: ${a.length} measured days. Latest seven-calendar-day median: <b>${fmt(median(recent),1)}</b> (${recent.length} measured days); preceding 28-day median: <b>${fmt(median(prior),1)}</b> (${prior.length} measured days). Readiness uses the latest exported measurement for each day, which may be after a workout rather than in the morning.</p>`;
}
window.renderGarminDetail=id=>{
 const r=G.activities.find(r=>r.id===id);if(!r){$('garmin-detail').innerHTML='<p class="caption">No Garmin summary matched to this activity.</p>';return}
 const fields=[['ground_contact_ms','Ground contact','ms'],['vertical_oscillation_mm','Vertical oscillation','mm'],['vertical_ratio_pct','Vertical ratio','%'],['step_length_m','Stride length','m'],['cadence_spm','Cadence','steps/min'],['avg_power_w','Power','W'],['vo2max_ml_kg_min','VO₂ max estimate','mL/kg/min'],['aerobic_training_effect','Aerobic effect','/5'],['anaerobic_training_effect','Anaerobic effect','/5'],['training_load','Activity load','']];
 $('garmin-detail').innerHTML=fields.filter(([k])=>r[k]!=null).map(([k,l,u])=>`<div class="insight"><span class="eyebrow">${l}</span><span class="number">${fmt(r[k],k==='step_length_m'?2:1)} ${u}</span><p>Garmin activity ${esc(r.garmin_activity_id)}</p></div>`).join('');
};
function marathonDynamics(){
 const fields=[['cadence_spm','Cadence · steps/min'],['step_length_m','Stride length · m'],['ground_contact_ms','Ground contact · ms'],['vertical_ratio_pct','Vertical ratio · %'],['vertical_oscillation_mm','Vertical oscillation · mm'],['power_w','Power · W'],['hr_bpm','Heart rate · bpm']],phases=[...G.marathon_dynamics].sort((a,b)=>a.segment==='5–30 km'?-1:b.segment==='5–30 km'?1:0),early=phases.find(p=>p.segment==='5–30 km'),late=phases.find(p=>p.segment==='33 km to finish');
 const finding=early&&late?`<p class="caption"><b>Observed pattern:</b> cadence changed from ${fmt(early.cadence_spm,1)} to ${fmt(late.cadence_spm,1)} steps/min; stride length from ${fmt(early.step_length_m,2)} to ${fmt(late.step_length_m,2)} m; ground contact from ${fmt(early.ground_contact_ms,1)} to ${fmt(late.ground_contact_ms,1)} ms. Recorded power changed from ${fmt(early.power_w,0)} to ${fmt(late.power_w,0)} W. The slower pace therefore did not coincide with a large cadence drop or lower recorded power.</p>`:'';
 $('garmin-marathon').innerHTML='<h3>Toronto 2026: mechanics after 33 km</h3><p class="caption">Sample-weighted means from the original marathon recording. These show co-occurring changes, not why pace changed.</p><div class="table-wrap"><table><thead><tr><th>Metric</th>'+phases.map(p=>`<th>${esc(p.segment)}</th>`).join('')+'</tr></thead><tbody>'+fields.map(([k,l])=>'<tr><td>'+l+'</td>'+phases.map(p=>`<td>${fmt(p[k],k==='step_length_m'?2:1)}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>'+finding+'<p class="caption">Training direction: compare mechanics at similar speed and terrain before changing technique. If a late pace drop coincides with shorter strides, examine durability, fueling and conditions; cadence alone is not a diagnosis.</p>';
}
window.renderGarminAnalyses=renderGarminAnalyses;if(G){$('garmin-setting').onchange=()=>{renderGarminAnalyses();$('garmin-scope').textContent='Full history · '+$('garmin-setting').selectedOptions[0].text};$('garmin-metric').onchange=garminTrend;$('pace-mechanics-metric').onchange=mechanicsByPace;$('durability-distance').onchange=durability;['wellness-metric','wellness-period'].forEach(id=>$(id).onchange=wellness);renderGarminAnalyses();wellness();marathonDynamics();if(activeId)window.renderGarminDetail(activeId)}
