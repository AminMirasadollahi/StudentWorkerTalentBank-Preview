import test from 'node:test'
import assert from 'node:assert/strict'
import {createManagerAssignmentFence} from '../src/lib/dayBatchManagerSession.mjs'
import {createDeskCancelManagerSession} from '../src/lib/deskCancelManagerSession.mjs'
import {buildDeskCancelPlan,prepareDeskCancelIntent,parseDeskCancelSnapshot,deskCancelCommitArgs,deskCancelReserveArgs,deskCancelControlArgs} from '../src/lib/deskCancelContract.mjs'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),worker=id(2),key=id(4),day='2026-11-28',shiftId=id(20),taskId=id(21)
const shift={id:shiftId,task_id:taskId,worker_id:worker,shift_date:day,start_minute:480,end_minute:540,state:'scheduled'}
const context={day,shifts:{ok:true,from:day,to:day,shifts:[shift]},work:{tasks:[{id:taskId,worker_id:worker,unit:'library',planned_date:day,estimate_minutes:60,state:'assigned'}],time_entries:[]}}
const draft={shiftId,reason:'  دلیل نمونه  '}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function fixture(){
 let epoch=7,active=null,calls=[],fail=null,hold=null,seq=4
 const receipt=k=>({ok:true,request_id:k,kind:'desk_cancel_v1',result:{shift_id:shiftId,task_id:taskId,state:'cancelled'}})
 const reply=(recovery)=>({ok:true,epoch,active,...(recovery?{durable_active:false}:{})})
 const invoke=async(kind,args)=>{
  calls.push([kind,args])
  const action=args.p_action
  if(hold?.action===action){const h=hold;hold=null;await h.wait.promise}
  if(fail?.action===action&&fail.before){fail=null;throw Error('LOST')}
  if(action==='reserve')active={kind:'desk_cancel_v1',status:'reserved',request_id:args.p_request_id}
  if(action==='commit')active={...active,status:'committed',receipt:receipt(args.p_request_id)}
  if(action==='cancel')active={...active,status:'cancelled'}
  if(action==='acknowledge'){active=null;epoch++}
  if(fail?.action===action){fail=null;throw Error('LOST')}
  return reply(kind==='control')
 }
 const fence=createManagerAssignmentFence(),s=createDeskCancelManagerSession({fence,makeId:()=>id(seq++),write:a=>invoke('write',a),control:a=>invoke('control',a)})
 const verify=()=>s.setAccess({status:'verified',actorId:actor})
 verify()
 return {s,fence,calls,verify,fail:(action,before=false)=>{fail={action,before}},hold:action=>{const wait=deferred();hold={action,wait};return wait},setForeign:()=>{active={kind:'direct',status:'reserved',foreign:true}},advance:()=>{epoch++;active=null},regress:()=>{epoch--},setReserved:()=>{active={kind:'desk_cancel_v1',status:'reserved',request_id:key}}}
}
test('one explicit submit reserves then commits; fresh discovery required for ack and new start',async()=>{
 const f=fixture(),{s,fence,calls}=f
 assert.equal(await s.discover(),'idle');assert.equal(await s.submit(draft,context),'committed');assert.equal(fence.isIdle(),false)
 assert.deepEqual(calls.map(x=>x[1].p_action),['discover','reserve','commit'])
 assert.deepEqual(s.snapshot().receipt.result,{shift_id:shiftId,task_id:taskId,state:'cancelled'});assert.equal(s.snapshot().canAcknowledge,false)
 assert.equal(await s.discover(),'committed');assert.equal(await s.acknowledge(),'needs_discovery');assert.equal(s.snapshot().canStart,false)
 assert.equal(await s.discover(),'idle');assert.equal(s.snapshot().canStart,true);assert.equal(fence.isIdle(),true)
})
test('lost reserve before server arrival retains same key; same-epoch empty discovery never permits new cancellation',async()=>{
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
test('foreign kind never actionable by cancellation; clean discovery leaves handoff possible',async()=>{
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

test('exact typed args, canonical reason, branded plan and reservation, target-bound receipt',()=>{
 const idle=parseDeskCancelSnapshot({ok:true,epoch:7,active:null,durable_active:false},{source:'discover'})
 const plan=buildDeskCancelPlan(draft,context),intent=prepareDeskCancelIntent(plan,key,idle)
 assert.throws(()=>prepareDeskCancelIntent({...plan},key,idle))
 const args=deskCancelReserveArgs(intent)
 assert.deepEqual(args,{p_action:'reserve',p_epoch:7,p_request_id:key,p_shift_id:shiftId,p_task_id:taskId,p_worker_id:worker,p_day:day,p_start_minute:480,p_end_minute:540,p_reason:'دلیل نمونه'})
 const reserved={ok:true,epoch:7,active:{kind:'desk_cancel_v1',status:'reserved',request_id:key}}
 const parsed=parseDeskCancelSnapshot(reserved,{source:'write',intent})
 assert.throws(()=>deskCancelCommitArgs(intent,{...parsed}))
 assert.deepEqual(deskCancelCommitArgs(intent,parsed),{...args,p_action:'commit'})
 const raw={...reserved,active:{...reserved.active,status:'committed',receipt:{ok:true,kind:'desk_cancel_v1',request_id:key,result:{shift_id:shiftId,task_id:taskId,state:'cancelled'}}}}
 assert.equal(parseDeskCancelSnapshot(raw,{source:'write',intent}).state,'committed')
 for(const result of [{...raw.active.receipt.result,task_id:id(99)},{...raw.active.receipt.result,reason:'secret'},{...raw.active.receipt.result,state:'assigned'}])
  assert.equal(parseDeskCancelSnapshot({...raw,active:{...raw.active,receipt:{...raw.active.receipt,result}}},{source:'write',intent}).state,'invalid')
 assert.equal(parseDeskCancelSnapshot(raw,{source:'write'}).state,'invalid')
})
test('invalid reason, stale or incomplete projection never constructs a plan',()=>{
 for(const reason of ['    ','abc','x'.repeat(501),'abcd\0e','abcd\uD800'])assert.throws(()=>buildDeskCancelPlan({...draft,reason},context))
 assert.throws(()=>buildDeskCancelPlan(draft,{...context,work:{tasks:[],time_entries:[]}}))
 assert.throws(()=>buildDeskCancelPlan(draft,{...context,shifts:{...context.shifts,shifts:[{...shift,state:'cancelled'}]}}))
})
test('fresh host can abandon recovered reservation but cannot reconstruct commit',async()=>{
 const f=fixture();f.setReserved();assert.equal(await f.s.discover(),'reserved')
 assert.equal(f.s.snapshot().canCommit,false);assert.equal(await f.s.commit(),'blocked')
 assert.equal(await f.s.cancel(),'cancelled');assert.equal(f.calls.filter(x=>x[1].p_action==='commit').length,0)
})
test('successful acknowledge cannot be reopened by stale lower epoch idle',async()=>{
 const f=fixture();await f.s.discover();await f.s.submit(draft,context);await f.s.discover()
 assert.equal(await f.s.acknowledge(),'needs_discovery');f.regress()
 assert.equal(await f.s.discover(),'unknown');assert.equal(f.s.snapshot().canStart,false)
 f.advance();assert.equal(await f.s.discover(),'idle')
})
test('foreign typed owner, held window and malformed snapshots fail closed',()=>{
 const parse=active=>parseDeskCancelSnapshot({ok:true,epoch:7,active,durable_active:false},{source:'discover'})
 for(const kind of ['direct','desk','batch_direct_v1']){
  const s=parse({kind,status:'reserved',foreign:true});assert.equal(s.state,'foreign');assert.throws(()=>deskCancelControlArgs('cancel',s))
 }
 assert.equal(parse({kind:'batch_direct_v1',status:'committed',foreign:true,receipt:{}}).state,'invalid')
 assert.equal(parseDeskCancelSnapshot({ok:true,epoch:7,active:null,durable_active:true},{source:'discover'}).state,'held')
})
