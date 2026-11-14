import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {WorkerGuideWelcome,WorkerGuideSpotlight} from './WorkerGuide.jsx'
import {workerGuideStorageKey} from './lib/workerGuide.mjs'
import { trapModalTab } from './lib/dialogFocusTrap.mjs'
import {canonicalPresencePayload,createPresenceAttemptLedger,interpretPresenceReceipt,workerPresenceItems,managerPresenceItems} from './lib/presenceChanges.mjs'
import {requestPresenceChange,listPresenceChanges} from './lib/presenceChangesApi.js'
import {WorkerPresenceRequests,ManagerPresenceReviewQueue} from './components/PresenceChangePanels.jsx'
import { selectWorkerTaskFocus, summarizeWorkerTaskFocus } from './lib/workerTaskFocus.mjs'
import {projectWorkerReportActivity,summarizeWorkerReportActivity} from './lib/workerReportActivity.mjs'
import {filterPerformanceByWorkDate} from './lib/workerPerformance.mjs'
import WorkerPerformancePanel from './components/WorkerPerformancePanel.jsx'
import WorkerInfoHint from './components/WorkerInfoHint.jsx'
import {canonicalWorkerReportPayload,sameWorkerReportPayload,isDefinitiveWorkerReportRejection,WORKER_REPORT_CHANGED_RETRY_NOTICE} from './lib/workerReportRetry.mjs'
import {
  getAdminWork, getMyWork, setWeeklyDay, setDateException,
  assignWorkerTask, startMyTask, submitMyTime, reviewWorkerTime,
} from './lib/operations'
import './operations-workspace.css'
import JalaliDatePicker from './components/JalaliDatePicker'
import { scopeWorkerHistory, filterWorkerHistory, summarizeWorkerHistory } from './lib/workerHistory'
import { assessAssignmentCapacity, assessAvailabilityOverride, firstMatchingWeekday, isoWeekday } from './lib/assignmentCapacity.mjs'
import { describeTaskWorkflow,selectManagerTasks,summarizeTaskWorkflow,selectPendingApprovals } from './lib/operationsTaskOverview.mjs'
import WorkerLifecycleManager from './components/WorkerLifecycleManager'
import { workerStateLabels } from './lib/workerLifecycle.mjs'
import { MAX_DAILY_WINDOWS, selectedWeeklyWindows, validateDailyWindows, persianWeekBounds, suggestNextWindow, scopeSelfWorkRows } from './lib/weeklyScheduleGrid.mjs'
import { persianMonthCells, previousPersianMonth, nextPersianMonth, persianMonthBounds } from './lib/persianMonthCalendar.mjs'
import {projectUnifiedPeerDay,sharedPeerClockScale,packPeerDayIntervals,labelPeerInterval,peerToneIndex} from './lib/workerUnifiedPresence.mjs'
import {minutesToClock} from './lib/weeklyScheduleGrid.mjs'
import {useUnifiedPeerCalendar} from './lib/useUnifiedPeerCalendar.js'
import { projectDayPresence } from './lib/presenceDayProjection.mjs'
import TaskAssignmentEditor from './components/TaskAssignmentEditor'
import TeamScheduleOverview from './components/TeamScheduleOverview'
import TermBudgetPanel from './components/TermBudgetPanel'
import FocusedReviewQueue from './components/FocusedReviewQueue'
import ManagerHistoryExplorer from './components/ManagerHistoryExplorer'
import {managerHistoryProjection,managerHistoryExportMetadata} from './lib/managerHistoryExport.mjs'
import {buildManagerHistoryWorkbook} from './lib/managerHistoryWorkbook.mjs'
import {managerReviewItems} from './lib/managerReviewRows.mjs'
// Load the optional manager surface ONLY after backend rollout explicitly enables it.
const TermMembershipPanel = lazy(()=>import('./components/TermMembershipPanel'))
const WorkPoolManagerPanel = lazy(()=>import('./components/WorkPoolManagerPanel'))
const WorkPoolWorkerPanel = lazy(()=>import('./components/WorkPoolWorkerPanel'))
// SWTB15 separate from mandatory acceptance: informational, nonblocking RC6.
const WorkerAgreementModalPreview = lazy(()=>import('./components/WorkerAgreementModalPreview.jsx'))
import * as unifiedPeerApi from './lib/operationsV2'
import { getAdminWorkV2,getMyWorkV2,getMyWorkerProfileV2,getMyProfileChangeRequests,
 requestProfileChange,reviewProfileChange,getUnitHourTotals,
 setWorkerState,getWorkerStateHistory } from './lib/operationsV2'

const fa = new Intl.NumberFormat('fa-IR')
const dLabel = new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
  dateStyle:'medium', timeZone:'UTC',
})
const dateParts = new Intl.DateTimeFormat('en-US',{
  calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'
})
const dayLabels = [[6,'شنبه'],[7,'یکشنبه'],[1,'دوشنبه'],[2,'سه‌شنبه'],[3,'چهارشنبه'],[4,'پنجشنبه'],[5,'جمعه']]
const unitLabels = {library:'کتابخانه',public_relations:'روابط عمومی',research:'پژوهش'}
// SWTB21A/B are now installed in the sole Supabase project, with enforcement
// in observation mode. Show the admin-only permissions view by default; a
// build-time 'false' remains an emergency UI rollback without schema changes.
const termMembershipUIEnabled=import.meta.env?.VITE_SWTB21_TERM_MEMBERSHIP_UI!=='false'
// D1 backend is now installed in the sole Supabase project with zero templates,
// zero offers and zero claims. Enable only the manager-authorized, worker-self
// surfaces; keep emergency build-time UI kill switch without altering DB policy.
const workPoolUIEnabled=import.meta.env?.VITE_SWTB21_WORK_POOL_UI!=='false'
// Read-only charter visible to worker by default; emergency build-time OFF switch.
// Does NOT grant or deny writes, record consent, or change any worker state.
const workerCharterInfoEnabled=import.meta.env?.VITE_SWTB15_READONLY_CHARTER_UI!=='false'
// SWTB22-D3 is a presentation-only, independently reversible manager release.
// Legacy manager route and all TaskAssignmentEditor server guards remain unchanged.
const focusTaskUIEnabled=import.meta.env?.VITE_SWTB22_TASKS_FOCUS_UI==='true'
// D4 is a manager-only presentation refactor: legacy/worker calendars unchanged.
const focusPresenceUIEnabled=import.meta.env?.VITE_SWTB22_PRESENCE_FOCUS_UI==='true'
// D5 manager-only review UX; true on a separately reviewed Preview release.
const focusDecisionsUIEnabled=import.meta.env?.VITE_SWTB22_REVIEW_FOCUS_UI==='true'
// D6A scoped manager history/export UX remains OFF until separate release gate.
const focusHistoryUIEnabled=import.meta.env?.VITE_SWTB22_HISTORY_FOCUS_UI==='true'
// D6B affects only manager term-budget presentation; source defaults OFF.
const focusTermBudgetUIEnabled=import.meta.env?.VITE_SWTB22_TERM_FOCUS_UI==='true'
// OFF until paired backend, UI acceptance and explicit owner release.
const presenceApprovalUIEnabled=import.meta.env?.VITE_SWTB18_PRESENCE_APPROVAL_UI==='true'

/** Complete, current-scope server aggregate, independent of bounded task/history rows.
 * Fail closed to an explicit unavailable message instead of displaying false zero totals. */
