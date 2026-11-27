import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AdminOperations,WorkerOperations} from '../../src/OperationsWorkspace.jsx'
import ManagerWorkspaceNav from '../../src/components/ManagerWorkspaceNav.jsx'
import ManagerWorkHubTabs from '../../src/components/ManagerWorkHubTabs.jsx'
import {nextManagerNavigation} from '../../src/lib/managerWorkspaceNav.mjs'
import {createWindowReadReviewPort} from '../../src/lib/windowReadReviewPort.mjs'
import {createWindowEditorSession} from '../../src/lib/windowEditorSession.mjs'
import {id,worker,manager,self} from './windowReadReviewFixtureData.mjs'
import {termFixture,accessFixture,assignmentScopeFixture} from './windowTermFixtureData.mjs'
import '../../src/typography.css'
import '../../src/styles.css'
import '../../src/production-polish.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/manager-shell.css'
globalThis.__qaLegacyReads=0;globalThis.__qaWriteAttempts=0
const holds=['window_extension','late_submission','correction','term_closure_policy','post_assignment_eligibility_policy','window_prerequisite_edit','nonapproval_review','batch_write']
const mc={status:'verified',role:'manager',actorId:id(98)},wc={status:'verified',role:'worker',actorId:id(99),workerId:worker,ready:true}
const db=structuredClone(manager);db.workers[0].state='active'
let epoch=0,active=null,reserved=null,reportArgs=null,loseReport=true,serial=200,failRead=false
const metrics={reads:0,commits:0,reports:0,approvals:0,submitCalls:[]}
globalThis.__qaIntegratedMetrics=()=>structuredClone(metrics)
const cap=c=>({contract_version:1,audience:c.role,actor_id:c.actorId,worker_id:c.workerId??null,schedule_contract_version:2,review_only:true,operational_enabled:false,fixture_enabled:true,allowed_schedule_kinds:['legacy_day','single_report_window'],held_operations:holds})
function workerSnapshot(){
 const tasks=db.tasks.filter(t=>t.worker_id===worker).map(t=>{
  if(t.schedule_kind==='legacy_day')return t
  const future=t.window_start>self.server_today,done=['completed','submitted','cancelled'].includes(t.state),can=!future&&!done
  return {...t,window_actions:{review_only:true,date_min:t.window_start,date_max:future?self.server_today:t.window_end<self.server_today?t.window_end:self.server_today,window_empty:future,standard_minutes:t.estimate_minutes,minimum_minutes:t.estimate_minutes,maximum_minutes:1440,extra_reason_above_minutes:t.estimate_minutes,can_start:can&&t.state==='assigned',can_submit:can,hold_reason:done?'TASK_STATE':future?'WINDOW_NOT_STARTED':null}}
 })
 return {...self,tasks,time_entries:db.time_entries.filter(e=>e.worker_id===worker),approved_minutes_total:db.time_entries.filter(e=>e.worker_id===worker&&e.review_state==='approved').reduce((n,e)=>n+e.approved_minutes,0)}
}
// Fixture-only independent aggregate over the mutable synthetic rows.
function currentTerm(a){
 const v=termFixture(a),all=termFixture({...a,p_unit_code:null}),entries=db.time_entries.filter(e=>!a.p_worker_id||e.worker_id===a.p_worker_id)
 const rows=all.units.map(u=>{
  const tasks=db.tasks.filter(t=>t.unit===u.unit&&(!a.p_worker_id||t.worker_id===a.p_worker_id))
  const es=entries.filter(e=>tasks.some(t=>t.id===e.task_id))
  const pending=es.filter(e=>e.review_state==='submitted'),approved=es.filter(e=>e.review_state==='approved')
  const unreported=tasks.filter(t=>['assigned','in_progress'].includes(t.state)&&!t.has_any_report)
  return {...u,approved_minutes:approved.reduce((n,e)=>n+e.approved_minutes,0),pending_minutes:pending.reduce((n,e)=>n+e.reported_minutes,0),pending_reports:pending.length,unreported_tasks:unreported.length,unreported_estimate_minutes:unreported.reduce((n,t)=>n+t.estimate_minutes,0)}
 })
 v.units=rows.filter(u=>!a.p_unit_code||u.unit===a.p_unit_code)
 v.workers=v.units.filter(u=>u.approved_minutes||u.pending_minutes).map(u=>({worker_id:worker,unit:u.unit,approved_minutes:u.approved_minutes,pending_minutes:u.pending_minutes}))
 v.weeks=v.units.filter(u=>u.approved_minutes).map(u=>({week_start:'2026-11-21',unit:u.unit,approved_minutes:u.approved_minutes}))
 const pool=v.pools[0]
 for(const k of ['approved_minutes','pending_minutes','pending_reports','unreported_tasks','unreported_estimate_minutes'])pool[k]=rows.reduce((n,u)=>n+u[k],0)
 pool.remaining_minutes=a.p_worker_id?null:pool.allocated_minutes-pool.approved_minutes
 return v
}
const transport=c=>async(n,a)=>{
 if(n.endsWith('capabilities_v1'))return cap(c)
 if(n.endsWith('assignment_scope_v1')){if(failRead)throw Error('QA_SCOPE_READ_FAIL');return structuredClone(assignmentScopeFixture)}
 if(n.endsWith('term_read_v1')){if(failRead)throw Error('QA_TERM_READ_FAIL');return currentTerm(a)}
 if(n.endsWith('term_access_v1')){if(failRead)throw Error('QA_ACCESS_READ_FAIL');return structuredClone(accessFixture)}
 if(n.endsWith('_read_v1')){metrics.reads++;if(failRead)throw Error('QA_REFRESH_FAIL');return structuredClone(c.role==='manager'?db:workerSnapshot())}
 if(n.endsWith('recovery_v1')){
  if(a.p_action==='cancel')active={...active,status:'cancelled'}
  if(a.p_action==='acknowledge'){epoch++;active=null;reserved=null}
  return {ok:true,epoch,active}
 }
 if(n.endsWith('assignment_v1')){
  if(a.p_action==='reserve'){reserved=structuredClone(a);active={kind:'single_report_window_v1',request_id:a.p_request_id,status:'reserved'}}
  else {
   if(JSON.stringify({...a,p_action:'reserve'})!==JSON.stringify(reserved))throw Error('QA_CHANGED_ASSIGNMENT')
   if(active.status!=='committed'){metrics.commits++;db.tasks.push({id:id(40),worker_id:a.p_worker_id,unit:a.p_unit,title:a.p_title,instructions:a.p_instructions,state:'assigned',estimate_minutes:a.p_minutes,schedule_kind:'single_report_window',planned_date:null,window_start:a.p_start,window_end:a.p_end,window_term_id:a.p_term_id,window_revision:1,daily_allocated_minutes:null,allocation_code:'UNALLOCATED_WINDOW',has_any_report:false});active={...active,status:'committed',receipt:{ok:true,request_id:a.p_request_id,kind:'single_report_window_v1',result:{task_id:id(40),worker_id:a.p_worker_id,term_id:a.p_term_id,window_start:a.p_start,window_end:a.p_end,revision:1,standard_minutes:a.p_minutes}}}}
  }
  return {ok:true,epoch,active}
 }
 const t=db.tasks.find(t=>t.id===a.p_task_id)
 if(n.endsWith('start_v1')){t.state='in_progress';return {ok:true,state:'in_progress'}}
 if(n.endsWith('submit_v1')){
  metrics.submitCalls.push(structuredClone(a))
  if(reportArgs&&JSON.stringify(reportArgs)!==JSON.stringify(a))throw Error('QA_CHANGED_REPORT')
  if(!reportArgs){reportArgs=structuredClone(a);metrics.reports++;t.state='submitted';t.has_any_report=true;db.time_entries.push({id:id(41),task_id:t.id,worker_id:worker,work_date:a.p_work_date,reported_minutes:a.p_reported_minutes,approved_minutes:null,review_state:'submitted',worker_note:a.p_worker_note})}
  if(loseReport){loseReport=false;throw Error('QA_REPLY_LOST')}
  return {id:id(41),status:'submitted',replayed:true}
 }
 if(n.endsWith('review_v1')){const e=db.time_entries.find(e=>e.id===a.p_entry_id);metrics.approvals++;e.review_state='approved';e.approved_minutes=a.p_approved_minutes;db.tasks.find(t=>t.id===e.task_id).state='completed';return {id:e.id,review_state:'approved',approved_minutes:e.approved_minutes}}
 throw Error('QA_ROUTE_DENIED')
}
const make=c=>({port:createWindowReadReviewPort({syntheticReviewOnly:true,fixtureTransport:transport(c)}),session:createWindowEditorSession({syntheticReviewOnly:true,context:c,fixtureTransport:transport(c)})})
const m=make(mc),w=make(wc),newId=()=>id(++serial)
function Stage(){
 const [role,setRole]=useState('manager'),[status,setStatus]=useState('verified'),[rev,setRev]=useState(0)
 const [nav,setNav]=useState({section:'work',workView:'tasks',candidateView:'applicants',candidateFilter:'all'}),[wn,setWn]=useState({section:'tasks',taskRange:'today'})
 const current=role==='manager'?m:w,c=role==='manager'?mc:wc
 const req={port:current.port,context:{...c,status},editor:{session:current.session,newId}}
 const flags={r5IaFixture:true}
 return <><div dir="rtl" aria-label="کنترل آزمایش" style={{display:'flex',flexWrap:'wrap',gap:8,padding:8}}>
 <button onClick={()=>{setRole('manager');m.session.setAuthority(mc);setStatus('verified')}}>مدیر نمونه</button>
 <button onClick={()=>{setRole('worker');w.session.setAuthority(wc);setStatus('verified')}}>دانشجوکار نمونه</button>
 <button onClick={()=>{current.session.suspend();setStatus('checking')}}>بررسی مجوز نمونه</button>
 <button onClick={()=>{current.session.setAuthority(c);setStatus('verified')}}>مجوز معتبر نمونه</button>
 <button onClick={()=>{failRead=true;setRev(n=>n+1)}}>خطای بازخوانی نمونه</button>
 <button onClick={()=>{failRead=false;setRev(n=>n+1)}}>رفع خطای بازخوانی نمونه</button></div>
 {role==='manager'?<main className="report-shell report-shell--dashboard ops-root swtb22-manager-enabled" dir="rtl"><ManagerWorkspaceNav navigation={nav} {...flags} onNavigate={item=>setNav(n=>nextManagerNavigation(n,item))}/><div className="swtb22-manager-main"><ManagerWorkHubTabs navigation={nav} flags={flags} onNavigate={item=>setNav(n=>nextManagerNavigation(n,item))}/><AdminOperations key="manager" navigation={nav} setNavigation={setNav} hideSectionTabs refreshRevision={rev} windowReadReview={req}/></div></main>:
 <main className="report-shell report-shell--dashboard ops-root ops-worker-b3-view" dir="rtl"><WorkerOperations key="worker" profile={{worker_id:worker,name:'دانشجوکار نمونه',unit:'research',state:'active',onboarding_state:'ready'}} navigation={wn} setNavigation={setWn} workerName="دانشجوکار نمونه" refreshRevision={rev} onRefresh={()=>setRev(n=>n+1)} windowReadReview={req}/></main>}
 </>
}
createRoot(document.getElementById('root')).render(<Stage/>)
