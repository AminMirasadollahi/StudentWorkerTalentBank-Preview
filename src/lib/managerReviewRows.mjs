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
    title:(worker?.name||'دانشجوکار')+' · '+kind,
    subtitle:'تاریخ درخواست: '+formatDate(request.local_date),
    badge:'تغییر برنامه حضور',alert:false,
   }
  })
 return [...profiles,...reports,...presences]
}
