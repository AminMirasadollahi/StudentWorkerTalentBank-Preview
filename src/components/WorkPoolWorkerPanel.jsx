import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react'
// Hidden until D2A/D2B are safely installed; D1 remains untouched by default.
const deskPoolUIEnabled=import.meta.env?.VITE_SWTB21_DESK_POOL_UI!=='false'
const DeskWorkPoolWorkerSection=lazy(()=>import('./DeskWorkPoolWorkerSection'))
import {getWorkerWorkPool,claimWorkOpportunity} from '../lib/operationsV2'
import WorkerInfoHint from './WorkerInfoHint.jsx'

const fa=new Intl.NumberFormat('fa-IR')
const pretty=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium',timeZone:'UTC'})
const dateName=x=>x?pretty.format(new Date(x+'T12:00:00Z')):'—'
const units={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
export default function WorkPoolWorkerPanel({workerId,refreshRevision=0,onClaimed,onGuide}){
 const [view,setView]=useState({status:'loading',items:[]})
 const [busyId,setBusyId]=useState('')
 const [uncertainId,setUncertainId]=useState('')
 const [retryReady,setRetryReady]=useState(false)
 const [notice,setNotice]=useState('')
 const keys=useRef({workerId,requests:new Map()})
 if(keys.current.workerId!==workerId)
  keys.current={workerId,requests:new Map()}
 const inFlight=useRef(false)
 const seq=useRef(0)
 const load=useCallback(async()=>{
  const stamp=++seq.current
  setView({status:'loading',items:[]})
  try{
   const data=await getWorkerWorkPool()
   if(stamp!==seq.current)return
   if(data?.ok!==true||data.scope!=='worker_published_work_pool'
     ||!Array.isArray(data.opportunities))throw Error('invalid_worker_pool_response')
   // An authorized read must not silently discard an unresolved claim.
   setView({status:'ready',items:data.opportunities})
   return data.opportunities
  }catch{
   if(stamp===seq.current)setView({status:'error',items:[]})
   return null
  }
 },[])
 useEffect(()=>{void load();return()=>{seq.current+=1}},[load,workerId,refreshRevision])
 useEffect(()=>{
  // A reused worker panel must not carry another worker's pending notice.
  setUncertainId('');setRetryReady(false);setNotice('')
 },[workerId])
 const claim=async item=>{
  if(inFlight.current||view.status!=='ready'||item.claimable!==true||item.my_task_id
    ||uncertainId===item.id&&!retryReady)return
  if(!globalThis.crypto?.randomUUID){
   setNotice('امکان تولید شناسه امن درخواست وجود ندارد؛ انتخاب کار انجام نشد.')
   return
  }
  let requestId=keys.current.requests.get(item.id)
  if(!requestId){
   requestId=globalThis.crypto.randomUUID()
   keys.current.requests.set(item.id,requestId)
  }
  inFlight.current=true
  setBusyId(item.id);setNotice('')
  try{
   let receipt
   try{
    receipt=await claimWorkOpportunity({opportunityId:item.id,requestId})
    if(receipt?.ok!==true||typeof receipt?.task_id!=='string')
     throw Error('claim_not_confirmed')
   }catch{
    // ONLY a missing/invalid claim receipt is ambiguous. A later UI
    // navigation or read failure must not invalidate a confirmed receipt.
    if(keys.current.workerId===workerId){
     setUncertainId(item.id)
     setRetryReady(false)
     setNotice('نتیجه انتخاب مشخص نیست. ابتدا وضعیت را از سرور بازخوانی کنید؛ تا آن زمان تلاش مجدد غیرفعال است.')
    }
    return
   }
   if(keys.current.workerId!==workerId)return
   keys.current.requests.delete(item.id)
   setUncertainId('')
   setRetryReady(false)
   const freshOffers=await load()
   if(keys.current.workerId!==workerId)return
   setNotice(freshOffers===null
    ?'انتخاب کار در سرور تأیید شد، اما فهرست فرصت‌ها به‌روزرسانی نشد. نتیجه را در «کارهای من» بررسی کنید.'
    :receipt.replayed===true
     ?'انتخاب قبلی تأیید شد؛ وظیفه تکراری ساخته نشده است.'
     :'انتخاب کار ثبت شد. ثبت ساعت و تأیید نهایی، مراحل جداگانه‌اند.')
   try{
    await onClaimed?.(receipt.task_id)
   }catch{
    // The server already accepted this claim; a broken parent navigation
    // must NEVER re-enable an uncertain-claim retry or issue a new UUID.
    if(keys.current.workerId===workerId)
     setNotice('انتخاب کار در سرور تأیید شد، اما انتقال به «کارهای من» انجام نشد. این بخش را دستی باز کنید.')
   }
  }finally{
   inFlight.current=false
   if(keys.current.workerId===workerId)setBusyId('')
  }
 }
 const refresh=async()=>{
  const items=await load()
  if(!items||!uncertainId||keys.current.workerId!==workerId)return
  const offer=items.find(item=>item.id===uncertainId)
  if(offer?.my_task_id){
   keys.current.requests.delete(uncertainId)
   setUncertainId('')
   setRetryReady(false)
   setNotice('انتخاب قبلی شما در اطلاعات سرور تأیید شد؛ کار تکراری ایجاد نمی‌شود.')
   onClaimed?.(offer.my_task_id)
  }else{
   const mayRetry=offer?.claimable===true
   setRetryReady(mayRetry)
   setNotice(mayRetry
    ?'در بازخوانی فعلی، انتخاب قطعی دیده نشد؛ نتیجه اولیه همچنان ممکن است نامشخص باشد. در صورت نیاز فقط با همان شناسه قبلی تلاش کنید.'
    :'انتخاب قبلی هنوز تأیید نشده و این فرصت فعلاً قابل انتخاب نیست؛ بدون بررسی جدید دوباره درخواست ندهید.')
  }
 }
 const items=view.items.slice().sort((a,b)=>
  String(a.date).localeCompare(String(b.date))||
  Number(a.priority)-Number(b.priority))
 return <section className="report-panel ow-work-pool ow-worker-work-pool"
  data-swtb-guide="work-pool-list" aria-label="فرصت‌های کاری قابل انتخاب">
  <div className="report-panel-heading">
   <div className="ow-worker-title-inline"><h2>فرصت‌های کاری</h2>
    <WorkerInfoHint label="درباره انتخاب فرصت کاری"
      text="فقط فرصت‌های منتشرشده مدیر و متناسب با مجوز نیمسال، مهلت و ظرفیت قابل انتخاب‌اند. زمان تخمینی فرصت، ساعت تأییدشده نیست. "/>
   </div>
   <div className="ow-worker-pool-actions">
    <button type="button" className="swtb-guide-launch"
      data-swtb-guide="help-workPool" onClick={()=>onGuide?.('workPool')}>
      ؟ راهنمای این بخش
    </button>
    <button type="button" className="report-btn report-btn--light"
      disabled={busyId!==''} onClick={()=>void refresh()}>بازخوانی</button>
   </div>
  </div>
  
  {notice&&<div role="status" className={uncertainId?'report-alert report-alert--error':'ops-alert-success'}>{notice}</div>}
  {view.status==='loading'&&<p role="status" className="ow-muted">در حال دریافت فرصت‌های مجاز…</p>}
  {view.status==='error'&&<div role="alert" className="report-alert report-alert--error">
    دریافت فرصت‌ها موفق نبود؛ اطلاعات قبلی پنهان شده‌اند.
    <button type="button" className="ow-mini-btn" onClick={()=>void refresh()}>تلاش مجدد</button>
   </div>}
  {view.status==='ready'&&<>
   {!items.length&&<div className="ow-worker-empty" role="status">
     <strong>{deskPoolUIEnabled?'در حال حاضر فرصت عمومی منتشرشده‌ای وجود ندارد.':'در حال حاضر فرصت منتشرشده‌ای در این بازه وجود ندارد.'}</strong>
  
    </div>}
   <div className="ow-work-pool-worker-list">
    {items.map(item=><article className="ow-work-pool-item" key={item.id}>
     <div className="ow-work-pool-item__top">
      <h3>{item.title}</h3>
      <small>اولویت {fa.format(Number(item.priority||3))}</small>
     </div>
     <p>{item.description}</p>
     <div className="ow-work-pool-facts">
      <span>{units[item.unit]||item.unit}</span>
      <span>تاریخ انجام: {dateName(item.date)}</span>
      <span>زمان تخمینی: {fa.format(item.estimated_minutes)} دقیقه</span>
      <span>ظرفیت باقی‌مانده: {fa.format(item.remaining)} نفر</span>
      <span>مهلت انتخاب: {dateName(item.claim_deadline)}</span>
     </div>
     <div className="ow-work-pool-item__actions">
      {item.my_task_id?<span className="ow-work-pool-claimed">قبلاً توسط شما انتخاب شده</span>
       :item.claimable===true?<button type="button"
         className="report-btn report-btn--primary"
         disabled={busyId!==''||uncertainId===item.id}
         onClick={()=>void claim(item)}>
         {busyId===item.id?'در حال ثبت…':'انتخاب این کار'}</button>
       :<span className="ow-muted">فعلاً قابل انتخاب نیست؛ مجوز، مهلت یا ظرفیت را بررسی کنید.</span>}
     </div>
     {uncertainId===item.id&&<div className="ow-work-pool-uncertain">
       <p>ممکن است انتخاب شما ثبت شده باشد. پیش از اقدام دوباره، وضعیت را بازخوانی کنید.</p>
       <button type="button" className="ow-mini-btn" disabled={busyId!==''}
        onClick={()=>void refresh()}>بررسی وضعیت از سرور</button>
       <button type="button" className="ow-mini-btn" disabled={busyId!==''||!retryReady}
        onClick={()=>void claim(item)}>
        تلاش مجدد با همان شناسه</button>
      </div>}
    </article>)}
   </div>
  </>}
  {deskPoolUIEnabled&&<Suspense fallback={<p role="status">در حال آماده‌سازی نوبت‌های میز کتابخانه…</p>}>
    <DeskWorkPoolWorkerSection workerId={workerId} refreshRevision={refreshRevision}
      onClaimed={onClaimed}/>
  </Suspense>}
 </section>
}
