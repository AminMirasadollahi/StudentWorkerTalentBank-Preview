import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react'
const DeskWorkPoolManagerSection=lazy(()=>import('./DeskWorkPoolManagerSection'))
import JalaliDatePicker from './JalaliDatePicker'
import {getOperationsTermDashboard,getManagerUnifiedWorkPool,
 createUnifiedWorkPackage,setWorkOpportunityState} from '../lib/operationsV2'
import {addDays,durationFa,todayTehran,workPackagePayload} from '../lib/workPoolUnifiedV1.mjs'
import '../work-pool-unified.css'

const nf=new Intl.NumberFormat('fa-IR')
const labels={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const states={draft:'پیش‌نویس',published:'منتشرشده',paused:'متوقف‌شده',closed:'بسته‌شده'}
const initial=()=>({
 unit:'library',title:'',description:'',instructions:'',totalMinutes:'60',
 dateMode:'single',startDate:addDays(todayTehran(),7),endDate:addDays(todayTehran(),7),
 allocationMode:'fixed',shareMinutes:'60',minShareMinutes:'30',
 maxShareMinutes:'120',shareStepMinutes:'30',maxPeople:'',
 priority:'3',claimDeadline:'',
})
const faDate=x=>x?new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
 dateStyle:'medium',timeZone:'UTC'}).format(new Date(x+'T12:00:00Z')):'—'

