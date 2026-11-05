import {useCallback,useEffect,useRef,useState} from 'react'
import JalaliDatePicker from './JalaliDatePicker'
import {plusIsoDays} from '../lib/persianMonthCalendar.mjs'
import {getOperationsTermDashboard,getManagerWorkPool,getManagerDeskWorkPool,
 createDeskWorkTemplate,createDeskWorkOffer,setDeskWorkOfferState} from '../lib/operationsV2'

const fa=new Intl.NumberFormat('fa-IR')
const dayFa=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
 dateStyle:'medium',timeZone:'UTC'})
const nameDay=date=>date?dayFa.format(new Date(date+'T12:00:00Z')):'—'
const prettyTime=min=>String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0')
const minutes=value=>{
 if(!/^\d{2}:\d{2}$/.test(value))return NaN
 const [h,m]=value.split(':').map(Number)
 return h<24&&m<60?h*60+m:NaN
}
const todayTehran=()=>{
 const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const v=k=>pieces.find(p=>p.type===k)?.value||''
 return [v('year'),v('month'),v('day')].join('-')
}
const labels={draft:'پیش‌نویس',published:'منتشرشده',paused:'متوقف',closed:'بسته‌شده'}
export default function DeskWorkPoolManagerSection({refreshRevision=0}){
 const [view,setView]=useState({status:'loading',terms:[],templates:[],offers:[]})
 const [draft,setDraft]=useState({title:'',description:'',instructions:'',
  minutes:'60',priority:'3'})
 const [offer,setOffer]=useState({templateId:'',termId:'',date:plusIsoDays(todayTehran(),7),
  start:'08:00',end:'09:00',capacity:'1',deadline:''})
 const [reason,setReason]=useState('')
 const [closing,setClosing]=useState('')
 const [busy,setBusy]=useState(false)
 const [uncertain,setUncertain]=useState(false)
 const [notice,setNotice]=useState('')
 const [revision,setRevision]=useState(0)
 const pending=useRef(false)
 const sequence=useRef(0)
 const refresh=useCallback(async()=>{
  const i=++sequence.current
  setView({status:'loading',terms:[],templates:[],offers:[]})
  try{
   const now=todayTehran()
   const [t,templates,offers]=await Promise.all([
    getOperationsTermDashboard(),
    getManagerWorkPool({from:now,to:plusIsoDays(now,90)}),
    getManagerDeskWorkPool({from:now,to:plusIsoDays(now,90)}),
   ])
   if(sequence.current!==i)return
   if(t?.ok!==true||templates?.ok!==true||offers?.ok!==true
    ||offers.scope!=='manager_desk_offers'||!Array.isArray(t.terms)
    ||!Array.isArray(templates.templates)||!Array.isArray(offers.offers))
    throw Error('manager_desk_pool_invalid_read')
   setView({status:'ready',terms:t.terms,
    templates:templates.templates.filter(x=>x.kind==='library_desk'&&x.state==='active'),
    offers:offers.offers})
  }catch{
   if(sequence.current===i)
    setView({status:'error',terms:[],templates:[],offers:[]})
  }
 },[])
 useEffect(()=>{void refresh();return()=>{sequence.current+=1}},[refresh,refreshRevision,revision])
 const submit=async (operation,fn,after)=>{
  if(pending.current||uncertain||view.status!=='ready')return
  pending.current=true;setBusy(true);setNotice('')
  try{
   const reply=await fn()
   if(typeof reply?.id!=='string')throw Error('desk_manager_result_unknown')
   after?.(reply)
   setNotice('درخواست ثبت شد و اطلاعات دوباره از سرور دریافت می‌شود.')
   setRevision(v=>v+1)
  }catch{
   setUncertain(true)
   setNotice('نتیجه درخواست مشخص نیست. برای جلوگیری از ثبت تکراری، ابتدا اطلاعات را از سرور بازخوانی و بررسی کنید.')
  }finally{
   pending.current=false;setBusy(false)
  }
 }
 const inactive=busy||uncertain||view.status!=='ready'
 const createTemplate=e=>{
  e.preventDefault()
  if(draft.title.trim().length<3||draft.description.trim().length<10)return
  void submit('template',()=>createDeskWorkTemplate({
   title:draft.title.trim(),description:draft.description.trim(),
   privateInstructions:draft.instructions,minutes:draft.minutes,priority:draft.priority,
  }),()=>setDraft({title:'',description:'',instructions:'',minutes:'60',priority:'3'}))
 }
 const createOffer=e=>{
  e.preventDefault()
  const tpl=view.templates.find(x=>x.id===offer.templateId)
  const start=minutes(offer.start),end=minutes(offer.end)
  if(!tpl||!offer.termId||!offer.date||!Number.isFinite(start)||
    !Number.isFinite(end)||end-start!==Number(tpl.estimated_minutes)){
   setNotice('مدت نوبت باید دقیقاً با مدت الگوی انتخاب‌شده برابر باشد.')
   return
  }
  void submit('offer',()=>createDeskWorkOffer({
   templateId:offer.templateId,termId:offer.termId,date:offer.date,
   start,end,capacity:offer.capacity,deadline:offer.deadline||null,
  }),()=>setOffer(p=>({...p,templateId:'',capacity:'1',deadline:''})))
 }
 const change=(id,state,why=null)=>
  void submit('state',()=>setDeskWorkOfferState({offerId:id,state,reason:why}),
  ()=>{setClosing('');setReason('')})
 return <section className="ow-desk-pool-block" aria-label="نوبت‌های زمان‌دار کتابخانه">
  <div className="ow-desk-pool-heading">
   <div><h3>نوبت‌های میز کتابخانه</h3>
    <p className="ow-muted">هر نوبت، زمان شروع و پایان مشخص دارد. ظرفیت دو نفر در کل میز کتابخانه محاسبه می‌شود، نه فقط در یک فرصت کاری.</p>
   </div>
   <button type="button" className="ow-mini-btn" disabled={busy}
    onClick={()=>{setUncertain(false);setRevision(x=>x+1)}}>
    بازخوانی نوبت‌ها</button>
  </div>
  {notice&&<div className={uncertain?'report-alert report-alert--error':'ops-alert-success'}
    role={uncertain?'alert':'status'}>{notice}</div>}
  {view.status==='loading'&&<p role="status">در حال خواندن نوبت‌ها…</p>}
  {view.status==='error'&&<p role="alert" className="report-alert report-alert--error">دریافت نوبت‌های کتابخانه موفق نبود؛ ثبت و انتشار غیرفعال است.</p>}
  {view.status==='ready'&&<div className="ow-work-pool-columns">
   <div className="ow-work-pool-compose">
    <details className="ow-work-pool-editor">
     <summary>+ تعریف الگوی نوبت کتابخانه</summary>
     <form className="ow-compact-form" onSubmit={createTemplate}>
      <label className="report-field"><span>عنوان قابل مشاهده</span>
       <input required minLength={3} maxLength={160} value={draft.title}
        disabled={inactive} onChange={e=>setDraft(v=>({...v,title:e.target.value}))}/>
      </label>
      <label className="report-field"><span>شرح عمومی نوبت</span>
       <textarea required minLength={10} maxLength={1200} rows={2}
        value={draft.description} disabled={inactive}
        onChange={e=>setDraft(v=>({...v,description:e.target.value}))}/>
      </label>
      <label className="report-field"><span>دستورالعمل اختصاصی (فقط برای فرد انتخاب‌کننده)</span>
       <textarea maxLength={3000} rows={2} value={draft.instructions}
        disabled={inactive} onChange={e=>setDraft(v=>({...v,instructions:e.target.value}))}/>
      </label>
      <div className="ow-work-pool-twofields">
       <label className="report-field"><span>مدت ثابت نوبت (دقیقه)</span>
        <input required type="number" min="1" max="1440" value={draft.minutes}
         disabled={inactive} onChange={e=>setDraft(v=>({...v,minutes:e.target.value}))}/>
       </label>
       <label className="report-field"><span>اولویت</span>
        <select value={draft.priority} disabled={inactive}
         onChange={e=>setDraft(v=>({...v,priority:e.target.value}))}>
         {[1,2,3,4,5].map(x=><option key={x} value={x}>{fa.format(x)}</option>)}
        </select>
       </label>
      </div>
      <button type="submit" disabled={inactive} className="report-btn report-btn--primary">
       ثبت الگوی نوبت</button>
     </form>
    </details>
    <details className="ow-work-pool-editor">
     <summary>+ تعریف فرصت نوبت تاریخ‌دار</summary>
     <form className="ow-compact-form" onSubmit={createOffer}>
      <label className="report-field"><span>الگوی نوبت</span>
       <select value={offer.templateId} required disabled={inactive}
        onChange={e=>setOffer(v=>({...v,templateId:e.target.value}))}>
        <option value="">انتخاب الگوی کتابخانه</option>
        {view.templates.map(x=><option value={x.id} key={x.id}>
         {x.title} · {fa.format(x.estimated_minutes)} دقیقه</option>)}
       </select>
      </label>
      <label className="report-field"><span>نیمسال فعال</span>
       <select required value={offer.termId} disabled={inactive}
        onChange={e=>setOffer(v=>({...v,termId:e.target.value}))}>
        <option value="">انتخاب نیمسال</option>
        {view.terms.filter(t=>t.state==='active').map(t=>
         <option value={t.id} key={t.id}>{t.label}</option>)}
       </select>
      </label>
      <div className="report-field"><span>تاریخ نوبت</span>
       <JalaliDatePicker value={offer.date} ariaLabel="تاریخ نوبت کتابخانه"
        onChange={date=>setOffer(v=>({...v,date}))} disabled={inactive}/>
      </div>
      <div className="ow-work-pool-twofields">
       <label className="report-field"><span>شروع</span>
        <input type="time" required value={offer.start} disabled={inactive}
         onChange={e=>setOffer(v=>({...v,start:e.target.value}))}/>
       </label>
       <label className="report-field"><span>پایان</span>
        <input type="time" required value={offer.end} disabled={inactive}
         onChange={e=>setOffer(v=>({...v,end:e.target.value}))}/>
       </label>
      </div>
      <div className="ow-work-pool-twofields">
       <label className="report-field"><span>ظرفیت این فرصت (حداکثر ۲)</span>
        <input type="number" required min="1" max="2" value={offer.capacity}
         disabled={inactive} onChange={e=>setOffer(v=>({...v,capacity:e.target.value}))}/>
       </label>
       <div className="report-field"><span>مهلت انتخاب (اختیاری)</span>
        <JalaliDatePicker value={offer.deadline} ariaLabel="مهلت انتخاب نوبت"
         onChange={date=>setOffer(v=>({...v,deadline:date}))} disabled={inactive}/>
       </div>
      </div>
      <p className="ow-muted">شروع و پایان باید با مدت الگو مطابقت داشته باشند. فرصت ابتدا پیش‌نویس است و پس از تأیید مدیر منتشر می‌شود.</p>
      <button type="submit" disabled={inactive} className="report-btn report-btn--primary">
       ساخت پیش‌نویس نوبت</button>
     </form>
    </details>
   </div>
   <div className="ow-work-pool-list">
    <h4>فرصت‌های نوبت کتابخانه ({fa.format(view.offers.length)})</h4>
    {!view.offers.length&&<p className="ow-muted">هنوز نوبتی منتشر یا تعریف نشده است.</p>}
    {view.offers.map(o=><article className="ow-work-pool-item" key={o.id}>
     <div className="ow-work-pool-item__top">
      <strong>{o.title}</strong><small>{labels[o.state]||o.state}</small>
     </div>
     <p>{nameDay(o.date)} · {prettyTime(o.start_minute)} تا {prettyTime(o.end_minute)}</p>
     <p>انتخاب‌شده از این فرصت: {fa.format(o.claimed_count)} نفر از {fa.format(o.capacity)} نفر</p>
     <p className="ow-muted">توجه: نوبت‌های واگذارشده مستقیم توسط مدیر نیز ظرفیت میز را مصرف می‌کنند.</p>
     <div className="ow-work-pool-item__actions">
      {['draft','paused'].includes(o.state)&&
       <button className="report-btn report-btn--primary" type="button"
        disabled={inactive} onClick={()=>change(o.id,'published')}>انتشار نوبت</button>}
      {o.state==='published'&&
       <button className="ow-mini-btn" type="button" disabled={inactive}
        onClick={()=>change(o.id,'paused')}>توقف انتخاب جدید</button>}
      {['published','paused'].includes(o.state)&&
       <button className="ow-mini-btn" type="button" disabled={inactive}
        onClick={()=>{setClosing(o.id);setReason('')}}>بستن فرصت</button>}
     </div>
     {closing===o.id&&<div className="ow-work-pool-close">
      <label className="report-field"><span>علت بستن نوبت (حداقل ۵ نویسه)</span>
       <input minLength={5} maxLength={500} value={reason} disabled={inactive}
        onChange={e=>setReason(e.target.value)}/></label>
      <div><button type="button" className="report-btn report-btn--primary"
        disabled={inactive||reason.trim().length<5}
        onClick={()=>change(o.id,'closed',reason.trim())}>تأیید بستن</button>
       <button type="button" className="ow-mini-btn" onClick={()=>setClosing('')}>انصراف</button>
      </div>
     </div>}
    </article>)}
   </div>
  </div>}
 </section>
}
