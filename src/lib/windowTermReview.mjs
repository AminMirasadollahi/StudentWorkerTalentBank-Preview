// Private review contract. Never infer credit or eligibility from a bounded history.
import {findTermBudgetIssues} from './termBudgetIntegrity.mjs'
const fail=()=>{throw Error('WINDOW_TERM_CONTRACT_INVALID')}
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)&&x!=='00000000-0000-0000-0000-000000000000'
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const nn=x=>Number.isSafeInteger(x)&&x>=0
const string=x=>typeof x==='string'&&x.length>0
const list=(a,key,valid)=>{if(!Array.isArray(a)||a.some(x=>!x||!valid(x))||new Set(a.map(key)).size!==a.length)fail();return a}
const term=t=>t&&uuid(t.id)&&string(t.label)&&day(t.start_date)&&day(t.end_date)&&t.start_date<=t.end_date&&['draft','active','closed'].includes(t.state)
const sameTerm=(a,b)=>a.id===b.id&&a.label===b.label&&a.start_date===b.start_date&&a.end_date===b.end_date&&a.state===b.state
const usage=x=>['approved_minutes','pending_minutes','pending_reports','unreported_tasks','unreported_estimate_minutes'].every(k=>nn(x[k]))
const sum=(a,k)=>{const v=a.reduce((n,x)=>n+x[k],0);if(!nn(v))fail();return v}
export function validateWindowTermRead(raw,{termId=null,unit=null,workerId=null}={}){
 if(raw?.ok!==true||raw.schedule_contract_version!==2||raw.review_only!==true||raw.filters?.unit_code!==unit||raw.filters?.worker_id!==workerId)fail()
 const terms=list(raw.terms,t=>t.id,term)
 if(terms.filter(t=>t.state==='active').length>1)fail()
 const selected=termId?terms.find(t=>t.id===termId):terms.find(t=>t.state==='active')
 if(!selected){if(termId||raw.term!==null||!['units','workers','weeks','pools'].every(k=>Array.isArray(raw[k])&&!raw[k].length))fail();return raw}
 if(!term(raw.term)||!sameTerm(selected,raw.term)||raw.allocation_scope!==(workerId?'not_applicable_to_worker_slice':'all_workers'))fail()
 if(raw.approved_basis!=='worker_time_entries.review_state=approved, approved_minutes, work_date'||raw.unit_basis!=='worker_tasks.unit_code'||raw.unreported_basis!=='legacy planned_date or window pinned term; assigned/in_progress and no report; once per task'||raw.daily_allocation_basis!=='window not allocated to a day')fail()
 const remaining=(x,allocation)=>workerId?x.remaining_minutes===null:allocation===null?x.remaining_minutes===null:Number.isSafeInteger(x.remaining_minutes)&&x.remaining_minutes===allocation-x.approved_minutes
 const units=list(raw.units,x=>x.unit,x=>string(x.unit)&&string(x.name)&&(!unit||x.unit===unit)&&usage(x)&&(x.allocated_minutes===null||nn(x.allocated_minutes))&&remaining(x,x.allocated_minutes))
 if(unit&&units.length!==1)fail()
 const unitSet=new Set(units.map(u=>u.unit))
 const pools=list(raw.pools,x=>x.id,x=>uuid(x.id)&&string(x.label)&&usage(x)&&nn(x.allocated_minutes)&&remaining(x,x.allocated_minutes)&&Array.isArray(x.units)&&x.units.length>0&&x.units.every(string)&&(!unit||x.units.includes(unit)))
 const workers=list(raw.workers,x=>x.worker_id+':'+x.unit,x=>uuid(x.worker_id)&&unitSet.has(x.unit)&&(!workerId||x.worker_id===workerId)&&nn(x.approved_minutes)&&nn(x.pending_minutes))
 const minWeek=new Date(Date.parse(selected.start_date+'T00:00:00Z')-6*86400000).toISOString().slice(0,10)
 const weeks=list(raw.weeks,x=>x.week_start+':'+x.unit,x=>day(x.week_start)&&x.week_start>=minWeek&&x.week_start<=selected.end_date&&new Date(x.week_start+'T00:00:00Z').getUTCDay()===6&&unitSet.has(x.unit)&&nn(x.approved_minutes))
 if(findTermBudgetIssues(raw,{unitFilter:unit||'',workerId:workerId||''}).length)fail()
 for(const u of units){
  for(const k of ['approved_minutes','pending_minutes'])if(sum(workers.filter(w=>w.unit===u.unit),k)!==u[k])fail()
  if(sum(weeks.filter(w=>w.unit===u.unit),'approved_minutes')!==u.approved_minutes)fail()
 }
 if(!unit)for(const p of pools)for(const k of ['approved_minutes','pending_minutes','pending_reports','unreported_tasks','unreported_estimate_minutes'])if(sum(units.filter(u=>p.units.includes(u.unit)),k)!==p[k])fail()
 return raw
}
export function validateWindowTermAccess(raw,t){
 if(!term(t)||raw?.ok!==true||raw.schedule_contract_version!==2||raw.review_only!==true||raw.term_id!==t.id||raw.term_state!==t.state||!['observe','enforced'].includes(raw.enforcement_mode))fail()
 for(const k of ['active_workers','active_without_decision','active_not_eligible','legacy_noneligible_planned_tasks','window_noneligible_tasks','window_noneligible_open_tasks'])if(!nn(raw[k]))fail()
 const rows=list(raw.workers,x=>x.worker_id,x=>uuid(x.worker_id)&&string(x.global_state)&&['unknown','eligible','not_eligible'].includes(x.eligibility)&&(x.decided_at===null||typeof x.decided_at==='string'))
 const active=rows.filter(x=>x.global_state==='active')
 if(raw.active_workers!==active.length||raw.active_without_decision!==active.filter(x=>x.eligibility==='unknown').length||raw.active_not_eligible!==active.filter(x=>x.eligibility==='not_eligible').length||raw.window_noneligible_open_tasks>raw.window_noneligible_tasks)fail()
 return raw
}
export function buildReviewAssignmentScope({snapshot,termRead,access,fixtureReadiness}){
 validateWindowTermRead(termRead)
 const t=termRead.term
 if(!t||t.state!=='active')return null
 validateWindowTermAccess(access,t)
 // These two fields are NOT provided by the current manager/term API.
 // Explicit synthetic injection only, never infer them from membership.
 if(fixtureReadiness?.syntheticReviewOnly!==true||!day(fixtureReadiness.serverToday)||!Array.isArray(fixtureReadiness.workers))return null
 const roster=list(snapshot.workers,w=>w.id,w=>uuid(w.id)&&string(w.state))
 const readiness=list(fixtureReadiness.workers,w=>w.id,w=>uuid(w.id)&&string(w.onboarding_state))
 const byId=new Map(access.workers.map(w=>[w.worker_id,w]))
 if(roster.length!==byId.size||roster.some(w=>byId.get(w.id)?.global_state!==w.state))fail()
 const workers=roster.map(w=>({...w,eligibility:byId.get(w.id).eligibility,onboarding_state:readiness.find(x=>x.id===w.id)?.onboarding_state??'unknown'}))
 // Deliberately conservative fixture: explicitly eligible only, even observe.
 return {term:t,serverToday:fixtureReadiness.serverToday,workers,prerequisites:snapshot.tasks.filter(x=>uuid(x.id)).map(x=>({id:x.id,title:x.title}))}
}
