import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDirectAssignmentPayload,validateDirectAssignmentReceipt,createDirectAssignmentSession,fixtureVerifiedRollback} from '../src/lib/directAssignmentSession.mjs'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const A=id(1),B=id(2),W=id(10),X=id(11),K=id(100),T=id(200)
const draft={kind:'direct',workerIds:[W],unit:'library',title:' QA title ',instructions:'شرح آزمایشی',date:'2026-12-01',minutes:60,startMinute:null,endMinute:null,reason:null}
const direct=p=>({ok:true,request_id:p.p_request_id,kind:p.p_kind,result:{id:T,state:'assigned',short_notice:false}})
const group=p=>({ok:true,request_id:p.p_request_id,kind:p.p_kind,result:{ok:true,group_id:T,member_count:p.p_worker_ids.length,minutes_per_worker:p.p_estimate_minutes,unit_code:p.p_unit_code}})
const desk=p=>({ok:true,request_id:p.p_request_id,kind:p.p_kind,result:{ok:true,assigned:p.p_worker_ids.map((worker_id,i)=>({worker_id,task_id:id(200+i)})),shift_date:p.p_planned_date,start_minute:p.p_start_minute,end_minute:p.p_end_minute,minutes_per_worker:p.p_end_minute-p.p_start_minute}})
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const fixture=(write=async p=>direct(p),read=async()=>({found:false}),makeId=()=>K)=>{
 const calls=[],reads=[]
 const s=createDirectAssignmentSession({makeId,write:p=>{calls.push(p);return write(p)},read:k=>{reads.push(k);return read(k)}})
 s.setAccess({status:'verified',actorId:A})
 return {s,calls,reads}
}
test('payload exact typed contract, Unicode and immutable sorted member IDs',()=>{
 const p=buildDirectAssignmentPayload({...draft,workerIds:[X,W],instructions:'ا'.repeat(3000)},K)
 assert.deepEqual(p.p_worker_ids,[W,X]);assert.equal(p.p_title,'QA title');assert.equal(p.p_instructions.length,3000)
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.p_worker_ids));assert.equal(Object.keys(p).length,11)
 assert.throws(()=>buildDirectAssignmentPayload({...draft,instructions:'ا'.repeat(3001)},K))
 assert.throws(()=>buildDirectAssignmentPayload({...draft,instructions:'\uD800'},K))
 assert.throws(()=>buildDirectAssignmentPayload({...draft,workerIds:[W,W]},K))
 assert.throws(()=>buildDirectAssignmentPayload({...draft,date:'2026-02-30'},K))
 assert.throws(()=>buildDirectAssignmentPayload({...draft,minutes:'60'},K))
 assert.throws(()=>buildDirectAssignmentPayload({...draft,extra:true},K))
})
test('direct, group and desk receipts require exact key and contract',()=>{
 const a=buildDirectAssignmentPayload(draft,K)
 assert.ok(validateDirectAssignmentReceipt(direct(a),a))
 assert.equal(validateDirectAssignmentReceipt({...direct(a),request_id:id(101)},a),null)
 assert.equal(validateDirectAssignmentReceipt({...direct(a),result:{}},a),null)
 const b=buildDirectAssignmentPayload({...draft,workerIds:[X,W]},K)
 assert.ok(validateDirectAssignmentReceipt(group(b),b))
 assert.equal(validateDirectAssignmentReceipt({...group(b),result:{...group(b).result,member_count:1}},b),null)
 const c=buildDirectAssignmentPayload({...draft,kind:'desk',workerIds:[W,X],minutes:null,startMinute:480,endMinute:540},K)
 assert.ok(validateDirectAssignmentReceipt(desk(c),c))
 const r=desk(c);r.result.assigned[1].task_id=r.result.assigned[0].task_id
 assert.equal(validateDirectAssignmentReceipt(r,c),null)
 assert.equal(validateDirectAssignmentReceipt({...desk(c),result:{...desk(c).result,end_minute:541}},c),null)
})
test('one in-flight submission, immutable original draft, confirmed acknowledgment only',async()=>{
 const d=deferred(),{s,calls}=fixture(()=>d.promise)
 const local={...draft,workerIds:[W]}
 const first=s.submit(local);local.title='changed';local.workerIds.push(X)
 assert.equal(s.snapshot().state,'sending');assert.equal(await s.submit(draft),'blocked')
 assert.equal(await s.retry(),'blocked');assert.equal(await s.reconcile(),'blocked');assert.equal(s.acknowledge(),false)
 assert.equal(calls.length,1);assert.equal(calls[0].p_title,'QA title');assert.deepEqual(calls[0].p_worker_ids,[W])
 d.resolve(direct(calls[0]));assert.equal(await first,'confirmed')
 assert.equal(s.acknowledge(),true);assert.equal(s.snapshot().state,'idle')
 assert.equal(await s.submit(draft),'invalid');assert.equal(calls.length,1)
})
test('lost response read recovery confirms, no second write',async()=>{
 let original
 const {s,calls,reads}=fixture(async p=>{original=direct(p);throw Error('disconnect')},async()=>({found:true,receipt:original}))
 assert.equal(await s.submit(draft),'unknown');assert.equal(await s.retry(),'blocked')
 assert.equal(await s.submit(draft),'blocked');assert.equal(await s.reconcile(),'confirmed')
 assert.equal(calls.length,1);assert.deepEqual(reads,[K]);assert.equal(s.snapshot().receipt.result.id,T)
})
test('missing receipt allows only explicit replay of exact frozen object',async()=>{
 let count=0
 const {s,calls,reads}=fixture(async p=>{if(++count===1)throw Error('timeout');return direct(p)})
 assert.equal(await s.submit(draft),'unknown');assert.equal(await s.reconcile(),'unknown')
 assert.equal(s.snapshot().retryReady,true);assert.equal(calls.length,1)
 assert.equal(await s.submit({...draft,title:'different'}),'blocked')
 assert.equal(await s.retry(),'confirmed');assert.equal(calls.length,2);assert.equal(calls[0],calls[1]);assert.deepEqual(reads,[K])
})
test('malformed write/read and thrown lookup never mark confirmed or unlock retry',async()=>{
 const {s,calls}=fixture(async()=>({ok:true}),async()=>({found:true,receipt:{}}))
 assert.equal(await s.submit(draft),'unknown');assert.equal(await s.reconcile(),'unknown')
 assert.equal(s.snapshot().retryReady,false);assert.equal(await s.retry(),'blocked');assert.equal(calls.length,1)
 const g=fixture(async()=>{throw Error('network')},async()=>{throw Error('read failed')})
 await g.s.submit(draft);await g.s.reconcile();assert.equal(g.s.snapshot().retryReady,false)
})
test('checking hides data and blocks actions; same actor keeps pending state',async()=>{
 const d=deferred(),{s,calls}=fixture(()=>d.promise)
 const sending=s.submit(draft);s.setAccess({status:'checking'})
 assert.deepEqual(s.snapshot(),{state:'checking'})
 assert.equal(await s.submit(draft),'blocked');assert.equal(await s.reconcile(),'blocked')
 d.resolve(direct(calls[0]));assert.equal(await sending,'hidden')
 assert.deepEqual(s.snapshot(),{state:'checking'})
 s.setAccess({status:'verified',actorId:A});assert.equal(s.snapshot().state,'confirmed')
})
test('checking invalidates retry readiness; another read required',async()=>{
 const {s,calls}=fixture(async()=>{throw Error('network')})
 await s.submit(draft);await s.reconcile();assert.equal(s.snapshot().retryReady,true)
 s.setAccess({status:'checking'});s.setAccess({status:'verified',actorId:A})
 assert.equal(s.snapshot().retryReady,false);assert.equal(await s.retry(),'blocked');assert.equal(calls.length,1)
})
test('denial, switch and dispose invalidate old in-flight callbacks',async()=>{
 for(const change of [s=>s.setAccess({status:'denied'}),s=>s.setAccess({status:'verified',actorId:B}),s=>s.dispose()]){
  const d=deferred(),{s,calls}=fixture(()=>d.promise)
  const sending=s.submit(draft);change(s)
  d.resolve(direct(calls[0]));assert.equal(await sending,'stale')
  assert.ok(['unavailable','idle'].includes(s.snapshot().state));assert.equal(s.snapshot().payload,undefined)
 }
})
test('late lookup cannot overwrite new actor state',async()=>{
 const d=deferred(),{s}=fixture(async()=>{throw Error('timeout')},()=>d.promise)
 await s.submit(draft);const reading=s.reconcile()
 s.setAccess({status:'verified',actorId:B});d.resolve({found:false})
 assert.equal(await reading,'stale');assert.deepEqual(s.snapshot(),{state:'idle'})
})
test('new instance does not recover browser reload or use storage automatically',async()=>{
 const f=fixture(async()=>{throw Error('timeout')});await f.s.submit(draft)
 const fresh=fixture();assert.deepEqual(fresh.s.snapshot(),{state:'idle'});assert.equal(fresh.calls.length,0)
})

