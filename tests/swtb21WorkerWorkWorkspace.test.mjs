import test from 'node:test'
import assert from 'node:assert/strict'
import {locateClaimedWorkerTask} from '../src/lib/workerTaskFocus.mjs'
const today='2026-11-24'
const tasks=[
 {id:'today',state:'assigned',planned_date:today},
 {id:'overdue',state:'in_progress',planned_date:'2026-11-20'},
 {id:'future',state:'assigned',planned_date:'2026-11-25'},
 {id:'submitted',state:'submitted',planned_date:today},
 {id:'completed',state:'completed',planned_date:today},
 {id:'cancelled',state:'cancelled',planned_date:today},
 {id:'correction',state:'needs_changes',planned_date:'2026-11-25'},
]
test('receipt routing uses the exact canonical task ID and existing task focus rules',()=>{
 for(const [id,view] of [['today','action'],['overdue','action'],['future','upcoming'],['submitted','pending'],['completed','completed'],['correction','action']])
  assert.equal(locateClaimedWorkerTask(tasks,today,id),view)
})
test('receipt routing cannot infer an unseen or cancelled task',()=>{
 for(const id of ['cancelled','not-found','',null])assert.equal(locateClaimedWorkerTask(tasks,today,id),null)
 assert.equal(locateClaimedWorkerTask(null,today,'today'),null)
 assert.equal(locateClaimedWorkerTask([],today,'today'),null)
})
