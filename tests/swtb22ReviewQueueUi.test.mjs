import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {managerReviewItems} from '../src/lib/managerReviewRows.mjs'

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
