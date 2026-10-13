// Read-only local scheduling advice; not an authorization or payroll rule.
// Dates are Gregorian ISO YYYY-MM-DD representing Asia/Tehran calendar days.
// Never infer zero availability from a missing timetable.
const dayRegex = /^\d{4}-\d{2}-\d{2}$/
export function validIsoDay(value) {
  if (typeof value !== 'string' || !dayRegex.test(value)) return false
  const d = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}
export function isoWeekday(date) {
  if (!validIsoDay(date)) return null
  return new Date(date + 'T00:00:00Z').getUTCDay() || 7
}
export function firstMatchingWeekday(fromDate, weekdayIso) {
  if(!validIsoDay(fromDate)||!Number.isInteger(weekdayIso)||
     weekdayIso<1||weekdayIso>7)return null
  const offset=(weekdayIso-isoWeekday(fromDate)+7)%7
  const d=new Date(fromDate+'T00:00:00Z')
  d.setUTCDate(d.getUTCDate()+offset)
  return d.toISOString().slice(0,10)
}
function validInterval(start, end) {
  return Number.isInteger(start) && Number.isInteger(end) &&
    start >= 0 && end <= 1440 && end > start
}
export function intervalsTotalMinutes(intervals) {
  if (!Array.isArray(intervals)) return null
  const clean = intervals.map(item => ({
    start: Number(item?.start ?? item?.start_minute),
    end: Number(item?.end ?? item?.end_minute),
  }))
  if (!clean.every(item => validInterval(item.start, item.end))) return null
  const ordered = clean.sort((a,b) => a.start-b.start)
  let total=0,lastEnd=0
  for(const item of ordered){
    // Overlap is invalid as both a server input and a projection assumption.
    if(item.start<lastEnd) return null
    total+=item.end-item.start
    lastEnd=item.end
  }
  return total
}
const positiveEstimate = task => {
  const num=Number(task?.estimate_minutes)
  return Number.isInteger(num) && num>=0 && num<=1440 ? num : null
}
export function assessAssignmentCapacity(data,{workerId,date,estimateMinutes=0}={}) {
  const invalid = reason => ({
    code:'unknown',reason,availableMinutes:null,assignedMinutes:null,
    proposedMinutes:null,remainingMinutes:null,exception:false,
  })
  if (!workerId || !validIsoDay(date)) return invalid('invalid_target')
  const estimate=Number(estimateMinutes)
  if(!Number.isInteger(estimate)||estimate<0||estimate>1440) return invalid('invalid_estimate')
  const tasks=(data?.tasks||[]).filter(task=>
    task.worker_id===workerId && task.planned_date===date && task.state!=='cancelled')
  const estimates=tasks.map(positiveEstimate)
  if(estimates.includes(null)) return invalid('invalid_existing_estimate')
  const assigned=estimates.reduce((n,value)=>n+value,0)
  const base={assignedMinutes:assigned,proposedMinutes:estimate,
    availableMinutes:null,remainingMinutes:null,exception:false}
  const exceptions=(data?.exceptions||[]).filter(e=>e.worker_id===workerId&&e.local_date===date)
  if(exceptions.length>1)return {...base,code:'unknown',reason:'duplicate_exception'}
  let capacity
  if(exceptions.length){
    const ex=exceptions[0]
    if(ex.kind==='unavailable'){
      if(Array.isArray(ex.intervals) && ex.intervals.length>0)
        return {...base,code:'unknown',reason:'invalid_exception'}
      capacity=0
    }else if(ex.kind==='replacement_intervals')capacity=intervalsTotalMinutes(ex.intervals)
    else return {...base,code:'unknown',reason:'invalid_exception'}
  }else{
    const slots=(data?.weekly_slots||[]).filter(slot=>
      slot.worker_id===workerId && Number(slot.weekday_iso)===isoWeekday(date) &&
      validIsoDay(slot.valid_from) && slot.valid_from<=date &&
      (!slot.valid_until || (validIsoDay(slot.valid_until)&&slot.valid_until>=date)))
    if(!slots.length)return {...base,code:'not_configured',reason:'no_weekly_schedule'}
    capacity=intervalsTotalMinutes(slots)
  }
  if(capacity===null)return {...base,code:'unknown',reason:'invalid_intervals'}
  const remaining=capacity-assigned-estimate
  let code='ok'
  if(capacity===0)code='unavailable'
  else if(remaining<0)code='overbooked'
  else if(capacity>0 && remaining===0)code='full'
  return {...base,code,reason:null,availableMinutes:capacity,
    remainingMinutes:remaining,exception:exceptions.length===1}
}

// Preview the effect of changing availability without doing a database write.
// Keep actual task assignments independent from saved weekly/exception editors.
export function assessAvailabilityOverride(data,workerId,date,intervals,{unavailable=false}={}) {
  if(!workerId||!validIsoDay(date))return {code:'invalid',allocatedMinutes:null,proposedCapacity:null}
  const capacity=unavailable?0:intervalsTotalMinutes(intervals)
  if(capacity===null)return {code:'invalid',allocatedMinutes:null,proposedCapacity:null}
  const tasks=(data?.tasks||[]).filter(t=>t.worker_id===workerId&&t.planned_date===date&&t.state!=='cancelled')
  const values=tasks.map(positiveEstimate)
  if(values.includes(null))return {code:'unknown',allocatedMinutes:null,proposedCapacity:capacity}
  const allocated=values.reduce((sum,v)=>sum+v,0)
  return {code:allocated>capacity?'conflict':'ok',allocatedMinutes:allocated,proposedCapacity:capacity}
}
