// Review-only adapter: work proof and active-term proof are distinct.
import {validIsoDay} from './assignmentCapacity.mjs'
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
export function validWorkspaceWorkRead(data){
 return obj(data)&&['workers','tasks','weekly_slots','exceptions','time_entries'].every(k=>Array.isArray(data[k]))
}
// Require matching explicit active term from the unfiltered dashboard.
// Never infer an active term from a single selected/historical term.
export function buildDayBatchWorkspaceContext(work,dashboard,today){
 if(!validWorkspaceWorkRead(work)||!validIsoDay(today)||!obj(dashboard)||dashboard.ok!==true||
 !['terms','units','weeks','workers','pools'].every(k=>Array.isArray(dashboard[k]))||
 !obj(dashboard.filters)||dashboard.filters.unit_code!==null||dashboard.filters.worker_id!==null||dashboard.allocation_scope!=='all_workers')return null
 const terms=dashboard.terms
 const active=terms.filter(t=>t?.state==='active')
 if(active.length!==1||!obj(dashboard.term))return null
 const t=active[0],selected=dashboard.term
 if(!uuid(t.id)||selected.id!==t.id||selected.state!=='active'||selected.start_date!==t.start_date||selected.end_date!==t.end_date||
 !validIsoDay(t.start_date)||!validIsoDay(t.end_date)||today<t.start_date||today>t.end_date||
 terms.filter(x=>x?.id===t.id).length!==1)return null
 const seen=new Set()
 for(const w of work.workers){if(!uuid(w?.id)||seen.has(w.id))return null;seen.add(w.id)}
 // Keep identity of the exact current work projection for the workspace port.
 // The caller must fence this object by generation and never mutate it.
 return Object.freeze({today,defaultDate:today,term:Object.freeze({id:t.id,state:'active',start_date:t.start_date,end_date:t.end_date}),workers:work.workers,data:work})
}
// No network here. An injected, scoped caller owns the read generation.
export function createDayBatchWorkspaceReadGate(){
 let revision=0,work=null,context=null
 const invalidate=()=>{revision++;work=null;context=null}
 const begin=()=>{
  invalidate();const r=revision;let settled=false,termSettled=false
  return Object.freeze({
   acceptWork:value=>{if(r!==revision||settled)return false;settled=true;if(!validWorkspaceWorkRead(value))return false;work=value;return true},
   acceptTerm:(dashboard,today)=>{if(r!==revision||!settled||!work||termSettled)return false;termSettled=true;context=buildDayBatchWorkspaceContext(work,dashboard,today);return context!==null},
   isCurrent:()=>r===revision
  })
 }
 return Object.freeze({begin,invalidate,contextFor:data=>data===work?context:null,hasWork:()=>work!==null})
}
