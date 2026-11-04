// SWTB21-C: manager-only, read-only group calendar projection.
// Scheduled availability != confirmed attendance != approved work minutes.
// The authenticated manager's existing server response is the ONLY input here.
// Do not pass this whole admin response to a worker browser.
import {projectDayPresence} from './presenceDayProjection.mjs'
import {validIsoDay} from './assignmentCapacity.mjs'

const statuses=new Set(['assigned','in_progress','submitted','needs_changes','completed','scheduled'])
const natural=(a,b)=>a.localeCompare(b,'fa')
const isActive=w=>w&&w.state==='active'&&typeof w.id==='string'
const taskForDay=(task,date)=>task?.planned_date===date
  &&task.state!=='cancelled'&&typeof task.worker_id==='string'

export function projectTeamDay(data,date,{unit=null}={}){
 if(!validIsoDay(date))throw new Error('invalid_team_calendar_day')
 const workers=(Array.isArray(data?.workers)?data.workers:[])
  .filter(isActive)
  .filter(w=>!unit||w.unit===unit||w.unit_code===unit)
 const tasks=(Array.isArray(data?.tasks)?data.tasks:[])
  .filter(t=>taskForDay(t,date))
 const people=workers.map(worker=>{
  const presence=projectDayPresence(data,worker.id,date)
  const assigned=tasks.filter(t=>t.worker_id===worker.id).map(t=>({
   id:t.id,title:String(t.title||'کار بدون عنوان'),
   state:statuses.has(t.state)?t.state:'unknown',
   unit:t.unit||t.unit_code||'',
   estimate_minutes:Number.isFinite(Number(t.estimate_minutes))
     ?Number(t.estimate_minutes):null,
  }))
  return {
   workerId:worker.id,
   name:String(worker.name||'دانشجوکار'),
   unit:worker.unit||worker.unit_code||'',
   kind:presence.kind,
   windows:presence.windows,
   minutes:presence.minutes,
   tasks:assigned,
   hasPlan:presence.windows.length>0,
   hasTask:assigned.length>0,
  }
 }).sort((a,b)=>{
  // People with work plans or assignments first; unknown capacity is not absence.
  const priority=x=>x.hasTask||x.hasPlan?0:x.kind==='unavailable'?1:2
  return priority(a)-priority(b)||natural(a.name,b.name)
 })
 return {
  date,
  people,
  workerCount:workers.length,
  plannedWorkers:people.filter(p=>p.hasPlan).length,
  assignedWorkers:people.filter(p=>p.hasTask).length,
  taskCount:people.reduce((n,p)=>n+p.tasks.length,0),
  explicitlyUnavailable:people.filter(p=>p.kind==='unavailable').length,
  unknownWorkers:people.filter(p=>p.kind==='unknown').length,
 }
}

export function projectTeamCalendarDays(data,days,{unit=null}={}){
 if(!Array.isArray(days)||days.length>42)throw new Error('invalid_calendar_range')
 return days.filter(Boolean).map(day=>projectTeamDay(data,day.date||day,{unit}))
}
