import test from 'node:test'
import assert from 'node:assert/strict'
import {createWindowEditorSession} from '../src/lib/windowEditorSession.mjs'
import {id,worker,manager,self} from './browser/windowReadReviewFixtureData.mjs'
const mc={status:'verified',role:'manager',actorId:id(98)},wc={status:'verified',role:'worker',actorId:id(99),workerId:worker,ready:true}
const holds=['window_extension','late_submission','correction','term_closure_policy','post_assignment_eligibility_policy','window_prerequisite_edit','nonapproval_review','batch_write']
const cap=c=>({contract_version:1,audience:c.role,actor_id:c.actorId,worker_id:c.workerId??null,schedule_contract_version:2,review_only:true,operational_enabled:false,fixture_enabled:true,allowed_schedule_kinds:['legacy_day','single_report_window'],held_operations:holds,operation_receipt_version:1,operation_receipts:['start','approve','cancel','acknowledge'],receipt_state_basis:'historical_result_refresh_required'})
const start={p_task_id:self.tasks[0].id,p_expected_revision:1}
const report={...start,p_work_date:self.server_today,p_reported_minutes:120,p_worker_note:'QA',p_client_submission_id:id(70),p_extra_reason_code:null,p_extra_reason_text:null}
const reserved={ok:true,epoch:0,active:{request_id:id(71),kind:'single_report_window_v1',status:'reserved'}}
const cancelled={...reserved,active:{...reserved.active,status:'cancelled'}}
const next={ok:true,epoch:1,active:{request_id:id(72),kind:'single_report_window_v1',status:'reserved'}}
const env=(a,op,result,replayed=true)=>({receipt_version:1,operation_id:a.p_operation_id,operation:op,replayed,result})
async function make(c,custom=()=>undefined,{connect=true,factory}={}){
 let serial=500;const calls=[]
 const s=createWindowEditorSession({syntheticReviewOnly:true,operationReceiptsV2:true,newOperationId:factory??(()=>id(++serial)),context:c,fixtureTransport:async(n,a)=>{
  calls.push([n,structuredClone(a)]);const v=custom(n,a);if(v!==undefined)return v
  if(n.endsWith('capabilities_v2'))return cap(c)
  if(n.endsWith('manager_read_v1'))return manager
  if(n.endsWith('worker_read_v1'))return self
  if(n.endsWith('recovery_v1'))return reserved
  throw Error('QA_ROUTE')
 }})
 if(connect)assert.equal((await s.connect()).status,'ready')
 return {s,calls}
}
test('V2 negotiated explicitly and no V1 fallback',async()=>{const {s,calls}=await make(wc,()=>({}),{connect:false});assert.equal((await s.connect()).status,'blocked');assert.equal((await s.perform('start',start)).status,'blocked');assert.deepEqual(calls.map(x=>x[0]),['qa_window_api_capabilities_v2'])})
test('V2 uncertain start blocks V1 submit; exact replay and fresh read',async()=>{let n=0;const {s,calls}=await make(wc,(r,a)=>r.endsWith('start_v2')?++n===1?Promise.reject(Error('lost')):env(a,'start',{ok:true,state:'in_progress'}):r.endsWith('submit_v1')?{id:id(73),status:'submitted',replayed:false}:undefined);assert.equal((await s.perform('start',start)).status,'uncertain');assert.equal(s.state().pendingReceiptV2,true);assert.equal((await s.perform('submit',report)).status,'blocked');assert.equal((await s.replay()).status,'ok');assert.deepEqual(calls[1],calls[2]);assert.equal(calls[3][0],'qa_window_api_worker_read_v1');assert.equal(s.state().refreshRequired,false);assert.equal((await s.perform('submit',report)).status,'ok')})
test('V1 uncertain submit blocks V2 start; exact original replay only',async()=>{let n=0;const {s,calls}=await make(wc,(r)=>r.endsWith('submit_v1')?++n===1?Promise.reject(Error('lost')):{id:id(73),status:'submitted',replayed:true}:undefined);await s.perform('submit',report);assert.equal((await s.perform('start',start)).status,'blocked');await s.replay();assert.deepEqual(calls[1],calls[2]);assert.equal(s.state().uncertain,false)})
test('historical ack result does not replace newer current cursor',async()=>{let n=0;const {s}=await make(mc,(r,a)=>r.endsWith('recovery_v1')?++n===1?cancelled:next:r.endsWith('recovery_v2')?env(a,'acknowledge',{ok:true,epoch:1,active:null}):undefined);assert.equal((await s.ack()).status,'ok');assert.equal(s.state().slot.active.requestId,id(72));assert.equal(s.state().historicalReceipt.result.active,null);assert.equal(s.state().refreshRequired,false);assert.equal((await s.commit()).status,'blocked')})
test('refresh failure retains fence across reauthorization; retry is read only',async()=>{let fail=true;const {s,calls}=await make(wc,(r,a)=>r.endsWith('start_v2')?env(a,'start',{ok:true,state:'in_progress'}):r.endsWith('worker_read_v1')&&fail?Promise.reject(Error('lost read')):undefined);await s.perform('start',start);assert.equal(s.state().refreshRequired,true);assert.equal((await s.perform('submit',report)).status,'blocked');s.suspend();s.setAuthority(wc);await s.connect();assert.equal(s.state().refreshRequired,true);fail=false;assert.equal((await s.refreshReceipt()).status,'ok');assert.equal(s.state().refreshRequired,false);assert.equal(calls.filter(x=>x[0].endsWith('start_v2')).length,1)})
test('same principal interrupted V2 request preserves key; different account disposes',async()=>{let resolve,n=0;const {s,calls}=await make(wc,(r,a)=>r.endsWith('start_v2')?++n===1?new Promise(r=>resolve=()=>r(env(a,'start',{ok:true,state:'in_progress'}))):env(a,'start',{ok:true,state:'in_progress'}):undefined);const pending=s.perform('start',start);s.suspend();resolve();assert.equal((await pending).status,'stale');s.setAuthority(wc);await s.connect();assert.equal((await s.replay()).status,'ok');assert.deepEqual(calls.filter(x=>x[0].endsWith('start_v2'))[0],calls.filter(x=>x[0].endsWith('start_v2'))[1]);assert.equal(s.setAuthority({...wc,actorId:id(100)}),false);assert.equal(s.state().historicalReceipt,null)})
test('cancel replay uses old key after discovery advanced and no stale frozen draft',async()=>{let n=0,read=0;const {s,calls}=await make(mc,(r,a)=>r.endsWith('recovery_v1')?++read===1?reserved:next:r.endsWith('recovery_v2')?++n===1?Promise.reject(Error('lost')):env(a,'cancel',cancelled):undefined);assert.equal((await s.cancel()).status,'uncertain');assert.equal((await s.ack()).status,'blocked');assert.equal((await s.replay()).status,'ok');assert.equal(s.state().slot.active.requestId,id(72));assert.deepEqual(calls.filter(x=>x[0].endsWith('recovery_v2'))[0],calls.filter(x=>x[0].endsWith('recovery_v2'))[1])})
test('key generator reuse denied without transport',async()=>{const {s,calls}=await make(wc,(r,a)=>r.endsWith('start_v2')?env(a,'start',{ok:true,state:'in_progress'}):undefined,{factory:()=>id(500)});await s.perform('start',start);assert.equal((await s.perform('start',start)).status,'invalid');assert.equal(calls.filter(x=>x[0].endsWith('start_v2')).length,1)})
