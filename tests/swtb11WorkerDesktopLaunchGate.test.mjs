// SWTB11: No live account, network, Supabase, enrollment, work or hour mutation.
// Complement the existing focused tests with a single cross-stage owner/role gate.
// This synthetic readiness test does NOT replace authenticated negative-role UAT.
import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyOperationsIdentity,disabledWorkerCopy} from '../src/lib/workerAccess.mjs'
import {scopeSelfWorkRows,validateDailyWindows,selectedWeeklyWindows} from '../src/lib/weeklyScheduleGrid.mjs'
import {selectWorkerTaskFocus,summarizeWorkerTaskFocus} from '../src/lib/workerTaskFocus.mjs'
import {projectWorkerReportActivity} from '../src/lib/workerReportActivity.mjs'

const A='synthetic-worker-A'
const B='synthetic-worker-B'
const today='2026-11-06'
const fixtures={
 tasks:[
  {id:'A-fix',worker_id:A,title:'اصلاح مستند ساختگی',unit:'library',
   planned_date:'2026-12-01',state:'needs_changes'},
  {id:'A-pending',worker_id:A,title:'گزارش منتظر بررسی',unit:'research',
   planned_date:'2026-11-04',state:'submitted'},
  {id:'A-done',worker_id:A,title:'کار تکمیل‌شده',unit:'public_relations',
   planned_date:'2026-11-02',state:'completed'},
  {id:'B-done',worker_id:B,title:'کار خصوصی شخص دیگر',unit:'library',
   planned_date:'2026-11-03',state:'completed'},
 ],
 time_entries:[
  {id:'A-changes',worker_id:A,task_id:'A-fix',work_date:'2026-11-04',
   review_state:'changes_requested',reported_minutes:80,approved_minutes:800,
   review_note:'لطفاً اصلاح شود'},
  {id:'A-pending-time',worker_id:A,task_id:'A-pending',work_date:'2026-11-04',
   review_state:'submitted',reported_minutes:90,approved_minutes:900},
  {id:'A-credit',worker_id:A,task_id:'A-done',work_date:'2026-11-02',
   review_state:'approved',reported_minutes:50,approved_minutes:35},
  {id:'B-credit',worker_id:B,task_id:'B-done',work_date:'2026-11-03',
   review_state:'approved',reported_minutes:300,approved_minutes:300},
 ],
 weekly_slots:[
  {worker_id:A,weekday_iso:6,start_minute:480,end_minute:540,
   valid_from:'2026-10-01',valid_until:null},
  {worker_id:B,weekday_iso:6,start_minute:300,end_minute:420,
   valid_from:'2026-10-01',valid_until:null},
 ],
 exceptions:[
  {worker_id:A,local_date:'2026-11-08',kind:'unavailable'},
  {worker_id:B,local_date:'2026-11-09',kind:'unavailable'},
 ],
}

test('worker launch gate: verified UI role never turns paused, inactive or anonymous into worker',()=>{
 const user={id:'only-a-fake-principal'}
 assert.equal(classifyOperationsIdentity({user:null,isAdmin:false,profile:{worker_id:A,state:'active'}}),null)
 assert.equal(classifyOperationsIdentity({user,isAdmin:false,profile:null}).role,'no_access')
 assert.equal(classifyOperationsIdentity({user,isAdmin:false,profile:{worker_id:A,state:'active'}}).role,'worker')
 for(const state of ['paused','inactive']){
  assert.equal(classifyOperationsIdentity({user,isAdmin:false,profile:{worker_id:A,state}}).role,
   'worker_disabled')
  assert.ok(disabledWorkerCopy(state)?.description.includes('دسترسی'))
 }
 assert.equal(classifyOperationsIdentity({user,isAdmin:'true',profile:{worker_id:A,state:'active'}}).role,
  'worker','a string isAdmin must never grant administrative status')
 assert.equal(classifyOperationsIdentity({user,isAdmin:true,profile:null}).role,'admin',
  'only the server-verified boolean admin indicator may select manager presentation')
})

