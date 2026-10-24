import test from 'node:test'
import assert from 'node:assert/strict'
import {selectWorkerTaskFocus,summarizeWorkerTaskFocus} from '../src/lib/workerTaskFocus.mjs'

const today='2026-10-24'
const task=(id,state,planned_date)=>({id,title:'ساختگی '+id,state,planned_date})
const sample=[
 task('old-fix','needs_changes','2026-10-04'),
 task('tomorrow-fix','needs_changes','2026-11-14'),
 task('overdue','assigned','2026-10-20'),
 task('today','in_progress',today),
 task('later','assigned','2027-01-10'),
 task('pending','submitted','2026-10-21'),
 task('done','completed','2026-10-23'),
 task('cancelled','cancelled','2026-10-20'),
]

test('action lane prioritizes explicit needs_changes, including future-date corrections, then due work',()=>{
 assert.deepEqual(selectWorkerTaskFocus(sample,today,'action').map(x=>x.id),
 ['old-fix','tomorrow-fix','overdue','today'])
 assert.deepEqual(sample.map(x=>x.id),[
 'old-fix','tomorrow-fix','overdue','today','later','pending','done','cancelled'],
 'projection must not mutate the fetched task array')
})
test('pending is server submitted, not inferred from unapproved minutes or planned dates',()=>{
 const withEntries=[...sample,task('in-progress-old','in_progress','2026-10-09')]
 assert.deepEqual(selectWorkerTaskFocus(withEntries,today,'pending').map(x=>x.id),['pending'])
})
test('upcoming excludes sent, approved, cancelled, and correction-required work',()=>{
 assert.deepEqual(selectWorkerTaskFocus(sample,today,'upcoming').map(x=>x.id),['later'])
})
test('completion and unknown states are never counted as actionable',()=>{
 assert.deepEqual(selectWorkerTaskFocus(sample,today,'completed').map(x=>x.id),['done'])
 assert.deepEqual(summarizeWorkerTaskFocus(sample,today),
 {action:4,pending:1,upcoming:1,completed:1})
})
test('empty, missing or malformed date data stays safe and never fabricates a due task',()=>{
 const odd=[task('unknown','not-a-real-state','2026-10-20'),
  task('no-date','assigned',null),
  task('bad-date','in_progress','2026-10-24<script>')]
 assert.deepEqual(selectWorkerTaskFocus(odd,today,'action').map(x=>x.id),['no-date','bad-date'],
  'untrusted dates must not bury potentially actionable tasks in upcoming')
 assert.deepEqual(selectWorkerTaskFocus(odd,today,'upcoming'),[],
  'missing or malformed dates must not fabricate future scheduling')
 assert.deepEqual(selectWorkerTaskFocus(null,today,'action'),[])
 assert.deepEqual(selectWorkerTaskFocus(odd,today,'not-supported'),[])
})
