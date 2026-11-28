// Review-only observation contract, not an operation receipt or authorization.
// Based on historical SWTB17 shift projection and V3 work projection.
// No network, storage, cancellation, retry, or shared-owner release.
import {validIsoDay} from './assignmentCapacity.mjs'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const targets=new WeakSet()
const fields=['id','task_id','worker_id','shift_date','start_minute','end_minute']
const result=state=>Object.freeze({state,operationAttribution:false,creditConfirmed:false,mayReleaseFence:false})
const dayEnvelope=(raw,day)=>obj(raw)&&raw.ok===true&&raw.from===day&&raw.to===day&&Array.isArray(raw.shifts)
const exactShift=(raw,id)=>{
 const rows=raw.shifts.filter(s=>obj(s)&&s.id===id)
 if(rows.length!==1)return null
 const row=rows[0]
 if(!uuid(row.id)||!uuid(row.task_id)||!uuid(row.worker_id)||!validIsoDay(row.shift_date)||
 !Number.isInteger(row.start_minute)||!Number.isInteger(row.end_minute)||row.start_minute<0||
 row.end_minute>1440||row.start_minute>=row.end_minute||!['scheduled','cancelled'].includes(row.state))return null
 // One task belongs to exactly one shift in the authoritative ledger.
 if(raw.shifts.filter(s=>s?.task_id===row.task_id).length!==1)return null
 return row
}
const exactTask=(work,s,state)=>{
 if(!obj(work)||!Array.isArray(work.tasks)||!Array.isArray(work.time_entries))return false
 const tasks=work.tasks.filter(t=>obj(t)&&t.id===s.task_id)
 if(tasks.length!==1)return false
 const t=tasks[0]
 return t.worker_id===s.worker_id&&t.unit==='library'&&t.planned_date===s.shift_date&&
 t.estimate_minutes===s.end_minute-s.start_minute&&t.state===state&&
 !work.time_entries.some(e=>e?.task_id===s.task_id)
}
// Record exact preflight tuple, no cancellation reason, identity metadata or bearer token.
// Caller is responsible for fresh same-actor proof before and after every read.
export function captureDeskCancellationTarget({shiftId,day,shifts,work}={}){
 if(!uuid(shiftId)||!validIsoDay(day)||!dayEnvelope(shifts,day))return null
 const row=exactShift(shifts,shiftId)
 if(!row||row.state!=='scheduled'||row.shift_date!==day||!exactTask(work,row,'assigned'))return null
 const target=Object.freeze(Object.fromEntries(fields.map(k=>[k,row[k]])))
 targets.add(target);return target
}
export function observeDeskCancellationEffect(target,shifts,work){
 if(!targets.has(target)||!dayEnvelope(shifts,target.shift_date))return result('unconfirmed')
 const row=exactShift(shifts,target.id)
 if(!row||!fields.every(k=>row[k]===target[k]))return result('unconfirmed')
 if(row.state!=='cancelled'||!exactTask(work,row,'cancelled'))return result('unconfirmed')
 // Positive cancelled rows establish an observed effect only. The clipped work
 // response cannot prove zero reports or credit; absence is never proof.
 // An independent cancellation by another manager cannot identify this request.
 return result('cancelled_observed')
}
