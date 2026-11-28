import test from 'node:test'
import assert from 'node:assert/strict'
import {captureDeskCancellationTarget,observeDeskCancellationEffect} from '../src/lib/deskCancellationObservation.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0'),day='2026-11-28'
const shift={id:id(1),task_id:id(2),worker_id:id(3),shift_date:day,start_minute:480,end_minute:540,state:'scheduled'}
const task={id:shift.task_id,worker_id:shift.worker_id,unit:'library',planned_date:day,estimate_minutes:60,state:'assigned'}
const shifts=(rows=[shift],from=day,to=day)=>({ok:true,from,to,shifts:rows})
const work=(tasks=[task],time_entries=[])=>({tasks,time_entries})
const capture=()=>captureDeskCancellationTarget({shiftId:shift.id,day,shifts:shifts(),work:work()})
const cancelled={...shift,state:'cancelled'},cancelledTask={...task,state:'cancelled'}
const observe=(target,s=shifts([cancelled]),w=work([cancelledTask]))=>observeDeskCancellationEffect(target,s,w)
test('exact scheduled target captures immutable linked date/worker/task/interval only',()=>{
 const t=capture();assert.ok(t);assert.equal(Object.isFrozen(t),true)
 assert.deepEqual(t,{id:shift.id,task_id:shift.task_id,worker_id:shift.worker_id,shift_date:day,start_minute:480,end_minute:540})
})
test('positive matching cancelled shift and task is observation only, never attribution, credit proof or fence release',()=>{
 assert.deepEqual(observe(capture()),{state:'cancelled_observed',operationAttribution:false,creditConfirmed:false,mayReleaseFence:false})
})
test('absence, clipped tasks, still-scheduled or conflicting states remain unconfirmed',()=>{
 const t=capture()
 for(const [s,w] of [[shifts([]),work([cancelledTask])],[shifts([cancelled]),work([])],[shifts(),work()],[shifts([cancelled]),work()],[shifts(),work([cancelledTask])]])assert.equal(observe(t,s,w).state,'unconfirmed')
})
test('wrong range, target tuple, duplicate rows and report evidence remain unconfirmed',()=>{
 const t=capture()
 for(const [s,w] of [[shifts([cancelled],'2026-11-27',day),work([cancelledTask])],[shifts([{...cancelled,worker_id:id(9)}]),work([cancelledTask])],[shifts([cancelled,cancelled]),work([cancelledTask])],[shifts([cancelled,{...cancelled,id:id(9)}]),work([cancelledTask])],[shifts([cancelled]),work([cancelledTask,cancelledTask])],[shifts([cancelled]),work([cancelledTask],[{task_id:task.id}])],[{ok:false,from:day,to:day,shifts:[cancelled]},work([cancelledTask])],[shifts([cancelled]),work([{...cancelledTask,estimate_minutes:59}])]])assert.equal(observe(t,s,w).state,'unconfirmed')
})
test('preflight refuses already cancelled, mismatched, malformed, reported or absent shift/task',()=>{
 for(const [s,w] of [[shifts([cancelled]),work()],[shifts([{...shift,end_minute:480}]),work()],[shifts(),work([{...task,state:'in_progress'}])],[shifts(),work([task],[{task_id:task.id}])],[shifts(),work([])],[shifts(),work([{...task,unit:'research'}])],[shifts([]),work()]])assert.equal(captureDeskCancellationTarget({shiftId:shift.id,day,shifts:s,work:w}),null)
})
test('a fresh host cannot recreate an observation target from copied fields or a guessed identifier',()=>{
 const t=capture();assert.equal(observe({...t}).state,'unconfirmed');assert.equal(observe(null).state,'unconfirmed')
})
