// Explicit release-only scoped reads. No import of the DEV staging adapter.
import {resolveTypedAssignmentReleaseConfig,createTypedAssignmentReleaseRequestBoundary} from './typedAssignmentReleaseAdmission.mjs'
import {validWorkspaceWorkRead} from './dayBatchWorkspaceRead.mjs'
import {validIsoDay} from './assignmentCapacity.mjs'
const denied=()=>Error('TYPED_RELEASE_MANAGER_READ_BLOCKED')
export function createTypedAssignmentReleaseManagerFixture({env,auth,actorId,fetchImpl,makeId,today}){
 const config=resolveTypedAssignmentReleaseConfig(env)
 if(config.mode!=='release'||typeof auth?.onAuthStateChange!=='function'||[fetchImpl,makeId,today].some(x=>typeof x!=='function'))throw denied()
 createTypedAssignmentReleaseRequestBoundary({env,auth,actorId,isCurrent:()=>false,fetchImpl})
 const read=async(rpc,args,isCurrent,validate)=>{
  const guard=()=>{if(typeof isCurrent!=='function'||isCurrent()!==true)throw denied()}
  try{
   const token=async()=>{guard();const s=await auth.getSession();guard();const t=s?.data?.session?.access_token;if(s?.error||typeof t!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t))throw denied();return t}
   const t=await token()
   const boundary=createTypedAssignmentReleaseRequestBoundary({env,auth,actorId,isCurrent,fetchImpl})
   const response=await boundary.fetchImpl(config.projectUrl+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+t,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'},body:JSON.stringify(args),credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'})
   guard();if(response?.ok!==true)throw denied();const v=await response.json();guard();if(await token()!==t||!validate(v))throw denied();guard();return v
  }catch{throw denied()}
 }
 return Object.freeze({mode:'typed-release',env,actorId,auth,fetchImpl,makeId,today,durableDeskCancel:true,
  readWork:current=>read('ops_get_operations_v3',{},current,validWorkspaceWorkRead),
  readCandidates:current=>read('ops_list_candidates',{},current,Array.isArray),
  readTerm:current=>read('ops_get_operations_term_dashboard',{p_term_id:null,p_unit_code:null,p_worker_id:null},current,v=>v?.ok===true&&Array.isArray(v.terms)),
  readDeskShifts:(day,current)=>{if(!validIsoDay(day)||day.startsWith('0000-'))return Promise.reject(denied());return read('ops_get_library_desk_shifts',{p_from:day,p_to:day},current,v=>v?.ok===true&&v.from===day&&v.to===day&&Array.isArray(v.shifts))}
 })
}
