import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {managerReviewItems,filterManagerInbox,managerReviewSubmissionDay} from '../src/lib/managerReviewRows.mjs'

const workers=[{id:'FAKE-A',name:'دانشجوکار نمونه الف'}]
const tasks=[{id:'FAKE-T',title:'ثبت نسخه‌های آزمایشی',worker_id:'FAKE-A',
 unit:'library',estimate_minutes:60}]
const pending=[
 {id:'FAKE-R1',task_id:'FAKE-T',worker_id:'FAKE-A',reported_minutes:60,
  review_state:'submitted',work_date:'2026-11-06'},
 {id:'FAKE-R2',task_id:'FAKE-T',worker_id:'FAKE-A',reported_minutes:90,
  review_state:'submitted',work_date:'2026-11-06'},
 {id:'FAKE-R3',task_id:'MISSING',worker_id:'FAKE-A',reported_minutes:45,
  review_state:'submitted',work_date:'2026-11-06'},
 {id:'FAKE-APPROVED',task_id:'FAKE-T',worker_id:'FAKE-A',reported_minutes:60,
  review_state:'approved',approved_minutes:60},
]
const changes=[
 {id:'FAKE-C1',worker_id:'FAKE-A',review_state:'pending',field_code:'major',
  proposed_value:'رشته ساختگی',reason:'متن توضیح ساختگی'},
 {id:'FAKE-DONE',worker_id:'FAKE-A',review_state:'approved',
  field_code:'name',proposed_value:'نمونه دیگر'},
]
test('authorized projection keeps pending only and never presents reported as approved minutes',()=>{
 const all=managerReviewItems({
  timeEntries:pending,profileChanges:changes,workers,tasks,
  formatDate:s=>s,formatUnit:s=>s||'—',
 })
 assert.equal(all.length,4)
 assert.deepEqual(all.map(x=>x.key),['profile:FAKE-C1','time:FAKE-R1','time:FAKE-R2','time:FAKE-R3'])
 assert.deepEqual(all.map(x=>x.badge),[
  'اصلاح مشخصات','گزارش ساعت','زمان اضافه','کار نامشخص',
 ])
 assert.deepEqual(all.map(x=>x.alert),[false,false,true,true])
 assert.doesNotMatch(JSON.stringify(all.map(x=>x.title)),/FAKE-APPROVED/)
 assert.equal(managerReviewItems({...{timeEntries:pending,profileChanges:changes},mode:'time'}).length,3)
 assert.equal(managerReviewItems({...{timeEntries:pending,profileChanges:changes},mode:'profile'}).length,1)
 assert.deepEqual(managerReviewItems({}),[])
})

// The full React browse/focus/mutation boundary is exercised once in
// swtb22FocusedDecisionIntegration + native Chrome. Keep this unit isolated,
// deterministic and free of redundant Vite SSR servers.
test('read-only filtering preserves the original server-authorized input',()=>{
 const list=[...pending]
 const before=JSON.stringify({list,changes,tasks,workers})
 const filtered=managerReviewItems({timeEntries:list,profileChanges:changes,
  workers,tasks,mode:'time'})
 assert.equal(filtered.length,3)
 assert.equal(JSON.stringify({list,changes,tasks,workers}),before)
 assert.ok(filtered.every(x=>x.kind==='time'))
})
test('a legacy report with no linked task never masquerades as a normal report',()=>{
 const items=managerReviewItems({timeEntries:[pending[2]],workers,tasks})
 assert.equal(items.length,1)
 assert.equal(items[0].task,undefined)
 assert.equal(items[0].badge,'کار نامشخص')
 assert.equal(items[0].alert,true)
})

test('pending presence is counted exactly once alongside time and profile, but never treated as approved credit',()=>{
 const presenceChanges=[
  {id:'FAKE-P1',worker_id:'FAKE-A',local_date:'2026-11-21',
   action:'set_exception',kind:'unavailable',status:'pending',reason:'synthetic'},
  {id:'FAKE-P2',worker_id:'FAKE-A',local_date:'2026-11-20',
   action:'inherit_weekly',status:'approved',reason:'synthetic'},
 ]
 const opts={timeEntries:pending,profileChanges:changes,presenceChanges,workers,tasks}
 const all=managerReviewItems(opts)
 assert.equal(all.length,5)
 const item=all.find(x=>x.kind==='presence')
 assert.equal(item?.key,'presence:FAKE-P1')
 assert.match(item?.title||'',/عدم حضور/)
 assert.equal(item?.request?.status,'pending')
 assert.equal(managerReviewItems({...opts,mode:'time'}).length,3)
 assert.equal(managerReviewItems({...opts,mode:'profile'}).length,1)
 assert.equal(managerReviewItems({...opts,mode:'presence'}).length,1)
 assert.equal(all.some(x=>x.key==='presence:FAKE-P2'),false)
 assert.equal(JSON.stringify(presenceChanges).includes('"status":"approved"'),true)
})

test('unified inbox filters use activity unit, worker and Tehran submission day, not scheduled date',()=>{
 const list=managerReviewItems({
  workers,tasks,
  timeEntries:[{...pending[0],submitted_at:'2026-11-20T21:00:00Z'},
   {...pending[2],submitted_at:'2026-11-20T10:00:00Z'}],
  profileChanges:[{...changes[0],created_at:'2026-11-19T09:00:00Z'}],
  presenceChanges:[{id:'P',worker_id:'FAKE-A',status:'pending',local_date:'2030-01-01',
   requested_at:'2026-11-20T22:00:00Z'}],
 })
 const before=JSON.stringify(list)
 const keys=f=>filterManagerInbox(list,f).map(x=>x.key)
 assert.deepEqual(keys({}),['profile:FAKE-C1','time:FAKE-R3','time:FAKE-R1','presence:P'])
 assert.deepEqual(keys({order:'newest'}),['presence:P','time:FAKE-R1','time:FAKE-R3','profile:FAKE-C1'])
 assert.deepEqual(keys({unit:'library'}),['time:FAKE-R1'])
 assert.deepEqual(keys({unit:'unknown'}),['time:FAKE-R3'])
 assert.deepEqual(keys({unit:'not_applicable'}),['profile:FAKE-C1','presence:P'])
 assert.deepEqual(keys({workerId:'FAKE-B'}),[])
 assert.deepEqual(keys({workerId:'FAKE-A',kind:'time',from:'2026-11-21',to:'2026-11-21'}),['time:FAKE-R1'])
 assert.deepEqual(keys({from:'2026-11-22',to:'2026-11-21'}),[])
 assert.equal(managerReviewSubmissionDay(list.find(x=>x.key==='presence:P')),'2026-11-21')
 assert.equal(JSON.stringify(list),before)
})
test('missing or zone-less submitted timestamps are last and excluded only when date filters apply',()=>{
 const list=[{key:'b',kind:'time',submittedAt:null},{key:'a',kind:'time',submittedAt:'2026-11-20T08:00:00Z'},
  {key:'c',kind:'presence',submittedAt:'2026-11-20T08:00:00'}]
 for(const order of ['oldest','newest'])assert.deepEqual(filterManagerInbox(list,{order}).map(x=>x.key),['a','b','c'])
 assert.deepEqual(filterManagerInbox(list,{from:'2026-11-20'}).map(x=>x.key),['a'])
})
