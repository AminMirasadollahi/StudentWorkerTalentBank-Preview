// Explicit local DEV staging review adapter. Inert until authorized caller invokes it.
// No service role, production target, implicit fetch, generic RPC or storage.
import {resolveRecoveryReviewConfig} from './recoveryReviewLifecycle.mjs'
import {validWorkspaceWorkRead} from './dayBatchWorkspaceRead.mjs'
import {validIsoDay} from './assignmentCapacity.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const denied=()=>Error('SWTB28_STAGING_REVIEW_BLOCKED')
export function resolveStagingManagerReviewConfig(env,location){
 const config=resolveRecoveryReviewConfig(env)
 const expected=env?.VITE_SWTB28_STAGING_PROJECT_REF
 if(env?.DEV!==true||env?.VITE_SWTB28_STAGING_REVIEW_UI!=='true'||config.mode!=='review'||config.version!==3||
 env?.VITE_SWTB22_MANAGER_SHELL_UI!=='true'||env?.VITE_SWTB24_R5_MANAGER_IA_UI!=='true'||
 typeof expected!=='string'||expected!==env.VITE_SWTB22_RECOVERY_REVIEW_PROJECT_REF||
 config.projectUrl!=='https://'+expected+'.supabase.co'||!['localhost','127.0.0.1'].includes(location?.hostname)||
 !['http:','https:'].includes(location?.protocol))throw denied()
 return Object.freeze({expectedProjectRef:expected,projectUrl:config.projectUrl,publishableKey:config.publishableKey})
}
export function createStagingManagerFixture({env,location,auth,actorId,fetchImpl,makeId,today}){
 const config=resolveStagingManagerReviewConfig(env,location)
 if(!uuid(actorId)||typeof auth?.getSession!=='function'||typeof auth?.getUser!=='function'||
 typeof auth?.onAuthStateChange!=='function'||[fetchImpl,makeId,today].some(x=>typeof x!=='function'))throw denied()
 const read=async(rpc,args,isCurrent,validate)=>{
  const guard=()=>{if(typeof isCurrent!=='function'||isCurrent()!==true)throw denied()}
  try{
   const token=async()=>{guard();const r=await auth.getSession();guard();const t=r?.data?.session?.access_token
    if(r?.error||typeof t!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t))throw denied();return t}
   const t=await token(),u=await auth.getUser(t);guard()
   if(u?.error||u?.data?.user?.id!==actorId||u.data.user.is_anonymous===true||await token()!==t)throw denied()
   guard()
   const r=await fetchImpl(config.projectUrl+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+t,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'},body:JSON.stringify(args),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'})
   guard();if(r?.ok!==true)throw denied()
   const value=await r.json();guard()
   if(await token()!==t||!validate(value))throw denied()
   guard();return value
  }catch{throw denied()}
 }
 return Object.freeze({...config,mode:'staging-review',durableDeskCancel:true,actorId,auth,fetchImpl,makeId,today,
  readWork:current=>read('ops_get_operations_v3',{},current,validWorkspaceWorkRead),
  readCandidates:current=>read('ops_list_candidates',{},current,Array.isArray),
  readTerm:current=>read('ops_get_operations_term_dashboard',{p_term_id:null,p_unit_code:null,p_worker_id:null},current,v=>v?.ok===true&&Array.isArray(v.terms)),
  readDeskShifts:(day,current)=>{if(!validIsoDay(day)||day.startsWith('0000-'))return Promise.reject(denied());return read('ops_get_library_desk_shifts',{p_from:day,p_to:day},current,v=>v?.ok===true&&v.from===day&&v.to===day&&Array.isArray(v.shifts))}
 })
}
