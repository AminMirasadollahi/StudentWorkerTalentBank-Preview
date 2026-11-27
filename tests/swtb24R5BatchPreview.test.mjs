import test from 'node:test'
import assert from 'node:assert/strict'
import {previewBatchAssignment as preview} from '../src/lib/batchAssignmentPreview.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const a=id(1),b=id(2),c=id(3),pre=id(4)
const ctx=()=>({today:'2026-11-27',term:{id:'term-1',state:'active',start_date:'2026-09-23',end_date:'2027-02-09'},workers:[{id:a,state:'active'},{id:b,state:'active'},{id:c,state:'inactive'}],data:{tasks:[{id:pre,worker_id:a,planned_date:'2026-12-01',estimate_minutes:30,state:'assigned'}],weekly_slots:[{worker_id:a,weekday_iso:2,start_minute:480,end_minute:600,valid_from:'2026-09-23'}],exceptions:[]}})
const row=(id,workerIds,more={})=>({id,title:'کار نمونه',instructions:'شرح نمونه',minutes:45,mode:'independent',workerIds,date:null,unit:null,reason:null,prerequisiteIds:[],...more})
const draft=(rows,defaults={})=>({termId:'term-1',defaults:{date:'2026-12-01',unit:'library',reason:'',...defaults},rows})
const bad=(d,code,x=ctx())=>{const r=preview(d,x);assert.equal(r.ok,false);assert.equal(r.plan,null);assert.ok(r.errors.some(e=>e.code===code),JSON.stringify(r.errors))}
test('explicit matrix independent copies, no implicit Cartesian allocation or group',()=>{
 const d=draft([row('r1',[a,b]),row('r2',[a],{minutes:60})]),x=ctx(),before=JSON.stringify([d,x])
 const r=preview(d,x);assert.ok(r.ok);assert.equal(r.plan.pairCount,3);assert.equal(r.plan.operationCount,3);assert.equal(r.plan.totalMinutes,150)
 assert.deepEqual(r.plan.personTotals,[{workerId:a,minutes:105},{workerId:b,minutes:45}])
 assert.equal(r.plan.dailyTotals[0].existingMinutes,30);assert.equal(r.plan.dailyTotals[0].remainingMinutes,-15);assert.equal(r.plan.dailyTotals[0].capacityCode,'overbooked')
 assert.equal(r.plan.dailyTotals[1].availableMinutes,null);assert.equal(r.plan.dailyTotals[1].capacityCode,'not_configured')
 assert.ok(r.plan.assignments.every(x=>x.workerIds.length===1&&!Object.hasOwn(x,'p_request_id')));assert.equal(JSON.stringify([d,x]),before)
 assert.ok(Object.isFrozen(r.plan.assignments[0].workerIds))
})
test('group is one planned operation with per-person credit, distinct from independent copies',()=>{
 const r=preview(draft([row('r1',[b,a],{mode:'collaborative'})]),ctx())
 assert.ok(r.ok);assert.equal(r.plan.operationCount,1);assert.equal(r.plan.pairCount,2);assert.equal(r.plan.totalMinutes,90);assert.deepEqual(r.plan.assignments[0].workerIds,[a,b])
 bad(draft([row('r1',[a],{mode:'collaborative'})]),'GROUP_SIZE')
})
test('reject missing recipients, duplicates, inactive, duplicate row, unsupported mode and extra fields',()=>{
 bad(draft([row('r',[])]),'SELECT_WORKERS')
 bad(draft([row('r',[a,a])]),'DUPLICATE_PAIR')
 bad(draft([row('r',[c])]),'WORKER_NOT_ACTIVE_OR_UNKNOWN')
 bad(draft([row('r',[a]),row('r',[b])]),'INVALID_ROW')
 bad(draft([row('r',[a],{mode:'split'})]),'UNSUPPORTED_MODE')
 bad(draft([row('r',[a],{endDate:'2026-12-02'})]),'INVALID_ROW')
})
test('date and term boundaries, short notice, overrides and canonical V3 fields',()=>{
 bad(draft([row('r',[a])],{date:'2026-11-26'}),'DATE_OUTSIDE_TERM_OR_PAST')
 bad(draft([row('r',[a])],{date:'2027-02-10'}),'DATE_OUTSIDE_TERM_OR_PAST')
 bad(draft([row('r',[a])],{date:'2026-11-28'}),'SHORT_NOTICE_REASON')
 bad({...draft([row('r',[a])]),termId:'old'},'INVALID_PLAN_OR_TERM')
 bad(draft([row('r',[a],{minutes:0})]),'INVALID_V3_FIELDS')
 bad(draft([row('r',[a],{minutes:1441})]),'INVALID_V3_FIELDS')
 bad(draft([row('r',[a],{title:'  '})]),'INVALID_V3_FIELDS')
 bad(draft([row('r',[a],{instructions:'x'.repeat(3001)})]),'INVALID_V3_FIELDS')
 const r=preview(draft([row('r',[a],{date:'2026-11-28',unit:'research',reason:'هماهنگی قبلی'})]),ctx())
 assert.ok(r.ok);assert.equal(r.plan.assignments[0].date,'2026-11-28');assert.equal(r.plan.assignments[0].unit,'research')
})
test('concrete prerequisite IDs only, cancelled warning, no new row references',()=>{
 bad(draft([row('r',[a],{prerequisiteIds:['r2']})]),'INVALID_PREREQUISITES')
 bad(draft([row('r',[a],{prerequisiteIds:[id(99)]})]),'PREREQUISITE_NOT_LOADED')
 const x=ctx();x.data.tasks[0].state='cancelled'
 const r=preview(draft([row('r',[a],{prerequisiteIds:[pre]})]),x)
 assert.ok(r.ok);assert.equal(r.plan.warnings[0].code,'CANCELLED_PREREQUISITE');assert.equal(r.plan.dailyTotals[0].existingMinutes,0)
})
test('capacity sums whole batch per day, including >1440 total, unavailable and invalid context',()=>{
 const x=ctx();x.data.exceptions.push({worker_id:b,local_date:'2026-12-01',kind:'unavailable',intervals:[]})
 const r=preview(draft([row('r1',[a,b],{minutes:1000}),row('r2',[a],{minutes:1000}),row('r3',[a],{date:'2026-12-02',minutes:30})]),x)
 assert.ok(r.ok);assert.equal(r.plan.dailyTotals[0].proposedMinutes,2000);assert.equal(r.plan.dailyTotals[0].remainingMinutes,-1910)
 assert.equal(r.plan.dailyTotals[1].capacityCode,'not_configured');assert.equal(r.plan.dailyTotals[2].capacityCode,'unavailable')
 bad(draft([row('r',[a])]),'CONTEXT_UNAVAILABLE',{...x,data:{}})
})
