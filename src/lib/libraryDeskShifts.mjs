// SWTB17 manager-facing projections only. The authoritative 2-seat decision is
// performed transactionally by PostgreSQL, never by this UI preview.
export const clockMinute=value=>{
 if(typeof value!=='string'||!/^\d{2}:\d{2}$/.test(value))return null
 const [hour,minute]=value.split(':').map(Number)
 if(hour===24&&minute===0)return 1440
 if(hour<0||hour>23||minute<0||minute>59)return null
 return hour*60+minute
}
export const minuteClock=minute=>{
 if(!Number.isInteger(minute)||minute<0||minute>1440)return '—'
 return String(Math.floor(minute/60)).padStart(2,'0')+':'+
   String(minute%60).padStart(2,'0')
}
export const deskInterval=(start,end)=>{
 const a=clockMinute(start),b=clockMinute(end)
 return a===null||b===null||a>=b||a>1439?null:{startMinute:a,endMinute:b,minutes:b-a}
}
const intersects=(aStart,aEnd,bStart,bEnd)=>aStart<bEnd&&aEnd>bStart
const overlap=(a,b)=>a.start_minute<b.end_minute&&a.end_minute>b.start_minute

export const projectDeskCoverage=(rows,workerIds,startMinute,endMinute)=>{
 if(!Array.isArray(rows)||!Number.isInteger(startMinute)||
   !Number.isInteger(endMinute)||startMinute>=endMinute)
   return {valid:false,maxOccupied:0,available:0,workerOverlap:false,allowed:false}
 const active=rows.filter(x=>x?.state==='scheduled'&&
  Number.isInteger(x.start_minute)&&Number.isInteger(x.end_minute)&&
  x.start_minute<x.end_minute&&intersects(x.start_minute,x.end_minute,startMinute,endMinute))
 const boundary=[startMinute,endMinute]
 for(const x of active)boundary.push(
   Math.max(startMinute,x.start_minute),Math.min(endMinute,x.end_minute))
 const ordered=[...new Set(boundary)].sort((a,b)=>a-b)
 let maxOccupied=0
 for(let i=0;i<ordered.length-1;i++){
  const point=ordered[i]
  if(ordered[i+1]<=point)continue
  const count=active.filter(x=>x.start_minute<=point&&x.end_minute>point).length
  if(count>maxOccupied)maxOccupied=count
 }
 const count=workerIds.length
 const workerOverlap=active.some(x=>workerIds.includes(x.worker_id))
 const valid=count>0&&count<=2&&new Set(workerIds).size===count
 return {valid,maxOccupied,available:Math.max(0,2-maxOccupied),workerOverlap,
  allowed:valid&&!workerOverlap&&maxOccupied+count<=2}
}
export const visibleDeskShifts=(rows)=>Array.isArray(rows)?
 rows.filter(x=>x&&x.state==='scheduled'&&
 Number.isInteger(x.start_minute)&&Number.isInteger(x.end_minute))
 .slice().sort((a,b)=>a.start_minute-b.start_minute||a.end_minute-b.end_minute):[]
