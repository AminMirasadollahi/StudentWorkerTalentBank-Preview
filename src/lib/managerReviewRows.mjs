// Pure read-only projection of ALREADY manager-authorized review rows.
// Never treats a pending request as approved time, membership or access.
export function managerReviewItems({
 timeEntries=[],profileChanges=[],presenceChanges=[],workers=[],tasks=[],formatDate=v=>v||'—',
 formatUnit=v=>v||'نامشخص',mode='all',
}={}){
 const byWorker=new Map(workers.map(w=>[w.id,w]))
 const byTask=new Map(tasks.map(t=>[t.id,t]))
 const profiles=['time','presence'].includes(mode)?[]:profileChanges
  .filter(r=>r.review_state==='pending')
  .map(request=>{
   const worker=byWorker.get(request.worker_id)
   const name=worker?.name||'دانشجوکار'
   return {
    key:'profile:'+request.id,kind:'profile',request,worker,
    workerId:request.worker_id,activityUnit:'not_applicable',submittedAt:request.created_at,
    title:name+' · درخواست اصلاح '+(request.field_code==='major'?'رشته':'نام'),
    subtitle:'مقدار پیشنهادی: '+(request.proposed_value||'—'),
    badge:'اصلاح مشخصات',alert:false,
   }
  })
 const reports=['profile','presence'].includes(mode)?[]:timeEntries
  .filter(entry=>entry.review_state==='submitted')
  .map(entry=>{
   const task=byTask.get(entry.task_id)
   const worker=byWorker.get(entry.worker_id)
   const reported=Number(entry.reported_minutes)
   const standard=Number(task?.estimate_minutes??entry.reported_minutes)
   const missing=!task
   const extra=!missing&&Number.isFinite(reported)&&reported>standard
   return {
    key:'time:'+entry.id,kind:'time',entry,task,worker,
    workerId:entry.worker_id,activityUnit:task?.unit||'unknown',submittedAt:entry.submitted_at,
    title:task?.title||'کار مرتبط نامشخص',
    subtitle:(worker?.name||'—')+' · '+formatUnit(task?.unit)+
      ' · '+formatDate(entry.work_date),
    badge:missing?'کار نامشخص':extra?'زمان اضافه':'گزارش ساعت',
    alert:missing||extra,
   }
  })
 const presences=['time','profile'].includes(mode)?[]:presenceChanges
  .filter(request=>request.status==='pending')
  .map(request=>{
   const worker=byWorker.get(request.worker_id)
   const kind=request.action==='inherit_weekly'?'بازگشت به برنامه ثابت':
     request.kind==='unavailable'?'عدم حضور':'تغییر ساعت حضور'
   return {
    key:'presence:'+request.id,kind:'presence',request,worker,
    workerId:request.worker_id,activityUnit:'not_applicable',submittedAt:request.requested_at,
    title:(worker?.name||'دانشجوکار')+' · '+kind,
    subtitle:'تاریخ درخواست: '+formatDate(request.local_date),
    badge:'تغییر برنامه حضور',alert:false,
   }
  })
 return [...profiles,...reports,...presences]
}

export const EMPTY_MANAGER_INBOX_FILTERS=Object.freeze({kind:'all',workerId:'',unit:'',from:'',to:'',order:'oldest'})
const localDayFormat=new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Tehran',calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',
})
const submissionMs=item=>{
 const v=item?.submittedAt
 // Do not mistake scheduled/work dates or zone-less times for submission timestamps.
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(v))return null
 const n=Date.parse(v)
 return Number.isFinite(n)?n:null
}
export function managerReviewSubmissionDay(item){
 const ms=submissionMs(item)
 if(ms===null)return ''
 const p=Object.fromEntries(localDayFormat.formatToParts(new Date(ms)).map(x=>[x.type,x.value]))
 return p.year+'-'+p.month+'-'+p.day
}
export function filterManagerInbox(items,filters=EMPTY_MANAGER_INBOX_FILTERS){
 const {kind='all',workerId='',unit='',from='',to='',order='oldest'}=filters
 if(from&&to&&from>to)return []
 return items.filter(item=>{
  if(kind!=='all'&&item.kind!==kind)return false
  if(workerId&&item.workerId!==workerId)return false
  if(unit&&item.activityUnit!==unit)return false
  if(from||to){
   const day=managerReviewSubmissionDay(item)
   if(!day||(from&&day<from)||(to&&day>to))return false
  }
  return true
 }).sort((a,b)=>{
  const left=submissionMs(a),right=submissionMs(b)
  // Missing timestamps stay last for both orders; deterministic tie-breaker.
  if(left===null&&right!==null)return 1
  if(right===null&&left!==null)return -1
  return (left===null?0:(order==='newest'?right-left:left-right))||
    String(a.key).localeCompare(String(b.key),'en')
 })
}
