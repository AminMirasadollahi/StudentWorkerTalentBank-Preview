// Review-only unified owner. Mount above editors, not inside a route.
 // One operation at a time across legacy direct/desk, batch and shift cancellation.
 // Server cursor is authoritative; this is not a cross-tab or server lock.
import {createAssignmentRecoverySession,parseRecoveryView} from './assignmentRecoverySession.mjs'
import {createDayBatchManagerSession,createManagerAssignmentFence} from './dayBatchManagerSession.mjs'
import {batchDiscoverArgs,parseDayBatchSnapshot} from './dayBatchAssignmentContract.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const blocked=()=>Promise.resolve('blocked')
export function createDayBatchSharedManager({actorId,legacyWrite,legacyControl,batchWrite,batchControl,cancelExistingShift,makeId}){
 if(!uuid(actorId)||[legacyWrite,legacyControl,batchWrite,batchControl,cancelExistingShift,makeId].some(x=>typeof x!=='function'))throw Error('SHARED_MANAGER_DEPENDENCIES')
 let generation=0,verified=false,disposed=false,busy=false,owner=null,ready=false,route=null,readReady=false,readRevision=0,shiftHeld=false,status='checking',legacyAck=null,legacyAttempt=null,legacyObserved=null
 const fence=createManagerAssignmentFence()
 const allowed=()=>verified&&!disposed&&readReady
 const legacy=createAssignmentRecoverySession({version:3,write:async args=>{
  // Record possible server effect BEFORE awaiting transport.
  legacyAttempt={epoch:args.p_epoch,key:args.p_request_id}
  return legacyWrite(args)
 },control:async args=>{
  if(args.p_action==='discover'){
   const raw=await legacyControl(args),v=parseRecoveryView(raw)
   if(!v)throw Error('LEGACY_VIEW_INVALID')
   if(legacyAttempt&&(v.epoch<legacyAttempt.epoch||v.epoch===legacyAttempt.epoch&&v.active&&v.active.requestId!==legacyAttempt.key))throw Error('LEGACY_TARGET_HELD')
   if(legacyAck&&v.epoch<legacyAck.epoch)throw Error('LEGACY_ACK_HELD')
   legacyObserved=v
   return raw
  }
  return legacyControl(args)
 },makeId})
 const batch=createDayBatchManagerSession({write:batchWrite,control:batchControl,makeId,fence})
 const sync=()=>{
  generation++;ready=false;status='checking';legacyObserved=null
  const a=allowed()?{status:'verified',actorId}:{status:'checking'}
  legacy.setAccess(a);batch.setAccess(a)
 }
 const setAccess=next=>{
  if(disposed)return
  if(next?.status!=='checking'&&(next?.status!=='verified'||next.actorId!==actorId)){dispose();return}
  // Rechecking identity invalidates every previous work/candidate read proof.
  readRevision++;readReady=route==='report';verified=next.status==='verified';sync()
 }
 const selectReadScope=scope=>{
  if(disposed||!['work','candidates','report'].includes(scope))return false
  if(route===scope)return true
  route=scope;readRevision++;readReady=scope==='report';sync();return true
 }
 const beginScopedRead=scope=>{
  if(disposed||scope!==route||!['work','candidates'].includes(scope))return ()=>false
  const revision=++readRevision;readReady=false;sync();let settled=false
  return state=>{
   if(disposed||settled||scope!==route||revision!==readRevision||!['ready','failed'].includes(state))return false
   settled=true;readReady=state==='ready';sync();return true
  }
 }
 // A stale route read cannot reopen the gate. Auth proof is separate.
 const snapshot=()=>{
  if(disposed||!allowed())return Object.freeze({state:disposed?'unavailable':'checking',owner:null,canStart:false,canDiscover:false})
  if(shiftHeld)return Object.freeze({state:'shift_unconfirmed',owner:'shift',canStart:false,canDiscover:false})
  if(busy)return Object.freeze({state:'busy',owner,canStart:false,canDiscover:false})
  const s=owner==='legacy'?legacy.snapshot():owner==='batch'?batch.snapshot():null
  const state=ready&&!owner?'idle':status==='unknown'||status==='checking'?status:s?.state??status
  const actionable=state!=='checking'&&state!=='unknown'
  return Object.freeze({state,owner,kind:owner==='legacy'?s?.kind??null:owner==='batch'?'batch_direct_v1':null,receipt:actionable?s?.receipt??null:null,canStart:ready&&owner===null&&route==='work',
   canDiscover:true,canCommit:actionable&&s?.canCommit===true,canRetryReserve:actionable&&s?.canRetryReserve===true,
   canCancel:actionable&&s?.canCancel===true,canAcknowledge:actionable&&s?.canAcknowledge===true})
 }
 const run=async fn=>{
  if(!allowed()||busy||shiftHeld)return 'blocked'
  const g=generation;busy=true
  const current=()=>allowed()&&generation===g
  try{const result=await fn(current);if(!current())return 'stale';return result}
  catch{if(!current())return 'stale';ready=false;status='unknown';return status}
  finally{busy=false}
 }
 const freshIdle=()=>{owner=null;legacyAttempt=null;legacyAck=null;ready=true;status='idle';return 'idle'}
 const unknown=()=>{ready=false;status='unknown';return status}
 const discover=()=>run(async current=>{
  ready=false
  if(owner==='batch'){
   const result=await batch.discover();if(!current())return 'stale'
   if(result==='idle')return freshIdle()
   if(result==='foreign')return unknown() // sticky owner: no guessed handoff
   status=result;return result
  }
  // Legacy owner never calls a mutating batch operation. A typed batch
  // discovery is an independent read used to detect incompatible states.
  // Do not call the batch session's discover here: it may take its lease.
  const n=parseDayBatchSnapshot(await batchControl(batchDiscoverArgs()),{source:'discover'})
  if(!current())return 'stale'
  if(n.state==='invalid'||n.state==='held')return unknown()
  if(owner==='legacy'||n.state==='foreign'){
   if(n.state!=='foreign'&&n.state!=='idle')return unknown()
   if(n.state==='foreign'&&!['direct','desk'].includes(n.kind))return unknown()
   owner='legacy'
   const result=await legacy.discover();if(!current())return 'stale'
   const v=legacyObserved
   if(!v||v.epoch!==n.epoch||n.state==='foreign'&&(!v.active||v.active.kind!==n.kind||v.active.status!==n.status)||n.state==='idle'&&v.active)return unknown()
   if(result==='idle'){
    if(legacyAck&&v.epoch<=legacyAck.epoch||legacyAttempt&&v.epoch<=legacyAttempt.epoch)return unknown()
    return freshIdle()
   }
   status=result;return result
  }
  // No local intent yet. Adopt a recovered batch state or get fresh idle
  // proof from the batch session itself, without assuming the first read.
  owner='batch'
  const result=await batch.discover();if(!current())return 'stale'
  if(result==='idle')return freshIdle()
  if(result==='foreign'){owner=null;return unknown()}
  status=result;return result
 })
 const begin=(kind,draft,context)=>snapshot().canStart?run(async current=>{
  ready=false;owner=kind
  const session=kind==='batch'?batch:legacy
  // Revalidate before reserve; never use stale proof after another route.
  const result=await session.discover();if(!current())return 'stale'
  if(result!=='idle'){
   status=result
   if(kind==='batch'&&result==='foreign'||kind==='legacy'&&result==='unknown'){owner=null;status='unknown'}
   return result
  }
  const out=kind==='batch'?await batch.submit(draft,context):await legacy.submit(draft)
  if(!current())return 'stale'
  status=out
  if(out==='invalid'){owner=null;ready=false;status='checking'}
  return out
 }):blocked()
 const action=method=>{
  const s=snapshot(),flag={commit:'canCommit',retryReserve:'canRetryReserve',cancel:'canCancel',acknowledge:'canAcknowledge'}[method]
  if(!owner||!s[flag])return blocked()
  return run(async current=>{
   const session=owner==='batch'?batch:legacy
   if(owner==='legacy'&&method==='acknowledge')legacyAck={epoch:session.snapshot().epoch}
   const out=await session[method]();if(!current())return 'stale'
   // Never use acknowledgement response alone to authorize a new request.
   status=out==='idle'?'needs_discovery':out;ready=false;return status
  })
 }
 const shift=async args=>{
  if(!snapshot().canStart)throw Error('SHIFT_CANCEL_BLOCKED')
  const result=await run(async current=>{
   ready=false;owner='shift';shiftHeld=true
   const r=await cancelExistingShift(args)
   if(!current()||r?.ok!==true||r.shift_id!==args?.shiftId||r.state!=='cancelled')throw Error('SHIFT_CANCEL_UNCONFIRMED')
   shiftHeld=false;owner=null;status='checking';return 'cancelled'
  })
  if(result!=='cancelled')throw Error('SHIFT_CANCEL_UNCONFIRMED')
  return Object.freeze({ok:true,shift_id:args.shiftId,state:'cancelled'})
 }
 function dispose(){generation++;verified=false;disposed=true;ready=false;legacy.dispose();batch.dispose();fence.dispose()}
 return Object.freeze({setAccess,selectReadScope,beginScopedRead,snapshot,discover,submitLegacy:d=>begin('legacy',d),submitBatch:(d,c)=>begin('batch',d,c),commit:()=>action('commit'),retryReserve:()=>action('retryReserve'),cancel:()=>action('cancel'),acknowledge:()=>action('acknowledge'),cancelExistingShift:shift,dispose})
}