test('worker launch gate: same synthetic server snapshot never exposes another worker after changing principal',()=>{
 const before=JSON.stringify(fixtures)
 const scopedA=scopeSelfWorkRows(fixtures,A)
 const scopedB=scopeSelfWorkRows(fixtures,B)
 assert.deepEqual(scopedA.tasks.map(t=>t.id),['A-fix','A-pending','A-done'])
 assert.deepEqual(scopedA.time_entries.map(e=>e.id),['A-pending-time','A-changes','A-credit'])
 assert.deepEqual(scopedB.tasks.map(t=>t.id),['B-done'])
 assert.deepEqual(scopedB.time_entries.map(e=>e.id),['B-credit'])
 for(const kind of ['tasks','time_entries','weekly_slots','exceptions']){
  assert.ok(scopedA[kind].every(item=>item.worker_id===A),kind+' must be A-only')
  assert.ok(scopedB[kind].every(item=>item.worker_id===B),kind+' must be B-only')
 }
 assert.equal(JSON.stringify(fixtures),before,'server read-only rows must not be mutated')
})

test('worker launch gate: future correction is an action; pending never implies approval',()=>{
 const mine=scopeSelfWorkRows(fixtures,A)
 assert.deepEqual(selectWorkerTaskFocus(mine.tasks,today,'action').map(t=>t.id),['A-fix'],
  'a correction required today stays actionable even if its planned date is in the future')
 assert.deepEqual(selectWorkerTaskFocus(mine.tasks,today,'pending').map(t=>t.id),['A-pending'])
 assert.deepEqual(selectWorkerTaskFocus(mine.tasks,today,'completed').map(t=>t.id),['A-done'])
 assert.deepEqual(summarizeWorkerTaskFocus(mine.tasks,today),
  {action:1,pending:1,upcoming:0,completed:1})
})

test('worker launch gate: self-owned approved time only, not raw requested minutes or other worker credit',()=>{
 const mine=scopeSelfWorkRows(fixtures,A)
 const rows=projectWorkerReportActivity(mine.time_entries,mine.tasks)
 assert.deepEqual(rows.map(e=>e.id),['A-changes','A-pending-time','A-credit'])
 assert.equal(rows.find(e=>e.id==='A-changes').approved_minutes,null)
 assert.equal(rows.find(e=>e.id==='A-pending-time').approved_minutes,null)
 const approved=rows.filter(e=>e.review_state==='approved')
 assert.deepEqual(approved.map(e=>e.id),['A-credit'])
 assert.equal(approved.reduce((sum,e)=>sum+(e.approved_minutes||0),0),35)
 assert.equal(approved[0].unit,'public_relations',
  'approved work unit is the assigned task unit, not the registration unit')
 assert.ok(rows.every(e=>!e.title.includes('شخص دیگر')))
})

test('worker launch gate: weekly self planning is four non-overlapping windows at most; blank stays unknown',()=>{
 const valid=validateDailyWindows([
  {start:'08:00',end:'09:00'},{start:'10:00',end:'11:00'},
  {start:'13:00',end:'14:00'},{start:'15:00',end:'16:00'},
 ])
 assert.equal(valid.ok,true)
 assert.equal(valid.minutes,240)
 assert.equal(validateDailyWindows([{start:'08:00',end:'09:30'},{start:'09:00',end:'10:00'}]).ok,false)
 assert.equal(validateDailyWindows([{start:'08:00',end:'09:00'},
  {start:'10:00',end:'11:00'},{start:'12:00',end:'13:00'},
  {start:'14:00',end:'15:00'},{start:'16:00',end:'17:00'}]).ok,false)
 const mine=scopeSelfWorkRows(fixtures,A)
 assert.deepEqual(selectedWeeklyWindows(mine.weekly_slots,A,6,'2026-11-07'),
  [{start:'08:00',end:'09:00'}])
 assert.deepEqual(selectedWeeklyWindows(mine.weekly_slots,B,6,'2026-11-07'),[])
 assert.deepEqual(selectedWeeklyWindows(mine.weekly_slots,A,1,'2026-11-09'),[])
 assert.deepEqual(validateDailyWindows([]),{ok:true,intervals:[],minutes:0},
  'absence of a planned interval is not affirmative physical absence or approved time')
})
