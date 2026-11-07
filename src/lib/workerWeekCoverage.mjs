// Worker-only compact weekly time coverage. Input MUST be the scoped
// coworker_summary_only projection, never the manager's full RPC payload.
// Do not copy task titles, worker contact information or private report fields.
const MAX_VISIBLE_PEOPLE=6
const firstTime=person=>person.windows?.[0]?.start||'99:99'
const persianCompare=(a,b)=>a.localeCompare(b,'fa')

export function projectWorkerWeekCoverage(day,{limit=MAX_VISIBLE_PEOPLE}={}) {
 if(!day||!Array.isArray(day.people))throw Error('invalid_worker_week_day')
 // A task can exist without a declared availability window. Keep that
 // distinction visible: assignments never establish hours or attendance.
 const scheduled=day.people.filter(p=>p.hasPlan&&p.windows?.length)
  .sort((a,b)=>firstTime(a).localeCompare(firstTime(b))
   ||persianCompare(a.name,b.name))
 const taskOnly=day.people.filter(p=>!p.hasPlan&&p.hasTask)
  .sort((a,b)=>persianCompare(a.name,b.name))
 const candidates=[...scheduled,...taskOnly]
 const capped=Math.max(0,Math.min(6,Number.isInteger(limit)?limit:MAX_VISIBLE_PEOPLE))
 return {
  entries:candidates.slice(0,capped).map(p=>({
   workerId:p.workerId,
   name:p.name,
   // React renders only validated, pre-projected effective weekly/date
   // intervals. Never expose any private task metadata.
   windows:p.hasPlan?p.windows.map(w=>({start:w.start,end:w.end})):[],
   corrected:p.kind==='replacement',
   assignedCount:p.tasks?.length||0,
   explicitlyUnavailable:p.kind==='unavailable',
   scheduleUnknown:!p.hasPlan&&p.kind!=='unavailable',
  })),
  remaining:candidates.length-Math.min(capped,candidates.length),
  planned:scheduled.length,
  taskWithoutPlan:taskOnly.length,
  explicitlyUnavailable:day.explicitlyUnavailable||0,
  unknown:day.unknownWorkers||0,
 }
}
