import test from 'node:test'
import assert from 'node:assert/strict'
import {projectDayPresence} from '../src/lib/presenceDayProjection.mjs'

const worker='SYNTHETIC-WORKER'
const date='2026-10-17'
const base={
 weekly_slots:[
  {worker_id:worker,weekday_iso:6,valid_from:'2026-10-01',valid_until:null,start_minute:480,end_minute:540},
  {worker_id:worker,weekday_iso:6,valid_from:'2026-10-01',valid_until:null,start_minute:660,end_minute:720},
 ],exceptions:[],
}
test('monthly preview uses precise fixed intervals, not hours spanned between gaps',()=>{
 assert.deepEqual(projectDayPresence(base,worker,date),{
  kind:'weekly',windows:[{start:'08:00',end:'09:00'},{start:'11:00',end:'12:00'}],minutes:120,
 })
})
test('dated exception overrides recurring schedule for only that date',()=>{
 const data={...base,exceptions:[{worker_id:worker,local_date:date,kind:'replacement_intervals',
  intervals:[{start:900,end:1020},{start:1080,end:1140}]}]}
 assert.deepEqual(projectDayPresence(data,worker,date),{
  kind:'replacement',windows:[{start:'15:00',end:'17:00'},{start:'18:00',end:'19:00'}],minutes:180,
 })
 assert.equal(projectDayPresence(data,worker,'2026-10-24').kind,'weekly')
})
test('explicit dated absence differs from undefined schedule; no cross-worker data leakage',()=>{
 const data={...base,exceptions:[{worker_id:worker,local_date:date,kind:'unavailable',intervals:[]}]}
 assert.deepEqual(projectDayPresence(data,worker,date),{kind:'unavailable',windows:[],minutes:0})
 assert.deepEqual(projectDayPresence(data,'NOT-THIS-WORKER',date),{kind:'unknown',windows:[],minutes:null})
 assert.deepEqual(projectDayPresence({weekly_slots:[],exceptions:[]},worker,date),{
  kind:'unknown',windows:[],minutes:null,
 })
})
test('duplicate exceptions remain ambiguous, not falsely assigned availability',()=>{
 const data={...base,exceptions:[
  {worker_id:worker,local_date:date,kind:'unavailable',intervals:[]},
  {worker_id:worker,local_date:date,kind:'replacement_intervals',intervals:[{start:10,end:20}]},
 ]}
 assert.equal(projectDayPresence(data,worker,date).kind,'unknown')
})
