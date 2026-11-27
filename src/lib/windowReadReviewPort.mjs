// Explicitly injected, read-only synthetic capability. No SDK, URL flags,
// local/session storage, production RPC or automatic legacy fallback.
import {createWindowFixtureApiV1} from './windowFixtureApiV1.mjs'
import {validateWindowTermRead,validateWindowTermAccess} from './windowTermReview.mjs'
const brand=new WeakMap()
let nextPortId=0
const coverage='independent_recent_kinds_plus_all_open_and_loaded_report_links'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
export function createWindowReadReviewPort({syntheticReviewOnly,fixtureTransport}={}){
 if(syntheticReviewOnly!==true||typeof fixtureTransport!=='function')throw Error('WINDOW_REVIEW_PORT_FIXTURE_ONLY')
 const withApi=async(context,fn)=>{
  const api=createWindowFixtureApiV1({syntheticReviewOnly:true,fixtureTransport:async(name,args)=>{
   if(!['qa_window_api_capabilities_v1','qa_window_api_manager_read_v1','qa_window_api_worker_read_v1','qa_window_api_term_read_v1','qa_window_api_term_access_v1'].includes(name))throw Error('WINDOW_REVIEW_READ_ONLY')
   return fixtureTransport(name,args)
  }})
  try{
   api.setContext(context)
   if((await api.negotiate()).status!=='ready')throw Error('WINDOW_REVIEW_CAPABILITY_DENIED')
   return await fn(api)
  }finally{api.dispose()}
 }
 const p=Object.freeze({read:context=>withApi(context,async api=>{
   const v=await api.call(context.role==='manager'?'manager_read':'worker_read')
   if(v.status!=='ok'||v.value.history_scope!==coverage)throw Error('WINDOW_REVIEW_CONTRACT_DENIED')
   if(context.role==='worker'&&(!Array.isArray(v.value.time_entries)||v.value.time_entries.some(e=>e.worker_id!=null&&e.worker_id!==context.workerId)))throw Error('WINDOW_REVIEW_OWNER_MISMATCH')
   return v.value
 }),term:(context,filters={})=>withApi(context,async api=>{
  if(context.role!=='manager')throw Error('WINDOW_TERM_ROLE_DENIED')
  const {termId=null,unit=null,workerId=null}=filters
  const r=await api.call('term_read',{p_term_id:termId,p_unit_code:unit,p_worker_id:workerId})
  if(r.status!=='ok')throw Error('WINDOW_TERM_READ_FAILED')
  return validateWindowTermRead(r.value,{termId,unit,workerId})
 }),access:(context,term)=>withApi(context,async api=>{
  if(context.role!=='manager')throw Error('WINDOW_TERM_ROLE_DENIED')
  const r=await api.call('term_access',{p_term_id:term.id})
  if(r.status!=='ok')throw Error('WINDOW_TERM_ACCESS_FAILED')
  return validateWindowTermAccess(r.value,term)
 })})
 brand.set(p,++nextPortId);return p
}
export function windowReadReviewScope(request,role,workerId,revision){
 if(!request||!brand.has(request.port)||!Number.isSafeInteger(revision)||revision<0)return null
 const c=request.context
 if(c?.status!=='verified'||c.role!==role||!uuid(c.actorId))return null
 if(role==='manager'&&c.workerId!=null)return null
 if(role==='worker'&&(!uuid(workerId)||c.workerId!==workerId||c.ready!==true))return null
 if(!['manager','worker'].includes(role))return null
 return {port:request.port,context:{status:'verified',role,actorId:c.actorId,workerId:role==='worker'?workerId:null},
  key:JSON.stringify([brand.get(request.port),role,c.actorId,workerId??null,revision])}
}
