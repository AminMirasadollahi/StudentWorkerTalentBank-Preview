// Review-only, in-memory navigation fence. Contains no payload or PII.
// A fence is not a receipt and cannot prove a server rollback.
export function createWorkPoolRouteFence(){
 let current=null
 const listeners=new Set()
 const emit=()=>{for(const listener of listeners)listener()}
 const getSnapshot=()=>current
 const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener)}
 const begin=(owner,kind)=>{
  if(typeof owner!=='symbol'||!['create','edit','transition','legacy','desk'].includes(kind)||current)return false
  current=Object.freeze({owner,kind,status:'busy'});emit();return true
 }
 const retry=(owner,kind)=>{
  if(!['create','edit'].includes(kind)||current?.owner!==owner||current.kind!==kind||current.status!=='unknown')return false
  current=Object.freeze({...current,status:'busy'});emit();return true
 }
 const unknown=owner=>{
  if(current?.owner!==owner||current.status!=='busy')return false
  current=Object.freeze({...current,status:'unknown'});emit();return true
 }
 const confirmed=owner=>{
  if(current?.owner!==owner)return false
  current=null;emit();return true
 }
 const reviewReady=owner=>{
  if(current?.owner!==owner||current.status!=='unknown'||!['legacy','desk','transition'].includes(current.kind))return false
  current=Object.freeze({...current,status:'reviewed'});emit();return true
 }
 const acknowledgeReview=owner=>{
  if(current?.owner!==owner||current.status!=='reviewed')return false
  return confirmed(owner)
 }
 const invalidateReview=owner=>{
  if(current?.owner!==owner||current.status!=='reviewed')return false
  current=Object.freeze({...current,status:'unknown'});emit();return true
 }
 const permitsNavigation=(prev,next)=>!current||!(prev?.section==='work'&&prev.workView==='workPool')||
   (next?.section==='work'&&next.workView==='workPool'&&next.workPoolKind===prev.workPoolKind)
 return Object.freeze({getSnapshot,subscribe,begin,retry,unknown,confirmed,reviewReady,acknowledgeReview,invalidateReview,permitsNavigation})
}
