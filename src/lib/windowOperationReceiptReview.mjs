// Isolated synthetic V2 receipt port. No operational imports, local storage,
// implicit retry, V1 write fallback or historical receipt as current state.
import {validateWindowReceiptV2Capability,parseWindowOperationReceiptV1,validateWindowOperationReceiptArgs,validateWindowWorkerSnapshotV1,parseWindowRecoveryV1} from './windowFixtureApiV1.mjs'
import {managerWindowHistoryV2} from './managerWindowReadV2.mjs'
import {workerWindowReviewModel} from './windowReviewPresentation.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const routes=Object.freeze({start:'qa_window_api_start_v2',review:'qa_window_api_review_v2',recovery:'qa_window_api_recovery_v2'})
const coverage='independent_recent_kinds_plus_all_open_and_loaded_report_links'
const blocked=()=>({status:'blocked'})
const immutable=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(immutable);Object.freeze(x)}return x}
function principalOf(c){if(c?.status!=='verified'||!uuid(c.actorId)||!['manager','worker'].includes(c.role)||!(c.role==='manager'?c.workerId==null:uuid(c.workerId)&&c.ready===true))return null;return Object.freeze({role:c.role,actorId:c.actorId,workerId:c.workerId??null})}
export function createWindowOperationReceiptReview({syntheticReviewOnly,fixtureTransport,context}={}){
 const principal=principalOf(context)
 if(syntheticReviewOnly!==true||typeof fixtureTransport!=='function'||!principal)throw Error('WINDOW_RECEIPT_FIXTURE_SCOPE')
 let generation=0,verified=true,closed=false,cap=false,busy=false,pending=null,confirmed=null,current=null
 const state=()=>Object.freeze({verified:verified&&!closed,ready:verified&&!closed&&cap,busy,uncertain:!!pending,canReplay:verified&&!closed&&cap&&!busy&&!!pending,refreshRequired:!current,current:verified&&!closed?current:null,receipt:verified&&!closed?confirmed:null})
 const suspend=()=>{if(closed)return;generation++;verified=false;cap=false;busy=false;current=null}
 const dispose=()=>{suspend();closed=true;pending=null;confirmed=null}
 const setAuthority=c=>{if(closed)return false;if(c?.status==='checking'){suspend();return false}const next=principalOf(c);if(!next||JSON.stringify(next)!==JSON.stringify(principal)){dispose();return false}suspend();verified=true;return true}
 const negotiate=async()=>{
  if(closed||!verified||busy)return blocked()
  const g=++generation;cap=false;busy=true;current=null
  try{const raw=await fixtureTransport('qa_window_api_capabilities_v2',{p_audience:principal.role});if(g!==generation||closed)return {status:'stale'};validateWindowReceiptV2Capability(raw,principal);cap=true;return {status:'ready'}}
  catch{return g!==generation||closed?{status:'stale'}:blocked()}finally{if(g===generation)busy=false}
 }
 const refresh=async()=>{
  if(closed||!verified||!cap||busy||pending)return blocked()
  const g=++generation;busy=true;current=null
  try{
   const raw=await fixtureTransport(principal.role==='manager'?'qa_window_api_manager_read_v1':'qa_window_api_worker_read_v1',{})
   if(g!==generation||closed)return {status:'stale'}
   if(raw?.history_scope!==coverage)throw Error('WINDOW_RECEIPT_SCOPE')
   let recovery=null
   if(principal.role==='manager'){
    managerWindowHistoryV2(raw)
    const v=await fixtureTransport('qa_window_api_recovery_v1',{p_action:'discover',p_epoch:null,p_request_id:null})
    if(g!==generation||closed)return {status:'stale'}
    recovery=parseWindowRecoveryV1(v)
   }else{
    validateWindowWorkerSnapshotV1(raw,principal.workerId);workerWindowReviewModel(raw,principal.workerId)
    if(raw.time_entries.some(e=>e.worker_id!=null&&e.worker_id!==principal.workerId))throw Error('WINDOW_RECEIPT_OWNER')
   }
   current=immutable({snapshot:structuredClone(raw),recovery});return {status:'ready',current}
  }catch{return g!==generation||closed?{status:'stale'}:{status:'unavailable'}}finally{if(g===generation)busy=false}
 }
 const permitted=(method,a)=>{
  if(!current)return false
  if(method==='start'){const t=current.snapshot.tasks.find(x=>x.id===a.p_task_id);return t?.schedule_kind==='single_report_window'&&t.window_revision===a.p_expected_revision&&t.state==='assigned'&&t.window_actions?.can_start===true}
  if(method==='review'){const e=current.snapshot.time_entries.find(x=>x.id===a.p_entry_id),t=current.snapshot.tasks.find(x=>x.id===e?.task_id);return e?.review_state==='submitted'&&t?.schedule_kind==='single_report_window'&&t.state==='submitted'&&t.window_revision===a.p_expected_revision&&t.worker_id===e.worker_id&&a.p_approved_minutes<=e.reported_minutes}
  const r=current.recovery;return r?.epoch===a.p_epoch&&r.active?.kind==='single_report_window_v1'&&r.active.requestId===a.p_request_id&&(a.p_action==='cancel'?r.active.status==='reserved':['cancelled','committed'].includes(r.active.status))
 }
 const send=async p=>{
  const g=++generation;busy=true;current=null;pending=p
  try{
   const raw=await fixtureTransport(routes[p.method],p.args)
   if(g!==generation||closed)return {status:'stale'}
   confirmed=parseWindowOperationReceiptV1(p.method,raw,p.args,principal);pending=null
   // A receipt is historical evidence even on a first response. No new write
   // until the actual current read and (manager) discovery succeed.
   return {status:'confirmed',receipt:confirmed,refreshRequired:true}
  }catch{return g!==generation||closed?{status:'stale'}:{status:'uncertain'}}finally{if(g===generation)busy=false}
 }
 const execute=async(method,input)=>{
  if(closed||!verified||!cap||busy||pending||!current)return blocked()
  let args;try{args=validateWindowOperationReceiptArgs(method,input,principal)}catch{return {status:'invalid'}}
  if(!permitted(method,args))return blocked()
  confirmed=null;return send(Object.freeze({method,args}))
 }
 const replay=()=>closed||!verified||!cap||busy||!pending?Promise.resolve(blocked()):send(pending)
 return Object.freeze({state,setAuthority,suspend,dispose,negotiate,refresh,execute,replay})
}
