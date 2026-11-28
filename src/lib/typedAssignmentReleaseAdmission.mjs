// SWTB38 typed V2 candidate; release flag remains default OFF.
// Separate capability state; no fallback to V1 status or raw routes.
import {resolveRecoveryReviewConfig} from './recoveryReviewLifecycle.mjs'
const PROD='pmwxryavkrjcdobwkryw'
export const TYPED_ASSIGNMENT_RELEASE_CONTRACT='swtb-typed-day-v2'
const blocked=()=>Object.freeze({mode:'blocked'})
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x)&&!/^0+$/.test(x)
const jwt=x=>typeof x==='string'&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(x)
export function resolveTypedAssignmentReleaseConfig(env){
 const flag=env?.VITE_SWTB32_TYPED_ASSIGNMENT_RELEASE
 if(flag===undefined||flag==='false')return Object.freeze({mode:'off'})
 const legacy=resolveRecoveryReviewConfig(env)
 if(flag!=='true'||env?.PROD!==true||env?.DEV!==false||legacy.mode!=='release'||legacy.version!==3||
 env.VITE_SWTB22_MANAGER_SHELL_UI!=='true'||env.VITE_SWTB24_R5_MANAGER_IA_UI!=='true'||
 env.VITE_SWTB22_RECOVERY_REVIEW_UI==='true'||env.VITE_SWTB28_STAGING_REVIEW_UI==='true'||
 env.VITE_SWTB32_TYPED_RELEASE_PROJECT_REF!==PROD||legacy.projectUrl!=='https://'+PROD+'.supabase.co'||
 !sha(env.VITE_SWTB32_TYPED_RELEASE_ID))return blocked()
 return Object.freeze({mode:'release',version:3,contract:TYPED_ASSIGNMENT_RELEASE_CONTRACT,projectRef:PROD,projectUrl:legacy.projectUrl,publishableKey:legacy.publishableKey,releaseId:env.VITE_SWTB32_TYPED_RELEASE_ID})
}
const modes=Object.freeze(['ready','recover_only'])
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const epoch=n=>Number.isSafeInteger(n)&&n>=0
export function parseTypedReleaseCapability(v,{projectRef,releaseId},actorId){
 const keys=['ok','contract','project_ref','release_id','actor_id','state','revision']
 if(!exact(v,keys)||v.ok!==true||v.contract!==TYPED_ASSIGNMENT_RELEASE_CONTRACT||v.project_ref!==projectRef||
 v.release_id!==releaseId||v.actor_id!==actorId||!uuid(actorId)||!modes.includes(v.state)||!epoch(v.revision))return null
 return Object.freeze({state:v.state,revision:v.revision})
}
const controls=['ops_assignment_recovery_control_v2','ops_assignment_batch_control_v1','ops_desk_cancel_control_v1']
const writes=['ops_assignment_recovery_write_v3','ops_assignment_batch_write_v1','ops_desk_cancel_write_v1']
const reads=['ops_get_operations_v3','ops_list_candidates','ops_get_operations_term_dashboard','ops_get_library_desk_shifts']
const keys=['p_action','p_epoch','p_request_id']
const bodyKeys=Object.freeze({
 ops_assignment_recovery_write_v3:[...keys,'p_kind','p_worker_ids','p_unit_code','p_title','p_instructions','p_planned_date','p_estimate_minutes','p_start_minute','p_end_minute','p_short_notice_reason','p_prerequisites'],
 ops_assignment_batch_write_v1:[...keys,'p_term_id','p_rows'],
 ops_desk_cancel_write_v1:[...keys,'p_shift_id','p_task_id','p_worker_id','p_day','p_start_minute','p_end_minute','p_reason']
})
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!x.startsWith('0000-')&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
// Defense in depth. Existing per-route transports continue full payload validation.
// Recovery-only never initiates reserve, including uncertain reserve retry: discover
// first, then recover an existing reservation. SQL remains authoritative for races.
export function permitsTypedReleaseDispatch(capability,rpc,args){
 if(!modes.includes(capability?.state)||!epoch(capability.revision))return false
 if(controls.includes(rpc))return exact(args,keys)&&
 (args.p_action==='discover'?args.p_epoch===null&&args.p_request_id===null:
 ['cancel','acknowledge'].includes(args.p_action)&&epoch(args.p_epoch)&&uuid(args.p_request_id))
 if(writes.includes(rpc))return exact(args,bodyKeys[rpc])&&epoch(args.p_epoch)&&uuid(args.p_request_id)&&
 (args.p_action==='commit'||capability.state==='ready'&&args.p_action==='reserve')
 if(reads.includes(rpc)){
  if(rpc==='ops_get_operations_v3'||rpc==='ops_list_candidates')return exact(args,[])
  if(rpc==='ops_get_operations_term_dashboard')return exact(args,['p_term_id','p_unit_code','p_worker_id'])&&Object.values(args).every(x=>x===null)
  return exact(args,['p_from','p_to'])&&day(args.p_from)&&args.p_from===args.p_to
 }
 return false
}
const startMethods=['submitLegacy','submitBatch','submitDeskCancel','retryReserve']
const recoverMethods=['discover','commit','cancel','acknowledge']
export function permitsTypedReleaseOwnerMethod(capability,method){
 return modes.includes(capability?.state)&&epoch(capability.revision)&&
 (recoverMethods.includes(method)||capability.state==='ready'&&startMethods.includes(method))
}
export function projectTypedReleaseSnapshot(snapshot,capability){
 if(!modes.includes(capability?.state)||!epoch(capability.revision))return Object.freeze({state:'checking',owner:null,canStart:false,canDiscover:false,canStartDeskCancel:false,canCommit:false,canRetryReserve:false,canCancel:false,canAcknowledge:false})
 return Object.freeze({...snapshot,releaseCapability:capability.state,
 ...(capability.state==='recover_only'?{canStart:false,canStartDeskCancel:false,canRetryReserve:false}:{})})
}
export function createTypedAssignmentReleaseAdmission({env,auth,actorId,isCurrent,fetchImpl}){
 const config=resolveTypedAssignmentReleaseConfig(env)
 if(config.mode!=='release'||!uuid(actorId)||typeof auth?.getSession!=='function'||typeof auth?.getUser!=='function'||typeof isCurrent!=='function'||typeof fetchImpl!=='function')throw Error('TYPED_RELEASE_ADMISSION_BLOCKED')
 const current=()=>{if(isCurrent()!==true)throw Error('TYPED_RELEASE_ADMISSION_BLOCKED')}
 const token=async()=>{current();const s=await auth.getSession();current();const t=s?.data?.session?.access_token;if(s?.error||!jwt(t))throw Error('TYPED_RELEASE_ADMISSION_BLOCKED');return t}
 const check=async(expectedToken=null)=>{
  try{
   const t=await token();if(expectedToken!==null&&t!==expectedToken)return null
   const u=await auth.getUser(t);current()
   if(u?.error||u?.data?.user?.id!==actorId||u.data.user.is_anonymous===true||await token()!==t)return null
   current()
   const response=await fetchImpl(config.projectUrl+'/rest/v1/rpc/ops_assignment_typed_release_status_v2',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+t,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'},body:'{}',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'})
   current();if(response?.ok!==true)return null
   const v=await response.json();current()
   const c=parseTypedReleaseCapability(v,config,actorId)
   if(!c||await token()!==t)return null
   current();return c
  }catch{return null}
 }
 return Object.freeze({check})
}
export function createTypedAssignmentReleaseRequestBoundary({env,auth,actorId,isCurrent,fetchImpl}){
 const config=resolveTypedAssignmentReleaseConfig(env)
 const admission=createTypedAssignmentReleaseAdmission({env,auth,actorId,isCurrent,fetchImpl})
 const deny=()=>Error('TYPED_RELEASE_DISPATCH_BLOCKED')
 const current=()=>{if(isCurrent()!==true)throw deny()}
 const tokenStillCurrent=async t=>{current();const s=await auth.getSession();current();if(s?.error||s?.data?.session?.access_token!==t)throw deny()}
 const dispatch=async(url,init)=>{
  try{
   current()
   const prefix=config.projectUrl+'/rest/v1/rpc/'
   const h=init?.headers,t=typeof h?.Authorization==='string'&&h.Authorization.startsWith('Bearer ')?h.Authorization.slice(7):null
   if(typeof url!=='string'||!url.startsWith(prefix)||![...controls,...writes,...reads].includes(url.slice(prefix.length))||
      init.method!=='POST'||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||init.referrerPolicy!=='no-referrer'||
      h.apikey!==config.publishableKey||h['Content-Profile']!=='public'||h['Content-Type']!=='application/json'||h.Accept!=='application/json'||!jwt(t)||typeof init.body!=='string')throw deny()
   // Snapshot the full permitted request before asynchronous verification;
   // reconstruct known headers/options, never forward caller-mutated init.
   const rpc=url.slice(prefix.length),body=init.body,args=JSON.parse(body)
   const request=Object.freeze({method:'POST',headers:Object.freeze({apikey:config.publishableKey,Authorization:'Bearer '+t,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'}),body:JSON.stringify(args),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'})
   const c=await admission.check(t)
   if(!permitsTypedReleaseDispatch(c,rpc,args))throw deny()
   await tokenStillCurrent(t);current()
   const response=await fetchImpl(url,request)
   await tokenStillCurrent(t);current()
   return response
  }catch{throw deny()}
 }
 return Object.freeze({projectUrl:config.projectUrl,publishableKey:config.publishableKey,fetchImpl:dispatch,check:admission.check})
}
