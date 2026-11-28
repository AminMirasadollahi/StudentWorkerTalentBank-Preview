// Detached review-only batch session. The verified manager host must own ONE
// common fence above all direct/desk/batch editors; no transport or storage here.
// In particular, empty discovery at the same epoch does not settle a lost reserve.
import {buildDayBatchPlan,prepareDayBatchIntent,batchReserveArgs,batchCommitArgs,batchDiscoverArgs,parseDayBatchSnapshot,batchControlArgs,parseDayBatchControlResult} from './dayBatchAssignmentContract.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
// Shared fence is owner-scoped and non-reentrant. Never treat disposal,
// visibility changes, or HTTP errors as evidence of server rollback.
export function createManagerAssignmentFence(){
 let owner=null,disposed=false
 const acquire=token=>{if(disposed||!token||owner!==null)return false;owner=token;return true}
 const holds=token=>!disposed&&owner===token
 const release=token=>{if(!holds(token))return false;owner=null;return true}
 return Object.freeze({acquire,holds,release,isIdle:()=>!disposed&&owner===null,dispose:()=>{disposed=true;owner=null}})
}
export function createDayBatchManagerSession({write,control,makeId,fence}){
 if([write,control,makeId,fence?.acquire,fence?.holds,fence?.release,fence?.isIdle].some(x=>typeof x!=='function'))throw Error('BATCH_SESSION_DEPENDENCIES')
 const lease=Object.freeze({})
 let actor=null,verified=false,disposed=false,busy=false,generation=0,local=null,observed=null,state='checking',used=new Set(),uncertain=null
 const allowed=()=>!disposed&&verified&&actor!==null
 const held=()=>fence.holds(lease)
 const clear=()=>{observed=null;state='checking'}
 // Actor switch terminates this owner permanently. A new verified actor must
 // receive a new host/fence. A checking transition retains ambiguous writes.
 const setAccess=next=>{
  if(disposed)return
  const id=next?.status==='verified'&&uuid(next.actorId)?next.actorId:null
  generation++;verified=false;clear()
  if(next?.status==='checking')return
  if(!id||actor&&actor!==id){dispose();return}
  actor=id;verified=true
 }
 const snapshot=()=>{
  if(!allowed())return Object.freeze({state:disposed?'unavailable':'checking',canStart:false})
  const usable=!busy&&(held()||fence.isIdle())
  return Object.freeze({state,epoch:observed?.epoch??null,receipt:observed?.receipt??null,
   canStart:usable&&fence.isIdle()&&state==='idle'&&!local&&!uncertain,
   canCommit:usable&&held()&&state==='reserved'&&!!local&&observed?.requestId===local.requestId&&observed?.epoch===local.epoch,
   canRetryReserve:usable&&held()&&state==='reserve_unknown'&&!!local,
   canCancel:usable&&held()&&state==='reserved',
   canAcknowledge:usable&&held()&&['committed','cancelled'].includes(state),
   canDiscover:usable})
 }
 const settleIdle=()=>{
  local=null;uncertain=null;state='idle'
  if(held())fence.release(lease)
 }
 const invoke=async(label,fn,args,accept)=>{
  if(!allowed()||busy||!held()&&!fence.acquire(lease))return 'blocked'
  const g=++generation;busy=true;state=label;observed=null
  try{
   const raw=await fn(args)
   if(!allowed()||g!==generation)return 'stale'
   return accept(raw)
  }catch{if(!allowed()||g!==generation)return 'stale';state='unknown';return state}
  finally{busy=false}
 }
 const unknown=()=>{state='unknown';return state}
 const discover=()=>{
  if(!allowed()||busy||!held()&&!fence.isIdle())return Promise.resolve('blocked')
  return invoke('discovering',control,batchDiscoverArgs(),raw=>{
   let n=parseDayBatchSnapshot(raw,{source:'discover'})
   if(n.state==='invalid'||n.state==='held')return unknown()
   if(local&&n.epoch<local.epoch||uncertain&&n.epoch<uncertain.epoch)return unknown()
   if(n.state==='idle'){
    if(uncertain&&n.epoch===uncertain.epoch){
     // Only a reserve of the exact retained intent can be retried here.
     if(uncertain.action==='reserve'&&local){observed=n;state='reserve_unknown';return state}
     return unknown()
    }
    if(local&&n.epoch===local.epoch)return unknown()
    observed=n;settleIdle();return state
   }
   if(n.state==='foreign'){
    // A foreign intent is NOT an idle slot. The caller needs an explicit
    // routed handoff to the legacy owner, never cancellation from this port.
    observed=n;state='foreign'
    if(!local&&!uncertain&&held())fence.release(lease)
    return state
   }
   if(local&&n.epoch===local.epoch&&n.requestId===local.requestId){
    n=parseDayBatchSnapshot(raw,{source:'discover',intent:local})
    if(n.state==='invalid'||n.state==='held')return unknown()
   }else if(local){
    if(n.epoch===local.epoch)return unknown()
    local=null
   }
   if(uncertain&&n.epoch===uncertain.epoch&&n.requestId!==uncertain.requestId)return unknown()
   // Confirmed reserve is still actionable after a lost commit response;
   // commit retry is explicit, same retained payload only.
   observed=n;uncertain=null;state=n.state;return state
  })
 }
 const send=(action,args)=>{
  const intent=local
  if(!intent)return Promise.resolve('blocked')
  uncertain={action,epoch:intent.epoch,requestId:intent.requestId}
  return invoke(action==='reserve'?'reserving':'committing',write,args,raw=>{
   const n=parseDayBatchSnapshot(raw,{source:'write',intent})
   if(n.state==='invalid'||(action==='commit'&&n.state!=='committed'))return unknown()
   // Require fresh discovery for control actions after any write. A write
   // response can authorize commit, never cancel/ack directly.
   observed=n;uncertain=null;state=n.state;return state
  })
 }
 const reserve=(draft,context)=>{
  if(!snapshot().canStart||!observed)return Promise.resolve('blocked')
  let intent
  try{intent=prepareDayBatchIntent(buildDayBatchPlan(draft,context),makeId(),observed);if(used.has(intent.requestId))return Promise.resolve('invalid')}catch{return Promise.resolve('invalid')}
  if(!fence.acquire(lease))return Promise.resolve('blocked')
  used.add(intent.requestId);local=intent
  return send('reserve',batchReserveArgs(intent))
 }
 const retryReserve=()=>snapshot().canRetryReserve?send('reserve',batchReserveArgs(local)):Promise.resolve('blocked')
 const commit=()=>{
  if(!snapshot().canCommit)return Promise.resolve('blocked')
  try{return send('commit',batchCommitArgs(local,observed))}catch{return Promise.resolve('blocked')}
 }
 const submit=async(draft,context)=>{
  const p=reserve(draft,context),g=generation,intent=local
  const outcome=await p
  if(outcome!=='reserved')return outcome
  if(!allowed()||g!==generation||local!==intent)return 'stale'
  return commit()
 }
 const act=action=>{
  if(action==='cancel'?!snapshot().canCancel:!snapshot().canAcknowledge)return Promise.resolve('blocked')
  let args
  try{args=batchControlArgs(action,observed)}catch{return Promise.resolve('discover_required')}
  uncertain={action,epoch:args.p_epoch,requestId:args.p_request_id}
  return invoke(action==='cancel'?'cancelling':'acknowledging',control,args,raw=>{
   const n=parseDayBatchControlResult(raw,args)
   if(n.state==='invalid')return unknown()
   observed=n;uncertain=null
   if(n.state==='idle'){local=null;state='needs_discovery';return state}
   state=n.state;return state
  })
 }
 function dispose(){
  generation++;verified=false;disposed=true;local=null;observed=null;uncertain=null;used.clear();actor=null
  // Deliberately do not release a held lease on disposal: the owner host
  // must discard its whole fence and verify server state for a new owner.
 }
 return Object.freeze({setAccess,snapshot,discover,reserve,retryReserve,commit,submit,cancel:()=>act('cancel'),acknowledge:()=>act('acknowledge'),dispose})
}
