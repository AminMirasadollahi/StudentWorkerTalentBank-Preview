// Detached review-only adapter; no production imports, real calls or auto retry.
// Caller must bind trusted project configuration and a verified actor/generation.
import {validCanonicalAssignmentPrerequisites} from './assignmentPrerequisites.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const exact=(x,list)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===list.length&&list.every(k=>Object.hasOwn(x,k))
const epoch=x=>Number.isSafeInteger(x)&&x>=0
const controlKeys=['p_action','p_epoch','p_request_id']
const writeKeys=[...controlKeys,'p_kind','p_worker_ids','p_unit_code','p_title','p_instructions','p_planned_date','p_estimate_minutes','p_start_minute','p_end_minute','p_short_notice_reason']
const error=()=>new Error('ASSIGNMENT_RECOVERY_TRANSPORT_UNCONFIRMED')
export function createScopedRecoveryHttpTransport({projectUrl,publishableKey,auth,actorId,isCurrent,fetchImpl,version=2}){
 const origin=typeof projectUrl==='string'&&projectUrl.match(/^(https:\/\/[a-z0-9]+\.supabase\.co)\/?$/)?.[1]
 // Reject custom domains and legacy keys pending separate review.
 if(![2,3].includes(version)||!origin||typeof publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)||!uuid(actorId)||
 typeof isCurrent!=='function'||typeof auth?.getSession!=='function'||typeof auth?.getUser!=='function'||typeof fetchImpl!=='function')throw error()
 const current=()=>{if(isCurrent()!==true)throw error()}
 const sessionToken=async()=>{
  current()
  const r=await auth.getSession()
  current()
  const token=r?.data?.session?.access_token
  if(r?.error||typeof token!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw error()
  return token
 }
 const call=async(kind,args)=>{
  try{
   current()
   const action=args?.p_action
   if(kind==='control'){
    if(!exact(args,controlKeys)||!['discover','cancel','acknowledge'].includes(action)||(action==='discover'?(args.p_epoch!==null||args.p_request_id!==null):(!epoch(args.p_epoch)||!uuid(args.p_request_id))))throw error()
   }else if(kind==='cancelExistingShift'){
    if(!exact(args,['shiftId','reason'])||!uuid(args.shiftId)||typeof args.reason!=='string'||args.reason!==args.reason.trim()||Array.from(args.reason).length<5||Array.from(args.reason).length>500)throw error()
   }else if(!exact(args,version===3?[...writeKeys,'p_prerequisites']:writeKeys)||(version===3&&!validCanonicalAssignmentPrerequisites(args.p_prerequisites))||!['reserve','commit'].includes(action)||!epoch(args.p_epoch)||!uuid(args.p_request_id)||!['direct','desk'].includes(args.p_kind))throw error()
   const body=JSON.stringify(kind==='cancelExistingShift'?{p_shift_id:args.shiftId,p_reason:args.reason}:args)
   const token=await sessionToken()
   const verified=await auth.getUser(token)
   current()
   if(verified?.error||verified?.data?.user?.id!==actorId||verified.data.user.is_anonymous===true)throw error()
   if(await sessionToken()!==token)throw error()
   current()
   const rpc=kind==='control'?'ops_assignment_recovery_control_v2':kind==='cancelExistingShift'?'ops_cancel_library_desk_shift':version===3?'ops_assignment_recovery_write_v3':'ops_assignment_recovery_write_v2'
   const response=await fetchImpl(origin+'/rest/v1/rpc/'+rpc,{
    method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'},
    body,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'
   })
   current()
   if(response?.ok!==true)throw error()
   const result=await response.json()
   current()
   // Existing shift cancellation has a separate exact server contract.
   if(kind==='cancelExistingShift'){
    if(!exact(result,['ok','shift_id','state'])||result.ok!==true||result.shift_id!==args.shiftId||result.state!=='cancelled')throw error()
    return Object.freeze({ok:true,shift_id:args.shiftId,state:'cancelled'})
   }
   // Server verifies admin access and scope; core verifies receipt projection.
   return result
  }catch{throw error()}
 }
 return Object.freeze({write:args=>call('write',args),control:args=>call('control',args),cancelExistingShift:args=>call('cancelExistingShift',args)})
}
