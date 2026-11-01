// Dashboard summaries use reliable measurements; original recordings remain available.
(() => {
 const data=window.RUNNING_DATA;
 if(data) data.activities=data.activities.map(a=>a.sub_sport==='treadmill'?{...a,distance_m:null,pace_s:null,avg_hr_bpm:null}:a);
 if(window.GARMIN_DATA){window.GARMIN_DATA.activities=window.GARMIN_DATA.activities.map(a=>a.sub_sport==='treadmill'?{...a,distance_m:null,pace_s:null,avg_hr_bpm:null}:a);window.GARMIN_DATA.durability=window.GARMIN_DATA.durability.filter(a=>a.sub_sport!=='treadmill');}
 const globalStatus=document.getElementById('global-status');
 const date=data?.activities.reduce((m,a)=>a.date>m?a.date:m,'')||'—';
 let currentState=null;
 const render=()=>{
  const t=(en,zh)=>window.dashboardLanguage==='zh-CN'?zh:en;
  globalStatus.textContent=t('Published data through ','已发布数据截至 ')+date+(currentState?.syncedAt?' · '+t('Last sync ','最近同步 ')+new Date(currentState.syncedAt).toLocaleString():'' )+(currentState?.unpublished?' · '+t('Unpublished updates','有待发布更新'):'');
 };
 render();document.addEventListener('dashboardlanguagechange',render);
 async function refresh(){
  try {
   const r=await fetch('/api/app-status',{cache:'no-store'});if(!r.ok)return;
   const state=await r.json();
   document.getElementById('global-account').textContent=state.owner?'Owner account':'Owner sign in';
   document.getElementById('global-publish').hidden=!state.unpublished;
   currentState=state;render();
  }catch{}
 }
 refresh();window.addEventListener('focus',refresh);
})();
