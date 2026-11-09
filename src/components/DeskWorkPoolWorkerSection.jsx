import {useCallback,useEffect,useRef,useState} from 'react'
import {claimDeskWorkOffer,getWorkerDeskWorkPool} from '../lib/operationsV2'

const fa=new Intl.NumberFormat('fa-IR')
const dayFa=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium',timeZone:'UTC'})
const dayName=date=>date?dayFa.format(new Date(date+'T12:00:00Z')):'—'
const timeName=min=>String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0')

export default function DeskWorkPoolWorkerSection({
 workerId,refreshRevision=0,onClaimed,
}){
 const [snapshot,setSnapshot]=useState({status:'loading',offers:[]})
 const [busy,setBusy]=useState(false)
 const [uncertainId,setUncertainId]=useState('')
 const [retryReady,setRetryReady]=useState(false)
 const [notice,setNotice]=useState('')
 const seq=useRef(0)
 const pending=useRef(false)
 const requestKeys=useRef({workerId,ids:new Map()})
 if(requestKeys.current.workerId!==workerId){
  requestKeys.current={workerId,ids:new Map()}
 }
 const read=useCallback(async()=>{
  const i=++seq.current
  setSnapshot({status:'loading',offers:[]})
  try{
   const reply=await getWorkerDeskWorkPool()
   if(seq.current!==i)return false
   if(reply?.ok!==true||reply.scope!=='worker_desk_offers'
     ||!Array.isArray(reply.offers))throw Error('unexpected_desk_pool_read')
   // Refuse unexpected server leakage before rendering peer/sensitive fields.
   const safe=reply.offers.map(o=>{
    if(typeof o.id!=='string'||typeof o.title!=='string'
      ||typeof o.description!=='string'
      ||typeof o.claimable!=='boolean')throw Error('unexpected_desk_item')
    return {
     id:o.id,date:o.date,start_minute:o.start_minute,
     end_minute:o.end_minute,deadline:o.deadline,
     title:o.title,description:o.description,priority:o.priority,
     remaining_offer:o.remaining_offer,
     remaining_global_desk:o.remaining_global_desk,
     remaining_effective:o.remaining_effective,
     my_task_id:o.my_task_id,claimable:o.claimable,
    }
   })
   setSnapshot({status:'ready',offers:safe})
   return safe
  }catch{
   if(seq.current===i)setSnapshot({status:'error',offers:[]})
   return false
  }
 },[])
 useEffect(()=>{
  void read()
  return ()=>{seq.current+=1}
 },[read,workerId,refreshRevision])
 useEffect(()=>{
  // An unresolved receipt belongs only to the worker who initiated it.
  setUncertainId('');setRetryReady(false);setNotice('')
 },[workerId])
 const refresh=async()=>{
  const items=await read()
  if(!items||requestKeys.current.workerId!==workerId)return
  if(uncertainId){
   const offer=items.find(x=>x.id===uncertainId)
   if(offer?.my_task_id){
    requestKeys.current.ids.delete(uncertainId)
    setUncertainId('')
    setRetryReady(false)
    setNotice('رزرو قبلی شما از سرور تأیید شد.')
   }else{
    setRetryReady(Boolean(offer?.claimable))
    setNotice(offer?.claimable
     ?'رزرو قبلی تأیید نشده است. در صورت نیاز می‌توانید فقط با همان شناسه قبلی دوباره تلاش کنید.'
     :'نوبت دیگر قابل انتخاب نیست. از اقدام تکراری خودداری کنید.')
   }
  }
 }
 const claim=async o=>{
  if(pending.current||snapshot.status!=='ready'||o.claimable!==true
   ||o.my_task_id||uncertainId&&(uncertainId!==o.id||!retryReady))return
  if(!globalThis.crypto?.randomUUID){
   setNotice('تولید شناسه امن درخواست در مرورگر ممکن نیست؛ هیچ رزروی ارسال نشد.')
   return
  }
  let requestId=requestKeys.current.ids.get(o.id)
  if(!requestId){
   requestId=globalThis.crypto.randomUUID()
   requestKeys.current.ids.set(o.id,requestId)
  }
  pending.current=true
  setBusy(true);setNotice('')
  try{
   let reply
   try{
    reply=await claimDeskWorkOffer({offerId:o.id,requestId})
    if(reply?.ok!==true||typeof reply.task_id!=='string'
       ||typeof reply.shift_id!=='string')throw Error('desk_claim_unconfirmed')
   }catch{
    // Only claim transport/receipt errors can make the outcome unknown.
    // A later read or navigation error cannot undo a confirmed reservation.
    if(requestKeys.current.workerId===workerId){
     setUncertainId(o.id)
     setRetryReady(false)
     setNotice('نتیجه رزرو مشخص نیست. ابتدا اطلاعات سرور را بازخوانی کنید؛ تا آن زمان رزرو دوباره مجاز نیست.')
    }
    return
   }
   if(requestKeys.current.workerId!==workerId)return
   requestKeys.current.ids.delete(o.id)
   setUncertainId('')
   setRetryReady(false)
   const refreshed=await read()
   if(requestKeys.current.workerId!==workerId)return
   setNotice(refreshed===false
    ?'رزرو نوبت در سرور تأیید شد، اما دریافت فهرست تازه موفق نبود. نتیجه را در «کارهای من» بررسی کنید.'
    :reply.replayed
     ?'رزرو قبلی تأیید شد؛ نوبت یا وظیفه تکراری ایجاد نشده است.'
     :'رزرو نوبت ثبت شد. ساعات انجام کار باید بعداً ثبت و توسط مدیر تأیید شوند.')
   try{
    await onClaimed?.(reply.task_id)
   }catch{
    if(requestKeys.current.workerId===workerId)
     setNotice('رزرو نوبت در سرور تأیید شد، اما انتقال به «کارهای من» انجام نشد. این بخش را دستی باز کنید.')
   }
  }finally{
   pending.current=false
   setBusy(false)
  }
 }
 return <section className="ow-desk-pool-block" aria-label="نوبت‌های کتابخانه برای انتخاب">
  <div className="ow-desk-pool-heading">
   <div><h3>نوبت‌های میز کتابخانه</h3>
    <p className="ow-muted">این نوبت‌ها زمان مشخص دارند. ظرفیت باقی‌مانده با لحاظ نوبت‌های ثبت‌شده توسط مدیر محاسبه می‌شود.</p>
   </div>
   <button type="button" className="ow-mini-btn"
    disabled={busy} onClick={()=>void refresh()}>بازخوانی نوبت‌ها</button>
  </div>
  <p className="ow-compact-hint">رزرو نوبت به‌معنای حضور قطعی یا ساعت تأییدشده نیست. تنها نوبت خودتان را می‌توانید انتخاب کنید.</p>
  {notice&&<p className={uncertainId?'report-alert report-alert--error':'ops-alert-success'}
   role={uncertainId?'alert':'status'}>{notice}</p>}
  {snapshot.status==='loading'&&<p role="status">در حال دریافت نوبت‌های امن…</p>}
  {snapshot.status==='error'&&<div role="alert" className="report-alert report-alert--error">
   دریافت نوبت‌های کتابخانه موفق نبود؛ داده‌های قبلی پنهان شدند.
  </div>}
  {snapshot.status==='ready'&&<div className="ow-work-pool-worker-list">
   {!snapshot.offers.length&&<p className="ow-muted">نوبت منتشرشده‌ای در این بازه وجود ندارد.</p>}
   {snapshot.offers.map(o=><article className="ow-work-pool-item" key={o.id}>
    <div className="ow-work-pool-item__top">
     <h4>{o.title}</h4><small>اولویت {fa.format(o.priority||3)}</small>
    </div>
    <p>{o.description}</p>
    <div className="ow-work-pool-facts">
     <span>{dayName(o.date)}</span>
     <span>{timeName(o.start_minute)} تا {timeName(o.end_minute)}</span>
     <span>جای خالی واقعی: {fa.format(Math.max(0,o.remaining_effective))} نفر</span>
     <span>ظرفیت فرصت: {fa.format(Math.max(0,o.remaining_offer))} نفر</span>
     <span>ظرفیت کلی میز: {fa.format(Math.max(0,o.remaining_global_desk))} نفر</span>
     <span>مهلت انتخاب: {dayName(o.deadline)}</span>
    </div>
    <div className="ow-work-pool-item__actions">
     {o.my_task_id?<span className="ow-work-pool-claimed">این نوبت قبلاً توسط شما رزرو شده است.</span>
      :o.claimable===true?<button type="button"
        className="report-btn report-btn--primary"
        disabled={busy||uncertainId===o.id}
        onClick={()=>void claim(o)}>
        {busy?'در حال بررسی رزرو…':'انتخاب این نوبت'}</button>
      :<span className="ow-muted">رزرو این نوبت فعلاً مجاز نیست؛ مجوز، تداخل زمانی یا ظرفیت را بررسی کنید.</span>}
    </div>
    {uncertainId===o.id&&<div className="ow-work-pool-uncertain">
     <button type="button" className="ow-mini-btn" disabled={busy}
      onClick={()=>void refresh()}>بررسی نتیجه از سرور</button>
     <button type="button" className="ow-mini-btn" disabled={busy||!retryReady}
      onClick={()=>{setRetryReady(false);void claim(o)}}>
      تلاش مجدد با همان شناسه</button>
    </div>}
   </article>)}
  </div>}
 </section>
}
