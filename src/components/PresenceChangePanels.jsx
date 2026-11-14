import {useEffect,useRef,useState} from 'react'
import {projectDayPresence} from '../lib/presenceDayProjection.mjs'
import {
  listPresenceChanges,cancelPresenceChange,reviewPresenceChange,
} from '../lib/presenceChangesApi.js'
import {
  workerPresenceItems,managerPresenceItems,
  PRESENCE_STATUS_TEXT,PRESENCE_ACTION_TEXT,
} from '../lib/presenceChanges.mjs'

const formatDate=value=>typeof value==='string'?value:''
const todayTehran=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',
 }).formatToParts(new Date())
 const field=name=>parts.find(p=>p.type===name)?.value||''
 return [field('year'),field('month'),field('day')].join('-')
}
const label=item=>item.action==='set_exception'
  ?(item.kind==='unavailable'?'درخواست عدم حضور':'درخواست تغییر ساعت حضور')
  :(PRESENCE_ACTION_TEXT[item.action]||'درخواست تغییر برنامه')
const stateLabel=status=>PRESENCE_STATUS_TEXT[status]||'وضعیت نامشخص'
const clock=n=>Number.isInteger(Number(n))&&Number(n)>=0&&Number(n)<=1440
  ?String(Math.floor(Number(n)/60)).padStart(2,'0')+':'+String(Number(n)%60).padStart(2,'0')
  :'نامعتبر'
const windowsText=windows=>Array.isArray(windows)&&windows.length
  ?windows.map(w=>clock(w.start??w.start_minute)+' تا '+clock(w.end??w.end_minute)).join('، ')
  :'بدون بازه حضور'
const desiredText=item=>item.action==='inherit_weekly'?'برداشتن استثنا و پیروی از برنامه ثابت هفتگی'
  :item.kind==='unavailable'?'عدم حضور در این روز'
  :'ساعات جایگزین: '+windowsText(item.intervals)
const effectiveText=actual=>actual.kind==='unknown'?'برنامه فعلی نامشخص است'
  :actual.kind==='unavailable'?'عدم حضور قبلاً ثبت شده است'
  :'ساعات مؤثر کنونی: '+windowsText(actual.windows)

export function WorkerPresenceRequests({workerId,revision=0,onEffectiveChange}) {
 const [items,setItems]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [busyId,setBusyId]=useState('')
 const version=useRef(0)
 const reload=async()=>{
   const v=++version.current
   setLoading(true);setError('')
   try{
     const response=await listPresenceChanges(workerId)
     const rows=response.scope==='manager'
       ?managerPresenceItems(response).filter(x=>x.worker_id===workerId)
       :workerPresenceItems(response,workerId)
     if(v===version.current)setItems(rows)
     return rows
   }catch(e){
     if(v===version.current){setItems([]);setError(e.message||'خواندن درخواست‌ها ناموفق بود.')}
     throw e
   }finally{if(v===version.current)setLoading(false)}
 }
 useEffect(()=>{
   const v=++version.current
   setItems([]);setLoading(true);setError('')
   void listPresenceChanges(workerId).then(response=>{
     const rows=response.scope==='manager'
       ?managerPresenceItems(response).filter(x=>x.worker_id===workerId)
       :workerPresenceItems(response,workerId)
     if(v===version.current)setItems(rows)
   }).catch(e=>{
     if(v===version.current){setItems([]);setError(e.message||'خواندن درخواست‌ها ناموفق بود.')}
   }).finally(()=>{if(v===version.current)setLoading(false)})
   return ()=>{++version.current}
 },[workerId,revision])
 const cancel=async item=>{
   if(busyId||!window.confirm('این درخواست هنوز تأیید نشده است. از ارسال آن منصرف می‌شوید؟'))return
   setBusyId(item.id);setError('')
   try{
     const receipt=await cancelPresenceChange(item.id)
     if(!receipt?.ok || receipt.status!=='cancelled')throw new Error('پاسخ لغو قابل تأیید نیست.')
     await reload()
     await onEffectiveChange?.()
   }catch(e){
     // Ambiguous network result: read server state first; no blind retry.
     try{await reload()}catch{}
     setError('نتیجه لغو قطعی نیست؛ فهرست را بازخوانی کنید. '+(e.message||''))
   }finally{setBusyId('')}
 }
 return <section className="report-panel swtb18-presence-requests" aria-label="پیگیری درخواست‌های تغییر برنامه حضور">
   <div className="report-panel-heading">
     <h3>درخواست‌های تغییر برنامه حضور</h3>
     <button type="button" className="report-btn report-btn--light"
       disabled={loading||!!busyId} onClick={()=>{void reload().catch(()=>{})}}>بازخوانی وضعیت</button>
   </div>
   <p className="ow-muted">درخواست در انتظار تأیید، برنامه مؤثر را تغییر نمی‌دهد؛ تأیید برنامه به‌معنای تأیید کارکرد یا ساعت پرداختی نیست.</p>
   {loading&&<p role="status">در حال دریافت درخواست‌های شما…</p>}
   {error&&<p role="alert" className="ow-warning">{error}</p>}
   {!loading&&!error&&items.length===0&&<p className="ow-muted">درخواستی ثبت نشده است.</p>}
   {!loading&&items.slice(0,30).map(item=><article className="ow-item" key={item.id}>
     <div className="ow-item-header"><strong>{label(item)} · {formatDate(item.local_date)}</strong>
       <span className="ow-status">{stateLabel(item.status)}</span></div>
     {item.status==='pending'&&<p className="ow-muted">این درخواست هنوز در برنامه حضور اعمال نشده است.</p>}
     {item.status==='pending'&&<button type="button" className="report-btn report-btn--light"
        disabled={!!busyId} onClick={()=>{void cancel(item)}}>انصراف از درخواست</button>}
   </article>)}
 </section>
}

