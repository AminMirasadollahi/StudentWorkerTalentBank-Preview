// SWTB26 V4 synthetic-only recovery controller; accepted PG17 contract
// 37142af6215ba708197f3e17c2471dbb042cc10c, receipt 2ba2b78.
// No SDK, production RPC, persistent storage, implicit execute/retry or V1 write fallback.
import {validateWindowReceiptV2Capability,validateWindowOperationReceiptArgs,parseWindowOperationReceiptV1,parseWindowRecoveryV1,validateWindowWorkerSnapshotV1} from './windowFixtureApiV1.mjs'
import {managerWindowHistoryV2} from './managerWindowReadV2.mjs'
import {workerWindowReviewModel} from './windowReviewPresentation.mjs'
import {buildReviewAssignmentScope} from './windowTermReview.mjs'
import {assignmentWindowPayload} from './windowEditorPayloads.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const integer=(x,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&x>=min&&x<=max
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x,k)=>object(x)&&Object.keys(x).length===k.length&&k.every(y=>Object.prototype.hasOwnProperty.call(x,y))
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x}
const copy=x=>freeze(structuredClone(x))
const fail=()=>{throw Error('WINDOW_DURABLE_CONTRACT')}
const blocked=()=>({status:'blocked'})
const roles={worker:['start','submit'],manager:['approve','cancel','acknowledge']}
const coverage='independent_recent_kinds_plus_all_open_and_loaded_report_links'
const principalOf=c=>c?.status==='verified'&&uuid(c.actorId)&&['manager','worker'].includes(c.role)&&(c.role==='manager'?c.workerId==null:uuid(c.workerId)&&c.ready===true)?freeze({role:c.role,actorId:c.actorId,workerId:c.workerId??null}):null
export function validateWindowDurableV4Capability(raw,c){
 if(!object(raw)||raw.contract_version!==4||raw.durable_intent_version!==2||!Array.isArray(raw.operation_receipts)||raw.operation_receipts.length!==5||!['start','approve','cancel','acknowledge','submit'].every(x=>raw.operation_receipts.includes(x)))fail()
 const {durable_intent_version,contract_version,operation_receipts,...rest}=raw
 return validateWindowReceiptV2Capability({...rest,contract_version:1,operation_receipts:operation_receipts.filter(x=>x!=='submit')},c)
}
// Recovered history has no original payload. Validate the envelope and only expose
// minimal historical evidence. Do not infer task identity from a start receipt.
function historical(raw,active){
 if(!exact(raw,['receipt_version','operation_id','operation','replayed','result'])||raw.receipt_version!==1||raw.operation_id!==active.operation_id||raw.operation!==active.operation||raw.replayed!==true||!object(raw.result))fail()
 const r=raw.result
 let result
 if(active.operation==='start'){
  if(!exact(r,['ok','state'])||r.ok!==true||r.state!=='in_progress')fail()
  result={state:r.state}
 }else if(active.operation==='submit'){
  if(!exact(r,['id','status','replayed'])||!uuid(r.id)||r.status!=='submitted'||r.replayed!==false)fail()
  result={entryId:r.id,status:r.status}
 }else if(active.operation==='approve'){
  if(!uuid(r.id)||r.review_state!=='approved'||!integer(r.approved_minutes,0,1440))fail()
  result={entryId:r.id,reviewState:r.review_state,approvedMinutes:r.approved_minutes}
 }else{
  const v=parseWindowRecoveryV1(r)
  if(active.operation==='cancel'&&(v.active?.kind!=='single_report_window_v1'||v.active.status!=='cancelled'))fail()
  if(active.operation==='acknowledge'&&v.active!==null)fail()
  result={assignmentEpoch:v.epoch,assignmentStatus:v.active?.status??null,requestId:v.active?.requestId??null}
 }
 return freeze({operationId:active.operation_id,operation:active.operation,historical:true,result})
}
export function parseWindowDurableV4Slot(raw,principal){
 if(!exact(raw,['durable_version','epoch','active'])||raw.durable_version!==2||!integer(raw.epoch))fail()
 if(raw.active===null)return freeze({epoch:raw.epoch,active:null})
 const a=raw.active
 if(!exact(a,['operation_id','operation','status','historical_receipt'])||!uuid(a.operation_id)||!roles[principal.role]?.includes(a.operation)||!['reserved','committed','sealed'].includes(a.status))fail()
 if(a.status!=='committed'&&a.historical_receipt!==null)fail()
 return freeze({epoch:raw.epoch,active:{operationId:a.operation_id,operation:a.operation,status:a.status,receipt:a.status==='committed'?historical(a.historical_receipt,a):null}})
}
const sameSlot=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const operationOf=(method,args)=>method==='start'?'start':method==='submit'?'submit':method==='review'?'approve':args.p_action
const routeOf=method=>({start:'qa_window_durable_start_v4',submit:'qa_window_durable_submit_v4',review:'qa_window_durable_review_v4',recovery:'qa_window_durable_assignment_recovery_v4'})[method]
const validationKey='10000000-0000-4000-8000-000000000001'
const submitKeys=['p_task_id','p_expected_revision','p_work_date','p_reported_minutes','p_worker_note','p_extra_reason_code','p_extra_reason_text']
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>='2000-01-01'&&x<='2100-12-31'&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const str=(x,n)=>typeof x==='string'&&Array.from(x).length<=n
const nullable=(x,n)=>x===null||str(x,n)
function validateExactReceipt(d,raw,key,c){
 if(d.method==='submit'){
  const h=historical(raw,{operation_id:key,operation:'submit'})
  if(!uuid(h.result.entryId))fail()
  return h
 }
 return parseWindowOperationReceiptV1(d.method,raw,{...d.args,p_operation_id:key},c)
}
function draftOf(method,input,c){
 if(method==='submit'){
  if(c.role!=='worker'||!exact(input,submitKeys)||!uuid(input.p_task_id)||!integer(input.p_expected_revision,1)||!day(input.p_work_date)||!integer(input.p_reported_minutes,1,1440)||!str(input.p_worker_note,2000)||!nullable(input.p_extra_reason_code,100)||!nullable(input.p_extra_reason_text,600))fail()
  return freeze({method,args:copy(input),operation:'submit'})
 }
 if(!object(input)||Object.prototype.hasOwnProperty.call(input,'p_operation_id'))fail()
 const a=validateWindowOperationReceiptArgs(method,{...input,p_operation_id:validationKey},c)
 const {p_operation_id,...args}=a
 return freeze({method,args,operation:operationOf(method,args)})
}
function wire(d,phase,epoch,key){
 const {p_decision,p_action,p_epoch,...rest}=d.args
 return freeze({p_phase:phase,p_epoch:epoch,p_operation_id:key,...(d.method==='recovery'?{...rest,p_action,p_assignment_epoch:p_epoch}:rest)})
}
function permitted(d,current){
 if(!current)return false
 const a=d.args,s=current.snapshot,r=current.assignment
 if(d.method==='start'){
  const t=s.tasks.find(x=>x.id===a.p_task_id)
  return t?.schedule_kind==='single_report_window'&&t.window_revision===a.p_expected_revision&&t.state==='assigned'&&t.window_actions?.can_start===true
 }
 if(d.method==='submit'){
  const t=s.tasks.find(x=>x.id===a.p_task_id),w=t?.window_actions
  return t?.schedule_kind==='single_report_window'&&t.window_revision===a.p_expected_revision&&['assigned','in_progress'].includes(t.state)&&w?.can_submit===true&&w.hold_reason===null&&!w.window_empty&&a.p_work_date>=w.date_min&&a.p_work_date<=w.date_max&&a.p_reported_minutes>=w.minimum_minutes&&a.p_reported_minutes<=w.maximum_minutes&&(a.p_reported_minutes>t.estimate_minutes?['equipment_issue','unexpected_complexity','instructions_changed','skill_gap','other'].includes(a.p_extra_reason_code)&&typeof a.p_extra_reason_text==='string'&&Array.from(a.p_extra_reason_text.trim()).length>=10:a.p_extra_reason_code===null&&a.p_extra_reason_text===null)
 }
 if(d.method==='review'){
  const e=s.time_entries.find(x=>x.id===a.p_entry_id),t=s.tasks.find(x=>x.id===e?.task_id)
  return r?.active===null&&e?.review_state==='submitted'&&t?.schedule_kind==='single_report_window'&&t.state==='submitted'&&t.window_revision===a.p_expected_revision&&t.worker_id===e.worker_id&&a.p_approved_minutes<=e.reported_minutes
 }
 return r?.epoch===a.p_epoch&&r.active?.kind==='single_report_window_v1'&&r.active.requestId===a.p_request_id&&(a.p_action==='cancel'?r.active.status==='reserved':['committed','cancelled'].includes(r.active.status))
}
const sessions=new WeakSet()
export const isWindowDurableV4Session=x=>sessions.has(x)
export function createWindowDurableV4Review({syntheticReviewOnly,fixtureTransport,context,assignmentWritesV1=false,newAssignmentId}={}){
 const principal=principalOf(context)
 if(syntheticReviewOnly!==true||typeof fixtureTransport!=='function'||!principal)throw Error('WINDOW_DURABLE_FIXTURE_ONLY')
 let generation=0,verified=true,closed=false,cap=false,busy=false,slot=null,current=null,draft=null,knownKey=null,uncertain=false,ackPending=null
 const assignmentEnabled=assignmentWritesV1===true&&principal.role==='manager'
 if(assignmentEnabled&&typeof newAssignmentId!=='function')throw Error('WINDOW_ASSIGNMENT_KEY_FACTORY_REQUIRED')
 let assignmentIntent=null
 let version=0;const listeners=new Set(),formDrafts=new Map(),issuedAssignmentIds=new Set()
 const publish=()=>{version++;for(const f of [...listeners])f()}
 const valid=()=>verified&&!closed
 const can=()=>valid()&&cap&&!busy
 const baseReady=()=>can()&&!!current&&slot?.active===null&&!draft&&!uncertain&&!ackPending
 const assignmentMatches=()=>!!assignmentIntent&&current?.assignment?.epoch===assignmentIntent.args.p_epoch&&current.assignment.active?.kind==='single_report_window_v1'&&current.assignment.active.requestId===assignmentIntent.args.p_request_id
 const assignmentIdle=()=>baseReady()&&current?.assignment?.active===null&&!assignmentIntent
 const canRecoverBusiness=()=>baseReady()&&(!assignmentIntent||assignmentMatches())
 const canRetryAssignment=()=>baseReady()&&!!assignmentIntent&&assignmentIntent.uncertain&&current.assignment.epoch===assignmentIntent.args.p_epoch&&(assignmentIntent.phase==='reserve'?current.assignment.active===null||assignmentMatches()&&['reserved','committed'].includes(current.assignment.active.status):assignmentMatches()&&['reserved','committed'].includes(current.assignment.active.status))
 const state=()=>freeze({verified:valid(),ready:valid()&&cap,busy,slot:valid()?slot:null,current:valid()?current:null,
  uncertain:valid()&&(uncertain||!!assignmentIntent?.uncertain),assignmentEnabled,assignmentPending:valid()&&!!assignmentIntent,assignmentSummary:valid()&&assignmentIntent?{title:assignmentIntent.args.p_title,phase:assignmentIntent.phase}:null,canReserveAssignment:assignmentEnabled&&assignmentIdle()&&!!current.assignmentScope,canCommitAssignment:assignmentEnabled&&baseReady()&&assignmentMatches()&&!assignmentIntent.uncertain&&assignmentIntent.phase==='reserve'&&current.assignment.active.status==='reserved',canRetryAssignment:assignmentEnabled&&canRetryAssignment(),canPrepareRecovery:canRecoverBusiness(),intentSummary:valid()&&draft?draft.summary:null,refreshRequired:!current,writeHeld:!valid()||!cap||busy||!current||uncertain||!!draft||!!slot?.active||!!ackPending||!!assignmentIntent,
  canPrepare:baseReady()&&!assignmentIntent,
  canRetryPrepare:can()&&!!current&&!!draft&&!knownKey&&slot?.epoch===draft.epoch&&(!slot.active||slot.active.status==='reserved'&&slot.active.operation===draft.operation),
  canExecute:can()&&!!draft&&!!knownKey&&slot?.epoch===draft.epoch&&slot.active?.operationId===knownKey&&slot.active.status==='reserved',
  canSeal:can()&&!!current&&slot?.active?.status==='reserved',
  canAcknowledge:can()&&!!current&&['committed','sealed'].includes(slot?.active?.status),
  // Only accepted typed assignment V1 reserve/commit allowed after explicit V4 opt-in.
  legacyWritesHeld:true})
 const suspend=()=>{if(closed)return;generation++;verified=false;cap=false;busy=false;slot=null;current=null;publish()}
 const dispose=()=>{if(closed)return;suspend();closed=true;draft=null;knownKey=null;uncertain=false;ackPending=null;assignmentIntent=null;issuedAssignmentIds.clear();formDrafts.clear();publish();listeners.clear()}
 const setAuthority=c=>{if(closed)return false;if(c?.status==='checking'){suspend();return false}const p=principalOf(c);if(!p||JSON.stringify(p)!==JSON.stringify(principal)){dispose();return false}suspend();verified=true;publish();return true}
 const run=async fn=>{
  if(!can())return blocked()
  const g=++generation;busy=true;publish()
  const alive=()=>g===generation&&valid()
  const call=async(name,args)=>{const raw=await fixtureTransport(name,args);if(!alive())throw Error('WINDOW_DURABLE_STALE');return raw}
  try{return await fn(call,alive)}
  catch{return alive()?{status:'unavailable'}:{status:'stale'}}
  finally{if(alive()){busy=false;publish()}}
 }
 const discover=async call=>parseWindowDurableV4Slot(await call('qa_window_durable_recover_v4',{p_audience:principal.role,p_action:'discover',p_epoch:null,p_operation_id:null}),principal)
 const refresh=()=>run(async(call)=>{
  current=null;slot=null;publish()
  const first=await discover(call)
  const raw=await call(principal.role==='manager'?'qa_window_api_manager_read_v1':'qa_window_api_worker_read_v1',{})
  if(raw?.history_scope!==coverage)fail()
  let assignment=null,assignmentScope=null
  if(principal.role==='manager'){
   managerWindowHistoryV2(raw)
   assignment=parseWindowRecoveryV1(await call('qa_window_api_recovery_v1',{p_action:'discover',p_epoch:null,p_request_id:null}))
   if(assignmentEnabled)assignmentScope=buildReviewAssignmentScope({snapshot:raw,assignmentScope:await call('qa_window_api_assignment_scope_v1',{}),actorId:principal.actorId})
  }else{
   validateWindowWorkerSnapshotV1(raw,principal.workerId);workerWindowReviewModel(raw,principal.workerId)
   if(raw.time_entries.some(e=>e.worker_id!=null&&e.worker_id!==principal.workerId))fail()
  }
  if(assignmentEnabled){
   const latestAssignment=parseWindowRecoveryV1(await call('qa_window_api_recovery_v1',{p_action:'discover',p_epoch:null,p_request_id:null}))
   if(!sameSlot(assignment,latestAssignment))fail()
  }
  const latest=await discover(call)
  if(!sameSlot(first,latest))fail()
  slot=latest
  if(draft){
   if(slot.epoch<draft.epoch)fail()
   if(slot.epoch>draft.epoch){draft=null;knownKey=null;uncertain=false}
   else if(slot.active?.status==='committed'||slot.active?.status==='sealed'){
    // Server terminal state is evidence, not proof of our original payload unless
    // its previously confirmed key matches. Do not display it as current state.
    draft=null;knownKey=null;uncertain=false
   }else if(knownKey&&slot.active?.operationId!==knownKey){knownKey=null;uncertain=true}
  }
  if(ackPending){if(slot.epoch<ackPending.epoch)fail();if(slot.epoch>ackPending.epoch){ackPending=null;uncertain=false}}
  if(!draft&&!ackPending)uncertain=false
  if(assignmentIntent){
   const a=assignmentIntent.args,r=assignment
   if(r.epoch<a.p_epoch)fail()
   if(r.epoch>a.p_epoch||(r.active?.requestId===a.p_request_id&&r.active.kind==='single_report_window_v1'&&r.active.status==='cancelled')){
    assignmentIntent=null;formDrafts.delete('assignment:'+a.p_term_id)
   }else if(!r.active||r.active.requestId!==a.p_request_id||r.active.kind!=='single_report_window_v1'||r.active.status!=='reserved'&&assignmentIntent.phase==='reserve'){
    assignmentIntent={...assignmentIntent,uncertain:true}
   }
  }
  current=copy({snapshot:raw,assignment,assignmentScope})
  return {status:'ready',slot}
 })
 const connect=async()=>{
  if(!valid()||busy)return blocked()
  const g=++generation;cap=false;current=null;slot=null;busy=true;publish()
  try{const raw=await fixtureTransport('qa_window_api_capabilities_v4',{p_audience:principal.role});if(g!==generation||!valid())return {status:'stale'};validateWindowDurableV4Capability(raw,principal);cap=true}
  catch{return g===generation&&valid()?blocked():{status:'stale'}}
  finally{if(g===generation&&valid()){busy=false;publish()}}
  return refresh()
 }
 const sendPrepare=()=>run(async(call,alive)=>{
  const d=draft
  current=null;uncertain=true;publish()
  try{
   const raw=await call(routeOf(d.method),wire(d,'prepare',d.epoch,null))
   const v=parseWindowDurableV4Slot(raw,principal)
   if(v.epoch!==d.epoch||v.active?.operation!==d.operation||!['reserved','committed'].includes(v.active.status))fail()
   if(v.active.status==='committed')validateExactReceipt(d,raw.active.historical_receipt,v.active.operationId,principal)
   slot=v;knownKey=v.active.operationId;uncertain=false
   if(v.active.status==='committed'){draft=null;knownKey=null}
   return {status:'ok',slot:v}
  }catch{if(!alive())return {status:'stale'};slot=null;return {status:'uncertain'}}
 })
 const prepare=(method,input)=>{
  if(!(method==='recovery'?state().canPrepareRecovery:state().canPrepare))return Promise.resolve(blocked())
  let d;try{d=draftOf(method,input,principal)}catch{return Promise.resolve({status:'invalid'})}
  if(!permitted(d,current))return Promise.resolve(blocked())
  const a=d.args,task=d.method==='review'?current.snapshot.tasks.find(t=>t.id===current.snapshot.time_entries.find(e=>e.id===a.p_entry_id)?.task_id):current.snapshot.tasks.find(t=>t.id===a.p_task_id)
  draft=freeze({...d,epoch:slot.epoch,summary:{operation:d.operation,title:task?.title??null,minutes:a.p_reported_minutes??a.p_approved_minutes??null,workDate:a.p_work_date??null}});knownKey=null
  return sendPrepare()
 }
 const retryPrepare=()=>state().canRetryPrepare?sendPrepare():Promise.resolve(blocked())
 const execute=()=>{
  if(!state().canExecute)return Promise.resolve(blocked())
  return run(async(call,alive)=>{
   const d=draft,key=knownKey;current=null;uncertain=true;publish()
   try{
    const raw=await call(routeOf(d.method),wire(d,'execute',d.epoch,key))
    const v=parseWindowDurableV4Slot(raw,principal)
    if(v.epoch!==d.epoch||v.active?.operationId!==key||v.active.operation!==d.operation||v.active.status!=='committed')fail()
    validateExactReceipt(d,raw.active.historical_receipt,key,principal)
    slot=v
    if(d.method==='submit')formDrafts.delete('report:'+d.args.p_task_id+':'+d.args.p_expected_revision)
    if(d.method==='review')formDrafts.delete('review:'+d.args.p_entry_id+':'+d.args.p_expected_revision)
    draft=null;knownKey=null;uncertain=false
    return {status:'ok',slot:v}
   }catch{if(!alive())return {status:'stale'};slot=null;return {status:'uncertain'}}
  })
 }
 const recover=action=>{
  if(!(action==='seal'?state().canSeal:state().canAcknowledge))return Promise.resolve(blocked())
  return run(async(call,alive)=>{
   const before=slot;current=null;uncertain=true;publish()
   if(action==='acknowledge')ackPending={epoch:before.epoch,key:before.active.operationId}
   try{
    const raw=await call('qa_window_durable_recover_v4',{p_audience:principal.role,p_action:action,p_epoch:before.epoch,p_operation_id:before.active.operationId})
    const v=parseWindowDurableV4Slot(raw,principal)
    if(action==='seal'?(v.epoch!==before.epoch||v.active?.operationId!==before.active.operationId||v.active.operation!==before.active.operation||v.active.status!=='sealed'):(v.epoch!==before.epoch+1||v.active!==null))fail()
    slot=v;draft=null;knownKey=null;ackPending=null;uncertain=false
    return {status:'ok',slot:v}
   }catch{if(!alive())return {status:'stale'};slot=null;return {status:'uncertain'}}
  })
 }
 const sendAssignment=()=>run(async(call,alive)=>{
  const intent=assignmentIntent,a=intent.args
  current=null;assignmentIntent={...intent,uncertain:true};publish()
  try{
   const raw=await call('qa_window_api_assignment_v1',{...a,p_action:intent.phase})
   const v=parseWindowRecoveryV1(raw,a)
   if(!['reserved','committed'].includes(v.active?.status)||intent.phase==='commit'&&v.active.status!=='committed')fail()
   if(v.active.status==='committed'){formDrafts.delete('assignment:'+a.p_term_id);assignmentIntent=null}
   else assignmentIntent={...intent,uncertain:false}
   return {status:'ok',assignment:v}
  }catch{if(!alive())return {status:'stale'};return {status:'uncertain'}}
 })
 const reserveAssignment=input=>{
  if(!state().canReserveAssignment)return Promise.resolve(blocked())
  let v
  try{
   const key=newAssignmentId()
   if(!uuid(key)||issuedAssignmentIds.has(key))fail()
   issuedAssignmentIds.add(key)
   v=assignmentWindowPayload(input,current.assignmentScope,key,current.assignment.epoch)
   if(!v.ok)return Promise.resolve({status:'invalid',code:v.code})
  }catch{return Promise.resolve({status:'invalid'})}
  assignmentIntent=freeze({args:copy(v.args),phase:'reserve',uncertain:false})
  return sendAssignment()
 }
 const commitAssignment=()=>{
  if(!state().canCommitAssignment)return Promise.resolve(blocked())
  assignmentIntent=freeze({...assignmentIntent,phase:'commit'})
  return sendAssignment()
 }
 const retryAssignment=()=>state().canRetryAssignment?sendAssignment():Promise.resolve(blocked())
 const session=Object.freeze({durableVersion:4,reserveAssignment,commitAssignment,retryAssignment,state,connect,refresh,prepare,retryPrepare,execute,seal:()=>recover('seal'),acknowledge:()=>recover('acknowledge'),suspend,setAuthority,dispose,
  scopeMatches:c=>valid()&&JSON.stringify(principalOf(c))===JSON.stringify(principal),
  draft:(k,initial)=>structuredClone(valid()&&formDrafts.has(k)?formDrafts.get(k):initial),
  saveDraft:(k,v)=>{if(!valid()||typeof k!=='string'||k.length>200||!(k.startsWith('assignment:')?state().canReserveAssignment:state().canPrepare))return false;formDrafts.set(k,structuredClone(v));return true},
  clearDraft:k=>{if(valid())formDrafts.delete(k)},
  subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},getVersion:()=>version})
 sessions.add(session);return session
}
