// Synthetic browser appearance-only manager shell; no real Supabase imports.
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import ManagerWorkspaceNav from '../../src/components/ManagerWorkspaceNav.jsx'
import WorkPoolManagerPanel from '../../src/components/WorkPoolManagerPanel.jsx'
import ManagerCandidatesWorkspace from '../../src/components/ManagerCandidatesWorkspace.jsx'
import {currentManagerDestination,nextManagerNavigation} from '../../src/lib/managerWorkspaceNav.mjs'
// Match global public entrypoint styles, including the historical html/body/#root overflow rule.
import '../../src/typography.css'
import '../../src/styles.css'
import '../../src/production-polish.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/operations-workspace.css'
import '../../src/manager-shell.css'
globalThis.__qaGeneralOffers=[]
globalThis.__qaDeskOffers=[]
globalThis.__qaWriteAttempts=0
const demoCandidates=[
 {id:'SYNTH_A',full_name:'داوطلب نمونه الف',major:'آموزش ابتدایی',entry_year:1404,
  phone:'09123456780',primary_unit:'library',interview_status:'pending',clearance_status:'pending'},
 {id:'SYNTH_B',full_name:'داوطلب نمونه ب',major:'ریاضی',entry_year:1403,
  phone:'09123456781',primary_unit:'research',interview_status:'approved',clearance_status:'cleared'},
 {id:'SYNTH_C',full_name:'داوطلب نمونه پ',major:'علوم تربیتی',entry_year:1402,
  phone:'09123456782',primary_unit:'library',worker_id:'FAKE_WORKER',
  worker_state:'inactive',interview_status:'approved',clearance_status:'cleared'},
]
function Stage(){
 const [navigation,setNavigation]=useState({
  section:'work',workView:'workPool',workPoolKind:'general',candidateView:'applicants',
  candidateFilter:'all',candidateSearch:'',candidateId:'',
 })
 const title=currentManagerDestination(navigation)?.label||'مدیریت'
 return <main className="report-shell report-shell--dashboard ops-root swtb22-manager-enabled" dir="rtl">
  <ManagerWorkspaceNav navigation={navigation}
   onNavigate={destination=>setNavigation(v=>nextManagerNavigation(v,destination))}/>
  <div className="swtb22-manager-main">
   <header className="report-header"><div>
    <span className="report-eyebrow">دانشکده علوم انسانی شهید رجایی بابل</span>
    <h1>{title}</h1>
    <p>نمونه کاملاً ساختگی برای بررسی معماری و دسترسی‌پذیری</p>
   </div></header>
   {navigation.section==='work'&&navigation.workView==='workPool'
    ?<WorkPoolManagerPanel activeKind={navigation.workPoolKind}
      onKindChange={kind=>setNavigation(v=>({...v,workPoolKind:kind}))}/>
    :navigation.section==='candidates'&&navigation.candidateView==='applicants'
     ?<ManagerCandidatesWorkspace rows={demoCandidates} filter={navigation.candidateFilter}
       search={navigation.candidateSearch} selectedId={navigation.candidateId}
       onFilterChange={value=>setNavigation(previous=>({...previous,candidateFilter:value}))}
       onSearchChange={value=>setNavigation(previous=>({...previous,candidateSearch:value}))}
       onSelect={id=>setNavigation(previous=>({...previous,candidateId:id}))}
       renderDetails={row=><div data-testid="swtb22-fake-candidate-detail">
        صرفاً اطلاعات نمایشی {row.full_name}؛ هیچ ارتباطی با داده‌های واقعی ندارد.
       </div>}/>
     :<section className="report-panel" aria-label="صفحه نمونه">این بخش در این آزمون نمایشی پیاده‌سازی نشده است.</section>}
  </div>
 </main>
}
createRoot(document.getElementById('app')).render(<Stage/>)
