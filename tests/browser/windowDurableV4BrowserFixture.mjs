// Node-side synthetic server for real fresh-browser contexts. No live access.
import assert from 'node:assert/strict'
import {id,worker,manager,self} from './windowReadReviewFixtureData.mjs'
import {termFixture,accessFixture,assignmentScopeFixture} from './windowTermFixtureData.mjs'
const holds=['window_extension','late_submission','correction','term_closure_policy','post_assignment_eligibility_policy','window_prerequisite_edit','nonapproval_review','batch_write']
const copy=structuredClone
const capabilities=role=>({contract_version:4,durable_intent_version:2,audience:role,actor_id:id(role==='manager'?98:99),worker_id:role==='manager'?null:worker,schedule_contract_version:2,review_only:true,operational_enabled:false,fixture_enabled:true,allowed_schedule_kinds:['legacy_day','single_report_window'],held_operations:holds,operation_receipt_version:1,operation_receipts:['start','approve','cancel','acknowledge','submit'],receipt_state_basis:'historical_result_refresh_required'})
const roleOps={worker:['start','submit'],manager:['approve','cancel','acknowledge']}
export function createDurableV4BrowserFixture(){
 const db=copy(manager);db.workers[0].state='active'
 db.tasks.push({...db.tasks[0],id:id(20),title:'کار بازه‌ای دوم'})
 const slots={manager:{epoch:0,active:null,original:null},worker:{epoch:0,active:null,original:null}}
 let assignment={ok:true,epoch:0,active:null},assignmentArgs=null,serial=700,lose=null,failRead=false
 const calls=[],mutations={start:0,submit:0,approve:0,cancel:0,acknowledge:0,seal:0,envelopeAck:0,assignmentReserve:0,assignmentCommit:0}
 const view=role=>copy({durable_version:2,epoch:slots[role].epoch,active:slots[role].active})
 function workerSnapshot(){
  const tasks=db.tasks.filter(t=>t.worker_id===worker).map(t=>{
   if(t.schedule_kind==='legacy_day')return t
   const future=t.window_start>self.server_today,done=['completed','submitted','cancelled'].includes(t.state),can=!future&&!done
   return {...t,window_actions:{review_only:true,date_min:t.window_start,date_max:t.window_end<self.server_today?t.window_end:self.server_today,window_empty:future,standard_minutes:t.estimate_minutes,minimum_minutes:t.estimate_minutes,maximum_minutes:1440,extra_reason_above_minutes:t.estimate_minutes,can_start:can&&t.state==='assigned',can_submit:can,hold_reason:done?'TASK_STATE':future?'WINDOW_NOT_STARTED':null}}
  })
  return {...self,tasks,time_entries:db.time_entries.filter(e=>e.worker_id===worker),approved_minutes_total:db.time_entries.filter(e=>e.worker_id===worker&&e.review_state==='approved').reduce((n,e)=>n+e.approved_minutes,0)}
 }
 function call({role,name,args:a}){
  assert.ok(roleOps[role]);calls.push({role,name,args:copy(a)})
  if(failRead&&name.endsWith('_read_v1'))throw Error('QA_READ_LOST')
  if(name==='qa_window_api_capabilities_v4')return capabilities(role)
  if(name==='qa_window_api_worker_read_v1'){assert.equal(role,'worker');return workerSnapshot()}
  if(name==='qa_window_api_manager_read_v1'){assert.equal(role,'manager');return copy(db)}
  if(name==='qa_window_api_recovery_v1'){assert.equal(role,'manager');assert.deepEqual(a,{p_action:'discover',p_epoch:null,p_request_id:null});return copy(assignment)}
  if(name==='qa_window_api_term_read_v1'){assert.equal(role,'manager');return termFixture(a)}
  if(name==='qa_window_api_term_access_v1'){assert.equal(role,'manager');return accessFixture}
  if(name==='qa_window_api_assignment_scope_v1'){assert.equal(role,'manager');return assignmentScopeFixture}
  const slot=slots[role]
  let result
  if(name==='qa_window_api_assignment_v1'){
   assert.equal(role,'manager');assert.equal(slot.active,null);assert.equal(a.p_epoch,assignment.epoch)
   const {p_action,...payload}=a
   if(p_action==='reserve'){
    if(!assignment.active){assignmentArgs=copy(payload);assignment.active={request_id:a.p_request_id,kind:'single_report_window_v1',status:'reserved'};mutations.assignmentReserve++}
    else assert.deepEqual(payload,assignmentArgs)
   }else{
    assert.equal(p_action,'commit');assert.deepEqual(payload,assignmentArgs)
    if(assignment.active.status==='reserved'){
     const taskId=id(++serial)
     db.tasks.push({...db.tasks[0],id:taskId,title:a.p_title,instructions:a.p_instructions,worker_id:a.p_worker_id,unit:a.p_unit,term_id:a.p_term_id,window_start:a.p_start,window_end:a.p_end,estimate_minutes:a.p_minutes,state:'assigned',has_any_report:false})
     assignment.active={...assignment.active,status:'committed',receipt:{ok:true,request_id:a.p_request_id,kind:'single_report_window_v1',result:{task_id:taskId,worker_id:a.p_worker_id,term_id:a.p_term_id,window_start:a.p_start,window_end:a.p_end,revision:1,standard_minutes:a.p_minutes}}}
     mutations.assignmentCommit++
    }
   }
   result=copy(assignment)
  }else if(name==='qa_window_durable_recover_v4'){
   assert.equal(a.p_audience,role)
   if(a.p_action==='discover')assert.deepEqual(a,{p_audience:role,p_action:'discover',p_epoch:null,p_operation_id:null})
   else{
    assert.equal(a.p_epoch,slot.epoch);assert.equal(a.p_operation_id,slot.active.operation_id)
    if(a.p_action==='seal'){assert.equal(slot.active.status,'reserved');slot.active.status='sealed';mutations.seal++}
    else{assert.equal(a.p_action,'acknowledge');assert.ok(['sealed','committed'].includes(slot.active.status));slot.epoch++;slot.active=null;slot.original=null;mutations.envelopeAck++}
   }
   result=view(role)
  }else{
   const methods={qa_window_durable_start_v4:'start',qa_window_durable_submit_v4:'submit',qa_window_durable_review_v4:'approve',qa_window_durable_assignment_recovery_v4:a.p_action}
   const op=methods[name];assert.ok(roleOps[role].includes(op),name)
   assert.equal(a.p_epoch,slot.epoch)
   assert.equal(Object.hasOwn(a,'p_client_submission_id'),false)
   const {p_phase,p_operation_id,...payload}=a
   if(p_phase==='prepare'){
    assert.equal(p_operation_id,null)
    if(!slot.active){slot.active={operation_id:id(++serial),operation:op,status:'reserved',historical_receipt:null};slot.original=copy(payload)}
    else assert.deepEqual(payload,slot.original)
   }else{
    assert.equal(p_phase,'execute');assert.equal(p_operation_id,slot.active.operation_id);assert.deepEqual(payload,slot.original)
    if(slot.active.status==='reserved'){
     let r
     if(op==='start'){
      const t=db.tasks.find(t=>t.id===a.p_task_id);assert.equal(t.state,'assigned');t.state='in_progress';r={ok:true,state:'in_progress'}
     }else if(op==='submit'){
      const t=db.tasks.find(t=>t.id===a.p_task_id);assert.ok(['assigned','in_progress'].includes(t.state));assert.ok(!db.time_entries.some(e=>e.task_id===t.id));t.state='submitted';t.has_any_report=true
      const entry={id:id(++serial),task_id:t.id,worker_id:worker,work_date:a.p_work_date,reported_minutes:a.p_reported_minutes,approved_minutes:null,review_state:'submitted',worker_note:a.p_worker_note}
      db.time_entries.push(entry);r={id:entry.id,status:'submitted',replayed:false}
     }else if(op==='approve'){
      const e=db.time_entries.find(e=>e.id===a.p_entry_id);assert.equal(e.review_state,'submitted');e.review_state='approved';e.approved_minutes=a.p_approved_minutes;db.tasks.find(t=>t.id===e.task_id).state='completed';r={id:e.id,review_state:'approved',approved_minutes:e.approved_minutes}
     }else if(op==='cancel'){
      assert.equal(assignment.active.status,'reserved');assert.equal(a.p_request_id,assignment.active.request_id);assert.equal(a.p_assignment_epoch,assignment.epoch);assignment={...assignment,active:{...assignment.active,status:'cancelled'}};r=copy(assignment)
     }else{
      assert.ok(['cancelled','committed'].includes(assignment.active.status));assert.equal(a.p_request_id,assignment.active.request_id);assert.equal(a.p_assignment_epoch,assignment.epoch);assignment={ok:true,epoch:assignment.epoch+1,active:null};assignmentArgs=null;r=copy(assignment)
     }
     mutations[op]++;slot.active.status='committed';slot.active.historical_receipt={receipt_version:1,operation_id:p_operation_id,operation:op,replayed:true,result:r}
    }
   }
   result=view(role)
  }
  if(lose&&lose.name===name&&lose.phase===(a.p_phase??a.p_action)){lose=null;throw Error('QA_REPLY_LOST_AFTER_COMMIT')}
  return result
 }
 return {call,calls,mutations,db,view,loseNext:(name,phase)=>{lose={name,phase}},setReadFailure:x=>{failRead=x},seedAssignment:()=>{assignmentArgs=null;assignment={ok:true,epoch:assignment.epoch,active:{request_id:id(799),kind:'single_report_window_v1',status:'reserved'}}}}
}