export default function UnifiedWorkManagerPanel({refreshRevision=0}){
 const [form,setForm]=useState(initial)
 const [view,setView]=useState({status:'loading',terms:[],templates:[],offers:[]})
 const [termSelection,setTermSelection]=useState('')
 const [open,setOpen]=useState(false)
 const [deskMode,setDeskMode]=useState(false)
 const [deskVisited,setDeskVisited]=useState(false)
 const [notice,setNotice]=useState('')
 const [uncertain,setUncertain]=useState(false)
 const [retryReady,setRetryReady]=useState(false)
 const [busy,setBusy]=useState(false)
 const [revision,setRevision]=useState(0)
 const [closeId,setCloseId]=useState('')
 const [closeReason,setCloseReason]=useState('')
 const [inspectedId,setInspectedId]=useState('')
 const inspectorRef=useRef(null)
 const inspectorTrigger=useRef(null)
 const pending=useRef(null)
 const inFlight=useRef(false)
 const requestSerial=useRef(0)
 const load=useCallback(async()=>{
  const serial=++requestSerial.current
  setView(v=>({...v,status:'loading'}))
  try{
   const now=todayTehran()
   const [terms,offers]=await Promise.all([
    getOperationsTermDashboard(),
    getManagerUnifiedWorkPool({from:now,to:addDays(now,90)}),
   ])
   if(serial!==requestSerial.current)return null
   if(terms?.ok!==true||!Array.isArray(terms.terms)
    ||offers?.ok!==true||!Array.isArray(offers.templates)
    ||!Array.isArray(offers.opportunities))throw Error('invalid_manager_pool_v1')
   const snapshot={status:'ready',terms:terms.terms,templates:offers.templates,
    offers:offers.opportunities}
   setView(snapshot)
   return snapshot
  }catch{
   if(serial===requestSerial.current)setView(v=>({...v,status:'error'}))
   return null
  }
 },[])
 useEffect(()=>{void load();return()=>{requestSerial.current+=1}},[load,revision,refreshRevision])
 const activeTerms=view.terms.filter(x=>x.state==='active')
 const term=activeTerms.find(x=>x.id===termSelection)||activeTerms[0]
 const setField=(name,value)=>setForm(p=>({...p,[name]:value}))
 const preview=useMemo(()=>{
  if(!term)return {error:'هیچ نیمسال فعالی برای انتشار وجود ندارد.'}
  try{return workPackagePayload(form,term.id,todayTehran(),term)}
  catch(e){return {error:e.message}}
 },[form,term])
 const hasUnresolved=uncertain||retryReady
 const disabled=busy||hasUnresolved||view.status!=='ready'
 const create=async(publish,retry=false)=>{
  if(inFlight.current||view.status!=='ready'||uncertain||!globalThis.crypto?.randomUUID)return
  let resolved
  try{resolved=workPackagePayload(form,term?.id,todayTehran(),term)}
  catch(e){setNotice(e.message);return}
  const payload={...resolved.payload,publish}
  const signature=JSON.stringify(payload)
  if(pending.current&&pending.current.signature!==signature){
   if(retryReady){setNotice('برای امنیت ثبت، ابتدا همان درخواست نامطمئن را تعیین‌تکلیف کنید.');return}
   pending.current=null
  }
  if(retryReady&&!retry)return
  if(retry&&!pending.current)return
  const requestId=pending.current?.requestId||globalThis.crypto.randomUUID()
  pending.current={requestId,signature,publish}
  inFlight.current=true;setBusy(true);setNotice('')
  let receipt
  try{
   receipt=await createUnifiedWorkPackage({requestId,payload})
   if(receipt?.ok!==true||typeof receipt.id!=='string')
    throw Error('unconfirmed_manager_receipt')
  }catch{
   setUncertain(true);setRetryReady(false)
   setNotice('نتیجه ذخیره مشخص نیست. پیش از تکرار، «بررسی نتیجه از سرور» را بزنید.')
   inFlight.current=false;setBusy(false)
   return
  }
  // A confirmed server receipt stays confirmed even if the read/navigation fails.
  pending.current=null;setUncertain(false);setRetryReady(false)
  setForm(initial());setOpen(false)
  setNotice(publish?'کار ثبت و منتشر شد. فقط دانشجوی واجد شرایط می‌تواند آن را انتخاب کند.'
   :'پیش‌نویس کار ثبت شد؛ از فهرست می‌توانید آن را منتشر کنید.')
  inFlight.current=false;setBusy(false)
  setRevision(n=>n+1)
 }
 const verify=async()=>{
  if(inFlight.current)return
  setBusy(true)
  const state=await load()
  if(state&&pending.current){
   const found=state.offers.find(o=>o.manager_request_id===pending.current.requestId)
   if(found){
    pending.current=null;setUncertain(false);setRetryReady(false)
    setForm(initial());setOpen(false)
    setNotice('ثبت قبلی در سرور تأیید شد؛ هیچ کار تکراری ساخته نشد.')
   }else{
    setUncertain(false);setRetryReady(true)
    setNotice('هنوز رسید ثبت قبلی پیدا نشد. فقط با همان شناسه قبلی می‌توانید دوباره تلاش کنید.')
   }
  }else if(state){
   // An uncertain pause/publish/close has no manager request UUID, so an
   // authorized list read-back is the safe way to inspect the actual state.
   setUncertain(false);setRetryReady(false)
   setNotice('فهرست تازه از سرور دریافت شد؛ وضعیت فرصت را پیش از اقدام بعدی بررسی کنید.')
  }else{
   setNotice('بازخوانی موفق نبود؛ ثبت دوباره تا روشن شدن نتیجه غیرفعال است.')
  }
  setBusy(false)
 }
 const applyExisting=id=>{
  const t=view.templates.find(t=>t.id===id&&t.kind==='general'&&t.state==='active')
  if(!t)return
  setForm(p=>({...p,unit:t.unit,title:t.title,description:t.description,
   priority:String(t.priority||3),totalMinutes:String(t.estimated_minutes),
   shareMinutes:String(t.estimated_minutes)}))
 }
 const transition=async(id,state,reason=null)=>{
  if(inFlight.current||hasUnresolved)return
  inFlight.current=true;setBusy(true);setNotice('')
  try{
   const reply=await setWorkOpportunityState({opportunityId:id,state,reason})
   if(reply?.id!==id)throw Error('unconfirmed_state_change')
   setCloseId('');setCloseReason('')
   setNotice('وضعیت فرصت تغییر کرد؛ فهرست بازخوانی می‌شود.')
   setRevision(v=>v+1)
  }catch{
   setNotice('نتیجه تغییر وضعیت نامشخص است؛ پیش از اقدام مجدد، فهرست را بازخوانی کنید.')
   setUncertain(true)
  }finally{inFlight.current=false;setBusy(false)}
 }
 const offers=view.offers.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)))
 const inspected=view.status==='ready'?offers.find(o=>o.id===inspectedId):null
 const inspectedTemplate=inspected?view.templates.find(t=>t.id===inspected.template_id):null
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
 return <section className="swtb19-unified-work" aria-label="تعریف و انتشار کار">
  <label className="swtb19-unified-work__kind">
   <input type="checkbox" checked={deskMode} disabled={busy||hasUnresolved}
    onChange={e=>{const next=e.target.checked;setDeskMode(next);
     if(next)setDeskVisited(true)}}/>
   <span>این فعالیت، نوبت حضور با ساعت مشخص در میز کتابخانه است.</span>
  </label>
  <div className="swtb19-unified-work__general" hidden={deskMode}>
  <div className="swtb19-unified-work__toolbar">
   <div><h3>کارهای قابل انتخاب</h3>
    <p>عنوان و شرح کار را بنویسید؛ تنظیمات تخصصی فقط در صورت نیاز نمایش داده می‌شوند.</p>
   </div>
   <div className="swtb19-unified-work__actions">
    <button type="button" className="report-btn report-btn--light" disabled={busy}
     onClick={()=>{if(hasUnresolved)void verify();else setRevision(n=>n+1)}}>بازخوانی فهرست</button>
    <button type="button" className="report-btn report-btn--primary"
     disabled={disabled} onClick={()=>setOpen(v=>!v)}>{open?'بستن فرم':'تعریف کار جدید'}</button>
   </div>
  </div>
  {notice&&<div role={hasUnresolved?'alert':'status'}
    className={hasUnresolved?'report-alert report-alert--error':'ops-alert-success'}>
    {notice}
    {uncertain&&<button type="button" className="ow-mini-btn" disabled={busy}
      onClick={()=>void verify()}>بررسی نتیجه از سرور</button>}
    {retryReady&&<button type="button" className="ow-mini-btn" disabled={busy}
      onClick={()=>void create(Boolean(pending.current?.publish),true)}>تلاش مجدد با شناسه قبلی</button>}
   </div>}
  {view.status==='error'&&<p role="alert">اطلاعات مدیر دریافت نشد؛ ساخت کار تا بازخوانی موفق غیرفعال است.</p>}
  {view.status==='loading'&&<p role="status">در حال دریافت کارها و نیمسال فعال…</p>}
  {open&&view.status==='ready'&&<form className="swtb19-unified-work__form"
    onSubmit={e=>{e.preventDefault();void create(true)}}>
    <h4>تعریف کار جدید</h4>
    <label className="report-field"><span>عنوان کار</span>
     <input required minLength={3} maxLength={160} value={form.title}
      disabled={disabled} onChange={e=>setField('title',e.target.value)}
      placeholder="مثلاً ثبت موضوعات قفسه‌های کتابخانه"/></label>
    <label className="report-field"><span>شرح کار و نتیجه مورد انتظار</span>
     <textarea required minLength={10} maxLength={1200} rows={3}
      value={form.description} disabled={disabled}
      onChange={e=>setField('description',e.target.value)}
      placeholder="دانشجو چه کاری انجام دهد و چه نتیجه‌ای تحویل دهد؟"/></label>
    <div className="swtb19-unified-work__two">
     <label className="report-field"><span>واحد مربوط</span>
      <select value={form.unit} disabled={disabled}
       onChange={e=>setField('unit',e.target.value)}>
       {Object.entries(labels).map(([id,label])=><option value={id} key={id}>{label}</option>)}
      </select></label>
     <label className="report-field"><span>حجم کل تخمینی (دقیقه)</span>
      <input type="number" min="1" max="28800" required value={form.totalMinutes}
       disabled={disabled} onChange={e=>{
        const amount=e.target.value
        setForm(old=>({...old,totalMinutes:amount,
         shareMinutes:old.shareMinutes===old.totalMinutes?
          String(Math.min(1440,Number(amount)||0)):old.shareMinutes}))
       }}/></label>
    </div>
    <fieldset className="swtb19-unified-work__fieldset" disabled={disabled}>
     <legend>زمان انجام کار</legend>
     <div className="swtb19-unified-work__radios">
      <label><input type="radio" name="work-date-kind" value="single"
       checked={form.dateMode==='single'} onChange={()=>setField('dateMode','single')}/> یک روز مشخص</label>
      <label><input type="radio" name="work-date-kind" value="range"
       checked={form.dateMode==='range'} onChange={()=>setField('dateMode','range')}/> در یک بازه زمانی</label>
     </div>
     <div className="swtb19-unified-work__two">
      <div className="report-field"><span>{form.dateMode==='range'?'از تاریخ':'تاریخ انجام'}</span>
       <JalaliDatePicker value={form.startDate} disabled={disabled}
        min={addDays(todayTehran(),2)} max={addDays(todayTehran(),90)}
        onChange={x=>setForm(v=>({...v,startDate:x,
         endDate:v.endDate<x?x:v.endDate}))} ariaLabel="تاریخ شروع کار"/></div>
      {form.dateMode==='range'&&<div className="report-field"><span>تا تاریخ</span>
       <JalaliDatePicker value={form.endDate} disabled={disabled}
        min={form.startDate} max={addDays(todayTehran(),90)}
        onChange={x=>setField('endDate',x)} ariaLabel="تاریخ پایان کار"/></div>}
     </div>
     <p className="ow-muted">انتخاب کار حداکثر تا دو روز پیش از آغاز بازه ممکن است. هر دانشجو یک روز را برای سهم خود انتخاب می‌کند.</p>
    </fieldset>
    <details className="swtb19-unified-work__details">
     <summary>تنظیمات بیشتر <small>سهم دانشجو، مهلت، اولویت و راهنمای خصوصی</small></summary>
     <fieldset className="swtb19-unified-work__fieldset" disabled={disabled}>
      <legend>تقسیم حجم کل کار</legend>
      <div className="swtb19-unified-work__radios">
       <label><input type="radio" name="work-share-kind"
        checked={form.allocationMode==='fixed'}
        onChange={()=>setField('allocationMode','fixed')}/> سهم مشخص برای هر نفر</label>
       <label><input type="radio" name="work-share-kind"
        checked={form.allocationMode==='choice'}
        onChange={()=>setField('allocationMode','choice')}/> دانشجو سهم خودش را انتخاب کند</label>
      </div>
      {form.allocationMode==='fixed'?<label className="report-field">
       <span>سهم استاندارد هر نفر (دقیقه)</span>
       <input type="number" min="1" max="1440" value={form.shareMinutes}
        onChange={e=>setField('shareMinutes',e.target.value)}/></label>
      :<div className="swtb19-unified-work__three">
       {[['minShareMinutes','حداقل سهم (دقیقه)'],['maxShareMinutes','حداکثر سهم (دقیقه)'],
         ['shareStepMinutes','گام سهم (دقیقه)']].map(([key,label])=>
        <label className="report-field" key={key}><span>{label}</span>
         <input type="number" min="1" max="1440" value={form[key]}
          onChange={e=>setField(key,e.target.value)}/></label>)}
      </div>}
      <label className="report-field"><span>حداکثر تعداد نفرات (اختیاری)</span>
       <input type="number" min="1" max="20" value={form.maxPeople}
        onChange={e=>setField('maxPeople',e.target.value)}
        placeholder="محاسبه خودکار"/></label>
     </fieldset>
     <div className="swtb19-unified-work__two">
      <label className="report-field"><span>اولویت</span>
       <select disabled={disabled} value={form.priority} onChange={e=>setField('priority',e.target.value)}>
        {[1,2,3,4,5].map(n=><option key={n} value={n}>{nf.format(n)}</option>)}
       </select></label>
      <div className="report-field"><span>آخرین روز انتخاب (اختیاری)</span>
       <JalaliDatePicker value={form.claimDeadline}
        min={todayTehran()} max={addDays(form.startDate,-2)}
        disabled={disabled} onChange={x=>setField('claimDeadline',x)}
        ariaLabel="آخرین روز انتخاب"/></div>
     </div>
     <label className="report-field"><span>دستورالعمل فقط برای فرد انتخاب‌کننده</span>
      <textarea maxLength={3000} rows={2} disabled={disabled}
       value={form.instructions} onChange={e=>setField('instructions',e.target.value)}/></label>
     <label className="report-field"><span>استفاده از توضیحات کار ثبت‌شده قبلی</span>
      <select disabled={disabled} value="" onChange={e=>applyExisting(e.target.value)}>
       <option value="">در صورت نیاز انتخاب کنید</option>
       {view.templates.filter(x=>x.kind==='general'&&x.state==='active').map(x=>
        <option key={x.id} value={x.id}>{x.title}</option>)}
      </select></label>
    </details>
    <div className="swtb19-unified-work__preview" role="status">
     {preview.error?<span>{preview.error}</span>:<>
      <strong>جمع‌بندی پیش از انتشار</strong>
      <span>حجم کل: {durationFa(form.totalMinutes)}
       {' · '}تقریباً {nf.format(preview.estimatedPeople)} مشارکت
       {' · '} {form.dateMode==='range'?'بازه انجام':'روز انجام'}: {faDate(form.startDate)}
       {form.dateMode==='range'?' تا '+faDate(form.endDate):''}</span>
      <span>انتخاب کار به‌معنای ثبت ساعت تأییدشده نیست.</span>
     </>}
    </div>
    <div className="swtb19-unified-work__actions">
     <button type="button" className="report-btn report-btn--light"
      disabled={disabled||Boolean(preview.error)}
      onClick={()=>void create(false)}>ذخیره پیش‌نویس</button>
     <button type="submit" className="report-btn report-btn--primary"
      disabled={disabled||Boolean(preview.error)}>{busy?'در حال ثبت…':'ثبت و انتشار کار'}</button>
    </div>
   </form>}
  {view.status==='ready'&&<div className={'swtb19-unified-work__directory'+(inspected?' is-inspecting':'')}>
   <div className="swtb19-unified-work__list">
   <h4>کارهای تعریف‌شده ({nf.format(offers.length)})</h4>
   {offers.length===0&&<p className="ow-work-pool-empty">
    هنوز فرصت منتشرشده‌ای وجود ندارد. برای شروع، «تعریف کار جدید» را انتخاب کنید.</p>}
   {offers.map(o=>{
    const t=view.templates.find(x=>x.id===o.template_id)
    return <article key={o.id} className="ow-work-pool-item">
     <div className="ow-work-pool-item__top">
      <strong>{t?.title||'عنوان نامشخص'}</strong>
      <small>{states[o.state]||o.state}</small>
     </div>
     {typeof t?.description==='string'&&
      <p className="swtb19-unified-work__excerpt">{t.description}</p>}
     <p className="ow-muted">{labels[t?.unit]||'واحد نامشخص'} {' · '}
      {faDate(o.date)}{o.end_date&&o.end_date!==o.date?' تا '+faDate(o.end_date):''}</p>
     <p>{o.effort_budget_minutes==null
      ?'مدل قدیمی: '+nf.format(o.claimed_count)+' از '+nf.format(o.capacity)+' نفر'
      :'حجم کل: '+durationFa(o.effort_budget_minutes)
       +' · سهم رزروشده: '+durationFa(o.reserved_minutes||0)
       +' · باقی‌مانده: '+durationFa(o.effort_budget_minutes-(o.reserved_minutes||0))}
     </p>
     <div className="ow-work-pool-item__actions">
      <button type="button" className="ow-mini-btn swtb19-unified-work__inspect"
       aria-expanded={inspectedId===o.id} aria-controls="swtb19-manager-inspector"
       onClick={event=>{
        if(inspectedId===o.id){setInspectedId('');return}
        inspectorTrigger.current=event.currentTarget
        setInspectedId(o.id)
       }}>مشاهده جزئیات</button>
      {['draft','paused'].includes(o.state)&&
       <button type="button" className="report-btn report-btn--primary" disabled={disabled}
        onClick={()=>void transition(o.id,'published')}>انتشار</button>}
      {o.state==='published'&&
       <button type="button" className="ow-mini-btn" disabled={disabled}
        onClick={()=>void transition(o.id,'paused')}>توقف انتخاب</button>}
      {['published','paused'].includes(o.state)&&
       <button type="button" className="ow-mini-btn" disabled={disabled}
        onClick={()=>{setCloseId(o.id);setCloseReason('')}}>بستن فرصت</button>}
     </div>
     {closeId===o.id&&<div className="ow-work-pool-close">
      <label className="report-field"><span>علت بستن فرصت</span>
       <input value={closeReason} minLength={5} maxLength={500}
        onChange={e=>setCloseReason(e.target.value)}/></label>
      <div className="ow-work-pool-item__actions">
       <button type="button" className="report-btn report-btn--primary"
        disabled={disabled||closeReason.trim().length<5}
        onClick={()=>void transition(o.id,'closed',closeReason.trim())}>تأیید بستن</button>
       <button type="button" className="ow-mini-btn" onClick={()=>setCloseId('')}>انصراف</button>
      </div>
     </div>}
    </article>
   })}
   </div>
   {inspected&&<aside id="swtb19-manager-inspector" ref={inspectorRef}
    className="swtb19-unified-work__inspector" aria-label="جزئیات فرصت انتخاب‌شده"
    tabIndex={-1}>
    <div className="swtb19-unified-work__inspector-heading">
     <h4>جزئیات کار تعریف‌شده</h4>
     <button type="button" className="ow-mini-btn"
      onClick={()=>{setInspectedId('');inspectorTrigger.current?.focus({preventScroll:true})}}>
      بستن</button>
    </div>
    <strong className="swtb19-unified-work__detail-title">{inspectedTemplate?.title||'عنوان نامشخص'}</strong>
    <span className="swtb19-unified-work__detail-status">{states[inspected.state]||inspected.state}</span>
    <section className="swtb19-unified-work__detail-section">
     <h5>شرح کار و نتیجه مورد انتظار</h5>
     <p className="swtb19-unified-work__full-description">{inspectedTemplate?.description||'شرح عمومی در اطلاعات دریافتی موجود نیست.'}</p>
    </section>
    <dl className="swtb19-unified-work__detail-facts">
     <div><dt>واحد انجام کار</dt><dd>{labels[inspectedTemplate?.unit]||'نامشخص'}</dd></div>
     <div><dt>زمان انجام</dt><dd>{faDate(inspected.date)}
      {inspected.end_date&&inspected.end_date!==inspected.date?' تا '+faDate(inspected.end_date):''}</dd></div>
     <div><dt>مهلت انتخاب</dt><dd>{faDate(inspected.claim_deadline)}</dd></div>
     <div><dt>تعداد انتخاب‌شده</dt><dd>{nf.format(inspected.claimed_count||0)} از {nf.format(inspected.capacity||0)} نفر</dd></div>
     {inspected.effort_budget_minutes!=null&&<>
      <div><dt>حجم کل تخمینی</dt><dd>{durationFa(inspected.effort_budget_minutes)}</dd></div>
      <div><dt>سهم رزروشده</dt><dd>{durationFa(inspected.reserved_minutes||0)}</dd></div>
      <div><dt>حجم باقی‌مانده</dt><dd>{durationFa(inspected.effort_budget_minutes-(inspected.reserved_minutes||0))}</dd></div>
     </>}
     {inspectedTemplate?.priority!=null&&<div><dt>اولویت</dt><dd>{nf.format(inspectedTemplate.priority)}</dd></div>}
    </dl>
    <p className="ow-muted swtb19-unified-work__detail-note">این صفحه فقط برای مشاهده است. تغییر وضعیت فرصت از دکمه‌های همان ردیف انجام می‌شود؛ ویرایش مشخصات کار در این نسخه فعال نیست.</p>
   </aside>}
  </div>}
  </div>
  {deskVisited&&<div hidden={!deskMode} className="swtb19-unified-work__desk">
   <p className="ow-muted">این حالت ویژه نوبت میز کتابخانه است: تاریخ و ساعت شروع/پایان مشخص، با ظرفیت هم‌زمان حداکثر دو نفر. قواعد مستقل نوبت‌ها حفظ می‌شوند.</p>
   <Suspense fallback={<p role="status">در حال آماده‌سازی نوبت ساعت‌دار…</p>}>
    <DeskWorkPoolManagerSection refreshRevision={refreshRevision}/>
   </Suspense>
  </div>}
 </section>
}
