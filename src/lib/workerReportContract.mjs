// R2 accepted read contract. UI validation supplements, never replaces, server authorization.
const iso=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x
const correctionStates=new Set(['changes_requested','rejected'])
export function workerReportContract(task){
 const c=task?.report_contract
 if(!c||!iso(c.date_min)||!iso(c.date_max)||typeof c.window_empty!=='boolean'
  ||c.window_empty!==(c.date_min>c.date_max)||!Number.isInteger(c.minimum_minutes)||!Number.isInteger(c.maximum_minutes)
  ||!Number.isInteger(c.standard_minutes)||c.minimum_minutes<1||c.minimum_minutes>c.standard_minutes
  ||c.standard_minutes>c.maximum_minutes||c.maximum_minutes>1440||c.standard_minutes!==Number(task.estimate_minutes)
  ||c.extra_reason_above_minutes!==c.standard_minutes)return null
 return c
}
export function workerCorrection(task){
 const r=task?.latest_report
 return r&&typeof r.id==='string'&&r.id&&correctionStates.has(r.review_state)?r:null
}
export function reportDateAllowed(c,date){return Boolean(c&&!c.window_empty&&iso(date)&&date>=c.date_min&&date<=c.date_max)}
export function initialWorkerReport(task,serverToday,attempt=null){
 const c=workerReportContract(task),prior=workerCorrection(task),standard=Number(task.estimate_minutes)
 if(attempt)return {date:attempt.date,minutes:attempt.minutes,note:attempt.note,reasonCode:attempt.extraReasonCode||'',reasonText:attempt.extraReasonText||'',custom:attempt.minutes!==standard}
 if(prior)return {date:iso(prior.work_date)?prior.work_date:'',minutes:prior.reported_minutes,note:prior.worker_note||'',reasonCode:prior.extra_time_reason_code||'',reasonText:prior.extra_time_reason_text||'',custom:prior.reported_minutes!==standard}
 return {date:reportDateAllowed(c,serverToday)?serverToday:'',minutes:standard,note:'',reasonCode:'',reasonText:'',custom:false}
}
export function reportInputAllowed(task,date,minutes,reasonCode,reasonText){
 const c=workerReportContract(task)
 if(!reportDateAllowed(c,date)||!Number.isInteger(minutes)||minutes<c.minimum_minutes||minutes>c.maximum_minutes)return false
 if(task.state==='needs_changes'&&!workerCorrection(task))return false
 return minutes<=c.standard_minutes||Boolean(reasonCode&&String(reasonText??'').trim().length>=10&&String(reasonText??'').trim().length<=600)
}
export function latestWorkerReport(task,records,version){
 if(version===1)return task?.latest_report||null
 return (records||[]).filter(r=>r.task_id===task?.id).sort((a,b)=>String(b.submitted_at||'').localeCompare(String(a.submitted_at||''))||String(b.id).localeCompare(String(a.id)))[0]||null
}
