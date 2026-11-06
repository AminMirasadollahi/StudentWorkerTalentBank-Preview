// Synthetic browser appearance-only manager shell; no real Supabase imports.
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import ManagerWorkspaceNav from '../../src/components/ManagerWorkspaceNav.jsx'
import WorkPoolManagerPanel from '../../src/components/WorkPoolManagerPanel.jsx'
import {currentManagerDestination,nextManagerNavigation} from '../../src/lib/managerWorkspaceNav.mjs'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/operations-workspace.css'
import '../../src/manager-shell.css'
globalThis.__qaGeneralOffers=[]
globalThis.__qaDeskOffers=[]
globalThis.__qaWriteAttempts=0
function Stage(){
 const [navigation,setNavigation]=useState({
  section:'work',workView:'workPool',workPoolKind:'general',candidateView:'applicants',
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
    :<section className="report-panel" aria-label="صفحه نمونه">این بخش در این آزمون نمایشی پیاده‌سازی نشده است.</section>}
  </div>
 </main>
}
createRoot(document.getElementById('app')).render(<Stage/>)
