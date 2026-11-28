// Detached release admission candidate. No default fetch, no storage, no writers.
// Existing review-only transports and normal entry remain unchanged.
import {resolveRecoveryReviewConfig} from './recoveryReviewLifecycle.mjs'
const PROD='pmwxryavkrjcdobwkryw'
export const TYPED_ASSIGNMENT_RELEASE_CONTRACT='swtb-typed-day-v1'
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
export function exactTypedReleaseStatus(v,{projectRef,releaseId},actorId){
 const keys=['ok','contract','project_ref','release_id','actor_id','state']
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))&&
 v.ok===true&&v.contract===TYPED_ASSIGNMENT_RELEASE_CONTRACT&&v.project_ref===projectRef&&v.release_id===releaseId&&v.actor_id===actorId&&v.state==='ready'
}
// No capability cache. Recheck status under same actor/token/current generation.
// This is admission evidence, not authorization of a write or proof of caller drain.
export function createTypedAssignmentReleaseAdmission({env,auth,actorId,isCurrent,fetchImpl}){
 const config=resolveTypedAssignmentReleaseConfig(env)
 if(config.mode!=='release'||!uuid(actorId)||typeof auth?.getSession!=='function'||typeof auth?.getUser!=='function'||typeof isCurrent!=='function'||typeof fetchImpl!=='function')throw Error('TYPED_RELEASE_ADMISSION_BLOCKED')
 const current=()=>{if(isCurrent()!==true)throw Error('TYPED_RELEASE_ADMISSION_BLOCKED')}
 const token=async()=>{current();const s=await auth.getSession();current();const t=s?.data?.session?.access_token;if(s?.error||!jwt(t))throw Error('TYPED_RELEASE_ADMISSION_BLOCKED');return t}
 const check=async(expectedToken=null)=>{
  try{
   const t=await token();if(expectedToken!==null&&t!==expectedToken)return false
   const u=await auth.getUser(t);current()
   if(u?.error||u?.data?.user?.id!==actorId||u.data.user.is_anonymous===true||await token()!==t)return false
   current()
   const response=await fetchImpl(config.projectUrl+'/rest/v1/rpc/ops_assignment_typed_release_status_v1',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+t,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'},body:'{}',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'})
   current();if(response?.ok!==true)return false
   const v=await response.json();current()
   if(!exactTypedReleaseStatus(v,config,actorId)||await token()!==t)return false
   current();return true
  }catch{return false}
 }
 return Object.freeze({check})
}

// Fixed dispatch allowlist for the detached candidate only.
// Status checks never invoke discover (which can create a recovery cursor).
const releaseRoutes=Object.freeze([
 'ops_assignment_recovery_write_v3','ops_assignment_recovery_control_v2',
 'ops_assignment_batch_write_v1','ops_assignment_batch_control_v1',
 'ops_desk_cancel_write_v1','ops_desk_cancel_control_v1',
 'ops_get_operations_v3','ops_list_candidates','ops_get_operations_term_dashboard','ops_get_library_desk_shifts'
])
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
   if(typeof url!=='string'||!url.startsWith(prefix)||!releaseRoutes.includes(url.slice(prefix.length))||
      init.method!=='POST'||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||init.referrerPolicy!=='no-referrer'||
      h.apikey!==config.publishableKey||h['Content-Profile']!=='public'||!jwt(t)||typeof init.body!=='string')throw deny()
   // Bind the status proof to the exact token used in the pending RPC.
   if(await admission.check(t)!==true)throw deny()
   await tokenStillCurrent(t);current()
   const response=await fetchImpl(url,init)
   await tokenStillCurrent(t);current()
   return response
  }catch{throw deny()}
 }
 return Object.freeze({projectUrl:config.projectUrl,publishableKey:config.publishableKey,fetchImpl:dispatch,check:admission.check})
}
