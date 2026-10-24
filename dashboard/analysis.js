'use strict';
function analysisView(language) {
 const A=window.TRAINING_ANALYSIS,d=A.deep,k=$('analysis-setting').value,c=A.cohorts[k];
 const names=language==='en'?{road:'Road / outdoor',treadmill:'Treadmill',track:'Track',trail:'Trail',other:'Other / unclassified'}:{road:'公路 / 户外',treadmill:'跑步机',track:'跑道',trail:'越野',other:'其他 / 未分类'};
 const ratio=(x,y)=>y?100*(x/y-1):null;
 const race=d.marathon,early=race?.segments.find(s=>s.start_km===5&&s.end_km===30),late=race?.segments.find(s=>s.start_km===33);
 const mapped={road:'generic',treadmill:'treadmill',track:'track',trail:'trail'}[k];
 const longs=A.long.filter(r=>mapped?r.setting===mapped:!['generic','treadmill','track','trail'].includes(r.setting));
 const matched=c.matched,baseWeeks=race?.pre_weeks.slice(2)||[],baseWeek=baseWeeks.reduce((a,b)=>a+b.km,0)/(baseWeeks.length||1);
 return {A,d,k,c,name:names[k],names,n:fmt,pc:pace,pct:x=>x==null?'—':(x>0?'+':'')+fmt(x,1)+'%',range:r=>r.start+' → '+r.end,
  race,early,late,longs,baseWeek,taper:race?.pre_weeks[0],sensitivity:race?.segments.find(s=>s.start_km===10&&s.end_km===30),
  elapsed:race?Math.floor(race.elapsed_s/3600)+':'+String(Math.floor(race.elapsed_s%3600/60)).padStart(2,'0')+':'+String(Math.round(race.elapsed_s%60)).padStart(2,'0'):'—',
  lateCost:race?(late.pace-early.pace)*(late.end_km-33):null,change:race?ratio(late.pace,early.pace):null,
  allChange:ratio(d.blocks[0].km,d.blocks[1].km),roadShare:d.blocks[0].km?100*A.cohorts.road.blocks[0].km/d.blocks[0].km:0,prevShare:d.blocks[1].km?100*A.cohorts.road.blocks[1].km/d.blocks[1].km:0,
  matched,hrDelta:matched.every(r=>r.hr!=null)?matched[0].hr-matched[1].hr:null,hrPaceDelta:matched.every(r=>r.pace!=null)?matched[0].pace-matched[1].pace:null,
  intervalHours:c.intervals.bins.reduce((a,b)=>a+b.seconds,0)/3600,w0:A.garmin.wellness[0].metrics,w1:A.garmin.wellness[1].metrics,mech:A.garmin.mechanics[k]};
}
function renderAnalysis(){
 const language=window.dashboardLanguage==='en'?'en':'zh-CN',en=language==='en',v=analysisView(language),{A,d,c}=v;
 const report=(en?window.analysisEnglish:window.analysisChinese)(v);
 const t=(a,b)=>en?a:b, p=x=>x?'<p>'+esc(x)+'</p>':'', ps=arr=>arr.map(p).join('');
 const tbl=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const panel=(key,html)=>{const el=$('analysis-'+key);el.setAttribute('data-i18n-managed','true');el.innerHTML='<h3>'+esc(report.headings[key])+'</h3>'+html;};
 const inspect=r=>'<button class="quiet" data-analysis-id="'+esc(r.id)+'">'+esc(r.date+' · '+r.name)+' ↗</button>';
 const unit=t('km','公里'),speed=x=>pace(x)+' /'+unit;
 const raw=x=>x==null?'—':fmt(x,1);
 $('analysis-date').textContent=A.as_of;
 panel('summary','<span class="badge">'+t('EVIDENCE REVIEW · ','数据复盘 · ')+A.as_of+'</span><h2>'+esc(report.title)+'</h2>'+p(report.subtitle)+'<p><a href="reports/analysis-zh.html" target="_blank" rel="noopener">'+t('Open Chinese report','打开中文独立报告')+'</a> · <a href="reports/analysis-en.html" target="_blank" rel="noopener">'+t('Open English report','打开英文独立报告')+'</a></p>'+ps(report.summary));
 panel('history',ps(report.history)+tbl([t('Year · selected setting','年份 · 所选场景'),t('Runs','次数'),t('Distance','距离'),t('Running days','跑步天数'),t('Moving pace','移动配速')],c.annual.map(r=>[r.year,r.n,fmt(r.km,1)+' '+unit,r.days,speed(r.pace)]))+'<h4>'+t('Same-date comparison · all running','同期对比 · 全部跑步')+'</h4>'+tbl([t('Window','窗口'),t('Total km','总公里数'),t('Road km','公路公里数'),t('Treadmill km','跑步机公里数'),t('Running days','跑步天数')],d.ytd.map(r=>[v.range(r),fmt(r.km,1),fmt(r.road_km,1),fmt(r.treadmill_km,1),r.days])));
 const bands=c.intervals.bins,total=bands.reduce((a,b)=>a+b.seconds,0);
 panel('recent',ps(report.recent)+tbl([t('28 days · selected setting','28 天 · 所选场景'),t('Runs / days','次数 / 天数'),t('km/week','公里/周'),t('Moving pace','移动配速'),t('30 km+','30 公里以上')],c.blocks.map(r=>[v.range(r),r.n+' / '+r.days,fmt(r.weekly_km,1),speed(r.pace),r.long30]))+'<h4>'+t('Twelve seven-day windows · all running','十二个 7 天窗口 · 全部跑步')+'</h4>'+tbl([t('Window','窗口'),unit,t('Runs / days','次数 / 天数'),t('Multiple-run days','多次跑步的天数'),t('Longest km','最长距离（公里）')],d.weekly.map(r=>[v.range(r),fmt(r.km,1),r.n+' / '+r.days,r.double_days,fmt(r.longest_km,1)]))+(v.k==='treadmill'?'':'<h4>'+t('84-day recorded pace bands · selected setting','84 天记录配速区间 · 所选场景')+'</h4>'+tbl([t('Pace /km','配速 /公里'),t('Hours','小时'),t('Time share','时间占比'),unit],bands.map((b,i)=>[i===0?'<3:00':i===11?'≥8:00':pace(180+(i-1)*30)+'–'+pace(180+i*30),fmt(b.seconds/3600,2),total?fmt(100*b.seconds/total,1)+'%':'—',fmt(b.metres/1000,2)]))));
 panel('hr',ps(report.hr)+tbl([t('42-day window','42 天窗口'),t('Runs','次数'),t('Median pace','配速中位数'),t('Median HR','心率中位数'),t('HR IQR','心率四分位区间'),t('HR range','心率范围')],c.matched.map(r=>[v.range(r),r.n,speed(r.pace),raw(r.hr),r.hr_iqr?r.hr_iqr.map(raw).join('–'):'—',r.hr_range?r.hr_range.map(raw).join('–'):'—'])));
 const metrics=[['hr',t('HR','心率')],['cadence',t('Cadence','步频')],['stride',t('Stride','步幅')],['contact',t('Contact','触地时间')],['power',t('Power','功率')]];
 panel('late',ps(report.late)+(v.race?'<h4>'+t('Marathon segments · mean (valid sample count)','马拉松分段 · 均值（有效采样数）')+'</h4>'+tbl([t('Recorded km','记录距离（公里）'),t('Elapsed pace','经过时间配速'),...metrics.map(([,l])=>l)],v.race.segments.map(r=>[fmt(r.start_km,0)+'–'+fmt(r.end_km,2),speed(r.pace),...metrics.map(([key])=>fmt(r.metrics[key].mean,key==='stride'?2:1)+' ('+r.metrics[key].n+')')])):'')+'<h4>'+t('Long efforts · selected setting','长距离活动 · 所选场景')+'</h4>'+tbl([t('Activity','活动'),unit,'5–30 '+unit,'33 '+unit+' → '+t('finish','终点'),t('Change','变化')],v.longs.map(r=>[inspect(r),fmt(r.km,2),speed(r.baseline),speed(r.late),v.pct(r.change)])));
 const wellness=[['sleep_hours',t('Sleep · h','睡眠 · 小时')],['sleep_score',t('Sleep score','睡眠评分')],['resting_hr_bpm',t('Resting HR · bpm','静息心率 · 次/分钟')],['hrv_weekly_average_ms',t('Weekly-average HRV · ms','每周平均 HRV · 毫秒')],['readiness_score',t('Readiness','准备度')],['acute_load',t('Acute load','急性负荷')]];
 const value=m=>raw(m.median)+' ('+m.n+')';
 panel('garmin',ps(report.garmin)+tbl([t('Metric · median (measured dates)','指标 · 中位数（测量天数）'),v.range(A.garmin.wellness[0]),v.range(A.garmin.wellness[1])],wellness.map(([key,label])=>[label,value(v.w0[key]),value(v.w1[key])]))+tbl([t('Mechanics · median (runs)','跑姿 · 中位数（次数）'),v.range(v.mech[0]),v.range(v.mech[1])],[['cadence_spm',t('Cadence · steps/min','步频 · 步/分钟')],['step_length_m',t('Stride · m','步幅 · 米')],['ground_contact_ms',t('Contact · ms','触地时间 · 毫秒')],['vertical_ratio_pct',t('Vertical ratio · %','垂直比 · %')]].map(([key,label])=>[label,...v.mech.map(m=>fmt(m.metrics[key].median,key==='step_length_m'?2:1)+' ('+m.metrics[key].n+')')])));
 panel('plan','<div class="training-phases">'+report.plan.map(([h,body])=>'<article><h4>'+esc(h)+'</h4>'+p(body)+'</article>').join('')+'</div>');
 panel('methods',ps(report.methods)+'<h4>'+t('Recent evidence · selected setting','近期证据 · 所选场景')+'</h4>'+c.evidence.map(r=>p('')+'<p>'+inspect(r)+' · '+fmt(r.km,2)+' '+unit+'</p>').join('')+'<h4>'+t('Matched cohort IDs','匹配组活动 ID')+'</h4>'+c.matched.map(r=>p(v.range(r)+': '+(r.ids.join(', ')||t('None','无')))).join('')+'<h4>'+t('Guidance sources','建议参考来源')+'</h4><p>[1] <a href="https://www.uclahealth.org/news/article/sports-medicine-guide-marathon-recovery" target="_blank" rel="noopener">'+t('UCLA Health: marathon recovery','UCLA Health：马拉松赛后恢复')+'</a><br>[2] <a href="https://www.ausport.gov.au/ais/nutrition/supplements/group_a/sports-foods2/sports-drink/how-and-when-do-i-use-it" target="_blank" rel="noopener">'+t('Australian Sports Commission / AIS: carbohydrate guidance','澳大利亚体育委员会 / AIS：碳水化合物指南')+'</a></p>'+p(t('Sources reviewed for this revision. Training experiments are proposals, not an individually tested prescription.','本次更新已复核参考来源。训练实验属于建议，并非经过个人测试的处方。')));
 $('analysis').querySelectorAll('[data-analysis-id]').forEach(b=>b.onclick=()=>selectRun(b.dataset.analysisId,true));
}
$('analysis-setting').onchange=()=>{renderAnalysis();$('analysis-scope').textContent='Full history · '+window.dashboardOptionText($('analysis-setting'));};
window.renderAnalysis=renderAnalysis;
document.addEventListener('dashboardlanguagechange',renderAnalysis);
renderAnalysis();
