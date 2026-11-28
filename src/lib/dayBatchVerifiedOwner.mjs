// Review-only verified owner above all assignment editors.
 // No auth subscription, window, storage or real network on construction.
 // Mount host must suspend synchronously on blur/read/auth events, not just hide UI.
import {createDayBatchSharedManager} from './dayBatchSharedManager.mjs'
import {createScopedDayBatchHttpTransport,createScopedDayBatchReleaseHttpTransport} from './scopedDayBatchHttpTransport.mjs'
import {createScopedDeskCancelHttpTransport,createScopedDeskCancelReleaseHttpTransport} from './scopedDeskCancelHttpTransport.mjs'
import {verifyRecoveryReviewAdmin} from './recoveryReviewLifecycle.mjs'
import {createTypedAssignmentReleaseAdmission,permitsTypedReleaseOwnerMethod,projectTypedReleaseSnapshot} from './typedAssignmentReleaseAdmission.mjs'
export function createDayBatchVerifiedOwner({mode,expectedProjectRef,projectUrl,publishableKey,auth,actorId,isVisible,fetchImpl,makeId,durableDeskCancel=false}){
 const config={mode,expectedProjectRef,projectUrl,publishableKey,auth,actorId,fetchImpl}
 return buildVerifiedOwner({actorId,isVisible,makeId,durableDeskCancel,
  transport:(desk,isCurrent)=>(desk?createScopedDeskCancelHttpTransport:createScopedDayBatchHttpTransport)({...config,isCurrent}),
  verify:async isCurrent=>{const identity=await verifyRecoveryReviewAdmin({projectUrl,publishableKey,auth,fetchImpl,actorId,isCurrent});return identity?.role==='admin'&&identity.user?.id===actorId}
 })
}
// Detached release owner always uses durable desk cancellation and a fresh exact
// server admission proof. No raw route and no implicit fallback to review/V2.
export function createTypedAssignmentReleaseOwner({env,auth,actorId,isVisible,fetchImpl,makeId}){
 const config={env,auth,actorId,fetchImpl}
 return buildVerifiedOwner({actorId,isVisible,makeId,durableDeskCancel:true,typedRelease:true,
  transport:(desk,isCurrent)=>(desk?createScopedDeskCancelReleaseHttpTransport:createScopedDayBatchReleaseHttpTransport)({...config,isCurrent}),
  verify:isCurrent=>createTypedAssignmentReleaseAdmission({...config,isCurrent}).check()
 })
}
function buildVerifiedOwner({actorId,isVisible,makeId,durableDeskCancel,transport,verify,typedRelease=false}){
 if(typeof isVisible!=='function'||typeof makeId!=='function'||typeof durableDeskCancel!=='boolean')throw Error('DAY_BATCH_OWNER_DEPENDENCIES')
 transport(false,()=>false)
 if(durableDeskCancel)transport(true,()=>false)
 let generation=0,phase='checking',disposed=false,capability=null,capabilityFloor=-1,capabilityFloorState=null,actionFlight=null
 const visible=()=>{try{return isVisible()===true}catch{return false}}
 const current=g=>!disposed&&phase==='verified'&&g===generation&&visible()
 const invoke=async(method,args)=>{
  const g=generation
  if(!current(g))throw Error('DAY_BATCH_OWNER_UNVERIFIED')
  const deskMethod=method==='deskCancelWrite'||method==='deskCancelControl'
  if(deskMethod&&!durableDeskCancel||durableDeskCancel&&method==='cancelExistingShift')throw Error('DAY_BATCH_OWNER_UNVERIFIED')
  const scoped=transport(deskMethod,()=>current(g))
  const result=await scoped[deskMethod?(method==='deskCancelWrite'?'write':'control'):method](args)
  if(!current(g))throw Error('DAY_BATCH_OWNER_UNVERIFIED')
  return result
 }
 const manager=createDayBatchSharedManager({actorId,makeId:()=>{if(!current(generation))throw Error('DAY_BATCH_OWNER_UNVERIFIED');return makeId()},
  legacyWrite:a=>invoke('legacyWrite',a),legacyControl:a=>invoke('legacyControl',a),batchWrite:a=>invoke('batchWrite',a),batchControl:a=>invoke('batchControl',a),...(durableDeskCancel?{deskCancelWrite:a=>invoke('deskCancelWrite',a),deskCancelControl:a=>invoke('deskCancelControl',a)}:{cancelExistingShift:a=>invoke('cancelExistingShift',a)})})
 const suspend=()=>{if(disposed)return;generation++;phase='checking';capability=null;actionFlight=null;manager.setAccess({status:'checking'})}
 const terminate=()=>{if(disposed)return;generation++;phase='blocked';capability=null;actionFlight=null;disposed=true;manager.dispose()}
 const acceptCapability=c=>{
  if(!permitsTypedReleaseOwnerMethod(c,'discover')||c.revision<capabilityFloor||c.revision===capabilityFloor&&c.state!==capabilityFloorState)return false
  capability=c;capabilityFloor=c.revision;capabilityFloorState=c.state;return true
 }
 const check=async()=>{
  if(disposed||!visible())return false
  suspend();const g=generation
  const valid=()=>!disposed&&g===generation&&visible()
  try{
   const verified=await verify(valid)
   if(!valid())return false
   if(typedRelease){
    if(!acceptCapability(verified))throw Error('DAY_BATCH_OWNER_UNVERIFIED')
   }else if(verified!==true)throw Error('DAY_BATCH_OWNER_UNVERIFIED')
   phase='verified';manager.setAccess({status:'verified',actorId});return true
  }catch{
   if(valid()){phase='blocked';manager.setAccess({status:'checking'})}
   return false
  }
 }
 const authChanged=(event,session)=>{
  if(disposed||event==='INITIAL_SESSION')return false
  if(event==='SIGNED_OUT'||event==='PASSWORD_RECOVERY'||session?.user?.id!==actorId){terminate();return false}
  // No async auth calls from inside auth event callback.
  suspend();return true
 }
 const snapshot=()=>current(generation)?(typedRelease?projectTypedReleaseSnapshot(manager.snapshot(),capability):manager.snapshot()):Object.freeze({state:disposed?'unavailable':phase==='blocked'?'blocked':'checking',owner:null,canStart:false,canDiscover:false})
 const call=async(method,...args)=>{
  if(!current(generation))return 'blocked'
  if(!typedRelease)return manager[method](...args)
  if(actionFlight||!permitsTypedReleaseOwnerMethod(capability,method))return 'blocked'
  const g=generation,flight={};actionFlight=flight
  try{
   // Recheck owner capability; transport checks again, SQL is authoritative.
   const c=await verify(()=>current(g))
   if(!current(g)||actionFlight!==flight)return 'stale'
   if(!acceptCapability(c)){
    suspend();return 'blocked'
   }
   if(!permitsTypedReleaseOwnerMethod(c,method))return 'blocked'
   const out=await manager[method](...args)
   return current(g)&&actionFlight===flight?out:'stale'
  }catch{if(current(g)&&actionFlight===flight)suspend();return 'blocked'}
  finally{if(actionFlight===flight)actionFlight=null}
 }
 return Object.freeze({check,suspend,terminate,authChanged,snapshot,
  selectReadScope:scope=>manager.selectReadScope(scope),beginScopedRead:scope=>manager.beginScopedRead(scope),
  discover:()=>call('discover'),submitLegacy:d=>call('submitLegacy',d),submitBatch:(d,c)=>call('submitBatch',d,c),submitDeskCancel:(d,c)=>call('submitDeskCancel',d,c),
  commit:()=>call('commit'),retryReserve:()=>call('retryReserve'),cancel:()=>call('cancel'),acknowledge:()=>call('acknowledge'),
  cancelExistingShift:args=>!durableDeskCancel&&current(generation)?manager.cancelExistingShift(args):Promise.reject(Error('SHIFT_CANCEL_BLOCKED')),
  dispose:terminate})
}
