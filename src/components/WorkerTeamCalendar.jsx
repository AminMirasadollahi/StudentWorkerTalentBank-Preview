import {useCallback,useEffect,useRef,useState} from 'react'
import TeamScheduleOverview from './TeamScheduleOverview'
import {getWorkerTeamCalendar} from '../lib/operationsV2'
import {plusIsoDays} from '../lib/persianMonthCalendar.mjs'

const EMPTY={workers:[],weekly_slots:[],exceptions:[],tasks:[]}
const equals=(a,b)=>a&&b&&Object.keys(a).every(k=>a[k]===b[k])
const minDate=(a,b)=>a<b?a:b
const maxDate=(a,b)=>a>b?a:b

// Month requests are at most 31 days, week requests 7 days. Request only
// non-overlapping extra days: identical tasks have no peer-visible task ID,
// so overlapping responses must never be concatenated and double-counted.
export function teamCalendarRequestWindows(range){
 const {weekStart,weekEnd,monthStart,monthEnd}=range||{}
 if(![weekStart,weekEnd,monthStart,monthEnd].every(x=>
   typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x))
    ||weekStart>weekEnd||monthStart>monthEnd)
   throw Error('invalid_team_calendar_window')
 const windows=[{from:monthStart,to:monthEnd}]
 if(weekStart<monthStart){
  const to=minDate(weekEnd,plusIsoDays(monthStart,-1))
  if(weekStart<=to)windows.push({from:weekStart,to})
 }
 if(weekEnd>monthEnd){
  const from=maxDate(weekStart,plusIsoDays(monthEnd,1))
  if(from<=weekEnd)windows.push({from,to:weekEnd})
 }
 return windows
}

function limitedResponse(data,{from,to}){
 if(!data||data.ok!==true||data.scope!=='coworker_summary_only'
   ||data.start_date!==from||data.end_date!==to
   ||!Array.isArray(data.workers)||!Array.isArray(data.weekly_slots)
   ||!Array.isArray(data.exceptions)||!Array.isArray(data.tasks))
   throw Error('team_calendar_response_untrusted')
 // Always whitelist shape locally as defence against accidental additions.
 // The DB remains the authoritative access-control boundary.
 const workers=data.workers.map(w=>{
  if(typeof w?.id!=='string'||typeof w?.name!=='string'||w.state!=='active')
   throw Error('team_calendar_invalid_worker')
  return {id:w.id,name:w.name,unit:String(w.unit||''),state:'active'}
 })
 const weekly_slots=data.weekly_slots.map(s=>({
  worker_id:s.worker_id,weekday_iso:s.weekday_iso,
  start_minute:s.start_minute,end_minute:s.end_minute,
  valid_from:s.valid_from,valid_until:s.valid_until,
 }))
 const exceptions=data.exceptions.map(e=>({
  worker_id:e.worker_id,local_date:e.local_date,kind:e.kind,
  intervals:e.kind==='replacement_intervals'&&Array.isArray(e.intervals)
   ?e.intervals.map(x=>({start:x.start,end:x.end})) : [],
 }))
 const tasks=data.tasks.map(t=>{
  if(t?.title!=='فعالیت ثبت‌شده'||t.state!=='scheduled')
   throw Error('team_calendar_unpublished_task')
  return {
   worker_id:t.worker_id,planned_date:t.planned_date,
   unit:t.unit,title:'فعالیت ثبت‌شده',state:'scheduled',
  }
 })
 return {workers,weekly_slots,exceptions,tasks}
}
export function mergeWorkerTeamCalendar(results){
 if(!Array.isArray(results)||results.length===0)throw Error('missing_calendar_responses')
 const roster=results[0].workers
 const rosterKeys=items=>items.map(w=>w.id).sort().join('|')
 const ids=rosterKeys(roster)
 if(results.some(r=>rosterKeys(r.workers)!==ids))
   throw Error('team_roster_changed_during_fetch')
 const weekly=new Map()
 const exceptions=[]
 const tasks=[]
 for(const result of results){
  for(const s of result.weekly_slots){
   const key=[s.worker_id,s.weekday_iso,s.start_minute,s.end_minute,
    s.valid_from,s.valid_until||''].join('|')
   weekly.set(key,s)
  }
  exceptions.push(...result.exceptions)
  tasks.push(...result.tasks)
 }
 return {workers:roster,weekly_slots:[...weekly.values()],exceptions,tasks}
}

