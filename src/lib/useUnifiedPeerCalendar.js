import {useCallback,useEffect,useRef,useState} from 'react'
import {plusIsoDays} from './persianMonthCalendar.mjs'

const EMPTY={workers:[],weekly_slots:[],exceptions:[],tasks:[]}
const earlier=(a,b)=>a<b?a:b
const later=(a,b)=>a>b?a:b

// Fetch one Persian month + disjoint extra days of the displayed week.
// Public peer tasks contain no usable IDs: never merge overlapping windows.
export function unifiedPeerRequestWindows(range){
 const {weekStart,weekEnd,monthStart,monthEnd}=range||{}
 if(![weekStart,weekEnd,monthStart,monthEnd].every(x=>
  typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x))
  ||weekStart>weekEnd||monthStart>monthEnd)
   throw Error('invalid_unified_peer_calendar_window')
 const windows=[{from:monthStart,to:monthEnd}]
 if(weekStart<monthStart){
  const to=earlier(weekEnd,plusIsoDays(monthStart,-1))
  if(weekStart<=to)windows.push({from:weekStart,to})
 }
 if(weekEnd>monthEnd){
  const from=later(weekStart,plusIsoDays(monthEnd,1))
  if(from<=weekEnd)windows.push({from,to:weekEnd})
 }
 return windows
}

// An explicit client whitelist complements (never replaces) server RLS/RPC.
export function sanitizeUnifiedPeerResponse(raw,{from,to}){
 if(!raw||raw.ok!==true||raw.scope!=='coworker_summary_only'
  ||raw.start_date!==from||raw.end_date!==to
  ||!Array.isArray(raw.workers)||!Array.isArray(raw.weekly_slots)
  ||!Array.isArray(raw.exceptions)||!Array.isArray(raw.tasks))
   throw Error('untrusted_unified_peer_response')
 const workers=raw.workers.map(w=>{
  if(typeof w?.id!=='string'||typeof w?.name!=='string'||w.state!=='active')
   throw Error('invalid_unified_peer_worker')
  return {id:w.id,name:w.name,unit:String(w.unit||''),state:'active'}
 })
 const weekly_slots=raw.weekly_slots.map(s=>({
  worker_id:s.worker_id,weekday_iso:s.weekday_iso,start_minute:s.start_minute,
  end_minute:s.end_minute,valid_from:s.valid_from,valid_until:s.valid_until,
 }))
 const exceptions=raw.exceptions.map(e=>({
  worker_id:e.worker_id,local_date:e.local_date,kind:e.kind,
  intervals:e.kind==='replacement_intervals'&&Array.isArray(e.intervals)
   ?e.intervals.map(v=>({start:v.start,end:v.end})):[],
 }))
 const tasks=raw.tasks.map(t=>{
  if(t?.title!=='فعالیت ثبت‌شده'||t.state!=='scheduled')
   throw Error('untrusted_unified_peer_task')
  return {worker_id:t.worker_id,planned_date:t.planned_date,
   unit:t.unit,title:'فعالیت ثبت‌شده',state:'scheduled'}
 })
 return {workers,weekly_slots,exceptions,tasks}
}
export function mergeUnifiedPeerWindows(parts){
 if(!Array.isArray(parts)||!parts.length)throw Error('empty_unified_peer_window')
 const roster=parts[0].workers
 const rosterKey=rows=>rows.map(r=>r.id).sort().join('|')
 if(parts.some(part=>rosterKey(part.workers)!==rosterKey(roster)))
  throw Error('unified_peer_roster_changed')
 const slots=new Map(),tasks=[],exceptions=[]
 for(const part of parts){
  for(const slot of part.weekly_slots){
   const key=[slot.worker_id,slot.weekday_iso,slot.start_minute,
    slot.end_minute,slot.valid_from,slot.valid_until||''].join('|')
   slots.set(key,slot)
  }
  tasks.push(...part.tasks)
  exceptions.push(...part.exceptions)
 }
 return {workers:roster,weekly_slots:[...slots.values()],exceptions,tasks}
}

// No peer RPC when disabled; no stale principal/range snapshot on a rerender.
// Fetcher is dependency-injected from the existing worker scope client to
// avoid importing manager calendars into the main worker/manager shell.
export function useUnifiedPeerCalendar({
 enabled=false,range=null,workerId,refreshRevision=0,fetcher,
}){
 const [retryRevision,setRetryRevision]=useState(0)
 const [snapshot,setSnapshot]=useState({key:null,status:'idle',data:EMPTY})
 const currentRequest=useRef(0)
 const rangeKey=[range?.weekStart,range?.weekEnd,
  range?.monthStart,range?.monthEnd].join('|')
 const key=[workerId,rangeKey,refreshRevision,retryRevision].join('|')
 useEffect(()=>{
  if(!enabled||!workerId||!range){
   currentRequest.current+=1
   setSnapshot({key:null,status:'idle',data:EMPTY})
   return
  }
  let alive=true
  const index=++currentRequest.current
  setSnapshot({key,status:'loading',data:EMPTY})
  async function load(){
   try{
    const windows=unifiedPeerRequestWindows(range)
    if(typeof fetcher!=='function')throw Error('peer_fetcher_not_available')
    const replies=await Promise.all(windows.map(async window=>
     sanitizeUnifiedPeerResponse(await fetcher(window),window)))
    if(!alive||currentRequest.current!==index)return
    setSnapshot({key,status:'ready',data:mergeUnifiedPeerWindows(replies)})
   }catch{
    if(!alive||currentRequest.current!==index)return
    setSnapshot({key,status:'error',data:EMPTY})
   }
  }
  void load()
  return ()=>{alive=false}
 },[enabled,workerId,rangeKey,key,fetcher])
 const retry=useCallback(()=>setRetryRevision(v=>v+1),[])
 if(!enabled||!workerId||!range)return {status:'idle',data:EMPTY,retry}
 return snapshot.key===key
  ?{status:snapshot.status,data:snapshot.data,retry}
  :{status:'loading',data:EMPTY,retry}
}
