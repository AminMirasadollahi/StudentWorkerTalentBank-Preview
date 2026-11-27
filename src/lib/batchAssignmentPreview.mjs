// R5-B2.0: deterministic read-only preview. No transport, request identity,
// persistence, authority claim or receipt. Reuse existing V3 shape validator.
import {buildAssignmentRecoveryPayload,canonicalAssignmentPrerequisites} from './assignmentPrerequisites.mjs'
import {assessAssignmentCapacity,validIsoDay} from './assignmentCapacity.mjs'
const checkId='10000000-0000-4000-8000-000000000001' // validation sentinel, never returned
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const units=['library','research','public_relations']
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x)}return x}
const shift=(x,n)=>{const d=new Date(x+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const rowKeys=new Set(['id','title','instructions','minutes','mode','workerIds','date','unit','reason','prerequisiteIds'])
const defaultsKeys=new Set(['date','unit','reason'])
const only=(x,keys)=>obj(x)&&Object.keys(x).every(k=>keys.has(k))
const failed=errors=>freeze({ok:false,errors,plan:null})
export function previewBatchAssignment(draft,context={}){
 const errors=[],err=(code,rowId=null)=>errors.push({code,rowId})
 const {today,term,workers,data}=context
 if(!validIsoDay(today)||!obj(term)||term.state!=='active'||typeof term.id!=='string'||!term.id||!validIsoDay(term.start_date)||!validIsoDay(term.end_date)||term.start_date>term.end_date||!Array.isArray(workers)||!obj(data)||!Array.isArray(data.tasks)||!Array.isArray(data.weekly_slots)||!Array.isArray(data.exceptions))return failed([{code:'CONTEXT_UNAVAILABLE',rowId:null}])
 if(!only(draft,new Set(['termId','defaults','rows']))||draft.termId!==term.id||!only(draft.defaults,defaultsKeys)||!Array.isArray(draft.rows)||!draft.rows.length)return failed([{code:'INVALID_PLAN_OR_TERM',rowId:null}])
 const eligible=new Set(),allWorkers=new Set()
 for(const w of workers){if(!uuid(w?.id)||allWorkers.has(w.id.toLowerCase()))return failed([{code:'CONTEXT_UNAVAILABLE',rowId:null}]);allWorkers.add(w.id.toLowerCase());if(w.state==='active')eligible.add(w.id.toLowerCase())}
 const existing=new Map()
 for(const t of data.tasks){if(!uuid(t?.id)||existing.has(t.id.toLowerCase()))return failed([{code:'CONTEXT_UNAVAILABLE',rowId:null}]);existing.set(t.id.toLowerCase(),t)}
 const ids=new Set(),rows=[],assignments=[],daily=new Map(),people=new Map(),warnings=[]
 const warning=(code,rowId,workerId=null)=>warnings.push({code,rowId,workerId})
 for(const row of draft.rows){
  const id=typeof row?.id==='string'&&row.id.length&&row.id.length<=80?row.id:null
  if(!id||ids.has(id)||!only(row,rowKeys)){err('INVALID_ROW',id);continue}
  ids.add(id)
  if(!['independent','collaborative'].includes(row.mode)){err('UNSUPPORTED_MODE',id);continue}
  if(!Array.isArray(row.workerIds)||!row.workerIds.length||!Array.from(row.workerIds).every(uuid)){err('SELECT_WORKERS',id);continue}
  const members=row.workerIds.map(x=>x.toLowerCase()).sort()
  if(new Set(members).size!==members.length){err('DUPLICATE_PAIR',id);continue}
  if(members.some(x=>!eligible.has(x))){err('WORKER_NOT_ACTIVE_OR_UNKNOWN',id);continue}
  if(row.mode==='collaborative'&&(members.length<2||members.length>20)){err('GROUP_SIZE',id);continue}
  const date=row.date??draft.defaults.date,unit=row.unit??draft.defaults.unit,reason=row.reason??draft.defaults.reason??null
  if(!validIsoDay(date)||date<today||date<term.start_date||date>term.end_date){err('DATE_OUTSIDE_TERM_OR_PAST',id);continue}
  if(!units.includes(unit)){err('INVALID_UNIT',id);continue}
  if(date<shift(today,2)&&(typeof reason!=='string'||!reason.trim())){err('SHORT_NOTICE_REASON',id);continue}
  let prerequisites
  try{prerequisites=canonicalAssignmentPrerequisites(row.prerequisiteIds)}catch{err('INVALID_PREREQUISITES',id);continue}
  if(prerequisites.some(x=>!existing.has(x))){err('PREREQUISITE_NOT_LOADED',id);continue}
  const batches=row.mode==='collaborative'?[members]:members.map(x=>[x])
  const operations=[]
  try{
   for(const workerIds of batches){
    const {p_request_id,...validated}=buildAssignmentRecoveryPayload({kind:'direct',workerIds,unit,title:row.title,instructions:row.instructions,date,minutes:row.minutes,startMinute:null,endMinute:null,reason,prerequisiteIds:prerequisites},checkId,3)
    // This is a review projection, NOT an RPC payload or commit plan.
    operations.push({rowId:id,mode:row.mode,workerIds:[...validated.p_worker_ids],title:validated.p_title,instructions:validated.p_instructions,date,unit,minutes:validated.p_estimate_minutes,reason,prerequisiteIds:[...validated.p_prerequisites]})
   }
  }catch{err('INVALID_V3_FIELDS',id);continue}
  if(!row.title.trim()){err('INVALID_V3_FIELDS',id);continue}
  for(const pre of prerequisites){if(existing.get(pre).state==='cancelled')warning('CANCELLED_PREREQUISITE',id)}
  rows.push({id,title:operations[0].title,mode:row.mode,workerIds:members,date,unit,minutes:row.minutes})
  assignments.push(...operations)
  for(const workerId of members){
   const k=workerId+'/'+date,old=daily.get(k)
   daily.set(k,{workerId,date,proposedMinutes:(old?.proposedMinutes??0)+row.minutes})
   people.set(workerId,(people.get(workerId)??0)+row.minutes)
  }
 }
 if(errors.length)return failed(errors)
 const dailyTotals=[...daily.values()].sort((a,b)=>a.workerId.localeCompare(b.workerId)||a.date.localeCompare(b.date)).map(x=>{
  // Assess current capacity once, then apply the entire proposed daily sum.
  // The existing helper limits a single task to 1440; a multi-row sum may exceed it.
  const base=assessAssignmentCapacity(data,{workerId:x.workerId,date:x.date,estimateMinutes:0})
  const remaining=base.availableMinutes===null||base.assignedMinutes===null?null:base.availableMinutes-base.assignedMinutes-x.proposedMinutes
  const code=base.availableMinutes===null?base.code:base.availableMinutes===0?'unavailable':remaining<0?'overbooked':remaining===0?'full':'ok'
  return {...x,existingMinutes:base.assignedMinutes,availableMinutes:base.availableMinutes,remainingMinutes:remaining,capacityCode:code}
 })
 const personTotals=[...people].sort(([a],[b])=>a.localeCompare(b)).map(([workerId,minutes])=>({workerId,minutes}))
 return freeze({ok:true,errors:[],plan:{termId:term.id,rows,assignments,dailyTotals,personTotals,rowCount:rows.length,pairCount:rows.reduce((n,x)=>n+x.workerIds.length,0),personCount:people.size,operationCount:assignments.length,totalMinutes:personTotals.reduce((n,x)=>n+x.minutes,0),warnings}})
}
