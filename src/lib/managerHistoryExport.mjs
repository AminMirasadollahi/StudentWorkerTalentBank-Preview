// SWTB22-D6A: one manager-authorized scoped projection shared by the UI and
// the Excel file. No RPC, client clock, permission lookup or business mutation.
// Never promote pending/rejected minutes to approved minutes.
export function safeExcelText(value){
 if(value===null||value===undefined)return ''
 const text=String(value)
 // Defense in depth for spreadsheet tools that interpret leading formula markers.
 return /^[\u0000-\u0020]*[=+\-@]/u.test(text)?"'"+text:text
}
const validMinutes=value=>{
 if(value===null||value===undefined||value==='')return null
 const n=Number(value)
 return Number.isSafeInteger(n)&&n>=0?n:null
}
export function managerHistoryProjection(scoped,{
 unitLabels={},reviewLabels={},extraTimeReasons={},
 dateLabel=value=>value||'—',
}={}){
 const workers=scoped?.workers||[]
 const tasks=scoped?.tasks||[]
 const entries=scoped?.time_entries||[]
 const byWorker=new Map(workers.map(w=>[w.id,w]))
 const byTask=new Map(tasks.map(t=>[t.id,t]))
 const reportsByTask=new Map()
 for(const entry of entries){
  if(!reportsByTask.has(entry.task_id))reportsByTask.set(entry.task_id,[])
  reportsByTask.get(entry.task_id).push(entry)
 }
 const records=[]
 const reportRows=[]
 const toReport=(entry,task)=>{
  const kind=task?'report':'orphan'
  const worker=byWorker.get(entry.worker_id)
  const requested=validMinutes(entry.reported_minutes)
  const approved=entry.review_state==='approved'?validMinutes(entry.approved_minutes):null
  const date=entry.work_date||''
  const row={
   key:'report:'+entry.id,kind,reportId:entry.id,taskId:entry.task_id||'',
   workerName:worker?.name||'دانشجوکار نامشخص',
   workerId:entry.worker_id||'',
   unit:task?.unit?unitLabels[task.unit]||task.unit:'واحد کار نامشخص',
   unitCode:task?.unit||'',
   taskTitle:task?.title||'کار مرتبط در فهرست بارگذاری‌شده موجود نیست',
   date,dateText:date?dateLabel(date):'تاریخ فعالیت نامشخص',
   estimateMinutes:validMinutes(task?.estimate_minutes),
   requestedMinutes:requested,approvedMinutes:approved,
   status:reviewLabels[entry.review_state]||entry.review_state||'نامشخص',
   reviewState:entry.review_state||'',
   extraReason:extraTimeReasons[entry.extra_time_reason_code]||entry.extra_time_reason_code||'',
   extraText:entry.extra_time_reason_text||'',
   workerNote:entry.worker_note||'',
   reviewNote:entry.review_note||'',
   missingTask:!task,
   invalidMinutes:requested===null||(entry.review_state==='approved'&&approved===null)||
     (requested!==null&&approved!==null&&approved>requested),
  }
  records.push(row);reportRows.push(row)
 }
 for(const task of tasks){
  const linked=reportsByTask.get(task.id)||[]
  if(linked.length){for(const entry of linked)toReport(entry,task)}
  else{
   const worker=byWorker.get(task.worker_id)
   records.push({
    key:'task:'+task.id,kind:'unreported',reportId:'',taskId:task.id,
    workerName:worker?.name||'دانشجوکار نامشخص',workerId:task.worker_id||'',
    unit:task?.unit?unitLabels[task.unit]||task.unit:'واحد کار نامشخص',
    unitCode:task?.unit||'',taskTitle:task?.title||'کار بدون عنوان',
    date:task.planned_date||'',dateText:task.planned_date?dateLabel(task.planned_date):'تاریخ برنامه نامشخص',
    estimateMinutes:validMinutes(task.estimate_minutes),
    requestedMinutes:null,approvedMinutes:null,
    status:'بدون گزارش',reviewState:'without_report',
    extraReason:'',extraText:'',workerNote:'',reviewNote:'',missingTask:false,
    invalidMinutes:false,
   })
  }
 }
 for(const entry of entries){
  if(!byTask.has(entry.task_id))toReport(entry,null)
 }
 const approved=reportRows.filter(r=>r.reviewState==='approved')
 return {
  records,reportRows,
  summary:{
   taskCount:tasks.length,
   reportCount:reportRows.length,
   approvedReportCount:approved.length,
   pendingReportCount:reportRows.filter(r=>r.reviewState==='submitted').length,
   approvedMinutes:approved.reduce((sum,r)=>sum+(r.approvedMinutes||0),0),
   unreportedTaskCount:records.filter(r=>r.kind==='unreported').length,
   orphanReportCount:reportRows.filter(r=>r.missingTask).length,
   invalidMinutesCount:reportRows.filter(r=>r.invalidMinutes).length,
  },
 }
}
export function managerHistoryExportMetadata(filters={},{
 workers=[],unitLabels={},reviewLabels={},dateLabel=s=>s||'—',
}={}){
 const worker=workers.find(w=>w.id===filters.workerId)
 const makeDate=v=>v?dateLabel(v):'تمام تاریخ‌ها'
 return [
  ['دامنه داده','فقط سوابق مجاز و بارگذاری‌شده در پنل مدیریت هنگام تهیه خروجی'],
  ['دانشجوکار',filters.workerId?(worker?.name||'شناسه انتخاب‌شده فاقد نام در داده مجاز'):'همه دانشجوکاران بارگذاری‌شده'],
  ['واحد انجام کار',filters.unit?unitLabels[filters.unit]||filters.unit:'تمام واحدها'],
  ['وضعیت گزارش',filters.review?(filters.review==='without_report'?'کار بدون گزارش':reviewLabels[filters.review]||filters.review):'همه وضعیت‌ها'],
  ['از تاریخ فعالیت',makeDate(filters.from)],
  ['تا تاریخ فعالیت',makeDate(filters.to)],
  ['توضیح تاریخ','تاریخ گزارش، تاریخ واقعی فعالیت است؛ برای کار بدون گزارش، تاریخ برنامه‌ریزی‌شده ثبت می‌شود.'],
  ['تفکیک دقیقه','ساعت درخواستی و برآوردی هرگز معادل ساعت تأییدشده نیستند.'],
  ['اعتبار جمع','جمع ساعت‌های تأییدشده فقط از گزارش‌هایی با وضعیت «تأییدشده» محاسبه می‌شود.'],
  ['دامنه مقایسه','این خروجی ممکن است با آمار تمام‌دوره سرور یا سهمیه نیمسال تفاوت داشته باشد؛ این اعداد نباید به‌جای هم استفاده شوند.'],
  ['برآورد وظیفه','برآورد برای هر وظیفه تعریف می‌شود و اگر چند گزارش داشته باشد در چند ردیف تکرار می‌شود؛ از جمع برآورد ردیف‌ها به‌عنوان جمع ساعات استفاده نکنید.'],
  ['مقادیر خالی','سلول خالی زمان تأییدشده به معنای صفر ساعت تأییدشده یا تصمیم منفی نیست.'],
 ]
}
// Raw column metadata supports precise Excel numeric formatting and tests.
export const MANAGER_HISTORY_COLUMNS=[
 ['نوع ردیف','kindLabel',25],['دانشجوکار','workerName',25],
 ['واحد انجام کار','unit',20],['عنوان کار','taskTitle',40],
 ['تاریخ فعالیت / برنامه','dateText',23],
 ['برآورد هر وظیفه (دقیقه؛ ممکن است تکرار شود)','estimateMinutes',28],
 ['زمان درخواستی (دقیقه)','requestedMinutes',23],
 ['زمان تأییدشده (دقیقه)','approvedMinutes',23],
 ['وضعیت گزارش','status',23],['علت زمان اضافه','extraReason',27],
 ['توضیح زمان اضافه','extraText',38],['توضیح دانشجوکار','workerNote',38],
 ['توضیح تصمیم مدیر','reviewNote',38],
 ['شناسه وظیفه','taskId',37],['شناسه گزارش','reportId',37],
]
export function managerHistoryExcelRows(projection){
 return projection.records.map(row=>({
  kindLabel:row.kind==='unreported'?'کار بدون گزارش':row.kind==='orphan'?'گزارش با کار نامشخص':'گزارش فعالیت',
  workerName:safeExcelText(row.workerName),
  unit:safeExcelText(row.unit),taskTitle:safeExcelText(row.taskTitle),
  dateText:safeExcelText(row.dateText),
  estimateMinutes:row.estimateMinutes,
  requestedMinutes:row.requestedMinutes,
  approvedMinutes:row.approvedMinutes,
  status:safeExcelText(row.status),
  extraReason:safeExcelText(row.extraReason),
  extraText:safeExcelText(row.extraText),
  workerNote:safeExcelText(row.workerNote),
  reviewNote:safeExcelText(row.reviewNote),
  taskId:safeExcelText(row.taskId),reportId:safeExcelText(row.reportId),
 }))
}
