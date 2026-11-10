/* SWTB14 dedicated design rehearsal. This file intentionally does not import
 * OpsApp, Supabase clients, user sessions or worker-write RPC modules.
 * It uses the real site's Modam typography and worker B3 shell CSS. */
import {StrictMode,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import WorkerAgreementModalPreview from './components/WorkerAgreementModalPreview.jsx'
import './typography.css'
import './styles.css'
import './operations-workspace.css'
import './charter-preview-shell.css'

function CharterPreviewShell(){
 const [open,setOpen]=useState(true)
 const charterButton=useRef(null)
 const openModal=()=>setOpen(true)
 const closeModal=()=>{
  setOpen(false)
  requestAnimationFrame(()=>charterButton.current?.focus())
 }
 return <main className="ops-worker-b3-view report-shell swtb-charter-local-shell" dir="rtl">
  <div className="ow-b3-layout">
   <aside className="ow-b3-sidebar" aria-label="پوسته نمایشی پنل دانشجوکار">
    <div className="ow-b3-brand"><span className="ow-b3-brand__icon" aria-hidden="true">▤</span>
     <div><strong>پنل دانشجوکار</strong><small>دانشکده علوم انسانی شهید رجایی بابل</small></div>
    </div>
    <p className="ow-b3-sidebar-caption">فضای کاری ـ نمایشی</p>
    <nav aria-label="فهرست نمونه فقط برای مشاهده چیدمان"
      className="swtb-charter-local-nav">
     <span>کارهای من</span><span>برنامه حضور</span><span>سوابق گزارش‌ها</span><span>حساب من</span>
    </nav>
    <div className="ow-b3-sidebar__footer">
     <div className="swtb-policy-sidebar-actions">
      <span className="swtb-charter-local-guide" aria-label="جای دکمه راهنمای سامانه">؟ راهنمای سامانه</span>
      <button type="button" ref={charterButton}
       aria-haspopup="dialog" onClick={openModal}>▤ چارچوب همکاری</button>
     </div>
     <div className="ow-b3-worker">
      <span className="ow-b3-worker__avatar" aria-hidden="true">د</span>
      <div><strong>دانشجوکار نمونه</strong><small>بدون ورود به حساب واقعی</small></div>
     </div>
     <p className="swtb-charter-local-safe">این صفحه صرفاً پیش‌نمایش است؛ هیچ داده‌ای از کاربران دریافت یا ثبت نمی‌شود.</p>
    </div>
   </aside>
   <div className="ow-b3-stage">
    <header className="ow-b3-toolbar">
     <span className="ow-b3-breadcrumb">فضای کاری <span aria-hidden="true">›</span> <strong>پیش‌نمایش چارچوب</strong></span>
     <span className="swtb-charter-local-flag">غیرعملیاتی · بدون پذیرش</span>
    </header>
    <section className="report-panel swtb-charter-local-info">
     <h1>پیش‌نمایش چارچوب همکاری دانشجوکاران</h1>
     <p>این مسیر مخصوص بازبینی در مرورگر محلی است. فونت «مدام»، کارت‌ها،
       جدول زمان‌بندی و پنجره، از کد همان نسخه آزمایشی پنل استفاده می‌کنند.</p>
     <button type="button" className="report-btn report-btn--primary"
      onClick={openModal}>نمایش چارچوب همکاری</button>
     <p className="ow-muted">برای بررسی اندازه آیکون‌ها، ارتفاع مستقل کارت‌ها،
       و امکان باز و بسته‌کردن توضیحات تکمیلی بند پنج، پنجره را مرور کنید.</p>
    </section>
   </div>
  </div>
  {open&&<WorkerAgreementModalPreview open={open} onClose={closeModal}/>}
 </main>
}

createRoot(document.getElementById('root')).render(<StrictMode><CharterPreviewShell/></StrictMode>)
