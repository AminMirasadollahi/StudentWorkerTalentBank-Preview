// SWTB18 accounting projection -- pure helpers, independent of network or UI.
export const faMinutes = value=>{
 if(value===null||value===undefined)return '—'
 const n=Number(value)
 if(!Number.isSafeInteger(n))return '—'
 const abs=Math.abs(n)
 const hrs=Math.floor(abs/60),mins=abs%60
 const fmt=new Intl.NumberFormat('fa-IR')
 const detail=[hrs?fmt.format(hrs)+' ساعت':'',mins?fmt.format(mins)+' دقیقه':''].filter(Boolean).join(' و ')
 return (n<0?'−':'')+(detail||'۰ دقیقه')
}
export const fromHourMinuteInputs=(hours,minutes='0')=>{
 const h=Number(hours),m=Number(minutes)
 if(hours===''||minutes===''||!Number.isSafeInteger(h)||!Number.isSafeInteger(m)||
    h<0||m<0||m>59||h*60+m>2000000)return null
 return h*60+m
}
export const toHourMinuteInputs=total=>{
 if(total===null||total===undefined)return {hours:'',minutes:'0'}
 const value=Number(total)
 if(!Number.isSafeInteger(value)||value<0)return {hours:'',minutes:'0'}
 return {hours:String(Math.floor(value/60)),minutes:String(value%60)}
}
export const termTotals=(units=[],isWorkerSlice=false)=>{
 let approved=0,pending=0,planned=0,allocated=0
 let allAllocated=true
 for(const u of units){
  approved+=Number(u.approved_minutes)||0
  pending+=Number(u.pending_minutes)||0
  planned+=Number(u.unreported_estimate_minutes)||0
  if(u.allocated_minutes===null||u.allocated_minutes===undefined)allAllocated=false
  else allocated+=Number(u.allocated_minutes)||0
 }
 return {approved,pending,planned,allocated:allAllocated&&!isWorkerSlice?allocated:null,
  remaining:allAllocated&&!isWorkerSlice?allocated-approved:null,
  allocationPartial:!allAllocated}
}
export const allocationRatio=(approved,allocation)=>{
 if(allocation===null||allocation===undefined||Number(allocation)<=0)return null
 return Math.min(100,Math.max(0,Math.round(100*Number(approved)/Number(allocation))))
}
export const weekRows=(weeks=[])=>{
 const map=new Map()
 for(const w of weeks){
  const week=w.week_start||''
  if(!/^\d{4}-\d{2}-\d{2}$/.test(week))continue
  map.set(week,(map.get(week)||0)+(Number(w.approved_minutes)||0))
 }
 return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,minutes])=>({date,minutes}))
}

/** Topline remains deliberately unknown for partial unit/person slicers.
 * Pooled allocations count ONCE, no matter how many member work units exist.
 * Stand-alone quotas count only for units that are not pooled. */
export const poolTermTotals=(unitRows=[],pools=[],{workerSlice=false,unitFilter=false}={})=>{
 const usage=termTotals(unitRows,workerSlice)
 const pooledUnits=new Set(pools.flatMap(p=>p.units||[]))
 const uncovered=unitRows.filter(u=>!pooledUnits.has(u.unit)&&
   (u.allocated_minutes===null||u.allocated_minutes===undefined))
 const shared=pools.reduce((sum,p)=>sum+(Number(p.allocated_minutes)||0),0)
 const standalone=unitRows.filter(u=>!pooledUnits.has(u.unit))
  .reduce((sum,u)=>sum+(Number(u.allocated_minutes)||0),0)
 const complete=!workerSlice&&!unitFilter&&!uncovered.length
 const allocation=complete?shared+standalone:null
 return {...usage,allocated:allocation,remaining:complete?allocation-usage.approved:null,
   allocationPartial:!complete,pooledUnits:[...pooledUnits]}
}
