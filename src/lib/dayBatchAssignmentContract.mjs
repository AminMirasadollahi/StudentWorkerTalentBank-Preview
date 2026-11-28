// SWTB27 day-specific batch contract candidate. Pure, review-only; no transport,
// persistence, mounted UI, authority grant, or published RPC binding.
// Derive exact row/person mapping from the existing preview and V3 validator.
import {previewBatchAssignment} from './batchAssignmentPreview.mjs'
const kind='batch_direct_v1'
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x,ks)=>obj(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k))
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const rowId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x)
const epoch=x=>Number.isSafeInteger(x)&&x>=0
const minutes=x=>Number.isInteger(x)&&x>=1&&x<=1440
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
const sort=(a,b)=>a<b?-1:a>b?1:0
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i])
const fail=code=>{throw Error(code)}
const plans=new WeakSet(),intents=new WeakSet(),snapshots=new WeakSet(),snapshotIntents=new WeakMap()
export function buildDayBatchPlan(draft,context){
 const review=previewBatchAssignment(draft,context)
 if(!review.ok)fail('BATCH_PREVIEW_INVALID')
 const p=review.plan
 if(!uuid(p.termId)||p.rows.length<1||p.rows.length>20||p.pairCount<1||p.pairCount>80)fail('BATCH_CONTRACT_LIMIT_OR_TERM')
 const rows=p.rows.map(row=>{
  if(!rowId(row.id))fail('BATCH_ROW_ID_INVALID')
  const ops=p.assignments.filter(x=>x.rowId===row.id),first=ops[0]
  if(!first||!minutes(row.minutes))fail('BATCH_MAPPING_INVALID')
  const workers=ops.flatMap(x=>x.workerIds).sort(sort)
  if(!same(workers,row.workerIds)||workers.some(x=>!uuid(x))||new Set(workers).size!==workers.length)fail('BATCH_MAPPING_INVALID')
  if(row.mode==='independent'?ops.length!==workers.length||ops.some(x=>x.workerIds.length!==1):ops.length!==1||workers.length<2||workers.length>20)fail('BATCH_MAPPING_INVALID')
  for(const op of ops)if(op.mode!==row.mode||op.title!==row.title||op.title!==first.title||op.instructions!==first.instructions||op.date!==row.date||op.unit!==row.unit||op.minutes!==row.minutes||op.reason!==first.reason||!same(op.prerequisiteIds,first.prerequisiteIds))fail('BATCH_MAPPING_INVALID')
  return {id:row.id,mode:row.mode,worker_ids:workers,unit:first.unit,title:first.title,instructions:first.instructions,date:first.date,minutes:first.minutes,reason:first.reason,prerequisites:[...first.prerequisiteIds]}
 }).sort((a,b)=>sort(a.id,b.id))
 const pairCount=rows.reduce((n,x)=>n+x.worker_ids.length,0),standardPersonMinutes=rows.reduce((n,x)=>n+x.worker_ids.length*x.minutes,0)
 if(pairCount!==p.pairCount||standardPersonMinutes!==p.totalMinutes)fail('BATCH_MAPPING_INVALID')
 const plan=freeze({termId:p.termId,rows,pairCount,standardPersonMinutes})
 plans.add(plan);return plan
}
// Only a successfully validated fresh discovery can authorize constructing a
// new in-memory intent. Host must additionally hold the shared access/fence,
// resolve any previous ambiguous operation, and generate a fresh UUID.
export function prepareDayBatchIntent(plan,id,idle){
 if(!plans.has(plan)||!uuid(id)||!snapshots.has(idle)||idle.source!=='discover'||idle.state!=='idle')fail('BATCH_INTENT_INVALID')
 const intent=freeze({plan,requestId:id,epoch:idle.epoch})
 intents.add(intent);return intent
}
function writeArgs(intent,action){
 if(!intents.has(intent))fail('BATCH_INTENT_INVALID')
 return freeze({p_action:action,p_epoch:intent.epoch,p_request_id:intent.requestId,p_term_id:intent.plan.termId,p_rows:intent.plan.rows})
}
export function batchReserveArgs(intent){return writeArgs(intent,'reserve')}
export function batchCommitArgs(intent,reserved){
 if(!intents.has(intent)||!snapshots.has(reserved)||reserved.state!=='reserved'||reserved.epoch!==intent.epoch||reserved.requestId!==intent.requestId||snapshotIntents.get(reserved)!==intent)fail('BATCH_RESERVE_NOT_CONFIRMED')
 return writeArgs(intent,'commit')
}
// Exact committed receipt shape and immutable historic mapping, not live task
// status, approved hours or payout. In-memory commit also binds the whole plan.
function checkedReceipt(raw,requestId,plan){
 if(!exact(raw,['ok','request_id','kind','result'])||raw.ok!==true||raw.kind!==kind||raw.request_id!==requestId)return null
 const r=raw.result
 if(!exact(r,['term_id','rows','pair_count','standard_person_minutes'])||!uuid(r.term_id)||!Array.isArray(r.rows)||r.rows.length<1||r.rows.length>20)return null
 if(plan&&(r.term_id!==plan.termId||r.rows.length!==plan.rows.length))return null
 const rowIds=new Set(),taskIds=new Set(),groups=new Set(),rows=[]
 let pairs=0,total=0
 for(const row of r.rows){
  if(!exact(row,['row_id','mode','group_id','tasks','minutes_per_worker'])||!rowId(row.row_id)||rowIds.has(row.row_id)||!['independent','collaborative'].includes(row.mode)||!minutes(row.minutes_per_worker)||!Array.isArray(row.tasks)||row.tasks.length<1||row.tasks.length>80)return null
  if(row.mode==='independent'?row.group_id!==null:!uuid(row.group_id)||groups.has(row.group_id)||row.tasks.length<2||row.tasks.length>20)return null
  if(row.group_id!==null)groups.add(row.group_id)
  rowIds.add(row.row_id)
  const members=new Set(),tasks=[]
  for(const t of row.tasks){
   if(!exact(t,['worker_id','task_id'])||!uuid(t.worker_id)||!uuid(t.task_id)||members.has(t.worker_id)||taskIds.has(t.task_id))return null
   members.add(t.worker_id);taskIds.add(t.task_id);tasks.push({worker_id:t.worker_id,task_id:t.task_id})
  }
  if(plan){const expected=plan.rows.find(x=>x.id===row.row_id);if(!expected||expected.mode!==row.mode||expected.minutes!==row.minutes_per_worker||!same([...members].sort(sort),expected.worker_ids))return null}
  pairs+=tasks.length;total+=tasks.length*row.minutes_per_worker
  if(pairs>80)return null
  rows.push({row_id:row.row_id,mode:row.mode,group_id:row.group_id,tasks,minutes_per_worker:row.minutes_per_worker})
 }
 if(r.pair_count!==pairs||r.standard_person_minutes!==total||plan&&(pairs!==plan.pairCount||total!==plan.standardPersonMinutes))return null
 return freeze({ok:true,request_id:requestId,kind,result:{term_id:r.term_id,rows,pair_count:pairs,standard_person_minutes:total}})
}
function snapshot(x,intent=null){freeze(x);snapshots.add(x);if(intent)snapshotIntents.set(x,intent);return x}
const invalid=()=>snapshot({state:'invalid'})
export function batchDiscoverArgs(){return freeze({p_action:'discover',p_epoch:null,p_request_id:null})}
// Only accept raw results of the audited transport from the actual operation,
// never arbitrary objects from another session or HTTP errors. Source is a
// mandatory caller-supplied discriminator; the host must enforce provenance.
export function parseDayBatchSnapshot(raw,{source,intent=null}={}){
 if(!['discover','write','control'].includes(source)||intent!==null&&!intents.has(intent))return invalid()
 const recovery=source!=='write'
 if(!exact(raw,recovery?['ok','epoch','active','durable_active']:['ok','epoch','active'])||raw.ok!==true||!epoch(raw.epoch)||recovery&&typeof raw.durable_active!=='boolean')return invalid()
 const base={source,epoch:raw.epoch}
 // A durable cursor or mixed state is never an idle or actionable batch state.
 if(recovery&&raw.durable_active)return snapshot({...base,state:'held'})
 if(raw.active===null){
  if(source==='write'||intent!==null)return invalid()
  return snapshot({...base,state:'idle'})
 }
 const a=raw.active
 if(!obj(a))return invalid()
 if(a.kind!==kind){
  if(source!=='discover'||intent!==null||!exact(a,['kind','status','foreign'])||a.foreign!==true||typeof a.kind!=='string'||!a.kind||a.kind.length>80||!['reserved','committed','cancelled'].includes(a.status))return invalid()
  return snapshot({...base,state:'foreign',kind:a.kind,status:a.status})
 }
 if(!['reserved','committed','cancelled'].includes(a.status)||!exact(a,a.status==='committed'?['kind','request_id','status','receipt']:['kind','request_id','status'])||!uuid(a.request_id))return invalid()
 if(source==='write'&&intent===null)return invalid()
 if(intent!==null&&(raw.epoch!==intent.epoch||a.request_id!==intent.requestId))return invalid()
 const receipt=a.status==='committed'?checkedReceipt(a.receipt,a.request_id,intent?.plan??null):null
 if(a.status==='committed'&&!receipt)return invalid()
 // Fresh context may identify/cancel a reservation, never reconstruct its
 // original payload to commit. Only the retained, branded intent can commit.
 return snapshot({...base,state:a.status,requestId:a.request_id,receipt},intent)
}
export function batchControlArgs(action,observed){
 if(!snapshots.has(observed)||observed.source!=='discover'&&observed.source!=='control')fail('BATCH_CONTROL_INVALID')
 if(action==='cancel'?observed.state!=='reserved':action==='acknowledge'?!['committed','cancelled'].includes(observed.state):true)fail('BATCH_CONTROL_INVALID')
 return freeze({p_action:action,p_epoch:observed.epoch,p_request_id:observed.requestId})
}
