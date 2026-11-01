const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('dashboard/weekly-review.js','utf8'),context);
const calculate=context.window.WeeklyReview.calculate;
const workout=(id,setting,distance,status='planned')=>({id,setting,distance,status,type:'running',title:'Long run'});
const fixture={days:[{workouts:[workout('road','road',20),workout('tm','treadmill',999),workout('skip','road',10,'skipped')]}],activities:[{sport:'running',setting:'road',distance_m:8000,workoutId:'road'},{sport:'running',setting:'treadmill',distance_m:999999,moving_s:1800,workoutId:'tm'}],coverage:'2026-10-31',currentDate:'2026-10-31',previousWeeks:[20,30,40,50]};
test('weekly distance excludes treadmill and skipped targets; duration and linked sessions retained',()=>{
 const m=calculate(fixture);assert.equal(m.goal,20);assert.equal(m.distance,8);assert.equal(m.minutes,30);assert.equal(m.percent,40);assert.equal(m.completed,2);assert.equal(m.skipped,1);assert.equal(m.baseline,35);assert.equal(m.stale,false);
});
test('explicit goals, overachievement and zero goals remain meaningful',()=>{
 const m=calculate({...fixture,target:5});assert.equal(m.percent,160);assert.equal(m.remaining,0);
 assert.equal(calculate({...fixture,target:0}).percent,null);
});
test('stale coverage is flagged and partial sessions are not marked complete by a link',()=>{
 const m=calculate({...fixture,coverage:'2026-10-30',days:[{workouts:[workout('road','road',null,'partial')]}]});assert.equal(m.stale,true);assert.equal(m.partial,1);assert.equal(m.completed,0);assert.equal(m.missing,1);
});
