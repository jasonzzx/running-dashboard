// Render both independently authored reports from the same evidence as the UI.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dashboard/',import.meta.url));
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{value:'road',innerHTML:'',setAttribute(){},querySelectorAll(){return []}});return elements.get(id);}
const context=vm.createContext({window:{},document:{addEventListener(){}},$:element,esc:escape,
 fmt:(x,n=0)=>x==null||!Number.isFinite(+x)?'—':(+x).toLocaleString('en-CA',{minimumFractionDigits:n,maximumFractionDigits:n}),
 pace:x=>x==null||!Number.isFinite(x)||x<=0?'—':Math.floor(Math.round(x)/60)+':'+String(Math.round(x)%60).padStart(2,'0')});
for(const file of ['analysis-data.js','analysis-en.js','analysis-zh.js','analysis.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
for(const language of ['en','zh-CN']){
 context.window.dashboardLanguage=language;
 vm.runInContext('renderAnalysis()',context);
 const body=['summary','history','recent','hr','late','garmin','plan','methods'].map(key=>'<section class="panel">'+element('analysis-'+key).innerHTML+'</section>').join('\n')
   .replace(/<button[^>]*>([\s\S]*?)<\/button>/g,'<span>$1</span>').replace(/href="reports\//g,'href="');
 const en=language==='en',title=en?'Running analysis — English':'跑步训练分析 — 中文';
 const html=`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="../style.css"><style>body{display:block}main{margin:0 auto;max-width:1200px;padding:24px}.panel{margin-bottom:24px}td{white-space:normal}p{max-width:95ch}@media print{a{color:inherit}.table-wrap{overflow:visible}.panel{break-inside:auto}}</style></head><body><main><p><a href="../#analysis">${en?'Back to dashboard':'返回仪表盘'}</a> · ${en?'Full report · road/outdoor evidence, with all-setting comparisons labelled':'完整报告 · 公路 / 户外场景，跨场景对比另行标注'}</p>${body}</main></body></html>`;
 fs.writeFileSync(path.join(root,'reports','analysis-'+(en?'en':'zh')+'.html'),html);
}
console.log('Built independent English and Chinese analysis reports.');
