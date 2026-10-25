'use strict';
let language=localStorage.getItem('running-admin-language')||'zh',csrf='',state=null,busy=false;
const $=id=>document.getElementById(id),t=(zh,en)=>language==='zh'?zh:en;
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function translate(){document.documentElement.lang=language==='zh'?'zh-CN':'en';document.querySelectorAll('[data-zh]').forEach(el=>el.textContent=el.dataset[language]);$('language').textContent=t('English','中文');if(state)render(state);}
async function api(path,body){const options={credentials:'same-origin'};if(body!==undefined){options.method='POST';options.headers={'Content-Type':'application/json','X-CSRF-Token':csrf};options.body=JSON.stringify(body);}const response=await fetch(path,options);const result=await response.json();if(!response.ok)throw new Error(result.error||response.status);return result;}
function render(data){
 state=data;csrf=data.csrf;$('locked').hidden=true;$('workspace').hidden=false;
 for(const name of ['garmin','strava'])$(name+'-state').textContent=data.connected[name]?t('已连接','Connected'):t('未连接','Not connected');
 document.querySelectorAll('form button').forEach(el=>el.disabled=busy||data.job.running);
 $('sync').disabled=busy||data.job.running||!Object.values(data.connected).some(Boolean);
 $('publish').disabled=busy||data.job.running||!data.latest?.validated;
 $('latest').textContent=data.latest?t('上次成功同步：','Last successful sync: ')+new Date(data.latest.completed_utc).toLocaleString(language==='zh'?'zh-CN':'en-CA'):t('尚未进行 API 同步。现有数据已保留。','No API sync yet. Existing data is preserved.');
 $('log').textContent=data.job.log.join('\n');
 const summary=data.job.result?.run_id?data.job.result:data.latest;$('summary').replaceChildren();
 if(summary)for(const [key,zh,en] of [['added','新增活动','New activities'],['enriched','补全活动','Enriched activities'],['skipped','跳过已有记录','Existing records skipped'],['review','待检查重叠记录','Overlaps needing review'],['wellness','新增或补全恢复记录','Recovery records added/enriched']]){const label=document.createElement('dt'),value=document.createElement('dd');label.textContent=t(zh,en);value.textContent=summary[key]??0;$('summary').append(label,value);}
 if(data.job.error)notice(data.job.error,true);
 else if(data.job.running)notice(t('正在处理，请保持此服务运行。','Working. Keep the local service running.'));
 else if(data.job.result?.pushed)notice(t('已推送到 GitHub。Vercel 正在部署，请稍后查看线上仪表盘。','Pushed to GitHub. Vercel deployment has been triggered; check the live dashboard shortly.'));
 else if(data.job.result?.validated)notice(t('同步完成，验证通过。可以发布仪表盘。','Sync complete and validated. Ready to publish.'));
}
async function refresh(){try{render(await api('/api/status'));}catch(e){if(state)notice(e.message,true);}}
async function action(fn){busy=true;if(state)render(state);try{await fn();await refresh();}catch(e){notice(e.message,true);}finally{busy=false;if(state){$('sync').disabled=state.job.running||!Object.values(state.connected).some(Boolean);$('publish').disabled=state.job.running||!state.latest?.validated;document.querySelectorAll('form button').forEach(el=>el.disabled=state.job.running);}}}
$('language').onclick=()=>{language=language==='zh'?'en':'zh';localStorage.setItem('running-admin-language',language);translate();};
$('garmin-form').onsubmit=e=>{e.preventDefault();action(async()=>{const key=$('garmin-key').value;$('garmin-key').value='';await api('/api/connect/garmin',{key});notice(t('Garmin 已连接。','Garmin connected.'));});};
$('strava-form').onsubmit=e=>{e.preventDefault();action(async()=>{const body={client_id:$('client-id').value,client_secret:$('client-secret').value};$('client-secret').value='';const result=await api('/api/connect/strava',body);location.assign(result.url);});};
$('sync').onclick=()=>action(()=>api('/api/sync',{}));
$('publish').onclick=()=>action(()=>api('/api/publish',{}));
async function unlockFromFragment(){const fragment=new URLSearchParams(location.hash.slice(1)),key=fragment.get('key');history.replaceState(null,'','/');if(key){try{await api('/api/unlock',{key});}catch(e){notice(e.message,true);}}await refresh();}
window.addEventListener('hashchange',unlockFromFragment);
(async()=>{translate();await unlockFromFragment();setInterval(refresh,3000);})();
