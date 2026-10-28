export function validPlan(data){
 if(!data||data.version!==2||!data.days||!data.targets||!data.links||!data.placements||Array.isArray(data.days)||Array.isArray(data.targets)||Array.isArray(data.links)||Array.isArray(data.placements))return false;
 if(Object.keys(data.days).length>1500||Object.keys(data.targets).length>400||Object.keys(data.links).length>10000)return false;
 const date=/^\d{4}-\d{2}-\d{2}$/;const ids=new Set();
 for(const [day,slots] of Object.entries(data.days)){
  if(!date.test(day)||!slots||typeof slots!=='object'||Array.isArray(slots))return false;
  for(const slot of ['am','pm']){
   if(!Array.isArray(slots[slot])||slots[slot].length>8)return false;
   for(const w of slots[slot]){
    if(!w||typeof w.id!=='string'||w.id.length>100||typeof w.title!=='string'||w.title.length>100||!w.title.trim()||typeof w.pace!=='string'||w.pace.length>120||typeof w.notes!=='string'||w.notes.length>800||!['running','cross-training','rest'].includes(w.type)||!['road','treadmill','track','trail','other'].includes(w.setting)||!['planned','completed','partial','skipped'].includes(w.status))return false;
    if(!w.id||ids.has(w.id))return false;ids.add(w.id);
    for(const k of ['distance','duration'])if(w[k]!==null&&(typeof w[k]!=='number'||!Number.isFinite(w[k])||w[k]<0||w[k]>10000))return false;
   }
  }
 }
 for(const [day,target] of Object.entries(data.targets)){if(!date.test(day)||!target||typeof target!=='object'||typeof target.focus!=='string'||target.focus.length>200)return false;for(const k of ['distance','duration'])if(target[k]!==null&&(typeof target[k]!=='number'||!Number.isFinite(target[k])||target[k]<0||target[k]>10000))return false;}
 for(const [id,p] of Object.entries(data.placements))if(id.length>150||!p||!date.test(p.date)||!['am','pm'].includes(p.slot))return false;
 for(const [id,link] of Object.entries(data.links))if(id.length>150||typeof link!=='string'||link.length>100)return false;
 return true;
}
