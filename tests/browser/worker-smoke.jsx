/* Browser-only synthetic test fixture. Never import this from production src/main.jsx.
   Any operations API call is intercepted by the Vite smoke plugin. */
import React,{useLayoutEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {WorkerOperations} from '../../src/OperationsWorkspace.jsx'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/typography.css'

const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
 timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'
}).formatToParts(new Date()).map(part=>[part.type,part.value]))
const today=[parts.year,parts.month,parts.day].join('-')
const workerId='SWTB_CHROMIUM_SYNTHETIC_WORKER'
const basic={worker_id:workerId,planned_date:today,estimate_minutes:60}
const task=(id,title,state,date)=>({...basic,id,title,state,planned_date:date,
 instructions:'شرح نمونهٔ کاملاً ساختگی برای بررسی رابط کاربری',
 collaborators:[]})
globalThis.__qaWorkerData={
 tasks:[
  task('SYNTHETIC-TODAY','کار نمونهٔ امروز','assigned',today),
  task('SYNTHETIC-FUTURE','کار نمونهٔ سال آینده','assigned','2099-03-02'),
  task('SYNTHETIC-COMPLETED','کار نمونهٔ تکمیل‌شده','completed','2020-03-02')
 ],
 weekly_slots:[],exceptions:[],
 time_entries:[
  {id:'SYNTHETIC-ENTRY-PENDING',worker_id:workerId,task_id:'SYNTHETIC-TODAY',
   work_date:today,review_state:'submitted',reported_minutes:30},
  {id:'SYNTHETIC-ENTRY-REVIEW',worker_id:workerId,task_id:'SYNTHETIC-COMPLETED',
   work_date:'2020-03-02',review_state:'changes_requested',reported_minutes:45,
   review_note:'این توضیح یک نظر مدیر کاملاً ساختگی برای بازبینی UI است'},
  {id:'SYNTHETIC-ENTRY-APPROVED',worker_id:workerId,task_id:'SYNTHETIC-COMPLETED',
   work_date:'2020-03-01',review_state:'approved',reported_minutes:80,approved_minutes:55,
   extra_time_reason_text:'دلیل ساختگی درخواست زمان اضافه'},
 ],approved_minutes_total:105,
}
globalThis.__qaProfileRequests=[
 {id:'SYNTHETIC-REQUEST-1',field_code:'major',
  proposed_value:'رشتهٔ آزمایشی',review_state:'pending',
  review_note:'این توضیح صرفاً نمونهٔ ساختگی برای آزمون مرورگر است'},
 {id:'SYNTHETIC-REQUEST-2',field_code:'name',
  proposed_value:'نام آزمایشی ثبت‌شده',review_state:'approved',
  review_note:'اصلاح این مشخصه در داده‌های ساختگی تأیید شده است'},
 {id:'SYNTHETIC-REQUEST-3',field_code:'major',
  proposed_value:'یک مقدار آزمایشی طولانی برای بررسی خوانایی متن فارسی و شکست خط',
  review_state:'rejected',
  review_note:'درخواست نمونه به‌دلیل وجود مغایرت آزمایشی رد شده است؛ جهت بررسی بعدی از مسیر تعریف‌شده اقدام کنید'},
]
globalThis.__qaWriteAttempts=0

function App(){
 const [nav,setNav]=useState({section:'tasks',taskRange:'today'})
 const [frozen,setFrozen]=useState(false)
 const curtainRef=useRef(null)
 useLayoutEffect(()=>{
  const curtain=curtainRef.current
  if(!curtain)return
  if(frozen && !curtain.open)curtain.showModal()
  if(!frozen && curtain.open)curtain.close()
 },[frozen])
 useLayoutEffect(()=>{
  globalThis.__qaSetFrozen=setFrozen
  return ()=>{delete globalThis.__qaSetFrozen}
 },[])
 return <div className="ops-root report-shell" dir="rtl">
  <div className={frozen?'ops-recheck-frozen':undefined}
       inert={frozen} aria-hidden={frozen?'true':undefined}>
   <WorkerOperations profile={{worker_id:workerId}} navigation={nav}
      setNavigation={setNav}/>
  </div>
  <dialog className="ops-recheck-curtain ops-root" ref={curtainRef}
    aria-label="بررسی مجدد دسترسی" role="status">
   <p className="ops-recheck-indicator">در حال بررسی مجدد دسترسی — بدون نمایش داده</p>
  </dialog>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>)
