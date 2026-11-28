import test from 'node:test'
import assert from 'node:assert/strict'
import {createWindowDurableRecoveryReview,parseWindowDurableSlot} from '../src/lib/windowDurableRecoveryReview.mjs'
import {id,worker,self,manager} from './browser/windowReadReviewFixtureData.mjs'
const wc={status:'verified',role:'worker',actorId:id(99),workerId:worker,ready:true}
const mc={status:'verified',role:'manager',actorId:id(98)}
const holds=['window_extension','late_submission','correction','term_closure_policy','post_assignment_eligibility_policy','window_prerequisite_edit','nonapproval_review','batch_write']
const cap=c=>({contract_version:3,durable_intent_version:1,audience:c.role,actor_id:c.actorId,worker_id:c.workerId??null,schedule_contract_version:2,review_only:true,operational_enabled:false,fixture_enabled:true,allowed_schedule_kinds:['legacy_day','single_report_window'],held_operations:holds,operation_receipt_version:1,operation_receipts:['start','approve','cancel','acknowledge'],receipt_state_basis:'historical_result_refresh_required'})
const args={p_task_id:self.tasks[0].id,p_expected_revision:1}
const reserved={ok:true,epoch:0,active:{request_id:id(71),kind:'single_report_window_v1',status:'reserved'}}
const clone=structuredClone
function fixture(c=wc){
 let epoch=0,active=null,serial=600,assignment=null,original=null,failNext=null,mutations=0
 const calls=[]
 const view=()=>clone({durable_version:1,epoch,active})
 const transport=async(n,a)=>{
  calls.push([n,clone(a)])
  const fail=failNext&&failNext.route===n&&(!failNext.phase||failNext.phase===a.p_phase||failNext.phase===a.p_action)?failNext:null
  if(fail)failNext=null
  if(fail?.before)throw Error('lost before')
  let result
  if(n==='qa_window_api_capabilities_v3')result=cap(c)
  else if(n==='qa_window_api_worker_read_v1')result=self
  else if(n==='qa_window_api_manager_read_v1')result=manager
  else if(n==='qa_window_api_recovery_v1')result=assignment??{ok:true,epoch:0,active:null}
  else if(n==='qa_window_durable_recover_v3'){
   if(a.p_action==='discover')result=view()
   else{
    assert.equal(a.p_epoch,epoch);assert.equal(a.p_operation_id,active.operation_id)
    if(a.p_action==='seal'){assert.equal(active.status,'reserved');active.status='sealed'}
    else{assert.ok(['sealed','committed'].includes(active.status));epoch++;active=null;original=null}
    result=view()
   }
  }else if(['qa_window_durable_start_v3','qa_window_durable_review_v3','qa_window_durable_assignment_recovery_v3'].includes(n)){
   const op=n.includes('start')?'start':n.includes('review')?'approve':a.p_action
   assert.equal(a.p_epoch,epoch)
   const {p_phase,p_operation_id,...payload}=a
   if(a.p_phase==='prepare'){
    assert.equal(p_operation_id,null)
    if(!active){active={operation_id:id(++serial),operation:op,status:'reserved',historical_receipt:null};original=clone(payload)}
    else assert.deepEqual(payload,original)
   }else{
    assert.equal(p_operation_id,active.operation_id);assert.deepEqual(payload,original)
    if(active.status==='reserved'){
     mutations++;active.status='committed'
     const r=op==='start'?{ok:true,state:'in_progress'}:op==='cancel'?{...assignment,active:{...assignment.active,status:'cancelled'}}:op==='acknowledge'?{ok:true,epoch:a.p_assignment_epoch+1,active:null}:{id:a.p_entry_id,review_state:'approved',approved_minutes:a.p_approved_minutes}
     active.historical_receipt={receipt_version:1,operation_id:active.operation_id,operation:op,replayed:true,result:r}
     if(op==='cancel'||op==='acknowledge')assignment=r
    }
   }
   result=view()
  }else throw Error('unexpected route '+n)
  if(fail)throw Error('lost after')
  return clone(result)
 }
 const make=()=>createWindowDurableRecoveryReview({syntheticReviewOnly:true,fixtureTransport:transport,context:c})
 return {make,calls,view,mutations:()=>mutations,lose:(route,phase,before=false)=>{failNext={route,phase,before}},setAssignment:a=>assignment=clone(a)}
}
test('strict V3 opt-in and no V1 or V2 negotiation fallback',async()=>{
 assert.throws(()=>createWindowDurableRecoveryReview({context:wc,fixtureTransport:async()=>({})}))
 const calls=[];const s=createWindowDurableRecoveryReview({syntheticReviewOnly:true,context:wc,fixtureTransport:async n=>{calls.push(n);return {...cap(wc),contract_version:1}}})
 assert.equal((await s.connect()).status,'blocked');assert.deepEqual(calls,['qa_window_api_capabilities_v3']);assert.equal(s.state().canPrepare,false)
})
test('fresh discovery and snapshot precede explicit prepare and execute',async()=>{
 const f=fixture(),s=f.make();assert.equal((await s.connect()).status,'ready');assert.equal(s.state().canPrepare,true);assert.equal(s.state().legacyWritesHeld,true)
 assert.equal((await s.prepare('start',args)).status,'ok');assert.equal(f.mutations(),0);assert.equal(s.state().canPrepare,false)
 assert.equal((await s.execute()).status,'ok');assert.equal(f.mutations(),1);assert.equal(s.state().slot.active.receipt.historical,true);assert.equal(s.state().current,null)
 assert.equal((await s.acknowledge()).status,'blocked');await s.refresh();assert.equal(s.state().canAcknowledge,true);await s.acknowledge();assert.equal(s.state().canPrepare,false);await s.refresh();assert.equal(s.state().canPrepare,true)
})
test('lost prepare response then new process: no automatic execute or guessed payload',async()=>{
 const f=fixture(),a=f.make();await a.connect();f.lose('qa_window_durable_start_v3','prepare');assert.equal((await a.prepare('start',args)).status,'uncertain');a.dispose()
 const b=f.make();await b.connect();assert.equal(b.state().slot.active.status,'reserved');assert.equal(b.state().canExecute,false);assert.equal(b.state().canRetryPrepare,false);assert.equal(b.state().canSeal,true);assert.equal((await b.execute()).status,'blocked');assert.equal(f.mutations(),0)
 await b.seal();await b.refresh();await b.acknowledge();await b.refresh();assert.equal(b.state().canPrepare,true);assert.equal(f.mutations(),0)
})
test('lost execute reply recovered across fresh process as historical only',async()=>{
 const f=fixture(),a=f.make();await a.connect();await a.prepare('start',args);f.lose('qa_window_durable_start_v3','execute');assert.equal((await a.execute()).status,'uncertain');a.dispose()
 const b=f.make();await b.connect();assert.equal(b.state().slot.active.status,'committed');assert.deepEqual(b.state().slot.active.receipt.result,{state:'in_progress'});assert.equal(b.state().current.snapshot.tasks[0].state,'assigned');assert.equal(b.state().canExecute,false);assert.equal(b.state().canSeal,false);assert.equal(b.state().canAcknowledge,true);assert.equal(f.mutations(),1)
})
test('same process lost prepare: exact retry only after discovery',async()=>{
 const f=fixture(),s=f.make();await s.connect();f.lose('qa_window_durable_start_v3','prepare');await s.prepare('start',args);assert.equal((await s.retryPrepare()).status,'blocked');await s.refresh();assert.equal(s.state().canRetryPrepare,true);assert.equal((await s.prepare('start',{...args,p_expected_revision:2})).status,'blocked');await s.retryPrepare();const p=f.calls.filter(x=>x[0]==='qa_window_durable_start_v3');assert.deepEqual(p[0],p[1]);await s.execute();assert.equal(f.mutations(),1)
})
test('absence after lost prepare is not an unlock',async()=>{
 const f=fixture(),s=f.make();await s.connect();f.lose('qa_window_durable_start_v3','prepare',true);await s.prepare('start',args);await s.refresh();assert.equal(s.state().slot.active,null);assert.equal(s.state().canPrepare,false);assert.equal(s.state().canRetryPrepare,true);await s.retryPrepare();assert.equal(s.state().canExecute,true)
})
test('lost execute before commit requires explicit exact execute after fresh discovery',async()=>{
 const f=fixture(),s=f.make();await s.connect();await s.prepare('start',args);f.lose('qa_window_durable_start_v3','execute',true);await s.execute();assert.equal(s.state().canExecute,false);await s.refresh();assert.equal(s.state().canExecute,true);await s.execute();const xs=f.calls.filter(x=>x[1].p_phase==='execute');assert.deepEqual(xs[0],xs[1]);assert.equal(f.mutations(),1)
})
test('lost acknowledgement response reconciles advanced epoch without replay',async()=>{
 const f=fixture(),s=f.make();await s.connect();await s.prepare('start',args);await s.execute();await s.refresh();f.lose('qa_window_durable_recover_v3','acknowledge');await s.acknowledge();assert.equal(s.state().canPrepare,false);await s.refresh();assert.equal(s.state().slot.epoch,1);assert.equal(s.state().canPrepare,true);assert.equal(f.calls.filter(x=>x[1].p_action==='acknowledge').length,1)
})
test('authority change hides slot and permanently disposes original controller',async()=>{
 const f=fixture(),s=f.make();await s.connect();await s.prepare('start',args);s.suspend();assert.equal(s.state().slot,null);assert.equal(s.state().current,null);assert.equal((await s.execute()).status,'blocked');assert.equal(s.setAuthority(wc),true);await s.connect();assert.equal(s.state().canExecute,true);assert.equal(s.setAuthority({...wc,actorId:id(100)}),false);assert.equal(s.state().slot,null);assert.equal((await s.connect()).status,'blocked')
})
test('manager business cancel and acknowledgement remain separate from envelope seal and ack',async()=>{
 const f=fixture(mc);f.setAssignment(reserved);const s=f.make();await s.connect();const a={p_action:'cancel',p_epoch:0,p_request_id:id(71)};await s.prepare('recovery',a);await s.execute();assert.equal(s.state().slot.active.receipt.result.assignmentStatus,'cancelled');assert.equal(s.state().canAcknowledge,false);await s.refresh();await s.acknowledge();await s.refresh();assert.equal(s.state().current.assignment.active.status,'cancelled');await s.prepare('recovery',{...a,p_action:'acknowledge'});await s.execute();assert.equal(s.state().slot.active.receipt.result.assignmentEpoch,1);assert.equal(f.mutations(),2)
})
test('role mismatch or malformed historical receipt fails closed',()=>{
 const raw={durable_version:1,epoch:0,active:{operation_id:id(600),operation:'approve',status:'committed',historical_receipt:{receipt_version:1,operation_id:id(600),operation:'approve',replayed:true,result:{id:id(8),review_state:'approved',approved_minutes:120}}}}
 assert.throws(()=>parseWindowDurableSlot(raw,wc));assert.throws(()=>parseWindowDurableSlot({...raw,active:{...raw.active,historical_receipt:{...raw.active.historical_receipt,operation_id:id(601)}}},mc))
 assert.throws(()=>parseWindowDurableSlot({...raw,active:{...raw.active,status:'reserved'}},mc))
})
test('read failure after committed operation holds acknowledge and next write',async()=>{
 const f=fixture(),s=f.make();await s.connect();await s.prepare('start',args);await s.execute();f.lose('qa_window_api_worker_read_v1',null,true);assert.equal((await s.refresh()).status,'unavailable');assert.equal(s.state().canAcknowledge,false);assert.equal(s.state().canPrepare,false);assert.equal((await s.prepare('start',args)).status,'blocked');await s.refresh();assert.equal(s.state().canAcknowledge,true)
})
