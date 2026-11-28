// Review-only verified owner above all assignment editors.
 // No auth subscription, window, storage or real network on construction.
 // Mount host must suspend synchronously on blur/read/auth events, not just hide UI.
import {createDayBatchSharedManager} from './dayBatchSharedManager.mjs'
import {createScopedDayBatchHttpTransport} from './scopedDayBatchHttpTransport.mjs'
import {verifyRecoveryReviewAdmin} from './recoveryReviewLifecycle.mjs'
export function createDayBatchVerifiedOwner({mode,expectedProjectRef,projectUrl,publishableKey,auth,actorId,isVisible,fetchImpl,makeId}){
 if(typeof isVisible!=='function'||typeof makeId!=='function')throw Error('DAY_BATCH_OWNER_DEPENDENCIES')
 const config={mode,expectedProjectRef,projectUrl,publishableKey,auth,actorId,fetchImpl}
 // Validate review config immediately, with an inert current guard.
 createScopedDayBatchHttpTransport({...config,isCurrent:()=>false})
 let generation=0,phase='checking',disposed=false
 const visible=()=>{try{return isVisible()===true}catch{return false}}
 const current=g=>!disposed&&phase==='verified'&&g===generation&&visible()
 const invoke=async(method,args)=>{
  const g=generation
  if(!current(g))throw Error('DAY_BATCH_OWNER_UNVERIFIED')
  const transport=createScopedDayBatchHttpTransport({...config,isCurrent:()=>current(g)})
  const result=await transport[method](args)
  if(!current(g))throw Error('DAY_BATCH_OWNER_UNVERIFIED')
  return result
 }
 const manager=createDayBatchSharedManager({actorId,makeId:()=>{if(!current(generation))throw Error('DAY_BATCH_OWNER_UNVERIFIED');return makeId()},
  legacyWrite:a=>invoke('legacyWrite',a),legacyControl:a=>invoke('legacyControl',a),batchWrite:a=>invoke('batchWrite',a),batchControl:a=>invoke('batchControl',a),cancelExistingShift:a=>invoke('cancelExistingShift',a)})
 const suspend=()=>{if(disposed)return;generation++;phase='checking';manager.setAccess({status:'checking'})}
 const terminate=()=>{if(disposed)return;generation++;phase='blocked';disposed=true;manager.dispose()}
 const check=async()=>{
  if(disposed||!visible())return false
  suspend();const g=generation
  const valid=()=>!disposed&&g===generation&&visible()
  try{
   const identity=await verifyRecoveryReviewAdmin({projectUrl,publishableKey,auth,fetchImpl,actorId,isCurrent:valid})
   if(!valid())return false
   if(identity?.role!=='admin'||identity.user?.id!==actorId)throw Error('DAY_BATCH_OWNER_UNVERIFIED')
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
 const snapshot=()=>current(generation)?manager.snapshot():Object.freeze({state:disposed?'unavailable':phase==='blocked'?'blocked':'checking',owner:null,canStart:false,canDiscover:false})
 const call=(method,...args)=>current(generation)?manager[method](...args):Promise.resolve('blocked')
 return Object.freeze({check,suspend,terminate,authChanged,snapshot,
  selectReadScope:scope=>manager.selectReadScope(scope),beginScopedRead:scope=>manager.beginScopedRead(scope),
  discover:()=>call('discover'),submitLegacy:d=>call('submitLegacy',d),submitBatch:(d,c)=>call('submitBatch',d,c),
  commit:()=>call('commit'),retryReserve:()=>call('retryReserve'),cancel:()=>call('cancel'),acknowledge:()=>call('acknowledge'),
  cancelExistingShift:args=>current(generation)?manager.cancelExistingShift(args):Promise.reject(Error('SHIFT_CANCEL_BLOCKED')),
  dispose:terminate})
}
