import {useEffect,useMemo,useRef,useState} from 'react'
import JalaliDatePicker from './JalaliDatePicker'
import {assignWorkerTask} from '../lib/operations'
import {assignGroupTask,assignLibraryDeskShift,cancelLibraryDeskShift,getLibraryDeskShifts} from '../lib/operationsV2'
import {assessAssignmentCapacity} from '../lib/assignmentCapacity.mjs'
import {LIBRARY_DESK_TEMPLATE,canDraftLibraryDeskGroup} from '../lib/libraryDeskTemplate.mjs'
import {deskInterval,minuteClock,projectDeskCoverage,visibleDeskShifts} from '../lib/libraryDeskShifts.mjs'

const fa=new Intl.NumberFormat('fa-IR')
const clockFa=minute=>minuteClock(minute).replace(/[0-9]/g,digit=>'۰۱۲۳۴۵۶۷۸۹'[Number(digit)])
const persianDate=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'})
const localToday=()=>{
 const parts=Object.fromEntries(persianDate.formatToParts(new Date()).map(x=>[x.type,x.value]))
 return [parts.year,parts.month,parts.day].join('-')
}
const dayAfter=(date,increment)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+increment);return d.toISOString().slice(0,10)}
const unitNames={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
export default function TaskAssignmentEditor({workers=[],data={},defaultDate,defaultWorkerId='',onSaved,onClose}) {
 const [workerIds,setWorkerIds]=useState(defaultWorkerId?[defaultWorkerId]:[])
 const [filter,setFilter]=useState('')
 const [date,setDate]=useState(defaultDate||localToday())
 const [title,setTitle]=useState('')
 const [instructions,setInstructions]=useState('')
 const [estimate,setEstimate]=useState('60')
 const [taskUnit,setTaskUnit]=useState('')
 const [libraryTemplateSelected,setLibraryTemplateSelected]=useState(false)
 const [deskStart,setDeskStart]=useState('')
 const [deskEnd,setDeskEnd]=useState('')
 const [deskRevision,setDeskRevision]=useState(0)
 const [deskRead,setDeskRead]=useState({date:'',state:'idle',shifts:[]})
 const [cancelDraft,setCancelDraft]=useState(null)
 const [cancelBusy,setCancelBusy]=useState(false)
 const [cancelError,setCancelError]=useState('')
 const cancelLock=useRef(false)
 const submitLock=useRef(false)
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [committed,setCommitted]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const selected=workers.filter(w=>workerIds.includes(w.id)&&w.state==='active')
 const shortNotice=date<dayAfter(localToday(),2)
 const routineGroupOk=canDraftLibraryDeskGroup(taskUnit,libraryTemplateSelected,selected.length)
 const interval=libraryTemplateSelected?deskInterval(deskStart,deskEnd):null
 const estimateInt=libraryTemplateSelected?(interval?.minutes??NaN):Number(estimate)
 const estimateValid=Number.isInteger(estimateInt)&&estimateInt>=1&&estimateInt<=1440
 const deskVerified=libraryTemplateSelected&&deskRead.date===date&&deskRead.state==='ready'
 const deskCoverage=projectDeskCoverage(
   deskRead.shifts,selected.map(w=>w.id),
   interval?.startMinute,interval?.endMinute)
 useEffect(()=>{setCancelDraft(null);setCancelError('')},[date])
 const deskCanSubmit=!libraryTemplateSelected||
   (deskVerified&&interval!==null&&deskCoverage.allowed)
 useEffect(()=>{
  if(!libraryTemplateSelected||taskUnit!=='library'||!date){
    setDeskRead({date:'',state:'idle',shifts:[]})
    return
  }
  let active=true
  setDeskRead({date,state:'loading',shifts:[]})
  getLibraryDeskShifts({from:date,to:date}).then(result=>{
    if(!active)return
    if(result?.ok!==true||!Array.isArray(result.shifts))throw Error('invalid_shift_read')
    setDeskRead({date,state:'ready',shifts:result.shifts})
  }).catch(()=>{
    if(active)setDeskRead({date,state:'error',shifts:[]})
  })
  return ()=>{active=false}
 },[date,libraryTemplateSelected,taskUnit,deskRevision])
 const applyLibraryTemplate=()=>{
  setTaskUnit(LIBRARY_DESK_TEMPLATE.unit)
  setTitle(LIBRARY_DESK_TEMPLATE.title)
  setInstructions(LIBRARY_DESK_TEMPLATE.instructions)
  // A desk shift is not an arbitrary 60-minute task. Require the manager
  // to enter the actual planned per-person duration explicitly.
  setEstimate('')
  setDeskStart('')
  setDeskEnd('')
  setDeskRevision(v=>v+1)
  setLibraryTemplateSelected(true)
  setCommitted(false)
 }
 const capacity=useMemo(()=>selected.map(w=>({
  id:w.id,name:w.name,
  result:assessAssignmentCapacity(data,{workerId:w.id,date,estimateMinutes:Number.isInteger(estimateInt)?estimateInt:0})
 })),[data,date,estimateInt,workers,workerIds])
 const issues=capacity.filter(c=>['overbooked','unavailable','not_configured','unknown'].includes(c.result.code))
 const toggle=id=>setWorkerIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])
 const submit=async event=>{
  event.preventDefault()
  if(submitLock.current||cancelLock.current||busy||committed||!Object.hasOwn(unitNames,taskUnit)||
    selected.length===0||selected.length!==workerIds.length||date<localToday()||
    !routineGroupOk||!estimateValid||!deskCanSubmit)return
  submitLock.current=true
  setBusy(true);setError('');setNotice('')
  try {
    if(libraryTemplateSelected){
      // No generic-task fallback: the server must atomically reserve seats
      // and create the underlying worker tasks with the exact interval.
      await assignLibraryDeskShift({
        workerIds:selected.map(w=>w.id),date,
        startMinute:interval.startMinute,endMinute:interval.endMinute,
        title,instructions,shortNoticeReason:reason,
      })
    }else if(selected.length===1){
      await assignWorkerTask({workerId:selected[0].id,unit:taskUnit,
        title,instructions,date,minutes:estimate,shortNoticeReason:reason})
    } else {
      await assignGroupTask({workerIds:selected.map(w=>w.id),unit:taskUnit,title,instructions,date,
        minutes:estimate,shortNoticeReason:reason})
    }
    // The server mutation is committed; a failed refresh must not be reported
    // as a failed assignment (or allow a second, duplicate submission).
    setCommitted(true)
    setTitle('');setInstructions('');setReason('')
    setNotice(libraryTemplateSelected?
      `نوبت ${deskStart} تا ${deskEnd} برای ${fa.format(selected.length)} نفر ثبت شد؛ ساعات پس از بررسی گزارش محاسبه می‌شوند.`:
      selected.length===1?`کار در حوزهٔ ${unitNames[taskUnit]} واگذار شد.`:
      `کار گروهی در حوزهٔ ${unitNames[taskUnit]} برای ${fa.format(selected.length)} نفر ثبت شد؛ ساعت هر نفر مستقل بررسی می‌شود.`)
    try {
      await onSaved?.()
      onClose?.()
    } catch {
      setNotice('واگذاری با موفقیت ثبت شد؛ فقط تازه‌سازی فهرست ناموفق بود. برای مشاهده نتیجه، صفحه را دوباره بارگذاری کنید.')
    }
  } catch(err) {
    const message=String(err?.message||'')
    setError(message.includes('short_notice_reason_required')?'علت واگذاری نزدیک ضروری است.':
      message.includes('worker_not_active')?'یکی از افراد دیگر فعال نیست.':
      message.includes('invalid_group_members')?'برای واگذاری گروهی ۲ تا ۲۰ دانشجوکار لازم است.':
      message.includes('invalid_unit')?'واحد فعالیت معتبر یا فعال نیست.':
      message.includes('library_desk_capacity_exceeded')?
        'در این بازه ظرفیت دو نفر تکمیل شده است. زمان یا نفرات را اصلاح کنید.':
      message.includes('library_desk_worker_overlap')?
        'حداقل یکی از افراد انتخاب‌شده قبلاً در همین ساعت نوبت کتابخانه دارد.':
      message.includes('invalid_library_desk_interval')?
        'ساعت شروع و پایان نوبت معتبر نیست.':
      libraryTemplateSelected?
        'تأیید ثبت نوبت دریافت نشد؛ پیش از ارسال دوباره، فهرست نوبت‌ها را بررسی کنید.':
        'واگذاری انجام نشد. اطلاعات را بررسی کنید؛ انتخاب‌ها و توضیحات حفظ شده‌اند.')
    if(libraryTemplateSelected)setDeskRevision(v=>v+1)
  } finally{submitLock.current=false;setBusy(false)}
 }
 const confirmCancel=async shiftId=>{
  const draft=cancelDraft
  const reasonText=String(draft?.reason||'').trim()
  if(!deskVerified||busy||cancelLock.current||!draft||
     draft.id!==shiftId||reasonText.length<5||reasonText.length>500)return
  cancelLock.current=true;setCancelBusy(true);setCancelError('')
  try{
   const result=await cancelLibraryDeskShift({shiftId,reason:reasonText})
   if(result?.ok!==true)throw Error('shift_cancel_not_confirmed')
   setCancelDraft(null)
   setNotice('نوبت و وظیفه مرتبط لغو شدند؛ ظرفیت آزادشده پس از بازخوانی نمایش داده می‌شود.')
   setDeskRevision(v=>v+1)
   // Database commit already succeeded; failure to refresh parent is not a
   // cancellation error and must never retry the mutation.
   try{await onSaved?.()}catch{/* retry a read, never the cancellation */}
  }catch(err){
   const message=String(err?.message||'')
   setCancelError(message.includes('reported_or_started_shift_cannot_be_cancelled')?
    'این نوبت شروع شده یا گزارش دارد و از این مسیر قابل لغو نیست.':
    message.includes('shift_not_available')?
    'نوبت قبلاً لغو شده یا دیگر برای لغو در دسترس نیست.':
    'تأیید لغو دریافت نشد؛ فهرست نوبت‌ها را بازخوانی و پیش از اقدام دوباره بررسی کنید.')
   setDeskRevision(v=>v+1)
  }finally{cancelLock.current=false;setCancelBusy(false)}
 }
 const options=workers.filter(w=>w.state==='active'&&
  (w.name||'').toLocaleLowerCase('fa-IR').includes(filter.toLocaleLowerCase('fa-IR')))
 return <form className="ow-assignment-form" onSubmit={submit}>
  {taskUnit==='library'&&<div className="ow-library-template-panel" aria-label="قالب خدمات جاری کتابخانه">
    <div>
      <strong>مسئولیت ثابت کتابخانه</strong>
      <small>برای پاسخ‌گویی به مراجعان، راهنمایی جست‌وجوی دستی و ثبت موقت امانت و بازگشت کتاب</small>
    </div>
    <button type="button" className="report-btn report-btn--light"
      onClick={applyLibraryTemplate} disabled={busy||committed}>
      {libraryTemplateSelected?'بازنشانی شرح وظیفه ثابت':'استفاده از شرح وظیفه آماده'}
    </button>
    {libraryTemplateSelected&&<p className="ow-library-template-advisory" role="status">
      زمان شروع و پایان نوبت را مشخص کنید؛ ظرفیت نوبت‌های ثبت‌شده برای همان روز بررسی می‌شود.
      اعلام آمادگی حضور، معادل واگذاری کار نیست و فقط گزارش تأییدشده به ساعات قابل‌احتساب اضافه می‌شود.
    </p>}
  </div>}
  <div className="ow-assignment-fields">
    <div className="report-field ow-multi-picker">
      <span>دانشجوکارها · {fa.format(selected.length)} نفر انتخاب‌شده</span>
      <details>
        <summary>{selected.length?selected.map(w=>w.name).slice(0,2).join('، ')+
          (selected.length>2?` و ${fa.format(selected.length-2)} نفر دیگر`:''):'انتخاب یک یا چند نفر'}</summary>
        <div className="ow-worker-options">
          <input type="search" value={filter} onChange={e=>setFilter(e.target.value)}
            aria-label="جست‌وجوی دانشجوکار" placeholder="جست‌وجوی نام"/>
          <div className="ow-worker-option-list">
            {options.map(w=><label key={w.id}>
              <input type="checkbox" checked={workerIds.includes(w.id)} onChange={()=>toggle(w.id)}/>
              <span>{w.name}</span>
            </label>)}
            {!options.length&&<span>دانشجوکار فعالی یافت نشد.</span>}
          </div>
        </div>
      </details>
    </div>
    <label className="report-field"><span>واحد انجام این کار (الزامی)</span>
      <select required aria-label="واحد انجام کار" value={taskUnit}
        onChange={e=>{setTaskUnit(e.target.value);setLibraryTemplateSelected(false)}}>
        <option value="">انتخاب واحد فعالیت</option>
        {Object.entries(unitNames).map(([code,name])=><option key={code} value={code}>{name}</option>)}
      </select>
    </label>
    <div className="report-field"><span>تاریخ اجرا (شمسی)</span>
      <JalaliDatePicker value={date} min={localToday()} onChange={setDate} ariaLabel="تاریخ اجرای کار"/>
    </div>
    {!libraryTemplateSelected&&<label className="report-field ow-estimate-input"><span>زمان استاندارد هر نفر (دقیقه)</span>
      <input type="number" required min="1" max="1440" value={estimate}
        onChange={e=>setEstimate(e.target.value)}/>
    </label>}
    <label className="report-field"><span>عنوان کار</span><input required minLength={3} maxLength={160}
      value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان کوتاه و مشخص"/></label>
    <label className="report-field"><span>شرح مورد انتظار</span>
      <input maxLength={3000} value={instructions} onChange={e=>setInstructions(e.target.value)}
        placeholder="خروجی مدنظر"/></label>
  </div>
  {libraryTemplateSelected&&taskUnit==='library'&&<section className="ow-desk-shift-editor" aria-label="تعیین و بررسی نوبت کتابخانه">
    <div className="ow-desk-shift-heading">
      <strong>نوبت کاری مشخص</strong>
      <span>مبنای ظرفیت: هم‌پوشانی واقعی ساعت‌ها، حداکثر دو نفر</span>
    </div>
    <div className="ow-desk-clock-fields">
      <label className="report-field">
        <span>شروع نوبت</span>
        <input type="time" aria-label="شروع نوبت کتابخانه" required
          value={deskStart} onChange={e=>setDeskStart(e.target.value)}/>
      </label>
      <label className="report-field">
        <span>پایان نوبت</span>
        <input type="time" aria-label="پایان نوبت کتابخانه" required
          value={deskEnd} onChange={e=>setDeskEnd(e.target.value)}/>
      </label>
      <div className="ow-desk-duration" aria-live="polite">
        <small>بازه ۲۴ساعته و مدت استاندارد هر نفر</small>
        <strong>{interval?`${clockFa(interval.startMinute)} تا ${clockFa(interval.endMinute)}`:'پس از تعیین ساعت'}</strong>
        {interval&&<span>{fa.format(interval.minutes)} دقیقه</span>}
      </div>
    </div>
    <div className="ow-desk-coverage" aria-live="polite" aria-atomic="true">
      {deskRead.state==='loading'&&<p role="status">در حال بررسی نوبت‌های این روز…</p>}
      {deskRead.state==='error'&&<div className="ow-capacity-warning" role="alert">
        دریافت نوبت‌ها ممکن نیست. تا اطمینان از ظرفیت واقعی، ثبت مسئولیت ثابت غیرفعال است.
        <button type="button" className="report-btn report-btn--light"
          onClick={()=>setDeskRevision(v=>v+1)}>تلاش مجدد</button>
      </div>}
      {deskVerified&&<>
        <div className="ow-desk-coverage-heading">
          <strong>نوبت‌های ثبت‌شده همین روز</strong>
          <span>{fa.format(visibleDeskShifts(deskRead.shifts).length)} واگذاری</span>
          <button type="button" className="ow-desk-refresh" aria-label="بازخوانی ظرفیت نوبت‌ها"
            onClick={()=>setDeskRevision(v=>v+1)}>↻ به‌روزرسانی</button>
        </div>
        {visibleDeskShifts(deskRead.shifts).length===0?
          <p className="ow-muted">هنوز نوبتی برای این روز ثبت نشده است.</p>:
          <ul className="ow-desk-bookings">
            {visibleDeskShifts(deskRead.shifts).map(s=><li key={s.id} className="ow-desk-booking">
              <span>{clockFa(s.start_minute)} تا {clockFa(s.end_minute)}</span>
              <span>{workers.find(w=>w.id===s.worker_id)?.name||'دانشجوکار'}</span>
              <button type="button" className="ow-desk-cancel-trigger"
                aria-expanded={cancelDraft?.id===s.id} disabled={cancelBusy||busy}
                onClick={()=>{setCancelError('');setCancelDraft(prev=>
                  prev?.id===s.id?null:{id:s.id,reason:''})}}>
                لغو نوبت
              </button>
              {cancelDraft?.id===s.id&&<div className="ow-desk-cancel-confirm">
                <label className="report-field"><span>علت لغو (الزامی، حداقل ۵ حرف)</span>
                  <input type="text" maxLength={500} aria-label="علت لغو نوبت"
                    value={cancelDraft.reason} onChange={e=>
                      setCancelDraft(prev=>prev?.id===s.id?{...prev,reason:e.target.value}:prev)}
                    placeholder="دلیل لغو را ثبت کنید"/>
                </label>
                <small>تنها نوبت‌های فاقد شروع کار یا گزارش قابل لغو هستند.</small>
                <div className="ow-desk-cancel-actions">
                  <button type="button" className="report-btn report-btn--light"
                    disabled={cancelBusy} onClick={()=>setCancelDraft(null)}>بازگشت</button>
                  <button type="button" className="report-btn report-btn--primary"
                    disabled={cancelBusy||cancelDraft.reason.trim().length<5}
                    onClick={()=>{void confirmCancel(s.id)}}>
                    {cancelBusy?'در حال لغو…':'تأیید لغو نوبت'}
                  </button>
                </div>
              </div>}
            </li>)}
          </ul>}
        {cancelError&&<p className="ow-capacity-warning" role="alert">{cancelError}</p>}
        <p className="ow-desk-coverage-limit">این ظرفیت فقط نوبت‌های مصوبِ ثبت‌شده در همین قالب را نشان می‌دهد؛ سایر وظایف و برنامه حضور باید جداگانه هماهنگ شوند.</p>
        {interval&&<p className={deskCoverage.allowed?'ow-desk-cover-ok':'ow-desk-cover-block'}>
          {deskCoverage.workerOverlap?
            'حداقل یکی از افراد انتخابی در این بازه نوبت دارد.':
            deskCoverage.allowed?
              `ظرفیت بازه مناسب است: حداکثر ${fa.format(deskCoverage.maxOccupied)} نفر ثبت‌شده، ${fa.format(selected.length)} نفر پیشنهادی.`:
              'ظرفیت این بازه برای نفرات انتخاب‌شده کافی نیست؛ ساعت یا انتخاب‌ها را تغییر دهید.'}
        </p>}
      </>}
    </div>
  </section>}
  {shortNotice&&<label className="report-field ow-short-notice">
    <span>علت واگذاری امروز یا فردا (الزامی)</span>
    <input required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/>
  </label>}
  {!routineGroupOk&&<div className="ow-capacity-warning" role="alert">
    این قالب تنها برای حداکثر دو نفر در یک نوبتِ مسئولیت جاری کتابخانه قابل واگذاری است.
    برای نفرات بیشتر، کار مستقل و مشخص جداگانه تعریف کنید. هم‌پوشانی با سایر واگذاری‌ها فعلاً باید دستی کنترل شود.
  </div>}
  {issues.length>0&&<div className="ow-capacity-warning" role="status">
    {issues.map(c=><p key={c.id}>
      {selected.length>1&&<b>{c.name}: </b>}
      {c.result.code==='overbooked'
        ?<><strong>هشدار بیش‌ازظرفیت:</strong> مجموع کارهای ثبت‌شده از ظرفیت اعلام‌شده بیشتر می‌شود.</>
        :c.result.code==='unavailable'
          ?<><strong>هشدار عدم حضور:</strong> برای این روز ظرفیت صفر ثبت شده است.</>
          :c.result.code==='not_configured'
            ?<><strong>برنامه حضور برای این روز ثبت نشده است.</strong> نبود برنامه به معنی غیبت قطعی نیست.</>
            :<><strong>ظرفیت قابل محاسبه نیست.</strong> پیش از واگذاری بررسی کنید.</>}
      {c.result.exception&&<small>محاسبه بر اساس تغییر موقت همین روز است.</small>}
    </p>)}
  </div>}
  {selected.length>0&&<details className="ow-context-help">
    <summary>ظرفیت نفرات انتخابی · {fa.format(selected.length)} نفر</summary>
    <div className="ow-capacity-preview">
      {capacity.map(c=><div key={c.id}>
        <strong>{c.name}</strong>
        <span>{c.result.code==='ok'||c.result.code==='full'?'متناسب':
          c.result.code==='overbooked'?'بیش از ظرفیت':
          c.result.code==='unavailable'?'عدم حضور ثبت‌شده':'نیازمند هماهنگی'}</span>
      </div>)}
    </div>
  </details>}
  <p className="ow-muted">واحد انتخاب‌شده به خودِ کار تعلق دارد، نه به واحد اولیهٔ ثبت‌نام دانشجو. ساعت گزارش‌شده و تأییدشدهٔ هر نفر زیر همین واحد محاسبه می‌شود. در کار گروهی، یک واحد برای همهٔ اعضای آن کار در نظر گرفته می‌شود.</p>
  {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
  {notice&&<p role="status" className="ops-alert-success">{notice}</p>}
  <div className="ow-actions">
    {onClose&&<button type="button" className="report-btn report-btn--light" onClick={onClose}>انصراف</button>}
    <button type="submit" className="report-btn report-btn--primary"
      disabled={busy||cancelBusy||committed||!Object.hasOwn(unitNames,taskUnit)||!selected.length||selected.length!==workerIds.length||date<localToday()||!routineGroupOk||!estimateValid||!deskCanSubmit}>
      {busy?'در حال ثبت…':selected.length>1?'واگذاری گروهی':'واگذاری کار'}
    </button>
  </div>
 </form>
}
