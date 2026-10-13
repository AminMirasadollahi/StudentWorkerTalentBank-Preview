import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getAdminWork, getMyWork, setWeeklyDay, setDateException,
  assignWorkerTask, startMyTask, submitMyTime, reviewWorkerTime,
} from './lib/operations'
import './operations-workspace.css'
import JalaliDatePicker from './components/JalaliDatePicker'
import { scopeWorkerHistory, filterWorkerHistory, summarizeWorkerHistory } from './lib/workerHistory'
import { assessAssignmentCapacity, assessAvailabilityOverride, firstMatchingWeekday, isoWeekday } from './lib/assignmentCapacity.mjs'
import { describeTaskWorkflow,selectManagerTasks,summarizeTaskWorkflow,selectPendingApprovals } from './lib/operationsTaskOverview.mjs'
import WorkerLifecycleReadOnlyPreview from './components/WorkerLifecycleReadOnlyPreview'
import { workerStateLabels } from './lib/workerLifecycle.mjs'
import { MAX_DAILY_WINDOWS, selectedWeeklyWindows, validateDailyWindows, persianWeekBounds } from './lib/weeklyScheduleGrid.mjs'

const fa = new Intl.NumberFormat('fa-IR')
const dLabel = new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
  dateStyle:'medium', timeZone:'UTC',
})
const dateParts = new Intl.DateTimeFormat('en-US',{
  calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'
})
const dayLabels = [[6,'شنبه'],[7,'یکشنبه'],[1,'دوشنبه'],[2,'سه‌شنبه'],[3,'چهارشنبه'],[4,'پنجشنبه'],[5,'جمعه']]
const unitLabels = {library:'کتابخانه',public_relations:'روابط عمومی',research:'پژوهش'}
const stateLabels = {
  assigned:'واگذار شده',in_progress:'در حال انجام',submitted:'منتظر تأیید',
  completed:'تکمیل‌شده',needs_changes:'نیازمند اصلاح',cancelled:'لغوشده',
}
const reviewLabels = {
  submitted:'منتظر تأیید',approved:'تأییدشده',
  changes_requested:'نیازمند اصلاح',rejected:'ردشده',
}
const extraTimeReasons = {
  equipment_issue:'اختلال تجهیزات یا محیط',
  unexpected_complexity:'حجم یا پیچیدگی پیش‌بینی‌نشده',
  instructions_changed:'تغییر یا ابهام دستورالعمل',
  skill_gap:'نیاز به آموزش یا تسلط بیشتر',
  other:'سایر موارد',
}
const label = (id,items) => items.find(x=>x.id===id)?.name || '—'
const n = value=>fa.format(value||0)
const minutes = value=>`${n(value)} دقیقه`
function exactDuration(totalMinutes) {
  const total=Math.max(0,Math.trunc(Number(totalMinutes)||0))
  const hours=Math.floor(total/60)
  const remainder=total%60
  if(!hours)return `${n(remainder)} دقیقه`
  if(!remainder)return `${n(hours)} ساعت`
  return `${n(hours)} ساعت و ${n(remainder)} دقیقه`
}
function today() {
  const p = Object.fromEntries(dateParts.formatToParts(new Date()).map(x=>[x.type,x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function shift(date,delta) {
  const d=new Date(date+'T00:00:00Z')
  d.setUTCDate(d.getUTCDate()+delta)
  return d.toISOString().slice(0,10)
}
function pretty(date) {
  if(!date) return '—'
  return dLabel.format(new Date(date+'T00:00:00Z'))
}
function toMin(time) {
  const [h,m]=time.split(':').map(Number)
  return h*60+m
}
function asTime(value) {
  return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
}
function readableError(e) {
  const raw=String(e?.message||'')
  const dict={
    short_notice_reason_required:'برای واگذاری امروز یا فردا، علت کوتاه وارد کنید.',
    worker_not_active:'این دانشجوکار هنوز فعال نیست.',
    worker_access_denied:'شما مجوز انجام این عملیات را ندارید.',
    task_access_denied:'این کار در فهرست وظایف شما نیست.',
    invalid_time_submission:'تاریخ یا مدت اجرای واردشده معتبر نیست.',
    invalid_task_transition:'وضعیت فعلی این کار اجازه شروع مجدد نمی‌دهد.',
    already_reviewed:'این گزارش قبلاً بررسی شده است.',
    review_reason_required:'برای اختلاف زمان یا تأیید زمان اضافه، توضیح تصمیم لازم است.',
    extra_time_reason_required:'برای درخواست زمان اضافه، نوع علت و توضیح کافی را وارد کنید.',
    invalid_extra_time_request:'زمان یا علت درخواست اضافه معتبر نیست.',
    overlapping_or_invalid_slots:'زمان‌های حضور هم‌پوشانی دارند یا نامعتبرند.',
    invalid_availability:'تنظیمات زمان حضور معتبر نیست.',
    invalid_exception:'تاریخ یا بازه تغییر حضور معتبر نیست.',
  }
  for (const [code,msg] of Object.entries(dict)) if(raw.includes(code)) return msg
  if(/fetch|network/i.test(raw))return 'ارتباط برقرار نشد؛ پاسخ‌ها حفظ شده‌اند. دوباره تلاش کنید.'
  return 'عملیات کامل نشد؛ اطلاعات را بررسی و دوباره تلاش کنید.'
}
function Message({error,notice}) {
  return <>
    {error&&<div role="alert" className="report-alert report-alert--error">{error}</div>}
    {notice&&<div role="status" className="ops-alert-success">{notice}</div>}
  </>
}
function SectionTabs({value,onChange,options}) {
  return <nav className="ow-tabs" aria-label="بخش‌های عملیاتی">
    {options.map(([id,title])=><button key={id} type="button"
      className={value===id?'ow-tab is-selected':'ow-tab'}
      aria-current={value===id?'page':undefined}
      onClick={()=>onChange(id)}>{title}</button>)}
  </nav>
}
function ScheduleEditor({workerId,onSaved,data}) {
  const [effective,setEffective]=useState(today())
  const [editingDay,setEditingDay]=useState(null)
  const [draftWindows,setDraftWindows]=useState([])
  const [exceptionDate,setExceptionDate]=useState(today())
  const [exceptionKind,setExceptionKind]=useState('unavailable')
  const [exceptionStart,setExceptionStart]=useState('08:00')
  const [exceptionEnd,setExceptionEnd]=useState('12:00')
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [saveDayState,setSaveDayState]=useState('')
  useEffect(()=>{setEditingDay(null);setDraftWindows([]);setError('');setNotice('')},[workerId,effective])

  const selectedDayDate=editingDay===null?null:firstMatchingWeekday(effective,editingDay)
  const weeklyValidation=validateDailyWindows(draftWindows)
  const weeklyPreview=editingDay===null||!weeklyValidation.ok ? null :
    assessAvailabilityOverride(data,workerId,selectedDayDate,weeklyValidation.intervals,
      {unavailable:false})
  const exceptionValid=exceptionKind==='unavailable'||(
    Number.isInteger(toMin(exceptionStart))&&Number.isInteger(toMin(exceptionEnd))
    &&toMin(exceptionStart)>=0&&toMin(exceptionEnd)<=1440&&toMin(exceptionEnd)>toMin(exceptionStart)
  )
  const exceptionPreview=assessAvailabilityOverride(data,workerId,exceptionDate,
    exceptionKind==='unavailable'?[]:[{start:toMin(exceptionStart),end:toMin(exceptionEnd)}],
    {unavailable:exceptionKind==='unavailable'})

  const openDay=id=>{
    if(busy)return
    if(editingDay===id){setEditingDay(null);return}
    const target=firstMatchingWeekday(effective,id)
    setDraftWindows(selectedWeeklyWindows(data?.weekly_slots||[],workerId,id,target))
    setSaveDayState('')
    setError('')
    setNotice('')
    setEditingDay(id)
  }
  const save=async (fn,onSuccess)=>{
    setBusy(true);setError('');setNotice('')
    try{
      await fn()
      await onSaved?.()
      onSuccess?.()
      setNotice('ذخیره این بخش با موفقیت انجام شد.')
    } catch(e){setError(readableError(e))}
    finally{setBusy(false)}
  }
  const submitDay=event=>{
    event.preventDefault()
    if(busy||editingDay===null||!weeklyValidation.ok)return
    if(draftWindows.length===0&&!window.confirm('برنامه ثابت این روز حذف می‌شود و ظرفیت آن نامشخص خواهد بود. ادامه می‌دهید؟'))return
    const weekday=editingDay
    setSaveDayState('در حال ذخیره همین روز…')
    void save(()=>setWeeklyDay(workerId,weekday,weeklyValidation.intervals,effective),()=>{
      setSaveDayState('ذخیره شد')
      setEditingDay(null)
    })
  }

  if(!workerId)return <p className="ow-muted">یک دانشجوکار انتخاب کنید.</p>
  return <div className="ow-schedule-editor">
    <section className="ow-week-editor" aria-label="برنامه ثابت هفتگی">
      <div className="ow-week-heading">
        <h3>برنامه ثابت هفتگی</h3>
        <label className="report-field">
          <span>اعمال تغییرات از تاریخ (شمسی)</span>
          <JalaliDatePicker min={today()} value={effective} onChange={setEffective} ariaLabel="تاریخ شروع برنامه هفتگی"/>
        </label>
      </div>
      <p className="ow-muted">برای ویرایش، یک روز را انتخاب کنید. هر روز تا چهار بازه مستقل دارد؛ ذخیره هر روز جداگانه انجام می‌شود.</p>
      <div className="ow-week-grid-header" aria-hidden="true">
        <span>روز</span>{[1,2,3,4].map(i=><span key={i}>نوبت {n(i)}</span>)}
      </div>
      <div className="ow-week-grid">
        {dayLabels.map(([id,name])=>{
          const date=firstMatchingWeekday(effective,id)
          const slots=selectedWeeklyWindows(data?.weekly_slots||[],workerId,id,date)
          return <button type="button" key={id}
            className={editingDay===id?'ow-week-row is-editing':'ow-week-row'}
            aria-expanded={editingDay===id}
            onClick={()=>openDay(id)} disabled={busy}
            aria-label={`ویرایش برنامه ${name}؛ ${slots.length ? n(slots.length)+' بازه' : 'برنامه نامشخص'}`}>
            <span className="ow-week-day"><strong>{name}</strong><small>{pretty(date)}</small></span>
            {[0,1,2,3].map(i=><span key={i} className={slots[i]?'ow-week-slot':'ow-week-slot is-empty'}>
              {slots[i] ? <span dir="ltr">{slots[i].start}–{slots[i].end}</span> : <span aria-hidden="true">＋</span>}
            </span>)}
          </button>
        })}
      </div>
      {editingDay!==null&&<form className="ow-week-day-form" onSubmit={submitDay}>
        <h4>{dayLabels.find(([id])=>id===editingDay)?.[1]} · {pretty(selectedDayDate)}</h4>
        <div className="ow-day-windows">
          {draftWindows.map((slot,index)=><div className="ow-day-window" key={index}>
            <strong>نوبت {n(index+1)}</strong>
            <label className="report-field"><span>از (HH:MM)</span>
              <input type="text" inputMode="numeric" dir="ltr" placeholder="08:00" required
                value={slot.start} maxLength={5}
                onChange={e=>setDraftWindows(old=>old.map((x,i)=>i===index?{...x,start:e.target.value}:x))}/>
            </label>
            <label className="report-field"><span>تا (HH:MM)</span>
              <input type="text" inputMode="numeric" dir="ltr" placeholder="09:00" required
                value={slot.end} maxLength={5}
                onChange={e=>setDraftWindows(old=>old.map((x,i)=>i===index?{...x,end:e.target.value}:x))}/>
            </label>
            <button type="button" className="report-btn report-btn--light" disabled={busy}
              onClick={()=>setDraftWindows(old=>old.filter((_,i)=>i!==index))}
              aria-label={`حذف نوبت ${index+1}`}>حذف</button>
          </div>)}
        </div>
        <div className="ow-actions">
          <button type="button" className="report-btn report-btn--light"
            disabled={busy||draftWindows.length>=MAX_DAILY_WINDOWS}
            onClick={()=>setDraftWindows(old=>[...old,{start:'08:00',end:'09:00'}])}>
            + افزودن نوبت ({n(draftWindows.length)} از {n(MAX_DAILY_WINDOWS)})
          </button>
          <button type="submit" className="report-btn report-btn--primary"
            disabled={busy||!weeklyValidation.ok}>
            {busy?'در حال ثبت…':draftWindows.length?'ذخیره همین روز':'حذف برنامه ثابت این روز'}
          </button>
        </div>
        {!weeklyValidation.ok&&<p role="alert" className="ow-warning">{weeklyValidation.error}</p>}
        {weeklyValidation.ok&&<p className="ow-muted">مجموع حضور این روز: {exactDuration(weeklyValidation.minutes)}.
          {draftWindows.length===0?' حذف برنامه به معنی عدم حضور قطعی نیست؛ ظرفیت نامشخص می‌شود.':''}
        </p>}
        {weeklyPreview?.code==='conflict'&&<div role="status" className="ow-capacity-warning">
          <strong>هشدار تداخل با کارهای موجود: </strong>
          {minutes(weeklyPreview.allocatedMinutes)} کار برای این روز ثبت شده و ظرفیت پیشنهادی
          {' '}{minutes(weeklyPreview.proposedCapacity)} است. تغییر برنامه کارهای قبلی را لغو نمی‌کند.
        </div>}
        {saveDayState&&<p role="status" className="ow-muted">{saveDayState}</p>}
      </form>}
    </section>
    <form onSubmit={event=>{event.preventDefault();if(!exceptionValid||busy)return;void save(()=>setDateException(
      workerId,exceptionDate,exceptionKind,
      exceptionKind==='unavailable'?[]:[{start:toMin(exceptionStart),end:toMin(exceptionEnd)}],
      note
    ))}}>
      <h3>تغییر موقت یک روز</h3>
      <div className="ow-fields ow-fields--four">
        <label className="report-field"><span>تاریخ (شمسی)</span>
          <JalaliDatePicker min={today()} value={exceptionDate} onChange={setExceptionDate} ariaLabel="تاریخ تغییر موقت حضور"/>
        </label>
        <label className="report-field"><span>نوع تغییر</span>
          <select value={exceptionKind} onChange={e=>setExceptionKind(e.target.value)}>
            <option value="unavailable">عدم حضور</option>
            <option value="replacement_intervals">ساعات جایگزین</option>
          </select>
        </label>
        {exceptionKind==='replacement_intervals'&&<>
          <label className="report-field"><span>از</span><input type="time" value={exceptionStart} onChange={e=>setExceptionStart(e.target.value)}/></label>
          <label className="report-field"><span>تا</span><input type="time" value={exceptionEnd} onChange={e=>setExceptionEnd(e.target.value)}/></label>
        </>}
      </div>
      <label className="report-field"><span>توضیح کوتاه (اختیاری)</span>
        <input maxLength={300} value={note} onChange={e=>setNote(e.target.value)}/>
      </label>
      {!exceptionValid&&<p className="ow-warning" role="alert">ساعت پایان باید بعد از شروع و در همان روز باشد.</p>}
      {exceptionPreview.code==='conflict'&&<div className="ow-capacity-warning" role="status">
        <strong>هشدار: برای این روز قبلاً کار ثبت شده است.</strong>
        {' '}{minutes(exceptionPreview.allocatedMinutes)} کار واگذار شده در برابر
        {' '}{minutes(exceptionPreview.proposedCapacity)} ظرفیت پیشنهادی.
        تغییر برنامه، کارهای قبلی را لغو نمی‌کند.
      </div>}
      <button className="report-btn report-btn--primary" disabled={busy||!exceptionValid} type="submit">ثبت تغییر این روز</button>
    </form>
    <Message error={error} notice={notice}/>
    <details className="ow-context-help"><summary>راهنمای برنامه</summary>
      <p className="ow-muted">تغییرات گذشته بازنویسی نمی‌شوند. بازه‌های هر روز بدون هم‌پوشانی و به‌ترتیب زمانی ذخیره می‌شوند؛ نبود برنامه به معنی عدم حضور قطعی نیست.</p>
    </details>
  </div>
}
function ApprovalCard({entry,task,worker,onDone}) {
  const standard=Number(task?.estimate_minutes ?? entry.reported_minutes)
  const missingTask=!task
  const requested=Number(entry.reported_minutes)
  const asksExtra=requested>standard
  const [approved,setApproved]=useState(String(Math.min(standard,requested)))
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const approvalNeedsReason=Number(approved)!==requested || Number(approved)>standard
  const act=async decision=>{
    setBusy(true);setError('')
    try{
      await reviewWorkerTime({entryId:entry.id,decision,approvedMinutes:approved,note})
      await onDone()
    }catch(e){setError(readableError(e))}
    finally{setBusy(false)}
  }
  return <article className="ow-item">
    <div className="ow-item-header">
      <strong>{task?.title||'کار مرتبط نامشخص'}</strong>
      <span className="ow-status">{missingTask?'نیازمند بررسی پرونده':asksExtra?'درخواست زمان اضافه':'گزارش عادی'}</span>
    </div>
    <small>{worker?.name||'—'} · {pretty(entry.work_date)} · درخواست: {minutes(requested)}
      {asksExtra&&<> · اضافه: {minutes(requested-standard)}</>}
    </small>
    {missingTask&&<p className="ow-warning" role="alert">کار مرتبط در اطلاعات فعلی موجود نیست؛ تصمیم‌گیری تا بررسی پرونده غیرفعال است.</p>}
    <details className="ow-approval-detail">
      <summary>بررسی جزئیات و ثبت تصمیم</summary>
      <p>زمان استاندارد: <b>{missingTask?'نامشخص':minutes(standard)}</b> · زمان درخواستی: <b>{minutes(requested)}</b></p>
    {asksExtra&&<p className="ow-overtime-review">
      <b>علت درخواست اضافه:</b> {extraTimeReasons[entry.extra_time_reason_code]||'در گزارش قدیمی ثبت نشده'}
      {entry.extra_time_reason_text&&<> · {entry.extra_time_reason_text}</>}
    </p>}
    {entry.worker_note&&<p>توضیح تکمیلی دانشجو: {entry.worker_note}</p>}
    <div className="ow-fields ow-fields--two">
      <label className="report-field"><span>مدت تأییدشده (دقیقه)</span>
        <input type="number" min="0" max={requested} value={approved} onChange={e=>setApproved(e.target.value)}/>
      </label>
      <label className="report-field"><span>توضیح تصمیم {approvalNeedsReason?'(الزامی)':'(اختیاری)'}</span>
        <input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/>
      </label>
    </div>
    <div className="ow-actions">
      <button className="report-btn report-btn--primary" type="button"
        disabled={busy||missingTask||approved===''||!Number.isInteger(Number(approved))||Number(approved)<0||Number(approved)>requested||(approvalNeedsReason&&!note.trim())}
        onClick={()=>act('approved')}>تأیید ساعت</button>
      <button className="report-btn report-btn--light" type="button"
        disabled={busy||missingTask||!note.trim()} onClick={()=>act('changes_requested')}>نیازمند اصلاح</button>
      <button className="report-btn report-btn--light" type="button"
        disabled={busy||missingTask||!note.trim()} onClick={()=>act('rejected')}>رد گزارش</button>
    </div>
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
    </details>
  </article>
}
async function exportOpsExcel(data, filteredToOneWorker=false) {
  const ExcelJS=await import('exceljs')
  const wb=new ExcelJS.Workbook()
  const sh=wb.addWorksheet('کارها و ساعات',{views:[{rightToLeft:true}]})
  sh.columns=[
    {header:'دانشجوکار',key:'name',width:25},{header:'واحد',key:'unit',width:20},
    {header:'عنوان کار',key:'task',width:34},{header:'تاریخ فعالیت',key:'date',width:21},
    {header:'زمان برآوردی (دقیقه)',key:'estimate',width:24},
    {header:'زمان درخواستی (دقیقه)',key:'reported',width:25},
    {header:'زمان تأییدشده (دقیقه)',key:'approved',width:25},
    {header:'وضعیت گزارش',key:'review',width:22},
    {header:'علت زمان اضافه',key:'extraReason',width:30},
    {header:'توضیح درخواست اضافه',key:'extraText',width:42},
    {header:'توضیح تأیید مدیر',key:'approvalNote',width:42},
  ]
  for(const task of data.tasks||[]){
    const worker=data.workers?.find(w=>w.id===task.worker_id)
    const entries=(data.time_entries||[]).filter(e=>e.task_id===task.id)
    if(!entries.length) sh.addRow({name:worker?.name||'',unit:unitLabels[task.unit],
      task:task.title,date:pretty(task.planned_date),estimate:task.estimate_minutes,review:'بدون گزارش'})
    for(const entry of entries) sh.addRow({
      name:worker?.name||'',unit:unitLabels[task.unit],task:task.title,
      date:pretty(entry.work_date||task.planned_date),estimate:task.estimate_minutes,
      reported:entry.reported_minutes,
      approved:entry.review_state==='approved'?entry.approved_minutes:'',
      review:reviewLabels[entry.review_state] || entry.review_state,
      extraReason:extraTimeReasons[entry.extra_time_reason_code]||'',
      extraText:entry.extra_time_reason_text||'',
      approvalNote:entry.review_note||'',
    })
  }
  // Preserve already-authorized time reports even if a legacy record's
  // linked task is missing from the authorized read projection.
  const includedTaskIds=new Set((data.tasks||[]).map(task=>task.id))
  for(const entry of data.time_entries||[]){
    if(includedTaskIds.has(entry.task_id)) continue
    const worker=data.workers?.find(w=>w.id===entry.worker_id)
    sh.addRow({
      name:worker?.name||'',unit:unitLabels[worker?.unit]||'',
      task:'کار مرتبط در خروجی موجود نیست',date:pretty(entry.work_date),
      reported:entry.reported_minutes,
      approved:entry.review_state==='approved'?entry.approved_minutes:'',
      review:reviewLabels[entry.review_state]||entry.review_state,
      extraReason:extraTimeReasons[entry.extra_time_reason_code]||'',
      extraText:entry.extra_time_reason_text||'',
      approvalNote:entry.review_note||'',
    })
  }
  sh.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}}
  sh.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF153E5C'}}
  sh.autoFilter={from:{row:1,column:1},to:{row:sh.rowCount,column:11}}
  sh.views=[{state:'frozen',ySplit:1,rightToLeft:true}]
  const blob=new Blob([await wb.xlsx.writeBuffer()],
    {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url;a.download=filteredToOneWorker?'student-worker-selected-history.xlsx':'student-worker-operations.xlsx';a.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function AdminOperations({ navigation, setNavigation }) {
  const [data,setData]=useState({workers:[],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
  const view=navigation.workView
  const workerId=navigation.workerId
  const historyWorkerId=navigation.historyWorkerId
  const historyUnit=navigation.historyUnit||''
  const historyFrom=navigation.historyFrom||''
  const historyTo=navigation.historyTo||''
  const historyReview=navigation.historyReview||''
  const taskWorkerId=navigation.taskWorkerId||''
  const taskState=navigation.taskState||''
  const taskSearch=navigation.taskSearch||''
  const taskOrder=navigation.taskOrder||'latest'
  const approvalWorkerId=navigation.approvalWorkerId||''
  const approvalKind=navigation.approvalKind||''
  const setListingFilter=(name,value)=>setNavigation(previous=>({...previous,[name]:value}))
  const historyFiltersActive=Boolean(historyWorkerId||historyUnit||historyFrom||historyTo||historyReview)
  const invalidHistoryRange=Boolean(historyFrom&&historyTo&&historyFrom>historyTo)
  const setHistoryFilter=(name,value)=>setNavigation(previous=>({...previous,[name]:value}))
  const setView=value=>setNavigation(previous=>({...previous,workView:value}))
  const setWorkerId=value=>setNavigation(previous=>({...previous,workerId:value}))
  const setHistoryWorkerId=value=>setNavigation(previous=>({...previous,historyWorkerId:value}))
  const [title,setTitle]=useState('')
  const [instructions,setInstructions]=useState('')
  const [date,setDate]=useState(today())
  const [estimate,setEstimate]=useState('60')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [historyShown,setHistoryShown]=useState(100)
  const [tasksShown,setTasksShown]=useState(100)
  const [approvalsShown,setApprovalsShown]=useState(25)
  useEffect(()=>setTasksShown(100),[taskWorkerId,taskState,taskSearch,taskOrder])
  useEffect(()=>setApprovalsShown(25),[approvalWorkerId,approvalKind])
  useEffect(()=>{setHistoryShown(100)},[historyWorkerId,historyUnit,historyFrom,historyTo,historyReview])

  const refresh=async ()=>{
    setLoading(true)
    try{
      const result=await getAdminWork()
      setData(result||{workers:[],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
      setError('')
      return true
    }catch(e){
      setError(readableError(e))
      return false
    }finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])

  const workers=data.workers||[]
  const active=workers.filter(w=>w.state==='active')
  const chosen=workers.find(w=>w.id===workerId)
  const selectedHistoryWorker=workers.find(w=>w.id===historyWorkerId)
  const allWorkerHistory=scopeWorkerHistory(data,historyWorkerId)
  const overallWorkerSummary=summarizeWorkerHistory(allWorkerHistory)
  const historyData=filterWorkerHistory(allWorkerHistory,{
    unit:historyUnit,from:historyFrom,to:historyTo,review:historyReview,
  })
  const historySummary=summarizeWorkerHistory(historyData)
  const reportTaskIds=new Set(historyData.time_entries.map(entry=>entry.task_id))
  const historyWithoutReport=historyData.tasks.filter(task=>!reportTaskIds.has(task.id))
  const allTasks=data.tasks||[]
  const taskCounts=summarizeTaskWorkflow(allTasks)
  const matchingTasks=selectManagerTasks(data,{
    workerId:taskWorkerId,state:taskState,search:taskSearch,order:taskOrder,
  })
  const visibleApprovals=selectPendingApprovals(data,{
    workerId:approvalWorkerId,kind:approvalKind,
  })
  const reportByTask=new Map()
  for(const entry of data.time_entries||[]){
    if(!reportByTask.has(entry.task_id))reportByTask.set(entry.task_id,[])
    reportByTask.get(entry.task_id).push(entry)
  }
  const taskById=new Map(allTasks.map(task=>[task.id,task]))
  const todayTasks=(data.tasks||[]).filter(t=>t.planned_date===today()&&t.state!=='cancelled')
  const pending=(data.time_entries||[]).filter(e=>e.review_state==='submitted')
  const approvedMinutes=(data.time_entries||[])
    .filter(e=>e.review_state==='approved')
    .reduce((sum,e)=>sum+Number(e.approved_minutes||0),0)
  const isShort=date<shift(today(),2)
  const assignmentCapacity=workerId?assessAssignmentCapacity(data,{
    workerId,date,estimateMinutes:Number(estimate),
  }):null

  const run=async callback=>{
    setBusy(true);setError('');setNotice('')
    try{await callback();await refresh();setNotice('اطلاعات با موفقیت ذخیره شد.')}
    catch(e){setError(readableError(e))}
    finally{setBusy(false)}
  }
  const weekStart=shift(today(),-((new Date(today()+'T00:00:00Z').getUTCDay()+1)%7))
  const week=Array.from({length:7},(_,i)=>shift(weekStart,i))

  return <div className="ow-workspace">
    <div className="ow-summary">
      <article><span>دانشجوکار فعال</span><b>{n(active.length)}</b></article>
      <article><span>کار برنامه‌ریزی‌شده امروز</span><b>{n(todayTasks.length)}</b></article>
      <article><span>گزارش منتظر تأیید</span><b>{n(pending.length)}</b></article>
      <article><span>کل ساعات تأییدشده</span><b>{exactDuration(approvedMinutes)}</b></article>
    </div>
    <SectionTabs value={view} onChange={setView} options={[
      ['tasks','واگذاری کار'],['approvals','تأیید ساعات'],['availability','برنامه حضور'],['history','سابقه و خروجی'],
    ]}/>
    {loading&&<p className="ow-muted">در حال دریافت اطلاعات…</p>}
    <Message error={error} notice={notice}/>

    {view==='tasks'&&<>
      <section className="report-panel">
        <h2>کار جدید</h2>
        <form onSubmit={e=>{e.preventDefault();run(async()=>{
          await assignWorkerTask({workerId,unit:chosen?.unit,title,instructions,
            date,minutes:estimate,shortNoticeReason:reason})
          setTitle('');setInstructions('');setReason('')
        })}}>
          <div className="ow-fields ow-fields--three">
            <label className="report-field"><span>دانشجوکار</span>
              <select value={workerId} required onChange={e=>setWorkerId(e.target.value)}>
                <option value="">انتخاب کنید</option>
                {active.map(w=><option key={w.id} value={w.id}>{w.name} · {unitLabels[w.unit]}</option>)}
              </select>
            </label>
            <label className="report-field"><span>تاریخ اجرا (شمسی)</span>
              <JalaliDatePicker min={today()} value={date} onChange={setDate} ariaLabel="تاریخ اجرای کار"/>
            </label>
            <label className="report-field"><span>زمان استاندارد (دقیقه)</span>
              <input type="number" required min="1" max="1440" value={estimate} onChange={e=>setEstimate(e.target.value)}/>
            </label>
          </div>
          <div className="ow-fields ow-fields--two">
            <label className="report-field"><span>عنوان کار</span>
              <input required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثلاً ثبت ۱۰ جلد کتاب"/>
            </label>
            <label className="report-field"><span>شرح کوتاه</span>
              <input maxLength={3000} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="خروجی مورد انتظار را توضیح دهید"/>
            </label>
          </div>
          {isShort&&<label className="report-field ow-short-notice">
            <span>علت واگذاری نزدیک به موعد (الزامی)</span>
            <input required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="این کار برای امروز یا فردا برنامه‌ریزی شده است"/>
          </label>}
          {workerId&&assignmentCapacity&&<div className={
            ['overbooked','unavailable','not_configured','unknown'].includes(assignmentCapacity.code)
              ?'ow-capacity-warning':'ow-capacity-summary'
          } role="status" aria-live="polite">
            {assignmentCapacity.code==='unknown'
              ?<p><strong>ظرفیت قابل محاسبه نیست.</strong> برنامه یا زمان واردشده نیازمند بررسی است.</p>
              :assignmentCapacity.code==='not_configured'
                ?<p><strong>برنامه حضور برای این روز ثبت نشده است.</strong> این به معنی عدم حضور قطعی نیست؛ پیش از واگذاری هماهنگ کنید.</p>
                :<>
                  <p>ظرفیت ثبت‌شده: <b>{minutes(assignmentCapacity.availableMinutes)}</b>
                    {' · '}کارهای قبلی: <b>{minutes(assignmentCapacity.assignedMinutes)}</b>
                    {' · '}کار جدید: <b>{minutes(assignmentCapacity.proposedMinutes)}</b></p>
                  {assignmentCapacity.code==='unavailable'
                    ?<p><strong>هشدار عدم حضور:</strong> برای این روز ظرفیت صفر ثبت شده است.</p>
                    :assignmentCapacity.code==='overbooked'
                      ?<p><strong>هشدار بیش‌ازظرفیت:</strong> مجموع کارها
                         {' '}{minutes(-assignmentCapacity.remainingMinutes)} بیشتر از زمان حضور است.</p>
                      :<p>ظرفیت باقی‌مانده پس از واگذاری:
                         {' '}<b>{minutes(assignmentCapacity.remainingMinutes)}</b>
                         {assignmentCapacity.code==='full'?' · ظرفیت دقیقاً تکمیل می‌شود.':''}</p>}
                  {assignmentCapacity.exception&&<small>محاسبه بر اساس تغییر موقت همین روز است.</small>}
                </>}
            <details className="ow-context-help"><summary>توضیح محاسبه</summary>
              <small>ظرفیت، یک برآورد بر اساس اطلاعات فعلی است. ثبت کار در سرور با مجوزها و قواعد مستقل انجام می‌شود.</small>
            </details>
          </div>}
          <button className="report-btn report-btn--primary" type="submit" disabled={busy||!workerId}>واگذاری کار</button>
        </form>
      </section>
      <section className="report-panel">
        <div className="report-panel-heading">
          <h2>کارهای ثبت‌شده</h2>
          <small>{n(matchingTasks.length)} از {n(taskCounts.total)} کار</small>
        </div>
        <div className="ow-task-metrics" aria-label="خلاصه وضعیت کارهای ثبت‌شده">
          <span>باز: <b>{n(taskCounts.open)}</b></span>
          <span>منتظر بررسی: <b>{n(taskCounts.waiting)}</b></span>
          <span>نیازمند اصلاح: <b>{n(taskCounts.needsChanges)}</b></span>
          <span>تکمیل‌شده: <b>{n(taskCounts.completed)}</b></span>
        </div>
        <div className="ow-list-filters">
          <label className="report-field"><span>دانشجوکار</span>
            <select aria-label="فیلتر کار بر اساس دانشجوکار" value={taskWorkerId}
              onChange={e=>setListingFilter('taskWorkerId',e.target.value)}>
              <option value="">همه دانشجوکارها</option>
              {workers.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label className="report-field"><span>وضعیت کار</span>
            <select aria-label="فیلتر وضعیت کار" value={taskState}
              onChange={e=>setListingFilter('taskState',e.target.value)}>
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(stateLabels).map(([id,title])=><option key={id} value={id}>{title}</option>)}
            </select>
          </label>
          <label className="report-field"><span>جست‌وجوی عنوان</span>
            <input aria-label="جست‌وجوی عنوان کار" type="search" value={taskSearch}
              onChange={e=>setListingFilter('taskSearch',e.target.value)}
              placeholder="عنوان کار را بنویسید"/>
          </label>
          <label className="report-field"><span>ترتیب تاریخ برنامه</span>
            <select aria-label="ترتیب نمایش کارها" value={taskOrder}
              onChange={e=>setListingFilter('taskOrder',e.target.value)}>
              <option value="latest">جدیدترها ابتدا</option>
              <option value="oldest">قدیمی‌ترها ابتدا</option>
            </select>
          </label>
        </div>
        <details className="ow-context-help"><summary>راهنمای وضعیت کارها</summary>
          <p className="ow-muted">مراحل کار بر اساس وضعیت ثبت‌شده‌اند و زمان تأییدشده، درصد پیشرفت نیست.</p>
        </details>
        <div className="ow-list ow-task-results">
          {matchingTasks.slice(0,tasksShown).map(t=>{
            const detail=describeTaskWorkflow(t,reportByTask.get(t.id)||[])
            return <article className="ow-item" key={t.id}>
              <div className="ow-item-header"><strong>{t.title}</strong>
                <span className="ow-status">{detail.label}</span>
              </div>
              <small>{label(t.worker_id,workers)} · {pretty(t.planned_date)} · زمان استاندارد: {minutes(t.estimate_minutes)}</small>
              {(detail.waitingCount>0||detail.approvedMinutes>0)&&<div className="ow-task-progress">
                {detail.waitingCount>0&&<span>{n(detail.waitingCount)} گزارش منتظر تأیید</span>}
                {detail.approvedMinutes>0&&<span>زمان تأییدشده: {exactDuration(detail.approvedMinutes)}</span>}
              </div>}
              <details className="ow-task-detail">
                <summary>جزئیات</summary>
                <p className="ow-muted">{detail.step===null?'وضعیت لغوشده یا نامشخص':`مرحله ${n(detail.step)} از ۴ · ${detail.label}`}
                  {' · '}{n(detail.reportCount)} گزارش ثبت‌شده</p>
              </details>
              {t.short_notice&&<p className="ow-warning">واگذاری کوتاه‌مدت: {t.short_notice_reason}</p>}
            </article>
          })}
          {!matchingTasks.length&&<p className="ow-muted">{taskCounts.total?'کاری با فیلترهای انتخاب‌شده پیدا نشد.':'هنوز کاری واگذار نشده است.'}</p>}
        </div>
        {matchingTasks.length>tasksShown&&<div className="ow-paged-more">
          <span className="ow-muted">نمایش {n(tasksShown)} کار از {n(matchingTasks.length)}</span>
          <button type="button" className="report-btn report-btn--light"
            onClick={()=>setTasksShown(count=>count+100)}>نمایش ۱۰۰ کار بیشتر</button>
        </div>}
      </section>
    </>}

    {view==='approvals'&&<section className="report-panel">
      <div className="report-panel-heading">
        <h2>گزارش‌های منتظر تأیید</h2>
        <small>{n(visibleApprovals.length)} از {n(pending.length)} گزارش</small>
      </div>
      <details className="ow-context-help"><summary>راهنمای صف بررسی</summary>
        <p className="ow-muted">گزارش‌های قدیمی‌تر در ابتدا نمایش داده می‌شوند؛ فیلترها مجوزها را تغییر نمی‌دهند.</p>
      </details>
      <div className="ow-approval-filters">
        <label className="report-field"><span>دانشجوکار</span>
          <select aria-label="فیلتر صف تأیید بر اساس دانشجوکار" value={approvalWorkerId}
            onChange={e=>setListingFilter('approvalWorkerId',e.target.value)}>
            <option value="">همه دانشجوکارها</option>
            {workers.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="report-field"><span>نوع درخواست زمان</span>
          <select aria-label="فیلتر نوع درخواست زمان" value={approvalKind}
            onChange={e=>setListingFilter('approvalKind',e.target.value)}>
            <option value="">همه درخواست‌ها</option>
            <option value="extra">با درخواست زمان اضافه</option>
            <option value="standard">بدون زمان اضافه</option>
            <option value="unknown">بدون زمان استاندارد قابل تشخیص</option>
          </select>
        </label>
      </div>
      <div className="ow-list ow-approval-results">
        {visibleApprovals.slice(0,approvalsShown).map(e=><ApprovalCard key={e.id} entry={e}
          task={taskById.get(e.task_id)}
          worker={workers.find(w=>w.id===e.worker_id)} onDone={refresh}/>)}
        {!visibleApprovals.length&&<p className="ow-muted">
          {pending.length?'گزارشی با فیلتر انتخاب‌شده در صف وجود ندارد.':'گزارشی در صف بررسی وجود ندارد.'}
        </p>}
      </div>
      {visibleApprovals.length>approvalsShown&&<div className="ow-paged-more">
        <span className="ow-muted">نمایش {n(approvalsShown)} گزارش از {n(visibleApprovals.length)}</span>
        <button type="button" className="report-btn report-btn--light"
          onClick={()=>setApprovalsShown(count=>count+25)}>نمایش ۲۵ گزارش بیشتر</button>
      </div>}
    </section>}

    {view==='availability'&&<section className="report-panel">
      <h2>ظرفیت و برنامه دانشجوکارها</h2>
      <label className="report-field ow-worker-selector"><span>دانشجوکار</span>
        <select value={workerId} onChange={e=>setWorkerId(e.target.value)}>
          <option value="">انتخاب کنید</option>
          {active.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      {workerId&&<>
        <div className="ow-week-grid">
          {week.map(d=>{
            const forecast=assessAssignmentCapacity(data,{workerId,date:d,estimateMinutes:0})
            const warning=['overbooked','unavailable','not_configured','unknown'].includes(forecast.code)
            return <article key={d} className={warning?'ow-week-alert':undefined}>
              <strong>{dayLabels.find(x=>x[0]===isoWeekday(d))?.[1]}</strong>
              <small>{pretty(d)}</small>
              <b>{forecast.availableMinutes===null?'برنامه نامشخص':minutes(forecast.availableMinutes)}</b>
              <small>کارهای قبلی: {forecast.assignedMinutes===null?'—':minutes(forecast.assignedMinutes)}</small>
              {forecast.code==='overbooked'&&<small>بیش از ظرفیت</small>}
              {forecast.code==='unavailable'&&<small>عدم حضور ثبت‌شده</small>}
            </article>
          })}
        </div>
        <ScheduleEditor key={workerId} workerId={workerId} data={data} onSaved={refresh}/>
      </>}
    </section>}

    {view==='history'&&<section className="report-panel">
      <div className="report-panel-heading">
        <h2>سابقه ساعات و خروجی</h2>
        <button className="report-btn report-btn--primary" type="button"
          disabled={loading||invalidHistoryRange||(!historyData.tasks.length&&!historyData.time_entries.length)}
          onClick={()=>exportOpsExcel(historyData,historyFiltersActive)}>
          {historyFiltersActive?'خروجی Excel نتایج فیلتر':'خروجی Excel همه'}
        </button>
      </div>
      <div className="ow-history-filter">
        <label className="report-field ow-worker-selector"><span>فیلتر بر اساس دانشجوکار</span>
          <select value={historyWorkerId} onChange={e=>setHistoryWorkerId(e.target.value)}>
            <option value="">همه دانشجوکارها</option>
            {workers.map(w=><option key={w.id} value={w.id}>
              {w.name} · {unitLabels[w.unit]||w.unit}
            </option>)}
          </select>
        </label>
        <details className="ow-context-help"><summary>درباره فیلترها</summary>
          <p className="ow-muted">فیلترها فقط سوابق و Excel را محدود می‌کنند و وضعیت حساب یا آمار کلی پرونده را تغییر نمی‌دهند.</p>
        </details>
      </div>
      <div className="ow-history-extra" aria-label="فیلترهای گزارش مدیریتی">
        <label className="report-field"><span>واحد همکاری</span>
          <select value={historyUnit} onChange={e=>setHistoryFilter('historyUnit',e.target.value)}>
            <option value="">همه واحدها</option>
            {Object.entries(unitLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="report-field"><span>وضعیت گزارش</span>
          <select value={historyReview} onChange={e=>setHistoryFilter('historyReview',e.target.value)}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(reviewLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}
            <option value="without_report">کار بدون گزارش</option>
          </select>
        </label>
        <div className="report-field"><span>از تاریخ انجام (شمسی)</span>
          <JalaliDatePicker value={historyFrom}
            onChange={date=>setHistoryFilter('historyFrom',date)} ariaLabel="شروع بازه سابقه"/>
          {historyFrom&&<button className="ow-clear-date" type="button"
            onClick={()=>setHistoryFilter('historyFrom','')}>حذف تاریخ شروع</button>}
        </div>
        <div className="report-field"><span>تا تاریخ انجام (شمسی)</span>
          <JalaliDatePicker value={historyTo}
            onChange={date=>setHistoryFilter('historyTo',date)} ariaLabel="پایان بازه سابقه"/>
          {historyTo&&<button className="ow-clear-date" type="button"
            onClick={()=>setHistoryFilter('historyTo','')}>حذف تاریخ پایان</button>}
        </div>
      </div>
      <div className="ow-history-filter-footer">
        <p className="ow-muted">
          {historyFiltersActive&&<>{n(historySummary.taskCount)} کار · {n(historySummary.reportCount)} گزارش</>}
        </p>
        {historyFiltersActive&&<button type="button" className="report-btn report-btn--light"
          onClick={()=>setNavigation(previous=>({...previous,
            historyWorkerId:'',historyUnit:'',historyFrom:'',historyTo:'',historyReview:'',
          }))}>پاک‌کردن همه فیلترها</button>}
      </div>
      {invalidHistoryRange&&<div className="report-alert report-alert--error" role="alert">
        تاریخ شروع نباید بعد از تاریخ پایان باشد؛ بازه را اصلاح کنید.
      </div>}
      {selectedHistoryWorker&&<section className="ow-worker-profile" aria-label="پروفایل عملکرد دانشجوکار">
        <div className="ow-profile-heading">
          <div>
            <h3>پرونده عملکرد: {selectedHistoryWorker.name}</h3>
            <p className="ow-muted">
              {unitLabels[selectedHistoryWorker.unit]||selectedHistoryWorker.unit||'واحد نامشخص'}
              {selectedHistoryWorker.major&&<> · {selectedHistoryWorker.major}</>}
              {selectedHistoryWorker.entry_year&&<> · ورودی {n(selectedHistoryWorker.entry_year)}</>}
            </p>
          </div>
          <span className="ow-status">{workerStateLabels[selectedHistoryWorker.state]||selectedHistoryWorker.state}</span>
        </div>
        <div className="ow-profile-metrics">
          <div><span>کل کارهای واگذارشده</span><b>{n(overallWorkerSummary.taskCount)}</b></div>
          <div><span>کارهای باز</span><b>{n(overallWorkerSummary.openCount)}</b></div>
          <div><span>گزارش منتظر تأیید</span><b>{n(overallWorkerSummary.pendingCount)}</b></div>
          <div><span>مجموع ساعات تأییدشده</span><b>{exactDuration(overallWorkerSummary.approvedMinutes)}</b></div>
        </div>
        <WorkerLifecycleReadOnlyPreview worker={selectedHistoryWorker}/>
      </section>}
      <div className="report-panel-heading">
        <h3>{historyFiltersActive?'سوابق منطبق با فیلتر':'سوابق فعالیت همه دانشجوکارها'}</h3>
        <small>{n(historySummary.reportCount)} گزارش · {exactDuration(historySummary.approvedMinutes)} تأییدشده</small>
      </div>
      <div className="ow-list">
        {historyData.time_entries.slice(0,historyShown).map(e=>(
          <article className="ow-item" key={e.id}>
            <strong>{label(e.worker_id,workers)} · {data.tasks?.find(t=>t.id===e.task_id)?.title||'کار'}</strong>
            <small>{pretty(e.work_date)} · {reviewLabels[e.review_state]||e.review_state}</small>
            <p>درخواست: {minutes(e.reported_minutes)} · تأیید:
              {e.review_state==='approved'?minutes(e.approved_minutes):'تأیید نشده'}
            </p>
            {e.extra_time_reason_code&&<small>دلیل درخواست اضافه: {extraTimeReasons[e.extra_time_reason_code]||e.extra_time_reason_code}
              {e.extra_time_reason_text&&<> · {e.extra_time_reason_text}</>}
            </small>}
            {e.review_note&&<small>توضیح مدیر: {e.review_note}</small>}
          </article>
        ))}
        {historyData.time_entries.length>historyShown&&<div className="ow-history-load-more">
          <span className="ow-muted">نمایش {n(historyShown)} گزارش از {n(historyData.time_entries.length)} گزارش فیلترشده؛ خروجی Excel شامل همه نتایج است.</span>
          <button type="button" className="report-btn report-btn--light"
            onClick={()=>setHistoryShown(count=>count+100)}>نمایش ۱۰۰ گزارش بیشتر</button>
        </div>}
        {!historyData.time_entries.length&&<p className="ow-muted">
          {historyWithoutReport.length?'در این فیلتر گزارشی وجود ندارد؛ کارهای بدون گزارش را در بخش زیر ببینید.':
            historyFiltersActive?'نتیجه‌ای برای فیلترهای انتخاب‌شده پیدا نشد.':'هنوز سابقه‌ای وجود ندارد.'}
        </p>}
      </div>
      {historyWithoutReport.length>0&&<div className="ow-history-unreported">
        <div className="report-panel-heading">
          <h3>کارهای بدون گزارش</h3><small>{n(historyWithoutReport.length)} کار</small>
        </div>
        <div className="ow-list">
          {historyWithoutReport.map(task=><article className="ow-item" key={task.id}>
            <div className="ow-item-header">
              <strong>{task.title}</strong>
              <span className="ow-status">{stateLabels[task.state]||task.state}</span>
            </div>
            <small>{label(task.worker_id,workers)} · {unitLabels[task.unit]||task.unit||'واحد نامشخص'}
              {' · '}برنامه: {pretty(task.planned_date)} · برآورد: {minutes(task.estimate_minutes)}</small>
          </article>)}
        </div>
      </div>}
    </section>}
  </div>
}
function WorkerTaskCard({task,onSaved}) {
  const [date,setDate]=useState(today())
  const [requestExtra,setRequestExtra]=useState(false)
  const [requested,setRequested]=useState(String(task.estimate_minutes))
  const [reasonCode,setReasonCode]=useState('')
  const [reasonText,setReasonText]=useState('')
  const [completionConfirmed,setCompletionConfirmed]=useState(false)
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const keyRef=useRef(crypto.randomUUID())
  const ready=['assigned','in_progress','needs_changes'].includes(task.state)
  const standard=Number(task.estimate_minutes)
  const requestedMinutes=requestExtra?Number(requested):standard
  const extraValid=!requestExtra || (
    Number.isInteger(requestedMinutes)&&requestedMinutes>standard&&requestedMinutes<=1440
    && Boolean(reasonCode)&&reasonText.trim().length>=10&&reasonText.trim().length<=600
  )
  const perform=async fn=>{
    setBusy(true);setError('')
    try{await fn();await onSaved()}
    catch(e){setError(readableError(e))}
    finally{setBusy(false)}
  }
  return <article className="ow-item">
    <div className="ow-item-header"><strong>{task.title}</strong><span className="ow-status">{stateLabels[task.state]}</span></div>
    <small>{pretty(task.planned_date)} · زمان استاندارد قابل ثبت: {minutes(standard)}</small>
    {ready&&<details className="ow-worker-action-detail"><summary>ثبت نتیجه و گزارش کار</summary>
      {task.instructions&&<p>{task.instructions}</p>}
      <form onSubmit={e=>{e.preventDefault();if(!completionConfirmed||!extraValid)return;perform(async()=>{
      await submitMyTime({taskId:task.id,date,minutes:requestedMinutes,note,
        clientSubmissionId:keyRef.current,
        extraReasonCode:requestExtra?reasonCode:null,
        extraReasonText:requestExtra?reasonText.trim():null})
      keyRef.current=crypto.randomUUID()
    })}}>
      <div className="ow-fields ow-fields--two">
        <label className="report-field"><span>تاریخ انجام کار (شمسی)</span>
          <JalaliDatePicker value={date} max={today()} min={shift(today(),-90)}
            onChange={setDate} ariaLabel="تاریخ انجام کار"/>
        </label>
        <div className="ow-standard-credit">
          <span>زمان استاندارد این کار</span><b>{minutes(standard)}</b>
          <small>با تأیید انجام کار، همین زمان برای بررسی مدیر ارسال می‌شود؛ حتی اگر زودتر تمام کرده باشید.</small>
        </div>
      </div>
      <label className="ow-checkbox">
        <input type="checkbox" checked={completionConfirmed} onChange={e=>setCompletionConfirmed(e.target.checked)}/>
        کار محول‌شده را انجام داده‌ام و گزارش من برای بررسی مدیر آماده است.
      </label>
      <label className="report-field"><span>خلاصه نتیجه کار (اختیاری)</span>
        <input maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}
          placeholder="مثلاً تعداد منابع ثبت‌شده یا نتیجه کار"/>
      </label>
      <label className="ow-checkbox ow-extra-toggle">
        <input type="checkbox" checked={requestExtra} onChange={e=>{
          const checked=e.target.checked
          setRequestExtra(checked)
          if(!checked){setRequested(String(standard));setReasonCode('');setReasonText('')}
        }}/>
        درخواست ثبت زمان بیشتر از زمان استاندارد دارم
      </label>
      {requestExtra&&<div className="ow-extra-panel">
        <p>زمان اضافه فقط پس از بررسی و تأیید مدیر قابل ثبت است. دلیل دقیق افزایش زمان را وارد کنید.</p>
        <div className="ow-fields ow-fields--two">
          <label className="report-field"><span>زمان درخواستی کل (دقیقه)</span>
            <input type="number" min={standard+1} max="1440" required
              value={requested} onChange={e=>setRequested(e.target.value)}/>
          </label>
          <label className="report-field"><span>علت اصلی افزایش زمان</span>
            <select required value={reasonCode} onChange={e=>setReasonCode(e.target.value)}>
              <option value="">انتخاب کنید</option>
              {Object.entries(extraTimeReasons).map(([code,title])=><option key={code} value={code}>{title}</option>)}
            </select>
          </label>
        </div>
        <label className="report-field"><span>توضیح دلیل افزایش زمان (الزامی؛ حداقل ۱۰ نویسه)</span>
          <textarea required minLength={10} maxLength={600} rows={2}
            value={reasonText} onChange={e=>setReasonText(e.target.value)}
            placeholder="چه مشکلی رخ داد و چرا زمان استاندارد کافی نبود؟"/>
        </label>
        {Number.isFinite(requestedMinutes)&&requestedMinutes>standard&&<p className="ow-muted">
          زمان اضافه درخواستی: {minutes(requestedMinutes-standard)}
        </p>}
      </div>}
      <div className="ow-actions">
        {task.state!=='in_progress'&&<button type="button" className="report-btn report-btn--light"
          onClick={()=>perform(()=>startMyTask(task.id))} disabled={busy}>شروع کار</button>}
        <button type="submit" className="report-btn report-btn--primary"
          disabled={busy||!completionConfirmed||!extraValid}>
          {requestExtra?'ارسال درخواست زمان بیشتر برای بررسی':'ثبت انجام کار با زمان استاندارد'}
        </button>
      </div>
      </form>
    </details>}
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
  </article>
}
export function WorkerOperations({profile,navigation,setNavigation}) {
  const [data,setData]=useState({tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
  const [localNavigation,setLocalNavigation]=useState({section:'tasks',taskRange:'today'})
  const selected=navigation||localNavigation
  const updateNavigation=patch=>{
    const fn=previous=>({...previous,...patch})
    ;(setNavigation||setLocalNavigation)(fn)
  }
  const section=['tasks','availability','history'].includes(selected.section)?selected.section:'tasks'
  const taskRange=['today','week','all'].includes(selected.taskRange)?selected.taskRange:'today'
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const refresh=async()=>{
    setLoading(true);setError('')
    try{setData(await getMyWork()||{tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})}
    catch(e){setError(readableError(e))}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[profile.worker_id])
  const records=data.time_entries||[]
  const approved=records.filter(x=>x.review_state==='approved')
  const total=approved.reduce((sum,e)=>sum+Number(e.approved_minutes||0),0)
  const tasks=data.tasks||[]
  const week=persianWeekBounds(today())
  const visible=taskRange==='today'?tasks.filter(t=>t.planned_date===today()):
    taskRange==='week'?tasks.filter(t=>t.planned_date>=week.start&&t.planned_date<=week.end):tasks
  return <div className="ow-workspace ow-worker-workspace">
    <div className="ow-summary">
      <article><span>کارهای باز</span><b>{n(tasks.filter(t=>!['completed','cancelled'].includes(t.state)).length)}</b></article>
      <article><span>گزارش منتظر بررسی</span><b>{n(records.filter(e=>e.review_state==='submitted').length)}</b></article>
      <article><span>ساعات تأییدشده</span><b>{exactDuration(total)}</b></article>
    </div>
    <SectionTabs value={section} onChange={next=>updateNavigation({section:next})} options={[
      ['tasks','کارها'],['availability','زمان حضور'],['history','سابقه من'],
    ]}/>
    {loading&&<p className="ow-muted" role="status">در حال دریافت برنامه…</p>}
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
    {section==='tasks'&&<section className="report-panel">
      <div className="ow-worker-list-heading">
        <h2>کارها</h2>
        <div className="ow-range-switch" role="group" aria-label="بازه نمایش کارها">
          {[['today','امروز'],['week','این هفته'],['all','همه']].map(([id,title])=>
            <button type="button" key={id} aria-pressed={taskRange===id}
              className={taskRange===id?'is-selected':''}
              onClick={()=>updateNavigation({taskRange:id})}>{title}</button>)}
        </div>
      </div>
      <div className="ow-list ow-worker-tasks">
        {visible.map(t=><WorkerTaskCard key={t.id} task={t} onSaved={refresh}/>)}
        {!visible.length&&<p className="ow-muted">کاری برای این بازه ثبت نشده است.</p>}
      </div>
    </section>}
    {section==='availability'&&<section className="report-panel">
      <h2>برنامه حضور</h2>
      <ScheduleEditor workerId={profile.worker_id} data={data} onSaved={refresh}/>
    </section>}
    {section==='history'&&<section className="report-panel">
      <h2>سابقه عملکرد من</h2>
      <div className="ow-list ow-worker-history">
        {records.map(e=><article className="ow-item" key={e.id}>
          <strong>{tasks.find(t=>t.id===e.task_id)?.title||'کار'}</strong>
          <small>{pretty(e.work_date)} · {reviewLabels[e.review_state]||e.review_state}</small>
          <details className="ow-context-help"><summary>جزئیات گزارش</summary>
            <p>درخواست‌شده: {minutes(e.reported_minutes)} · تأیید:
              {e.review_state==='approved'?minutes(e.approved_minutes):'هنوز تأیید نشده'}</p>
            {e.extra_time_reason_code&&<small>دلیل زمان اضافه: {extraTimeReasons[e.extra_time_reason_code]} · {e.extra_time_reason_text}</small>}
            {e.review_note&&<small>نظر مدیر: {e.review_note}</small>}
          </details>
        </article>)}
        {!records.length&&<p className="ow-muted">هنوز گزارشی ثبت نکرده‌اید.</p>}
      </div>
    </section>}
  </div>
}
