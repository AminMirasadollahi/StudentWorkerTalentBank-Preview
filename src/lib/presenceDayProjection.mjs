// Read-only view of a single local date's effective attendance windows.
// Date exceptions take precedence over fixed weekly slots. Never interpret an
// absent weekly template as an explicit zero-hour/no-attendance declaration.
import {isoWeekday} from './assignmentCapacity.mjs'
import {minutesToClock} from './weeklyScheduleGrid.mjs'
const validNumber=x=>Number.isInteger(Number(x))&&Number(x)>=0&&Number(x)<=1440
const timeWindows=list=>Array.isArray(list)?list.map(item=>({
  start:Number(item?.start??item?.start_minute),
  end:Number(item?.end??item?.end_minute),
})).filter(item=>validNumber(item.start)&&validNumber(item.end)&&item.end>item.start)
  .sort((a,b)=>a.start-b.start):[]
const fmt=item=>({start:minutesToClock(item.start),end:minutesToClock(item.end)})
export function projectDayPresence(data,workerId,date) {
  const ex=(data?.exceptions||[]).filter(item=>
    item.worker_id===workerId && item.local_date===date)
  if(ex.length>1)return {kind:'unknown',windows:[],minutes:null}
  if(ex.length===1){
    if(ex[0].kind==='unavailable')return {kind:'unavailable',windows:[],minutes:0}
    if(ex[0].kind==='replacement_intervals'){
      const vals=timeWindows(ex[0].intervals)
      return {kind:'replacement',windows:vals.map(fmt),
        minutes:vals.reduce((sum,x)=>sum+x.end-x.start,0)}
    }
    return {kind:'unknown',windows:[],minutes:null}
  }
  const weekday=isoWeekday(date)
  const fixed=(data?.weekly_slots||[]).filter(x=>
    x.worker_id===workerId && Number(x.weekday_iso)===weekday
    &&x.valid_from<=date&&(!x.valid_until||x.valid_until>=date))
  if(!fixed.length)return {kind:'unknown',windows:[],minutes:null}
  const vals=timeWindows(fixed)
  return {kind:'weekly',windows:vals.map(fmt),
    minutes:vals.reduce((sum,x)=>sum+x.end-x.start,0)}
}
