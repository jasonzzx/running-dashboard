/* Weekly totals use canonical activities and Toronto calendar placements supplied by Plan. */
(() => {
 function calculate({days,activities,target,coverage,currentDate,previousWeeks=[]}) {
  const workouts=days.flatMap(d=>d.workouts).filter(w=>w.type==='running');
  const scheduled=workouts.filter(w=>w.status!=='skipped');
  const outdoor=scheduled.filter(w=>['road','track','trail'].includes(w.setting));
  const planned=outdoor.reduce((s,w)=>s+(Number.isFinite(w.distance)?w.distance:0),0);
  const goal=Number.isFinite(target)&&target>=0?target:planned;
  const known=activities.filter(a=>a.sport==='running'&&['road','track','trail'].includes(a.setting)&&Number.isFinite(a.distance_m));
  const distance=known.reduce((s,a)=>s+a.distance_m/1000,0);
  const minutes=activities.filter(a=>a.sport==='running'&&a.setting==='treadmill').reduce((s,a)=>s+(a.moving_s||a.elapsed_s||0)/60,0);
  const linked=new Set(activities.map(a=>a.workoutId).filter(Boolean));
  const completed=scheduled.filter(w=>w.status==='completed'||(w.status!=='partial'&&linked.has(w.id))).length;
  const partial=scheduled.filter(w=>w.status==='partial').length;
  const key=scheduled.filter(w=>/interval|threshold|tempo|marathon.pace|long run/i.test(w.title));
  const keyDone=key.filter(w=>w.status==='completed'||(w.status!=='partial'&&linked.has(w.id))).length;
  const baseline=previousWeeks.length===4?previousWeeks.reduce((s,x)=>s+x,0)/4:null;
  const stale=!coverage||coverage<currentDate;
  return {goal,distance,minutes,completed,partial,total:scheduled.length,skipped:workouts.filter(w=>w.status==='skipped').length,
   keyDone,keyTotal:key.length,missing:outdoor.filter(w=>!Number.isFinite(w.distance)).length,
   percent:goal>0?distance/goal*100:null,remaining:Math.max(0,goal-distance),longest:Math.max(0,...known.map(a=>a.distance_m/1000)),baseline,stale};
 }
 window.WeeklyReview={calculate};
})();
