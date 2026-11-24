// Synthetic contract model ONLY: no SDK, no network, no browser storage.
// A real server must authenticate every call and serialize operations per actor.
// This model intentionally does not emulate SQL durability or JWT authorization.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DIGEST=/^[0-9a-f]{64}$/
const kinds=new Set(['assignment','pool_create','pool_edit','pool_transition','desk_create','desk_transition'])
const validId=x=>typeof x==='string'&&UUID.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const validDigest=x=>typeof x==='string'&&DIGEST.test(x)
const bad=code=>Object.freeze({ok:false,code})
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k))
const view=s=>Object.freeze({ok:true,epoch:s.epoch,active:s.active?Object.freeze({...s.active}):null})
export function createSyntheticOperationRegistry(){
 const actors=new Map()
 const row=actor=>{
  if(!validId(actor))throw Error('INVALID_FIXTURE_ACTOR')
  if(!actors.has(actor))actors.set(actor,{epoch:0,active:null,history:new Map()})
  return actors.get(actor)
 }
 // Actor is a synthetic trusted context, never a request-supplied ID in real RPC.
 const discover=actor=>view(row(actor))
 const reserve=(actor,input)=>{
  if(!exact(input,['epoch','requestId','kind','digest'])||!Number.isSafeInteger(input.epoch)||input.epoch<0||
    !validId(input.requestId)||!kinds.has(input.kind)||!validDigest(input.digest))return bad('INVALID')
  const s=row(actor),a=s.active
  if(a?.requestId===input.requestId){
   return a.kind===input.kind&&a.digest===input.digest&&a.epoch===input.epoch?view(s):bad('KEY_CONFLICT')
  }
  if(s.history.has(input.requestId))return bad('KEY_RETIRED')
  if(s.epoch!==input.epoch)return bad('STALE_EPOCH')
  if(a)return bad('ACTIVE_EXISTS')
  s.active=Object.freeze({epoch:s.epoch,requestId:input.requestId,kind:input.kind,digest:input.digest,status:'reserved'})
  return view(s)
 }
 // commit/cancel/ack are atomic transitions in this model. A real database
 // must couple business write and receipt to the SAME locked transaction.
 const commit=(actor,input,write)=>{
  if(!exact(input,['epoch','requestId','kind','digest'])||typeof write!=='function')return bad('INVALID')
  const s=row(actor),a=s.active
  if(!a||a.requestId!==input.requestId||a.epoch!==input.epoch)return bad('NOT_ACTIVE')
  if(a.kind!==input.kind||a.digest!==input.digest)return bad('KEY_CONFLICT')
  if(a.status==='committed')return view(s)
  if(a.status!=='reserved')return bad('SEALED')
  // Synthetic transaction fixture: writer must be synchronous and return
  // an opaque result ID; test callbacks must not emulate external effects.
  const receiptId=write()
  if(!validId(receiptId))throw Error('INVALID_SYNTHETIC_RECEIPT')
  s.active=Object.freeze({...a,status:'committed',receiptId})
  return view(s)
 }
 const cancel=(actor,epoch,requestId)=>{
  const s=row(actor),a=s.active
  if(s.epoch!==epoch||!a||a.requestId!==requestId)return bad('NOT_ACTIVE')
  if(a.status==='committed'||a.status==='cancelled')return view(s)
  s.active=Object.freeze({...a,status:'cancelled'})
  return view(s)
 }
 const acknowledge=(actor,epoch,requestId)=>{
  const s=row(actor),a=s.active
  if(s.epoch!==epoch||!a||a.requestId!==requestId)return bad('NOT_ACTIVE')
  if(!['committed','cancelled'].includes(a.status))return bad('UNRESOLVED')
  if(s.epoch>=Number.MAX_SAFE_INTEGER)return bad('EPOCH_EXHAUSTED')
  s.history.set(a.requestId,a.status)
  s.active=null;s.epoch++
  return view(s)
 }
 return Object.freeze({discover,reserve,commit,cancel,acknowledge})
}
// Strict projection for a verified actor's discovery response. It never
// reconstructs an original payload, or marks an absent receipt as rollback.
export function recoveryProjection(raw){
 const blocked=Object.freeze({state:'blocked',canStart:false,canReplay:false})
 if(!exact(raw,['ok','epoch','active'])||raw.ok!==true||!Number.isSafeInteger(raw.epoch)||raw.epoch<0)return blocked
 if(raw.active===null)return Object.freeze({state:'idle',epoch:raw.epoch,canStart:true,canReplay:false})
 const a=raw.active
 if(!object(a)||!['reserved','committed','cancelled'].includes(a.status)||
   !exact(a,a.status==='committed'?['epoch','requestId','kind','digest','status','receiptId']:['epoch','requestId','kind','digest','status'])||
   a.epoch!==raw.epoch||!validId(a.requestId)||!validDigest(a.digest)||!kinds.has(a.kind)||
   (a.status==='committed'&&!validId(a.receiptId)))return blocked
 return Object.freeze({state:a.status,epoch:raw.epoch,requestId:a.requestId,kind:a.kind,
  canStart:false,canReplay:false,canCancel:a.status==='reserved',canAcknowledge:a.status!=='reserved',
  ...(a.status==='committed'?{receiptId:a.receiptId}:{})})
}
// Recovery client: injected fixture transport only. A stale response never
// appears under another actor, including a recheck of the same actor.
export function createSyntheticRecoveryReader(discover){
 if(typeof discover!=='function')throw Error('INVALID_FIXTURE_DISCOVERY')
 let actor=null,generation=0,snapshot=Object.freeze({state:'blocked',canStart:false,canReplay:false})
 const setAccess=next=>{
  generation++;actor=next?.status==='verified'&&validId(next.actorId)?next.actorId:null
  snapshot=Object.freeze({state:'blocked',canStart:false,canReplay:false})
 }
 const refresh=async()=>{
  if(!actor)return 'blocked'
  const g=++generation,id=actor
  snapshot=Object.freeze({state:'blocked',canStart:false,canReplay:false})
  try{
   const raw=await discover(id)
   if(g!==generation||id!==actor)return 'stale'
   snapshot=recoveryProjection(raw)
  }catch{if(g!==generation||id!==actor)return 'stale'}
  return snapshot.state
 }
 return Object.freeze({setAccess,refresh,snapshot:()=>snapshot})
}
