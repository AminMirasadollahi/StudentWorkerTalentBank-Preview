const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)
const validId=x=>typeof x==='string'&&x.length>0
export const sortedIds=ids=>[...ids].sort()
export const samePrerequisiteSet=(a,b)=>JSON.stringify(sortedIds(a))===JSON.stringify(sortedIds(b))
export function parseTaskPrerequisites(raw,taskId){
 if(!obj(raw)||raw.task_id!==taskId||typeof raw.editable!=='boolean'||!Array.isArray(raw.prerequisites)||raw.prerequisites.length>20)throw Error('invalid_prerequisite_read')
 const seen=new Set()
 for(const x of raw.prerequisites){
  if(!obj(x)||!validId(x.id)||x.id===taskId||seen.has(x.id)||typeof x.title!=='string'||typeof x.satisfied!=='boolean'||typeof x.state!=='string')throw Error('invalid_prerequisite_read')
  seen.add(x.id)
 }
 return {editable:raw.editable,items:raw.prerequisites,ids:sortedIds(seen)}
}
export function prerequisiteDraft(snapshot,selected,reason){
 if(!snapshot?.editable||!Array.isArray(selected)||selected.length>20||new Set(selected).size!==selected.length||selected.some(x=>!validId(x)))return null
 const ids=sortedIds(selected),text=String(reason??'').trim()
 if(samePrerequisiteSet(snapshot.ids,ids)||text.length>500||(snapshot.ids.length>0&&text.length<5))return null
 return {expected:[...snapshot.ids],prerequisites:ids,reason:text||null}
}
export function confirmedPrerequisiteWrite(raw,ids){
 return obj(raw)&&raw.ok===true&&typeof raw.changed==='boolean'&&Array.isArray(raw.prerequisite_ids)&&raw.prerequisite_ids.every(validId)&&samePrerequisiteSet(raw.prerequisite_ids,ids)
}
