// SWTB25 review-only typed transport contract, pinned private manifest 211ce843e00982746a6a18d4039238e0708e9a4b.
// No SDK, real network, public RPC, storage, automatic retry or legacy fallback.
// Only explicitly injected synthetic transport may be used by a review harness.
const METHODS=Object.freeze({
  "capabilities": {
    "name": "qa_window_api_capabilities_v1",
    "keys": [
      "p_audience"
    ],
    "roles": [
      "manager",
      "worker"
    ]
  },
  "manager_read": {
    "name": "qa_window_api_manager_read_v1",
    "keys": [],
    "roles": [
      "manager"
    ]
  },
  "term_read": {
    "name": "qa_window_api_term_read_v1",
    "keys": [
      "p_term_id",
      "p_unit_code",
      "p_worker_id"
    ],
    "roles": [
      "manager"
    ]
  },
  "term_access": {
    "name": "qa_window_api_term_access_v1",
    "keys": [
      "p_term_id"
    ],
    "roles": [
      "manager"
    ]
  },
  "worker_read": {
    "name": "qa_window_api_worker_read_v1",
    "keys": [],
    "roles": [
      "worker"
    ]
  },
  "assignment": {
    "name": "qa_window_api_assignment_v1",
    "keys": [
      "p_action",
      "p_epoch",
      "p_request_id",
      "p_term_id",
      "p_worker_id",
      "p_unit",
      "p_title",
      "p_instructions",
      "p_start",
      "p_end",
      "p_minutes",
      "p_reason",
      "p_prerequisites"
    ],
    "roles": [
      "manager"
    ]
  },
  "recovery": {
    "name": "qa_window_api_recovery_v1",
    "keys": [
      "p_action",
      "p_epoch",
      "p_request_id"
    ],
    "roles": [
      "manager"
    ]
  },
  "start": {
    "name": "qa_window_api_start_v1",
    "keys": [
      "p_task_id",
      "p_expected_revision"
    ],
    "roles": [
      "worker"
    ]
  },
  "submit": {
    "name": "qa_window_api_submit_v1",
    "keys": [
      "p_task_id",
      "p_expected_revision",
      "p_work_date",
      "p_reported_minutes",
      "p_worker_note",
      "p_client_submission_id",
      "p_extra_reason_code",
      "p_extra_reason_text"
    ],
    "roles": [
      "worker"
    ]
  },
  "review": {
    "name": "qa_window_api_review_v1",
    "keys": [
      "p_entry_id",
      "p_expected_revision",
      "p_decision",
      "p_approved_minutes",
      "p_review_note"
    ],
    "roles": [
      "manager"
    ]
  }
})
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k)
const obj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)
const exact=(o,keys)=>obj(o)&&Object.keys(o).length===keys.length&&keys.every(k=>own(o,k))
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const int=(x,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&x>=min&&x<=max
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>='2000-01-01'&&x<='2100-12-31'&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const unit=x=>['library','research','public_relations'].includes(x)
const text=(x,n)=>typeof x==='string'&&Array.from(x).length<=n
const nullableText=(x,n)=>x===null||text(x,n)
const nullableId=x=>x===null||uuid(x)
const allowedHolds=["window_extension","late_submission","correction","term_closure_policy","post_assignment_eligibility_policy","window_prerequisite_edit","nonapproval_review","batch_write"]
const frozen=x=>Object.freeze(x)
const fail=x=>{throw Error(x)}
const stateSet=new Set(['assigned','in_progress','submitted','completed','needs_changes','cancelled'])
const statusSet=new Set(['submitted','approved','changes_requested','rejected'])
function capability(raw,context){
 if(!exact(raw,['contract_version','audience','actor_id','worker_id','schedule_contract_version','review_only','operational_enabled','fixture_enabled','allowed_schedule_kinds','held_operations'])||
 raw.contract_version!==1||raw.schedule_contract_version!==2||raw.audience!==context.role||
 raw.actor_id!==context.actorId||raw.worker_id!==(context.role==='worker'?context.workerId:null)||
 raw.review_only!==true||raw.operational_enabled!==false||raw.fixture_enabled!==true||
 !Array.isArray(raw.allowed_schedule_kinds)||raw.allowed_schedule_kinds.length!==2||!['legacy_day','single_report_window'].every(k=>raw.allowed_schedule_kinds.includes(k))||
 !Array.isArray(raw.held_operations)||raw.held_operations.length!==allowedHolds.length||!allowedHolds.every(k=>raw.held_operations.includes(k)))fail('WINDOW_CAPABILITY_MISMATCH')
 return frozen({role:context.role,actorId:context.actorId,workerId:context.workerId,reviewOnly:true})
}
function receipt(raw,key){
 if(!exact(raw,['ok','request_id','kind','result'])||raw.ok!==true||raw.request_id!==key||raw.kind!=='single_report_window_v1')fail('WINDOW_RECEIPT_INVALID')
 const x=raw.result
 if(!exact(x,['task_id','worker_id','term_id','window_start','window_end','revision','standard_minutes'])||
 !uuid(x.task_id)||!uuid(x.worker_id)||!uuid(x.term_id)||!day(x.window_start)||!day(x.window_end)||x.window_start>x.window_end||
 x.revision!==1||!int(x.standard_minutes,1,1440))fail('WINDOW_RECEIPT_INVALID')
 return frozen({...x})
}
export function parseWindowRecoveryV1(raw,expected=null){
 if(!exact(raw,['ok','epoch','active'])||raw.ok!==true||!int(raw.epoch,0))fail('WINDOW_RECOVERY_INVALID')
 if(expected&&raw.epoch!==expected.p_epoch)fail('WINDOW_RECOVERY_EPOCH_MISMATCH')
 if(raw.active===null){if(expected)fail('WINDOW_RECOVERY_ACTIVE_MISSING');return frozen({epoch:raw.epoch,active:null})}
 const a=raw.active
 if(!obj(a)||!['reserved','committed','cancelled'].includes(a.status)||!uuid(a.request_id)||
 !exact(a,a.status==='committed'?['request_id','kind','status','receipt']:['request_id','kind','status'])||
 typeof a.kind!=='string'||!a.kind)fail('WINDOW_RECOVERY_INVALID')
 if(a.kind!=='single_report_window_v1'){
  if(expected)fail('WINDOW_RECOVERY_KIND_MISMATCH')
  // Do not expose unrelated receipt or give cancellation/ack controls here.
  return frozen({epoch:raw.epoch,active:frozen({kind:a.kind,status:'foreign_kind_occupied',requestId:a.request_id,receipt:null})})
 }
 if(expected&&(a.request_id!==expected.p_request_id||a.kind!=='single_report_window_v1'))fail('WINDOW_RECOVERY_KEY_MISMATCH')
 const result=a.status==='committed'?receipt(a.receipt,a.request_id):null
 if(expected&&result&&(
 result.worker_id!==expected.p_worker_id||result.term_id!==expected.p_term_id||
 result.window_start!==expected.p_start||result.window_end!==expected.p_end||result.standard_minutes!==expected.p_minutes))fail('WINDOW_RECEIPT_PAYLOAD_MISMATCH')
 return frozen({epoch:raw.epoch,active:frozen({kind:a.kind,status:a.status,requestId:a.request_id,receipt:result})})
}
export function validateWindowWorkerSnapshotV1(raw,workerId){
 if(!obj(raw)||raw.report_contract_version!==2||raw.window_contract_review_only!==true||!day(raw.server_today)||!Array.isArray(raw.tasks))fail('WINDOW_WORKER_SNAPSHOT_INVALID')
 const ids=new Set()
 for(const t of raw.tasks){
  if(!uuid(t?.id)||ids.has(t.id)||!stateSet.has(t.state)||!int(t.estimate_minutes,1,1440)||('worker_id' in t&&t.worker_id!==workerId))fail('WINDOW_WORKER_TASK_INVALID')
  ids.add(t.id)
  if(t.schedule_kind==='legacy_day'){if(!day(t.planned_date)||own(t,'window_actions'))fail('WINDOW_LEGACY_SHAPE_INVALID');continue}
  if(t.schedule_kind!=='single_report_window'||t.planned_date!==null||!day(t.window_start)||!day(t.window_end)||t.window_start>t.window_end||!int(t.window_revision,1))fail('WINDOW_WORKER_SHAPE_INVALID')
  const a=t.window_actions
  if(!obj(a)||a.review_only!==true||!day(a.date_min)||!day(a.date_max)||typeof a.window_empty!=='boolean'||a.window_empty!==(a.date_min>a.date_max)||
  a.standard_minutes!==t.estimate_minutes||a.minimum_minutes!==t.estimate_minutes||a.maximum_minutes!==1440||a.extra_reason_above_minutes!==t.estimate_minutes||
  typeof a.can_start!=='boolean'||typeof a.can_submit!=='boolean'||(a.hold_reason!==null&&typeof a.hold_reason!=='string')||
  (a.can_start&&(!a.can_submit||t.state!=='assigned'))||
  (a.can_submit&&(a.hold_reason!==null||a.window_empty||!['assigned','in_progress'].includes(t.state)||raw.server_today<t.window_start||raw.server_today>t.window_end||a.date_min<t.window_start||a.date_max>t.window_end||a.date_max>raw.server_today)))fail('WINDOW_WORKER_ACTION_INVALID')
 }
 return raw
}
function validateArgs(method,args){
 if(!exact(args,METHODS[method].keys))fail('WINDOW_API_ARGUMENT_SHAPE')
 if(method==='term_read'){
  if(!nullableId(args.p_term_id)||!nullableId(args.p_worker_id)||!(args.p_unit_code===null||unit(args.p_unit_code)))fail('WINDOW_TERM_FILTER_INVALID')
 }else if(method==='term_access'){if(!uuid(args.p_term_id))fail('WINDOW_TERM_FILTER_INVALID')}
 else if(method==='assignment'){
  if(!['reserve','commit'].includes(args.p_action)||!int(args.p_epoch,0)||!uuid(args.p_request_id)||!uuid(args.p_worker_id)||!uuid(args.p_term_id)||!unit(args.p_unit)||
  !text(args.p_title,160)||Array.from(args.p_title.trim()).length<3||!text(args.p_instructions,3000)||!day(args.p_start)||!day(args.p_end)||args.p_start>args.p_end||
  !int(args.p_minutes,1,1440)||!nullableText(args.p_reason,300)||!Array.isArray(args.p_prerequisites)||args.p_prerequisites.length>20||!args.p_prerequisites.every(uuid)||new Set(args.p_prerequisites).size!==args.p_prerequisites.length)fail('WINDOW_ASSIGNMENT_ARGUMENT_INVALID')
 }else if(method==='recovery'){
  if(args.p_action==='discover'){if(args.p_epoch!==null||args.p_request_id!==null)fail('WINDOW_RECOVERY_ARGUMENT_INVALID')}
  else if(!['cancel','acknowledge'].includes(args.p_action)||!int(args.p_epoch,0)||!uuid(args.p_request_id))fail('WINDOW_RECOVERY_ARGUMENT_INVALID')
 }else if(method==='start'||method==='submit'){
  if(!uuid(args.p_task_id)||!int(args.p_expected_revision,1))fail('WINDOW_TASK_ARGUMENT_INVALID')
  if(method==='submit'&&(!day(args.p_work_date)||!int(args.p_reported_minutes,1,1440)||!uuid(args.p_client_submission_id)||!text(args.p_worker_note,2000)||
   !nullableText(args.p_extra_reason_code,100)||!nullableText(args.p_extra_reason_text,600)))fail('WINDOW_REPORT_ARGUMENT_INVALID')
 }else if(method==='review'){
  if(!uuid(args.p_entry_id)||!int(args.p_expected_revision,1)||args.p_decision!=='approved'||!int(args.p_approved_minutes,0,1440)||!nullableText(args.p_review_note,1000))fail('WINDOW_REVIEW_ARGUMENT_INVALID')
 }
}
const clone=x=>JSON.parse(JSON.stringify(x))
const deepFreeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(deepFreeze);Object.freeze(x)}return x}
const isWrite=(m,a)=>['assignment','start','submit','review'].includes(m)||(m==='recovery'&&a.p_action!=='discover')
const replayable=m=>m==='assignment'||m==='submit'
function validateResponse(m,raw,args,context){
 if(m==='assignment'){
  const v=parseWindowRecoveryV1(raw,args)
  if(args.p_action==='commit'&&v.active?.status!=='committed')fail('WINDOW_COMMIT_NOT_CONFIRMED')
  if(!['reserved','committed'].includes(v.active?.status))fail('WINDOW_RESERVE_NOT_CONFIRMED')
  return v
 }
 if(m==='recovery'){
  const v=parseWindowRecoveryV1(raw)
  if(args.p_action==='cancel'&&(v.epoch!==args.p_epoch||v.active?.requestId!==args.p_request_id||v.active.kind!=='single_report_window_v1'||!['cancelled','committed'].includes(v.active.status)))fail('WINDOW_CANCEL_NOT_CONFIRMED')
  if(args.p_action==='acknowledge'&&(v.epoch!==args.p_epoch+1||v.active!==null))fail('WINDOW_ACK_NOT_CONFIRMED')
  return v
 }
 if(m==='worker_read')return validateWindowWorkerSnapshotV1(raw,context.workerId)
 if(m==='manager_read'){
  if(!obj(raw)||raw.schedule_contract_version!==2||raw.review_only!==true||!Array.isArray(raw.tasks)||!Array.isArray(raw.workers)||!Array.isArray(raw.time_entries))fail('WINDOW_MANAGER_SNAPSHOT_INVALID')
 }else if(m==='term_read'||m==='term_access'){
  if(!obj(raw)||raw.schedule_contract_version!==2||raw.review_only!==true)fail('WINDOW_TERM_SNAPSHOT_INVALID')
  if(m==='term_access'&&(raw.term_id!==args.p_term_id||!int(raw.window_noneligible_tasks,0)||!int(raw.window_noneligible_open_tasks,0)||raw.window_noneligible_open_tasks>raw.window_noneligible_tasks))fail('WINDOW_TERM_ACCESS_INVALID')
 }else if(m==='start'){
  if(!exact(raw,['ok','state'])||raw.ok!==true||raw.state!=='in_progress')fail('WINDOW_START_NOT_CONFIRMED')
 }else if(m==='submit'){
  if(!exact(raw,['id','status','replayed'])||!uuid(raw.id)||!statusSet.has(raw.status)||typeof raw.replayed!=='boolean'||(!raw.replayed&&raw.status!=='submitted'))fail('WINDOW_REPORT_NOT_CONFIRMED')
 }else if(m==='review'){
  if(!obj(raw)||raw.id!==args.p_entry_id||raw.review_state!=='approved'||raw.approved_minutes!==args.p_approved_minutes)fail('WINDOW_REVIEW_NOT_CONFIRMED')
 }
 return raw
}
// Scope lifetime is local, not authorization. Every request must still be checked by server.
// No mutation after uncertain result; only explicit exact replay for replay-safe methods.
// Reads can help investigation but do not automatically unlock an uncertain write.
export function createWindowFixtureApiV1({fixtureTransport,syntheticReviewOnly}={}){
 if(syntheticReviewOnly!==true||typeof fixtureTransport!=='function')fail('WINDOW_FIXTURE_ONLY')
 let context=null,cap=null,generation=0,busy=false,pending=null,recovery=null,disposed=false,verified=false
 const state=()=>frozen({ready:!!cap&&!disposed,busy,uncertain:!!pending,canReplay:!!cap&&!busy&&!!pending&&replayable(pending.method),recoveryState:recovery?.active?.status??null})
 const setContext=next=>{
  if(disposed)return
  const valid=next?.status==='verified'&&['manager','worker'].includes(next.role)&&uuid(next.actorId)&&
   (next.role==='manager'?next.workerId==null:uuid(next.workerId))
  const prior=context
  generation++;cap=null;busy=false;recovery=null;verified=false
  if(next?.status==='checking'){return}
  verified=!!valid
  context=valid?frozen({role:next.role,actorId:next.actorId,workerId:next.workerId??null}):null
  if(!context||!prior||prior.actorId!==context.actorId||prior.role!==context.role||prior.workerId!==context.workerId)pending=null
 }
 const negotiate=async()=>{
  if(disposed||!verified||!context||busy)return {status:'blocked'}
  const c=context,g=++generation;cap=null;busy=true
  try{
   const raw=await fixtureTransport(METHODS.capabilities.name,{p_audience:c.role})
   if(g!==generation||disposed)return {status:'stale'}
   cap=capability(raw,c);return {status:'ready'}
  }catch{if(g!==generation||disposed)return {status:'stale'};return {status:'blocked'}}
  finally{if(g===generation)busy=false}
 }
 const invoke=async(method,input,exactReplay=false)=>{
  if(disposed||!cap||busy||!own(METHODS,method)||method==='capabilities'||!METHODS[method].roles.includes(context.role))return {status:'blocked'}
  let args
  try{validateArgs(method,input);args=deepFreeze(clone(input))}catch{return {status:'invalid'}}
  const writing=isWrite(method,args)
  if(writing&&pending&&!exactReplay)return {status:'uncertain'}
  if(exactReplay&&(!pending||pending.method!==method||JSON.stringify(pending.args)!==JSON.stringify(args)||!replayable(method)))return {status:'blocked'}
  if(method==='assignment'&&!exactReplay){
   const active=recovery?.active
   if(!recovery||recovery.epoch!==args.p_epoch||(args.p_action==='reserve'?active!==null:active?.kind!=='single_report_window_v1'||active.requestId!==args.p_request_id||active.status!=='reserved'))return {status:'blocked'}
  }
  if(method==='recovery'&&writing&&(!recovery?.active||recovery.epoch!==args.p_epoch||recovery.active.requestId!==args.p_request_id||
   recovery.active.kind!=='single_report_window_v1'||(args.p_action==='cancel'?recovery.active.status!=='reserved':!['cancelled','committed'].includes(recovery.active.status))))return {status:'blocked'}
  const g=++generation,c=context;busy=true
  if(writing)pending=frozen({method,args}) // Set BEFORE transport, including auth recheck interruption.
  try{
   const raw=await fixtureTransport(METHODS[method].name,args)
   if(g!==generation||disposed)return {status:'stale'}
   const value=deepFreeze(clone(validateResponse(method,raw,args,c)))
   if(method==='assignment'||method==='recovery')recovery=value
   if(writing)pending=null
   return {status:'ok',value}
  }catch{
   if(g!==generation||disposed)return {status:'stale'}
   if(method==='recovery'||method==='assignment')recovery=null
   return {status:writing?'uncertain':'unavailable'}
  }finally{if(g===generation)busy=false}
 }
 const replay=()=>pending&&replayable(pending.method)?invoke(pending.method,pending.args,true):Promise.resolve({status:'blocked'})
 const dispose=()=>{disposed=true;generation++;context=null;cap=null;busy=false;pending=null;recovery=null;verified=false}
 return frozen({setContext,negotiate,call:(m,a={})=>invoke(m,a),replay,state,dispose})
}
