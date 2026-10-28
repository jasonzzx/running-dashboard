import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validPlan} from '../lib/plan-validation.mjs';
const example=()=>({version:2,days:{'2027-04-01':{am:[{id:'one',title:'Easy',type:'running',setting:'treadmill',distance:8,duration:45,pace:'easy',notes:'',status:'planned'}],pm:[]}},targets:{'2027-03-29':{distance:80,duration:null,focus:'Build'}},links:{'garmin:1':'one'},placements:{'garmin:1':{date:'2027-04-01',slot:'am'}}});
test('validates a structured plan and preserves treadmill targets',()=>assert.equal(validPlan(example()),true));
test('rejects bad values, oversized days, and invalid placements',()=>{let p=example();p.days['2027-04-01'].am[0].distance=-1;assert.equal(validPlan(p),false);p=example();p.placements['garmin:1'].slot='night';assert.equal(validPlan(p),false);p=example();p.days['2027-04-01'].am=Array(9).fill(p.days['2027-04-01'].am[0]);assert.equal(validPlan(p),false);p=example();p.targets['2027-03-29'].duration=Infinity;assert.equal(validPlan(p),false)});
