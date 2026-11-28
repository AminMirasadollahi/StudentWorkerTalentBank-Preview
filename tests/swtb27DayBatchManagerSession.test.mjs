import test from 'node:test'
import assert from 'node:assert/strict'
import {createDayBatchManagerSession,createManagerAssignmentFence} from '../src/lib/dayBatchManagerSession.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),worker=id(2),term=id(3),key=id(4)
const context={today:'2026-11-27',term:{id:term,state:'active',start_date:'2026-09-23',end_date:'2027-02-09'},workers:[{id:worker,state:'active'}],data:{tasks:[],weekly_slots:[],exceptions:[]}}
const draft={termId:term,defaults:{date:'2026-12-01',unit:'library',reason:''},rows:[{id:'r1',title:'کار نمونه',instructions:'شرح',minutes:45,mode:'independent',workerIds:[worker],date:null,unit:null,reason:null,prerequisiteIds:[]}]}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function fixture(){
 let epoch=7,active=null,calls=[],fail=null,hold=null,seq=4
 const receipt=k=>({ok:true,request_id:k,kind:'batch_direct_v1',result:{term_id:term,rows:[{row_id:'r1',mode:'independent',group_id:null,tasks:[{worker_id:worker,task_id:id(10)}],minutes_per_worker:45}],pair_count:1,standard_person_minutes:45}})
 const reply=(recovery)=>({ok:true,epoch,active,...(recovery?{durable_active:false}:{})})
 const invoke=async(kind,args)=>{
  calls.push([kind,args])
  const action=args.p_action
  if(hold?.action===action){const h=hold;hold=null;await h.wait.promise}
  if(fail?.action===action&&fail.before){fail=null;throw Error('LOST')}
  if(action==='reserve')active={kind:'batch_direct_v1',status:'reserved',request_id:args.p_request_id}
  if(action==='commit')active={...active,status:'committed',receipt:receipt(args.p_request_id)}
  if(action==='cancel')active={...active,status:'cancelled'}
  if(action==='acknowledge'){active=null;epoch++}
  if(fail?.action===action){fail=null;throw Error('LOST')}
  return reply(kind==='control')
 }
 const fence=createManagerAssignmentFence(),s=createDayBatchManagerSession({fence,makeId:()=>id(seq++),write:a=>invoke('write',a),control:a=>invoke('control',a)})
 const verify=()=>s.setAccess({status:'verified',actorId:actor})
 verify()
 return {s,fence,calls,verify,fail:(action,before=false)=>{fail={action,before}},hold:action=>{const wait=deferred();hold={action,wait};return wait},setForeign:()=>{active={kind:'direct',status:'reserved',foreign:true}},advance:()=>{epoch++;active=null}}
}
test('one explicit submit reserves then commits; fresh discovery required for ack and new start',async()=>{
 const f=fixture(),{s,fence,calls}=f
 assert.equal(await s.discover(),'idle');assert.equal(await s.submit(draft,context),'committed');assert.equal(fence.isIdle(),false)
 assert.deepEqual(calls.map(x=>x[1].p_action),['discover','reserve','commit'])
 assert.equal(s.snapshot().receipt.result.standard_person_minutes,45);assert.equal(s.snapshot().canAcknowledge,false)
 assert.equal(await s.discover(),'committed');assert.equal(await s.acknowledge(),'needs_discovery');assert.equal(s.snapshot().canStart,false)
 assert.equal(await s.discover(),'idle');assert.equal(s.snapshot().canStart,true);assert.equal(fence.isIdle(),true)
})
test('lost reserve before server arrival retains same key; same-epoch empty discovery never permits new batch',async()=>{
 const f=fixture(),{s,fence,calls}=f
 await s.discover();f.fail('reserve',true);assert.equal(await s.submit(draft,context),'unknown')
 assert.equal(await s.discover(),'reserve_unknown');assert.equal(s.snapshot().canStart,false);assert.equal(fence.isIdle(),false)
 assert.equal(await s.retryReserve(),'reserved');assert.equal(calls[1][1].p_request_id,calls[3][1].p_request_id);assert.deepEqual(calls[1][1],calls[3][1])
 assert.equal(await s.commit(),'committed')
})
test('lost committed response recovers receipt without implicit retry',async()=>{
 const f=fixture(),{s,calls}=f;await s.discover();f.fail('commit')
 assert.equal(await s.submit(draft,context),'unknown');assert.equal(await s.discover(),'committed')
 assert.equal(calls.filter(x=>x[1].p_action==='commit').length,1);assert.equal(s.snapshot().canAcknowledge,true)
})
test('lost ack only settles after fresh advanced epoch',async()=>{
 const f=fixture(),{s,fence}=f;await s.discover();await s.submit(draft,context);await s.discover();f.fail('acknowledge')
 assert.equal(await s.acknowledge(),'unknown');assert.equal(fence.isIdle(),false)
 assert.equal(await s.discover(),'idle');assert.equal(s.snapshot().canStart,true)
})
test('checking while reserve in flight prevents automatic commit; retained intent can resume explicitly',async()=>{
 const f=fixture(),{s,calls}=f;await s.discover();const h=f.hold('reserve'),p=s.submit(draft,context)
 s.setAccess({status:'checking'});f.verify();assert.equal(await s.discover(),'blocked');h.resolve();assert.equal(await p,'stale')
 assert.equal(calls.filter(x=>x[1].p_action==='commit').length,0);assert.equal(await s.discover(),'reserved');assert.equal(s.snapshot().canCommit,true);assert.equal(await s.commit(),'committed')
})
test('shared lease prevents parallel routes and invalidates earlier idle proof',async()=>{
 const f=fixture(),{s,fence}=f,other={}
 await s.discover();assert.equal(fence.acquire(other),true);assert.equal(await s.reserve(draft,context),'blocked')
 assert.equal(fence.release(other),true);assert.equal(s.snapshot().canStart,false)
 await s.discover();assert.equal(s.snapshot().canStart,true);await s.reserve(draft,context)
 assert.equal(fence.acquire(other),false);assert.equal(await s.discover(),'reserved');assert.equal(await s.cancel(),'cancelled');assert.equal(await s.acknowledge(),'needs_discovery')
 await s.discover();assert.equal(fence.acquire(other),true)
})
test('foreign kind never actionable by batch; clean discovery leaves handoff possible',async()=>{
 const f=fixture(),{s,fence}=f;f.setForeign();assert.equal(await s.discover(),'foreign');assert.equal(s.snapshot().canStart,false);assert.equal(await s.cancel(),'blocked');assert.equal(await s.acknowledge(),'blocked');assert.equal(fence.isIdle(),true)
})
test('actor change disposes old owner without releasing uncertain lease',async()=>{
 const f=fixture(),{s,fence}=f;await s.discover();f.fail('reserve',true);await s.reserve(draft,context);s.setAccess({status:'verified',actorId:id(99)})
 assert.equal(s.snapshot().state,'unavailable');assert.equal(await s.discover(),'blocked');assert.equal(fence.isIdle(),false)
})
test('lost cancel response recovered by discovery; no commit of cancelled key',async()=>{
 const f=fixture(),{s}=f;await s.discover();await s.reserve(draft,context);await s.discover();f.fail('cancel')
 assert.equal(await s.cancel(),'unknown');assert.equal(await s.discover(),'cancelled');assert.equal(await s.commit(),'blocked');assert.equal(await s.acknowledge(),'needs_discovery')
})
