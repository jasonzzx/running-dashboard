const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.value='';this.textContent='';this.hidden=false;this.className='';this.attributes={};this.classList={add:()=>{}};}
 append(...items){this.children.push(...items)} replaceChildren(...items){this.children=items} setAttribute(k,v){this.attributes[k]=v} addEventListener(k,v){this.listeners[k]=v} showModal(){} close(){} click(){this.listeners.click?.({currentTarget:this,target:this})}
}
const names=['plan-calendar','plan-sidebar','plan-month','plan-last-sync','plan-status','plan-editor','plan-week','plan-month-view','plan-edit-date','plan-title','plan-type','plan-setting','plan-distance','plan-duration','plan-pace','plan-notes','plan-workout-status','plan-delete','plan-copy','plan-move','plan-form','plan-cancel','plan-prev','plan-next','plan-today','plan-export','plan-import','plan-import-button','plan-import-local','plan-export-local','plan-sync'];
const elements=Object.fromEntries(names.map(n=>[n,new Element()]));
const store=new Map();const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
class FixedDate extends Date{constructor(...a){super(...(a.length?a:['2026-10-27T12:00:00Z']))}static now(){return new Date('2026-10-27T12:00:00Z').getTime()}}
const fixture={version:2,days:{'2026-10-27':{am:[{id:'am1',title:'Road easy',type:'running',setting:'road',distance:10,duration:50,pace:'5:00/km',notes:'',status:'planned'}],pm:[{id:'pm1',title:'Treadmill',type:'running',setting:'treadmill',distance:5,duration:30,pace:'effort',notes:'',status:'planned'}]}},targets:{},links:{},placements:{}};
const activities=[{activity_key:'strava:1',sport:'running',sub_sport:'generic',start_utc:'2026-10-27T13:00:00Z',distance_m:8000,moving_s:2400,pace_s:300,avg_hr_bpm:145,name:'Road run'}, {activity_key:'strava:2',sport:'running',sub_sport:'treadmill',start_utc:'2026-10-27T22:00:00Z',distance_m:99999,moving_s:1800,name:'Treadmill run'}];
let saved;const fetch=async(url,options)=>{if(options?.method==='PUT'){saved=JSON.parse(options.body);return {ok:true,json:async()=>({revision:2})}}return {ok:true,json:async()=>({plan:fixture,revision:1,activities,sync:null})}};
const context={document:{getElementById:n=>elements[n],createElement:tag=>new Element(tag)},localStorage,fetch,Intl,Date:FixedDate,Map,Set,Object,JSON,Number,String,Math,Blob,URL,crypto:{randomUUID:()=>Math.random().toString()},setTimeout,clearTimeout,prompt:()=>null,confirm:()=>true};context.globalThis=context;context.window=context;
const source=fs.readFileSync('dashboard/plan-calendar.js','utf8').replace('  const calendar=', '  globalThis.__planTest={plannedDay};\n  const calendar=');
vm.runInNewContext(source,context);
const flatten=e=>[e.textContent,...e.children.flatMap(flatten)].join(' ');
setTimeout(()=>{try{
 assert.equal(context.__planTest.plannedDay('2026-10-27').am[0].distance,4.5);const start=new Date('2026-10-27T00:00:00Z');for(let n=0;n<=179;n++){const date=new Date(start.getTime()+n*86400000).toISOString().slice(0,10);const day=context.__planTest.plannedDay(date);assert(day.am.length>0,`Missing workout on ${date}`);for(const w of [...day.am,...day.pm]){assert(w.pace,`Missing pace guidance on ${date}`);assert(w.type!=='rest',`Rest day on ${date}`);if(w.setting==='treadmill')assert.equal(w.distance,null);}}const race=context.__planTest.plannedDay('2027-04-24').am[0];assert.equal(race.distance,42.195);assert.match(race.pace,/3:51/);
 const descendants=e=>[e,...e.children.flatMap(descendants)];assert(descendants(elements['plan-calendar']).some(e=>e.attributes['aria-current']==='date'&&e.className.includes('today-day')));
 const text=flatten(elements['plan-sidebar']);assert.match(text,/PLANNED DISTANCE 46\.0 km/);assert.match(text,/Completed known outdoor: 8\.0 km/);assert.match(text,/Treadmill: 30 min completed/);assert.doesNotMatch(text,/99\.9 km/);
 const body=flatten(elements['plan-calendar']);assert.match(body,/This week/);assert.match(body,/Next week/);assert.match(body,/Road run/);assert.match(body,/Treadmill run/);assert.match(body,/8\.0 \/ 10\.0 km · 80%/);assert.match(body,/5:00\/km · 145 bpm avg HR/);assert.match(body,/Toronto/);assert(descendants(elements['plan-calendar']).some(e=>e.tag==='progress'&&e.value===8&&e.max===10));
 assert.equal(saved.plan.links['strava:1'],'am1');assert.equal(saved.plan.links['strava:2'],'pm1');
 elements['plan-month-view'].click();assert.match(flatten(elements['plan-calendar']),/Mon/);assert.match(flatten(elements['plan-sidebar']),/MONTH TOTAL/);
 console.log('PASS: full daily London plan, today highlight, two calendar views, AM/PM linking and treadmill exclusion');
 }catch(e){console.error(e);process.exitCode=1}},50);

// When the owner-only API is unavailable, retain the published snapshot and explain its age.
const fallbackElements=Object.fromEntries(names.map(n=>[n,new Element()]));
const fallbackContext={document:{getElementById:n=>fallbackElements[n],createElement:tag=>new Element(tag)},localStorage:{getItem:()=>null,setItem:()=>{}},fetch:async()=>({ok:false,json:async()=>({error:'Sign in as owner to save and sync across devices.'})}),Intl,Date:FixedDate,Map,Set,Object,JSON,Number,String,Math,Blob,URL,crypto:{randomUUID:()=>Math.random().toString()},setTimeout,clearTimeout,prompt:()=>null,confirm:()=>true,RUNNING_DATA:{activities}};
fallbackContext.globalThis=fallbackContext;fallbackContext.window=fallbackContext;
vm.runInNewContext(source,fallbackContext);
setTimeout(()=>{try{
 assert.match(flatten(fallbackElements['plan-calendar']),/Road run/);
 assert.match(flatten(fallbackElements['plan-calendar']),/5:00\/km · 145 bpm avg HR/);
 assert.match(fallbackElements['plan-status'].textContent,/published dashboard snapshot.*older/);
 assert.match(fallbackElements['plan-last-sync'].textContent,/sign in/i);
 console.log('PASS: published activity fallback and source notice when cloud access fails');
}catch(e){console.error(e);process.exitCode=1}},50);
