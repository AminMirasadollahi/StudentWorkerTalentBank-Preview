import {useCallback,useEffect,useRef,useState} from 'react'
import JalaliDatePicker from './JalaliDatePicker'
import {plusIsoDays} from '../lib/persianMonthCalendar.mjs'
import {getOperationsTermDashboard,getManagerWorkPool,
 createWorkTemplate,createWorkOpportunity,setWorkOpportunityState
} from '../lib/operationsV2'

const fa=new Intl.NumberFormat('fa-IR')
const dates=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium',timeZone:'UTC'})
const labelDate=x=>x?dates.format(new Date(x+'T12:00:00Z')):'—'
const units={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const states={draft:'پیش‌نویس',published:'منتشرشده',paused:'متوقف',closed:'بسته‌شده'}
const todayISO=()=>{
 const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const part=k=>pieces.find(p=>p.type===k)?.value||''
 return part('year')+'-'+part('month')+'-'+part('day')
}
export default function WorkPoolManagerPanel({refreshRevision=0}){
 const today=todayISO()
 const [revision,setRevision]=useState(0)
 const [snapshot,setSnapshot]=useState({status:'loading',terms:[],items:null})
 const [template,setTemplate]=useState({unit:'library',title:'',
  description:'',instructions:'',minutes:'60',priority:'3'})
 const [offer,setOffer]=useState({templateId:'',termId:'',date:plusIsoDays(today,7),
  capacity:'1',deadline:''})
 const [closing,setClosing]=useState('')
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState('')
 const [uncertain,setUncertain]=useState(false)
 const [notice,setNotice]=useState('')
 const pending=useRef(false)
 const readIndex=useRef(0)
 const reload=useCallback(async()=>{
  const seq=++readIndex.current
  setSnapshot({status:'loading',terms:[],items:null})
  try{
   const [terms,items]=await Promise.all([
    getOperationsTermDashboard(),
    getManagerWorkPool({from:todayISO(),to:plusIsoDays(todayISO(),90)}),
   ])
   if(seq!==readIndex.current)return
   if(terms?.ok!==true||!Array.isArray(terms.terms)||
      items?.ok!==true||!Array.isArray(items.templates)||
      !Array.isArray(items.opportunities))throw Error('work_pool_invalid_manager_response')
   setSnapshot({status:'ready',terms:terms.terms,items})
   setUncertain(false)
  }catch{
   if(seq===readIndex.current)
    setSnapshot({status:'error',terms:[],items:null})
  }
 },[])
 useEffect(()=>{void reload()},[reload,revision,refreshRevision])
 const run=async(id,action,success)=>{
  if(pending.current||uncertain)return
  pending.current=true;setBusy(id);setNotice('')
  try{
   const response=await action()
   if(!response||!response.id)throw Error('unconfirmed_work_pool_change')
   success?.(response)
   setNotice('تغییر ثبت شد؛ فهرست از سرور بازخوانی می‌شود.')
   setRevision(v=>v+1)
  }catch{
   // Without a server idempotency key on manager creation, never auto-repeat.
   setUncertain(true)
   setNotice('نتیجه درخواست قطعی نیست. پیش از هر ثبت دوباره، فهرست را بازخوانی و بررسی کنید.')
  }finally{pending.current=false;setBusy('')}
 }
 const createTemplate=event=>{
  event.preventDefault()
  if(template.title.trim().length<3||template.description.trim().length<10)return
  void run('template',()=>createWorkTemplate({
   unit:template.unit,title:template.title.trim(),description:template.description.trim(),
   privateInstructions:template.instructions.trim(),minutes:template.minutes,
   priority:template.priority,
  }),()=>setTemplate({unit:'library',title:'',description:'',instructions:'',minutes:'60',priority:'3'}))
 }
 const createOffer=event=>{
  event.preventDefault()
  if(!offer.templateId||!offer.termId||!offer.date)return
  void run('opportunity',()=>createWorkOpportunity({
   templateId:offer.templateId,termId:offer.termId,date:offer.date,
   capacity:offer.capacity,claimDeadline:offer.deadline||null,
  }),()=>setOffer(old=>({...old,templateId:'',capacity:'1',deadline:''})))
 }
 const transition=(id,state,why=null)=>{
  void run('state:'+id,()=>setWorkOpportunityState({
   opportunityId:id,state,reason:why,
  }),()=>{setClosing('');setReason('')})
 }
 const terms=snapshot.terms.filter(t=>t.state==='active')
 const templates=snapshot.items?.templates||[]
 const opportunities=snapshot.items?.opportunities||[]
 const ordered=opportunities.slice().sort((a,b)=>
  (a.date||'').localeCompare(b.date||'')||String(a.id).localeCompare(String(b.id)))
 const formDisabled=busy!==''||uncertain||snapshot.status!=='ready'
 return <section className="report-panel ow-work-pool" aria-label="مدیریت مخزن وظایف">
  <div className="report-panel-heading">
   <div><h2>مخزن وظایف و فرصت‌های کاری</h2>
    <p className="ow-muted">الگوهای کار مستقل از نوبت‌های تاریخ‌دارند. فقط فرصت منتشرشده می‌تواند توسط دانشجوکار واجد شرایط انتخاب شود.</p>
   </div>
   <button type="button" className="report-btn report-btn--light"
    onClick={()=>{setUncertain(false);setRevision(x=>x+1)}} disabled={busy!==''}>
    بازخوانی</button>
  </div>
  <p className="ow-compact-hint">این بخش فقط برای کارهای عمومی است. نوبت‌های زمان‌دار کتابخانه، کار گروهی و درخواست‌های نیازمند تأیید مدیر همچنان از مسیرهای تخصصی خود انجام می‌شوند. انتخاب کار، ساعت تأییدشده ایجاد نمی‌کند.</p>
  {notice&&<p role={uncertain?'alert':'status'} className={uncertain?'report-alert report-alert--error':'ops-alert-success'}>{notice}</p>}
  {snapshot.status==='loading'&&<p role="status" className="ow-muted">در حال دریافت الگوها و فرصت‌ها…</p>}
  {snapshot.status==='error'&&<div role="alert" className="report-alert report-alert--error">اطلاعات مخزن در دسترس نیست. امکان ثبت تا بازخوانی موفق متوقف است.</div>}
  {snapshot.status==='ready'&&<div className="ow-work-pool-columns">
   <div className="ow-work-pool-compose">
    <details className="ow-work-pool-editor">
     <summary>+ تعریف الگوی کار</summary>
     <form className="ow-compact-form" onSubmit={createTemplate}>
      <label className="report-field"><span>واحد انجام کار</span>
       <select value={template.unit} disabled={formDisabled} onChange={e=>setTemplate(v=>({...v,unit:e.target.value}))}>
        {Object.entries(units).map(([id,name])=><option key={id} value={id}>{name}</option>)}
       </select>
      </label>
      <label className="report-field"><span>عنوان قابل مشاهده برای دانشجوکار</span>
       <input required minLength={3} maxLength={160} value={template.title} disabled={formDisabled}
        onChange={e=>setTemplate(v=>({...v,title:e.target.value}))}/>
      </label>
      <label className="report-field"><span>شرح عمومی فعالیت</span>
       <textarea required minLength={10} maxLength={1200} rows={3}
        value={template.description} disabled={formDisabled}
        onChange={e=>setTemplate(v=>({...v,description:e.target.value}))}/>
      </label>
      <label className="report-field"><span>راهنمای اختصاصی برای فرد انتخاب‌کننده (برای دیگران منتشر نمی‌شود)</span>
       <textarea maxLength={3000} rows={3} value={template.instructions} disabled={formDisabled}
        onChange={e=>setTemplate(v=>({...v,instructions:e.target.value}))}/>
      </label>
      <div className="ow-work-pool-twofields">
       <label className="report-field"><span>زمان تخمینی هر نفر (دقیقه)</span>
        <input type="number" min={1} max={1440} required value={template.minutes}
         disabled={formDisabled} onChange={e=>setTemplate(v=>({...v,minutes:e.target.value}))}/></label>
       <label className="report-field"><span>اولویت (۱ بالاترین)</span>
        <select value={template.priority} disabled={formDisabled}
         onChange={e=>setTemplate(v=>({...v,priority:e.target.value}))}>
         {[1,2,3,4,5].map(x=><option key={x} value={x}>{fa.format(x)}</option>)}
        </select>
       </label>
      </div>
      <button className="report-btn report-btn--primary" disabled={formDisabled} type="submit">
       {busy==='template'?'در حال ثبت…':'ثبت الگوی کار'}</button>
     </form>
    </details>
    <details className="ow-work-pool-editor">
     <summary>+ تعریف فرصت کاری در تاریخ مشخص</summary>
     <form className="ow-compact-form" onSubmit={createOffer}>
      <label className="report-field"><span>الگوی کار</span>
       <select required value={offer.templateId} disabled={formDisabled} onChange={e=>setOffer(v=>({...v,templateId:e.target.value}))}>
        <option value="">انتخاب الگوی فعال</option>
        {templates.filter(t=>t.kind==='general'&&t.state==='active').map(t=>
          <option key={t.id} value={t.id}>{t.title} · {units[t.unit]||t.unit}</option>)}
       </select>
      </label>
      <label className="report-field"><span>نیمسال فعال</span>
       <select required value={offer.termId} disabled={formDisabled} onChange={e=>setOffer(v=>({...v,termId:e.target.value}))}>
        <option value="">انتخاب نیمسال</option>
        {terms.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
       </select>
      </label>
      <div className="ow-work-pool-twofields">
       <div className="report-field"><span>تاریخ انجام (شمسی)</span>
        <JalaliDatePicker value={offer.date} onChange={date=>setOffer(v=>({...v,date}))}
         disabled={formDisabled} ariaLabel="تاریخ فرصت کاری"/></div>
       <label className="report-field"><span>ظرفیت (نفر)</span>
        <input type="number" min={1} max={20} required value={offer.capacity}
         disabled={formDisabled} onChange={e=>setOffer(v=>({...v,capacity:e.target.value}))}/>
       </label>
      </div>
      <div className="report-field"><span>آخرین تاریخ انتخاب (اختیاری؛ پیش‌فرض دو روز قبل از انجام)</span>
       <JalaliDatePicker value={offer.deadline}
        onChange={date=>setOffer(v=>({...v,deadline:date}))}
        disabled={formDisabled} ariaLabel="مهلت انتخاب فرصت"/>
      </div>
      <p className="ow-muted">فرصت ابتدا پیش‌نویس است؛ بعداً با اقدام جداگانه منتشر می‌شود. برای حفظ قواعد اطلاع‌رسانی، تاریخ انجام دست‌کم دو روز آینده است.</p>
      <button className="report-btn report-btn--primary" disabled={formDisabled||!terms.length}
       type="submit">{busy==='opportunity'?'در حال ثبت…':'ساخت پیش‌نویس فرصت'}</button>
     </form>
    </details>
   </div>
   <div className="ow-work-pool-list">
    <h3>فرصت‌ها <small>({fa.format(ordered.length)})</small></h3>
    {!ordered.length&&<p className="ow-muted">هنوز فرصتی برای این بازه تعریف نشده است.</p>}
    {ordered.map(opp=>{
     const item=templates.find(t=>t.id===opp.template_id)
     const term=terms.find(t=>t.id===opp.term_id)||snapshot.terms.find(t=>t.id===opp.term_id)
     return <article className="ow-work-pool-item" key={opp.id}>
      <div className="ow-work-pool-item__top">
       <strong>{item?.title||'الگوی ناشناخته'}</strong>
       <small>{states[opp.state]||opp.state}</small>
      </div>
      <p className="ow-muted">{term?.label||'نیمسال نامشخص'} · {units[item?.unit]||item?.unit||'واحد نامشخص'} · {labelDate(opp.date)}</p>
      <p>ظرفیت: {fa.format(opp.claimed_count)} انتخاب از {fa.format(opp.capacity)} نفر
       {' · '}مهلت انتخاب: {labelDate(opp.claim_deadline)}</p>
      <div className="ow-work-pool-item__actions">
       {['draft','paused'].includes(opp.state)&&<button type="button"
        className="report-btn report-btn--primary" disabled={formDisabled}
        onClick={()=>transition(opp.id,'published')}>انتشار فرصت</button>}
       {opp.state==='published'&&<button type="button" className="ow-mini-btn"
        disabled={formDisabled} onClick={()=>transition(opp.id,'paused')}>توقف انتخاب جدید</button>}
       {['published','paused'].includes(opp.state)&&
        <button type="button" className="ow-mini-btn" disabled={formDisabled}
         onClick={()=>{setClosing(opp.id);setReason('')}}>بستن فرصت</button>}
      </div>
      {closing===opp.id&&<div className="ow-work-pool-close">
       <label className="report-field"><span>علت بستن فرصت (حداقل ۵ نویسه)</span>
        <input minLength={5} maxLength={500} value={reason}
         onChange={e=>setReason(e.target.value)} disabled={formDisabled}/></label>
       <div><button className="report-btn report-btn--primary" type="button"
         disabled={formDisabled||reason.trim().length<5}
         onClick={()=>transition(opp.id,'closed',reason.trim())}>ثبت بستن</button>
        <button className="ow-mini-btn" type="button" disabled={formDisabled}
         onClick={()=>setClosing('')}>انصراف</button></div>
      </div>}
     </article>
    })}
   </div>
  </div>}
 </section>
}
