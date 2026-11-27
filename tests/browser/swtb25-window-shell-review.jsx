import React,{useState,useMemo} from 'react'
import {createRoot} from 'react-dom/client'
import {AdminOperations,WorkerOperations} from '../../src/OperationsWorkspace.jsx'
import ManagerWorkspaceNav from '../../src/components/ManagerWorkspaceNav.jsx'
import ManagerWorkHubTabs from '../../src/components/ManagerWorkHubTabs.jsx'
import {nextManagerNavigation} from '../../src/lib/managerWorkspaceNav.mjs'
import {createWindowReadReviewPort} from '../../src/lib/windowReadReviewPort.mjs'
import {id,worker,manager,self} from './windowReadReviewFixtureData.mjs'
import '../../src/typography.css'
import '../../src/styles.css'
import '../../src/production-polish.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/manager-shell.css'
globalThis.__qaLegacyReads=0;globalThis.__qaWriteAttempts=0
const holds=['window_extension','late_submission','correction','term_closure_policy','post_assignment_eligibility_policy','window_prerequisite_edit','nonapproval_review','batch_write']
function Stage(){
 const [role,setRole]=useState('manager'),[status,setStatus]=useState('verified'),[rev,setRev]=useState(0),[bad,setBad]=useState(false)
 const [nav,setNav]=useState({section:'work',workView:'history',candidateView:'applicants',candidateFilter:'all'})
 const [wn,setWn]=useState({section:'tasks',taskRange:'today'})
 const actor=id(role==='manager'?98:99)
 const port=useMemo(()=>createWindowReadReviewPort({syntheticReviewOnly:true,fixtureTransport:async(name,args)=>{
  if(name==='qa_window_api_capabilities_v1')return {contract_version:1,audience:role,actor_id:actor,worker_id:role==='worker'?worker:null,schedule_contract_version:2,review_only:true,operational_enabled:false,fixture_enabled:true,allowed_schedule_kinds:['legacy_day','single_report_window'],held_operations:holds}
  if(bad)throw Error('QA READ FAILED')
  return name==='qa_window_api_manager_read_v1'?manager:self
 }}),[role,actor,bad])
 const req={port,context:{role,status,actorId:actor,workerId:role==='worker'?worker:null,ready:true}}
 const flags={r5IaFixture:true}
 const navigate=item=>setNav(n=>nextManagerNavigation(n,item))
 return <><div dir="rtl" aria-label="کنترل آزمایش" style={{display:'flex',flexWrap:'wrap',gap:8,padding:8}}>
 <button onClick={()=>{setRole('manager');setStatus('verified')}}>نمای مدیر نمونه</button><button onClick={()=>{setRole('worker');setStatus('verified')}}>نمای دانشجوکار نمونه</button>
 <button onClick={()=>setStatus('checking')}>بررسی مجدد مجوز نمونه</button><button onClick={()=>setStatus('verified')}>مجوز نمونه معتبر</button>
 <button onClick={()=>{setBad(true);setRev(n=>n+1)}}>خطای خواندن نمونه</button><button onClick={()=>{setBad(false);setRev(n=>n+1)}}>خواندن مجدد نمونه</button></div>
 {role==='manager'?<main className="report-shell report-shell--dashboard ops-root swtb22-manager-enabled" dir="rtl"><ManagerWorkspaceNav navigation={nav} {...flags} onNavigate={navigate}/><div className="swtb22-manager-main"><ManagerWorkHubTabs navigation={nav} flags={flags} onNavigate={navigate}/><AdminOperations key="qa-manager" navigation={nav} setNavigation={setNav} hideSectionTabs refreshRevision={rev} windowReadReview={req}/></div></main>:
 <main className="report-shell report-shell--dashboard ops-root ops-worker-b3-view" dir="rtl"><WorkerOperations key="qa-worker" profile={{worker_id:worker,name:'دانشجوکار نمونه',unit:'research',state:'active',onboarding_state:'ready'}} navigation={wn} setNavigation={setWn} workerName="دانشجوکار نمونه" refreshRevision={rev} onRefresh={()=>setRev(n=>n+1)} windowReadReview={req}/></main>}
 </>
}
createRoot(document.getElementById('root')).render(<Stage/>)
