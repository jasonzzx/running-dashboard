(() => {
  'use strict';
  const start = '2026-10-26', race = '2027-04-24';
  const DAY = 86400000;
  const parse = s => new Date(s + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  // Outdoor distances are explicit session targets; treadmill doubles are time-based.
  // Each weekly configuration: recovery day, aerobic day, long run (km), PM minutes.
  const weeks = [
    [0,0,0,0],[5,6,9,0],[6,8,12,0],[6,8,15,20],[7,9,18,25],[7,10,20,25],
    [6,8,16,20],[8,11,22,25],[8,12,24,30],[8,12,26,30],[7,9,20,20],
    [8,12,25,30],[9,13,27,30],[9,13,28,30],[7,10,22,25],[9,13,28,30],
    [9,14,30,35],[9,14,30,35],[7,10,23,25],[9,14,30,35],[9,14,32,35],
    [7,10,24,25],[9,12,30,30],[7,10,22,25],[6,8,16,20],[0,0,0,0]
  ];
  const easy='4:45–5:25/km · conversational';
  const recovery='5:05–5:45/km · very easy';
  const steady='4:15–4:30/km · controlled';
  const threshold='3:42–3:52/km · controlled, reassess by effort';
  const marathon='3:51–3:58/km · controlled, goal is 3:51/km';
  function run(title,distance,duration,pace,notes,setting='road'){
    return {title,type:'running',setting,distance,duration,pace,notes,status:'planned'};
  }
  function treadmill(minutes){return run('Easy second run',null,minutes,'4:45–5:30/km only on a trusted treadmill display; otherwise easy effort',`${minutes} minutes comfortable. Watch treadmill distance, pace and heart rate are unreliable; do not use them to judge this session. Skip or shorten the double if fatigue is elevated.`,'treadmill');}
  function plannedDay(date){
    if(date<start||date>race)return {am:[],pm:[],phase:''};
    const diff=Math.floor((parse(date)-parse(start))/DAY),week=Math.floor(diff/7),dow=diff%7;
    if(date===race)return {am:[run('London Marathon',42.195,162.5,'3:51/km average · 2:42:30 goal','Start controlled; adjust for weather, course and current fitness. Execute a practiced fueling and hydration plan.')],pm:[],phase:'Race week'};
    if(week===0){const mins=[20,25,30,25,30,30,35][dow];return {am:[run('Post-marathon recovery',Math.round(mins/5.4*2)/2,mins,recovery,`${mins} minutes very easy, approximately ${Math.round(mins/5.4*2)/2} km. Time and comfort take priority over distance. Run only if soreness is resolving and your gait is normal; walk or take recovery instead if not ready.`)],pm:[],phase:'Post-marathon recovery'};}
    if(week===25){const mins=[30,35,30,30,20,0,0][dow];const title=dow===3?'Race-pace tune-up':dow===4?'Easy shakeout':'Easy taper run';const notes=dow===3?'10 min easy, 2 × 4 min at goal pace with 2 min easy jog, then 10 min easy. Keep the effort relaxed.':`${mins} minutes very easy; prioritize sleep, travel and fueling. Scale back if tired.`;return {am:[run(title,Math.round(mins/5.4*2)/2,mins,dow===3?marathon:recovery,notes+' Distance is approximate; time and effort take priority.')],pm:[],phase:'Race week'};}
    const [rec,aerobic,longRun,pmMinutes]=weeks[week];
    const cutback=[6,10,14,18,21,23].includes(week),early=week<=3,specific=week>=11;
    let am;
    if(dow===0)am=run('Recovery run',rec,null,recovery,`${rec} km very easy after the long run. Keep it relaxed; replace with a gentle walk if sore.`);
    if(dow===1){
      if(early)am=run('Easy run + relaxed strides',aerobic,null,easy,`${aerobic} km easy. Once fully recovered, finish with 4 × 20-second relaxed strides and full walking recovery.`);
      else {const total=aerobic+(week>=23?2:4);const reps=cutback||week>=23?'3 × 5 min':week<11?'4 × 5 min':week<19?'3 × 8 min':'3 × 10 min';am=run('Threshold intervals',total,null,threshold,`${total} km total including 2–3 km warm-up and cool-down. ${reps} controlled threshold with 2 min easy jog between. Shorten repetitions if form or effort deteriorates.`);}
    }
    if(dow===2)am=run('Aerobic easy run',aerobic,null,easy,`${aerobic} km easy. Optional light strength or mobility later if recovered.`);
    if(dow===3){
      if(early)am=run('Easy aerobic run',aerobic,null,easy,`${aerobic} km easy and conversational.`);
      else if(cutback||!specific){const total=aerobic+2;am=run('Steady aerobic run',total,null,steady,`${total} km total. Run 3 km easy, then ${cutback?'3':'5'} km steady; finish easy. Steady is controlled, not threshold.`);}
      else {const total=aerobic+5;const reps=week<15?'2 × 3 km':week<19?'2 × 4 km':week<22?'3 × 3 km':'2 × 2 km';am=run('Marathon-pace intervals',total,null,marathon,`${total} km total, including easy warm-up and cool-down. Run ${reps} at controlled marathon effort with 1 km easy between. Goal pace is provisional; adjust by effort.`);}
    }
    if(dow===4)am=run('Recovery run',rec,null,recovery,`${rec} km very easy. Keep this a light day; stop or walk if pain changes your gait.`);
    if(dow===5)am=run('Easy run + strides',aerobic,null,easy,`${aerobic} km easy; optionally add 4 × 20-second relaxed strides with full recovery. Keep legs fresh for tomorrow.`);
    if(dow===6){let note=`${longRun} km comfortable. Practice race fueling and hydration; finish at easy effort.`;if(specific&&!cutback&&week<=22)note=`${longRun} km total: start easy and include the final ${week<16?'4':'6'} km at controlled steady effort (about 4:15–4:30/km), only when feeling good. Practice fueling and hydration; drop the faster finish if fatigued.`;am=run('Long run',longRun,null,easy,note);}
    let pm=[];
    if(pmMinutes&&[1,3,5].includes(dow)&&week<24)pm=[treadmill(pmMinutes)];
    const phase=week<4?'Recovery and return':week<11?'Aerobic base':week<22?'Marathon-specific build':'Taper';
    return {am:[am],pm,phase};
  }
  const calendar=document.getElementById('plan-calendar'), sidebar=document.getElementById('plan-sidebar'), label=document.getElementById('plan-month'), status=document.getElementById('plan-status'), editor=document.getElementById('plan-editor');
  const id = x => document.getElementById(x);
  const key='london-2027-calendar-v2', legacy='london-2027-calendar-v1';
  const empty=()=>({version:2,days:{},targets:{},links:{},placements:{}});
  const dateOf=d=>iso(d), add=(d,n)=>new Date(d.getTime()+n*DAY), monday=d=>add(d,-((d.getUTCDay()+6)%7));
  const localToday=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return parse(`${p.year}-${p.month}-${p.day}`);};
  const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}), dateCache=new Map();
  let cursor=monday(localToday()), mode='week', plan=empty(), activities=[], revision=0, connected=false, conflict=false, current=null, saving=false, needsSave=false, legacyAvailable=false, syncState=null;
  const uid=()=>globalThis.crypto?.randomUUID?.() || `w-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function normalize(w,idValue){return {id:idValue||uid(),title:String(w.title||'Workout'),type:w.type||(/rest|walk/i.test(w.title||'')?'rest':'running'),setting:w.setting||'road',distance:w.distance??null,duration:w.duration??null,pace:String(w.pace||''),notes:String(w.notes||''),status:w.status||'planned'};}
  function defaults(date){const day=plannedDay(date);return {am:day.am.map((w,i)=>normalize(w,i===0?`default:${date}`:`default:${date}:${i}`)),pm:day.pm.map((w,i)=>normalize(w,`default:${date}:pm:${i}`))};}
  function slots(date){return plan.days[date]||defaults(date);}
  function editable(date){if(!plan.days[date])plan.days[date]=defaults(date);return plan.days[date];}
  function saveLocal(){try{localStorage.setItem(key,JSON.stringify(plan));}catch{status.textContent='Browser storage is unavailable; export your plan to avoid losing changes.';}}
  function update(){saveLocal();render();if(connected&&!conflict){needsSave=true;flush();}else if(conflict)status.textContent='Cloud conflict: export your edits, then reload to review the cloud version.';else status.textContent='Saved on this device only. Sign in to save across devices.';}
  async function flush(){if(saving||!needsSave||!connected||conflict)return;saving=true;needsSave=false;status.textContent='Saving to cloud…';const sent=JSON.stringify({revision,plan});try{const r=await fetch('/api/training-plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:sent});const body=await r.json();if(r.status===409){conflict=true;status.textContent='Cloud conflict: export your edits, then reload to review the cloud version.';}else if(!r.ok){status.textContent=body.error||'Cloud save failed. Your edits remain on this device.';needsSave=true;}else{revision=body.revision;status.textContent='Saved to cloud and this device.';}}catch{status.textContent='Cloud save failed. Your edits remain on this device.';needsSave=true;}finally{saving=false;if(needsSave&&!conflict&&status.textContent==='Saved to cloud and this device.')flush();}}
  function dateInfo(a){
    if(plan.placements[a.activity_key])return plan.placements[a.activity_key];
    if(!a.start_utc)return null;const d=new Date(a.start_utc);if(Number.isNaN(d.valueOf()))return null;
    if(dateCache.has(a.activity_key))return dateCache.get(a.activity_key);const p=Object.fromEntries(dateFormatter.formatToParts(d).map(x=>[x.type,x.value]));const result={date:`${p.year}-${p.month}-${p.day}`,slot:Number(p.hour)<12?'am':'pm'};dateCache.set(a.activity_key,result);return result;
  }
  function actualSetting(a){return ({generic:'road',treadmill:'treadmill',track:'track',trail:'trail'})[a.sub_sport]||'other';}
  function matching(a,date,slot){const s=actualSetting(a);return slots(date)[slot].filter(w=>w.type===(a.sport==='running'?'running':'cross-training')&&w.setting===s&&w.status!=='skipped');}
  function safeText(tag,text,cls){const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=text;return e;}
  function button(text,action,cls='quiet'){const b=safeText('button',text,cls);b.type='button';b.addEventListener('click',action);return b;}
  function actualFor(date,slot){return activities.filter(a=>{const p=dateInfo(a);return p&&p.date===date&&p.slot===slot;});}
  const torontoTime=value=>new Date(value).toLocaleString('en-CA',{timeZone:'America/Toronto',dateStyle:'medium',timeStyle:'short'})+' Toronto';
  function actualCard(a,date,slot){
   const box=document.createElement('div');box.className='actual-card';const tm=actualSetting(a)==='treadmill', duration=(a.moving_s||a.elapsed_s||0)/60;
   const details=[tm?'Treadmill · distance / pace / HR excluded':Number.isFinite(a.distance_m)?(a.distance_m/1000).toFixed(1)+' km':'Distance unavailable',duration?Math.round(duration)+' min':null];
   if(!tm){const pace=Number(a.avg_pace_s_km);if(pace>0&&Number.isFinite(pace)){const seconds=Math.round(pace);details.push(`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}/km`);}if(Number(a.avg_hr_bpm)>0)details.push(`${Math.round(a.avg_hr_bpm)} bpm avg HR`);}
   box.append(safeText('strong','✓ '+(a.name||a.sport)),safeText('span',details.filter(Boolean).join(' · ')));
   if(a.start_utc&&!Number.isNaN(new Date(a.start_utc).valueOf()))box.append(safeText('small',torontoTime(a.start_utc)));
   const select=document.createElement('select');select.setAttribute('aria-label',`Link ${a.name||'activity'} to a workout`);
   const opts=[['','Unplanned / not linked'],...['am','pm'].flatMap(s=>slots(date)[s].map(w=>[w.id,`${s.toUpperCase()} · ${w.title}`]))];
   for(const [value,text] of opts){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}select.value=plan.links[a.activity_key]||'';
   select.addEventListener('change',()=>{plan.links[a.activity_key]=select.value;update();});box.append(select);
   box.append(button('Change date / AM–PM',()=>{const value=prompt('Enter date and slot, for example 2027-01-05 PM',`${date} ${slot.toUpperCase()}`);if(value===null)return;const m=value.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(AM|PM)$/i);if(!m||Number.isNaN(parse(m[1]).valueOf())||dateOf(parse(m[1]))!==m[1]){status.textContent='Use a valid date and AM or PM.';return;}plan.placements[a.activity_key]={date:m[1],slot:m[2].toLowerCase()};plan.links[a.activity_key]='';update();},'add-workout'));
   if(!plan.links[a.activity_key]){const candidates=matching(a,date,slot);if(candidates.length===1)box.append(safeText('small',`Suggested: ${candidates[0].title} (${slot.toUpperCase()}); select to confirm.`));}
   return box;
  }
  function workoutCard(w,date,slot){const b=button('',()=>open(date,slot,w.id),'workout-card');b.append(safeText('strong',w.title),safeText('span',[w.distance!==null?`${w.distance} km`:null,w.duration!==null?`${w.duration} min`:null,w.pace||null].filter(Boolean).join(' · ')||'No target set'),safeText('small',`${w.setting} · ${w.status}`));return b;}
  function dayCard(date,compact=false){
   const card=document.createElement('article');card.className='plan-day'+(date===race?' race-day':'')+(date===dateOf(localToday())?' today-day':'');if(date===dateOf(localToday()))card.setAttribute('aria-current','date');const d=parse(date);
   card.append(safeText('h3',d.toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'})+(date===dateOf(localToday())?' · TODAY':'')));
   const planned=[...slots(date).am,...slots(date).pm].filter(w=>w.type==='running'&&w.status!=='skipped'&&w.setting!=='treadmill'&&Number.isFinite(w.distance)).reduce((sum,w)=>sum+w.distance,0);
   const completed=['am','pm'].flatMap(slot=>actualFor(date,slot)).filter(a=>a.sport==='running'&&['road','track','trail'].includes(actualSetting(a))&&Number.isFinite(a.distance_m)).reduce((sum,a)=>sum+a.distance_m/1000,0);
   if(planned>0){const progress=document.createElement('div');progress.className='day-progress';const pct=Math.round(completed/planned*100);progress.append(safeText('span',connected?`${completed.toFixed(1)} / ${planned.toFixed(1)} km · ${pct}%`:`${planned.toFixed(1)} km planned · sign in for progress`));if(connected){const bar=document.createElement('progress');bar.max=planned;bar.value=Math.min(completed,planned);bar.setAttribute('aria-label',`Daily outdoor running distance: ${pct}% complete`);progress.append(bar);}card.append(progress);}
   for(const slot of ['am','pm']){const part=document.createElement('div');part.className='plan-slot';part.append(safeText('div',slot.toUpperCase(),'slot-label'));for(const w of slots(date)[slot])part.append(workoutCard(w,date,slot));for(const a of actualFor(date,slot))part.append(actualCard(a,date,slot));part.append(button('+ Add',()=>open(date,slot),'add-workout'));card.append(part);}return card;
  }
  function metrics(startDate,endDate){let scheduled=0,plannedTreadmill=0,unknown=0,minutes=0,noDuration=0,runs=0,quality=0,longest=0,completed=0,completedMin=0,treadMin=0,crossMin=0;
   for(let d=startDate;d<endDate;d=add(d,1))for(const w of [...slots(dateOf(d)).am,...slots(dateOf(d)).pm]){if(w.type==='running'&&w.status!=='skipped'){runs++;if(w.distance!==null){scheduled+=w.distance;if(w.setting==='treadmill')plannedTreadmill+=w.distance;longest=Math.max(longest,w.distance);}else unknown++;minutes+=w.duration||0;if(w.duration===null)noDuration++;if(/interval|threshold|tempo|marathon.pace/i.test(w.title))quality++;}}
   for(const a of activities){const p=dateInfo(a);if(!p||p.date<dateOf(startDate)||p.date>=dateOf(endDate))continue;const min=(a.moving_s||a.elapsed_s||0)/60;if(a.sport!=='running'){crossMin+=min;continue;}completedMin+=min;if(actualSetting(a)==='treadmill'){treadMin+=min;continue;}if(actualSetting(a)==='other'){continue;}completed+=(a.distance_m||0)/1000;}
   return {scheduled,plannedTreadmill,unknown,minutes,noDuration,runs,quality,longest,completed,completedMin,treadMin,crossMin};
  }
  function summary(startDate,endDate,title,showTarget){
   const m=metrics(startDate,endDate),box=document.createElement('section');box.className='summary-card';
   box.append(safeText('p',title,'eyebrow'));
   const volume=document.createElement('div');volume.className='planned-volume';
   volume.append(safeText('span','PLANNED DISTANCE','mini-label'),safeText('strong',m.scheduled===0&&m.unknown?'Not set':`${m.scheduled.toFixed(1)} km`));
   if(m.unknown)volume.append(safeText('small',`${m.unknown} ${m.unknown===1?'run has':'runs have'} no distance target; their kilometres are not estimated.`));
   box.append(volume);
   if(showTarget){
    const suggested=(()=>{let distance=0,hasDistance=false,duration=0,hasDuration=false,missingDuration=false;for(let d=startDate;d<endDate;d=add(d,1)){const day=plannedDay(dateOf(d));for(const w of [...day.am,...day.pm]){if(w.setting!=='treadmill'&&w.distance!==null){distance+=w.distance;hasDistance=true;}if(w.duration!==null){duration+=w.duration;hasDuration=true;}else missingDuration=true;}}return {distance:hasDistance?Number(distance.toFixed(1)):null,duration:hasDuration&&!missingDuration?duration:null,focus:plannedDay(dateOf(startDate)).phase};})();
    const target=plan.targets[dateOf(startDate)]||suggested;
    if(target.distance!==null)box.append(safeText('p',`Weekly target: ${target.distance.toFixed(1)} km · planned difference ${(m.scheduled-target.distance).toFixed(1)} km`),safeText('p',connected?`Completed remaining: ${Math.max(0,target.distance-m.completed).toFixed(1)} km (excludes treadmill)`:'Completed remaining: sign in to load activities'));
    if(target.focus)box.append(safeText('p',`Focus: ${target.focus}`));
    const details=document.createElement('details');details.className='target-editor';details.append(safeText('summary','Edit weekly targets'));
    for(const [field,text] of [['distance','Weekly distance target · km'],['duration','Weekly duration target · min']]){
     const l=safeText('label',text);const input=document.createElement('input');input.type='number';input.min='0';input.max='10000';input.step='0.1';input.value=target[field]??'';input.placeholder='Optional';input.addEventListener('change',()=>{const value=input.value===''?null:Number(input.value);if(value!==null&&(!Number.isFinite(value)||value<0||value>10000))return;target[field]=value;plan.targets[dateOf(startDate)]=target;update();});l.append(input);details.append(l);
    }
    const focus=safeText('label','Phase / focus');const field=document.createElement('input');field.value=target.focus;field.maxLength=200;field.placeholder='e.g. Base, recovery';field.addEventListener('change',()=>{target.focus=field.value;plan.targets[dateOf(startDate)]=target;update();});focus.append(field);details.append(focus);box.append(details);
   }
   box.append(safeText('p',connected?`Completed known outdoor: ${m.completed.toFixed(1)} km · ${Math.round(m.completedMin)} min running`:'Completed activities: sign in to load'),safeText('p',`Planned: ${Math.round(m.minutes)} min${m.noDuration?` + ${m.noDuration} without duration`:''} · ${m.runs} runs · ${m.quality} quality`),safeText('p',`Planned treadmill target: ${m.plannedTreadmill.toFixed(1)} km`),safeText('p',`Longest planned: ${m.longest?m.longest+' km':'not set'}`),safeText('p',connected?`Treadmill: ${Math.round(m.treadMin)} min completed`:'Treadmill: activity data unavailable'),safeText('p',connected?`Cross-training: ${Math.round(m.crossMin)} min completed`:'Cross-training: activity data unavailable'));return box;
  }
  function render(){
   calendar.replaceChildren();sidebar.replaceChildren();id('plan-week').setAttribute('aria-pressed',String(mode==='week'));id('plan-month-view').setAttribute('aria-pressed',String(mode==='month'));
   if(mode==='week'){
    const end=add(cursor,14);label.textContent=`${cursor.toLocaleDateString('en-CA',{month:'short',day:'numeric',timeZone:'UTC'})} – ${add(end,-1).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}`;
    for(let week=0;week<2;week++){const startDate=add(cursor,week*7),section=document.createElement('section');section.className='calendar-week';section.append(safeText('h3',dateOf(cursor)===dateOf(monday(localToday()))?(week===0?'This week':'Next week'):`Week of ${dateOf(startDate)}`));const grid=document.createElement('div');grid.className='week-grid';for(let n=0;n<7;n++)grid.append(dayCard(dateOf(add(startDate,n))));section.append(grid);calendar.append(section);sidebar.append(summary(startDate,add(startDate,7),week===0?'WEEK 1':'WEEK 2',true));}
   }else{
    const first=new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth(),1)),end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,1));label.textContent=first.toLocaleDateString('en-CA',{month:'long',year:'numeric',timeZone:'UTC'});const days=document.createElement('div');days.className='calendar-weekdays';for(const name of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])days.append(safeText('span',name));calendar.append(days);const grid=document.createElement('div');grid.className='month-grid';const firstCell=monday(first);for(let n=0;n<42;n++){const day=add(firstCell,n),card=dayCard(dateOf(day),true);if(day.getUTCMonth()!==first.getUTCMonth())card.classList.add('other-month');grid.append(card);}calendar.append(grid);sidebar.append(summary(first,end,'MONTH TOTAL',false));
   }
  }
  function open(date,slot,workoutId){current={date,slot,id:workoutId||null};const w=workoutId?slots(date)[slot].find(x=>x.id===workoutId):normalize({},null);id('plan-edit-date').textContent=`${date} · ${slot.toUpperCase()}`;id('plan-title').value=workoutId?w.title:'';id('plan-type').value=w.type;id('plan-setting').value=w.setting;id('plan-distance').value=w.distance??'';id('plan-duration').value=w.duration??'';id('plan-pace').value=w.pace;id('plan-notes').value=w.notes;id('plan-workout-status').value=w.status;id('plan-delete').hidden=!workoutId;id('plan-copy').hidden=!workoutId;id('plan-move').hidden=!workoutId;editor.showModal();}
  function readForm(){const number=x=>id(x).value===''?null:Number(id(x).value);return {id:current.id||uid(),title:id('plan-title').value.trim(),type:id('plan-type').value,setting:id('plan-setting').value,distance:number('plan-distance'),duration:number('plan-duration'),pace:id('plan-pace').value.trim(),notes:id('plan-notes').value.trim(),status:id('plan-workout-status').value};}
  id('plan-form').addEventListener('submit',e=>{e.preventDefault();const w=readForm();if(!w.title)return;const list=editable(current.date)[current.slot],i=list.findIndex(x=>x.id===w.id);if(i<0){if(list.length>=8){status.textContent='A slot can contain at most eight workouts.';return;}list.push(w);}else list[i]=w;editor.close();update();});
  id('plan-delete').addEventListener('click',()=>{const list=editable(current.date)[current.slot],i=list.findIndex(w=>w.id===current.id);if(i>=0)list.splice(i,1);for(const [a,w] of Object.entries(plan.links))if(w===current.id)delete plan.links[a];editor.close();update();});
  function relocate(move){const destination=prompt('Enter destination date and slot, for example 2027-01-05 PM',`${current.date} ${current.slot.toUpperCase()}`);if(destination===null)return;const m=destination.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(AM|PM)$/i);if(!m||Number.isNaN(parse(m[1]).valueOf())||dateOf(parse(m[1]))!==m[1]){status.textContent='Use a valid date and AM or PM.';return;}const target=editable(m[1])[m[2].toLowerCase()];if(target.length>=8){status.textContent='Destination slot is full.';return;}const w=readForm();if(!w.title)return;if(move){const from=editable(current.date)[current.slot],i=from.findIndex(x=>x.id===current.id);if(i>=0)from.splice(i,1);}else w.id=uid();target.push(w);editor.close();update();}
  id('plan-copy').addEventListener('click',()=>relocate(false));id('plan-move').addEventListener('click',()=>relocate(true));id('plan-cancel').addEventListener('click',()=>editor.close());
  id('plan-prev').addEventListener('click',()=>{cursor=mode==='week'?add(cursor,-14):new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()-1,1));render();});id('plan-next').addEventListener('click',()=>{cursor=mode==='week'?add(cursor,14):new Date(Date.UTC(cursor.getUTCFullYear(),cursor.getUTCMonth()+1,1));render();});id('plan-today').addEventListener('click',()=>{cursor=mode==='week'?monday(localToday()):localToday();render();});id('plan-week').addEventListener('click',()=>{mode='week';cursor=monday(cursor);render();});id('plan-month-view').addEventListener('click',()=>{mode='month';render();});
  id('plan-export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='london-plan-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  function upgrade(data){data.placements ||= {};for(const [day,t] of Object.entries(data.targets||{}))if(t===null||typeof t==='number')data.targets[day]={distance:t,duration:null,focus:''};return data;}
  function migrateLegacy(old){const result=empty();for(const [date,w] of Object.entries(old||{})){if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&w&&typeof w.title==='string')result.days[date]={am:[normalize(w,`legacy:${date}`)],pm:[]};}return result;}
  id('plan-export-local').addEventListener('click',()=>{const backup=localStorage.getItem(key+'-recovered');if(!backup){status.textContent='No preserved local backup was found.';return;}const url=URL.createObjectURL(new Blob([backup],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='london-plan-local-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  id('plan-import-local').addEventListener('click',()=>{try{const old=JSON.parse(localStorage.getItem(key+'-recovered')||'null');if(!old?.days)throw Error();let added=0,skipped=0;for(const [date,day] of Object.entries(old.days)){if(plan.days[date])skipped++;else{plan.days[date]=day;added++;}}for(const [week,value] of Object.entries(old.targets||{}))if(!(week in plan.targets))plan.targets[week]=value;update();status.textContent=`Imported ${added} days; ${skipped} conflicting days remain in the local backup.`;if(!skipped){id('plan-import-local').hidden=true;id('plan-export-local').hidden=true;}}catch{status.textContent='No preserved local edits were found.';}});
  id('plan-import-button').addEventListener('click',()=>id('plan-import').click());
  id('plan-import').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file||file.size>500000)throw Error();let data=JSON.parse(await file.text());if(data.version===1&&data.edits)data=migrateLegacy(data.edits);if(data.version!==2||!data.days||!data.targets||!data.links)throw Error();data=upgrade(data);if(!confirm('Import this backup and replace the current plan on this device and in the cloud?'))return;plan=data;update();}catch{status.textContent='Could not import this backup.';}finally{e.target.value='';}});
  function autoMatch(){let changed=false;const groups=new Map();for(const a of activities){if(a.sport!=='running'||actualSetting(a)==='other'||Object.hasOwn(plan.links,a.activity_key))continue;const p=dateInfo(a);if(!p)continue;const k=p.date+'|'+p.slot+'|'+actualSetting(a);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a);}for(const list of groups.values()){if(list.length!==1)continue;const a=list[0],p=dateInfo(a),candidates=matching(a,p.date,p.slot).filter(w=>!Object.values(plan.links).includes(w.id));if(candidates.length===1){plan.links[a.activity_key]=candidates[0].id;changed=true;}}return changed;}
  async function loadCloud(){try{const r=await fetch('/api/training-plan');const body=await r.json();if(!r.ok)throw Error(body.error);const previous=plan;plan=upgrade(body.plan);revision=body.revision;activities=body.activities;syncState=body.sync;connected=true;conflict=false;id('plan-last-sync').textContent=syncState?.updated_at?'Last accepted Garmin sync: '+torontoTime(syncState.updated_at)+'.':'Last accepted Garmin sync: no dated sync available.';
    if(!Object.keys(plan.days).length&&!Object.keys(plan.targets).length&&Object.keys(previous.days).length){plan.days=previous.days;plan.targets=previous.targets;plan.links={...plan.links,...previous.links};plan.placements={...plan.placements,...previous.placements};update();}else if(Object.keys(previous.days).length && JSON.stringify(previous)!==JSON.stringify(plan)){try{localStorage.setItem(key+'-recovered',JSON.stringify(previous));}catch{}status.textContent='Cloud plan loaded. Previous local edits were preserved separately; use Import local edits to merge missing days.';id('plan-import-local').hidden=false;id('plan-export-local').hidden=false;}else status.textContent=`Cloud plan loaded. ${syncState?.updated_at?'Garmin snapshot accepted '+torontoTime(syncState.updated_at)+'.':'Garmin snapshot date unavailable.'}`;if(autoMatch()){saveLocal();needsSave=true;flush();}else saveLocal();render();return true;
   }catch(e){connected=false;status.textContent=e.message||'Cloud unavailable; changes stay on this device.';render();return false;}}
  id('plan-sync').addEventListener('click',async()=>{if(saving||needsSave||conflict){status.textContent='Resolve or finish saving your plan before syncing Garmin.';return;}const b=id('plan-sync');b.disabled=true;try{status.textContent='Starting Garmin sync…';const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync'})});const data=await r.json();if(!r.ok)throw Error(data.error||'Sync could not start.');if(data.resumed)status.textContent='Following the existing Garmin sync…';for(let attempt=0;attempt<120;attempt++){await new Promise(resolve=>setTimeout(resolve,3000));const res=await fetch('/api/admin');const state=await res.json();if(!res.ok)throw Error(state.error||'Unable to check sync.');const job=state.jobs.find(j=>j.id===data.id);if(job?.status==='ready'||job?.status==='published'){if(saving||needsSave||conflict){status.textContent='Garmin sync completed. Finish saving your plan, then reload to see the new activities.';return;}if(await loadCloud())status.textContent='Garmin sync complete; calendar uses the accepted snapshot. Publishing the public dashboard is separate.';return;}if(job?.status==='failed')throw Error('Garmin sync failed. The previous snapshot is unchanged.');status.textContent=job?.error?'Garmin sync is retrying after a failed attempt…':`Garmin sync: ${job?.status||'queued'}…`;}status.textContent='Sync is still running. Check Admin or return later.';}catch(e){status.textContent=e.message||'Garmin sync failed.';}finally{b.disabled=false;}});
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.version===2)plan=upgrade(saved);else{const old=JSON.parse(localStorage.getItem(legacy)||'{}');plan=migrateLegacy(old);legacyAvailable=Object.keys(plan.days).length>0;}}catch{status.textContent='Could not read previous browser edits.';}
  render();loadCloud();
})();
