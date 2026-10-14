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
import { MAX_DAILY_WINDOWS, selectedWeeklyWindows, validateDailyWindows, persianWeekBounds, suggestNextWindow } from './lib/weeklyScheduleGrid.mjs'
import { persianMonthCells, previousPersianMonth, nextPersianMonth, persianMonthBounds } from './lib/persianMonthCalendar.mjs'
import { projectDayPresence } from './lib/presenceDayProjection.mjs'
import TaskAssignmentEditor from './components/TaskAssignmentEditor'
import { getAdminWorkV2,getMyWorkV2,getMyWorkerProfileV2,getMyProfileChangeRequests,
 requestProfileChange,reviewProfileChange } from './lib/operationsV2'

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
function ScheduleEditor({workerId,onSaved,data,onPlanAssignment}) {
  const [effective,setEffective]=useState(today())
  const [editingDay,setEditingDay]=useState(null)
  const [editingSlot,setEditingSlot]=useState(null)
  const [draftWindows,setDraftWindows]=useState([])
  const [monthAnchor,setMonthAnchor]=useState(today())
  const [selectedDate,setSelectedDate]=useState('')
  const [exceptionKind,setExceptionKind]=useState('replacement_intervals')
  const [exceptionWindows,setExceptionWindows]=useState([])
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [saveState,setSaveState]=useState('')
  const month=persianMonthCells(monthAnchor)
  const calendarData=data||{}
  const weeklyValidation=validateDailyWindows(draftWindows)
  const exceptionValidation=exceptionKind==='unavailable'
    ? {ok:true,intervals:[],minutes:0}
    : validateDailyWindows(exceptionWindows)
  const selectedWeekDate=editingDay===null?'':firstMatchingWeekday(effective,editingDay)
  const weekPreview=editingDay===null||!weeklyValidation.ok?null:
    assessAvailabilityOverride(calendarData,workerId,selectedWeekDate,weeklyValidation.intervals)
  const exceptionPreview=!selectedDate||!exceptionValidation.ok?null:
    assessAvailabilityOverride(calendarData,workerId,selectedDate,exceptionValidation.intervals,
      {unavailable:exceptionKind==='unavailable'})

  useEffect(()=>{
    setEditingDay(null);setEditingSlot(null);setDraftWindows([]);setSelectedDate('')
    setError('');setNotice('');setSaveState('')
  },[workerId])
  useEffect(()=>{
    setEditingDay(null);setEditingSlot(null);setDraftWindows([]);setSaveState('')
  },[effective])

  const openSlot=(id,index)=>{
    if(busy)return
    const date=firstMatchingWeekday(effective,id)
    const windows=selectedWeeklyWindows(calendarData.weekly_slots||[],workerId,id,date)
    if(index>windows.length)return
    if(editingDay===id&&editingSlot===index){setEditingDay(null);setEditingSlot(null);return}
    const next=index===windows.length?[...windows,suggestNextWindow(windows)]:windows
    setEditingDay(id);setEditingSlot(index);setDraftWindows(next)
    setError('');setNotice('');setSaveState('')
  }
  const deleteSlot=()=>{
    if(editingSlot===null)return
    setDraftWindows(current=>current.filter((_,i)=>i!==editingSlot))
    setEditingSlot(null)
  }
  const chooseMonthDay=date=>{
    if(busy)return
    if(selectedDate===date){setSelectedDate('');return}
    const exception=(calendarData.exceptions||[]).find(ex=>ex.worker_id===workerId&&ex.local_date===date)
    const kind=exception?.kind==='unavailable'?'unavailable':'replacement_intervals'
    let windows=(exception?.kind==='replacement_intervals'&&Array.isArray(exception.intervals))
      ? exception.intervals.map(x=>({
          start:minutesToClock(Number(x.start??x.start_minute)),
          end:minutesToClock(Number(x.end??x.end_minute)),
        }))
      : selectedWeeklyWindows(calendarData.weekly_slots||[],workerId,isoWeekday(date),date)
    setSelectedDate(date)
    setExceptionKind(kind)
    setExceptionWindows(windows.length?windows:[suggestNextWindow([])])
    setNote(exception?.note||'')
    setError('');setNotice('');setSaveState('')
  }
  const save=async(command,kind)=>{
    if(busy)return
    setBusy(true);setError('');setNotice('');setSaveState('')
    try{
      await command()
      await onSaved?.()
      setSaveState(kind==='weekly'?'برنامه همین روز ذخیره شد.':'استثنای این تاریخ ذخیره شد.')
      if(kind==='weekly'){setEditingDay(null);setEditingSlot(null)}
      else setSelectedDate('')
    }catch(e){
      setError(readableError(e))
      setSaveState('ذخیره انجام نشد؛ اطلاعات واردشده حفظ شده‌اند.')
    }finally{setBusy(false)}
  }
  const submitWeek=event=>{
    event.preventDefault()
    if(!workerId||editingDay===null||!weeklyValidation.ok||busy)return
    if(!draftWindows.length&&!window.confirm(
      'برنامه ثابت این روز حذف می‌شود. نبود برنامه به معنی عدم حضور قطعی نیست. ادامه می‌دهید؟'))return
    void save(()=>setWeeklyDay(workerId,editingDay,weeklyValidation.intervals,effective),'weekly')
  }
  const submitDate=event=>{
    event.preventDefault()
    if(!workerId||!selectedDate||selectedDate<today()||!exceptionValidation.ok||busy)return
    if(exceptionKind==='replacement_intervals'&&!exceptionWindows.length)return
    void save(()=>setDateException(workerId,selectedDate,exceptionKind,
      exceptionValidation.intervals,note),'exception')
  }
  const setMonth=direction=>{
    setMonthAnchor(previous=>direction==='previous'
      ?previousPersianMonth(previous):nextPersianMonth(previous))
    setSelectedDate('');setError('');setSaveState('')
  }
  const editWindow=(setter,index,field,value)=>
    setter(current=>current.map((w,i)=>i===index?{...w,[field]:value}:w))
  const renderWindows=(windows,setter,prefix)=>(
    <div className="ow-inline-windows">
      {windows.map((slot,i)=><div className="ow-inline-window" key={i}>
        <span className="ow-inline-window-label">نوبت {n(i+1)}</span>
        <label className="report-field"><span>از</span><input type="text" inputMode="numeric"
          dir="ltr" required maxLength={5} placeholder="08:00"
          value={slot.start} onChange={e=>editWindow(setter,i,'start',e.target.value)}/></label>
        <label className="report-field"><span>تا</span><input type="text" inputMode="numeric"
          dir="ltr" required maxLength={5} placeholder="09:00"
          value={slot.end} onChange={e=>editWindow(setter,i,'end',e.target.value)}/></label>
        <button type="button" className="ow-mini-btn" disabled={busy}
          aria-label={`حذف نوبت ${i+1} ${prefix}`}
          onClick={()=>setter(current=>current.filter((_,j)=>j!==i))}>حذف</button>
      </div>)}
      <div className="ow-inline-tools">
        <button type="button" className="ow-mini-btn" disabled={busy||windows.length>=MAX_DAILY_WINDOWS}
          onClick={()=>setter(current=>[...current,suggestNextWindow(current)])}>
          + نوبت ({n(windows.length)} از {n(MAX_DAILY_WINDOWS)})
        </button>
      </div>
    </div>
  )
  if(!workerId)return <p className="ow-muted">یک دانشجوکار انتخاب کنید.</p>
  return <div className="ow-presence-hub">
    <section className="ow-presence-week" aria-label="برنامه ثابت هفتگی">
      <div className="ow-presence-section-title">
        <h3>برنامه ثابت هفتگی</h3>
        <details className="ow-quiet-details"><summary>تاریخ اعمال</summary>
          <div className="report-field">
            <span>از تاریخ (شمسی)</span>
            <JalaliDatePicker min={today()} value={effective} onChange={setEffective}
              ariaLabel="تاریخ شروع اعمال برنامه ثابت"/>
          </div>
        </details>
      </div>
      <div className="ow-week-grid-header" aria-hidden="true">
        <span>روز</span>{[1,2,3,4].map(i=><span key={i}>نوبت {n(i)}</span>)}
      </div>
      <div className="ow-week-grid">
        {dayLabels.map(([id,name])=>{
          const date=firstMatchingWeekday(effective,id)
          const slots=selectedWeeklyWindows(calendarData.weekly_slots||[],workerId,id,date)
          return <div className="ow-week-row-shell" key={id}>
            <div className="ow-week-row">
              <span className="ow-week-day"><strong>{name}</strong></span>
              {[0,1,2,3].map(index=>{
                const slot=slots[index]
                const isEditing=editingDay===id&&editingSlot===index
                return <div key={index} className={'ow-week-cell'+(isEditing?' is-editing':'')}>
                  {isEditing?<form className="ow-slot-editor" onSubmit={submitWeek}
                    aria-label={`ثبت نوبت ${index+1} ${name}`}>
                    <label><span className="ow-sr-only">شروع</span><input type="text"
                      inputMode="numeric" dir="ltr" required maxLength={5}
                      value={draftWindows[index]?.start||''} placeholder="08:00"
                      onChange={e=>editWindow(setDraftWindows,index,'start',e.target.value)}/></label>
                    <label><span className="ow-sr-only">پایان</span><input type="text"
                      inputMode="numeric" dir="ltr" required maxLength={5}
                      value={draftWindows[index]?.end||''} placeholder="09:00"
                      onChange={e=>editWindow(setDraftWindows,index,'end',e.target.value)}/></label>
                    <div className="ow-slot-actions">
                      <button type="submit" title="ذخیره نوبت" aria-label="ذخیره همین روز"
                        disabled={busy||!weeklyValidation.ok}>✓</button>
                      {slot&&<button type="button" title="حذف نوبت" aria-label="حذف نوبت"
                        onClick={deleteSlot} disabled={busy}>×</button>}
                      <button type="button" title="انصراف" aria-label="انصراف"
                        onClick={()=>{setEditingDay(null);setEditingSlot(null)}}>↩</button>
                    </div>
                    {!weeklyValidation.ok&&<small role="alert">{weeklyValidation.error}</small>}
                    {weekPreview?.code==='conflict'&&<small role="status">
                      تعارض با کارهای قبلی؛ آن‌ها حذف نمی‌شوند.</small>}
                  </form>:<button type="button"
                    aria-label={`ویرایش برنامه ${name} نوبت ${index+1}`}
                    className={'ow-week-slot'+(slot?'':' is-empty')}
                    title={slot?'ویرایش نوبت':'افزودن نوبت'}
                    disabled={busy||index>slots.length} onClick={()=>openSlot(id,index)}>
                    {slot?<span dir="ltr">{slot.start}–{slot.end}</span>:
                      <span aria-hidden="true">＋</span>}
                  </button>}
                </div>
              })}
            </div>
            {editingDay===id&&editingSlot===null&&<div className="ow-slot-delete-confirm">
              <span>نوبت حذف شد؛ برای ثبت برنامه جدید این روز، تغییر را ذخیره کنید.</span>
              <button type="button" className="ow-mini-btn"
                onClick={()=>{setEditingDay(null);setEditingSlot(null)}}>انصراف</button>
              <button type="button" className="ow-mini-btn" disabled={busy||!weeklyValidation.ok}
                onClick={()=>submitWeek({preventDefault:()=>{}})}>ذخیره حذف</button>
            </div>}
          </div>
        })}
      </div>
      <small className="ow-muted">هر روز مستقل ذخیره می‌شود. خانه خالی یعنی برنامه نامشخص، نه غیبت قطعی.</small>
    </section>
    <section className="ow-presence-month" aria-label="تقویم حضور و استثناهای روزانه">
      <div className="ow-presence-section-title ow-month-heading">
        <h3>تقویم ماهانه · {month.title}</h3>
        <div className="ow-month-navigation">
          <button className="ow-mini-btn" type="button" onClick={()=>setMonth('previous')}
            aria-label="ماه پیشین">ماه قبل</button>
          <button className="ow-mini-btn" type="button" onClick={()=>setMonthAnchor(today())}
            aria-label="بازگشت به ماه جاری">امروز</button>
          <button className="ow-mini-btn" type="button" onClick={()=>setMonth('next')}
            aria-label="ماه بعد">ماه بعد</button>
        </div>
      </div>
      <div className="ow-month-weekdays" aria-hidden="true">
        {['ش','ی','د','س','چ','پ','ج'].map((name,i)=><span key={i}>{name}</span>)}
      </div>
      <div className="ow-month-grid" role="group" aria-label={month.title}>
        {month.days.map((day,index)=>{
          if(!day)return <span className="ow-month-blank" key={'blank-'+index}/>
          const daily=projectDayPresence(calendarData,workerId,day.date)
          const hasException=['replacement','unavailable'].includes(daily.kind)
          const tasks=(calendarData.tasks||[]).filter(t=>t.worker_id===workerId
            &&t.planned_date===day.date&&t.state!=='cancelled')
          const timings=daily.windows.map(w=>w.start+'–'+w.end).join('، ')
          const heading=daily.kind==='unavailable'?'عدم حضور':
            daily.kind==='replacement'?'تغییر موقت':'برنامه ثابت'
          return <button type="button" key={day.date}
            className={'ow-month-day'+(selectedDate===day.date?' is-selected':'')
              +(day.date===today()?' is-today':'')
              +(hasException?' has-exception':'')}
            onClick={()=>chooseMonthDay(day.date)} disabled={busy}
            aria-pressed={selectedDate===day.date}
            title={`${pretty(day.date)}: ${daily.kind==='unknown'?'برنامه نامشخص':heading+' '+timings}`}
            aria-label={`${pretty(day.date)}؛ ${daily.kind==='unknown'?'برنامه نامشخص':heading+' '+timings}؛ ${n(tasks.length)} کار`}>
            <b>{n(day.day)}</b>
            {daily.kind==='unavailable'?<small>عدم حضور</small>:
              daily.windows.length?<small className="ow-day-times" dir="ltr">
                {daily.windows.length===1?timings:`${daily.windows.length} بازه · ${daily.windows[0].start}`}
              </small>:null}
            {hasException&&daily.kind!=='unavailable'&&<i className="ow-exception-mark">تغییر</i>}
            {tasks.slice(0,2).map(t=><small className="ow-day-task" key={t.id} title={t.title}>{t.title}</small>)}
            {tasks.length>2&&<small className="ow-task-count">+{n(tasks.length-2)} کار</small>}
          </button>
        })}
      </div>
      {selectedDate&&<form className="ow-exception-inline" onSubmit={submitDate}>
        <div className="ow-presence-section-title">
          <h4>تغییر موقت · {pretty(selectedDate)}</h4>
          <button type="button" className="ow-mini-btn" onClick={()=>setSelectedDate('')}>بستن</button>
        </div>
        <p className="ow-muted ow-selected-current">
          {(()=>{
            const current=projectDayPresence(calendarData,workerId,selectedDate)
            return current.kind==='unknown'?'برنامه فعلی: نامشخص':
              current.kind==='unavailable'?'وضعیت فعلی: عدم حضور ثبت‌شده':
              'برنامه فعلی: '+current.windows.map(w=>w.start+'–'+w.end).join('، ')
          })()}
        </p>
        {(calendarData.tasks||[]).some(t=>t.worker_id===workerId&&t.planned_date===selectedDate)&&
          <div className="ow-selected-day-tasks"><b>کارهای این تاریخ</b>
            {(calendarData.tasks||[]).filter(t=>t.worker_id===workerId&&t.planned_date===selectedDate)
              .map(t=><div key={t.id}><strong>{t.title}</strong>
                <small>{stateLabels[t.state]||t.state} · {minutes(t.estimate_minutes)}</small></div>)}
          </div>}
        {onPlanAssignment&&<button type="button" className="ow-mini-btn"
          onClick={()=>onPlanAssignment(selectedDate)}>+ تعریف کار در این تاریخ</button>}
        <div className="ow-exception-kind" role="group" aria-label="نوع تغییر این تاریخ">
          <label><input type="radio" name="exception-kind" checked={exceptionKind==='replacement_intervals'}
            onChange={()=>setExceptionKind('replacement_intervals')}/> ثبت ساعات جایگزین</label>
          <label><input type="radio" name="exception-kind" checked={exceptionKind==='unavailable'}
            onChange={()=>setExceptionKind('unavailable')}/> ثبت عدم حضور</label>
        </div>
        {exceptionKind==='replacement_intervals'&&
          renderWindows(exceptionWindows,setExceptionWindows,'استثنا')}
        <label className="report-field"><span>توضیح (اختیاری)</span>
          <input maxLength={300} value={note} onChange={e=>setNote(e.target.value)}/>
        </label>
        {selectedDate<today()&&<p role="status" className="ow-muted">تاریخ گذشته فقط برای مشاهده است.</p>}
        {!exceptionValidation.ok&&<p role="alert" className="ow-warning">{exceptionValidation.error}</p>}
        {exceptionPreview?.code==='conflict'&&<p role="status" className="ow-warning">
          ظرفیت این روز با {minutes(exceptionPreview.allocatedMinutes)} کار موجود تداخل دارد.
          تغییر زمان کارها را خودکار لغو نمی‌کند.
        </p>}
        <button className="report-btn report-btn--primary" type="submit"
          disabled={busy||selectedDate<today()||!exceptionValidation.ok
            ||(exceptionKind==='replacement_intervals'&&!exceptionWindows.length)}>
          ذخیره استثنای این تاریخ
        </button>
      </form>}
      <small className="ow-muted">هر تاریخ قابل انتخاب است؛ تغییر موقت تنها روی همان روز اثر دارد.</small>
    </section>
    <div className="ow-presence-feedback">
      <Message error={error} notice={notice}/>
      {saveState&&<p role="status" className="ow-muted">{saveState}</p>}
    </div>
  </div>
}
function AllWorkerTimeline({data}) {
 const workers=(data?.workers||[]).filter(w=>w.state==='active')
 const slots=data?.weekly_slots||[]
 return <div className="ow-all-workers-timeline" aria-label="نمای حضور هفتگی همه دانشجوکارها">
   {dayLabels.map(([id,name])=>{
     const date=firstMatchingWeekday(today(),id)
     const entries=workers.flatMap(w=>selectedWeeklyWindows(slots,w.id,id,date)
       .map(slot=>({key:w.id+'-'+slot.start,name:w.name,unit:w.unit,...slot})))
       .sort((a,b)=>a.start.localeCompare(b.start)||a.name.localeCompare(b.name,'fa'))
     return <div className="ow-team-day" key={id}>
       <b>{name}</b>
       <div className="ow-team-intervals">
         {entries.map(e=><span className="ow-team-interval" key={e.key}>
           <span dir="ltr">{e.start}–{e.end}</span>
           <strong>{e.name}</strong>
         </span>)}
         {!entries.length&&<small>برنامه ثبت‌شده‌ای برای این روز موجود نیست.</small>}
       </div>
     </div>
   })}
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
function ProfileChangeReview({request,worker,onDone}) {
 const [note,setNote]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const act=async decision=>{
   if(busy)return
   setBusy(true);setError('')
   try{
     await reviewProfileChange({requestId:request.id,decision,note:note.trim()})
     await onDone?.()
   }catch(e){
     const raw=String(e?.message||'')
     setError(raw.includes('already_reviewed')?'این درخواست قبلاً بررسی شده است.':
       'بررسی انجام نشد؛ اطلاعات دوباره دریافت و بررسی شوند.')
   }finally{setBusy(false)}
 }
 return <article className="ow-item ow-profile-request" data-request-id={request.id}>
   <div className="ow-item-header">
     <strong>{worker?.name||'دانشجوکار'} · اصلاح {request.field_code==='major'?'رشته':'نام'}</strong>
     <span className="ow-status">نیازمند رسیدگی</span>
   </div>
   <p>مقدار پیشنهادی: <b>{request.proposed_value}</b></p>
   <details className="ow-context-help"><summary>دلیل درخواست</summary>
     <p>{request.reason}</p>
   </details>
   <label className="report-field"><span>یادداشت بررسی (اختیاری)</span>
     <input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
   <div className="ow-actions">
     <button className="report-btn report-btn--primary" type="button" disabled={busy}
       onClick={()=>act('approved')}>تأیید اصلاح</button>
     <button className="report-btn report-btn--light" type="button" disabled={busy}
       onClick={()=>act('rejected')}>رد درخواست</button>
   </div>
   {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
 </article>
}
function ManagerWorkerProfile({data,selectedId,onChange,onDone}) {
  const workers=data.workers||[]
  const [query,setQuery]=useState('')
  const shownWorkers=workers.filter(w=>w.name?.toLocaleLowerCase('fa-IR')
    .includes(query.trim().toLocaleLowerCase('fa-IR')))
  const selected=workers.find(w=>w.id===selectedId)
  const scoped=selected?scopeWorkerHistory(data,selectedId):null
  const summary=scoped?summarizeWorkerHistory(scoped):null
  const tasks=scoped?.tasks||[]
  const entries=scoped?.time_entries||[]
  const ongoing=tasks.filter(t=>['assigned','in_progress','submitted','needs_changes'].includes(t.state))
  const completed=tasks.filter(t=>t.state==='completed')
  const changeQueue=(data.profile_requests||[]).filter(r=>r.worker_id===selectedId
    &&r.review_state==='pending')
  const timeQueue=entries.filter(e=>e.review_state==='submitted')
  const taskById=new Map(tasks.map(t=>[t.id,t]))
  return <section className="report-panel ow-profile-section">
    <h2>پروفایل دانشجوکارها</h2>
    <div className="ow-profile-layout">
      <aside className="ow-people-directory" aria-label="فهرست دانشجوکارها">
        <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
          aria-label="جست‌وجوی دانشجوکار در پروفایل‌ها" placeholder="جست‌وجوی دانشجوکار"/>
        {shownWorkers.map(w=><button type="button" key={w.id}
          className={selectedId===w.id?'is-selected':''} onClick={()=>onChange(w.id)}>
          <strong>{w.name}</strong>
          <small>{unitLabels[w.unit]||w.unit}</small>
          {(data.profile_requests||[]).some(r=>r.worker_id===w.id&&r.review_state==='pending')
            &&<i aria-label="درخواست منتظر بررسی">•</i>}
        </button>)}
        {!shownWorkers.length&&<p className="ow-muted">موردی یافت نشد.</p>}
      </aside>
      <div className="ow-profile-body">
      {!selected&&<p className="ow-muted">از فهرست، پرونده یک دانشجوکار را انتخاب کنید.</p>}
    {selected&&<>
      <div className="ow-profile-heading">
        <div><h3>{selected.name}</h3>
          <small className="ow-muted">{unitLabels[selected.unit]||selected.unit||'—'}
            {selected.major&&<> · {selected.major}</>}</small></div>
        <span className="ow-status">{workerStateLabels[selected.state]||selected.state}</span>
      </div>
      <div className="ow-profile-metrics">
        <div><span>کارهای واگذارشده</span><b>{n(summary.taskCount)}</b></div>
        <div><span>در جریان</span><b>{n(summary.openCount)}</b></div>
        <div><span>گزارش منتظر</span><b>{n(summary.pendingCount)}</b></div>
        <div><span>زمان تأییدشده</span><b>{exactDuration(summary.approvedMinutes)}</b></div>
      </div>
      <details className="ow-profile-fold"><summary>کارهای در جریان · {n(ongoing.length)}</summary>
        <div className="ow-profile-mini-list">
          {ongoing.map(t=><div key={t.id}><b>{t.title}</b><small>{pretty(t.planned_date)} · {stateLabels[t.state]||t.state}</small></div>)}
          {!ongoing.length&&<p className="ow-muted">کاری در جریان نیست.</p>}
        </div>
      </details>
      <details className="ow-profile-fold"><summary>کارهای تکمیل‌شده · {n(completed.length)}</summary>
        <div className="ow-profile-mini-list">
          {completed.map(t=><div key={t.id}><b>{t.title}</b><small>{pretty(t.planned_date)}</small></div>)}
          {!completed.length&&<p className="ow-muted">کاری تکمیل نشده است.</p>}
        </div>
      </details>
      <details className="ow-profile-fold"><summary>سوابق ساعات و گزارش‌ها · {n(entries.length)}</summary>
        <div className="ow-profile-mini-list">
          {entries.map(e=><div key={e.id}>
            <b>{tasks.find(t=>t.id===e.task_id)?.title||'گزارش کار'}</b>
            <small>{pretty(e.work_date)} · {reviewLabels[e.review_state]||e.review_state}
              {' · '}{e.review_state==='approved'
                ?exactDuration(e.approved_minutes):minutes(e.reported_minutes)}</small>
          </div>)}
          {!entries.length&&<p className="ow-muted">گزارشی وجود ندارد.</p>}
        </div>
      </details>
      {(changeQueue.length>0||timeQueue.length>0)&&<details open className="ow-profile-fold">
        <summary>نیازمند رسیدگی · {n(changeQueue.length+timeQueue.length)}</summary>
        <div className="ow-profile-action-list">
          {changeQueue.map(r=><ProfileChangeReview key={r.id} request={r}
            worker={selected} onDone={onDone}/>)}
          {timeQueue.map(e=><ApprovalCard key={e.id} entry={e}
            worker={selected} task={taskById.get(e.task_id)} onDone={onDone}/>)}
        </div>
      </details>}
      <details className="ow-profile-fold"><summary>وضعیت حساب · فقط مشاهده</summary>
        <WorkerLifecycleReadOnlyPreview worker={selected}/>
      </details>
    </>}
      </div>
    </div>
  </section>
}
export function AdminOperations({ navigation, setNavigation }) {
  const [data,setData]=useState({workers:[],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
  const view=navigation.workView
  const profileWorkerId=navigation.profileWorkerId||''
  const setProfileWorkerId=value=>setNavigation(previous=>({...previous,profileWorkerId:value}))
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
  const [assignmentDialogDate,setAssignmentDialogDate]=useState('')
  const assignmentDialogRef=useRef(null)
  useEffect(()=>{
    const dialog=assignmentDialogRef.current
    if(!dialog||!assignmentDialogDate)return
    if(typeof dialog.showModal==='function')dialog.showModal()
    else dialog.setAttribute('open','')
    return ()=>{if(typeof dialog.close==='function'&&dialog.open)dialog.close()}
  },[assignmentDialogDate])
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
      const result=await getAdminWorkV2()
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
  const allWorkerHistory=scopeWorkerHistory(data,historyWorkerId)
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
  const pendingProfileChanges=(data.profile_requests||[]).filter(r=>r.review_state==='pending')
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

  return <div className="ow-workspace">
    <div className="ow-summary">
      <article><span>دانشجوکار فعال</span><b>{n(active.length)}</b></article>
      <article><span>کار برنامه‌ریزی‌شده امروز</span><b>{n(todayTasks.length)}</b></article>
      <article><span>گزارش منتظر تأیید</span><b>{n(pending.length)}</b></article>
      <article><span>کل ساعات تأییدشده</span><b>{exactDuration(approvedMinutes)}</b></article>
    </div>
    <SectionTabs value={view} onChange={setView} options={[
      ['inbox','کارتابل'],['tasks','واگذاری کار'],['approvals','تأیید ساعات'],['availability','برنامه حضور'],['history','سابقه و خروجی'],['profiles','پروفایل‌ها'],
    ]}/>
    {loading&&<p className="ow-muted">در حال دریافت اطلاعات…</p>}
    <Message error={error} notice={notice}/>

    {view==='inbox'&&<section className="report-panel">
      <div className="ow-presence-section-title">
        <h2>کارتابل رسیدگی</h2>
        <small>{n(pending.length)} گزارش · {n(pendingProfileChanges.length)} درخواست اصلاح</small>
      </div>
      {pending.length===0&&pendingProfileChanges.length===0&&
        <p className="ow-muted">درخواستی برای رسیدگی وجود ندارد.</p>}
      <div className="ow-inbox-items">
        {pendingProfileChanges.map(r=><ProfileChangeReview key={r.id} request={r}
          worker={workers.find(w=>w.id===r.worker_id)} onDone={refresh}/>)}
        {pending.map(e=><ApprovalCard key={e.id} entry={e}
          task={taskById.get(e.task_id)} worker={workers.find(w=>w.id===e.worker_id)}
          onDone={refresh}/>)}
      </div>
    </section>}
    {view==='tasks'&&<>
      <section className="report-panel">
        <h2>واگذاری کار</h2>
        <TaskAssignmentEditor workers={active} data={data}
          defaultWorkerId={workerId} defaultDate={date} onSaved={refresh}/>
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
          <option value="">همه دانشجوکارها · تایم‌لاین هفتگی</option>
          {active.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      {workerId?<ScheduleEditor key={workerId} workerId={workerId} data={data}
        onSaved={refresh} onPlanAssignment={setAssignmentDialogDate}/>:<AllWorkerTimeline data={data}/>}

    </section>}

    {view==='profiles'&&<ManagerWorkerProfile data={data} selectedId={profileWorkerId}
      onChange={setProfileWorkerId} onDone={refresh}/>}
    {assignmentDialogDate&&<dialog ref={assignmentDialogRef} className="ow-assignment-dialog"
      onCancel={e=>{e.preventDefault();setAssignmentDialogDate('')}} aria-label="تعریف کار جدید در تقویم">
      <div className="ow-presence-section-title">
        <h2>تعریف کار · {pretty(assignmentDialogDate)}</h2>
        <button type="button" className="ow-mini-btn"
          onClick={()=>setAssignmentDialogDate('')}>بستن</button>
      </div>
      <TaskAssignmentEditor key={assignmentDialogDate} workers={active} data={data}
        defaultDate={assignmentDialogDate} defaultWorkerId={workerId}
        onSaved={refresh} onClose={()=>setAssignmentDialogDate('')}/>
    </dialog>}
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
      <div className="report-panel-heading">
        <h3>{historyFiltersActive?'سوابق منطبق با فیلتر':'سوابق فعالیت همه دانشجوکارها'}</h3>
        <small>{n(historySummary.reportCount)} گزارش · {exactDuration(historySummary.approvedMinutes)} تأییدشده</small>
      </div>
      <div className="ow-list ow-history-results">
        {historyData.time_entries.slice(0,historyShown).map(e=>(
          <article className="ow-item" key={e.id}>
            <strong>{label(e.worker_id,workers)} · {data.tasks?.find(t=>t.id===e.task_id)?.title||'کار'}</strong>
            <small>{pretty(e.work_date)} · {reviewLabels[e.review_state]||e.review_state}</small>
            <small>درخواست: {minutes(e.reported_minutes)} · تأیید:
              {e.review_state==='approved'?minutes(e.approved_minutes):'در انتظار بررسی'}</small>
            {(e.extra_time_reason_code||e.review_note)&&<details className="ow-task-detail">
              <summary>جزئیات گزارش</summary>
              {e.extra_time_reason_code&&<small>دلیل درخواست اضافه:
                {' '}{extraTimeReasons[e.extra_time_reason_code]||e.extra_time_reason_code}
                {e.extra_time_reason_text&&<> · {e.extra_time_reason_text}</>}</small>}
              {e.review_note&&<small>توضیح مدیر: {e.review_note}</small>}
            </details>}
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
    {task.collaborators?.length>0&&<small className="ow-task-collaborators">
      با همکاری: {task.collaborators.map(x=>x.name).join('، ')}
    </small>}
    {ready&&<details className="ow-worker-action-detail"><summary>ثبت انجام و گزارش کار</summary>
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
function WorkerSelfProfile({tasks,records,profile}) {
 const [identity,setIdentity]=useState(profile)
 const [requests,setRequests]=useState([])
 const [requestsLoading,setRequestsLoading]=useState(true)
 const [requestsError,setRequestsError]=useState('')
 const [editing,setEditing]=useState(false)
 const [field,setField]=useState('major')
 const [value,setValue]=useState('')
 const [reason,setReason]=useState('')
 const [saving,setSaving]=useState(false)
 const refreshProfile=async()=>{
   try{
     const [personal,items]=await Promise.all([getMyWorkerProfileV2(),getMyProfileChangeRequests()])
     if(personal)setIdentity(personal)
     setRequests(Array.isArray(items)?items:[])
     setRequestsError('')
   }catch{setRequestsError('مشخصات یا درخواست‌ها دریافت نشد؛ دوباره بررسی کنید.')}
   finally{setRequestsLoading(false)}
 }
 useEffect(()=>{void refreshProfile()},[profile.worker_id])
 const submitChange=async event=>{
   event.preventDefault()
   if(saving||value.trim().length<2||reason.trim().length<10)return
   setSaving(true);setRequestsError('')
   try{
     await requestProfileChange({field,value:value.trim(),reason:reason.trim()})
     setEditing(false);setValue('');setReason('')
     await refreshProfile()
   }catch(e){
     setRequestsError(String(e?.message||'').includes('profile_change_already_pending')
       ?'برای این مشخصه درخواست رسیدگی‌نشده وجود دارد.'
       :'درخواست ثبت نشد؛ اطلاعات واردشده حفظ شده‌اند.')
   }finally{setSaving(false)}
 }

  const completed=tasks.filter(t=>t.state==='completed')
  const upcoming=tasks.filter(t=>t.planned_date>today()
    &&!['completed','cancelled'].includes(t.state))
  const ongoing=tasks.filter(t=>t.planned_date<=today()
    &&!['completed','cancelled'].includes(t.state))
  const approved=records.filter(e=>e.review_state==='approved')
  const approvedTime=approved.reduce((sum,e)=>sum+Number(e.approved_minutes||0),0)
  const panels=[
    {id:'ongoing',title:'در جریان',tasks:ongoing},
    {id:'upcoming',title:'پیش‌رو',tasks:upcoming},
    {id:'completed',title:'انجام‌شده',tasks:completed},
  ]
  return <section className="report-panel ow-self-profile">
    <div className="ow-presence-section-title"><h2>پروفایل من</h2>
      <span className="ow-status">زمان تأییدشده: {exactDuration(approvedTime)}</span></div>
    <div className="ow-self-identity">
      <div><small>نام و نام خانوادگی</small><strong>{identity?.name||'نامشخص'}</strong></div>
      <div><small>رشته تحصیلی</small><strong>{identity?.major||'ثبت نشده'}</strong></div>
      <div><small>سال ورود</small><strong>{identity?.entry_year||'ثبت نشده'}</strong></div>
      <div><small>واحد همکاری</small><strong>{unitLabels[identity?.unit]||identity?.unit||'نامشخص'}</strong></div>
    </div>
    <details className="ow-profile-fold ow-profile-change" open={editing} onToggle={e=>{
       if(!e.currentTarget.open&&editing)setEditing(false)
     }}>
      <summary onClick={e=>{e.preventDefault();setEditing(open=>!open)}}>درخواست اصلاح مشخصات</summary>
      {editing&&<form onSubmit={submitChange} className="ow-profile-change-form">
        <label className="report-field"><span>مشخصه موردنظر</span>
          <select value={field} onChange={e=>setField(e.target.value)}>
            <option value="major">رشته تحصیلی</option><option value="full_name">نام و نام خانوادگی</option>
          </select>
        </label>
        <label className="report-field"><span>مقدار پیشنهادی</span>
          <input required minLength={2} maxLength={120} value={value}
            onChange={e=>setValue(e.target.value)}/>
        </label>
        <label className="report-field"><span>دلیل اصلاح (۱۰ تا ۶۰۰ نویسه)</span>
          <textarea required minLength={10} maxLength={600} rows={2} value={reason}
            onChange={e=>setReason(e.target.value)}/>
        </label>
        <small>تا تأیید مدیر، مشخصات فعلی تغییر نمی‌کنند.</small>
        <button type="submit" className="report-btn report-btn--primary"
          disabled={saving||value.trim().length<2||reason.trim().length<10}>
          ارسال درخواست</button>
      </form>}
    </details>
    {requestsError&&<div role="alert" className="report-alert report-alert--error">{requestsError}</div>}
    {requestsLoading&&<p role="status" className="ow-muted">در حال دریافت وضعیت درخواست‌ها…</p>}
    {requests.length>0&&<details className="ow-profile-fold"><summary>درخواست‌های اصلاح · {n(requests.length)}</summary>
      <div className="ow-profile-mini-list">
        {requests.map(r=><div key={r.id}>
          <b>{r.field_code==='major'?'رشته تحصیلی':'نام'}: {r.proposed_value}</b>
          <small>{r.review_state==='pending'?'منتظر تأیید':
             r.review_state==='approved'?'تأیید شد':'رد شد'}</small>
          {r.review_note&&<small>نظر مدیر: {r.review_note}</small>}
        </div>)}
      </div>
    </details>}
    <div className="ow-profile-kpi-line" aria-label="خلاصه عملکرد">
      <span>{n(ongoing.length)} در جریان</span><span>{n(upcoming.length)} پیش‌رو</span>
      <span>{n(completed.length)} انجام‌شده</span><span>{n(records.length)} گزارش</span>
    </div>
    {panels.map(group=><details key={group.id} className="ow-profile-fold">
      <summary>{group.title} · {n(group.tasks.length)}</summary>
      <div className="ow-profile-mini-list">
        {group.tasks.map(task=><div key={task.id}>
          <b>{task.title}</b><small>{pretty(task.planned_date)} · {stateLabels[task.state]||task.state}</small>
        </div>)}
        {!group.tasks.length&&<p className="ow-muted">موردی ثبت نشده است.</p>}
      </div>
    </details>)}
    <details className="ow-profile-fold">
      <summary>سابقه گزارش‌ها و ساعات · {n(records.length)}</summary>
      <div className="ow-profile-mini-list">
        {records.map(e=><div key={e.id}>
          <b>{tasks.find(t=>t.id===e.task_id)?.title||'گزارش کار'}</b>
          <small>{pretty(e.work_date)} · {reviewLabels[e.review_state]||e.review_state}
            {' · '}درخواست: {minutes(e.reported_minutes)}
            {e.review_state==='approved'&&<> · تأیید: {minutes(e.approved_minutes)}</>}
          </small>
          {(e.review_note||e.extra_time_reason_text)&&<details className="ow-context-help">
            <summary>جزئیات</summary>
            {e.review_note&&<p>نظر مدیر: {e.review_note}</p>}
            {e.extra_time_reason_text&&<p>علت زمان اضافه: {e.extra_time_reason_text}</p>}
          </details>}
        </div>)}
        {!records.length&&<p className="ow-muted">هنوز گزارشی ثبت نشده است.</p>}
      </div>
    </details>
  </section>
}
export function WorkerOperations({profile,navigation,setNavigation}) {
  const [data,setData]=useState({tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
  const [localNavigation,setLocalNavigation]=useState({section:'tasks',taskRange:'today'})
  const selected=navigation||localNavigation
  const updateNavigation=patch=>{
    const fn=previous=>({...previous,...patch})
    ;(setNavigation||setLocalNavigation)(fn)
  }
  const section=['tasks','availability','profile'].includes(selected.section)?selected.section:'tasks'
  const taskRange=['today','week','month'].includes(selected.taskRange)?selected.taskRange:'today'
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const refresh=async()=>{
    setLoading(true);setError('')
    try{setData(await getMyWorkV2()||{tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})}
    catch(e){setError(readableError(e))}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[profile.worker_id])
  const records=data.time_entries||[]
  const approved=records.filter(x=>x.review_state==='approved')
  const total=approved.reduce((sum,e)=>sum+Number(e.approved_minutes||0),0)
  const tasks=data.tasks||[]
  const week=persianWeekBounds(today())
  const month=persianMonthBounds(today())
  const ranged=taskRange==='today'?tasks.filter(t=>t.planned_date===today()):
    taskRange==='week'?tasks.filter(t=>t.planned_date>=week.start&&t.planned_date<=week.end):
    tasks.filter(t=>t.planned_date>=month.start&&t.planned_date<=month.end)
  const overdue=tasks.filter(t=>t.planned_date<today()&&['assigned','in_progress','needs_changes'].includes(t.state))
  const visible=[...overdue,...ranged.filter(t=>!overdue.some(p=>p.id===t.id))]
  return <div className="ow-workspace ow-worker-workspace">
    <div className="ow-summary">
      <article><span>کارهای باز</span><b>{n(tasks.filter(t=>!['completed','cancelled'].includes(t.state)).length)}</b></article>
      <article><span>گزارش منتظر بررسی</span><b>{n(records.filter(e=>e.review_state==='submitted').length)}</b></article>
      <article><span>ساعات تأییدشده</span><b>{exactDuration(total)}</b></article>
    </div>
    <SectionTabs value={section} onChange={next=>updateNavigation({section:next})} options={[
      ['tasks','کارها'],['availability','زمان حضور'],['profile','پروفایل من'],
    ]}/>
    {loading&&<p className="ow-muted" role="status">در حال دریافت برنامه…</p>}
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
    {section==='tasks'&&<section className="report-panel">
      <div className="ow-worker-list-heading">
        <h2>کارها {overdue.length>0&&<small className="ow-overdue-count">· {n(overdue.length)} نیازمند اقدام از روزهای قبل</small>}</h2>
        <div className="ow-range-switch" role="group" aria-label="بازه نمایش کارها">
          {[['today','امروز'],['week','این هفته'],['month','این ماه']].map(([id,title])=>
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
    {section==='profile'&&<WorkerSelfProfile tasks={tasks} records={records} profile={profile}/>}
  </div>
}