export function ManagerPresenceReviewQueue({workers=[],tasks=[],data=null,revision=0,onEffectiveChange}) {
 const [items,setItems]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [busyId,setBusyId]=useState('')
 const [notes,setNotes]=useState({})
 const [retrospective,setRetrospective]=useState({})
 const seq=useRef(0)
 const reload=async()=>{
   const v=++seq.current
   setLoading(true);setError('')
   try{
     const response=await listPresenceChanges(null,true)
     const rows=managerPresenceItems(response).filter(item=>item.status==='pending')
     if(v===seq.current)setItems(rows)
     return rows
   }catch(e){
     if(v===seq.current){setItems([]);setError(e.message||'صف بررسی قابل دریافت نیست.')}
     throw e
   }finally{if(v===seq.current)setLoading(false)}
 }
 useEffect(()=>{
   const v=++seq.current
   setLoading(true);setItems([]);setError('')
   void listPresenceChanges(null,true).then(response=>{
     const rows=managerPresenceItems(response).filter(x=>x.status==='pending')
     if(v===seq.current)setItems(rows)
   }).catch(e=>{if(v===seq.current){setItems([]);setError(e.message||'صف در دسترس نیست.')}})
     .finally(()=>{if(v===seq.current)setLoading(false)})
   return ()=>{++seq.current}
 },[revision])
 const review=async(item,decision)=>{
   if(busyId)return
   const note=(notes[item.id]||'').trim()
   const oldDate=item.local_date<todayTehran()
   if(decision==='approve'&&oldDate&&(!retrospective[item.id]||note.length<10)){
     setError('برای تأیید گذشته‌نگر، گزینه مربوط و توضیح دست‌کم ۱۰ کاراکتری لازم است.')
     return
   }
   if(!window.confirm(decision==='approve'
      ?'تأیید، برنامه مؤثر این روز را تغییر می‌دهد؛ ساعات کار را تأیید نمی‌کند. ادامه می‌دهید؟'
      :'این درخواست بدون تغییر برنامه مؤثر رد شود؟'))return
   setBusyId(item.id);setError('')
   try{
     const reply=await reviewPresenceChange({
       requestId:item.id,decision,note,allowRetrospective:Boolean(retrospective[item.id]),
     })
     if(reply.status!==(decision==='approve'?'approved':'rejected'))
       throw new Error('رسید تصمیم با وضعیت مورد انتظار مطابقت ندارد.')
     await onEffectiveChange?.()
     await reload()
   }catch(e){
     // If the operation committed but refresh failed, never invite blind retry.
     try{await reload()}catch{}
     setError('نتیجه تصمیم یا بازخوانی قطعی نیست. پیش از اقدام مجدد وضعیت را بررسی کنید. '+(e.message||''))
   }finally{setBusyId('')}
 }
 return <section className="report-panel swtb18-presence-review" aria-label="کارتابل درخواست‌های تغییر حضور">
   <div className="report-panel-heading">
     <h3>درخواست‌های تغییر برنامه حضور</h3>
     <button type="button" className="report-btn report-btn--light"
       disabled={loading||!!busyId} onClick={()=>{void reload().catch(()=>{})}}>بازخوانی صف</button>
   </div>
   <p className="ow-muted">این صف مستقل از بررسی گزارش ساعت است. تأیید برنامه، کار انجام‌شده یا مبلغ قابل پرداخت را تأیید نمی‌کند.</p>
   {loading&&<p role="status">در حال دریافت صف مدیر…</p>}
   {error&&<p role="alert" className="ow-warning">{error}</p>}
   {!loading&&!error&&items.length===0&&<p className="ow-muted">درخواست حضور منتظر تأیید وجود ندارد.</p>}
   {!loading&&items.map(item=>{
     const worker=workers.find(w=>w.id===item.worker_id)
     const oldDate=item.local_date<todayTehran()
     const plannedTasks=tasks.filter(t=>t.worker_id===item.worker_id&&t.planned_date===item.local_date)
     const effective=projectDayPresence(data||{},item.worker_id,item.local_date)
     return <article className="ow-item" key={item.id}>
       <div className="ow-item-header">
         <strong>{worker?.name||'دانشجوکار مجاز'} · {formatDate(item.local_date)}</strong>
         <span className="ow-status">در انتظار تأیید</span>
       </div>
       <p>{label(item)}</p>
       <p><strong>برنامه مؤثر فعلی: </strong>{effectiveText(effective)}</p>
       <p><strong>تغییر درخواستی: </strong>{desiredText(item)}</p>
       <p className="ow-muted">ثبت درخواست: {item.requested_at||'ثبت شده در سرور'}</p>
       <p><strong>دلیل دانشجوکار: </strong>{item.reason||'ثبت نشده'}</p>
       {item.worker_note&&<p><strong>یادداشت برنامه: </strong>{item.worker_note}</p>}
       {plannedTasks.length>0&&<p className="ow-warning" role="status">
         در این تاریخ {plannedTasks.length} کار ثبت‌شده وجود دارد؛ تأیید تغییر حضور آن‌ها را لغو نمی‌کند.
       </p>}
       {oldDate&&<label className="report-field">
         <span><input type="checkbox" checked={Boolean(retrospective[item.id])}
           disabled={!!busyId} onChange={e=>setRetrospective(x=>({...x,[item.id]:e.target.checked}))}/>
           {' '}تأیید گذشته‌نگر پس از پایان روز را صریحاً می‌پذیرم</span>
       </label>}
       <label className="report-field">
         <span>توضیح تصمیم مدیر{oldDate?' (برای تأیید، اجباری)':''}</span>
         <input type="text" maxLength={500} disabled={!!busyId}
           value={notes[item.id]||''} onChange={e=>setNotes(x=>({...x,[item.id]:e.target.value}))}/>
       </label>
       <div className="ow-presence-review-actions">
         <button type="button" className="report-btn report-btn--primary"
           disabled={!!busyId} onClick={()=>{void review(item,'approve')}}>تأیید تغییر</button>
         <button type="button" className="report-btn report-btn--light"
           disabled={!!busyId} onClick={()=>{void review(item,'reject')}}>رد درخواست</button>
       </div>
     </article>
   })}
 </section>
}
