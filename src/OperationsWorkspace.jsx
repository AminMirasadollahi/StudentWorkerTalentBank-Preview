import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { trapModalTab } from './lib/dialogFocusTrap.mjs'
import { selectWorkerTaskFocus, summarizeWorkerTaskFocus } from './lib/workerTaskFocus.mjs'
import {projectWorkerReportActivity,summarizeWorkerReportActivity} from './lib/workerReportActivity.mjs'
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
import { MAX_DAILY_WINDOWS, selectedWeeklyWindows, validateDailyWindows, persianWeekBounds, suggestNextWindow, scopeSelfWorkRows } from './lib/weeklyScheduleGrid.mjs'
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
  const dateDialogRef=useRef(null)
  const lastDateButtonRef=useRef(null)
  const [exceptionKind,setExceptionKind]=useState('replacement_intervals')
  const [exceptionWindows,setExceptionWindows]=useState([])
  const [exceptionSlot,setExceptionSlot]=useState(null)
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [saveState,setSaveState]=useState('')
  // A selected day must reveal information at the point of action, not
  // silently append an off-screen form after the complete month grid.
  useLayoutEffect(()=>{
    const dialog=dateDialogRef.current
    if(!dialog)return
    if(selectedDate){
      if(!dialog.open && typeof dialog.showModal==='function'){
        try{dialog.showModal()}catch{return}
      }
      dialog.querySelector('[data-presence-date-heading]')?.focus()
    }else if(dialog.open){
      dialog.close()
      lastDateButtonRef.current?.focus()
    }
  },[selectedDate])
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
    setEditingDay(null);setEditingSlot(null);setDraftWindows([]);setSelectedDate('');setExceptionSlot(null)
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
    if(editingSlot===null||editingDay===null||busy)return
    const remaining=draftWindows.filter((_,i)=>i!==editingSlot)
    const check=validateDailyWindows(remaining)
    if(!check.ok)return
    if(!window.confirm(remaining.length
      ?'نوبت انتخاب‌شده از برنامه این روز حذف شود؟'
      :'تنها نوبت این روز حذف می‌شود؛ نبود برنامه به معنای غیبت قطعی نیست. ادامه می‌دهید؟'))return
    void save(()=>setWeeklyDay(workerId,editingDay,check.intervals,effective),'weekly')
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
    setExceptionSlot(null)
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
    <div className="ow-date-slot-grid" aria-label="چهار نوبت حضور جایگزین">
      {[0,1,2,3].map(index=>{
        const slot=windows[index]
        const editing=exceptionSlot===index
        return <div key={index} className={'ow-date-slot'+(editing?' is-editing':'')}>
          <small>نوبت {n(index+1)}</small>
          {editing?<div className="ow-date-slot-fields">
            <label><span className="ow-sr-only">شروع</span><input type="text"
              dir="ltr" inputMode="numeric" maxLength={5} placeholder="08:00"
              value={slot?.start||''} onChange={e=>editWindow(setter,index,'start',e.target.value)}/></label>
            <label><span className="ow-sr-only">پایان</span><input type="text"
              dir="ltr" inputMode="numeric" maxLength={5} placeholder="09:00"
              value={slot?.end||''} onChange={e=>editWindow(setter,index,'end',e.target.value)}/></label>
            <button type="button" title="تأیید ویرایش نوبت" aria-label="تأیید ویرایش نوبت"
              disabled={!exceptionValidation.ok} onClick={()=>setExceptionSlot(null)}>✓</button>
            <button type="button" title="حذف نوبت" aria-label="حذف نوبت"
              onClick={()=>{setter(list=>list.filter((_,i)=>i!==index));setExceptionSlot(null)}}>×</button>
          </div>:<button type="button" className="ow-date-slot-toggle"
            disabled={busy||index>windows.length}
            aria-label={slot?`ویرایش نوبت جایگزین ${index+1}`:`افزودن نوبت جایگزین ${index+1}`}
            onClick={()=>{
              if(!slot)setter(current=>[...current,suggestNextWindow(current)])
              setExceptionSlot(index)
            }}>
            {slot?<span dir="ltr">{slot.start}–{slot.end}</span>:<span aria-hidden="true">＋</span>}
          </button>}
        </div>
      })}
      <small className="ow-muted">هر نوبت را در همان خانه تنظیم کنید؛ ثبت نهایی فقط برای تاریخ انتخاب‌شده است.</small>
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
            onClick={event=>{
              lastDateButtonRef.current=event.currentTarget
              chooseMonthDay(day.date)
            }} disabled={busy}
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
      <dialog ref={dateDialogRef} className="ow-presence-date-dialog" dir="rtl"
        onKeyDown={trapModalTab}
        aria-labelledby="ow-presence-day-dialog-title"
        onCancel={event=>{event.preventDefault();if(!busy)setSelectedDate('')}}
        onClose={()=>{if(selectedDate&&!busy)setSelectedDate('')}}>
      {selectedDate&&<form className="ow-exception-inline" onSubmit={submitDate}>
        <div className="ow-presence-section-title ow-presence-date-dialog__head">
          <h4 id="ow-presence-day-dialog-title" tabIndex={-1}
            data-presence-date-heading>
            {selectedDate<today()?'جزئیات روز':'برنامه و تغییرات روز'} · {pretty(selectedDate)}
          </h4>
          <button type="button" className="ow-mini-btn" disabled={busy}
            onClick={()=>setSelectedDate('')}>بستن</button>
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
        {selectedDate<today()
          ? <p role="status" className="ow-muted ow-presence-readonly-note">
              این تاریخ گذشته است؛ برنامه و کارهای آن فقط قابل مشاهده‌اند و تغییر جدید ثبت نمی‌شود.
            </p>
          : <>        <div className="ow-exception-kind" role="group" aria-label="نوع تغییر این تاریخ">
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
          </>}
      </form>}
      </dialog>
      <small className="ow-muted">برای مشاهده یا ویرایش برنامهٔ یک روز، آن روز را در تقویم انتخاب کنید.</small>
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
  const [committed,setCommitted]=useState(false)
  const [notice,setNotice]=useState('')
  const decisionLock=useRef(false)
  const [error,setError]=useState('')
  const approvalNeedsReason=Number(approved)!==requested || Number(approved)>standard
  const act=async decision=>{
    // Prevent rapid double clicks before React can commit disabled=true.
    if(decisionLock.current)return
    decisionLock.current=true
    setBusy(true);setError('');setNotice('')
    try{
      await reviewWorkerTime({entryId:entry.id,decision,approvedMinutes:approved,note})
      setCommitted(true)
      setNotice('تصمیم در سرور ثبت شد؛ در حال دریافت فهرست تازه…')
      // A post-commit refresh failure is NOT a failed server decision.
      try{
        const refreshed=await onDone?.()
        if(refreshed===false)throw Error('REFRESH_ONLY_FAILURE')
      }catch{
        setNotice('تصمیم ثبت شده است، اما تازه‌سازی فهرست انجام نشد. دوباره اطلاعات را دریافت کنید.')
      }
    }catch(e){
      decisionLock.current=false
      setError(readableError(e))
    }finally{setBusy(false)}
  }
  return <article className="ow-item">
    <div className="ow-item-header">
      <strong>{task?.title||'کار مرتبط نامشخص'}</strong>
      <span className="ow-status">{committed?'تصمیم ثبت‌شده':missingTask?'نیازمند بررسی پرونده':asksExtra?'درخواست زمان اضافه':'گزارش عادی'}</span>
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
        disabled={busy||committed||missingTask||approved===''||!Number.isInteger(Number(approved))||Number(approved)<0||Number(approved)>requested||(approvalNeedsReason&&!note.trim())}
        onClick={()=>act('approved')}>تأیید ساعت</button>
      <button className="report-btn report-btn--light" type="button"
        disabled={busy||committed||missingTask||!note.trim()} onClick={()=>act('changes_requested')}>نیازمند اصلاح</button>
      <button className="report-btn report-btn--light" type="button"
        disabled={busy||committed||missingTask||!note.trim()} onClick={()=>act('rejected')}>رد گزارش</button>
    </div>
    {notice&&<p role="status" className="ow-muted">{notice}</p>}
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
 const [committed,setCommitted]=useState(false)
 const [notice,setNotice]=useState('')
 const decisionLock=useRef(false)
 const [error,setError]=useState('')
 const act=async decision=>{
   if(decisionLock.current)return
   decisionLock.current=true
   setBusy(true);setError('');setNotice('')
   try{
     await reviewProfileChange({requestId:request.id,decision,note:note.trim()})
     setCommitted(true)
     setNotice('تصمیم در سرور ثبت شد؛ در حال دریافت فهرست تازه…')
     try{
       const refreshed=await onDone?.()
       if(refreshed===false)throw Error('REFRESH_ONLY_FAILURE')
     }catch{
       setNotice('درخواست بررسی شده است، اما تازه‌سازی فهرست انجام نشد. دوباره اطلاعات را دریافت کنید.')
     }
   }catch(e){
     decisionLock.current=false
     const raw=String(e?.message||'')
     setError(raw.includes('already_reviewed')?'این درخواست قبلاً بررسی شده است.':
       'بررسی انجام نشد؛ اطلاعات دوباره دریافت و بررسی شوند.')
   }finally{setBusy(false)}
 }
 return <article className="ow-item ow-profile-request" data-request-id={request.id}>
   <div className="ow-item-header">
     <strong>{worker?.name||'دانشجوکار'} · اصلاح {request.field_code==='major'?'رشته':'نام'}</strong>
     <span className="ow-status">{committed?'تصمیم ثبت‌شده':'نیازمند رسیدگی'}</span>
   </div>
   <p>مقدار پیشنهادی: <b>{request.proposed_value}</b></p>
   <details className="ow-context-help"><summary>دلیل درخواست</summary>
     <p>{request.reason}</p>
   </details>
   <label className="report-field"><span>یادداشت بررسی (اختیاری)</span>
     <input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
   <div className="ow-actions">
     <button className="report-btn report-btn--primary" type="button" disabled={busy||committed}
       onClick={()=>act('approved')}>تأیید اصلاح</button>
     <button className="report-btn report-btn--light" type="button" disabled={busy||committed}
       onClick={()=>act('rejected')}>رد درخواست</button>
   </div>
   {notice&&<p role="status" className="ow-muted">{notice}</p>}
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
        <div><span>زمان تأییدشده</span><b>{exactDuration(
          selected.approved_minutes_total??summary.approvedMinutes)}</b></div>
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
export function AdminOperations({ navigation, setNavigation, refreshRevision = 0 }) {
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
  const [readFailed,setReadFailed]=useState(false)
  const readSequence=useRef(0)
  const [notice,setNotice]=useState('')
  const [historyShown,setHistoryShown]=useState(100)
  const [tasksShown,setTasksShown]=useState(100)
  const [approvalsShown,setApprovalsShown]=useState(25)
  useEffect(()=>setTasksShown(100),[taskWorkerId,taskState,taskSearch,taskOrder])
  useEffect(()=>setApprovalsShown(25),[approvalWorkerId,approvalKind])
  useEffect(()=>{setHistoryShown(100)},[historyWorkerId,historyUnit,historyFrom,historyTo,historyReview])

  const refresh=async ()=>{
    // Ignore older in-flight responses after a newer role check has completed.
    const sequence=++readSequence.current
    setLoading(true)
    try{
      const result=await getAdminWorkV2()
      if(sequence!==readSequence.current)return false
      setData(result||{workers:[],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
      setReadFailed(false)
      setError('')
      return true
    }catch(e){
      if(sequence!==readSequence.current)return false
      // A previous successful read is not proof of CURRENT authorization.
      setData({workers:[],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
      setReadFailed(true)
      setAssignmentDialogDate('')
      setError(readableError(e))
      return false
    }finally{if(sequence===readSequence.current)setLoading(false)}
  }
  useEffect(()=>{void refresh()},[refreshRevision])

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
  // All-time approved minutes use the authorized, uncapped backend aggregate.
  const approvedMinutes=data.approved_minutes_total??(data.time_entries||[])
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

  if(readFailed)return <div className="ow-workspace ow-access-recheck" role="alert">
    <p>اطلاعات مدیریتی در دسترس نیست. تا بررسی دوبارهٔ مجوز، داده‌های قبلی نمایش داده نمی‌شوند.</p>
    <Message error={error}/>
    <button type="button" className="report-btn report-btn--light" disabled={loading}
      onClick={()=>{void refresh()}}>تلاش مجدد برای دریافت اطلاعات</button>
  </div>

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
function WorkerTaskCard({task,onSaved,onReportAccepted,onInspect,inspected=false,actionLedger,reviewCycle}) {
  const acknowledged=actionLedger.get(task.id)
  const sameReviewCycle=acknowledged?.reviewCycle===reviewCycle
  const [reportOpen,setReportOpen]=useState(false)
  const reportDialogRef=useRef(null)
  const reportTriggerRef=useRef(null)
  const [date,setDate]=useState(today())
  const [requestExtra,setRequestExtra]=useState(false)
  const [requested,setRequested]=useState(String(task.estimate_minutes))
  const [reasonCode,setReasonCode]=useState('')
  const [reasonText,setReasonText]=useState('')
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [reportCommitted,setReportCommitted]=useState(Boolean(sameReviewCycle&&acknowledged.report))
  const [startCommitted,setStartCommitted]=useState(Boolean(sameReviewCycle&&acknowledged.start))
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const actionLock=useRef(false)
  // Preserve one submission identity across uncertain network failures.
  const keyRef=useRef(sameReviewCycle&&acknowledged.clientSubmissionId
    ?acknowledged.clientSubmissionId:crypto.randomUUID())
  const priorReviewCycle=useRef(reviewCycle)
  // Native modal dialog keeps its form mounted so unsent edits survive
  // dismiss/reopen and parent identity focus-rechecks without localStorage.
  useLayoutEffect(()=>{
    const dialog=reportDialogRef.current
    if(!dialog)return
    if(reportOpen){
      if(!dialog.open && typeof dialog.showModal==='function'){
        try{dialog.showModal()}catch{return}
      }
      dialog.querySelector('[data-task-dialog-heading]')?.focus()
    }else if(dialog.open){
      dialog.close()
      reportTriggerRef.current?.focus()
    }
  },[reportOpen])
  useEffect(()=>{
    // A NEW manager-requested correction creates a distinct review cycle.
    // Stale task state alone is never enough to re-enable acknowledged reports.
    if(task.state==='needs_changes'&&priorReviewCycle.current!==reviewCycle){
      actionLedger.delete(task.id)
      setReportCommitted(false)
      keyRef.current=crypto.randomUUID()
    }
    priorReviewCycle.current=reviewCycle
  },[reviewCycle,task.state,actionLedger])
  const ready=['assigned','in_progress','needs_changes'].includes(task.state)
  const standard=Number(task.estimate_minutes)
  const requestedMinutes=requestExtra?Number(requested):standard
  const extraValid=!requestExtra || (
    Number.isInteger(requestedMinutes)&&requestedMinutes>standard&&requestedMinutes<=1440
    && Boolean(reasonCode)&&reasonText.trim().length>=10&&reasonText.trim().length<=600
  )
  const perform=async (fn,kind)=>{
    const previous=actionLedger.get(task.id)
    if(actionLock.current||(kind==='report'&&(reportCommitted||
       (previous?.reviewCycle===reviewCycle&&previous?.report)))
       ||(kind==='start'&&(startCommitted||
       (previous?.reviewCycle===reviewCycle&&previous?.start))))return
    actionLock.current=true
    setBusy(true);setError('');setNotice('')
    try{
      await fn()
      const prior=actionLedger.get(task.id)
      actionLedger.set(task.id,{
        ...(prior?.reviewCycle===reviewCycle?prior:{}),
        reviewCycle,
        ...(kind==='report'?{report:true,clientSubmissionId:keyRef.current}:{start:true}),
      })
      if(kind==='report'){
        setReportCommitted(true);setReportOpen(false)
        onReportAccepted?.()
      }
      if(kind==='start')setStartCommitted(true)
      setNotice(kind==='report'?'گزارش در سرور ثبت شد؛ در حال دریافت وضعیت تازه…':
        'شروع کار در سرور ثبت شد؛ در حال دریافت وضعیت تازه…')
      try{
        const refreshed=await onSaved?.()
        if(refreshed===false)throw Error('REFRESH_ONLY_FAILURE')
      }catch{
        setNotice('عملیات ثبت شده است؛ فقط تازه‌سازی وضعیت ناموفق بود. از ارسال دوباره خودداری کنید.')
      }
    }catch(e){
      // No acknowledgement: retain the SAME idempotency key for a cautious retry.
      setError(readableError(e))
    }finally{actionLock.current=false;setBusy(false)}
  }
  return <article className={`ow-item ow-worker-task--${task.state}`}>
    <div className="ow-worker-card-main">
      <button type="button" className="ow-b3-inspect-trigger"
        data-task-inspect={task.id} aria-expanded={inspected}
        onClick={onInspect}>مشاهدهٔ جزئیات</button>
      <div className="ow-item-header"><strong>{task.title}</strong>
        <span className="ow-status">{stateLabels[task.state]||'وضعیت نامشخص'}</span>
      </div>
      <small>{pretty(task.planned_date)} · زمان استاندارد: {minutes(standard)}</small>
      {task.collaborators?.length>0&&<small className="ow-task-collaborators">
        با همکاری: {task.collaborators.map(x=>x.name).join('، ')}
      </small>}
    </div>
    {ready&&<>
      <div className="ow-worker-action-launch">
        <button type="button" ref={reportTriggerRef}
          className="report-btn report-btn--light ow-worker-report-trigger"
          aria-haspopup="dialog" aria-controls={`ow-worker-report-dialog-${task.id}`}
          disabled={busy||reportCommitted}
          onClick={()=>setReportOpen(true)}>
          {task.state==='needs_changes'?'اصلاح و ارسال گزارش':'ثبت انجام کار'}
        </button>
      </div>
      <dialog ref={reportDialogRef} id={`ow-worker-report-dialog-${task.id}`}
        className="ow-worker-report-dialog ow-worker-action-detail" dir="rtl"
        onKeyDown={trapModalTab}
        aria-labelledby={`ow-worker-report-heading-${task.id}`}
        onCancel={event=>{event.preventDefault();if(!busy)setReportOpen(false)}}
        onClose={()=>{if(reportOpen&&!busy)setReportOpen(false)}}>
        <div className="ow-worker-report-dialog__head">
          <div>
            <h3 tabIndex={-1} data-task-dialog-heading
              id={`ow-worker-report-heading-${task.id}`}>
              {task.state==='needs_changes'?'اصلاح و ارسال گزارش':'ثبت انجام کار'}
            </h3>
            <p className="ow-muted">{task.title} · {pretty(task.planned_date)}</p>
          </div>
          <button type="button" className="ow-worker-report-dialog__close"
            disabled={busy} aria-label="بستن پنجره ثبت کار"
            onClick={()=>setReportOpen(false)}>بستن</button>
        </div>
        {task.instructions&&<details className="ow-worker-task-instructions">
          <summary>شرح کار محول‌شده</summary><p>{task.instructions}</p>
        </details>}
      <form onSubmit={e=>{e.preventDefault();if(!extraValid||reportCommitted||busy)return;
      // Keep the same client submission identity if the tab temporarily unmounts
      // after a request with uncertain network outcome.
      const prior=actionLedger.get(task.id)
      if(prior?.reviewCycle!==reviewCycle){
        actionLedger.set(task.id,{reviewCycle,clientSubmissionId:keyRef.current})
      }else if(!prior.clientSubmissionId){
        actionLedger.set(task.id,{...prior,clientSubmissionId:keyRef.current})
      }
      void perform(
      ()=>submitMyTime({taskId:task.id,date,minutes:requestedMinutes,note,
        clientSubmissionId:keyRef.current,
        extraReasonCode:requestExtra?reasonCode:null,
        extraReasonText:requestExtra?reasonText.trim():null}),'report')
    }}>
      <div className="ow-fields ow-fields--two">
        <label className="report-field"><span>تاریخ انجام کار (شمسی)</span>
          <JalaliDatePicker value={date} max={today()} min={shift(today(),-90)}
            onChange={setDate} ariaLabel="تاریخ انجام کار"/>
        </label>
        <div className="ow-standard-credit">
          <span>زمان استاندارد این کار</span><b>{minutes(standard)}</b>
          <small>این زمان پس از تأیید مدیر ثبت می‌شود.</small>
        </div>
      </div>
      <label className="report-field"><span>خلاصه نتیجه کار (اختیاری)</span>
        <textarea maxLength={2000} rows={2} value={note} onChange={e=>setNote(e.target.value)}
          placeholder="مثلاً تعداد منابع ثبت‌شده یا نتیجه کار"/>
      </label>
      <label className="ow-checkbox ow-extra-toggle">
        <input type="checkbox" checked={requestExtra} onChange={e=>{
          const checked=e.target.checked
          setRequestExtra(checked)
          if(!checked){setRequested(String(standard));setReasonCode('');setReasonText('')}
        }}/>
        درخواست زمان بیشتر
      </label>
      {requestExtra&&<div className="ow-extra-panel">
        <p>مجموع زمان و علت افزایش را وارد کنید؛ تأیید نهایی با مدیر است.</p>
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
      <div className="ow-actions ow-worker-submit-actions">
        <button type="submit" className="report-btn report-btn--primary"
          disabled={busy||reportCommitted||!extraValid}>
          {requestExtra?'ارسال درخواست زمان بیشتر':'ارسال گزارش انجام کار'}
        </button>
        {task.state!=='in_progress'&&<button type="button" className="report-btn report-btn--light"
          onClick={()=>{void perform(()=>startMyTask(task.id),'start')}} disabled={busy||startCommitted||reportCommitted}
          title="اختیاری؛ برای اعلام وضعیت در حال انجام، بدون ثبت ساعت">شروع کار</button>}
      </div>
      <small className="ow-commit-disclosure">با ارسال این گزارش، انجام کار را اعلام می‌کنید؛ ساعت‌ها پس از تأیید مدیر منظور می‌شوند.</small>
      </form>
      {notice&&<p className="ow-muted" role="status">{notice}</p>}
      {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
      </dialog>
    </>}
    {notice&&<p className="ow-muted" role="status">{notice}</p>}
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
  </article>
}
/**
 * Each timeline item is ONE real work report's latest review state, ordered by
 * its work_date; this intentionally does not synthesize approval events/dates.
 */
function WorkerReportHistory({tasks,records,approvedMinutesTotal,onNavigate}) {
 const [view,setView]=useState('all')
 const [selectedReportId,setSelectedReportId]=useState(null)
 const counts=summarizeWorkerReportActivity(records)
 const entries=projectWorkerReportActivity(records,tasks,view)
 const detail=entries.find(r=>r.id===selectedReportId)
 const options=[
  ['all','همه'],['submitted','منتظر بررسی'],
  ['changes_requested','نیازمند اصلاح'],['rejected','ردشده'],['approved','تأییدشده']
 ]
 const approved=records.filter(e=>e.review_state==='approved')
 const total=approvedMinutesTotal??approved.reduce(
  (sum,e)=>sum+Number(e.approved_minutes||0),0)
 const approvalDisplay=entry=>entry.review_state==='approved'
   ?(entry.approved_minutes===null?'مقدار تأییدشده ثبت نشده':minutes(entry.approved_minutes))
   :entry.review_state==='rejected'?'تأیید نشد'
   :entry.review_state==='changes_requested'?'در انتظار اصلاح گزارش'
   :entry.review_state==='submitted'?'در انتظار بررسی':'تأییدشده نیست'
 return <section className="report-panel ow-worker-history-panel ow-b3-ledger"
   aria-label="سابقه گزارش‌ها و ساعات">
   <div className="ow-history-heading">
     <div><h2>سوابق گزارش‌ها و ساعات</h2>
       <p>دفتر پیگیری گزارش‌های ثبت‌شده؛ تاریخ هر ردیف، تاریخ انجام کار است، نه تاریخ رسیدگی مدیر.</p>
     </div>
     <div className="ow-history-approved-total">
       <span>مجموع زمان تأییدشده</span><strong>{exactDuration(total)}</strong>
       <small>بر اساس مجموع سرور، مستقل از تعداد ردیف‌های فهرست</small>
     </div>
   </div>
   <div className="ow-history-filter" role="group" aria-label="فیلتر وضعیت گزارش‌ها">
     {options.map(([id,label])=><button type="button" key={id}
       className={view===id?'is-selected':''} aria-pressed={view===id}
       onClick={()=>{setSelectedReportId(null);setView(id)}}>
       <span>{label}</span><b>{n(counts[id])}</b>
     </button>)}
   </div>
   <div className="ow-history-results-heading">
     <h3>دفتر گزارش‌ها</h3><span role="status">{n(entries.length)} گزارش</span>
   </div>
   <div className={`ow-b3-ledger-body ${detail?'ow-b3-ledger-body--detail':''}`}>
    <div className="ow-b3-ledger-list" role="list" aria-label="گزارش‌های ثبت‌شده">
     <div className="ow-b3-ledger-columns" aria-hidden="true">
       <span>کار / تاریخ انجام</span><span>وضعیت</span>
       <span>درخواستی</span><span>تأییدشده</span><span>جزئیات</span>
     </div>
     {entries.map(entry=><article className="ow-history-entry ow-b3-ledger-row" role="listitem" key={entry.id}>
       <div className="ow-history-entry__identity">
         <h4>{entry.title}</h4>
         <small>{entry.work_date?pretty(entry.work_date):'تاریخ انجام کار نامشخص'}</small>
       </div>
       <span className={'ow-history-status ow-history-status--'+
         (['submitted','changes_requested','rejected','approved'].includes(entry.review_state)
           ?entry.review_state:'other')}>
         {reviewLabels[entry.review_state]||'وضعیت نامشخص'}
       </span>
       <div className="ow-b3-ledger-value" aria-label="زمان درخواست‌شده">
         {entry.reported_minutes===null?'ثبت نشده':minutes(entry.reported_minutes)}
       </div>
       <div className="ow-b3-ledger-value" aria-label="زمان تأییدشده">{approvalDisplay(entry)}</div>
       <button type="button" data-report-inspect={entry.id}
         className="ow-b3-inspect-trigger"
         aria-expanded={selectedReportId===entry.id}
         onClick={()=>setSelectedReportId(entry.id)}>جزئیات</button>
     </article>)}
     {!entries.length&&<div className="ow-history-empty" role="status">
       <strong>{view==='all'?'هنوز گزارشی در سوابق ثبت نشده است.':'گزارشی با این وضعیت پیدا نشد.'}</strong>
       <p>وضعیت‌های دیگر را از فیلتر بالا بررسی کنید.</p>
     </div>}
    </div>
    {detail&&<aside className="ow-b3-inspector" aria-label="جزئیات گزارش">
      <div className="ow-b3-inspector-head">
        <h3>جزئیات گزارش</h3>
        <button type="button" className="ow-mini-btn" onClick={()=>{
          setSelectedReportId(null)
          document.querySelector(`[data-report-inspect="${detail.id}"]`)?.focus()
        }}>بستن</button>
      </div>
      <h4>{detail.title}</h4>
      <p className="ow-b3-inspector-facts">تاریخ انجام: {detail.work_date?pretty(detail.work_date):'نامشخص'}</p>
      <p className="ow-b3-inspector-facts">وضعیت: {reviewLabels[detail.review_state]||'نامشخص'}</p>
      <section><strong>زمان درخواست‌شده</strong><p>{detail.reported_minutes===null?'ثبت نشده':minutes(detail.reported_minutes)}</p>
        <strong>زمان تأییدشده</strong><p>{approvalDisplay(detail)}</p></section>
      {detail.review_note&&<section className="ow-b3-inspector-note">
        <strong>نظر مدیر</strong><p>{detail.review_note}</p></section>}
      {detail.extra_time_reason_text&&<section>
        <strong>دلیل ثبت‌شده برای زمان اضافه</strong><p>{detail.extra_time_reason_text}</p></section>}
      {['changes_requested','rejected'].includes(detail.review_state)&&
       <section className="ow-history-next-step"><p>برای بررسی امکان اصلاح، به فهرست کارهای نیازمند اقدام بروید.</p>
        <button type="button" className="report-btn report-btn--light"
          onClick={()=>onNavigate?.('tasks','action')}>رفتن به کارهای نیازمند اقدام</button>
       </section>}
    </aside>}
   </div>
 </section>
}

function WorkerSelfProfile({tasks,records,profile,requestLedger,approvedMinutesTotal,onNavigate,refreshRevision=0}) {
 const [identity,setIdentity]=useState(null)
 const [identityOwner,setIdentityOwner]=useState(null)
 const [requests,setRequests]=useState([])
 const [requestsLoading,setRequestsLoading]=useState(true)
 const [requestsError,setRequestsError]=useState('')
 const [profileReadFailed,setProfileReadFailed]=useState(false)
 const profileReadSequence=useRef(0)
 const [editing,setEditing]=useState(false)
 const [profileTab,setProfileTab]=useState('new')
 const profileDialogRef=useRef(null)
 const profileDialogTriggerRef=useRef(null)
 const [field,setField]=useState('major')
 const [value,setValue]=useState('')
 const [reason,setReason]=useState('')
 const [saving,setSaving]=useState(false)
 const [submitNotice,setSubmitNotice]=useState('')
 const submitLock=useRef(false)
 // Native browser top layer: preserve draft when dismissed, without changing
 // the operations authorization or the existing single-flight submit contract.
 // OpsApp's focus recheck explicitly hides any still-open descendant dialog.
 useLayoutEffect(()=>{
   const dialog=profileDialogRef.current
   if(!dialog)return
   if(editing){
     if(!dialog.open && typeof dialog.showModal==='function'){
       try{dialog.showModal()}catch{return}
     }
     dialog.querySelector('[data-profile-dialog-heading]')?.focus()
   }else if(dialog.open){
     dialog.close()
     profileDialogTriggerRef.current?.focus()
   }
 },[editing])
 const hasPendingField=fieldCode=>requestLedger.has(fieldCode)
   ||requests.some(r=>r.field_code===fieldCode&&r.review_state==='pending')
 const refreshProfile=async()=>{
   const sequence=++profileReadSequence.current
   setRequestsLoading(true)
   try{
     const [personal,items]=await Promise.all([getMyWorkerProfileV2(),getMyProfileChangeRequests()])
     if(sequence!==profileReadSequence.current)return false
     if(!personal||typeof personal!=='object'||!Array.isArray(items))
       throw Error('INVALID_PROFILE_PROJECTION')
     // Release the local receipt ONLY when its exact server request appears
     // in a completed state. A stale queue with no row cannot unlock it.
     for(const [code,receipt] of requestLedger){
       const item=items.find(r=>r.id===receipt.requestId)
       if(item&&item.review_state!=='pending')requestLedger.delete(code)
     }
     setIdentity(personal)
     setIdentityOwner(profile.worker_id)
     setRequests(items)
     setProfileReadFailed(false)
     setRequestsError('')
     return true
   }catch{
     if(sequence!==profileReadSequence.current)return false
     // Fail closed for the independently fetched self-profile and request history.
     setIdentity(null)
     setRequests([])
     setProfileReadFailed(true)
     setRequestsError('مشخصات یا درخواست‌ها دریافت نشدند. برای نمایش دوباره، دسترسی را بررسی کنید.')
     return false
   }finally{if(sequence===profileReadSequence.current)setRequestsLoading(false)}
 }
 useEffect(()=>{
   setIdentity(null);setRequests([]);setRequestsLoading(true)
   void refreshProfile()
 },[profile.worker_id,refreshRevision])
 const submitChange=async event=>{
   event.preventDefault()
   // A ref guards against same-tick double-submits before React updates.
   if(submitLock.current||saving||hasPendingField(field)
      ||value.trim().length<2||reason.trim().length<10)return
   submitLock.current=true
   setSaving(true);setRequestsError('');setSubmitNotice('')
   try{
     const receipt=await requestProfileChange({field,value:value.trim(),reason:reason.trim()})
     if(receipt?.ok!==true||!receipt.request_id)
       throw Error('invalid_profile_change_receipt')
     // An acknowledged request remains locked across tab remounts, even if
     // the subsequent read returns a stale queue or an access error.
     requestLedger.set(field,{requestId:receipt.request_id})
     setEditing(false);setValue('');setReason('')
     setSubmitNotice('درخواست اصلاح ثبت شد و برای رسیدگی مدیر ارسال شده است.')
     const refreshed=await refreshProfile()
     if(!refreshed)setSubmitNotice('درخواست ثبت شده است؛ تنها دریافت وضعیت تازه ناموفق بود.')
   }catch(e){
     const alreadyPending=String(e?.message||'').includes('profile_change_already_pending')
     setRequestsError(alreadyPending?'برای این مشخصه درخواست رسیدگی‌نشده وجود دارد؛ ابتدا وضعیت درخواست را دوباره دریافت کنید.'
       :'ثبت درخواست تأیید نشد. برای جلوگیری از تکرار، ابتدا وضعیت درخواست‌های قبلی را بررسی کنید.')
   }finally{submitLock.current=false;setSaving(false)}
 }

  const approved=records.filter(e=>e.review_state==='approved')
  // Lifetime server-approved credit may span more than the 1,000 visible records.
  const approvedTime=approvedMinutesTotal??approved.reduce(
    (sum,e)=>sum+Number(e.approved_minutes||0),0)
  const openTasks=tasks.filter(t=>!['completed','cancelled'].includes(t.state)).length
  if(profileReadFailed)return <section className="report-panel ow-self-profile ow-profile-access-recheck" role="alert">
    <p>مشخصات شخصی در دسترس نیستند. اطلاعات قبلی تا تأیید دوبارهٔ دسترسی پنهان می‌مانند.</p>
    {requestsError&&<p className="report-alert report-alert--error">{requestsError}</p>}
    {submitNotice&&<p role="status" className="ow-muted">{submitNotice}</p>}
    <button type="button" className="report-btn report-btn--light" disabled={requestsLoading}
      onClick={()=>{void refreshProfile()}}>تلاش مجدد برای دریافت مشخصات</button>
  </section>
  if(!identity||identityOwner!==profile.worker_id)return <section className="report-panel ow-self-profile" role="status">
    <p className="ow-muted">در حال بررسی دسترسی به مشخصات…</p>
  </section>
  return <section className="report-panel ow-self-profile">
    <div className="ow-presence-section-title"><h2>حساب من</h2>
      <span className="ow-status">زمان تأییدشده: {exactDuration(approvedTime)}</span></div>
    <div className="ow-self-identity">
      <div><small>نام و نام خانوادگی</small><strong>{identity?.name||'نامشخص'}</strong></div>
      <div><small>رشته تحصیلی</small><strong>{identity?.major||'ثبت نشده'}</strong></div>
      <div><small>سال ورود</small><strong>{identity?.entry_year||'ثبت نشده'}</strong></div>
      <div><small>واحد همکاری</small><strong>{unitLabels[identity?.unit]||identity?.unit||'نامشخص'}</strong></div>
    </div>
    <div className="ow-profile-change-launch">
      <button type="button" ref={profileDialogTriggerRef}
        className="report-btn report-btn--light ow-profile-change-trigger"
        aria-haspopup="dialog" aria-controls="ow-profile-change-dialog"
        onClick={()=>{setProfileTab('new');setEditing(true)}}>درخواست اصلاح و پیگیری</button>
      <small className="ow-muted">مشخصات فعلی تا بررسی و تأیید مدیر تغییر نمی‌کنند.</small>
    </div>
    <dialog ref={profileDialogRef} id="ow-profile-change-dialog"
      className="ow-profile-action-dialog" dir="rtl"
      onKeyDown={trapModalTab}
      aria-labelledby="ow-profile-change-dialog-title"
      onCancel={event=>{
        event.preventDefault()
        if(!saving)setEditing(false)
      }}
      onClose={()=>{if(editing&&!saving)setEditing(false)}}>
      <div className="ow-profile-action-dialog__head">
        <div>
          <h3 id="ow-profile-change-dialog-title" tabIndex={-1}
            data-profile-dialog-heading>درخواست اصلاح مشخصات</h3>
          <p className="ow-muted">فقط مشخصه موردنظر و دلیل اصلاح را وارد کنید.</p>
        </div>
        <button type="button" className="ow-profile-action-dialog__close"
          disabled={saving} onClick={()=>setEditing(false)}
          aria-label="بستن پنجره اصلاح مشخصات">بستن</button>
      </div>
      {editing&&<div className="ow-b3-profile-tabs" role="group" aria-label="درخواست‌های اصلاح">
        <button type="button" aria-pressed={profileTab==='new'}
          onClick={()=>setProfileTab('new')}>درخواست جدید</button>
        <button type="button" aria-pressed={profileTab==='history'}
          onClick={()=>setProfileTab('history')}>پیگیری درخواست‌ها · {n(requests.length)}</button>
      </div>}
      {editing&&profileTab==='new'&&
      <form onSubmit={submitChange} className="ow-profile-change-form">
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
        {hasPendingField(field)&&<small role="status">برای این مشخصه درخواست ثبت‌شده یا منتظر بررسی وجود دارد؛ ثبت دوباره غیرفعال است.</small>}
        {submitNotice&&<small role="status">{submitNotice}</small>}
        <button type="submit" className="report-btn report-btn--primary"
          disabled={saving||hasPendingField(field)||value.trim().length<2||reason.trim().length<10}>
          ارسال درخواست</button>
      </form>
      }
      {editing&&profileTab==='history'&&
      <section className="ow-b3-profile-history" aria-label="پیگیری درخواست‌های اصلاح">
        {requestsLoading&&<p role="status">در حال دریافت درخواست‌ها…</p>}
        {!requestsLoading&&requests.length===0&&<p>درخواست قبلی ثبت نشده است.</p>}
        <div className="ow-profile-requests-list">
          {requests.map(r=><article className="ow-profile-request-item" key={r.id}>
            <div className="ow-profile-request-item__top">
              <div className="ow-profile-request-item__identity">
                <small>مشخصهٔ درخواستی</small>
                <strong>{r.field_code==='major'?'رشته تحصیلی':'نام و نام خانوادگی'}</strong>
                <p>{r.proposed_value}</p>
              </div>
              <span className={'ow-profile-request-status ow-profile-request-status--'+
                (['pending','approved','rejected'].includes(r.review_state)?r.review_state:'other')}>
                {r.review_state==='pending'?'منتظر تأیید':
                 r.review_state==='approved'?'تأیید شد':'رد شد'}
              </span>
            </div>
            <details className="ow-profile-request-item__note">
              <summary>مشاهدهٔ جزئیات درخواست</summary>
              <p><strong>مقدار پیشنهادی:</strong> {r.proposed_value}</p>
              <p><strong>نظر مدیر:</strong> {r.review_note||'هنوز نظری ثبت نشده است.'}</p>
            </details>
          </article>)}
        </div>
      </section>}
    </dialog>
    {submitNotice&&<p className="ow-muted" role="status">{submitNotice}</p>}
    {requestsError&&<div role="alert" className="report-alert report-alert--error">{requestsError}</div>}
    {requestsLoading&&<p role="status" className="ow-muted">در حال دریافت وضعیت درخواست‌ها…</p>}
  </section>
}
export function WorkerOperations({profile,navigation,setNavigation,refreshRevision=0,
  workerName='',workerUnit='',loginEmail='',onLogout,onRefresh,onToggleSettings,settingsOpen=false}) {
  // The protected worker projection must never be rendered for a new principal
  // while its new server read is pending. Same-component account replacement
  // may otherwise expose the previous worker for one React paint.
  const [workSnapshot,setWorkSnapshot]=useState({workerId:null,data:null})
  const data=workSnapshot.workerId===profile.worker_id&&workSnapshot.data
    ?workSnapshot.data:{tasks:[],weekly_slots:[],exceptions:[],time_entries:[]}
  // Task acknowledgements survive switching work/profile/presence tabs, but
  // are strictly scoped to this authenticated worker and this React session.
  const acknowledgedActions=useRef({workerId:profile.worker_id,items:new Map(),profileRequests:new Map()})
  if(acknowledgedActions.current.workerId!==profile.worker_id)
    acknowledgedActions.current={workerId:profile.worker_id,items:new Map(),profileRequests:new Map()}
  const [localNavigation,setLocalNavigation]=useState({section:'tasks',taskRange:'today'})
  const [submissionReceipt,setSubmissionReceipt]=useState(null)
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false)
  const [selectedTaskId,setSelectedTaskId]=useState(null)
  const selected=navigation||localNavigation
  const updateNavigation=patch=>{
    const fn=previous=>({...previous,...patch})
    ;(setNavigation||setLocalNavigation)(fn)
  }
  const section=['tasks','availability','history','profile'].includes(selected.section)?selected.section:'tasks'
  const taskRange=['today','week','month','upcoming'].includes(selected.taskRange)?selected.taskRange:'today'
  const taskView=['action','pending','upcoming','completed','calendar'].includes(selected.taskView)
    ?selected.taskView:'action'
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [readFailed,setReadFailed]=useState(false)
  const readSequence=useRef(0)
  const refresh=async()=>{
    const sequence=++readSequence.current
    setLoading(true);setError('')
    try{
      const result=await getMyWorkV2()
      if(sequence!==readSequence.current)return
      setWorkSnapshot({workerId:profile.worker_id,data:scopeSelfWorkRows(result,profile.worker_id)})
      setReadFailed(false)
    }catch(e){
      if(sequence!==readSequence.current)return
      // Never retain a visible old work list after a failed authorization refresh.
      setWorkSnapshot({workerId:profile.worker_id,data:{tasks:[],weekly_slots:[],exceptions:[],time_entries:[]}})
      setReadFailed(true)
      setError(readableError(e))
    }finally{if(sequence===readSequence.current)setLoading(false)}
  }
  useEffect(()=>{void refresh()},[profile.worker_id,refreshRevision])
  // Returning from Profile/Presence/History should get the latest canonical
  // server review cycle. Never depend on in-memory array mutation to unlock
  // a correction or infer that manager approval has happened.
  const previousSectionRef=useRef(section)
  useEffect(()=>{
    const previous=previousSectionRef.current
    previousSectionRef.current=section
    if(previous!==section&&(section==='tasks'||section==='history'))
      void refresh()
  },[section])
  const records=data.time_entries||[]
  const approved=records.filter(x=>x.review_state==='approved')
  const total=data.approved_minutes_total??approved.reduce(
    (sum,e)=>sum+Number(e.approved_minutes||0),0)
  const tasks=data.tasks||[]
  const week=persianWeekBounds(today())
  const month=persianMonthBounds(today())
  // An explicit Upcoming filter avoids hiding next-month assignments behind
  // the profile page. It excludes completed/cancelled tasks and never adds
  // overdue work that contradicts the selected future-only interval.
  const ranged=taskRange==='today'?tasks.filter(t=>t.planned_date===today()):
    taskRange==='week'?tasks.filter(t=>t.planned_date>=week.start&&t.planned_date<=week.end):
    taskRange==='month'?tasks.filter(t=>t.planned_date>=month.start&&t.planned_date<=month.end):
    tasks.filter(t=>t.planned_date>today()&&!['completed','cancelled'].includes(t.state))
      .sort((a,b)=>a.planned_date.localeCompare(b.planned_date))
  const overdue=tasks.filter(t=>t.planned_date<today()&&['assigned','in_progress','needs_changes'].includes(t.state))
  const byDate=taskRange==='upcoming' ? ranged :
    [...overdue,...ranged.filter(t=>!overdue.some(p=>p.id===t.id))]
  const focusCounts=summarizeWorkerTaskFocus(tasks,today())
  const visible=taskView==='calendar'?byDate:selectWorkerTaskFocus(tasks,today(),taskView)
  const focusOptions=[
    ['action','نیازمند اقدام','اصلاح گزارش‌ها و انجام کارهای موعدرسیده'],
    ['pending','منتظر بررسی','گزارش‌های ارسالی که هنوز در انتظار مدیرند'],
    ['upcoming','پیش‌رو','کارهای برنامه‌ریزی‌شده برای روزهای بعد'],
    ['completed','انجام‌شده','کارهای تکمیل‌شده'],
  ]
  const focusHeading=focusOptions.find(item=>item[0]===taskView)
  const inspectedTask=visible.find(t=>t.id===selectedTaskId)
  const inspectedReport=inspectedTask
    ?records.filter(r=>r.task_id===inspectedTask.id).sort(
      (a,b)=>(b.work_date||'').localeCompare(a.work_date||''))[0]:null
  const sectionNames={tasks:'کارهای من',availability:'زمان حضور',
    history:'سوابق گزارش‌ها',profile:'حساب من'}
  const emptyText={
    action:'اکنون کاری که نیازمند اقدام شما باشد وجود ندارد.',
    pending:'گزارش منتظر بررسی در فهرست کارها وجود ندارد.',
    upcoming:'کار برنامه‌ریزی‌شده‌ای برای روزهای آینده ثبت نشده است.',
    completed:'هنوز کاری با وضعیت تکمیل‌شده ثبت نشده است.',
    calendar:'کاری برای این بازهٔ زمانی ثبت نشده است.',
  }
  if(readFailed)return <div className="ow-workspace ow-worker-workspace ow-access-recheck" role="alert">
    <p>برنامهٔ کاری در دسترس نیست. تا بررسی دوبارهٔ دسترسی، اطلاعات قبلی نمایش داده نمی‌شوند.</p>
    <div className="report-alert report-alert--error">{error}</div>
    <button type="button" className="report-btn report-btn--light" disabled={loading}
      onClick={()=>{void refresh()}}>تلاش مجدد برای دریافت اطلاعات</button>
  </div>
  return <div className={`ow-workspace ow-worker-workspace ow-b3-layout ${sidebarCollapsed?'ow-b3-is-collapsed':''}`}>
    <a className="ow-b3-skip" href="#ow-b3-main">رفتن به محتوای اصلی</a>
    <aside className="ow-b3-sidebar" aria-label="ناوبری اصلی دانشجوکار">
      <div className="ow-b3-brand" title="فضای کار دانشجوکار">
        <span className="ow-b3-brand__icon" aria-hidden="true">▤</span>
        {!sidebarCollapsed&&<div><strong>فضای کار دانشجوکار</strong>
          <small>دانشگاه فرهنگیان</small></div>}
      </div>
      {!sidebarCollapsed&&<p className="ow-b3-sidebar-caption">فضای کاری</p>}
      <SectionTabs value={section} onChange={next=>{
        setSelectedTaskId(null);updateNavigation({section:next})
      }} options={[
        ['tasks','کارهای من'],['availability','زمان حضور'],['history','سوابق گزارش‌ها'],['profile','حساب من'],
      ]}/>
      <div className="ow-b3-sidebar__footer">
        <div className="ow-b3-worker" title={workerName}>
          <span className="ow-b3-worker__avatar" aria-hidden="true">{workerName?.trim()?.[0]||'د'}</span>
          {!sidebarCollapsed&&<div><strong>{workerName}</strong>
            <small>{workerUnit}</small>
            {loginEmail&&<small className="ow-b3-login-email">
              ایمیل ورود: <bdi dir="ltr">{loginEmail}</bdi></small>}
          </div>}
        </div>
        <div className="ow-b3-worker-actions">
          <button type="button" onClick={onRefresh} title="به‌روزرسانی" aria-label="به‌روزرسانی">
            <span aria-hidden="true">↻</span>{!sidebarCollapsed&&' به‌روزرسانی'}</button>
          <button type="button" onClick={onToggleSettings} aria-expanded={settingsOpen}
            title="تنظیمات حساب" aria-label="تنظیمات حساب">
            <span aria-hidden="true">⚙</span>{!sidebarCollapsed&&' تنظیمات'}</button>
          <button type="button" onClick={onLogout} title="خروج" aria-label="خروج">
            <span aria-hidden="true">⇥</span>{!sidebarCollapsed&&' خروج'}</button>
        </div>
        <button type="button" className="ow-b3-collapse"
          onClick={()=>setSidebarCollapsed(value=>!value)}
          aria-label={sidebarCollapsed?'بازکردن سایدبار':'جمع‌کردن سایدبار'}
          aria-expanded={!sidebarCollapsed}>
          <span aria-hidden="true">{sidebarCollapsed?'«':'»'}</span>
          {!sidebarCollapsed&&' جمع‌کردن سایدبار'}
        </button>
      </div>
    </aside>
    <main className="ow-b3-stage" id="ow-b3-main">
      <header className="ow-b3-toolbar">
        <span className="ow-b3-breadcrumb">فضای کاری <span aria-hidden="true">›</span>
          <strong>{sectionNames[section]}</strong></span>
        <span className="ow-b3-online">حساب فعال · اطلاعات عملیاتی</span>
      </header>
      {loading&&<p className="ow-muted" role="status">در حال دریافت برنامه…</p>}
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
    {section==='tasks'&&<section className="report-panel ow-worker-task-workspace">
      {submissionReceipt?.workerId===profile.worker_id&&
        <div className="ow-worker-submission-receipt" role="status">
          <div><strong>گزارش انجام کار دریافت شد</strong>
            <p>گزارش «{submissionReceipt.title}» ثبت شد. ساعت‌ها فقط پس از تأیید مدیر منظور می‌شوند.</p>
          </div>
          <div className="ow-worker-submission-receipt__actions">
            <button type="button" className="report-btn report-btn--light"
              onClick={()=>updateNavigation({taskView:'pending'})}>پیگیری گزارش</button>
            <button type="button" className="ow-mini-btn"
              onClick={()=>setSubmissionReceipt(null)}>بستن پیام</button>
          </div>
        </div>}
      <div className="ow-worker-task-intro">
        <div><h1>کارهای من</h1>
          <p>ابتدا کارهایی که نیاز به اقدام شما دارند؛ سایر وضعیت‌ها و برنامهٔ زمانی در دسترس‌اند.</p>
        </div>
        <span className="ow-b3-current-count">{n(tasks.length)} کار در فهرست</span>
      </div>
      <div className="ow-worker-focus-switch" role="group" aria-label="وضعیت کارهای من">
        {focusOptions.map(([id,title])=>
          <button type="button" key={id} aria-current={taskView===id?'true':undefined}
            className={taskView===id?'is-selected':''}
            onClick={()=>{setSelectedTaskId(null);updateNavigation({taskView:id})}}>
            <span className="ow-worker-focus-title">{title}</span>
            <strong>{n(focusCounts[id])}</strong>
          </button>)}
      </div>
      <div className="ow-worker-date-tools">
        <span>برنامه بر اساس تاریخ</span>
        <div className="ow-range-switch" role="group" aria-label="بازه نمایش کارها">
          {[['today','امروز'],['week','این هفته'],['month','این ماه'],['upcoming','آینده']].map(([id,title])=>
            <button type="button" key={id}
              aria-pressed={taskView==='calendar'&&taskRange===id}
              className={taskView==='calendar'&&taskRange===id?'is-selected':''}
              onClick={()=>updateNavigation({taskView:'calendar',taskRange:id})}>{title}</button>)}
        </div>
      </div>
      <div className="ow-worker-list-heading ow-worker-results-heading">
        <div>
          <h3>{focusHeading?.[1]||'برنامهٔ زمانی'}</h3>
          <p className="ow-muted">
            {focusHeading?.[2]||'فهرست کارها بر اساس تاریخ انتخابی'}
            {taskView==='calendar'&&taskRange!=='upcoming'&&overdue.length>0
              ?` · ${n(overdue.length)} کار معوق نیز نمایش داده می‌شود`:''}
          </p>
        </div>
        <span className="ow-worker-results-count" role="status">{n(visible.length)} کار</span>
      </div>
      <div className={`ow-b3-task-body ${inspectedTask?'ow-b3-task-body--inspecting':''}`}>
      <div className="ow-list ow-worker-tasks">
        {visible.map(t=><WorkerTaskCard key={t.id} task={t} onSaved={refresh}
          onInspect={()=>setSelectedTaskId(t.id)}
          inspected={selectedTaskId===t.id}
          onReportAccepted={()=>setSubmissionReceipt({workerId:profile.worker_id,title:t.title})}
          actionLedger={acknowledgedActions.current.items}
          reviewCycle={(data.time_entries||[]).filter(e=>e.task_id===t.id
            &&['changes_requested','rejected'].includes(e.review_state))
            .map(e=>e.id).sort().join('|')}/>)}
        {!visible.length&&<div className="ow-worker-empty" role="status">
          <strong>{emptyText[taskView]}</strong>
          <p>برای بررسی وضعیت‌های دیگر، یکی از دسته‌های بالا را انتخاب کنید.</p>
          {taskView==='action'&&focusCounts.upcoming>0&&<button type="button"
            className="report-btn report-btn--light"
            onClick={()=>updateNavigation({taskView:'upcoming'})}>
            دیدن {n(focusCounts.upcoming)} کار پیش‌رو
          </button>}
        </div>}
      </div>
      {inspectedTask&&<aside className="ow-b3-inspector" aria-label="جزئیات کار انتخابی">
        <div className="ow-b3-inspector-head">
          <h3>جزئیات کار</h3>
          <button type="button" className="ow-mini-btn" onClick={()=>{
            setSelectedTaskId(null);document.querySelector(`[data-task-inspect="${inspectedTask.id}"]`)?.focus()
          }}>بستن</button>
        </div>
        <h4>{inspectedTask.title}</h4>
        <p className="ow-b3-inspector-facts">{stateLabels[inspectedTask.state]||inspectedTask.state}
          {' · '}{pretty(inspectedTask.planned_date)}{' · '}
          {minutes(inspectedTask.estimate_minutes)}</p>
        {inspectedTask.instructions
          ?<section><strong>شرح وظیفه</strong><p>{inspectedTask.instructions}</p></section>
          :<p className="ow-muted">توضیح دیگری برای این کار ثبت نشده است.</p>}
        {inspectedReport?.review_note&&<section className="ow-b3-inspector-note">
          <strong>آخرین نظر مدیر دربارهٔ گزارش</strong>
          <p>{inspectedReport.review_note}</p>
        </section>}
        <p className="ow-muted">برای انجام یا اصلاح گزارش، از دکمهٔ همان ردیف استفاده کنید.</p>
      </aside>}
      </div>
    </section>}
    {section==='availability'&&<section className="report-panel">
      <h2>برنامه حضور</h2>
      <ScheduleEditor workerId={profile.worker_id} data={data} onSaved={refresh}/>
    </section>}
    {section==='history'&&<WorkerReportHistory tasks={tasks} records={records}
      approvedMinutesTotal={data.approved_minutes_total}
      onNavigate={(nextSection,nextView)=>updateNavigation({section:nextSection,
        ...(nextView?{taskView:nextView}:{})})}/>}
    {section==='profile'&&<WorkerSelfProfile tasks={tasks} records={records} profile={profile}
      requestLedger={acknowledgedActions.current.profileRequests}
      onNavigate={(nextSection,nextView)=>updateNavigation({section:nextSection,
        ...(nextView?{taskView:nextView}:{})})}
      approvedMinutesTotal={data.approved_minutes_total} refreshRevision={refreshRevision}/>}
    </main>
  </div>
}