test('read started before recheck cannot enable replay even after same actor reverified',async()=>{
 const d=deferred(),{s,calls}=fixture(async()=>{throw Error('timeout')},()=>d.promise)
 await s.submit(draft);const reading=s.reconcile()
 s.setAccess({status:'checking'});s.setAccess({status:'verified',actorId:A})
 d.resolve({found:false});assert.equal(await reading,'unknown')
 assert.equal(s.snapshot().retryReady,false);assert.equal(await s.retry(),'blocked');assert.equal(calls.length,1)
})

test('trusted synthetic first-attempt rejection preserves draft and permits explicit revision',async()=>{
 const keys=[K,id(101)]
 const {s,calls}=fixture(async p=>calls.length===1?fixtureVerifiedRollback('worker_not_eligible_for_term'):direct(p),undefined,()=>keys.shift())
 assert.equal(await s.submit(draft),'rejected')
 assert.equal(s.snapshot().rejectionCode,'worker_not_eligible_for_term')
 assert.equal(s.acknowledge(),false);assert.equal(await s.retry(),'blocked');assert.equal(await s.submit(draft),'blocked')
 const original=s.reviseRejected();assert.equal(original.p_instructions,draft.instructions);assert.equal(s.snapshot().state,'idle')
 assert.equal(await s.submit({...draft,title:'Revised task'}),'confirmed')
 assert.ok(calls[0].p_request_id!==calls[1].p_request_id)
})
test('raw error shape, thrown proof and unrecognized code cannot prove rollback',async()=>{
 for(const write of [async()=>({code:'worker_not_active',status:400}),async()=>{throw fixtureVerifiedRollback('worker_not_active')},async()=>fixtureVerifiedRollback('not_a_verified_code')]){
  const {s}=fixture(write);assert.equal(await s.submit(draft),'unknown');assert.equal(s.reviseRejected(),null)
 }
})
test('replay rejection stays unknown because prior commit may exist',async()=>{
 let n=0
 const {s,calls}=fixture(async()=>{if(++n===1)throw Error('network');return fixtureVerifiedRollback('worker_not_active')})
 await s.submit(draft);await s.reconcile();assert.equal(await s.retry(),'unknown');assert.equal(s.snapshot().retryReady,false);assert.equal(s.reviseRejected(),null);assert.equal(calls.length,2)
})
