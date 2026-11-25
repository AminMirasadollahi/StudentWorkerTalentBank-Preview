// Fixture-only V2 client protocol, pinned to PR60 tested SQL contract.
// No network, storage, SDK, live transport, automatic retry or legacy fallback.
import {buildDirectAssignmentPayload,validateDirectAssignmentReceipt} from './directAssignmentSession.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k))
const epoch=x=>Number.isSafeInteger(x)&&x>=0
const int=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
// Recovered receipt has no original payload: validate structure and key,
// not equality to a lost draft. Never synthesize replay arguments from it.
function recoveredReceipt(raw,key,kind){
 if(!obj(raw)||raw.ok!==true||raw.request_id!==key||raw.kind!==kind||!obj(raw.result))return null
 const r=raw.result
 let shape
 if(kind==='desk'){
  if(!Array.isArray(r.assigned)||!int(r.assigned.length,1,2)||!r.assigned.every(x=>obj(x)&&uuid(x.worker_id)&&uuid(x.task_id))||
   !date(r.shift_date)||!int(r.start_minute,0,1439)||!int(r.end_minute,1,1440)||r.end_minute<=r.start_minute)return null
  shape={p_request_id:key,p_kind:kind,p_worker_ids:r.assigned.map(x=>x.worker_id),p_planned_date:r.shift_date,p_start_minute:r.start_minute,p_end_minute:r.end_minute}
 }else if(Object.hasOwn(r,'group_id')){
  if(!int(r.member_count,2,20)||!int(r.minutes_per_worker,1,1440)||!['library','research','public_relations'].includes(r.unit_code))return null
  shape={p_request_id:key,p_kind:kind,p_worker_ids:Array(r.member_count).fill(null),p_estimate_minutes:r.minutes_per_worker,p_unit_code:r.unit_code}
 }else shape={p_request_id:key,p_kind:kind,p_worker_ids:[null]}
 return validateDirectAssignmentReceipt(raw,shape)
}
export function parseRecoveryView(raw,payload=null){
 if(!exact(raw,['ok','epoch','active'])||raw.ok!==true||!epoch(raw.epoch))return null
 if(raw.active===null)return Object.freeze({epoch:raw.epoch,active:null})
 const a=raw.active
 if(!obj(a)||!['reserved','committed','cancelled'].includes(a.status)||
 !exact(a,a.status==='committed'?['request_id','kind','status','receipt']:['request_id','kind','status'])||
 !uuid(a.request_id)||!['direct','desk'].includes(a.kind))return null
 if(payload&&(payload.p_request_id!==a.request_id||payload.p_kind!==a.kind))return null
 let receipt=null
 if(a.status==='committed'){
  receipt=payload?validateDirectAssignmentReceipt(a.receipt,payload):recoveredReceipt(a.receipt,a.request_id,a.kind)
  if(!receipt)return null
 }
 return Object.freeze({epoch:raw.epoch,active:Object.freeze({requestId:a.request_id,kind:a.kind,status:a.status,receipt})})
}
export function createAssignmentRecoverySession({write,control,makeId}){
 if([write,control,makeId].some(x=>typeof x!=='function'))throw Error('INVALID_FIXTURE_DEPENDENCIES')
 let actor=null,access='denied',generation=0,disposed=false,busy=false,local=null,view=null,state='blocked',used=new Set()
 const allowed=()=>!disposed&&access==='verified'&&actor!==null
 const reset=()=>{generation++;busy=false;view=null;state='blocked'}
 const setAccess=next=>{
  if(disposed)return
  const id=next?.status==='verified'&&uuid(next.actorId)?next.actorId:null
  if(next?.status==='checking'){reset();access='checking';return}
  if(!id||id!==actor){local=null;used=new Set();actor=id}
  reset();access=id?'verified':'denied'
 }
 const snapshot=()=>{
  if(!allowed())return Object.freeze({state:access==='checking'?'checking':'unavailable',canStart:false})
  const a=view?.active
  const matches=Boolean(a&&local&&view.epoch===local.epoch&&a.requestId===local.payload.p_request_id)
  return Object.freeze({state,epoch:view?.epoch??null,requestId:a?.requestId??local?.payload.p_request_id??null,kind:a?.kind??local?.payload.p_kind??null,
   receipt:a?.receipt??null,payload:matches?local.payload:null,
   canStart:!busy&&state==='idle',canCommit:!busy&&state==='reserved'&&matches,
   canRetryReserve:!busy&&state==='reserve_unknown'&&!!local,
   canCancel:!busy&&state==='reserved',canAcknowledge:!busy&&['committed','cancelled'].includes(state)})
 }
 const invoke=async(label,transport,args,accept)=>{
  if(!allowed()||busy)return 'blocked'
  const g=++generation
  busy=true;state=label;view=null
  try{
   const raw=await transport(args)
   if(g!==generation||!allowed())return 'stale'
   const next=accept(raw)
   if(!next){state='unknown';return state}
   view=next
   state=next.active?.status??'idle'
   return state
  }catch{if(g!==generation||!allowed())return 'stale';state='unknown';return state}
  finally{if(g===generation)busy=false}
 }
 const discover=async()=>{
  if(!allowed()||busy)return 'blocked'
  const result=await invoke('discovering',control,Object.freeze({p_action:'discover',p_epoch:null,p_request_id:null}),raw=>{
   const n=parseRecoveryView(raw)
   if(!n)return null
   if(local){
    if(n.epoch<local.epoch)return null
    if(n.epoch===local.epoch&&n.active===null){
     // A reserve may still arrive. Do not create another local intent.
     if(local.reserved)return null
     return n
    }
    if(n.epoch===local.epoch&&n.active?.requestId===local.payload.p_request_id){
     const checked=parseRecoveryView(raw,local.payload)
     if(!checked)return null
     local.reserved=true
     return checked
    }
    // A different active key occupies the slot, or epoch has advanced.
    // The old local payload can no longer safely be replayed.
    local=null
   }
   return n
  })
  if(result==='idle'&&local){state='reserve_unknown';return state}
  return result
 }
 const send=async(action)=>{
  const p=local
  if(!p)return 'blocked'
  const args=Object.freeze({p_action:action,p_epoch:p.epoch,...p.payload})
  return invoke(action==='reserve'?'reserving':'committing',write,args,raw=>{
   const n=parseRecoveryView(raw,p.payload)
   if(!n?.active||n.epoch!==p.epoch)return null
   if(action==='commit'&&n.active.status!=='committed')return null
   p.reserved=true
   return n
  })
 }
 const reserve=async draft=>{
  if(!allowed()||busy||state!=='idle'||!view||local)return 'blocked'
  let payload
  try{payload=buildDirectAssignmentPayload(draft,makeId());if(used.has(payload.p_request_id))return 'invalid'}catch{return 'invalid'}
  used.add(payload.p_request_id)
  local={epoch:view.epoch,payload,reserved:false}
  return send('reserve')
 }
 const retryReserve=()=>allowed()&&!busy&&state==='reserve_unknown'&&local?send('reserve'):Promise.resolve('blocked')
 const commit=()=>snapshot().canCommit?send('commit'):Promise.resolve('blocked')
 const cancel=()=>{
  if(!snapshot().canCancel)return Promise.resolve('blocked')
  const old=view
  return invoke('cancelling',control,Object.freeze({p_action:'cancel',p_epoch:old.epoch,p_request_id:old.active.requestId}),raw=>{
   const n=parseRecoveryView(raw,local?.payload??null)
   return n?.epoch===old.epoch&&n.active?.requestId===old.active.requestId&&n.active.kind===old.active.kind&&['cancelled','committed'].includes(n.active.status)?n:null
  })
 }
 const acknowledge=()=>{
  if(!snapshot().canAcknowledge)return Promise.resolve('blocked')
  const old=view
  return invoke('acknowledging',control,Object.freeze({p_action:'acknowledge',p_epoch:old.epoch,p_request_id:old.active.requestId}),raw=>{
   const n=parseRecoveryView(raw)
   if(!n||n.active!==null||n.epoch!==old.epoch+1)return null
   local=null;return n
  })
 }
 const dispose=()=>{reset();local=null;actor=null;access='denied';used.clear();disposed=true}
 return Object.freeze({setAccess,snapshot,discover,reserve,retryReserve,commit,cancel,acknowledge,dispose})
}