// Single source of truth for the server's role-scoped coworker calendar.
// The new unified self editor and the historical read-only calendar both use
// this validated, fail-closed hook. No request is sent while disabled.
export function useWorkerTeamCalendarSnapshot({
 range,enabled=true,refreshRevision=0,ownerKey='legacy-team-page',
}){
 const [revision,setRevision]=useState(0)
 const [snapshot,setSnapshot]=useState({key:null,status:'idle',data:EMPTY})
 const sequence=useRef(0)
 const rangeKey=[range?.weekStart,range?.weekEnd,range?.monthStart,range?.monthEnd].join('|')
 const key=[ownerKey,rangeKey,refreshRevision,revision].join('|')
 useEffect(()=>{
  if(!enabled||!range){
   ++sequence.current
   setSnapshot({key:null,status:'idle',data:EMPTY})
   return
  }
  let alive=true
  const index=++sequence.current
  setSnapshot({key,status:'loading',data:EMPTY})
  let windows
  try{windows=teamCalendarRequestWindows(range)}
  catch{
   setSnapshot({key,status:'error',data:EMPTY})
   return ()=>{alive=false}
  }
  Promise.all(windows.map(window=>
   getWorkerTeamCalendar(window).then(data=>limitedResponse(data,window))
  )).then(all=>{
   if(!alive||sequence.current!==index)return
   setSnapshot({key,status:'ready',data:mergeWorkerTeamCalendar(all)})
  }).catch(()=>{
   if(!alive||sequence.current!==index)return
   // Clear previously fetched coworkers on auth/network failure; do not
   // display obsolete data from another worker, month or credentials.
   setSnapshot({key,status:'error',data:EMPTY})
  })
  return ()=>{alive=false}
 },[enabled,rangeKey,key])
 const retry=useCallback(()=>setRevision(r=>r+1),[])
 if(!enabled||!range)return {status:'idle',data:EMPTY,retry}
 return snapshot.key===key
  ?{status:snapshot.status,data:snapshot.data,retry}
  :{status:'loading',data:EMPTY,retry}
}

export default function WorkerTeamCalendar({todayIso,refreshRevision=0}){
 const [range,setRange]=useState(null)
 const onVisibleRangeChange=useCallback(next=>{
  setRange(prev=>equals(prev,next)?prev:next)
 },[])
 const snapshot=useWorkerTeamCalendarSnapshot({range,refreshRevision})
 return <div className="ow-worker-team-calendar" aria-label="برنامه همکاران ـ فقط مشاهده">
   <div className="ow-worker-team-calendar-notice">
     <strong>برنامه همکاران · فقط مشاهده</strong>
     <p>ساعت‌های نمایش‌داده‌شده برنامه‌ریزی‌شده‌اند، نه حضور قطعی یا ساعت تأییدشده.
       عنوان اختصاصی وظایف دیگران فعلاً نمایش داده نمی‌شود؛ تعداد و واحد مربوط به کارها قابل مشاهده است.</p>
   </div>
   {(snapshot.status==='loading'||snapshot.status==='idle')&&
      <p className="ow-muted" role="status">در حال دریافت امن برنامه همکاران…</p>}
   {snapshot.status==='error'&&<div className="report-alert report-alert--error" role="alert">
     <p>برنامه همکاران در دسترس نیست. اطلاعات قدیمی برای حفاظت از حریم خصوصی پنهان شدند.</p>
     <button type="button" className="report-btn report-btn--light"
       onClick={snapshot.retry}>تلاش مجدد</button>
   </div>}
   {(snapshot.status==='ready'||snapshot.status==='loading'||snapshot.status==='idle')&&
      <TeamScheduleOverview data={snapshot.data} todayIso={todayIso}
        audience="worker" onVisibleRangeChange={onVisibleRangeChange}/>}
 </div>
}
