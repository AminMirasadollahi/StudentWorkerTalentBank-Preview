// Synthetic browser appearance-only manager shell; no real Supabase imports.
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import ManagerWorkspaceNav from '../../src/components/ManagerWorkspaceNav.jsx'
import WorkPoolManagerPanel from '../../src/components/WorkPoolManagerPanel.jsx'
import ManagerCandidatesWorkspace from '../../src/components/ManagerCandidatesWorkspace.jsx'
import {AdminOperations} from '../../src/OperationsWorkspace.jsx'
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
// Additional D5 fake-only term access fixture; NEVER fetched from Supabase.
globalThis.__qaTerm={id:'QA-TERM',label:'نیمسال نمونه نمایشی',state:'active'}
globalThis.__qaTermAccess={ok:true,term_id:'QA-TERM',enforcement_mode:'observe',
 active_workers:2,active_without_decision:1,active_not_eligible:0,
 legacy_noneligible_planned_tasks:0,
 workers:[
  {worker_id:'QA-A',global_state:'active',eligibility:'unknown'},
  {worker_id:'QA-B',global_state:'active',eligibility:'eligible'},
 ],
}
// All data are synthetic, and the Vite plugin prevents access to live APIs.
globalThis.__qaAdminWork={
 workers:[
  {id:'QA-A',name:'دانشجوکار نمونه کتابخانه',state:'active',unit:'library'},
  {id:'QA-B',name:'دانشجوکار نمونه پژوهش',state:'active',unit:'research'},
 ],
 tasks:[
  {id:'QA-TASK-1',title:'ثبت و دسته‌بندی کتاب‌های نمونه',worker_id:'QA-A',unit:'library',
   planned_date:'2026-11-06',estimate_minutes:60,state:'assigned',created_at:'2026-11-05T10:00:00Z'},
  {id:'QA-TASK-2',title:'گردآوری آمار کارگاه‌های نمونه',worker_id:'QA-B',unit:'research',
   planned_date:'2026-11-07',estimate_minutes:90,state:'submitted',created_at:'2026-11-05T11:00:00Z'},
  {id:'QA-TASK-3',title:'بازبینی فهرست منابع نمونه',worker_id:'QA-A',unit:'library',
   planned_date:'2026-11-08',estimate_minutes:45,state:'completed',created_at:'2026-11-05T12:00:00Z'},
 ],
 weekly_slots:[{worker_id:'QA-A',weekday_iso:5,valid_from:'2026-10-01',valid_until:null,start_minute:480,end_minute:600}],
 exceptions:[],
 time_entries:[
  {id:'QA-REPORT-A',task_id:'QA-TASK-1',worker_id:'QA-A',
   review_state:'submitted',reported_minutes:60,work_date:'2026-11-06',
   submitted_at:'2026-11-06T05:00:00Z'},
  {id:'QA-REPORT-B',task_id:'QA-TASK-2',worker_id:'QA-B',
   review_state:'submitted',reported_minutes:120,work_date:'2026-11-06',
   submitted_at:'2026-11-06T06:00:00Z',extra_time_reason_code:'equipment_issue',
   extra_time_reason_text:'تأخیر نمونه برای آزمون'},
  {id:'QA-REPORT-APPROVED',task_id:'QA-TASK-1',worker_id:'QA-A',
   review_state:'approved',reported_minutes:60,approved_minutes:45,
   review_note:'=HYPERLINK("https://invalid.example","test only")',
   work_date:'2026-11-06',submitted_at:'2026-11-06T07:00:00Z'},
  {id:'QA-REPORT-ORPHAN',task_id:'QA-UNKNOWN-TASK',worker_id:'QA-B',
   review_state:'approved',reported_minutes:25,approved_minutes:25,
   work_date:'2026-11-06',submitted_at:'2026-11-06T08:00:00Z'},
 ],
 profile_requests:[
  {id:'QA-PROFILE-R',worker_id:'QA-A',field_code:'major',
   proposed_value:'رشته آزمایشی',reason:'درخواست ساختگی برای آزمون UX',
   review_state:'pending'},
 ],
 approved_minutes_total:0,
}
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
    :navigation.section==='work'&&['tasks','availability','inbox','approvals','profiles','termMemberships','history'].includes(navigation.workView)
     ?<AdminOperations navigation={navigation} setNavigation={setNavigation} hideSectionTabs/>
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
