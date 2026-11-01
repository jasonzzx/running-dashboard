const assert = require('node:assert/strict');
const {test} = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const context = {window:{},document:{getElementById:()=>null}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../dashboard/pace-tool.js'),'utf8'),context);
const {paceAt,danielsPace} = context.window.PaceToolModel;
const reference = {distance:5,pace:205};
test('10s rule retains exact doubling behavior',()=>{
  assert.equal(paceAt(10,reference,'10s'),215);
  assert.equal(paceAt(2.5,reference,'10s'),195);
});
test('Daniels equivalent times match the independent comparison',()=>{
  assert.equal(danielsPace(5,reference),205);
  for (const [distance,seconds] of [[10,2126],[21.0975,4699],[42.195,9823]]) {
    assert.equal(Math.round(danielsPace(distance,reference)*distance),seconds);
  }
});
test('Daniels predictions are reversible from another distance',()=>{
  for (const distance of [0.4,1,10,21.0975,42.195,100]) {
    const pace=danielsPace(distance,reference);
    assert(Number.isFinite(pace) && pace>0);
    assert(Math.abs(danielsPace(5,{distance,pace})-205)<1e-8);
  }
});
test('Unsupported references and invalid distances do not produce predictions',()=>{
  assert(Number.isNaN(danielsPace(10,{distance:5,pace:3600})));
  assert(Number.isNaN(danielsPace(0,reference)));
  assert(Number.isNaN(danielsPace(Infinity,reference)));
});
