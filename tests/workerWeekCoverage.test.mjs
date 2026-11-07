import test from 'node:test'
import assert from 'node:assert/strict'
import {projectWorkerWeekCoverage} from '../src/lib/workerWeekCoverage.mjs'
import {projectTeamDay} from '../src/lib/teamCalendarProjection.mjs'

const date='2026-10-17' // Saturday in the university's local calendar.
const fixture={
 workers:[
  {id:'a',name:'همکار الف',state:'active',unit:'library',email:'DO_NOT_RENDER_EMAIL'},
  {id:'b',name:'همکار ب',state:'active',unit:'research'},
  {id:'c',name:'همکار ج',state:'active',unit:'public_relations'},
  {id:'d',name:'همکار د',state:'active',unit:'library'},
  {id:'e',name:'همکار ه',state:'active',unit:'library'},
  {id:'paused',name:'حساب غیرفعال',state:'paused',unit:'library'},
 ],
 weekly_slots:[
  {worker_id:'a',weekday_iso:6,valid_from:'2026-10-01',
   valid_until:null,start_minute:480,end_minute:540},
  {worker_id:'a',weekday_iso:6,valid_from:'2026-10-01',
   valid_until:null,start_minute:600,end_minute:660},
  {worker_id:'b',weekday_iso:6,valid_from:'2026-10-01',
   valid_until:null,start_minute:540,end_minute:720},
  {worker_id:'e',weekday_iso:6,valid_from:'2026-10-01',
   valid_until:null,start_minute:780,end_minute:840},
  {worker_id:'paused',weekday_iso:6,valid_from:'2026-10-01',
   valid_until:null,start_minute:480,end_minute:540},
 ],
 exceptions:[
  {worker_id:'a',local_date:date,kind:'replacement_intervals',
   intervals:[{start:660,end:750}],note:'PRIVATE_REASON'},
  {worker_id:'d',local_date:date,kind:'unavailable',
   intervals:[],note:'PRIVATE_PERSONAL_ABSENCE'},
 ],
 tasks:[
  {worker_id:'a',planned_date:date,title:'SENSITIVE_TASK_TITLE',
   state:'assigned',unit:'research',instructions:'PRIVATE_INSTRUCTIONS'},
  {worker_id:'c',planned_date:date,title:'SECOND_SECRET_TASK',
   state:'scheduled',unit:'public_relations'},
  {worker_id:'d',planned_date:date,title:'OTHER_SECRET_TASK',
   state:'scheduled',unit:'library'},
 ],
}
test('weekly worker coverage shows actual local interval times sorted and respects date overrides',()=>{
 const result=projectWorkerWeekCoverage(projectTeamDay(fixture,date))
 assert.equal(result.planned,3)
 assert.equal(result.taskWithoutPlan,2,'task-only and explicitly unavailable workers do not become planned attendance')
 assert.equal(result.explicitlyUnavailable,1)
 assert.equal(result.unknown,1)
 assert.deepEqual(result.entries.map(x=>x.workerId),['b','a','e','c','d'])
 assert.deepEqual(result.entries.find(x=>x.workerId==='a').windows,
  [{start:'11:00',end:'12:30'}], 'override beats fixed 08:00–09:00')
 assert.equal(result.entries.find(x=>x.workerId==='a').corrected,true)
 assert.deepEqual(result.entries.find(x=>x.workerId==='b').windows,
  [{start:'09:00',end:'12:00'}])
 assert.equal(result.entries.find(x=>x.workerId==='c').scheduleUnknown,true)
 assert.deepEqual(result.entries.find(x=>x.workerId==='c').windows,[])
 assert.equal(result.entries.find(x=>x.workerId==='d').explicitlyUnavailable,true)
 assert.equal(result.entries.find(x=>x.workerId==='d').scheduleUnknown,false)
 assert.equal(result.entries.find(x=>x.workerId==='paused'),undefined)
 assert.equal(result.remaining,0)
})

test('no private notes, contacts or task titles are copied into worker week card projection',()=>{
 const result=projectWorkerWeekCoverage(projectTeamDay(fixture,date))
 const json=JSON.stringify(result)
 for(const secret of ['DO_NOT_RENDER_EMAIL','PRIVATE_REASON',
  'PRIVATE_PERSONAL_ABSENCE','PRIVATE_INSTRUCTIONS',
  'SENSITIVE_TASK_TITLE','SECOND_SECRET_TASK','OTHER_SECRET_TASK']){
  assert.doesNotMatch(json,new RegExp(secret))
 }
 assert.ok(json.includes('همکار الف')&&json.includes('11:00'))
})

test('six-person cap is deterministic: more workers are explicitly disclosed via summary, not omitted silently',()=>{
 const people=Array.from({length:9},(_,i)=>({
  workerId:'w'+i,name:'دانشجوکار '+i,kind:'weekly',
  windows:[{start:'08:00',end:'10:00'}],hasPlan:true,hasTask:false,tasks:[],
 }))
 const row={people,explicitlyUnavailable:0,unknownWorkers:0}
 const x=projectWorkerWeekCoverage(row)
 assert.equal(x.entries.length,6)
 assert.equal(x.remaining,3)
 assert.equal(projectWorkerWeekCoverage(row,{limit:2}).remaining,7)
 assert.equal(projectWorkerWeekCoverage(row,{limit:99}).entries.length,6)
 assert.equal(projectWorkerWeekCoverage(row,{limit:-1}).entries.length,0)
})

test('unknown availability is not falsely reported as absence or zero-hours coverage',()=>{
 const row=projectTeamDay({workers:[{id:'w',name:'بدون برنامه',state:'active'}],
  weekly_slots:[],exceptions:[],tasks:[]},date)
 const result=projectWorkerWeekCoverage(row)
 assert.equal(result.entries.length,0)
 assert.equal(result.planned,0)
 assert.equal(result.unknown,1)
 assert.equal(result.explicitlyUnavailable,0)
})

test('malformed coverage input fails explicitly',()=>{
 assert.throws(()=>projectWorkerWeekCoverage({}),/invalid_worker_week_day/)
})
