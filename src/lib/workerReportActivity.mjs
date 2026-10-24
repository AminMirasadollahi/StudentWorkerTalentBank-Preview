/**
 * Read-only presentation of already scoped self time entries.
 * Every card represents one actual report snapshot, NOT invented review events.
 * work_date is the work date, never a fabricated submission/approval timestamp.
 */
export const WORKER_REPORT_VIEWS=['all','submitted','changes_requested','rejected','approved']
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
const sortableDate=v=>validDate(v)?v:'0000-00-00'
const validMinute=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null
export function projectWorkerReportActivity(records=[],tasks=[],view='all') {
 const items=Array.isArray(records)?records:[]
 const allowed=WORKER_REPORT_VIEWS.includes(view)?view:'all'
 const titles=new Map((Array.isArray(tasks)?tasks:[])
  .filter(t=>t&&t.id!=null).map(t=>[t.id,t.title||'گزارش کار']))
 return items.filter(e=>e&&e.id!=null&&(allowed==='all'||e.review_state===allowed))
  .map(e=>({
   id:e.id,
   task_id:e.task_id,
   title:titles.get(e.task_id)||'گزارش کار',
   work_date:validDate(e.work_date)?e.work_date:null,
   review_state:e.review_state||'unknown',
   reported_minutes:validMinute(e.reported_minutes),
   approved_minutes:e.review_state==='approved'?validMinute(e.approved_minutes):null,
   review_note:e.review_note||'',
   extra_time_reason_text:e.extra_time_reason_text||'',
  }))
  .sort((a,b)=>sortableDate(b.work_date).localeCompare(sortableDate(a.work_date))
    ||String(b.id).localeCompare(String(a.id)))
}

export function summarizeWorkerReportActivity(records=[]) {
 const items=Array.isArray(records)?records:[]
 const count=state=>items.filter(e=>e?.review_state===state).length
 return {
  all:items.length,
  submitted:count('submitted'),
  changes_requested:count('changes_requested'),
  rejected:count('rejected'),
  approved:count('approved'),
 }
}
