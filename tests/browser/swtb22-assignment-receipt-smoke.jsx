// Browser fixture ONLY. Real owner, workspace, editor and native dialogs.
// Existing Vite fake API plugin; every legacy write forbidden.
import React,{StrictMode,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AdminOperations} from '../../src/OperationsWorkspace.jsx'
import DirectAssignmentFixtureHost from '../../src/components/DirectAssignmentFixtureHost.jsx'
import AssignmentRecoveryFixtureHost from '../../src/components/AssignmentRecoveryFixtureHost.jsx'
import {fixtureVerifiedRollback} from '../../src/lib/directAssignmentSession.mjs'
import '../../src/typography.css'
import '../../src/styles.css'
import '../../src/production-polish.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/operations-workspace.css'
import '../../src/manager-shell.css'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
globalThis.__qaWriteAttempts=0
globalThis.__qaAssignmentReadFail=false
globalThis.__qaAdminWork={workers:[{id:id(10),name:'دانشجوکار کاملاً ساختگی',unit:'library',state:'active'}],tasks:[],weekly_slots:[],exceptions:[],time_entries:[],profile_requests:[]}
const attempts=[],reads=[]
globalThis.__qaReceiptAttempts=attempts
globalThis.__qaReceiptReads=reads
globalThis.__qaReceiptMode='lost'
let seq=100
const fixture=Object.freeze({
 makeId:()=>id(seq++),
 write:async p=>{
  attempts.push(p)
  if(globalThis.__qaReceiptMode==='lost')throw Error('SYNTHETIC_LOST_RESPONSE')
  if(globalThis.__qaReceiptMode==='reject')return fixtureVerifiedRollback('worker_not_eligible_for_term')
  return {ok:true,request_id:p.p_request_id,kind:p.p_kind,result:{id:id(200+attempts.length),state:'assigned',short_notice:true}}
 },
 read:async k=>{reads.push(k);return {found:false}}
})
// Playwright intercepts this exact localhost URL. State survives real page reload
// in the test process, never in browser storage or the Vite/Supabase backend.
const v2=new URLSearchParams(location.search).get('fixture')==='v2'
const recoveryCall=async args=>{
 const response=await fetch('/__swtb22_synthetic_recovery_v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})
 if(!response.ok)throw Error('SYNTHETIC_RESPONSE_LOST')
 return response.json()
}
const recoveryFixture=Object.freeze({version:2,makeId:()=>crypto.randomUUID(),write:recoveryCall,control:recoveryCall})
const Host=v2?AssignmentRecoveryFixtureHost:DirectAssignmentFixtureHost
function Stage(){
 const [navigation,setNavigation]=useState({section:'work',workView:'tasks',workerId:''})
 const [checking,setChecking]=useState(false)
 return <Host actorId={id(1)} checking={checking} fixture={v2?recoveryFixture:fixture}>{port=><main dir="rtl" className="report-shell report-shell--dashboard ops-root">
  <nav aria-label="مسیرهای آزمایشی">
   <button type="button" onClick={()=>setNavigation(v=>({...v,workView:'tasks',workerId:''}))}>وظایف آزمایشی</button>
   <button type="button" onClick={()=>setNavigation(v=>({...v,workView:'availability',workerId:''}))}>تقویم آزمایشی</button>
   <button type="button" onClick={()=>setChecking(v=>!v)}>بررسی مجوز آزمایشی</button>
  </nav>
  <AdminOperations navigation={navigation} setNavigation={setNavigation} hideSectionTabs assignmentReceiptPort={port}/>
 </main>}</Host>
}
createRoot(document.getElementById('app')).render(<StrictMode><Stage/></StrictMode>)
