// Detached review-only transport for the dormant typed cancellation RPCs.
// No raw cancellation fallback, storage, default fetch, or release configuration.
const PRODUCTION_REF='pmwxryavkrjcdobwkryw'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const exact=(x,ks)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k))
const epoch=x=>Number.isSafeInteger(x)&&x>=0
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const error=()=>Error('DESK_CANCEL_TRANSPORT_UNCONFIRMED')
const controlKeys=['p_action','p_epoch','p_request_id']
const writeKeys=[...controlKeys,'p_shift_id','p_task_id','p_worker_id','p_day','p_start_minute','p_end_minute','p_reason']
const validReason=x=>typeof x==='string'&&x===x.replace(/^ +| +$/g,'')&&Array.from(x).length>=5&&Array.from(x).length<=500&&!x.includes('\0')&&!Array.from(x).some(c=>c.length===1&&/[\uD800-\uDFFF]/.test(c))
const validWrite=a=>exact(a,writeKeys)&&['reserve','commit'].includes(a.p_action)&&epoch(a.p_epoch)&&[a.p_request_id,a.p_shift_id,a.p_task_id,a.p_worker_id].every(uuid)&&day(a.p_day)&&!a.p_day.startsWith('0000-')&&Number.isInteger(a.p_start_minute)&&Number.isInteger(a.p_end_minute)&&a.p_start_minute>=0&&a.p_end_minute<=1440&&a.p_start_minute<a.p_end_minute&&validReason(a.p_reason)
import {createTypedAssignmentReleaseRequestBoundary} from './typedAssignmentReleaseAdmission.mjs'
export function createScopedDeskCancelHttpTransport({mode,expectedProjectRef,projectUrl,publishableKey,auth,actorId,isCurrent,fetchImpl}){
 // Real release configuration intentionally unsupported until separate acceptance.
 if(mode!=='review'||typeof expectedProjectRef!=='string'||!/^[a-z0-9]{20}$/.test(expectedProjectRef)||expectedProjectRef===PRODUCTION_REF||
 projectUrl!=='https://'+expectedProjectRef+'.supabase.co'||typeof publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)||
 !uuid(actorId)||typeof auth?.getSession!=='function'||typeof auth?.getUser!=='function'||typeof isCurrent!=='function'||typeof fetchImpl!=='function')throw error()
 return buildDeskCancelHttpTransport({projectUrl,publishableKey,auth,actorId,isCurrent,fetchImpl})
}
// Detached candidate, not imported by the normal entry. Never expose raw cancellation here.
export function createScopedDeskCancelReleaseHttpTransport({env,auth,actorId,isCurrent,fetchImpl}){
 const boundary=createTypedAssignmentReleaseRequestBoundary({env,auth,actorId,isCurrent,fetchImpl})
 const transport=buildDeskCancelHttpTransport({...boundary,auth,actorId,isCurrent})
 return transport
}
function buildDeskCancelHttpTransport({projectUrl,publishableKey,auth,actorId,isCurrent,fetchImpl}){
 const current=()=>{if(isCurrent()!==true)throw error()}
 const token=async()=>{
  current();const r=await auth.getSession();current()
  const t=r?.data?.session?.access_token
  if(r?.error||typeof t!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t))throw error()
  return t
 }
 const call=async(kind,args)=>{
  try{
   current()
   const a=args?.p_action
   if(kind==='control'){
    if(!exact(args,controlKeys)||!['discover','cancel','acknowledge'].includes(a)||(a==='discover'?(args.p_epoch!==null||args.p_request_id!==null):(!epoch(args.p_epoch)||!uuid(args.p_request_id))))throw error()
   }else if(!validWrite(args))throw error()
   const body=JSON.stringify(args) // capture before async identity checks
   const t=await token(),user=await auth.getUser(t);current()
   if(user?.error||user?.data?.user?.id!==actorId||user.data.user.is_anonymous===true||await token()!==t)throw error()
   current()
   const rpc=kind==='control'?'ops_desk_cancel_control_v1':'ops_desk_cancel_write_v1'
   const r=await fetchImpl(projectUrl+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+t,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'},body,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'})
   current()
   if(r?.ok!==true)throw error()
   const result=await r.json();current()
   // Raw success is not itself a valid receipt. The typed session checks it.
   return result
  }catch{throw error()}
 }
 return Object.freeze({write:a=>call('write',a),control:a=>call('control',a)})
}
