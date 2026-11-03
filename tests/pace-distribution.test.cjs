const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(exact = true) {
  const elements = Object.fromEntries(['pace-range','pace-custom','pace-custom-label','pace-range-status','pace-time','pace-distance','pace-coverage'].map(id=>[id,{value:id==='pace-custom'?'7':'5',setAttribute(){}}]));
  const data = {run:[[-1,3,0],[1,10,50]]};
  if(exact)data._intervals={run:[[179,1,5],[180,2,10],[184.99,3,15],[185,4,20],[479,5,25],[480,6,30]]};
  const context = {window:{PACE_DISTRIBUTION:data},$:id=>elements[id],pace:String,sum:(rows,key)=>rows.reduce((n,r)=>n+r[key],0),fmt:(n,d=0)=>n.toLocaleString('en-CA',{minimumFractionDigits:d,maximumFractionDigits:d}),esc:String,wireTips(){}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('dashboard/pace.js','utf8'),context);
  const render=()=>context.renderPaceDistribution([{activity_key:'run',sport:'running'}, {activity_key:'run',sport:'running',sub_sport:'treadmill'}]);
  return {elements,render};
}
test('all widths preserve totals and exclude treadmill; boundaries use lower-inclusive bins',()=>{
  const {elements:e,render}=setup();
  for(const width of ['5','10','30','60','custom']){
    e['pace-range'].value=width;render();
    assert.match(e['pace-coverage'].textContent,/1 of 1 eligible/);
    assert.match(e['pace-coverage'].textContent,/0.11 km included/);
  }
  e['pace-range'].value='5';render();
  assert.match(e['pace-distance'].innerHTML,/3:00–3:05 min\/km: 0.03 km/);
  assert.match(e['pace-distance'].innerHTML,/3:05–3:10 min\/km: 0.02 km/);
});
test('custom rejects empty, zero, negative and nonfinite input and recovers',()=>{
 const {elements:e,render}=setup();e['pace-range'].value='custom';
 for(const value of ['', '0', '-1', 'Infinity']){e['pace-custom'].value=value;render();assert.match(e['pace-range-status'].textContent,/positive/);assert.equal(e['pace-time'].innerHTML,'');}
 e['pace-custom'].value='7.5';render();assert.equal(e['pace-range-status'].textContent,'');assert.match(e['pace-time'].innerHTML,/3:00–3:07.5/);
});
test('legacy snapshot never invents finer intervals',()=>{
 const {elements:e,render}=setup(false);render();assert.match(e['pace-range-status'].textContent,/Rebuild or sync/);
 e['pace-range'].value='30';render();assert.equal(e['pace-range-status'].textContent,'');assert.match(e['pace-coverage'].textContent,/1 of 1 eligible/);
});