function UnitHourSummary({scope,approvedTotal=null,refreshRevision=0}) {
 const [result,setResult]=useState({scope:null,units:[],loading:true,error:false})
 useEffect(()=>{
   let active=true
   setResult({scope:null,units:[],loading:true,error:false})
   getUnitHourTotals().then(data=>{
     if(!active)return
     if(data?.scope!==scope||!Array.isArray(data?.units))throw Error('invalid_unit_hours_scope')
     setResult({scope,units:data.units,loading:false,error:false})
   }).catch(()=>{if(active)setResult({scope:null,units:[],loading:false,error:true})})
   return()=>{active=false}
 },[scope,refreshRevision])
 return <section className={scope==='worker'?'ow-unit-hours ow-unit-hours--combined':'ow-unit-hours'}
   data-swtb-guide={scope==='worker'?'history-summary':undefined}
   aria-label="مجموع ساعات تأییدشده به تفکیک واحد فعالیت">
   <div className="ow-unit-hours__heading">
     <div className="ow-summary-title">
       <h3>{scope==='worker'?'ساعات تأییدشده':'ساعات به تفکیک واحد فعالیت'}</h3>
       {scope==='worker'
         ?<WorkerInfoHint label="توضیح مجموع ساعات"
           text="مجموع قطعی سرور در دوره‌های مجاز است و با فیلتر گزارش‌های پایین صفحه تغییر نمی‌کند؛ زمان حضور برنامه‌ریزی‌شده یا گزارش در انتظار بررسی در آن منظور نمی‌شود."/>
         :<small>مجموع کل زمان تأییدشده در سرور؛ مستقل از واحد ثبت‌نام دانشجو</small>}
     </div>
     {scope==='worker'&&<div className="ow-unit-hours__total">
       <strong aria-label="مجموع ساعات تأییدشده">{approvedTotal===null?'—':exactDuration(approvedTotal)}</strong>
     </div>}
   </div>
   {result.loading&&<p className="ow-muted" role="status">در حال دریافت جمع ساعات واحدها…</p>}
   {result.error&&<p className="ow-warning" role="status">جمع ساعات واحدها فعلاً در دسترس نیست؛ عدد صفر به‌جای دادهٔ ناموجود نمایش داده نمی‌شود.</p>}
   {!result.loading&&!result.error&&<div className="ow-unit-hours__grid">
     {result.units.map(item=><article key={item.unit}>
       <strong>{item.name||unitLabels[item.unit]||item.unit}</strong>
       <b>{exactDuration(Number(item.approved_minutes)||0)}</b>
       {(scope==='admin'||Number(item.pending_reports)>0)&&<small>
         {Number(item.pending_reports)>0
           ?`${n(item.pending_reports)} گزارش منتظر بررسی · ${exactDuration(Number(item.pending_requested_minutes)||0)} درخواستی`
           :'گزارش منتظر بررسی: ۰'}
       </small>}
     </article>)}
   </div>}
   {scope==='admin'&&<p className="ow-muted">برای مشاهده مصرف هر نیمسال و تنظیم سهمیه‌ها، تب «نیمسال و سهمیه» را انتخاب کنید.</p>}
 </section>
}

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
      data-swtb-guide={'nav-'+id}
      aria-current={value===id?'page':undefined}
      onClick={()=>onChange(id)}>{title}</button>)}
  </nav>
}
// Fixed weekly slots use native, keyboard-accessible hour/minute lists.
// Preserve the server's one-minute resolution and the valid end-only 24:00.
const weeklyClockHours=Array.from({length:24},(_,i)=>String(i).padStart(2,'0'))
const weeklyClockMinutes=Array.from({length:60},(_,i)=>String(i).padStart(2,'0'))
function WeeklyClockSelect({label,value,onChange,allowDayEnd=false,disabled=false}){
  const [hour='',minute='']=(typeof value==='string'?value:'').split(':')
  const isDayEnd=allowDayEnd&&hour==='24'
  return <div className="ow-slot-clock">
    <span className="ow-slot-clock__caption">{label}</span>
    <div className="ow-slot-clock__controls" dir="ltr">
      <select value={hour} required disabled={disabled}
        aria-label={`ساعت ${label}`}
        onChange={event=>{
          const next=event.target.value
          onChange(next?`${next}:${next==='24'?'00':minute||'00'}`:'')
        }}>
        <option value="" disabled>--</option>
        {weeklyClockHours.map(h=><option key={h} value={h}>{h}</option>)}
        {allowDayEnd&&<option value="24">24</option>}
      </select>
      <span className="ow-slot-clock__separator" aria-hidden="true">:</span>
      <select value={isDayEnd?'00':minute} required
        aria-label={`دقیقه ${label}`} disabled={disabled||isDayEnd}
        onChange={event=>onChange(hour?`${hour}:${event.target.value}`:`:${event.target.value}`)}>
        <option value="" disabled>--</option>
        {(isDayEnd?['00']:weeklyClockMinutes).map(m=><option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  </div>
}
function ScheduleEditor({workerId,onSaved,data,onPlanAssignment,initialDate='',showPeers=false,peerRefreshRevision=0}) {
  const [effective,setEffective]=useState(today())
  const [editingDay,setEditingDay]=useState(null)
  const [editingSlot,setEditingSlot]=useState(null)
  const [draftWindows,setDraftWindows]=useState([])
  const [monthAnchor,setMonthAnchor]=useState(today())
  const [selectedDate,setSelectedDate]=useState('')
  const [peerSelectedDate,setPeerSelectedDate]=useState('')
  const dateDialogRef=useRef(null)
  const lastDateButtonRef=useRef(null)
  const [exceptionKind,setExceptionKind]=useState('replacement_intervals')
  const [exceptionWindows,setExceptionWindows]=useState([])
  const [exceptionSlot,setExceptionSlot]=useState(null)
  const [note,setNote]=useState('')
  const [presenceReason,setPresenceReason]=useState('')
  const [presenceRequestRevision,setPresenceRequestRevision]=useState(0)
  const presenceAttemptLedger=useRef(null)
  if(!presenceAttemptLedger.current)presenceAttemptLedger.current=createPresenceAttemptLedger()
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
  // The worker's OWN 7×4 editor stays authoritative. This additional feed
  // is only a whitelisted, role-scoped visual projection, disabled by default.
  const peerWeek=useMemo(()=>persianWeekBounds(effective),[effective])
  const peerRange=useMemo(()=>({
    weekStart:peerWeek.start,weekEnd:peerWeek.end,
    monthStart:month.start,monthEnd:month.end,
  }),[peerWeek.start,peerWeek.end,month.start,month.end])
  const peerSnapshot=useUnifiedPeerCalendar({
    range:peerRange,enabled:showPeers,workerId,
    refreshRevision:peerRefreshRevision,
    fetcher:unifiedPeerApi.getWorkerTeamCalendar,
  })
  const peerReady=showPeers&&peerSnapshot.status==='ready'
  const peerDays=useMemo(()=>peerReady
    ?Array.from({length:7},(_,i)=>projectUnifiedPeerDay(peerSnapshot.data,
       firstMatchingWeekday(effective,dayLabels[i][0]),workerId))
    :[],[peerReady,peerSnapshot.data,effective,workerId])
  const peerDaysByDate=useMemo(()=>new Map(peerDays.map(day=>[day.date,day])),[peerDays])
  const clockScale=useMemo(()=>sharedPeerClockScale(peerDays),[peerDays])
  const peerMonthCounts=useMemo(()=>peerReady
    ?new Map(month.days.filter(Boolean).map(day=>{
      const record=projectUnifiedPeerDay(peerSnapshot.data,day.date,workerId)
      return [day.date,record.plannedCount]
    })) :new Map(),[peerReady,peerSnapshot.data,month.days,workerId])
  const peerDetail=useMemo(()=>peerReady&&peerSelectedDate
    ?projectUnifiedPeerDay(peerSnapshot.data,peerSelectedDate,workerId):null,
    [peerReady,peerSelectedDate,peerSnapshot.data,workerId])
  const percentForMinute=minute=>((minute-clockScale.start)/
    (clockScale.end-clockScale.start))*100
  const showPeerDay=date=>{
    setPeerSelectedDate(date)
    if(date<month.start||date>month.end)setMonthAnchor(date)
  }
  const weeklyValidation=validateDailyWindows(draftWindows)
  const exceptionValidation=exceptionKind==='unavailable'
    ? {ok:true,intervals:[],minutes:0}
    : validateDailyWindows(exceptionWindows)
  const selectedWeekDate=editingDay===null?'':firstMatchingWeekday(effective,editingDay)
  const weekPreview=editingDay===null||!weeklyValidation.ok?null:
    assessAvailabilityOverride(calendarData,workerId,selectedWeekDate,weeklyValidation.intervals)
  const existingDayException=selectedDate?(calendarData.exceptions||[]).find(
    ex=>ex.worker_id===workerId&&ex.local_date===selectedDate):null
  const exceptionPreview=!selectedDate||!exceptionValidation.ok?null:
    assessAvailabilityOverride(calendarData,workerId,selectedDate,exceptionValidation.intervals,
      {unavailable:exceptionKind==='unavailable'})

  useEffect(()=>{
    setEditingDay(null);setEditingSlot(null);setDraftWindows([]);setSelectedDate('');setExceptionSlot(null)
    setError('');setNotice('');setSaveState('');setPresenceReason('')
    presenceAttemptLedger.current.reset()
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
    if(showPeers)setPeerSelectedDate(date)
    setExceptionSlot(null)
    setExceptionKind(kind)
    setExceptionWindows(windows.length?windows:[suggestNextWindow([])])
    setNote(exception?.note||'')
    setPresenceReason('')
    setError('');setNotice('');setSaveState('')
  }
  // The manager can arrive from a particular day/person in the group calendar.
  // Reuse the EXISTING canonical exception editor rather than duplicating writes.
  useEffect(()=>{
    if(!initialDate)return
    setMonthAnchor(initialDate)
    chooseMonthDay(initialDate)
  },[initialDate,workerId])
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
  const submitPresenceRequest=async action=>{
    if(busy||!workerId||!selectedDate||selectedDate<today())return
    const payload=canonicalPresencePayload({
      workerId,date:selectedDate,action,
      kind:action==='inherit_weekly'?null:exceptionKind,
      intervals:action==='inherit_weekly'?[]:exceptionValidation.intervals,
      note:action==='inherit_weekly'?null:note,reason:presenceReason,
    })
    setBusy(true);setError('');setNotice('');setSaveState('')
    let requestId
    try{
      requestId=presenceAttemptLedger.current.get(payload)
      const reply=await requestPresenceChange({requestId,...payload})
      const receipt=interpretPresenceReceipt(reply)
      if(receipt.id!==requestId)
        throw new Error('شناسه رسید با درخواست ارسال‌شده یکسان نیست.')
      presenceAttemptLedger.current.acknowledge(payload)
      setSaveState(receipt.message)
      setPresenceRequestRevision(x=>x+1)
      setSelectedDate('')
      if(receipt.effective){
        try{await onSaved?.()}
        catch{setNotice('تغییر روی سرور ثبت شد، ولی تازه‌سازی تقویم ناموفق بود؛ بازخوانی کنید.')}
      }
    }catch(e){
      // A lost HTTP reply can follow a committed server request.
      // Query the authenticated scope; do NOT generate a new UUID blindly.
      try{
        if(!requestId)throw e
        const response=await listPresenceChanges(workerId)
        const rows=response.scope==='my_worker'
          ?workerPresenceItems(response,workerId):managerPresenceItems(response)
        const recorded=rows.find(item=>item.id===requestId&&item.worker_id===workerId)
        if(!recorded)throw e
        presenceAttemptLedger.current.acknowledge(payload)
        setSaveState('ثبت درخواست از سرور تأیید شد: '+(
          recorded.status==='pending'?'در انتظار تأیید مدیر':recorded.status))
        setPresenceRequestRevision(x=>x+1)
        setSelectedDate('')
        if(recorded.status==='applied'||recorded.status==='approved'){
          try{await onSaved?.()}catch{}
        }
      }catch{
        setError('نتیجه ارسال قطعی نیست؛ شناسه درخواست حفظ شده است. بدون تغییر متن می‌توانید همان درخواست را پیگیری یا دوباره ارسال کنید. '+(e.message||''))
      }
    }finally{setBusy(false)}
  }
  const submitDate=event=>{
    event.preventDefault()
    if(!workerId||!selectedDate||selectedDate<today()||!exceptionValidation.ok||busy)return
    if(exceptionKind==='replacement_intervals'&&!exceptionWindows.length)return
    if(presenceApprovalUIEnabled){void submitPresenceRequest('set_exception');return}
    void save(()=>setDateException(workerId,selectedDate,exceptionKind,
      exceptionValidation.intervals,note),'exception')
  }
  const restoreWeekly=()=>{
    if(!presenceApprovalUIEnabled||!existingDayException||busy||selectedDate<today())return
    if(!window.confirm('این استثنا حذف و برنامه ثابت هفتگی مبنا شود؟ در بازه نزدیک، ابتدا تأیید مدیر لازم است.'))return
    void submitPresenceRequest('inherit_weekly')
  }
  const setMonth=direction=>{
    setMonthAnchor(previous=>direction==='previous'
      ?previousPersianMonth(previous):nextPersianMonth(previous))
    setSelectedDate('');setPeerSelectedDate('');setError('');setSaveState('')
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
  return <div className={'ow-presence-hub'+(showPeers?' is-peer-overlay-visible':'')}>
    <section className="ow-presence-week" data-swtb-guide="availability-week" aria-label="برنامه ثابت هفتگی">
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
      {showPeers&&<div className="ow-unified-peer-status" aria-live="polite">
        {peerSnapshot.status==='loading'||peerSnapshot.status==='idle'
          ?<span>در حال دریافت امن برنامه همکاران…</span>:null}
        {peerSnapshot.status==='error'&&<span role="alert">
          برنامه همکاران در دسترس نیست؛ اطلاعات قبلی پنهان شدند.
          <button type="button" className="ow-mini-btn"
            onClick={peerSnapshot.retry}>تلاش مجدد</button>
        </span>}
        {peerReady&&<WorkerInfoHint label="معنای زمان‌های همکاران" text="نوارها بازه‌های برنامه‌ریزی‌شده هستند، نه حضور قطعی یا ساعات تأییدشده؛ خطوط عمودی با محور ساعت مشترک بالا منطبق‌اند."/>}
      </div>}
      {peerReady&&<div className="ow-unified-peer-ruler" aria-label="محور مشترک ساعت برای تمام روزهای این هفته">
        <span>محور ساعت</span>
        <div className="ow-unified-peer-ruler-track">
          {clockScale.ticks.map(minute=><span key={minute}
            className="ow-unified-peer-tick"
            style={{right:percentForMinute(minute)+'%'}}>
            {minutesToClock(minute)}</span>)}
        </div>
      </div>}
      <div className="ow-week-grid">
        {dayLabels.map(([id,name])=>{
          const date=firstMatchingWeekday(effective,id)
          const slots=selectedWeeklyWindows(calendarData.weekly_slots||[],workerId,id,date)
          const peerDay=peerDaysByDate.get(date)
          const packed=peerDay?packPeerDayIntervals(peerDay):null
          return <div className="ow-week-row-shell" key={id}>
            <div className="ow-week-row">
              <span className="ow-week-day">
                {showPeers?<button type="button" className="ow-unified-peer-day-link"
                  onClick={()=>showPeerDay(date)}
                  aria-label={'نمایش جزئیات برنامه همکاران در '+name}>
                  {name}</button>:<strong>{name}</strong>}
              </span>
              {[0,1,2,3].map(index=>{
                const slot=slots[index]
                const isEditing=editingDay===id&&editingSlot===index
                return <div key={index} className={'ow-week-cell'+(isEditing?' is-editing':'')}>
                  <button type="button"
                    aria-label={`ویرایش برنامه ${name} نوبت ${index+1}`}
                    aria-pressed={isEditing}
                    className={'ow-week-slot'+(slot?'':' is-empty')}
                    title={slot?'ویرایش نوبت':'افزودن نوبت'}
                    disabled={busy||index>slots.length} onClick={()=>openSlot(id,index)}>
                    {slot?<span dir="ltr">{slot.start}–{slot.end}</span>:
                      <span aria-hidden="true">＋</span>}
                  </button>
                </div>
              })}
            </div>
            {editingDay===id&&editingSlot!==null&&
              <form className="ow-slot-editor" onSubmit={submitWeek}
                aria-label={`ثبت نوبت ${editingSlot+1} ${name}`}>
                <div className="ow-slot-editor__heading">
                  <strong>نوبت {n(editingSlot+1)} · {name}</strong>
                  <small>ساعت و دقیقه را انتخاب کنید (قالب ۲۴ساعته)</small>
                </div>
                <WeeklyClockSelect label="شروع" disabled={busy}
                  value={draftWindows[editingSlot]?.start||''}
                  onChange={value=>editWindow(setDraftWindows,editingSlot,'start',value)}/>
                <WeeklyClockSelect label="پایان" allowDayEnd disabled={busy}
                  value={draftWindows[editingSlot]?.end||''}
                  onChange={value=>editWindow(setDraftWindows,editingSlot,'end',value)}/>
                <div className="ow-slot-actions">
                  <button type="submit" aria-label="ذخیره همین روز"
                    disabled={busy||!weeklyValidation.ok}>✓ ذخیره</button>
                  {slots[editingSlot]&&<button type="button" aria-label="حذف نوبت"
                    onClick={deleteSlot} disabled={busy}>حذف نوبت</button>}
                  <button type="button" aria-label="انصراف" disabled={busy}
                    onClick={()=>{setEditingDay(null);setEditingSlot(null)}}>انصراف</button>
                </div>
                {!weeklyValidation.ok&&<small role="alert">{weeklyValidation.error}</small>}
                {weekPreview?.code==='conflict'&&<small role="status">
                  تعارض با کارهای قبلی؛ آن‌ها حذف نمی‌شوند.</small>}
              </form>}
            {peerReady&&peerDay&&<div className="ow-unified-peer-day" aria-label={'برنامه همکاران در '+name}>
              <span className="ow-unified-peer-label">همکاران</span>
              <div className="ow-unified-peer-tracks">
                {packed.lanes.map((lane,laneIndex)=><div
                  className="ow-unified-peer-lane" key={laneIndex}>
                  <div className="ow-unified-peer-guides" aria-hidden="true">
                    {clockScale.ticks.map(minute=><span key={minute}
                      className="ow-unified-peer-guide"
                      style={{right:percentForMinute(minute)+'%'}}/>)}
                  </div>
                  {lane.map((item,index)=>{
                    const width=percentForMinute(item.end)-percentForMinute(item.start)
                    return <button type="button"
                      className={'ow-unified-peer-bar ow-unified-peer-tone-'+peerToneIndex(item.workerId)+(laneIndex?' is-second':'')}
                      key={item.workerId+'-'+item.start+'-'+index}
                      style={{right:percentForMinute(item.start)+'%',width:width+'%'}}
                      title={labelPeerInterval(item)}
                      aria-label={labelPeerInterval(item)+'؛ فقط مشاهده'}
                      onClick={()=>showPeerDay(date)}>
                      {width>=15?item.name:item.name.slice(0,1)}
                    </button>
                  })}
                </div>)}
                {packed.hiddenIntervalCount>0&&<button type="button"
                  className="ow-unified-peer-overflow"
                  onClick={()=>showPeerDay(date)}>
                  +{n(packed.hiddenIntervalCount)} بازه دیگر · مشاهده جزئیات روز
                </button>}
                {peerDay.unavailableCount>0&&<small className="ow-unified-peer-hint">
                  {n(peerDay.unavailableCount)} نفر عدم حضور ثبت‌شده
                </small>}
                {peerDay.taskWithoutPlanCount>0&&<small className="ow-unified-peer-hint">
                  {n(peerDay.taskWithoutPlanCount)} نفر دارای کار بدون بازه حضور
                </small>}
                {packed.totalLanes===0&&peerDay.unavailableCount===0
                 &&peerDay.taskWithoutPlanCount===0&&<small className="ow-unified-peer-hint">
                  برنامه‌ای ثبت نشده؛ وضعیت همکاران نامشخص است.
                 </small>}
              </div>
            </div>}
          </div>
        })}
      </div>
      <small className="ow-muted">هر روز مستقل ذخیره می‌شود. خانه خالی یعنی برنامه نامشخص، نه غیبت قطعی.</small>
    </section>
    <section className="ow-presence-month" data-swtb-guide="availability-month" aria-label="تقویم حضور و استثناهای روزانه">
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
            {peerReady&&(peerMonthCounts.get(day.date)||0)>0&&<small
              className="ow-unified-peer-month-count">
              {n(peerMonthCounts.get(day.date))} همکار دارای برنامه
            </small>}
            {tasks.slice(0,2).map(t=><small className="ow-day-task" key={t.id} title={t.title}>{t.title}</small>)}
            {tasks.length>2&&<small className="ow-task-count">+{n(tasks.length-2)} کار</small>}
          </button>
        })}
      </div>
      {peerReady&&peerDetail&&<aside className="ow-unified-peer-detail"
        aria-label={'جزئیات همکاران در '+pretty(peerSelectedDate)}>
        <div className="ow-presence-section-title">
          <strong>برنامه همکاران · {pretty(peerSelectedDate)}</strong>
          <button type="button" className="ow-mini-btn"
            onClick={()=>setPeerSelectedDate('')}>بستن جزئیات</button>
        </div>
        <p className="ow-muted">زمان‌های پیش‌بینی‌شده، صرفاً جهت هماهنگی؛ امکان ویرایش ندارند.</p>
        <div className="ow-unified-peer-detail-list">
          {peerDetail.peers.filter(p=>p.windows.length||p.kind==='unavailable'||p.assignedCount>0)
            .map(person=><div key={person.workerId} className="ow-unified-peer-detail-row">
              <strong>{person.name}</strong>
              <span>{person.windows.length
                ?person.windows.map(w=>w.start+'–'+w.end).join('، ')
                :person.kind==='unavailable'?'عدم حضور ثبت‌شده':'زمان حضور نامشخص'}
              </span>
              {person.assignedCount>0&&<small>{n(person.assignedCount)} فعالیت ثبت‌شده</small>}
            </div>)}
          {!peerDetail.peers.some(p=>p.windows.length||p.kind==='unavailable'||p.assignedCount>0)
            &&<p className="ow-muted">برای این تاریخ، برنامه‌ای ثبت نشده است؛ این به معنای غیبت نیست.</p>}
        </div>
      </aside>}
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
        <label className="report-field"><span>توضیح برنامه (اختیاری)</span>
          <input maxLength={300} value={note} onChange={e=>setNote(e.target.value)}/>
        </label>
        {presenceApprovalUIEnabled&&<label className="report-field">
          <span>دلیل تغییر (در بازه نزدیک به تاریخ حضور، الزامی)</span>
          <input maxLength={300} value={presenceReason}
             onChange={e=>setPresenceReason(e.target.value)}
             placeholder="دلیل تغییر یا عدم حضور"/>
          <small className="ow-muted">در بازه ۴۸ ساعت مانده به شروع روز تا پایان همان روز، درخواست در انتظار تأیید مدیر باقی می‌ماند.</small>
        </label>
        {!exceptionValidation.ok&&<p role="alert" className="ow-warning">{exceptionValidation.error}</p>}
        {exceptionPreview?.code==='conflict'&&<p role="status" className="ow-warning">
          ظرفیت این روز با {minutes(exceptionPreview.allocatedMinutes)} کار موجود تداخل دارد.
          تغییر زمان کارها را خودکار لغو نمی‌کند.
        </p>}
        <button className="report-btn report-btn--primary" type="submit"
          disabled={busy||selectedDate<today()||!exceptionValidation.ok
            ||(exceptionKind==='replacement_intervals'&&!exceptionWindows.length)}>
          {presenceApprovalUIEnabled?'ثبت تغییر / ارسال برای تأیید':'ذخیره استثنای این تاریخ'}
        </button>
        {presenceApprovalUIEnabled&&existingDayException&&
          <button type="button" className="report-btn report-btn--light"
            disabled={busy||selectedDate<today()} onClick={restoreWeekly}>
            حذف استثنا و بازگشت به برنامه هفتگی
          </button>}
          </>}
      </form>}
      </dialog>
      <small className="ow-muted">برای مشاهده یا ویرایش برنامهٔ یک روز، آن روز را در تقویم انتخاب کنید.</small>
    </section>
    {presenceApprovalUIEnabled&&workerId&&<WorkerPresenceRequests
      key={workerId} workerId={workerId}
      revision={presenceRequestRevision+peerRefreshRevision}
      onEffectiveChange={onSaved}/>}
    <div className="ow-presence-feedback">
      <Message error={error} notice={notice}/>
      {saveState&&<p role="status" className="ow-muted">{saveState}</p>}
    </div>
  </div>
}
function ApprovalCard({entry,task,worker,onDone,focused=false}) {
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
  const Detail=focused?'div':'details'
  return <article className="ow-item">
    <div className="ow-item-header">
      <strong>{task?.title||'کار مرتبط نامشخص'}</strong>
      <span className="ow-status">{committed?'تصمیم ثبت‌شده':missingTask?'نیازمند بررسی پرونده':asksExtra?'درخواست زمان اضافه':'گزارش عادی'}</span>
    </div>
    <small>{worker?.name||'—'} · واحد کار: {task?.unit?(unitLabels[task.unit]||task.unit):'نامشخص'} · {pretty(entry.work_date)} · درخواست: {minutes(requested)}
      {asksExtra&&<> · اضافه: {minutes(requested-standard)}</>}
    </small>
    {missingTask&&<p className="ow-warning" role="alert">کار مرتبط در اطلاعات فعلی موجود نیست؛ تصمیم‌گیری تا بررسی پرونده غیرفعال است.</p>}
    <Detail className="ow-approval-detail">
      {!focused&&<summary>بررسی جزئیات و ثبت تصمیم</summary>}
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
    </Detail>
  </article>
}
async function exportOpsExcelLegacy(data, filteredToOneWorker=false) {
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
      name:worker?.name||'',unit:'واحد کار نامشخص',
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

async function exportOpsExcel(scoped,filters,projection){
 // The workbook is built from the same authorized, filtered rows that the
 // on-screen manager history uses. The separate full-lifetime RPC is never
 // silently mixed into the bounded operational-history workbook.
 const ExcelJS=await import('exceljs')
 const metadata=managerHistoryExportMetadata(filters,{
  workers:scoped.workers,unitLabels,reviewLabels,dateLabel:pretty,
 })
 const wb=buildManagerHistoryWorkbook(ExcelJS,projection,metadata)
 const buffer=await wb.xlsx.writeBuffer()
 const blob=new Blob([buffer],{
  type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 })
 const url=URL.createObjectURL(blob)
 try{
  const link=document.createElement('a')
  link.href=url
  link.download=Object.values(filters).some(Boolean)
   ?'swtb-manager-history-filtered.xlsx':'swtb-manager-history-loaded.xlsx'
  document.body.append(link)
  link.click()
  link.remove()
 }finally{
  setTimeout(()=>URL.revokeObjectURL(url),1500)
 }
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
function ManagerWorkerProfile({data,selectedId,onChange,onDone,focusedReview=false}) {
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
  const reviewItems=focusedReview?managerReviewItems({
   timeEntries:timeQueue,profileChanges:changeQueue,
   workers, tasks,formatDate:pretty,
   formatUnit:unit=>unitLabels[unit]||'واحد نامشخص',
  }):[]
  return <section className={'report-panel ow-profile-section'+(focusedReview?' swtb22-profile-focus':'')}>
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
      {(changeQueue.length>0||timeQueue.length>0)&&
       (focusedReview?<div className="swtb22-profile-review">
        <h4>درخواست‌های منتظر رسیدگی · {n(reviewItems.length)}</h4>
        <FocusedReviewQueue items={reviewItems} label="رسیدگی به درخواست‌های این دانشجوکار"
         renderReview={item=>item.kind==='profile'
          ?<ProfileChangeReview key={item.key} request={item.request} worker={selected}
            onDone={onDone}/>
          :<ApprovalCard key={item.key} entry={item.entry} worker={selected}
            task={item.task} onDone={onDone} focused/>}/>
       </div>:<details open className="ow-profile-fold">
        <summary>نیازمند رسیدگی · {n(changeQueue.length+timeQueue.length)}</summary>
        <div className="ow-profile-action-list">
          {changeQueue.map(r=><ProfileChangeReview key={r.id} request={r}
            worker={selected} onDone={onDone}/>)}
          {timeQueue.map(e=><ApprovalCard key={e.id} entry={e}
            worker={selected} task={taskById.get(e.task_id)} onDone={onDone}/>)}
        </div>
      </details>)}
      <details className="ow-profile-fold"><summary>وضعیت حساب و مدیریت دسترسی</summary>
        <WorkerLifecycleManager key={selected.id} worker={selected} onDone={onDone}
         onChangeState={setWorkerState} onReadHistory={getWorkerStateHistory}/>
      </details>
    </>}
      </div>
    </div>
  </section>
}
export function AdminOperations({ navigation, setNavigation, refreshRevision = 0,
  hideSectionTabs = false }) {
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
  const taskUnit=navigation.taskUnit||''
  const taskState=navigation.taskState||''
  const taskSearch=navigation.taskSearch||''
  const taskOrder=navigation.taskOrder||'latest'
  const approvalWorkerId=navigation.approvalWorkerId||''
  const approvalUnit=navigation.approvalUnit||''
  const approvalKind=navigation.approvalKind||''
  const setListingFilter=(name,value)=>setNavigation(previous=>({...previous,[name]:value}))
  const historyFiltersActive=Boolean(historyWorkerId||historyUnit||historyFrom||historyTo||historyReview)
  const invalidHistoryRange=Boolean(historyFrom&&historyTo&&historyFrom>historyTo)
  const setHistoryFilter=(name,value)=>setNavigation(previous=>({...previous,[name]:value}))
  const setView=value=>setNavigation(previous=>({...previous,workView:value}))
  const setWorkerId=value=>setNavigation(previous=>({...previous,workerId:value}))
  const focusedHistory=hideSectionTabs&&focusHistoryUIEnabled
  const focusedPresence=hideSectionTabs&&focusPresenceUIEnabled
  const [presenceEditingDate,setPresenceEditingDate]=useState('')
  const [presenceSelectedDate,setPresenceSelectedDate]=useState(today())
  const openPersonPresence=(id,date)=>{
    if(date)setPresenceSelectedDate(date)
    setPresenceEditingDate(date||'')
    setWorkerId(id)
  }
  const backToTeamPresence=()=>{setPresenceEditingDate('');setWorkerId('')}
  const setHistoryWorkerId=value=>setNavigation(previous=>({...previous,historyWorkerId:value}))
  const [title,setTitle]=useState('')
  const [instructions,setInstructions]=useState('')
  const [date,setDate]=useState(today())
  const [estimate,setEstimate]=useState('60')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [assignmentDialogDate,setAssignmentDialogDate]=useState('')
  const focusedTasks=hideSectionTabs&&focusTaskUIEnabled
  const [taskEditorOpen,setTaskEditorOpen]=useState(false)
  const [taskEditorRevision,setTaskEditorRevision]=useState(0)
  const taskEditorDialogRef=useRef(null)
  const taskEditorOpenerRef=useRef(null)
  const closeTaskEditor=(reset=false)=>{
    const dialog=taskEditorDialogRef.current
    if(dialog?.open){
      if(typeof dialog.close==='function')dialog.close()
      else dialog.removeAttribute('open')
    }
    setTaskEditorOpen(false)
    if(reset)setTaskEditorRevision(v=>v+1)
    taskEditorOpenerRef.current?.focus?.({preventScroll:true})
  }
  useEffect(()=>{
    if(view!=='tasks'&&taskEditorOpen)setTaskEditorOpen(false)
  },[view,taskEditorOpen])
  useEffect(()=>{
    const dialog=taskEditorDialogRef.current
    if(!focusedTasks||view!=='tasks'||!dialog||!taskEditorOpen)return
    if(!dialog.open){
      if(typeof dialog.showModal==='function')dialog.showModal()
      else dialog.setAttribute('open','')
    }
    dialog.querySelector('[data-swtb22-task-editor-heading]')?.focus?.({preventScroll:true})
  },[view,focusedTasks,taskEditorOpen])
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
  const [historyUnreportedShown,setHistoryUnreportedShown]=useState(50)
  const [historyLifetimeOpen,setHistoryLifetimeOpen]=useState(false)
  const [historyAdvancedOpen,setHistoryAdvancedOpen]=useState(
    Boolean(historyUnit||historyReview||historyFrom||historyTo))
  const [historyUnreportedOpen,setHistoryUnreportedOpen]=useState(
    historyReview==='without_report')
  const [historyExporting,setHistoryExporting]=useState(false)
  const [historyExportError,setHistoryExportError]=useState('')
  const [tasksShown,setTasksShown]=useState(100)
  const [approvalsShown,setApprovalsShown]=useState(25)
  useEffect(()=>setTasksShown(100),[taskWorkerId,taskUnit,taskState,taskSearch,taskOrder])
  useEffect(()=>setApprovalsShown(25),[approvalWorkerId,approvalUnit,approvalKind])
  useEffect(()=>{setHistoryShown(100);setHistoryUnreportedShown(50)},[historyWorkerId,historyUnit,historyFrom,historyTo,historyReview])
  useEffect(()=>{
    if(historyUnit||historyReview||historyFrom||historyTo)setHistoryAdvancedOpen(true)
    if(historyReview==='without_report')setHistoryUnreportedOpen(true)
  },[historyUnit,historyReview,historyFrom,historyTo])

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
      // Drop any stale privileged draft after authorization/read rejection.
      setTaskEditorOpen(false)
      setTaskEditorRevision(v=>v+1)
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
  const scopedHistoryProjection=focusedHistory?managerHistoryProjection(historyData,{
    unitLabels,reviewLabels,extraTimeReasons,dateLabel:pretty,
  }):null
  const scopedHistoryFilters={
    workerId:historyWorkerId||'',unit:historyUnit||'',
    review:historyReview||'',from:historyFrom||'',to:historyTo||'',
  }
  const runHistoryExport=async()=>{
    if(historyExporting||loading||readFailed||invalidHistoryRange)return
    const hasRecords=(historyData.tasks.length+historyData.time_entries.length)>0
    if(!hasRecords)return
    setHistoryExporting(true);setHistoryExportError('')
    try{
      if(focusedHistory)await exportOpsExcel(historyData,scopedHistoryFilters,scopedHistoryProjection)
      else await exportOpsExcelLegacy(historyData,historyFiltersActive)
    }catch{
      setHistoryExportError('ساخت یا دریافت فایل Excel کامل نشد. هیچ داده یا تصمیمی تغییر نکرد؛ دوباره اقدام کنید.')
    }finally{setHistoryExporting(false)}
  }
  const reportTaskIds=new Set(historyData.time_entries.map(entry=>entry.task_id))
  const historyWithoutReport=historyData.tasks.filter(task=>!reportTaskIds.has(task.id))
  const HistoryFilterWrap=focusedHistory?'details':'div'
  const HistoryUnreportedWrap=focusedHistory?'details':'div'
  const allTasks=data.tasks||[]
  const taskCounts=summarizeTaskWorkflow(allTasks)
  const matchingTasks=selectManagerTasks(data,{
    workerId:taskWorkerId,unit:taskUnit,state:taskState,search:taskSearch,order:taskOrder,
  })
  const visibleApprovals=selectPendingApprovals(data,{
    workerId:approvalWorkerId,unit:approvalUnit,kind:approvalKind,
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
  const focusedReview=hideSectionTabs&&focusDecisionsUIEnabled
  const inboxReviewItems=focusedReview?managerReviewItems({
    timeEntries:pending,profileChanges:pendingProfileChanges,
    workers,tasks:allTasks,formatDate:pretty,
    formatUnit:unit=>unitLabels[unit]||'واحد نامشخص',
  }):[]
  const approvalReviewItems=focusedReview?managerReviewItems({
    timeEntries:visibleApprovals,workers,tasks:allTasks,formatDate:pretty,
    formatUnit:unit=>unitLabels[unit]||'واحد نامشخص',mode:'time',
  }):[]
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
    {(!hideSectionTabs||view==='inbox')&&<div className="ow-summary ow-summary--actionable">
      <article><button type="button" className="ow-manager-kpi-action"
        onClick={()=>setView('profiles')} aria-label="نمایش پرونده‌های دانشجوکارها">
        <span>دانشجوکار فعال</span><b>{n(active.length)}</b>
        <small>مشاهده پرونده‌ها</small>
      </button></article>
      <article><button type="button" className="ow-manager-kpi-action"
        onClick={()=>setView('tasks')} aria-label="رفتن به فهرست و واگذاری کارها">
        <span>کار برنامه‌ریزی‌شده امروز</span><b>{n(todayTasks.length)}</b>
        <small>مدیریت کارها</small>
      </button></article>
      <article><button type="button" className="ow-manager-kpi-action"
        onClick={()=>setView('approvals')} aria-label="رفتن به صف بررسی گزارش‌های ساعات">
        <span>گزارش منتظر تأیید</span><b>{n(pending.length)}</b>
        <small>رسیدگی به گزارش‌ها</small>
      </button></article>
      <article><span>مجموع ساعات تأییدشده · همه دوره‌ها</span>
        <b>{exactDuration(approvedMinutes)}</b></article>
    </div>}
    {!hideSectionTabs&&<SectionTabs value={view} onChange={setView} options={[
      ['inbox','کارتابل'],['tasks','واگذاری کار'],['approvals','تأیید ساعات'],['availability','برنامه حضور'],['history','سابقه و خروجی'],['profiles','پروفایل‌ها'],['terms','نیمسال و سهمیه'],
      ...(termMembershipUIEnabled?[['termMemberships','مجوز همکاری']]:[]),
      ...(workPoolUIEnabled?[['workPool','مخزن وظایف']]:[]),
    ]}/>}
    {loading&&<p className="ow-muted">در حال دریافت اطلاعات…</p>}
    <Message error={error} notice={notice}/>

    {view==='terms'&&<TermBudgetPanel workers={workers} refreshRevision={refreshRevision}
      focusedUI={hideSectionTabs&&focusTermBudgetUIEnabled}/>}
    {workPoolUIEnabled&&view==='workPool'&&<Suspense fallback={<p className="ow-muted">در حال آماده‌سازی مخزن وظایف…</p>}>
      <WorkPoolManagerPanel refreshRevision={refreshRevision}
       activeKind={navigation.workPoolKind||'general'}
       onKindChange={kind=>setNavigation(previous=>({...previous,workPoolKind:kind}))}/>
    </Suspense>}
    {termMembershipUIEnabled&&view==='termMemberships'&&<Suspense fallback={<p className="ow-muted">در حال آماده‌سازی مجوزهای نیمسال…</p>}>
      <TermMembershipPanel workers={workers} refreshRevision={refreshRevision}
       focusedReview={focusedReview}/>
    </Suspense>}
    {view==='inbox'&&presenceApprovalUIEnabled&&<ManagerPresenceReviewQueue
      workers={workers} tasks={data.tasks||[]} revision={refreshRevision}
      onEffectiveChange={refresh}/>}
    {view==='inbox'&&<section className="report-panel">
      <div className="ow-presence-section-title ow-manager-inbox-heading">
        <h2>کارتابل رسیدگی</h2>
        <small>{n(pending.length)} گزارش · {n(pendingProfileChanges.length)} درخواست اصلاح</small>
        <button type="button" className="report-btn report-btn--light"
          onClick={()=>{setView('tasks');if(focusedTasks&&!loading&&active.length>0)setTaskEditorOpen(true)}}>+ واگذاری کار جدید</button>
      </div>
      {pending.length===0&&pendingProfileChanges.length===0&&
        <p className="ow-muted">درخواستی برای رسیدگی وجود ندارد.</p>}
      {focusedReview?<FocusedReviewQueue items={inboxReviewItems}
       label="کارتابل تصمیم‌ها و گزارش‌های منتظر"
       renderReview={item=>item.kind==='profile'
        ?<ProfileChangeReview key={item.key} request={item.request}
          worker={item.worker} onDone={refresh}/>
        :<ApprovalCard key={item.key} entry={item.entry} task={item.task}
          worker={item.worker} focused onDone={refresh}/>}/>
       :<div className="ow-inbox-items">
        {pendingProfileChanges.map(r=><ProfileChangeReview key={r.id} request={r}
          worker={workers.find(w=>w.id===r.worker_id)} onDone={refresh}/>)}
        {pending.map(e=><ApprovalCard key={e.id} entry={e}
          task={taskById.get(e.task_id)} worker={workers.find(w=>w.id===e.worker_id)}
          onDone={refresh}/>)}
      </div>}
    </section>}
    {view==='tasks'&&<>
      {!focusedTasks&&<section className="report-panel">
        <h2>واگذاری کار</h2>
        <TaskAssignmentEditor workers={active} data={data}
          defaultWorkerId={workerId} defaultDate={date} onSaved={refresh}/>
      </section>}
      <section className={'report-panel'+(focusedTasks?' swtb22-task-directory':'')}>
        <div className="report-panel-heading swtb22-task-heading">
          <div><h2>کارهای ثبت‌شده</h2>
           {focusedTasks&&<p>مرور و پیگیری کارها در این صفحه؛ واگذاری مستقیم فقط هنگام درخواست شما باز می‌شود.</p>}
          </div>
          <div className="swtb22-task-heading-actions">
           <small>{n(matchingTasks.length)} از {n(taskCounts.total)} کار</small>
           {focusedTasks&&<button type="button" ref={taskEditorOpenerRef}
             className="report-btn report-btn--primary"
             disabled={loading||active.length===0} aria-haspopup="dialog"
             aria-controls="swtb22-task-assign-dialog"
             onClick={()=>setTaskEditorOpen(true)}>+ واگذاری کار جدید</button>}
          </div>
        </div>
        {focusedTasks&&active.length===0&&<p className="ow-muted" role="status">برای واگذاری مستقیم، ابتدا باید دست‌کم یک دانشجوکار فعال وجود داشته باشد.</p>}
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
          <label className="report-field"><span>واحد انجام کار</span>
            <select aria-label="فیلتر کارها بر اساس واحد فعالیت" value={taskUnit}
              onChange={e=>setListingFilter('taskUnit',e.target.value)}>
              <option value="">همه واحدها</option>
              {Object.entries(unitLabels).map(([id,name])=><option key={id} value={id}>{name}</option>)}
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
              <small>{label(t.worker_id,workers)} · واحد کار: {unitLabels[t.unit]||t.unit||'نامشخص'} · {pretty(t.planned_date)} · زمان استاندارد: {minutes(t.estimate_minutes)}</small>
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
      {focusedTasks&&<dialog id="swtb22-task-assign-dialog"
       ref={taskEditorDialogRef} className="ow-assignment-dialog swtb22-task-editor-dialog"
       aria-labelledby="swtb22-task-editor-heading"
       onCancel={event=>{event.preventDefault();closeTaskEditor()}}
       onClose={()=>{setTaskEditorOpen(false);taskEditorOpenerRef.current?.focus?.({preventScroll:true})}}>
       <div className="swtb22-task-editor-dialog-head">
        <div><h2 id="swtb22-task-editor-heading" tabIndex={-1}
         data-swtb22-task-editor-heading>واگذاری مستقیم کار جدید</h2>
         <p>این فرم برای واگذاری به دانشجوکاران مشخص است؛ فرصت‌های انتخاب آزاد در «مخزن فرصت‌های کاری» منتشر می‌شوند.</p>
        </div>
        <button type="button" className="report-btn report-btn--light"
         onClick={()=>closeTaskEditor()}>بستن و حفظ پیش‌نویس</button>
       </div>
       <TaskAssignmentEditor key={taskEditorRevision}
        workers={active} data={data} defaultWorkerId={workerId} defaultDate={date}
        onSaved={refresh} onCancel={()=>closeTaskEditor()}
        onClose={()=>closeTaskEditor(true)}/>
      </dialog>}
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
        <label className="report-field"><span>واحد انجام کار</span>
          <select aria-label="فیلتر تأیید ساعات بر اساس واحد" value={approvalUnit}
            onChange={e=>setListingFilter('approvalUnit',e.target.value)}>
            <option value="">همه واحدها</option>
            {Object.entries(unitLabels).map(([id,name])=><option key={id} value={id}>{name}</option>)}
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
      {focusedReview?<FocusedReviewQueue items={approvalReviewItems.slice(0,approvalsShown)}
        label="صف بررسی گزارش‌های ساعت"
        emptyText={pending.length?'گزارشی مطابق فیلتر انتخاب‌شده وجود ندارد.':'گزارشی منتظر بررسی نیست.'}
        renderReview={item=><ApprovalCard key={item.key} entry={item.entry}
         task={item.task} worker={item.worker} onDone={refresh} focused/>}/>
       :<div className="ow-list ow-approval-results">
        {visibleApprovals.slice(0,approvalsShown).map(e=><ApprovalCard key={e.id} entry={e}
          task={taskById.get(e.task_id)}
          worker={workers.find(w=>w.id===e.worker_id)} onDone={refresh}/>)}
        {!visibleApprovals.length&&<p className="ow-muted">
          {pending.length?'گزارشی با فیلتر انتخاب‌شده در صف وجود ندارد.':'گزارشی در صف بررسی وجود ندارد.'}
        </p>}
      </div>}
      {visibleApprovals.length>approvalsShown&&<div className="ow-paged-more">
        <span className="ow-muted">نمایش {n(approvalsShown)} گزارش از {n(visibleApprovals.length)}</span>
        <button type="button" className="report-btn report-btn--light"
          onClick={()=>setApprovalsShown(count=>count+25)}>نمایش ۲۵ گزارش بیشتر</button>
      </div>}
    </section>}

    {view==='availability'&&<section className={'report-panel'+(focusedPresence?' swtb22-presence-workspace':'')}>
      <div className="swtb22-presence-heading">
       <div><h2>ظرفیت و برنامه دانشجوکارها</h2>
        {focusedPresence&&<p>برنامه‌ریزی حضور، کار واگذارشده و ساعات تأییدشده مفاهیم متفاوتی هستند؛
         این نما فقط وضعیت برنامه و کار ثبت‌شده را نشان می‌دهد.</p>}
       </div>
       {focusedPresence&&workerId&&<button type="button" className="report-btn report-btn--light"
          onClick={backToTeamPresence}>بازگشت به برنامه همه دانشجوکارها</button>}
      </div>
      <label className="report-field ow-worker-selector"><span>دانشجوکار</span>
        <select value={workerId} onChange={e=>{
          setPresenceEditingDate('')
          setWorkerId(e.target.value)
        }} aria-label="انتخاب دانشجوکار برای برنامه حضور">
          <option value="">همه دانشجوکارها · هفتگی و ماهانه</option>
          {active.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      {workerId?<ScheduleEditor key={focusedPresence?workerId+':'+presenceEditingDate:workerId}
        workerId={workerId} data={data} initialDate={focusedPresence?presenceEditingDate:''}
        onSaved={refresh} onPlanAssignment={setAssignmentDialogDate}/>:<TeamScheduleOverview
           data={data} todayIso={today()} onPlanAssignment={setAssignmentDialogDate}
           inlineManager={focusedPresence}
           selectedDay={focusedPresence?presenceSelectedDate:''}
           onSelectedDayChange={focusedPresence?setPresenceSelectedDate:null}
           onEditWorker={focusedPresence?openPersonPresence:null}/>}

    </section>}

    {view==='profiles'&&<ManagerWorkerProfile data={data} selectedId={profileWorkerId}
      onChange={setProfileWorkerId} onDone={refresh} focusedReview={focusedReview}/>} 
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
    {view==='history'&&<section className={'report-panel'+(focusedHistory?' swtb22-history-focused':'')}>
      {!focusedHistory&&<UnitHourSummary scope="admin" refreshRevision={refreshRevision}/>}
      <div className="report-panel-heading swtb22-history-heading">
        <div>
         <h2>{focusedHistory?'سوابق و گزارش‌های مدیریتی':'سابقه ساعات و خروجی'}</h2>
         {focusedHistory&&<p className="ow-muted">
          مرور و خروجی فقط براساس سوابق مجازِ بارگذاری‌شده در همین صفحه انجام می‌شود.
          آمار قطعی همه دوره‌ها و سهمیه نیمسال، منابع مستقل سرور هستند و با این فیلترها یکی نیستند.
         </p>}
        </div>
        <button className="report-btn report-btn--primary" type="button"
          disabled={loading||historyExporting||invalidHistoryRange||(!historyData.tasks.length&&!historyData.time_entries.length)}
          aria-busy={historyExporting}
          onClick={()=>{void runHistoryExport()}}>
          {historyExporting?'در حال تهیه فایل Excel…':
           historyFiltersActive?'خروجی Excel همین نتایج':'خروجی Excel سوابق بارگذاری‌شده'}
        </button>
      </div>
      {historyExportError&&<p className="report-alert report-alert--error" role="alert">{historyExportError}</p>}
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
      <HistoryFilterWrap {...(focusedHistory?{
        className:'swtb22-history-filter-disclosure',
        open:historyAdvancedOpen,
        onToggle:event=>setHistoryAdvancedOpen(event.currentTarget.open),
      }:{})}>
       {focusedHistory&&<summary>
        فیلترهای تکمیلی
        {(historyUnit||historyReview||historyFrom||historyTo)&&' · فعال'}
       </summary>}
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
      </HistoryFilterWrap>
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
      {focusedHistory?<div className="swtb22-history-results">
       <div className="swtb22-history-scope-metrics" aria-label="خلاصه نتایج فیلترشده و بارگذاری‌شده">
        <div><span>گزارش موجود</span><strong>{n(scopedHistoryProjection.summary.reportCount)}</strong></div>
        <div><span>گزارش تأییدشده</span><strong>{n(scopedHistoryProjection.summary.approvedReportCount)}</strong></div>
        <div><span>کار بدون گزارش</span><strong>{n(scopedHistoryProjection.summary.unreportedTaskCount)}</strong></div>
        <div><span>زمان تأییدشده در همین نتایج</span><strong>{
          scopedHistoryProjection.summary.invalidMinutesCount
           ?'نیازمند بررسی'
           :exactDuration(scopedHistoryProjection.summary.approvedMinutes)
        }</strong></div>
       </div>
       <p className="ow-muted swtb22-history-scope-note">
        این جمع صرفاً مربوط به نتایج فیلترشده و بارگذاری‌شده است؛
        برای مجموع قطعی همه دوره‌ها از بخش مستقل «آمار تمام‌دوره سرور» استفاده کنید.
       </p>
       {scopedHistoryProjection.summary.orphanReportCount>0&&<p className="ow-warning" role="status">
        {n(scopedHistoryProjection.summary.orphanReportCount)} گزارش با وظیفه مرتبط نامشخص در این نتایج وجود دارد.
       </p>}
       {scopedHistoryProjection.summary.invalidMinutesCount>0&&<p className="ow-warning" role="alert">
        {n(scopedHistoryProjection.summary.invalidMinutesCount)} گزارش، داده زمانی نیازمند بررسی دارد؛
        جمع زمان تأییدشده تا رفع مغایرت قابل اتکا نیست.
       </p>}
       <ManagerHistoryExplorer rows={scopedHistoryProjection.reportRows}
        limit={historyShown}
        emptyText={historyWithoutReport.length
         ?'در این بازه گزارشی نیست؛ کارهای بدون گزارش را در بخش پایین ببینید.'
         :historyFiltersActive?'هیچ گزارشی با فیلترهای فعلی موجود نیست.':'هنوز گزارشی در فهرست بارگذاری‌شده وجود ندارد.'}/>
       {scopedHistoryProjection.reportRows.length>historyShown&&<div className="ow-history-load-more">
        <span className="ow-muted">نمایش {n(Math.min(historyShown,scopedHistoryProjection.reportRows.length))}
         {' '}از {n(scopedHistoryProjection.reportRows.length)} گزارش بارگذاری‌شده و فیلترشده؛
         خروجی Excel همه این نتایج را در بر می‌گیرد.</span>
        <button type="button" className="report-btn report-btn--light"
         onClick={()=>setHistoryShown(count=>count+100)}>نمایش ۱۰۰ گزارش بیشتر</button>
       </div>}
      </div>:<>
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
      </>}
      {historyWithoutReport.length>0&&<HistoryUnreportedWrap
        className={'ow-history-unreported'+(focusedHistory?' swtb22-history-unreported':'')}
        {...(focusedHistory?{
          open:historyUnreportedOpen,
          onToggle:event=>setHistoryUnreportedOpen(event.currentTarget.open),
        }:{})}>
        {focusedHistory?<summary>
          کارهای بدون گزارش · {n(historyWithoutReport.length)} مورد
        </summary>:<div className="report-panel-heading">
          <h3>کارهای بدون گزارش</h3><small>{n(historyWithoutReport.length)} کار</small>
        </div>}
        <div className="ow-list">
          {(focusedHistory?historyWithoutReport.slice(0,historyUnreportedShown):historyWithoutReport)
           .map(task=><article className="ow-item" key={task.id}>
            <div className="ow-item-header">
              <strong>{task.title}</strong>
              <span className="ow-status">{stateLabels[task.state]||task.state}</span>
            </div>
            <small>{label(task.worker_id,workers)} · {unitLabels[task.unit]||task.unit||'واحد نامشخص'}
              {' · '}برنامه: {pretty(task.planned_date)} · برآورد: {minutes(task.estimate_minutes)}</small>
          </article>)}
        </div>
        {focusedHistory&&historyWithoutReport.length>historyUnreportedShown&&
          <button type="button" className="report-btn report-btn--light"
           onClick={()=>setHistoryUnreportedShown(count=>count+50)}>
           نمایش ۵۰ کار بدون گزارش بیشتر
          </button>}
      </HistoryUnreportedWrap>}
      {focusedHistory&&<details className="swtb22-history-lifetime"
        onToggle={event=>setHistoryLifetimeOpen(event.currentTarget.open)}>
       <summary>آمار تأییدشده تمام‌دوره از سرور · مستقل از فیلترهای این صفحه</summary>
       <p className="ow-muted">این بخش از گزارش اختصاصی سرور می‌آید و
        ممکن است با جمع سوابق بارگذاری‌شده یا سهمیه نیمسال تفاوت داشته باشد.</p>
       {historyLifetimeOpen&&<UnitHourSummary scope="admin" refreshRevision={refreshRevision}/>}
      </details>}
    </section>}
  </div>
}
function WorkerTaskCard({task,onSaved,onReportAccepted,onInspect,inspected=false,actionLedger,reviewCycle}) {
  const acknowledged=actionLedger.get(task.id)
  const sameReviewCycle=acknowledged?.reviewCycle===reviewCycle
  // When tab navigation temporarily remounts an uncertain report, restore
  // the exact original payload paired with its existing idempotency key.
  const initialAttempt=sameReviewCycle?acknowledged?.submissionPayload:null
  const [reportOpen,setReportOpen]=useState(false)
  const reportDialogRef=useRef(null)
  const reportTriggerRef=useRef(null)
  const [date,setDate]=useState(initialAttempt?.date||today())
  const [requestExtra,setRequestExtra]=useState(Boolean(initialAttempt?.extraReasonCode))
  const [extraHelpOpen,setExtraHelpOpen]=useState(false)
  const [requested,setRequested]=useState(String(initialAttempt?.minutes??task.estimate_minutes))
  const [reasonCode,setReasonCode]=useState(initialAttempt?.extraReasonCode||'')
  const [reasonText,setReasonText]=useState(initialAttempt?.extraReasonText||'')
  const [note,setNote]=useState(initialAttempt?.note||'')
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
      // A PostgreSQL SQLSTATE is an explicit transaction rejection; the user
      // may correct inputs and create a NEW identity. Unknown HTTP/transport
      // outcomes MUST retain both the old key and its exact original payload.
      if(kind==='report'&&isDefinitiveWorkerReportRejection(e)){
        const attempted=actionLedger.get(task.id)
        if(attempted?.reviewCycle===reviewCycle&&!attempted?.report){
          actionLedger.set(task.id,{
            ...attempted,clientSubmissionId:null,submissionPayload:null,
          })
          keyRef.current=crypto.randomUUID()
        }
      }
      setError(readableError(e))
    }finally{actionLock.current=false;setBusy(false)}
  }
  return <article className={`ow-item ow-worker-task--${task.state}`}>
    <div className="ow-worker-card-main">
      <div className="ow-item-header"><strong>{task.title}</strong>
        <span className="ow-status">{stateLabels[task.state]||'وضعیت نامشخص'}</span>
      </div>
      <small>واحد فعالیت: {unitLabels[task.unit]||task.unit||'نامشخص'} · {pretty(task.planned_date)} · زمان استاندارد: {minutes(standard)}</small>
      {task.collaborators?.length>0&&<small className="ow-task-collaborators">
        با همکاری: {task.collaborators.map(x=>x.name).join('، ')}
      </small>}
    </div>
    <button type="button" className="ow-b3-inspect-trigger"
      data-task-inspect={task.id} aria-expanded={inspected}
      onClick={onInspect}>مشاهدهٔ جزئیات</button>
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
            <p className="ow-muted">{task.title} · {unitLabels[task.unit]||task.unit||'واحد کار نامشخص'} · {pretty(task.planned_date)}</p>
          </div>
          <button type="button" className="ow-worker-report-dialog__close"
            disabled={busy} aria-label="بستن پنجره ثبت کار"
            onClick={()=>setReportOpen(false)}>بستن</button>
        </div>
        {task.instructions&&<details className="ow-worker-task-instructions">
          <summary>شرح کار محول‌شده</summary><p>{task.instructions}</p>
        </details>}
      <form onSubmit={e=>{e.preventDefault();if(!extraValid||reportCommitted||busy)return;
      // Treat one idempotency key as one immutable submission payload. The
      // current server replays the original receipt for matching worker+task,
      // even when a later request contains changed fields.
      const nextPayload=canonicalWorkerReportPayload({
        taskId:task.id,date,minutes:requestedMinutes,note,
        extraReasonCode:requestExtra?reasonCode:null,
        extraReasonText:requestExtra?reasonText.trim():null,
      })
      const prior=actionLedger.get(task.id)
      const previousPayload=prior?.reviewCycle===reviewCycle
        ?prior.submissionPayload:null
      if(previousPayload&&!sameWorkerReportPayload(previousPayload,nextPayload)){
        setError(WORKER_REPORT_CHANGED_RETRY_NOTICE)
        return
      }
      const savedPayload=previousPayload||nextPayload
      actionLedger.set(task.id,{
        ...(prior?.reviewCycle===reviewCycle?prior:{}),
        reviewCycle,clientSubmissionId:keyRef.current,
        submissionPayload:savedPayload,
      })
      void perform(
        ()=>submitMyTime({...savedPayload,clientSubmissionId:keyRef.current}),
        'report')
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
      <div className="ow-extra-toggle-row">
        <label className="ow-checkbox ow-extra-toggle">
          <input type="checkbox" checked={requestExtra} onChange={e=>{
            const checked=e.target.checked
            setRequestExtra(checked)
            if(!checked){setRequested(String(standard));setReasonCode('');setReasonText('')}
          }}/>
          درخواست زمان بیشتر
        </label>
        <button type="button" className="ow-extra-help-trigger"
          aria-expanded={extraHelpOpen}
          aria-controls={`ow-extra-help-${task.id}`}
          aria-label="چه زمانی درخواست زمان بیشتر لازم است؟"
          onClick={()=>setExtraHelpOpen(open=>!open)}>
          <span aria-hidden="true">ⓘ</span> چه زمانی؟
        </button>
        <p id={`ow-extra-help-${task.id}`} className="ow-extra-help-note" hidden={!extraHelpOpen}>
          فقط وقتی زمان استاندارد برای انجام همین کار کافی نبوده است، این گزینه را انتخاب کنید؛
          مثلاً حجم واقعی کار یا مانع پیش‌بینی‌نشده باعث طولانی‌شدن آن شده باشد.
          زمان کل موردنیاز و علت را وارد کنید. زمان اضافه صرفاً پس از بررسی و تأیید مدیر منظور می‌شود؛
          حضور در محل به‌تنهایی دلیل درخواست زمان بیشتر نیست.
        </p>
      </div>
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
function WorkerReportHistory({tasks,records,approvedMinutesTotal,onNavigate,onGuide,refreshRevision=0}) {
 const [view,setView]=useState('all')
 const [unitFilter,setUnitFilter]=useState('')
 const [dateFrom,setDateFrom]=useState('')
 const [dateTo,setDateTo]=useState('')
 const [selectedReportId,setSelectedReportId]=useState(null)
 const unitByTask=new Map(tasks.map(t=>[t.id,t.unit||'']))
 const unitRecords=unitFilter?records.filter(r=>unitByTask.get(r.task_id)===unitFilter):records
 const dateResult=filterPerformanceByWorkDate(
   projectWorkerReportActivity(unitRecords,tasks),dateFrom,dateTo)
 const counts=summarizeWorkerReportActivity(dateResult.rows)
 const entries=view==='all'?dateResult.rows:
   dateResult.rows.filter(row=>row.review_state===view)
 const detail=entries.find(r=>r.id===selectedReportId)
 const options=[
  ['all','همه'],['submitted','منتظر بررسی'],
  ['changes_requested','نیازمند اصلاح'],['rejected','ردشده'],['approved','تأییدشده']
 ]
 const total=approvedMinutesTotal??null
 useLayoutEffect(()=>{
   if(detail)document.getElementById('ow-report-inspector')?.focus({preventScroll:true})
 },[detail?.id])
 useEffect(()=>{
   if(!selectedReportId)return
   const onKeyDown=event=>{
     if(event.key!=='Escape'||document.querySelector('dialog[open]'))return
     document.querySelector(`[data-report-inspect="${selectedReportId}"]`)?.focus()
     setSelectedReportId(null)
   }
   document.addEventListener('keydown',onKeyDown)
   return()=>document.removeEventListener('keydown',onKeyDown)
 },[selectedReportId])
 const approvalDisplay=entry=>entry.review_state==='approved'
   ?(entry.approved_minutes===null?'مقدار تأییدشده ثبت نشده':minutes(entry.approved_minutes))
   :entry.review_state==='rejected'?'تأیید نشد'
   :entry.review_state==='changes_requested'?'در انتظار اصلاح گزارش'
   :entry.review_state==='submitted'?'در انتظار بررسی':'تأییدشده نیست'
 return <section className="report-panel ow-worker-history-panel ow-b3-ledger"
   aria-label="سابقه گزارش‌ها و ساعات">
   <div className="ow-history-heading ow-b3-guide-heading ow-b3-guide-heading--history">
     <div className="ow-worker-title-inline"><h2>سوابق گزارش‌ها و ساعات</h2>
       <WorkerInfoHint label="درباره دفتر گزارش‌ها"
         text="هر ردیف گزارش زمان کار و نتیجه رسیدگی مدیر را نشان می‌دهد. تاریخ هر ردیف، روز انجام کار است؛ نه روز تأیید مدیر."/>
     </div>
     <button type="button" className="swtb-guide-launch" data-swtb-guide="help-history"
       onClick={()=>onGuide?.('history')}>؟ راهنمای این بخش</button>
   </div>
   <UnitHourSummary scope="worker" approvedTotal={total} refreshRevision={refreshRevision}/>
   <div className="ow-history-report-flow">
   <section className="ow-history-query" aria-label="فیلترهای گزارش‌ها"
     data-swtb-guide="history-controls">
     <div className="ow-history-query-header">
       <div className="ow-worker-title-inline"><h3>فیلتر گزارش‌ها</h3>
         <WorkerInfoHint label="درباره فیلتر گزارش‌ها"
           text="واحد، تاریخ انجام کار و وضعیت رسیدگی را انتخاب کنید. این فیلترها هم دفتر گزارش‌ها و هم تحلیل عملکرد پایین آن را تغییر می‌دهند، اما جمع قطعی ساعات بالای صفحه مستقل است."/>
       </div>
       {(unitFilter||view!=='all'||dateFrom||dateTo)&&<button type="button"
         className="report-btn report-btn--light ow-worker-performance-reset"
         onClick={()=>{setUnitFilter('');setView('all');setDateFrom('');setDateTo('');setSelectedReportId(null)}}>
         پاک‌کردن فیلترها</button>}
     </div>
     <div className="ow-history-query-fields">
       <label className="report-field ow-history-query-unit">
         <span>واحد انجام کار</span>
         <select aria-label="فیلتر واحد گزارش‌های من" value={unitFilter}
           onChange={e=>{setUnitFilter(e.target.value);setSelectedReportId(null)}}>
           <option value="">تمام واحدها</option>
           {Object.entries(unitLabels).map(([id,name])=><option key={id} value={id}>{name}</option>)}
         </select>
       </label>
       <div className="report-field ow-history-query-date">
         <span>از تاریخ انجام کار (شمسی)</span>
         <JalaliDatePicker value={dateFrom} ariaLabel="تاریخ شروع سوابق من"
           onChange={date=>{setDateFrom(date);setSelectedReportId(null)}}/>
       </div>
       <div className="report-field ow-history-query-date">
         <span>تا تاریخ انجام کار (شمسی)</span>
         <JalaliDatePicker value={dateTo} ariaLabel="تاریخ پایان سوابق من"
           onChange={date=>{setDateTo(date);setSelectedReportId(null)}}/>
       </div>
     </div>
     <div className="ow-history-query-status">
       <strong>وضعیت بررسی</strong>
       <div className="ow-history-filter" role="group" aria-label="فیلتر وضعیت گزارش‌ها">
         {options.map(([id,label])=><button type="button" key={id}
           className={view===id?'is-selected':''} aria-pressed={view===id}
           onClick={()=>{setSelectedReportId(null);setView(id)}}>
           <span>{label}</span><b>{n(counts[id])}</b>
         </button>)}
       </div>
     </div>

   </section>
   {dateResult.invalidRange&&<p className="report-alert report-alert--error" role="alert">
     بازه تاریخ نامعتبر است؛ تاریخ شروع نباید پس از تاریخ پایان باشد.
   </p>}
   <div className="ow-history-results-heading">
     <h3>دفتر گزارش‌ها</h3><span role="status">{n(entries.length)} گزارش در فیلتر فعلی</span>
   </div>
   <div className={`ow-b3-ledger-body ${detail?'ow-b3-ledger-body--detail':''}`}>
    <div className="ow-b3-ledger-list" role="list" aria-label="گزارش‌های ثبت‌شده">
     <div className="ow-b3-ledger-columns" aria-hidden="true">
       <span>کار / تاریخ انجام</span><span>وضعیت</span>
       <span>درخواستی</span><span>تأییدشده</span><span>جزئیات</span>
     </div>
     {entries.map(entry=><article className={`ow-history-entry ow-b3-ledger-row ${selectedReportId===entry.id?'is-inspected':''}`} role="listitem" key={entry.id}>
       <div className="ow-history-entry__identity">
         <h4>{entry.title}</h4>
         <small>واحد کار: {unitLabels[entry.unit]||entry.unit||'نامشخص'} · {entry.work_date?pretty(entry.work_date):'تاریخ انجام کار نامشخص'}</small>
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
         aria-expanded={selectedReportId===entry.id} aria-controls="ow-report-inspector"
         onClick={()=>setSelectedReportId(entry.id)}>جزئیات</button>
     </article>)}
     {!entries.length&&<div className="ow-history-empty" role="status">
       <strong>{dateResult.invalidRange?'بازه تاریخ انتخاب‌شده نامعتبر است.'
         :view==='all'?(unitFilter||dateFrom||dateTo
           ?'برای فیلترهای انتخاب‌شده گزارشی یافت نشد.':'هنوز گزارشی در سوابق ثبت نشده است.')
         :'گزارشی با وضعیت انتخاب‌شده یافت نشد.'}</strong>
       <p>برای مشاهدهٔ سایر گزارش‌ها، فیلترهای بالا را بررسی یا پاک کنید.</p>
     </div>}
    </div>
    {detail&&<aside id="ow-report-inspector" tabIndex={-1} className="ow-b3-inspector" aria-label="جزئیات گزارش">
      <div className="ow-b3-inspector-head">
        <h3>جزئیات گزارش</h3>
        <button type="button" className="ow-mini-btn" onClick={()=>{
          setSelectedReportId(null)
          document.querySelector(`[data-report-inspect="${detail.id}"]`)?.focus()
        }}>بستن</button>
      </div>
      <h4>{detail.title}</h4>
      <p className="ow-b3-inspector-facts">واحد انجام کار: {unitLabels[detail.unit]||detail.unit||'نامشخص'}</p>
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
   </div>
   {!dateResult.invalidRange&&<WorkerPerformancePanel rows={entries} tasks={tasks} units={unitLabels}/>}
 </section>
}

function WorkerSelfProfile({tasks,records,profile,requestLedger,approvedMinutesTotal,onNavigate,onGuide,onIdentityLoaded,onIdentityInvalidated,refreshRevision=0}) {
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
     if(!personal||typeof personal!=='object'||personal.worker_id!==profile.worker_id||!Array.isArray(items))
       throw Error('INVALID_PROFILE_PROJECTION')
     // Release the local receipt ONLY when its exact server request appears
     // in a completed state. A stale queue with no row cannot unlock it.
     for(const [code,receipt] of requestLedger){
       const item=items.find(r=>r.id===receipt.requestId)
       if(item&&item.review_state!=='pending')requestLedger.delete(code)
     }
     setIdentity(personal)
     setIdentityOwner(profile.worker_id)
     onIdentityLoaded?.(personal)
     setRequests(items)
     setProfileReadFailed(false)
     setRequestsError('')
     return true
   }catch{
     if(sequence!==profileReadSequence.current)return false
     // Fail closed for the independently fetched self-profile and request history.
     setIdentity(null)
     onIdentityInvalidated?.()
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
    <div className="ow-presence-section-title ow-b3-guide-heading--profile"><h2>حساب من</h2>
      <span className="ow-status">زمان تأییدشده: {exactDuration(approvedTime)}</span>
      <button type="button" className="swtb-guide-launch" data-swtb-guide="help-profile"
        onClick={()=>onGuide?.('profile')}>؟ راهنمای این بخش</button></div>
    <div className="ow-self-identity" data-swtb-guide="profile-details">
      <div><small>نام و نام خانوادگی</small><strong>{identity?.name||'نامشخص'}</strong></div>
      <div><small>رشته تحصیلی</small><strong>{identity?.major||'ثبت نشده'}</strong></div>
      <div><small>سال ورود</small><strong>{identity?.entry_year||'ثبت نشده'}</strong></div>
      <div><small>واحد اولیهٔ ثبت‌نام</small><strong>{unitLabels[identity?.unit]||identity?.unit||'نامشخص'}</strong></div>
    </div>
    <nav className="ow-self-profile-quicklinks" data-swtb-guide="profile-shortcuts"
      aria-label="پیگیری فعالیت دانشجوکار">
      <div className="ow-self-profile-quicklinks-copy">
        <strong>پیگیری همکاری</strong>
        <small>{n(openTasks)} کار ناتمام در فهرست فعلی · جزئیات زمان‌های گزارش‌شده و تأییدشده در سوابق گزارش‌ها قابل بررسی است.</small>
      </div>
      <div className="ow-self-profile-quicklinks-actions">
        <button type="button" className="report-btn report-btn--light"
          onClick={()=>onNavigate?.('tasks','action')}>کارهای من</button>
        <button type="button" className="report-btn report-btn--light"
          onClick={()=>onNavigate?.('history')}>سوابق گزارش‌ها و ساعات</button>
      </div>
    </nav>
    <div className="ow-profile-change-launch" data-swtb-guide="profile-correction">
      <button type="button" ref={profileDialogTriggerRef}
        className="report-btn report-btn--light ow-profile-change-trigger"
        aria-haspopup="dialog" aria-controls="ow-profile-change-dialog"
        onClick={()=>{setProfileTab('new');setEditing(true)}}>درخواست اصلاح و پیگیری</button>
      <WorkerInfoHint label="درباره اصلاح مشخصات" text="درخواست اصلاح پس از ثبت برای مدیر ارسال می‌شود؛ مشخصات فعلی تا بررسی و تأیید او تغییر نخواهند کرد."/>
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
  workerName='',loginEmail='',settingsPanel=null,settingsNotice='',onLogout,onRefresh,onToggleSettings,settingsOpen=false}) {
  // The protected worker projection must never be rendered for a new principal
  // while its new server read is pending. Same-component account replacement
  // may otherwise expose the previous worker for one React paint.
  const [workSnapshot,setWorkSnapshot]=useState({workerId:null,data:null})
  const data=workSnapshot.workerId===profile.worker_id&&workSnapshot.data
    ?workSnapshot.data:{tasks:[],weekly_slots:[],exceptions:[],time_entries:[]}
  // Login identity may hold the original applicant name, while the protected V2
  // self-profile reflects a manager-approved display-name override.
  const [nameSnapshot,setNameSnapshot]=useState({workerId:null,name:''})
  const nameReadVersion=useRef(0)
  const visibleWorkerName=nameSnapshot.workerId===profile.worker_id
    ?nameSnapshot.name:workerName
  const acceptCanonicalName=personal=>{
    if(personal?.worker_id!==profile.worker_id||
       typeof personal.name!=='string'||!personal.name.trim())return
    ++nameReadVersion.current
    setNameSnapshot({workerId:profile.worker_id,name:personal.name.trim()})
  }
  const invalidateCanonicalName=()=>{
    // A failed self-profile/request-history scope invalidates the secondary
    // approved-name projection too, without changing the login identity.
    ++nameReadVersion.current
    setNameSnapshot({workerId:null,name:''})
  }
  useEffect(()=>{
    const workerId=profile.worker_id
    const version=++nameReadVersion.current
    let cancelled=false
    // Re-fetch only the signed-in worker's approved name; never substitute
    // manager data or another account's cached/late profile response.
    void getMyWorkerProfileV2().then(personal=>{
      if(cancelled||nameReadVersion.current!==version||
         personal?.worker_id!==workerId||
         typeof personal.name!=='string'||!personal.name.trim())return
      setNameSnapshot({workerId,name:personal.name.trim()})
    }).catch(()=>{
      // A transient name-read failure must not affect the existing work RPC.
    })
    return ()=>{cancelled=true}
  },[profile.worker_id,refreshRevision])
  // Task acknowledgements survive switching work/profile/presence tabs, but
  // are strictly scoped to this authenticated worker and this React session.
  const acknowledgedActions=useRef({workerId:profile.worker_id,items:new Map(),profileRequests:new Map()})
  if(acknowledgedActions.current.workerId!==profile.worker_id)
    acknowledgedActions.current={workerId:profile.worker_id,items:new Map(),profileRequests:new Map()}
  const [localNavigation,setLocalNavigation]=useState({section:'tasks',taskRange:'today'})
  const [submissionReceipt,setSubmissionReceipt]=useState(null)
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false)
  const [charterInfoOpen,setCharterInfoOpen]=useState(false)
  const charterInfoTriggerRef=useRef(null)
  useEffect(()=>setCharterInfoOpen(false),[profile.worker_id])
  // Default OFF for every authenticated principal. Remembering this checkbox
  // within the same session must never leak across an account switch.
  const [peerVisibility,setPeerVisibility]=useState({workerId:profile.worker_id,enabled:false})
  const showCoworkers=peerVisibility.workerId===profile.worker_id&&peerVisibility.enabled
  const [selectedTaskId,setSelectedTaskId]=useState(null)
  const [guideWelcomeOpen,setGuideWelcomeOpen]=useState(false)
  const [guideScope,setGuideScope]=useState(null)
  const guideOfferedFor=useRef(null)
  const guideReturnSection=useRef('tasks')
  const selected=navigation||localNavigation
  const updateNavigation=patch=>{
    const fn=previous=>({...previous,...patch})
    ;(setNavigation||setLocalNavigation)(fn)
  }
  const section=['tasks','availability','history','profile',...(workPoolUIEnabled?['workPool']:[])].includes(selected.section)?selected.section:'tasks'
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
  useLayoutEffect(()=>{
    if(inspectedTask)document.getElementById('ow-task-inspector')?.focus({preventScroll:true})
  },[inspectedTask?.id])
  useEffect(()=>{
    if(!inspectedTask)return
    const onKeyDown=event=>{
      if(event.key!=='Escape'||document.querySelector('dialog[open]'))return
      document.querySelector(`[data-task-inspect="${inspectedTask.id}"]`)?.focus()
      setSelectedTaskId(null)
    }
    document.addEventListener('keydown',onKeyDown)
    return()=>document.removeEventListener('keydown',onKeyDown)
  },[inspectedTask?.id])
  const sectionNames={tasks:'کارهای من',availability:'زمان حضور',workPool:'فرصت‌های کاری',
    history:'سوابق گزارش‌ها',profile:'حساب من'}
  // Offer once per authenticated worker/version only after an authorized read.
  useEffect(()=>{
    if(guideOfferedFor.current===profile.worker_id||loading||readFailed||
      workSnapshot.workerId!==profile.worker_id||settingsOpen)return
    guideOfferedFor.current=profile.worker_id
    const key=workerGuideStorageKey(profile.worker_id)
    try{if(key&&window.localStorage.getItem(key)==='seen')return}catch{}
    if(typeof HTMLDialogElement!=='undefined'&&typeof HTMLDialogElement.prototype.showModal==='function')
      setGuideWelcomeOpen(true)
  },[profile.worker_id,workSnapshot.workerId,loading,readFailed,settingsOpen])
  const rememberGuideOffer=()=>{
    const key=workerGuideStorageKey(profile.worker_id)
    try{if(key)window.localStorage.setItem(key,'seen')}catch{}
  }
  const openWorkerGuide=scope=>{
    // The V4 presence view is unified; there is no legacy availability subview to reset.
    rememberGuideOffer()
    setGuideWelcomeOpen(false)
    setSelectedTaskId(null)
    guideReturnSection.current=section
    if(settingsOpen)onToggleSettings?.()
    updateNavigation({section:scope==='all'?'tasks':scope})
    setGuideScope(scope)
  }
  const closeWorkerGuide=()=>{
    const previousScope=guideScope
    setGuideScope(null)
    updateNavigation({section:guideReturnSection.current})
    requestAnimationFrame(()=>document.querySelector(
      `[data-swtb-guide="help-${previousScope==='all'?'global':previousScope}"]`
    )?.focus({preventScroll:true}))
  }
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
      <div className="ow-b3-brand" title="پنل دانشجوکار · دانشکده علوم انسانی شهید رجایی بابل">
        <span className="ow-b3-brand__icon" aria-hidden="true">▤</span>
        {!sidebarCollapsed&&<div><strong>پنل دانشجوکار</strong>
          <small>دانشکده علوم انسانی شهید رجایی بابل</small></div>}
      </div>
      {!sidebarCollapsed&&<p className="ow-b3-sidebar-caption">فضای کاری</p>}
      <SectionTabs value={settingsOpen?null:section} onChange={next=>{
        if(settingsOpen)onToggleSettings?.()
        setSelectedTaskId(null);updateNavigation({section:next})
      }} options={[
        ['tasks','کارهای من'],...(workPoolUIEnabled?[['workPool','فرصت‌های کاری']]:[]),
        ['availability','زمان حضور'],['history','سوابق گزارش‌ها'],['profile','حساب من'],
      ]}/>
      <div className="ow-b3-sidebar__footer">
        <div className="swtb-policy-sidebar-actions">
          <button type="button" className="swtb-guide-launch swtb-policy-sidebar-action"
            data-swtb-guide="help-global"
            title="راهنمای تصویری سامانه" aria-label="راهنمای سامانه"
            onClick={()=>{setCharterInfoOpen(false);openWorkerGuide('all')}}>
            <svg className="swtb-policy-action-icon" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9"/>
              <path d="M9.4 9a2.8 2.8 0 0 1 5.3 1c0 1.9-2.7 2.4-2.7 4"/>
              <path d="M12 17.5h.01"/>
            </svg>
            {!sidebarCollapsed&&<span className="swtb-policy-action-label">راهنمای سامانه</span>}
          </button>
          {workerCharterInfoEnabled&&<button type="button"
            className="swtb-policy-sidebar-action"
            ref={charterInfoTriggerRef}
            title="مطالعه چارچوب همکاری دانشجوکاران؛ ثبت موافقت رسمی هنوز فعال نیست"
            aria-label="مطالعه چارچوب همکاری دانشجوکاران"
            aria-haspopup="dialog"
            onClick={()=>{
              setGuideScope(null)
              setGuideWelcomeOpen(false)
              setCharterInfoOpen(true)
            }}>
            <svg className="swtb-policy-action-icon" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6M8 13h8M8 17h8"/>
            </svg>
            {!sidebarCollapsed&&<span className="swtb-policy-action-label">چارچوب همکاری</span>}
          </button>}
        </div>
        <div className="ow-b3-worker" title={visibleWorkerName}>
          <span className="ow-b3-worker__avatar" aria-hidden="true">{visibleWorkerName?.trim()?.[0]||'د'}</span>
          {!sidebarCollapsed&&<div><strong>{visibleWorkerName}</strong>
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
    <div className="ow-b3-stage" id="ow-b3-main" tabIndex={-1}>
      <header className="ow-b3-toolbar">
        <span className="ow-b3-breadcrumb">فضای کاری <span aria-hidden="true">›</span>
          <strong>{settingsOpen?'تنظیمات حساب':sectionNames[section]}</strong></span>
        <span className="ow-b3-online">حساب فعال · اطلاعات عملیاتی</span>
      </header>
      {settingsNotice&&<p className="ops-alert-success" role="status">{settingsNotice}</p>}
      {settingsOpen&&settingsPanel}
      {loading&&<p className="ow-muted" role="status">در حال دریافت برنامه…</p>}
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
    {!settingsOpen&&section==='tasks'&&<section className="report-panel ow-worker-task-workspace">
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
        <div className="ow-worker-title-inline"><h1>کارهای من</h1>
          <WorkerInfoHint label="راهنمای اولویت‌بندی کارها" text="دسته نیازمند اقدام، کارهای موعدرسیده و درخواست‌های نیازمند اصلاح را نشان می‌دهد. برای کارهای بعدی، دسته‌های دیگر یا فیلتر تاریخ را انتخاب کنید."/>
        </div>
        <div className="ow-b3-guide-heading">
          <span className="ow-b3-current-count">{n(tasks.length)} کار در فهرست</span>
          <button type="button" className="swtb-guide-launch" data-swtb-guide="help-tasks"
            onClick={()=>openWorkerGuide('tasks')}>؟ راهنمای این بخش</button>
        </div>
      </div>
      <div className="ow-worker-focus-switch" data-swtb-guide="tasks-status" role="group" aria-label="وضعیت کارهای من">
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
      <div className="ow-list ow-worker-tasks" data-swtb-guide="tasks-list">
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
      {inspectedTask&&<aside id="ow-task-inspector" tabIndex={-1} className="ow-b3-inspector" aria-label="جزئیات کار انتخابی">
        <div className="ow-b3-inspector-head">
          <h3>جزئیات کار</h3>
          <button type="button" className="ow-mini-btn" onClick={()=>{
            setSelectedTaskId(null);document.querySelector(`[data-task-inspect="${inspectedTask.id}"]`)?.focus()
          }}>بستن</button>
        </div>
        <h4>{inspectedTask.title}</h4>
        <p className="ow-b3-inspector-facts">واحد کار: {unitLabels[inspectedTask.unit]||inspectedTask.unit||'نامشخص'} · {stateLabels[inspectedTask.state]||inspectedTask.state}
          {' · '}{pretty(inspectedTask.planned_date)}{' · '}
          زمان استاندارد: {minutes(inspectedTask.estimate_minutes)}</p>
        {inspectedTask.instructions
          ?<section><strong>شرح وظیفه</strong><p>{inspectedTask.instructions}</p></section>
          :<p className="ow-muted">توضیح دیگری برای این کار ثبت نشده است.</p>}
        {inspectedReport&&<section aria-label="زمان‌های گزارش مرتبط با کار">
          <strong>زمان گزارش‌شده</strong>
          <p>{inspectedReport.reported_minutes==null?'ثبت نشده':minutes(inspectedReport.reported_minutes)}</p>
          <strong>زمان تأییدشده</strong>
          <p>{inspectedReport.review_state==='approved'
            ? (inspectedReport.approved_minutes==null?'مقدار تأییدشده ثبت نشده':minutes(inspectedReport.approved_minutes))
            : inspectedReport.review_state==='submitted'?'در انتظار بررسی'
            : inspectedReport.review_state==='changes_requested'?'نیازمند اصلاح'
            : 'تأیید نشد'}</p>
        </section>}
        {inspectedReport?.review_note&&<section className="ow-b3-inspector-note">
          <strong>نظر مدیر دربارهٔ گزارش مرتبط</strong>
          <p>{inspectedReport.review_note}</p>
        </section>}
        <p className="ow-muted">برای انجام یا اصلاح گزارش، از دکمهٔ همان ردیف استفاده کنید.</p>
      </aside>}
      </div>
    </section>}
    {!settingsOpen&&workPoolUIEnabled&&section==='workPool'&&<Suspense fallback={<p className="ow-muted" role="status">در حال آماده‌سازی فرصت‌های کاری…</p>}>
      <WorkPoolWorkerPanel key={profile.worker_id} workerId={profile.worker_id}
        onGuide={openWorkerGuide} refreshRevision={refreshRevision}
        onClaimed={()=>{void refresh();updateNavigation({section:'tasks',taskView:'upcoming'})}}/>
    </Suspense>}
    {!settingsOpen&&section==='availability'&&<section className="report-panel ow-worker-availability-panel">
      <div className="ow-b3-guide-heading">
        <h2>برنامه حضور</h2>
        <button type="button" className="swtb-guide-launch" data-swtb-guide="help-availability"
          onClick={()=>openWorkerGuide('availability')}>؟ راهنمای این بخش</button>
      </div>
      <div className="ow-worker-unified-visibility" data-swtb-guide="availability-peers">
        <label className="ow-worker-unified-toggle">
          <input type="checkbox" checked={showCoworkers}
            onChange={event=>setPeerVisibility({
              workerId:profile.worker_id,enabled:event.target.checked,
            })}/>
          <span>نمایش برنامه همکاران</span>
        </label>
        <WorkerInfoHint label="درباره نمایش همکاران" text="برنامه خودتان قابل ویرایش است. بازه‌های همکاران فقط برای هماهنگی و بدون جزئیات خصوصی نمایش داده می‌شوند."/>
      </div>
      <div className="ow-worker-unified-presence">
        <ScheduleEditor key={profile.worker_id}
          workerId={profile.worker_id} data={data} onSaved={refresh}
          showPeers={showCoworkers} peerRefreshRevision={refreshRevision}/>
      </div>
    </section>}
    {!settingsOpen&&section==='history'&&<WorkerReportHistory tasks={tasks} records={records}
      onGuide={openWorkerGuide} refreshRevision={refreshRevision} approvedMinutesTotal={data.approved_minutes_total}
      onNavigate={(nextSection,nextView)=>updateNavigation({section:nextSection,
        ...(nextView?{taskView:nextView}:{})})}/>}
    {!settingsOpen&&section==='profile'&&<WorkerSelfProfile tasks={tasks} records={records} profile={profile}
      onGuide={openWorkerGuide} onIdentityLoaded={acceptCanonicalName}
      onIdentityInvalidated={invalidateCanonicalName}
      requestLedger={acknowledgedActions.current.profileRequests}
      onNavigate={(nextSection,nextView)=>updateNavigation({section:nextSection,
        ...(nextView?{taskView:nextView}:{})})}
      approvedMinutesTotal={data.approved_minutes_total} refreshRevision={refreshRevision}/>}
    </div>
    {workerCharterInfoEnabled&&charterInfoOpen&&<Suspense
      fallback={<p role="status">در حال بارگذاری متن چارچوب همکاری…</p>}>
      <WorkerAgreementModalPreview open={charterInfoOpen} onClose={()=>{
        setCharterInfoOpen(false)
        requestAnimationFrame(()=>charterInfoTriggerRef.current?.focus({preventScroll:true}))
      }}/>
    </Suspense>}
    {guideWelcomeOpen&&<WorkerGuideWelcome
      onBegin={()=>openWorkerGuide('all')}
      onSkip={dontShowAgain=>{if(dontShowAgain)rememberGuideOffer();setGuideWelcomeOpen(false)}}/>}
    {guideScope&&<WorkerGuideSpotlight key={guideScope} scope={guideScope}
      currentSection={section}
      onNavigate={next=>updateNavigation({section:next})}
      includeWorkPool={workPoolUIEnabled} onClose={closeWorkerGuide}/>}
  </div>
}
