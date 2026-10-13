import test from 'node:test'
import assert from 'node:assert/strict'
import { scopeWorkerHistory, filterWorkerHistory, summarizeWorkerHistory } from '../src/lib/workerHistory.js'

const fixture = () => ({
  workers:[
    {id:'w1',name:'نمونه یک',unit:'library'},
    {id:'w2',name:'نمونه دو',unit:'research'},
    {id:'w3',name:'نمونه سه',unit:'public_relations'},
  ],
  tasks:[
    {id:'t1',worker_id:'w1',unit:'library',state:'completed',planned_date:'2026-10-01'},
    {id:'t2',worker_id:'w1',unit:'library',state:'assigned',planned_date:'2026-10-03'},
    {id:'t3',worker_id:'w1',unit:'library',state:'assigned',planned_date:'2026-10-09'},
    {id:'t4',worker_id:'w2',unit:'research',state:'completed',planned_date:'2026-10-02'},
    {id:'t5',worker_id:'w3',unit:'public_relations',state:'assigned',planned_date:'2026-10-12'},
    {id:'t6',worker_id:'w2',unit:'research',state:'assigned',planned_date:'2026-09-19'},
  ],
  time_entries:[
    {id:'e1',worker_id:'w1',task_id:'t1',work_date:'2026-10-04',review_state:'approved',approved_minutes:90},
    {id:'e2',worker_id:'w1',task_id:'t1',work_date:'2026-10-05',review_state:'submitted',approved_minutes:null},
    {id:'e3',worker_id:'w1',task_id:'t2',work_date:'2026-10-06',review_state:'rejected',approved_minutes:null},
    {id:'e4',worker_id:'w2',task_id:'t4',work_date:'2026-10-04',review_state:'approved',approved_minutes:105},
  ],
})
const ids = items => items.map(x=>x.id)
const filtered = (data,opts) => filterWorkerHistory(data,opts)

test('default combined filter preserves all tasks, reports and authenticated authorized scope',()=>{
  const all=fixture(),result=filtered(all)
  assert.deepEqual(ids(result.tasks),ids(all.tasks))
  assert.deepEqual(ids(result.time_entries),ids(all.time_entries))
  assert.equal(summarizeWorkerHistory(result).approvedMinutes,195)
})

test('worker selection composes with unit + date + review and never leaks other worker records',()=>{
  const all=scopeWorkerHistory(fixture(),'w1')
  const result=filtered(all,{unit:'library',from:'2026-10-04',to:'2026-10-04',review:'approved'})
  assert.deepEqual(ids(result.workers),['w1'])
  assert.deepEqual(ids(result.time_entries),['e1'])
  assert.deepEqual(ids(result.tasks),['t1'])
  assert.equal(summarizeWorkerHistory(result).approvedMinutes,90)
})

test('dates are based on actual report work_date, NOT task planned_date',()=>{
  const out=filtered(fixture(),{from:'2026-10-04',to:'2026-10-05'})
  assert.deepEqual(ids(out.time_entries),['e1','e2','e4'])
  assert.deepEqual(ids(out.tasks),['t1','t4'])
  assert.equal(summarizeWorkerHistory(out).pendingCount,1)
})

test('tasks genuinely without reports use planned_date for boundaries',()=>{
  const out=filtered(fixture(),{review:'without_report',from:'2026-10-09',to:'2026-10-12'})
  assert.deepEqual(ids(out.time_entries),[])
  assert.deepEqual(ids(out.tasks),['t3','t5'])
  const unit=filtered(fixture(),{unit:'research',review:'without_report'})
  assert.deepEqual(ids(unit.tasks),['t6'])
})

test('review filters do not invent report-free tasks for records hidden by the filter',()=>{
  const out=filtered(fixture(),{review:'approved'})
  assert.deepEqual(ids(out.time_entries),['e1','e4'])
  assert.deepEqual(ids(out.tasks),['t1','t4'])
  const out2=filtered(fixture(),{review:'submitted'})
  assert.deepEqual(ids(out2.tasks),['t1'])
  assert.deepEqual(ids(out2.time_entries),['e2'])
  const date=filtered(fixture(),{from:'2026-10-02',to:'2026-10-03'})
  assert.deepEqual(ids(date.time_entries),[])
  assert.deepEqual(ids(date.tasks),[], 'task planned 10/03 has a report dated 10/06 and is not report-free')
})

test('filter unit uses recorded task unit; does not expand to other workers',()=>{
  const result=filtered(scopeWorkerHistory(fixture(),'w1'),{unit:'research'})
  assert.deepEqual(ids(result.workers),['w1'])
  assert.deepEqual(ids(result.tasks),[])
  assert.deepEqual(ids(result.time_entries),[])
  const result2=filtered(fixture(),{unit:'research'})
  assert.deepEqual(ids(result2.tasks),['t4','t6'])
  assert.deepEqual(ids(result2.time_entries),['e4'])
})

test('exact inclusive date boundaries and reversed ranges fail closed',()=>{
  const target=filtered(fixture(),{from:'2026-10-06',to:'2026-10-06'})
  assert.deepEqual(ids(target.time_entries),['e3'])
  for(const bad of [
    {from:'2026-10-12',to:'2026-10-01'},
    {from:'yesterday'},{to:'02/10/2026'},
  ]){
    const out=filtered(fixture(),bad)
    assert.deepEqual(ids(out.tasks),[])
    assert.deepEqual(ids(out.time_entries),[])
  }
})

test('unknown worker id does not fall back to combined history after any filter',()=>{
  const worker=scopeWorkerHistory(fixture(),'not-found')
  const out=filtered(worker,{review:'approved'})
  assert.deepEqual(out,{workers:[],tasks:[],time_entries:[]})
})

test('filtered presentation is immutable and performance profile remains independent',()=>{
  const all=fixture(), before=JSON.stringify(all)
  const scoped=scopeWorkerHistory(all,'w1')
  const overall=summarizeWorkerHistory(scoped)
  const selected=summarizeWorkerHistory(filtered(scoped,{review:'approved',from:'2026-10-04',to:'2026-10-04'}))
  assert.equal(overall.openCount,2)
  assert.equal(selected.openCount,0)
  assert.equal(overall.reportCount,3)
  assert.equal(selected.reportCount,1)
  assert.equal(JSON.stringify(all),before)
})
