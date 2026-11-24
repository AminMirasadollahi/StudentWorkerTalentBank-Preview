import {lazy,Suspense,useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react'
import JalaliDatePicker from './JalaliDatePicker'
import {getWorkerUnifiedWorkPool,claimUnifiedWorkShare,
 claimWorkOpportunity} from '../lib/operationsV2'
import {addDays,durationFa,selectedDayAllowed,shareOptions,todayTehran}
 from '../lib/workPoolUnifiedV1.mjs'
import '../work-pool-unified.css'

const deskEnabled=import.meta.env?.VITE_SWTB21_DESK_POOL_UI!=='false'
const DeskWorkPoolWorkerSection=lazy(()=>import('./DeskWorkPoolWorkerSection'))
const nf=new Intl.NumberFormat('fa-IR')
const units={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const faDate=x=>x?new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
 dateStyle:'medium',timeZone:'UTC'}).format(new Date(x+'T12:00:00Z')):'—'
const pickDate=item=>Array.isArray(item.available_dates)&&item.available_dates.length
 ?item.available_dates[0]
 :(item.date<addDays(todayTehran(),2)?addDays(todayTehran(),2):item.date)

export default function UnifiedWorkWorkerPanel({
 workerId,refreshRevision=0,onClaimed,onGuide,active=true,authorized=true,
}){
 const [view,setView]=useState({status:'loading',offers:[]})
 const [dates,setDates]=useState({})
 const [shares,setShares]=useState({})
 const [busyId,setBusyId]=useState('')
 const [uncertainId,setUncertainId]=useState('')
 const [retryReady,setRetryReady]=useState(false)
 const [notice,setNotice]=useState('')
 const [inspectedId,setInspectedId]=useState('')
 const inspectorRef=useRef(null)
 const inspectorTrigger=useRef(null)
 const requests=useRef({workerId,items:new Map()})
 if(requests.current.workerId!==workerId){
  requests.current={workerId,items:new Map()}
 }
 const inFlight=useRef(false)
 const alive=useRef(false)
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const readSeq=useRef(0)
 const authorizedRef=useRef(authorized)
 useLayoutEffect(()=>{
  authorizedRef.current=authorized
  if(!authorized){
   readSeq.current+=1
   setView({status:'loading',offers:[]})
   setRetryReady(false)
  }
 },[authorized])
 const read=useCallback(async()=>{
  if(!alive.current||!authorizedRef.current)return null
  const index=++readSeq.current
  setView(v=>({...v,status:'loading'}))
  try{
   const data=await getWorkerUnifiedWorkPool()
   if(index!==readSeq.current)return null
   if(data?.ok!==true||data.scope!=='worker_published_work_pool'
    ||!Array.isArray(data.opportunities))throw Error('invalid_worker_pool_v1')
   const offers=data.opportunities.filter(x=>
    typeof x.id==='string'&&typeof x.title==='string'
    &&typeof x.description==='string'&&typeof x.claimable==='boolean')
   setView({status:'ready',offers})
   return offers
  }catch{
   if(index===readSeq.current)setView({status:'error',offers:[]})
   return null
  }
 },[])
 useEffect(()=>{if(active&&authorized)void read();return()=>{readSeq.current+=1}},[read,workerId,refreshRevision,active,authorized])
 useEffect(()=>{
  setDates({});setShares({})
  setUncertainId('');setRetryReady(false);setNotice('');setInspectedId('')
 },[workerId])
 const claim=async(item,retry=false)=>{
  if(!active||!authorizedRef.current||!alive.current||inFlight.current||view.status!=='ready'||item.claimable!==true||item.my_task_id
    ||uncertainId&&(uncertainId!==item.id||!retryReady)
    ||retryReady&&!retry)return
  if(!globalThis.crypto?.randomUUID){
   setNotice('امکان ایجاد شناسه امن درخواست وجود ندارد؛ انتخاب انجام نشد.')
   return
  }
  const legacy=item.allocation_mode==='legacy'
  const date=legacy?item.date:(dates[item.id]||pickDate(item))
  const choices=shareOptions(item)
  const requested=legacy?Number(item.estimated_minutes)
   :item.allocation_mode==='fixed'?choices[0]:Number(shares[item.id]||choices[0])
  if((!legacy&&!selectedDayAllowed(date,item))||
    (!legacy&&!choices.includes(requested))){
   setNotice('روز یا سهم زمانی انتخاب‌شده معتبر نیست؛ گزینه‌های مجاز را بررسی کنید.')
   return
  }
  const prior=requests.current.items.get(item.id)
  if(retry&&(!prior||prior.date!==date||prior.minutes!==requested))return
  const requestId=prior?.requestId||globalThis.crypto.randomUUID()
  if(prior&&!retry&&(prior.date!==date||prior.minutes!==requested))return
  requests.current.items.set(item.id,{requestId,date,minutes:requested})
  inFlight.current=true;setBusyId(item.id);setNotice('')
  let receipt
  try{
   receipt=legacy
    ?await claimWorkOpportunity({opportunityId:item.id,requestId})
    :await claimUnifiedWorkShare({opportunityId:item.id,requestId,
      date,minutes:requested})
   if(receipt?.ok!==true||typeof receipt.task_id!=='string')
    throw Error('claim_receipt_not_verified')
  }catch{
   if(alive.current&&requests.current.workerId===workerId){
    setUncertainId(item.id);setRetryReady(false)
    setNotice('نتیجه انتخاب نامشخص است. ابتدا وضعیت را از سرور بازخوانی کنید؛ تلاش مجدد تا آن زمان غیرفعال است.')
   }
   inFlight.current=false
   if(alive.current&&requests.current.workerId===workerId)setBusyId('')
   return
  }
  // A successful claim remains valid even if reloading the list or
  // navigation fails after the server commit.
  if(alive.current&&requests.current.workerId===workerId){
   requests.current.items.delete(item.id)
   setUncertainId('');setRetryReady(false)
   setNotice(receipt.replayed
    ?'انتخاب قبلی تأیید شد؛ کار تکراری ساخته نشده است.'
    :'سهم کار به شما واگذار شد. ساعت واقعی باید بعداً گزارش و تأیید شود.')
   await read()
   if(alive.current&&requests.current.workerId===workerId){
    try{await onClaimed?.(receipt.task_id)}
    catch{setNotice('انتخاب در سرور ثبت شد، اما جابه‌جایی صفحه انجام نشد؛ «کارهای من» را باز کنید.')}
   }
  }
  inFlight.current=false
  if(alive.current&&requests.current.workerId===workerId)setBusyId('')
 }
 const refresh=async()=>{
  const items=await read()
  if(!alive.current||!items||!uncertainId||requests.current.workerId!==workerId)return
  const offer=items.find(x=>x.id===uncertainId)
  if(offer?.my_task_id){
   requests.current.items.delete(uncertainId)
   setUncertainId('');setRetryReady(false)
   setNotice('انتخاب قبلی با بازخوانی سرور تأیید شد؛ وظیفه جدید ایجاد نمی‌شود.')
   try{await onClaimed?.(offer.my_task_id)}
   catch{setNotice('انتخاب ثبت شده است؛ برای مشاهده آن به «کارهای من» بروید.')}
  }else{
   setRetryReady(offer?.claimable===true)
   setNotice(offer?.claimable
    ?'در فهرست جدید انتخابی دیده نشد. در صورت نیاز فقط با همان شناسه قبلی تلاش کنید.'
    :'انتخاب قبلی هنوز تأیید نشده و فرصت فعلاً قابل انتخاب نیست. دوباره درخواست ندهید.')
  }
 }
 const ordered=view.offers.slice().sort((a,b)=>
  String(a.date).localeCompare(String(b.date))||Number(a.priority)-Number(b.priority))
 const inspected=authorized&&active&&view.status==='ready'?ordered.find(item=>item.id===inspectedId):null
 useEffect(()=>{
  if(inspected)inspectorRef.current?.focus({preventScroll:true})
 },[inspected?.id,view.status])
 useEffect(()=>{
  if(!inspected)return
  const onKey=event=>{
   if(event.key!=='Escape'||document.querySelector('dialog[open]'))return
   event.preventDefault()
   setInspectedId('')
   inspectorTrigger.current?.focus({preventScroll:true})
  }
  document.addEventListener('keydown',onKey)
  return()=>document.removeEventListener('keydown',onKey)
 },[inspected?.id])
 return <section className="swtb19-unified-work swtb19-unified-work--worker"
  aria-label="فرصت‌های کاری قابل انتخاب" data-swtb-guide="work-pool-list" hidden={!authorized}>
  {authorized&&<>
  <div className="swtb19-unified-work__toolbar">
   <div><h2>فرصت‌های همکاری</h2>
    <p>کار موردنظر را انتخاب کنید. زمان درج‌شده سهم تخمینی است، نه ساعت تأییدشده.</p>
   </div>
   <div className="swtb19-unified-work__actions">
    <button type="button" className="ow-mini-btn" data-swtb-guide="help-workPool" onClick={()=>onGuide?.('workPool')}>
     ؟ راهنمای این بخش</button>
    <button type="button" className="report-btn report-btn--light"
     disabled={busyId!==''} onClick={()=>void refresh()}>بازخوانی</button>
   </div>
  </div>
  {notice&&<div role={uncertainId?'alert':'status'}
    className={uncertainId?'report-alert report-alert--error':'ops-alert-success'}>{notice}</div>}
  {view.status==='loading'&&<p role="status">در حال دریافت فرصت‌های مجاز…</p>}
  {view.status==='error'&&<p role="alert">خواندن فرصت‌ها موفق نبود؛ اطلاعات قبلی پنهان شدند.</p>}
  {view.status==='ready'&&<div className={'swtb19-unified-work__directory'+(inspected?' is-inspecting':'')}>
   <div className="swtb19-unified-work__list">
   {!ordered.length&&<p className="ow-work-pool-empty">در حال حاضر فرصتی برای انتخاب منتشر نشده است.</p>}
   {ordered.map(item=>{
    const legacy=item.allocation_mode==='legacy'
    const date=legacy?item.date:(dates[item.id]||pickDate(item))
    const options=shareOptions(item)
    const share=item.allocation_mode==='fixed'?options[0]
      :Number(shares[item.id]||options[0])
    const blocked=busyId!==''||uncertainId===item.id||item.claimable!==true
    return <article key={item.id} className="ow-work-pool-item">
     <div className="ow-work-pool-item__top">
      <h3>{item.title}</h3>
      <small>{units[item.unit]||item.unit}</small>
     </div>
     <p className="swtb19-unified-work__excerpt">{item.description}</p>
     <div className="swtb19-unified-work__facts">
      <span>زمان انجام: {faDate(item.date)}
       {item.end_date&&item.end_date!==item.date?' تا '+faDate(item.end_date):''}</span>
      <span>{legacy?'زمان هر نفر: '+durationFa(item.estimated_minutes)
       :'حجم باقی‌مانده: '+durationFa(item.remaining_minutes)}</span>
      <span>مهلت انتخاب: {faDate(item.claim_deadline)}</span>
      {legacy&&<span>جای خالی: {nf.format(item.remaining)} نفر</span>}
     </div>
     {!legacy&&!item.my_task_id&&<div className="swtb19-unified-work__two">
      {item.end_date&&item.end_date!==item.date&&<div className="report-field">
       <span>روز انجام سهم شما</span>
       <JalaliDatePicker value={date} disabled={blocked}
        min={pickDate(item)} max={item.end_date}
        allowedDates={item.available_dates}
        onChange={x=>{setDates(p=>({...p,[item.id]:x}));
         requests.current.items.delete(item.id)}}
        ariaLabel="انتخاب روز انجام سهم"/></div>}
      <div className="report-field"><span>سهم زمانی شما</span>
       {item.allocation_mode==='choice'
        ?<select value={options.includes(share)?share:''} disabled={blocked}
          onChange={e=>{setShares(p=>({...p,[item.id]:e.target.value}));
           requests.current.items.delete(item.id)}}>
          {options.map(n=><option value={n} key={n}>{durationFa(n)}</option>)}
         </select>
        :<strong className="swtb19-unified-work__share">{durationFa(options[0])}</strong>}
      </div>
     </div>}
     <div className="ow-work-pool-item__actions">
      <button type="button" className="ow-mini-btn swtb19-unified-work__inspect"
       aria-expanded={inspectedId===item.id} aria-controls="swtb19-worker-inspector"
       onClick={event=>{
        if(inspectedId===item.id){setInspectedId('');return}
        inspectorTrigger.current=event.currentTarget
        setInspectedId(item.id)
       }}>مشاهده جزئیات</button>
      {item.my_task_id?<span className="ow-work-pool-claimed">این کار قبلاً توسط شما انتخاب شده است.</span>
      :item.claimable===true?<button type="button"
       className="report-btn report-btn--primary" disabled={blocked}
       onClick={()=>void claim(item)}>
       {busyId===item.id?'در حال ثبت…':'انتخاب این کار'}</button>
      :<span className="ow-muted">فعلاً قابل انتخاب نیست؛ مهلت، ظرفیت یا مجوز نیمسال را بررسی کنید.</span>}
     </div>
     {uncertainId===item.id&&<div className="ow-work-pool-uncertain">
      <p>ممکن است انتخاب در سرور ثبت شده باشد. ابتدا وضعیت را بررسی کنید.</p>
      <button type="button" className="ow-mini-btn" disabled={busyId!==''}
       onClick={()=>void refresh()}>بررسی نتیجه از سرور</button>
      <button type="button" className="ow-mini-btn" disabled={busyId!==''||!retryReady}
       onClick={()=>void claim(item,true)}>تلاش مجدد با همان شناسه</button>
     </div>}
    </article>
   })}
   </div>
   {inspected&&<aside id="swtb19-worker-inspector" ref={inspectorRef}
    className="swtb19-unified-work__inspector" aria-label="جزئیات فرصت همکاری"
    tabIndex={-1}>
    <div className="swtb19-unified-work__inspector-heading">
     <h3>جزئیات فرصت کاری</h3>
     <button type="button" className="ow-mini-btn"
      onClick={()=>{setInspectedId('');inspectorTrigger.current?.focus({preventScroll:true})}}>
      بستن</button>
    </div>
    <h4 className="swtb19-unified-work__detail-title">{inspected.title}</h4>
    <section className="swtb19-unified-work__detail-section">
     <h5>شرح کامل کار</h5>
     <p className="swtb19-unified-work__full-description">{inspected.description}</p>
    </section>
    <dl className="swtb19-unified-work__detail-facts">
     <div><dt>واحد کار</dt><dd>{units[inspected.unit]||inspected.unit}</dd></div>
     <div><dt>زمان انجام</dt><dd>{faDate(inspected.date)}
      {inspected.end_date&&inspected.end_date!==inspected.date?' تا '+faDate(inspected.end_date):''}</dd></div>
     <div><dt>مهلت انتخاب</dt><dd>{faDate(inspected.claim_deadline)}</dd></div>
     <div><dt>حجم باقی‌مانده کار</dt><dd>{inspected.allocation_mode==='legacy'
      ?durationFa(inspected.estimated_minutes):durationFa(inspected.remaining_minutes)}</dd></div>
     {inspected.allocation_mode==='legacy'&&
      <div><dt>جای خالی</dt><dd>{nf.format(inspected.remaining)} نفر</dd></div>}
    </dl>
    <p className="ow-muted swtb19-unified-work__detail-note">
     برای انتخاب روز و سهم زمانی، از همان کارت فرصت استفاده کنید. سهم انتخابی تخمینی است؛ ساعت واقعی پس از گزارش و تأیید مدیر منظور می‌شود.
    </p>
   </aside>}
  </div>}
  </>}
  {deskEnabled&&<Suspense fallback={authorized&&active?<p role="status">در حال آماده‌سازی نوبت‌های میز کتابخانه…</p>:null}>
   <DeskWorkPoolWorkerSection workerId={workerId} refreshRevision={refreshRevision}
    onClaimed={onClaimed} active={active} authorized={authorized}/>
  </Suspense>}
 </section>
}
