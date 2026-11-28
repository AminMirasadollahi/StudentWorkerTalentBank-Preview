// Dormant desk cancellation client contract; only synthetic review, no transport or storage.
import {captureDeskCancellationTarget} from './deskCancellationObservation.mjs'
const kind='desk_cancel_v1'
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x,ks)=>obj(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k))
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const epoch=x=>Number.isSafeInteger(x)&&x>=0
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
const fail=code=>{throw Error(code)}
const plans=new WeakSet(),intents=new WeakSet(),snapshots=new WeakSet(),snapshotIntents=new WeakMap(),controls=new WeakSet()
// SQL btrim removes U+0020; count Unicode code points like PostgreSQL char_length.
export function buildDeskCancelPlan(draft,context){
 if(!exact(draft,['shiftId','reason'])||!obj(context)||typeof draft.reason!=='string')fail('DESK_CANCEL_PLAN_INVALID')
 const target=captureDeskCancellationTarget({shiftId:draft.shiftId,day:context.day,shifts:context.shifts,work:context.work})
 const reason=draft.reason.replace(/^ +| +$/g,'')
 if(!target||target.shift_date.startsWith('0000-')||Array.from(reason).length<5||Array.from(reason).length>500||reason.includes('\0')||Array.from(reason).some(c=>c.length===1&&/[\uD800-\uDFFF]/.test(c)))fail('DESK_CANCEL_PLAN_INVALID')
 const plan=freeze({target,reason});plans.add(plan);return plan
}
export function prepareDeskCancelIntent(plan,id,idle){
 if(!plans.has(plan)||!uuid(id)||!snapshots.has(idle)||idle.source!=='discover'||idle.state!=='idle')fail('DESK_CANCEL_INTENT_INVALID')
 const intent=freeze({plan,requestId:id,epoch:idle.epoch})
 intents.add(intent);return intent
}
function writeArgs(intent,action){
 if(!intents.has(intent))fail('DESK_CANCEL_INTENT_INVALID')
 const t=intent.plan.target
 return freeze({p_action:action,p_epoch:intent.epoch,p_request_id:intent.requestId,p_shift_id:t.id,p_task_id:t.task_id,p_worker_id:t.worker_id,p_day:t.shift_date,p_start_minute:t.start_minute,p_end_minute:t.end_minute,p_reason:intent.plan.reason})
}
export function deskCancelReserveArgs(intent){return writeArgs(intent,'reserve')}
export function deskCancelCommitArgs(intent,reserved){
 if(!intents.has(intent)||!snapshots.has(reserved)||reserved.state!=='reserved'||reserved.epoch!==intent.epoch||reserved.requestId!==intent.requestId||snapshotIntents.get(reserved)!==intent)fail('DESK_CANCEL_RESERVE_NOT_CONFIRMED')
 return writeArgs(intent,'commit')
}
function checkedReceipt(raw,requestId,plan){
 if(!exact(raw,['ok','request_id','kind','result'])||raw.ok!==true||raw.kind!==kind||raw.request_id!==requestId)return null
 const r=raw.result
 if(!exact(r,['shift_id','task_id','state'])||!uuid(r.shift_id)||!uuid(r.task_id)||r.state!=='cancelled')return null
 if(plan&&(r.shift_id!==plan.target.id||r.task_id!==plan.target.task_id))return null
 return freeze({ok:true,request_id:requestId,kind,result:{shift_id:r.shift_id,task_id:r.task_id,state:'cancelled'}})
}
function snapshot(x,intent=null){freeze(x);snapshots.add(x);if(intent)snapshotIntents.set(x,intent);return x}
const invalid=()=>snapshot({state:'invalid'})
export function deskCancelDiscoverArgs(){return freeze({p_action:'discover',p_epoch:null,p_request_id:null})}
// Only accept raw results of the audited transport from the actual operation,
// never arbitrary objects from another session or HTTP errors. Source is a
// mandatory caller-supplied discriminator; the host must enforce provenance.
function parseSnapshot(raw,{source,intent=null}={}){
 if(!['discover','write','control'].includes(source)||intent!==null&&!intents.has(intent))return invalid()
 const recovery=source!=='write'
 if(!exact(raw,recovery?['ok','epoch','active','durable_active']:['ok','epoch','active'])||raw.ok!==true||!epoch(raw.epoch)||recovery&&typeof raw.durable_active!=='boolean')return invalid()
 const base={source,epoch:raw.epoch}
 // A durable cursor or mixed state is never an idle or actionable cancellation state.
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
 // original cancellation payload to commit. Only the retained, branded intent can commit.
 return snapshot({...base,state:a.status,requestId:a.request_id,receipt},intent)
}
export function parseDeskCancelSnapshot(raw,options={}){
 if(!['discover','write'].includes(options?.source))return invalid()
 return parseSnapshot(raw,options)
}
export function deskCancelControlArgs(action,observed){
 if(!snapshots.has(observed)||observed.source!=='discover'&&observed.source!=='control')fail('DESK_CANCEL_CONTROL_INVALID')
 if(action==='cancel'?observed.state!=='reserved':action==='acknowledge'?!['committed','cancelled'].includes(observed.state):true)fail('DESK_CANCEL_CONTROL_INVALID')
 const args=freeze({p_action:action,p_epoch:observed.epoch,p_request_id:observed.requestId})
 controls.add(args);return args
}
export function parseDeskCancelControlResult(raw,args){
 if(!controls.has(args))return invalid()
 const state=parseSnapshot(raw,{source:'control'})
 if(args.p_action==='cancel'&&state.state==='cancelled'&&state.epoch===args.p_epoch&&state.requestId===args.p_request_id)return state
 if(args.p_action==='acknowledge'&&state.state==='idle'&&state.epoch===args.p_epoch+1)return state
 return invalid()
}
