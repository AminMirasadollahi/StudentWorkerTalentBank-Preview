// Read-only presentation for review-only API. Never uses today's browser clock.
// No invented daily allocation or financial/attendance inference.
import {validateWindowWorkerSnapshotV1} from './windowFixtureApiV1.mjs'
import {selectWorkerTaskFocus} from './workerTaskFocus.mjs'
const states={assigned:'واگذارشده',in_progress:'در حال انجام',submitted:'منتظر بررسی',completed:'تکمیل‌شده',needs_changes:'نیازمند اصلاح',cancelled:'لغوشده'}
const reasons={TASK_STATE:'وضعیت فعلی اجازه عملیات نمی‌دهد',EXISTING_ACTIVE_REPORT:'گزارش موجود است',CORRECTION_POLICY_HELD:'مسیر اصلاح هنوز فعال نیست',TERM_POLICY_HELD:'وضعیت نیمسال نیازمند بررسی است',PREREQUISITES_UNRESOLVED:'پیش‌نیازها هنوز تکمیل نشده‌اند',WINDOW_NOT_STARTED:'بازه هنوز شروع نشده است',LATE_SUBMISSION_POLICY_HELD:'مهلت بازه پایان یافته؛ سیاست ثبت دیرهنگام هنوز فعال نیست'}
const units={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
export function jalaliWindowDay(value){
 if(!day(value))return '—'
 return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'))
}
export const windowUnitLabel=u=>units[u]||u||'نامشخص'
export function windowTaskDisplay(t,format=jalaliWindowDay){
 const isWindow=t.schedule_kind==='single_report_window'
 return {id:t.id,title:t.title||'کار بدون عنوان',instructions:t.instructions||'',unit:windowUnitLabel(t.unit),
 state:states[t.state]||'نامشخص',kind:isWindow?'بازه‌ای':'روز مشخص',
 scheduleText:isWindow?format(t.window_start)+' تا '+format(t.window_end):format(t.planned_date),
 standardMinutes:t.estimate_minutes,allocationText:isWindow?'برآورد کل بازه؛ تخصیص روزانه تعیین نشده':'برآورد وظیفه',
 revision:isWindow?t.window_revision:null,windowStart:isWindow?t.window_start:null,windowEnd:isWindow?t.window_end:null,
 canStart:isWindow&&t.window_actions?.can_start===true,canSubmit:isWindow&&t.window_actions?.can_submit===true,
 holdText:isWindow&&t.window_actions?.hold_reason?(reasons[t.window_actions.hold_reason]||'نیازمند بررسی قرارداد سرور'):null}
}
export function workerWindowReviewModel(raw,workerId,format=jalaliWindowDay){
 validateWindowWorkerSnapshotV1(raw,workerId)
 if(!Array.isArray(raw.time_entries)||!Number.isSafeInteger(raw.approved_minutes_total)||raw.approved_minutes_total<0)throw Error('WINDOW_WORKER_HISTORY_INVALID')
 const byTask=new Map(raw.tasks.map(t=>[t.id,t])),entries=new Set()
 const reports=raw.time_entries.map(e=>{
  if(typeof e?.id!=='string'||!e.id||entries.has(e.id)||typeof e.task_id!=='string'||!day(e.work_date)||
   !Number.isSafeInteger(e.reported_minutes)||e.reported_minutes<1||e.reported_minutes>1440||
   !['submitted','approved','changes_requested','rejected'].includes(e.review_state)||
   (e.review_state==='approved'?(!Number.isSafeInteger(e.approved_minutes)||e.approved_minutes<0||e.approved_minutes>e.reported_minutes):e.approved_minutes!=null))throw Error('WINDOW_WORKER_REPORT_INVALID')
  entries.add(e.id);const t=byTask.get(e.task_id)
  if(t?.schedule_kind==='single_report_window'&&(e.work_date<t.window_start||e.work_date>t.window_end))throw Error('WINDOW_WORKER_REPORT_DATE_INVALID')
  return {id:e.id,taskTitle:t?.title||'کار مرتبط در فهرست بارگذاری‌شده موجود نیست',actualDate:format(e.work_date),
   reportedMinutes:e.reported_minutes,approvedMinutes:e.review_state==='approved'?e.approved_minutes:null,
   status:({submitted:'منتظر بررسی',approved:'تأییدشده',changes_requested:'نیازمند اصلاح',rejected:'ردشده'})[e.review_state]}
 })
 const groups={action:[],upcoming:[],held:[],pending:[],completed:[]}
 const legacy=raw.tasks.filter(t=>t.schedule_kind==='legacy_day')
 for(const k of ['action','upcoming','pending','completed'])groups[k]=selectWorkerTaskFocus(legacy,raw.server_today,k).map(t=>windowTaskDisplay(t,format))
 for(const t of raw.tasks.filter(t=>t.schedule_kind==='single_report_window')){
  const a=t.window_actions
  const lane=['completed','cancelled'].includes(t.state)?'completed':t.state==='submitted'?'pending':
   a.hold_reason==='WINDOW_NOT_STARTED'?'upcoming':a.can_start||a.can_submit?'action':'held'
  groups[lane].push(windowTaskDisplay(t,format))
 }
 for(const k of Object.keys(groups))groups[k].sort((a,b)=>String(a.windowEnd||'9999-12-31').localeCompare(String(b.windowEnd||'9999-12-31'))||a.id.localeCompare(b.id))
 return {groups,reports,approvedMinutesTotal:raw.approved_minutes_total,historyCoverage:'bounded_not_lifetime',serverToday:raw.server_today}
}
