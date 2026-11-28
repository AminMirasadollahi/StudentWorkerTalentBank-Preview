// Detached, explicit non-production review transport. No live call on construction.
 // A trusted owner must invalidate isCurrent synchronously on access changes.
import {createScopedRecoveryHttpTransport} from './scopedRecoveryHttpTransport.mjs'
import {validCanonicalAssignmentPrerequisites} from './assignmentPrerequisites.mjs'
const PRODUCTION_REF='pmwxryavkrjcdobwkryw'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const exact=(x,ks)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k))
const epoch=x=>Number.isSafeInteger(x)&&x>=0
const minutes=x=>Number.isInteger(x)&&x>=1&&x<=1440
const len=x=>typeof x==='string'?Array.from(x).length:Infinity
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const error=()=>Error('DAY_BATCH_TRANSPORT_UNCONFIRMED')
const controlKeys=['p_action','p_epoch','p_request_id']
const writeKeys=[...controlKeys,'p_term_id','p_rows']
const rowKeys=['id','mode','worker_ids','unit','title','instructions','date','minutes','reason','prerequisites']
const canonicalIds=ids=>Array.isArray(ids)&&ids.length>=1&&ids.length<=80&&ids.every((x,i)=>uuid(x)&&(i===0||ids[i-1]<x))
const validRows=rows=>{
 if(!Array.isArray(rows)||rows.length<1||rows.length>20)return false
 let pairs=0
 for(let i=0;i<rows.length;i++){
  const r=rows[i]
  if(!exact(r,rowKeys)||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(r.id)||i>0&&rows[i-1].id>=r.id||
  !['independent','collaborative'].includes(r.mode)||!canonicalIds(r.worker_ids)||r.mode==='collaborative'&&(r.worker_ids.length<2||r.worker_ids.length>20)||
  !['library','research','public_relations'].includes(r.unit)||len(r.title)<3||len(r.title)>160||r.title!==r.title.replace(/^ +| +$/g,'')||len(r.instructions)>3000||
  r.reason!==null&&len(r.reason)>300||!day(r.date)||!minutes(r.minutes)||!validCanonicalAssignmentPrerequisites(r.prerequisites))return false
  if([r.title,r.instructions,r.reason??''].some(x=>x.includes('\0')||Array.from(x).some(c=>c.length===1&&/[\uD800-\uDFFF]/.test(c))))return false
  pairs+=r.worker_ids.length
 }
 return pairs<=80
}
import {createTypedAssignmentReleaseRequestBoundary} from './typedAssignmentReleaseAdmission.mjs'
export function createScopedDayBatchHttpTransport({mode,expectedProjectRef,projectUrl,publishableKey,auth,actorId,isCurrent,fetchImpl}){
 // Real release configuration intentionally unsupported until separate acceptance.
 if(mode!=='review'||typeof expectedProjectRef!=='string'||!/^[a-z0-9]{20}$/.test(expectedProjectRef)||expectedProjectRef===PRODUCTION_REF||
 projectUrl!=='https://'+expectedProjectRef+'.supabase.co'||typeof publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)||
 !uuid(actorId)||typeof auth?.getSession!=='function'||typeof auth?.getUser!=='function'||typeof isCurrent!=='function'||typeof fetchImpl!=='function')throw error()
 return buildDayBatchHttpTransport({projectUrl,publishableKey,auth,actorId,isCurrent,fetchImpl})
}
// Detached candidate, not imported by the normal entry. Never expose raw cancellation here.
export function createScopedDayBatchReleaseHttpTransport({env,auth,actorId,isCurrent,fetchImpl}){
 const boundary=createTypedAssignmentReleaseRequestBoundary({env,auth,actorId,isCurrent,fetchImpl})
 const transport=buildDayBatchHttpTransport({...boundary,auth,actorId,isCurrent})
 return Object.freeze({legacyWrite:transport.legacyWrite,legacyControl:transport.legacyControl,batchWrite:transport.batchWrite,batchControl:transport.batchControl})
}
function buildDayBatchHttpTransport({projectUrl,publishableKey,auth,actorId,isCurrent,fetchImpl}){
 const legacy=createScopedRecoveryHttpTransport({projectUrl,publishableKey,auth,actorId,isCurrent,fetchImpl,version:3})
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
   }else if(!exact(args,writeKeys)||!['reserve','commit'].includes(a)||!epoch(args.p_epoch)||!uuid(args.p_request_id)||!uuid(args.p_term_id)||!validRows(args.p_rows))throw error()
   const body=JSON.stringify(args) // capture before async identity checks
   const t=await token(),user=await auth.getUser(t);current()
   if(user?.error||user?.data?.user?.id!==actorId||user.data.user.is_anonymous===true||await token()!==t)throw error()
   current()
   const rpc=kind==='control'?'ops_assignment_batch_control_v1':'ops_assignment_batch_write_v1'
   const r=await fetchImpl(projectUrl+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+t,'Content-Type':'application/json',Accept:'application/json','Content-Profile':'public'},body,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'})
   current()
   if(r?.ok!==true)throw error()
   const result=await r.json();current()
   // Raw success is not itself a valid receipt. The typed session checks it.
   return result
  }catch{throw error()}
 }
 return Object.freeze({legacyWrite:legacy.write,legacyControl:legacy.control,cancelExistingShift:legacy.cancelExistingShift,batchWrite:a=>call('write',a),batchControl:a=>call('control',a)})
}
