import {projectTeamDay} from './teamCalendarProjection.mjs'
import {clockToMinutes,minutesToClock} from './weeklyScheduleGrid.mjs'

// Stable decorative tone assigned only from a whitelisted worker id.
// Never encode privilege, performance, attendance or review state as color.
// Same peer uses the same visual tone across days/weeks (collisions possible).
export function peerToneIndex(workerId){
 const chars=String(workerId||'')
 let hash=2166136261
 for(const char of chars){
  hash=Math.imul(hash^char.codePointAt(0),16777619)
 }
 return (hash>>>0)%6
}

// Every source must first pass the coworker_summary_only RPC whitelist.
// Exclude the signed-in worker: their own editable calendar is the authority.
export function projectUnifiedPeerDay(data,date,selfWorkerId){
 const safe={...data,workers:(data?.workers||[])
  .filter(w=>w.id!==selfWorkerId)}
 const day=projectTeamDay(safe,date)
 const peers=day.people.map(p=>({
  workerId:p.workerId,name:p.name,kind:p.kind,
  // Do not return contact data, report notes, original task titles or IDs.
  windows:p.windows.map(w=>({start:w.start,end:w.end})),
  assignedCount:p.tasks.length,
 }))
 return {
  date,peers,
  plannedCount:peers.filter(p=>p.windows.length>0).length,
  unavailableCount:peers.filter(p=>p.kind==='unavailable').length,
  taskWithoutPlanCount:peers.filter(p=>p.assignedCount>0&&!p.windows.length).length,
 }
}

export function sharedPeerClockScale(days){
 const windows=days.flatMap(day=>day.peers.flatMap(p=>p.windows))
 const ranges=windows.map(w=>({
  start:clockToMinutes(w.start),end:clockToMinutes(w.end,{end:true}),
 })).filter(r=>Number.isInteger(r.start)&&Number.isInteger(r.end)
  &&r.start>=0&&r.end<=1440&&r.end>r.start)
 // A single, comparable actual-clock scale for the displayed seven-day week.
 // The empty-week fallback is explicit; never cut off 20:00 or 24:00.
 let start=ranges.length?Math.floor(Math.min(...ranges.map(r=>r.start))/60)*60:480
 let end=ranges.length?Math.ceil(Math.max(...ranges.map(r=>r.end))/60)*60:960
 if(end-start<120){start=Math.max(0,start-60);end=Math.min(1440,start+180)}
 const step=end-start<=480?60:end-start<=840?120:180
 const ticks=[]
 for(let m=start;m<=end;m+=step)ticks.push(m)
 if(ticks[ticks.length-1]!==end)ticks.push(end)
 return {start,end,ticks,fallback:ranges.length===0}
}

// Closed interval boundaries do NOT overlap when one ends as another begins.
// A greedy earliest-free-lane algorithm minimizes lane count.
export function packPeerDayIntervals(day,{maxLanes=2}={}){
 const intervals=day.peers.flatMap(p=>p.windows.map(w=>({
  workerId:p.workerId,name:p.name,start:clockToMinutes(w.start),
  end:clockToMinutes(w.end,{end:true}),
 }))).filter(w=>Number.isInteger(w.start)&&Number.isInteger(w.end)
  &&w.start>=0&&w.end<=1440&&w.end>w.start)
  .sort((a,b)=>a.start-b.start||a.end-b.end||a.name.localeCompare(b.name,'fa'))
 const lanes=[],last=[]
 for(const item of intervals){
  let index=last.findIndex(x=>x<=item.start)
  if(index<0){index=last.length;lanes.push([]);last.push(item.end)}
  else last[index]=item.end
  lanes[index].push(item)
 }
 const cap=Math.max(0,Math.min(2,Number.isInteger(maxLanes)?maxLanes:2))
 const visible=lanes.slice(0,cap)
 const hidden=lanes.slice(cap).flat()
 return {
  lanes:visible,
  totalLanes:lanes.length,
  hiddenIntervalCount:hidden.length,
  hiddenWorkerCount:new Set(hidden.map(p=>p.workerId)).size,
 }
}
export function labelPeerInterval(interval){
 return interval.name+'، '+minutesToClock(interval.start)+' تا '+minutesToClock(interval.end)
}
