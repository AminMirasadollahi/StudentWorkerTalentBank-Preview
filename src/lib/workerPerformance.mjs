// SWTB12: self-only, read-only analytics on the ALREADY AUTHORIZED and
// potentially bounded worker-history rows. Never claim this is a full ledger.
import {persianDayParts} from './persianMonthCalendar.mjs'

const validDate = date => {
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false
 const value=new Date(date+'T12:00:00Z')
 return Number.isFinite(value.getTime())&&value.toISOString().slice(0,10)===date
}
const validMinutes = value => Number.isSafeInteger(value)&&value>=0
const monthName=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
 calendar:'persian',timeZone:'UTC',year:'numeric',month:'long',
})
const monthOf = date => {
 if(!validDate(date))return null
 const parts=persianDayParts(date)
 return {key:parts.year+'-'+String(parts.month).padStart(2,'0'),
  label:monthName.format(new Date(date+'T12:00:00Z'))}
}

// These filters apply to factual work_date, NEVER the approval date.
// ISO days are chosen with the Jalali UI; do not compare localized strings.
export function filterPerformanceByWorkDate(rows,from='',to=''){
 const invalidRange=(from&&!validDate(from))||(to&&!validDate(to))||
  (from&&to&&from>to)
 if(invalidRange)return {invalidRange:true,rows:[]}
 const result=(Array.isArray(rows)?rows:[]).filter(row=>
  (!from&&!to)||(validDate(row.work_date)&&
   (!from||row.work_date>=from)&&(!to||row.work_date<=to)))
 return {invalidRange:false,rows:result}
}

// Receives ONLY projectWorkerReportActivity-derived self rows, never raw
// manager/peer data. Distinct completed tasks are counted at task grain.
export function projectWorkerPerformance(rows=[],tasks=[]){
 const records=Array.isArray(rows)?rows:[]
 const taskById=new Map((Array.isArray(tasks)?tasks:[])
  .filter(t=>t?.id!=null).map(t=>[t.id,t]))
 const approved=records.filter(r=>r?.review_state==='approved')
 const missingApprovedCount=approved.filter(r=>!validMinutes(r.approved_minutes)).length
 const approvedMinutes=missingApprovedCount?null:
  approved.reduce((sum,r)=>sum+r.approved_minutes,0)
 const completedTaskIds=new Set(records.filter(r=>
  taskById.get(r?.task_id)?.state==='completed').map(r=>r.task_id))
 const missingTaskCount=records.filter(r=>!taskById.has(r?.task_id)).length
 const missingWorkDateCount=approved.filter(r=>!validDate(r?.work_date)).length
 const missingUnitCount=approved.filter(r=>!r?.unit).length
 const months=new Map(),units=new Map()
 // Charts require complete, comparable totals. Unknown minute rows are
 // not silently turned into 0, and incomplete unit/date joins remain flagged.
 if(approvedMinutes!==null)for(const row of approved){
  const month=monthOf(row.work_date)
  if(month){
   const current=months.get(month.key)
   months.set(month.key,{...month,minutes:(current?.minutes||0)+row.approved_minutes})
  }
  if(row.unit)units.set(row.unit,(units.get(row.unit)||0)+row.approved_minutes)
 }
 return {
  reportCount:records.length,
  approvedReportCount:approved.length,
  approvedMinutes,
  missingApprovedCount,
  pendingCount:records.filter(r=>r?.review_state==='submitted').length,
  changesRequestedCount:records.filter(r=>r?.review_state==='changes_requested').length,
  completedTaskCount:completedTaskIds.size,
  missingTaskCount,
  missingWorkDateCount,
  missingUnitCount,
  // Display charts only when >1 comparable non-zero category exists.
  byMonth:[...months.values()].sort((a,b)=>a.key.localeCompare(b.key)),
  byUnit:[...units.entries()].map(([unit,minutes])=>({unit,minutes}))
   .sort((a,b)=>b.minutes-a.minutes||a.unit.localeCompare(b.unit)),
 }
}
