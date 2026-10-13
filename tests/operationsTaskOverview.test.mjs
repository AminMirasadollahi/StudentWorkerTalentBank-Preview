import test from 'node:test'
import assert from 'node:assert/strict'
import {
  describeTaskWorkflow,selectManagerTasks,summarizeTaskWorkflow,
  classifyTimeRequest,selectPendingApprovals,
} from '../src/lib/operationsTaskOverview.mjs'

const fixture=()=>({
  workers:[{id:'w1',name:'نمونه یک'},{id:'w2',name:'نمونه دو'}],
  tasks:[
    {id:'a1',worker_id:'w1',title:'مرتب‌سازی کتاب‌ها',state:'assigned',
      planned_date:'2026-10-10',created_at:'2026-10-09T10:00:00Z',estimate_minutes:90},
    {id:'a2',worker_id:'w1',title:'ثبت گزارش',state:'in_progress',
      planned_date:'2026-10-13',created_at:'2026-10-09T11:00:00Z',estimate_minutes:60},
    {id:'a3',worker_id:'w2',title:'جمع‌بندی',state:'submitted',
      planned_date:'2026-10-12',created_at:'2026-10-08T10:00:00Z',estimate_minutes:30},
    {id:'a4',worker_id:'w1',title:'بازنگری',state:'needs_changes',
      planned_date:'2026-10-11',created_at:'2026-10-07T10:00:00Z',estimate_minutes:50},
    {id:'a5',worker_id:'w2',title:'تحویل نهایی',state:'completed',
      planned_date:'2026-10-07',created_at:'2026-10-06T10:00:00Z',estimate_minutes:75},
    {id:'a6',worker_id:'w2',title:'لغو شده',state:'cancelled',
      planned_date:'2026-10-13',created_at:'2026-10-07T10:00:00Z',estimate_minutes:45},
  ],
  time_entries:[
    {id:'e1',task_id:'a5',worker_id:'w2',review_state:'approved',
      reported_minutes:75,approved_minutes:75,submitted_at:'2026-10-09T14:00:00Z'},
    {id:'e2',task_id:'a3',worker_id:'w2',review_state:'submitted',
      reported_minutes:30,submitted_at:'2026-10-10T14:00:00Z'},
    {id:'e3',task_id:'a4',worker_id:'w1',review_state:'submitted',
      reported_minutes:65,submitted_at:'2026-10-09T14:00:00Z'},
    {id:'e4',task_id:'a2',worker_id:'w1',review_state:'submitted',
      reported_minutes:60,submitted_at:'2026-10-11T14:00:00Z'},
    {id:'e5',task_id:'orphan',worker_id:'w2',review_state:'submitted',
      reported_minutes:70,submitted_at:'2026-10-08T14:00:00Z'},
    {id:'e6',task_id:'a1',worker_id:'w1',review_state:'rejected',
      reported_minutes:90,submitted_at:'2026-10-01T14:00:00Z'},
  ],
})
const ids=items=>items.map(i=>i.id)

test('task stages are categorical, cancelled/unknown do not imply percentage completion',()=>{
  const x=fixture()
  assert.deepEqual(x.tasks.map(t=>describeTaskWorkflow(t).step),[1,2,3,2,4,null])
  assert.equal(describeTaskWorkflow({state:'unknown'}).label,'وضعیت نامشخص')
  assert.equal(describeTaskWorkflow(x.tasks[4],x.time_entries).approvedMinutes,75)
  assert.equal(describeTaskWorkflow(x.tasks[4],x.time_entries).reportCount,1)
  assert.equal(describeTaskWorkflow(x.tasks[2],x.time_entries).waitingCount,1)
  assert.equal(describeTaskWorkflow(x.tasks[0]).approvedMinutes,0)
  assert.ok(!Object.hasOwn(describeTaskWorkflow(x.tasks[4]),'percent'))
})
test('task workflow counts reflect exact persisted states, not report-derived guesses',()=>{
  const result=summarizeTaskWorkflow(fixture().tasks)
  assert.deepEqual(result,{total:6,open:4,waiting:1,completed:1,
    cancelled:1,needsChanges:1})
})
test('manager task filters compose by worker, exact state and Persian title',()=>{
  const x=fixture()
  assert.deepEqual(ids(selectManagerTasks(x,{workerId:'w1',state:'assigned',search:'کتاب'})),['a1'])
  assert.deepEqual(ids(selectManagerTasks(x,{workerId:'w2',state:'completed'})),['a5'])
  assert.deepEqual(ids(selectManagerTasks(x,{search:'غیرواقعی'})),[])
  assert.deepEqual(ids(selectManagerTasks(x,{workerId:'no-such-worker'})),[])
  assert.deepEqual(ids(selectManagerTasks(x,{search:'  گزارش  '})),['a2'])
})
test('task list defaults newest scheduled first; explicit oldest reverses and is deterministic',()=>{
  const x=fixture()
  assert.deepEqual(ids(selectManagerTasks(x)).slice(0,2),['a2','a6'])
  assert.deepEqual(ids(selectManagerTasks(x,{order:'oldest'})).slice(0,2),['a5','a1'])
  const before=JSON.stringify(x)
  selectManagerTasks(x,{order:'oldest'})
  assert.equal(JSON.stringify(x),before)
})
test('pending queue includes only submitted reports, oldest first, irrespective of task status',()=>{
  const x=fixture()
  assert.deepEqual(ids(selectPendingApprovals(x)),['e5','e3','e2','e4'])
  assert.equal(selectPendingApprovals(x).some(e=>e.review_state!=='submitted'),false)
  assert.deepEqual(ids(selectPendingApprovals(x,{workerId:'w1'})),['e3','e4'])
})
test('extra-time filter is not inferred when linked task or standard is absent',()=>{
  const x=fixture()
  const taskIndex=new Map(x.tasks.map(t=>[t.id,t]))
  assert.equal(classifyTimeRequest(x.time_entries[2],taskIndex.get('a4')),'extra')
  assert.equal(classifyTimeRequest(x.time_entries[1],taskIndex.get('a3')),'standard')
  assert.equal(classifyTimeRequest(x.time_entries[4],undefined),'unknown')
  assert.deepEqual(ids(selectPendingApprovals(x,{kind:'extra'})),['e3'])
  assert.deepEqual(ids(selectPendingApprovals(x,{kind:'standard'})),['e2','e4'])
  assert.deepEqual(ids(selectPendingApprovals(x,{kind:'unknown'})),['e5'])
})
test('approved hours never include rejected, submitted or guessed duration',()=>{
  const x=fixture()
  const completed=x.tasks.find(t=>t.id==='a5')
  const y=describeTaskWorkflow(completed,x.time_entries)
  assert.equal(y.approvedMinutes,75)
  const task=x.tasks.find(t=>t.id==='a4')
  assert.equal(describeTaskWorkflow(task,x.time_entries).approvedMinutes,0)
})
