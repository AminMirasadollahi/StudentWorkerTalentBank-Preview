import test from 'node:test'
import assert from 'node:assert/strict'
import {projectWorkerReportActivity} from '../src/lib/workerReportActivity.mjs'
import {filterWorkerHistory} from '../src/lib/workerHistory.js'
import {selectManagerTasks,selectPendingApprovals} from '../src/lib/operationsTaskOverview.mjs'

// All records below are completely fictitious; no connection to live Supabase.
const workers=[{id:'FAKE-1',name:'عضو آزمایشی',unit:'library'}]
const tasks=[
 {id:'T-RESEARCH',worker_id:'FAKE-1',unit:'research',title:'کار پژوهشی',planned_date:'2026-10-28',state:'completed'},
 {id:'T-LIBRARY',worker_id:'FAKE-1',unit:'library',title:'کار کتابخانه',planned_date:'2026-10-29',state:'submitted'},
]
const entries=[
 {id:'E-RESEARCH',worker_id:'FAKE-1',task_id:'T-RESEARCH',work_date:'2026-10-28',
   review_state:'approved',reported_minutes:80,approved_minutes:65},
 {id:'E-LIBRARY',worker_id:'FAKE-1',task_id:'T-LIBRARY',work_date:'2026-10-29',
   review_state:'submitted',reported_minutes:60,approved_minutes:null},
]
test('self report ledger attributes minutes to the linked task unit, not enrollment',()=>{
 const projected=projectWorkerReportActivity(entries,tasks)
 assert.equal(projected.find(e=>e.id==='E-RESEARCH').unit,'research')
 assert.equal(projected.find(e=>e.id==='E-LIBRARY').unit,'library')
 assert.equal(projected.find(e=>e.id==='E-RESEARCH').approved_minutes,65)
 assert.equal(projected.find(e=>e.id==='E-LIBRARY').approved_minutes,null)
})
test('manager history unit filter scopes real task unit and NEVER substitutes worker signup unit',()=>{
 const scoped={workers,tasks,time_entries:entries}
 const research=filterWorkerHistory(scoped,{unit:'research'})
 assert.deepEqual(research.time_entries.map(e=>e.id),['E-RESEARCH'])
 const library=filterWorkerHistory(scoped,{unit:'library'})
 assert.deepEqual(library.time_entries.map(e=>e.id),['E-LIBRARY'])
 const missing=filterWorkerHistory({workers,tasks:[],time_entries:entries},{unit:'library'})
 assert.equal(missing.time_entries.length,0,'missing task MUST NOT inherit library enrollment unit')
})
test('manager work and approval filters use actual assigned unit',()=>{
 assert.deepEqual(selectManagerTasks({tasks},{unit:'research'}).map(t=>t.id),['T-RESEARCH'])
 assert.deepEqual(selectManagerTasks({tasks},{unit:'library'}).map(t=>t.id),['T-LIBRARY'])
 assert.deepEqual(selectPendingApprovals({tasks,time_entries:entries},{unit:'library'}).map(e=>e.id),['E-LIBRARY'])
 assert.deepEqual(selectPendingApprovals({tasks,time_entries:entries},{unit:'research'}).map(e=>e.id),[])
})
