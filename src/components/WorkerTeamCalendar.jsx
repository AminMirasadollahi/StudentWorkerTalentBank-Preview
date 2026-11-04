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

export default function WorkerTeamCalendar({todayIso,refreshRevision=0}){
 const [range,setRange]=useState(null)
 const [revision,setRevision]=useState(0)
 const [snapshot,setSnapshot]=useState({status:'idle',data:EMPTY})
 const sequence=useRef(0)
 const onVisibleRangeChange=useCallback(next=>{
  setRange(prev=>equals(prev,next)?prev:next)
 },[])
 useEffect(()=>{
  if(!range)return
  let alive=true
  const index=++sequence.current
  setSnapshot({status:'loading',data:EMPTY})
  let windows
  try{windows=teamCalendarRequestWindows(range)}
  catch{
   setSnapshot({status:'error',data:EMPTY})
   return ()=>{alive=false}
  }
  Promise.all(windows.map(window=>
   getWorkerTeamCalendar(window).then(data=>limitedResponse(data,window))
  )).then(all=>{
   if(!alive||sequence.current!==index)return
   setSnapshot({status:'ready',data:mergeWorkerTeamCalendar(all)})
  }).catch(()=>{
   if(!alive||sequence.current!==index)return
   // Never show previously fetched coworkers after a failed reauth/network read.
   setSnapshot({status:'error',data:EMPTY})
  })
  return ()=>{alive=false}
 },[range,refreshRevision,revision])
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
       onClick={()=>setRevision(v=>v+1)}>تلاش مجدد</button>
   </div>}
   {(snapshot.status==='ready'||snapshot.status==='loading'||snapshot.status==='idle')&&
      <TeamScheduleOverview data={snapshot.data} todayIso={todayIso}
        audience="worker" onVisibleRangeChange={onVisibleRangeChange}/>}
 </div>
}
