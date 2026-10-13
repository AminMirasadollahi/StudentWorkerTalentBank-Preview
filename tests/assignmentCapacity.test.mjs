import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validIsoDay,isoWeekday,firstMatchingWeekday,intervalsTotalMinutes,
  assessAssignmentCapacity,assessAvailabilityOverride,
} from '../src/lib/assignmentCapacity.mjs'

const fixture=()=>({
  weekly_slots:[
    {worker_id:'w1',weekday_iso:2,start_minute:480,end_minute:600,valid_from:'2026-10-01',valid_until:null},
    {worker_id:'w1',weekday_iso:2,start_minute:660,end_minute:780,valid_from:'2026-10-01',valid_until:null},
    {worker_id:'w2',weekday_iso:2,start_minute:480,end_minute:900,valid_from:'2026-10-01',valid_until:null},
  ],
  exceptions:[],
  tasks:[
    {id:'one',worker_id:'w1',planned_date:'2026-10-13',estimate_minutes:90,state:'assigned'},
    {id:'two',worker_id:'w1',planned_date:'2026-10-13',estimate_minutes:30,state:'completed'},
    {id:'cancelled',worker_id:'w1',planned_date:'2026-10-13',estimate_minutes:450,state:'cancelled'},
    {id:'other',worker_id:'w2',planned_date:'2026-10-13',estimate_minutes:420,state:'assigned'},
  ],
})
const check=(data,estimate=0,workerId='w1',date='2026-10-13')=>
  assessAssignmentCapacity(data,{workerId,date,estimateMinutes:estimate})

test('ISO dates and Iran scheduling use UTC-safe Monday=1, Sunday=7 without locale clock drift',()=>{
  assert.equal(isoWeekday('2026-10-13'),2)
  assert.equal(isoWeekday('2026-10-18'),7)
  assert.equal(isoWeekday('2026-10-17'),6)
  assert.equal(validIsoDay('2026-02-30'),false)
  assert.equal(validIsoDay('2024-02-29'),true)
  assert.equal(validIsoDay('2026-2-3'),false)
})
test('weekly split slots and cancelled task exclusion are counted exactly',()=>{
  const x=check(fixture(),60)
  assert.equal(x.code,'ok')
  assert.equal(x.availableMinutes,240)
  assert.equal(x.assignedMinutes,120)
  assert.equal(x.proposedMinutes,60)
  assert.equal(x.remainingMinutes,60)
  assert.equal(x.exception,false)
})
test('exact capacity and overbooking warnings are correctly distinguished',()=>{
  assert.equal(check(fixture(),120).code,'full')
  const r=check(fixture(),130)
  assert.equal(r.code,'overbooked')
  assert.equal(r.remainingMinutes,-10)
  assert.equal(check(fixture(),0,'w2').code,'full')
})
test('unavailable exception overrides weekly slots, including existing committed work',()=>{
  const f=fixture()
  f.exceptions=[{worker_id:'w1',local_date:'2026-10-13',kind:'unavailable',intervals:[]}]
  const x=check(f,1)
  assert.equal(x.code,'unavailable')
  assert.equal(x.availableMinutes,0)
  assert.equal(x.assignedMinutes,120)
  assert.equal(x.exception,true)
})
test('replacement hours supersede weekly, and empty replacement is known no-capacity',()=>{
  const f=fixture()
  f.exceptions=[{worker_id:'w1',local_date:'2026-10-13',kind:'replacement_intervals',
    intervals:[{start:540,end:630},{start:660,end:720}]}]
  assert.equal(check(f,30).code,'full')
  f.exceptions[0].intervals=[]
  assert.equal(check(f,0).code,'unavailable')
})
test('no schedule configured is UNKNOWN rather than false confirmed absence',()=>{
  const f=fixture()
  assert.equal(check(f,10,'w1','2026-10-14').code,'not_configured')
  assert.equal(check(f,10,'w99','2026-10-13').code,'not_configured')
  const unknown=check(f,-30)
  assert.equal(unknown.code,'unknown')
  assert.equal(unknown.reason,'invalid_estimate')
})
test('different worker, expired slots and overlapping invalid slots never count as capacity',()=>{
  const f=fixture()
  f.weekly_slots=f.weekly_slots.filter(s=>s.worker_id!=='w1')
  assert.equal(check(f,0).code,'not_configured')
  f.weekly_slots=[{worker_id:'w1',weekday_iso:2,start_minute:0,end_minute:60,
    valid_from:'2026-10-01',valid_until:'2026-10-12'}]
  assert.equal(check(f,0).code,'not_configured')
  f.weekly_slots=[
    {worker_id:'w1',weekday_iso:2,start_minute:480,end_minute:600,valid_from:'2026-10-01'},
    {worker_id:'w1',weekday_iso:2,start_minute:590,end_minute:680,valid_from:'2026-10-01'},
  ]
  assert.equal(check(f,0).code,'unknown')
})
test('interval validator handles zero, boundaries, overlap and malformed intervals',()=>{
  assert.equal(intervalsTotalMinutes([{start:0,end:1440}]),1440)
  assert.equal(intervalsTotalMinutes([{start:0,end:60},{start:60,end:120}]),120)
  assert.equal(intervalsTotalMinutes([{start:120,end:130},{start:0,end:60}]),70)
  assert.equal(intervalsTotalMinutes([{start:60,end:60}]),null)
  assert.equal(intervalsTotalMinutes([{start:10,end:12},{start:11,end:13}]),null)
  assert.equal(intervalsTotalMinutes([{start:-1,end:14}]),null)
  assert.equal(intervalsTotalMinutes([{start:'bad',end:10}]),null)
})
test('duplicate or corrupted exception yields UNKNOWN, never confident no-conflict',()=>{
  const f=fixture()
  f.exceptions=[
    {worker_id:'w1',local_date:'2026-10-13',kind:'unavailable',intervals:[]},
    {worker_id:'w1',local_date:'2026-10-13',kind:'replacement_intervals',intervals:[]},
  ]
  assert.equal(check(f,1).code,'unknown')
  f.exceptions=[{worker_id:'w1',local_date:'2026-10-13',kind:'replacement_intervals',
    intervals:[{start:800,end:700}]}]
  assert.equal(check(f,1).code,'unknown')
})
test('schedule override advisory warns about previously assigned tasks, no write',()=>{
  const f=fixture(),before=JSON.stringify(f)
  const x=assessAvailabilityOverride(f,'w1','2026-10-13',[{start:480,end:540}])
  assert.deepEqual(x,{code:'conflict',allocatedMinutes:120,proposedCapacity:60})
  const y=assessAvailabilityOverride(f,'w1','2026-10-13',[],{unavailable:true})
  assert.equal(y.code,'conflict')
  const z=assessAvailabilityOverride(f,'w1','2026-10-13',[{start:0,end:140}])
  assert.equal(z.code,'ok')
  assert.equal(JSON.stringify(f),before)
})

test('future weekly preview selects matching Persian business weekday without skipping same-day match',()=>{
  assert.equal(firstMatchingWeekday('2026-10-13',6),'2026-10-17')
  assert.equal(firstMatchingWeekday('2026-10-17',6),'2026-10-17')
  assert.equal(firstMatchingWeekday('2026-10-18',6),'2026-10-24')
  assert.equal(firstMatchingWeekday('invalid',6),null)
  assert.equal(firstMatchingWeekday('2026-10-13',0),null)
})
