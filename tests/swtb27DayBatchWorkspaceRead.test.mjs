import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDayBatchWorkspaceContext,createDayBatchWorkspaceReadGate,validWorkspaceWorkRead} from '../src/lib/dayBatchWorkspaceRead.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const today='2026-11-28',term={id:id(1),state:'active',start_date:'2026-09-23',end_date:'2027-02-09'}
const makeWork=()=>({workers:[{id:id(2),state:'active'}],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
const dashboard=(overrides={})=>({ok:true,term,terms:[term],units:[],weeks:[],workers:[],pools:[],filters:{unit_code:null,worker_id:null},allocation_scope:'all_workers',...overrides})
test('exact work identity, explicit matching active term; no inferred eligibility',()=>{
 const work=makeWork(),c=buildDayBatchWorkspaceContext(work,dashboard(),today)
 assert.equal(c.data,work);assert.equal(c.workers,work.workers);assert.equal(c.term.id,term.id)
 assert.equal(Object.isFrozen(c),true);assert.equal(Object.isFrozen(c.term),true)
 assert.equal(validWorkspaceWorkRead({...work,time_entries:null}),false)
})
test('missing, conflicting, historical, malformed, duplicate or out-of-date term cannot enable batch',()=>{
 const work=makeWork()
 for(const d of [null,dashboard({ok:false}),dashboard({term:null,terms:[]}),dashboard({terms:[term,{...term,id:id(3)}]}),dashboard({term:{...term,state:'closed'}}),dashboard({term:{...term,end_date:'2027-02-10'}}),dashboard({terms:[term,{...term,state:'draft'}]}),dashboard({term:{...term,id:'invalid'},terms:[{...term,id:'invalid'}]})])assert.equal(buildDayBatchWorkspaceContext(work,d,today),null)
 assert.equal(buildDayBatchWorkspaceContext(work,dashboard(),'2027-02-10'),null)
 assert.equal(buildDayBatchWorkspaceContext({...work,workers:[work.workers[0],work.workers[0]]},dashboard(),today),null)
})
test('term proof failure leaves valid work proof; later stale result cannot reopen gate',()=>{
 const g=createDayBatchWorkspaceReadGate(),w=makeWork(),a=g.begin()
 assert.equal(a.acceptWork(w),true);assert.equal(g.hasWork(),true)
 assert.equal(a.acceptTerm(dashboard({term:null}),today),false);assert.equal(g.contextFor(w),null);assert.equal(g.hasWork(),true)
 assert.equal(a.acceptTerm(dashboard(),today),false)
 const b=g.begin(),w2=makeWork()
 assert.equal(a.isCurrent(),false);assert.equal(a.acceptTerm(dashboard(),today),false)
 assert.equal(b.acceptTerm(dashboard(),today),false);assert.equal(b.acceptWork(w2),true)
 assert.equal(b.acceptTerm(dashboard(),today),true);assert.equal(g.contextFor(w),null);assert.equal(g.contextFor(w2).data,w2)
 g.invalidate();assert.equal(g.contextFor(w2),null);assert.equal(g.hasWork(),false)
})
test('out of order work read, denied work and owner invalidation reject every stale proof',()=>{
 const g=createDayBatchWorkspaceReadGate(),w=makeWork(),old=g.begin(),current=g.begin()
 assert.equal(old.acceptWork(w),false);assert.equal(current.acceptWork({}),false)
 assert.equal(current.acceptWork(w),false);assert.equal(current.acceptTerm(dashboard(),today),false)
 const a=g.begin();assert.equal(a.acceptWork(w),true);g.invalidate()
 assert.equal(a.acceptTerm(dashboard(),today),false);assert.equal(g.contextFor(w),null)
})

test('filtered, incomplete or non-global dashboard cannot prove active assignment term',()=>{
 const work=makeWork()
 for(const d of [dashboard({filters:undefined}),dashboard({filters:{unit_code:'library',worker_id:null}}),dashboard({filters:{unit_code:null,worker_id:id(2)}}),dashboard({filters:{unit_code:null}}),dashboard({allocation_scope:'not_applicable_to_worker_slice'}),dashboard({allocation_scope:undefined})])assert.equal(buildDayBatchWorkspaceContext(work,d,today),null)
})
