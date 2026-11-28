import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AdminOperations,WorkerOperations} from '../../src/OperationsWorkspace.jsx'
import ManagerWorkspaceNav from '../../src/components/ManagerWorkspaceNav.jsx'
import ManagerWorkHubTabs from '../../src/components/ManagerWorkHubTabs.jsx'
import {nextManagerNavigation} from '../../src/lib/managerWorkspaceNav.mjs'
import {createWindowReadReviewPort} from '../../src/lib/windowReadReviewPort.mjs'
import {createWindowDurableV4Review} from '../../src/lib/windowDurableV4Review.mjs'
import {id,worker} from './windowReadReviewFixtureData.mjs'
import '../../src/typography.css'
import '../../src/styles.css'
import '../../src/production-polish.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/manager-shell.css'
globalThis.__qaLegacyReads=0;globalThis.__qaWriteAttempts=0
// This isolated HTML harness has no production route; Playwright intercepts this
// exact loopback request and retains synthetic server state outside the page.
const role=new URL(location.href).searchParams.get('role')==='manager'?'manager':'worker'
const c=role==='manager'?{status:'verified',role,actorId:id(98)}:{status:'verified',role,actorId:id(99),workerId:worker,ready:true}
const fixtureTransport=async(name,args)=>{
 const r=await fetch('/__swtb26_fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,name,args}),cache:'no-store'})
 if(!r.ok)throw Error('SYNTHETIC_REPLY_UNAVAILABLE')
 return r.json()
}
const session=createWindowDurableV4Review({syntheticReviewOnly:true,fixtureTransport,context:c,assignmentWritesV1:role==='manager',newAssignmentId:()=>crypto.randomUUID()})
const port=createWindowReadReviewPort({syntheticReviewOnly:true,fixtureTransport,durableV4:true})
function Stage(){
 const [status,setStatus]=useState('verified'),[rev,setRev]=useState(0)
 const [nav,setNav]=useState({section:'work',workView:'tasks',candidateView:'applicants',candidateFilter:'all'}),[wn,setWn]=useState({section:'tasks',taskRange:'today'})
 const req={port,context:{...c,status},editor:{session}}
 const flags={r5IaFixture:true}
 return <><div dir="rtl" aria-label="کنترل آزمایش" style={{display:'flex',flexWrap:'wrap',gap:8,padding:8}}>
 <button onClick={()=>{session.suspend();setStatus('checking')}}>بررسی مجوز نمونه</button>
 <button onClick={()=>{session.setAuthority(c);setStatus('verified');setRev(x=>x+1)}}>مجوز معتبر نمونه</button>
 <button onClick={()=>setRev(x=>x+1)}>بازخوانی نمونه</button></div>
 {role==='manager'?<main className="report-shell report-shell--dashboard ops-root swtb22-manager-enabled" dir="rtl"><ManagerWorkspaceNav navigation={nav} {...flags} onNavigate={item=>setNav(n=>nextManagerNavigation(n,item))}/><div className="swtb22-manager-main"><ManagerWorkHubTabs navigation={nav} flags={flags} onNavigate={item=>setNav(n=>nextManagerNavigation(n,item))}/><AdminOperations navigation={nav} setNavigation={setNav} hideSectionTabs refreshRevision={rev} windowReadReview={req}/></div></main>:
 <main className="report-shell report-shell--dashboard ops-root ops-worker-b3-view" dir="rtl"><WorkerOperations profile={{worker_id:worker,name:'دانشجوکار نمونه',unit:'research',state:'active',onboarding_state:'ready'}} navigation={wn} setNavigation={setWn} workerName="دانشجوکار نمونه" refreshRevision={rev} onRefresh={()=>setRev(n=>n+1)} windowReadReview={req}/></main>}
 </>
}
createRoot(document.getElementById('root')).render(<Stage/>)
