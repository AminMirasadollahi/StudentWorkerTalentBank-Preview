// Isolated schedule-contract V2 candidate. Not imported by the live workspace.
// No network, auth fallback, mutation, client clock or payroll calculations.
import {managerHistoryProjection,managerHistoryExcelRows,MANAGER_HISTORY_COLUMNS,safeExcelText} from './managerHistoryExport.mjs'
import {validIsoDay,assessAssignmentCapacity} from './assignmentCapacity.mjs'

const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k)
const fail=code=>{throw Error(code)}
const open=new Set(['assigned','in_progress','needs_changes','submitted'])
const states=new Set([...open,'completed','cancelled'])
const reviewStates=new Set(['submitted','approved','changes_requested','rejected'])
const validId=x=>typeof x==='string'&&x.length>0
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max
const day=x=>validIsoDay(x)&&x>='2000-01-01'&&x<='2100-12-31'
const byId=(rows,code)=>{
 if(!Array.isArray(rows))fail(code)
 const m=new Map()
 for(const r of rows){if(!validId(r?.id)||m.has(r.id))fail(code);m.set(r.id,r)}
 return m
}
function validateSnapshot(data){
 if(data?.schedule_contract_version!==2||data?.review_only!==true)fail('WINDOW_MANAGER_CONTRACT_REQUIRED')
 const tasks=byId(data.tasks,'WINDOW_TASK_ID_INVALID'),workers=byId(data.workers,'WINDOW_WORKER_ID_INVALID')
 const reports=byId(data.time_entries,'WINDOW_REPORT_ID_INVALID')
 for(const t of tasks.values()){
  if(!workers.has(t.worker_id)||!validId(t.unit)||!states.has(t.state)||
    !integer(t.estimate_minutes,1,1440)||typeof t.has_any_report!=='boolean')fail('WINDOW_TASK_CONTEXT_INVALID')
  if(t.schedule_kind==='legacy_day'){
   if(!day(t.planned_date)||['window_start','window_end','window_term_id','window_revision','allocation_code'].some(k=>own(t,k)&&t[k]!=null))fail('LEGACY_DAY_SHAPE_INVALID')
  }else if(t.schedule_kind==='single_report_window'){
   if(t.planned_date!==null||!day(t.window_start)||!day(t.window_end)||t.window_start>t.window_end||
     !validId(t.window_term_id)||!integer(t.window_revision,1,Number.MAX_SAFE_INTEGER)||
     t.daily_allocated_minutes!==null||t.allocation_code!=='UNALLOCATED_WINDOW')fail('WINDOW_SHAPE_INVALID')
  }else fail('UNKNOWN_SCHEDULE_KIND')
 }
 for(const e of reports.values()){
  const t=tasks.get(e.task_id)
  if(!workers.has(e.worker_id)||!validId(e.task_id)||!day(e.work_date)||!reviewStates.has(e.review_state)||
    !integer(e.reported_minutes,1,1440)||
    (e.review_state==='approved'?!integer(e.approved_minutes,0,e.reported_minutes):e.approved_minutes!=null))fail('WINDOW_REPORT_CONTEXT_INVALID')
  if(t&&(!t.has_any_report||t.worker_id!==e.worker_id))fail('WINDOW_REPORT_LINK_INVALID')
  if(t?.schedule_kind==='single_report_window'&&(e.work_date<t.window_start||e.work_date>t.window_end))fail('WINDOW_REPORT_DATE_INVALID')
 }
 return {tasks,workers,reports}
}
function scopeDates(from,to){
 if((from&&!day(from))||(to&&!day(to))||(from&&to&&from>to))fail('WINDOW_FILTER_DATE_INVALID')
 return {inDate:d=>(!from||d>=from)&&(!to||d<=to),
  overlaps:(s,e)=>(!from||e>=from)&&(!to||s<=to)}
}
function scheduleFields(task,dateLabel){
 if(!task)return {scheduleKind:'unknown',scheduleLabel:'نامشخص',plannedDate:null,windowStart:null,windowEnd:null,windowTermId:null,windowRevision:null}
 const w=task.schedule_kind==='single_report_window'
 return {scheduleKind:task.schedule_kind,scheduleLabel:w?'بازه‌ای':'روز مشخص',
  plannedDate:w?null:task.planned_date,windowStart:w?task.window_start:null,
  windowEnd:w?task.window_end:null,windowTermId:w?task.window_term_id:null,
  windowRevision:w?task.window_revision:null}
}
export function managerWindowHistoryV2(data,filters={},options={}){
 const {tasks,workers,reports}=validateSnapshot(data)
 const {workerId='',unit='',review='',from='',to=''}=filters
 if(workerId&&!workers.has(workerId))fail('WINDOW_FILTER_WORKER_INVALID')
 if(review&&review!=='without_report'&&!reviewStates.has(review))fail('WINDOW_FILTER_REVIEW_INVALID')
 const {inDate,overlaps}=scopeDates(from,to)
 const dateLabel=options.dateLabel||((d)=>d)
 const scopedTask=t=>(!workerId||t.worker_id===workerId)&&(!unit||t.unit===unit)
 const loadedReportIds=new Set([...reports.values()].map(e=>e.task_id))
 const selectedReports=[...reports.values()].filter(e=>
  (!workerId||e.worker_id===workerId)&&(!unit||tasks.get(e.task_id)?.unit===unit)&&
  review!=='without_report'&&(!review||e.review_state===review)&&inDate(e.work_date))
 const visibleReportIds=new Set(selectedReports.map(e=>e.task_id))
 const selectedTasks=[...tasks.values()].filter(t=>scopedTask(t)&&(visibleReportIds.has(t.id)||
   (!t.has_any_report&&(!review||review==='without_report')&&
    (t.schedule_kind==='legacy_day'?inDate(t.planned_date):overlaps(t.window_start,t.window_end)))))
 // A task with reports outside the loaded archive is never relabeled unreported.
 // Expose count separately, not as an activity-date match or known report status.
 const unloaded=[...tasks.values()].filter(t=>scopedTask(t)&&t.has_any_report&&!loadedReportIds.has(t.id))
 const result=managerHistoryProjection({workers:[...workers.values()],tasks:selectedTasks,time_entries:selectedReports},options)
 const decorate=row=>{
  const task=tasks.get(row.taskId),meta=scheduleFields(task,dateLabel)
  const actual=row.reportId?row.date:null
  const windowOnly=!row.reportId&&meta.scheduleKind==='single_report_window'
  return {...row,...meta,actualWorkDate:actual,
   date:windowOnly?'':row.date,dateText:windowOnly?dateLabel(meta.windowStart)+' تا '+dateLabel(meta.windowEnd):row.dateText,
   dateBasis:row.reportId?'actual_work_date':windowOnly?'window_overlap':'planned_date'}
 }
 const reportRows=result.reportRows.map(decorate)
 const unreported=result.records.filter(r=>r.kind==='unreported').map(decorate)
  .sort((a,b)=>(b.windowEnd||b.plannedDate||'').localeCompare(a.windowEnd||a.plannedDate||'')||a.taskId.localeCompare(b.taskId))
 const standardMinutes=selectedTasks.reduce((sum,t)=>sum+t.estimate_minutes,0)
 return {records:[...reportRows,...unreported],reportRows,summary:{...result.summary,
  standardMinutesOnce:standardMinutes,unloadedReportTaskCount:unloaded.length,
  unreportedWindowCount:unreported.filter(r=>r.scheduleKind==='single_report_window').length},
  scheduleContractVersion:2,historyScope:'loaded_reports_and_authoritative_no_report_tasks',
  historyCoverage:'bounded_not_lifetime',unloadedReportTaskIds:unloaded.map(t=>t.id)}
}
export const WINDOW_HISTORY_COLUMNS=Object.freeze([
 ...MANAGER_HISTORY_COLUMNS.filter(c=>c[1]!=='dateText').slice(0,4),
 ['نوع زمان‌بندی','scheduleLabel',20],['روز برنامه‌ریزی (ISO)','plannedDate',22],
 ['آغاز بازه (ISO)','windowStart',22],['پایان بازه (ISO)','windowEnd',22],
 ['تاریخ واقعی فعالیت (ISO)','actualWorkDate',25],['مبنای تطبیق تاریخ','dateBasisLabel',24],
 ...MANAGER_HISTORY_COLUMNS.filter(c=>!['kindLabel','workerName','unit','taskTitle','dateText'].includes(c[1])),
 ['شناسه نیمسال بازه','windowTermId',37],['نسخه بازه','windowRevision',15],
])
export function managerWindowExcelRowsV2(projection){
 if(projection?.scheduleContractVersion!==2)fail('WINDOW_HISTORY_EXPORT_CONTRACT_REQUIRED')
 const base=managerHistoryExcelRows(projection)
 return base.map((r,i)=>{
  const x=projection.records[i]
  const {dateText,...rest}=r
  return {...rest,scheduleLabel:safeExcelText(x.scheduleLabel),plannedDate:safeExcelText(x.plannedDate),
   windowStart:safeExcelText(x.windowStart),windowEnd:safeExcelText(x.windowEnd),
   actualWorkDate:safeExcelText(x.actualWorkDate),windowTermId:safeExcelText(x.windowTermId),
   windowRevision:x.windowRevision,dateBasisLabel:x.dateBasis==='actual_work_date'?'تاریخ واقعی فعالیت':x.dateBasis==='window_overlap'?'هم‌پوشانی بازه':'روز برنامه‌ریزی'}
 })
}
export function windowHistoryMetadataV2(projection){
 if(projection?.scheduleContractVersion!==2)fail('WINDOW_HISTORY_EXPORT_CONTRACT_REQUIRED')
 return [
 ['دامنه داده','گزارش‌های بارگذاری‌شده و وظایف دارای تأیید سرور مبنی بر نبود گزارش؛ نه تاریخچه کامل یا مبنای پرداخت'],
 ['روش فیلتر','گزارش با تاریخ واقعی؛ کار روزانه بدون گزارش با روز برنامه؛ کار بازه‌ای بدون گزارش با هم‌پوشانی بازه'],
 ['برآورد یکتا در نتایج (دقیقه)',projection.summary.standardMinutesOnce],
 ['وظایف دارای گزارش خارج از فهرست بارگذاری‌شده (قبل از فیلتر تاریخ و وضعیت)',projection.summary.unloadedReportTaskCount],
 ['هشدار برآورد','برآورد در ردیف گزارش ممکن است تکرار شود؛ برای جمع از شناسه یکتای وظیفه و شاخص جمع‌بندی استفاده کنید'],
 ['زمان تأییدشده','فقط تصمیم تأیید مدیر؛ هیچ معادل مالی یا حضور قطعی استنباط نمی‌شود'],
 ]
}
export function managerUnallocatedWindowsV2(data,{from='',to='',workerId='',unit=''}={}){
 const {tasks,workers}=validateSnapshot(data)
 if(workerId&&!workers.has(workerId))fail('WINDOW_FILTER_WORKER_INVALID')
 const {overlaps}=scopeDates(from,to)
 const items=[...tasks.values()].filter(t=>t.schedule_kind==='single_report_window'&&open.has(t.state)&&
  (!workerId||t.worker_id===workerId)&&(!unit||t.unit===unit)&&overlaps(t.window_start,t.window_end))
  .sort((a,b)=>a.window_end.localeCompare(b.window_end)||a.id.localeCompare(b.id))
  .map(t=>({taskId:t.id,workerId:t.worker_id,unit:t.unit,title:t.title,state:t.state,
   windowStart:t.window_start,windowEnd:t.window_end,standardMinutes:t.estimate_minutes,
   dailyAllocatedMinutes:null,allocationCode:'UNALLOCATED_WINDOW',hasAnyReport:t.has_any_report}))
 return {items,windowCount:items.length,standardMinutesOnce:items.reduce((n,t)=>n+t.standardMinutes,0),
  dailyAllocatedMinutes:null,scope:'loaded_manager_window_tasks_not_daily_allocation'}
}
export function assessWindowAwareCapacityV2(data,options={}){
 validateSnapshot(data)
 const {workerId,date}=options
 const daily=assessAssignmentCapacity({...data,tasks:data.tasks.filter(t=>t.schedule_kind==='legacy_day')},options)
 const backlog=managerUnallocatedWindowsV2(data,{from:date,to:date,workerId})
 return {...daily,unallocatedWindows:backlog.items,unallocatedWindowStandardMinutes:backlog.standardMinutesOnce,
  capacityScope:'fixed_day_allocations_only',completeCapacityClaim:false}
}
// Peer response remains redacted, day-only. Never pass manager window rows to a peer browser.
export function validatePeerDayOnlyTasksV2(tasks,{from,to}){
 if(!day(from)||!day(to)||from>to||!Array.isArray(tasks))fail('PEER_DAY_CONTRACT_INVALID')
 return tasks.map(t=>{
  if(!validId(t?.worker_id)||!day(t.planned_date)||t.planned_date<from||t.planned_date>to||
    t.title!=='فعالیت ثبت‌شده'||t.state!=='scheduled'||
    (own(t,'schedule_kind')&&t.schedule_kind!=='legacy_day')||
    ['window_start','window_end','window_term_id','window_revision','daily_allocated_minutes','allocation_code'].some(k=>own(t,k)))
   fail('PEER_WINDOW_DATA_NOT_ALLOWED')
  return {worker_id:t.worker_id,planned_date:t.planned_date,unit:t.unit,title:'فعالیت ثبت‌شده',state:'scheduled'}
 })
}
