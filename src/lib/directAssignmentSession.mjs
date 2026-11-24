// U01-B fixture-only core. No network, Supabase imports, storage or UI wiring.
// A trusted host must drive access from fresh server identity, never metadata.
// The server remains authoritative for business rules and permissions.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const int=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max
const len=x=>Array.from(x).length
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const invalid=()=>{throw new Error('INVALID_ASSIGNMENT_DRAFT')}
const unitCodes=new Set(['library','research','public_relations'])
const keyNames=['kind','workerIds','unit','title','instructions','date','minutes','startMinute','endMinute','reason']
export function buildDirectAssignmentPayload(d,requestId){
 if(!object(d)||!uuid(requestId)||Object.keys(d).some(k=>!keyNames.includes(k)))invalid()
 if(!['direct','desk'].includes(d.kind)||!Array.isArray(d.workerIds)||!d.workerIds.length||d.workerIds.length>20||!d.workerIds.every(uuid))invalid()
 const ids=d.workerIds.map(x=>x.toLowerCase()).sort()
 if(new Set(ids).size!==ids.length||!unitCodes.has(d.unit)||!date(d.date)||typeof d.title!=='string'||typeof d.instructions!=='string'||(d.reason!==null&&typeof d.reason!=='string'))invalid()
 // SQL btrim(text) trims ASCII space, not JS trim's wider whitespace set.
 const title=d.title.replace(/^ +| +$/g,'')
 if(len(title)<3||len(title)>160||len(d.instructions)>3000||len(d.reason??'')>300||[title,d.instructions,d.reason??''].some(s=>s.includes('\0')||Array.from(s).some(c=>c.length===1&&/[\uD800-\uDFFF]/.test(c))))invalid()
 if(d.kind==='direct'){
  if(!int(d.minutes,1,1440)||d.startMinute!==null||d.endMinute!==null)invalid()
 }else if(d.unit!=='library'||ids.length>2||d.minutes!==null||!int(d.startMinute,0,1439)||!int(d.endMinute,1,1440)||d.endMinute<=d.startMinute)invalid()
 return Object.freeze({p_request_id:requestId.toLowerCase(),p_kind:d.kind,p_worker_ids:Object.freeze(ids),p_unit_code:d.unit,p_title:title,p_instructions:d.instructions,p_planned_date:d.date,p_estimate_minutes:d.minutes,p_start_minute:d.startMinute,p_end_minute:d.endMinute,p_short_notice_reason:d.reason})
}
// Return only well-formed, expected receipt projections (no raw error/payload leak).
export function validateDirectAssignmentReceipt(raw,p){
 if(!object(raw)||raw.ok!==true||raw.request_id!==p.p_request_id||raw.kind!==p.p_kind||!object(raw.result))return null
 const r=raw.result,n=p.p_worker_ids.length
 let result
 if(p.p_kind==='desk'){
  if(r.ok!==true||!Array.isArray(r.assigned)||r.assigned.length!==n||r.shift_date!==p.p_planned_date||r.start_minute!==p.p_start_minute||r.end_minute!==p.p_end_minute||r.minutes_per_worker!==p.p_end_minute-p.p_start_minute)return null
  if(!r.assigned.every(x=>object(x)&&uuid(x.task_id)&&uuid(x.worker_id)&&p.p_worker_ids.includes(x.worker_id)))return null
  if(new Set(r.assigned.map(x=>x.task_id.toLowerCase())).size!==n||new Set(r.assigned.map(x=>x.worker_id)).size!==n)return null
  result={ok:true,assigned:Object.freeze(r.assigned.map(x=>Object.freeze({task_id:x.task_id,worker_id:x.worker_id}))),shift_date:r.shift_date,start_minute:r.start_minute,end_minute:r.end_minute,minutes_per_worker:r.minutes_per_worker}
 }else if(n===1){
  if(!uuid(r.id)||typeof r.state!=='string'||!r.state||typeof r.short_notice!=='boolean')return null
  result={id:r.id,state:r.state,short_notice:r.short_notice}
 }else{
  if(r.ok!==true||!uuid(r.group_id)||r.member_count!==n||r.minutes_per_worker!==p.p_estimate_minutes||r.unit_code!==p.p_unit_code)return null
  result={ok:true,group_id:r.group_id,member_count:n,minutes_per_worker:r.minutes_per_worker,unit_code:r.unit_code}
 }
 return Object.freeze({ok:true,request_id:raw.request_id,kind:raw.kind,result:Object.freeze(result)})
}
// No arbitrary thrown errors or HTTP status alone can prove a rollback.
// Only a future audited adapter may return an explicit, authenticated,
// first-attempt server rollback proof. This core intentionally treats ALL
// failures as unknown until that separate classification is implemented.
export function createDirectAssignmentSession({write,read,makeId}){
 if(typeof write!=='function'||typeof read!=='function'||typeof makeId!=='function')throw Error('INVALID_SESSION_DEPENDENCIES')
 let actor=null,access='denied',generation=0,accessEpoch=0,pending=null,used=new Set(),disposed=false
 const clear=()=>{generation++;accessEpoch++;pending=null;used=new Set();actor=null;access='denied'}
 const allowed=()=>!disposed&&access==='verified'&&actor!==null
 const snapshot=()=>{
  if(!allowed())return Object.freeze({state:access==='checking'?'checking':'unavailable'})
  if(!pending)return Object.freeze({state:'idle'})
  return Object.freeze({state:pending.state,requestId:pending.payload.p_request_id,payload:pending.payload,receipt:pending.receipt??null,retryReady:pending.state==='unknown'&&pending.retryReady===true})
 }
 const setAccess=next=>{
  if(disposed)return
  if(next?.status==='checking'){
   if(actor){accessEpoch++;access='checking';if(pending)pending.retryReady=false}
   return
  }
  if(next?.status!=='verified'||!uuid(next.actorId)){clear();return}
  const id=next.actorId.toLowerCase()
  if(id!==actor)clear()
  actor=id;access='verified'
 }
 const current=(g,p)=>!disposed&&generation===g&&pending===p
 const result=(g,p)=>current(g,p)?(allowed()?p.state:'hidden'):'stale'
 async function send(p){
  const g=generation
  p.state='sending';p.retryReady=false
  try{
   const raw=await write(p.payload)
   if(!current(g,p))return 'stale'
   const confirmed=validateDirectAssignmentReceipt(raw,p.payload)
   p.receipt=confirmed
   p.state=confirmed?'confirmed':'unknown'
  }catch{
   if(!current(g,p))return 'stale'
   p.receipt=null;p.state='unknown'
  }
  return result(g,p)
 }
 async function submit(d){
  if(!allowed()||pending)return 'blocked'
  let payload
  try{
   const id=makeId()
   payload=buildDirectAssignmentPayload(d,id)
   if(used.has(payload.p_request_id))return 'invalid'
  }catch{return 'invalid'}
  used.add(payload.p_request_id)
  const p={payload,state:'sending',receipt:null,retryReady:false}
  pending=p
  return send(p)
 }
 async function reconcile(){
  if(!allowed()||pending?.state!=='unknown')return 'blocked'
  const p=pending,g=generation,epoch=accessEpoch
  p.state='checking_receipt';p.retryReady=false
  try{
   const r=await read(p.payload.p_request_id)
   if(!current(g,p))return 'stale'
   const receipt=object(r)&&r.found===true?validateDirectAssignmentReceipt(r.receipt,p.payload):null
   p.receipt=receipt;p.state=receipt?'confirmed':'unknown'
   // A missing read is NOT proof of rollback. It permits only explicit
   // identical-key replay, not a new UUID or changed draft.
   p.retryReady=!receipt&&allowed()&&accessEpoch===epoch&&object(r)&&r.found===false&&!Object.hasOwn(r,'receipt')
  }catch{
   if(!current(g,p))return 'stale'
   p.state='unknown';p.receipt=null;p.retryReady=false
  }
  return result(g,p)
 }
 async function retry(){
  if(!allowed()||pending?.state!=='unknown'||pending.retryReady!==true)return 'blocked'
  return send(pending)
 }
 const acknowledge=()=>{
  if(!allowed()||pending?.state!=='confirmed')return false
  pending=null;return true
 }
 const dispose=()=>{clear();disposed=true}
 return Object.freeze({snapshot,setAccess,submit,reconcile,retry,acknowledge,dispose})
}
