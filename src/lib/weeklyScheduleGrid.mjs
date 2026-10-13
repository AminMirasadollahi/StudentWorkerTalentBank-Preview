// UI-only model for the existing ops_set_weekly_day RPC.
// A missing weekly row means UNKNOWN capacity, never confirmed unavailability.
export const MAX_DAILY_WINDOWS = 4

export function clockToMinutes(value, { end=false } = {}) {
  if (end && value==='24:00') return 1440
  if (typeof value !== 'string') return NaN
  const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1])*60+Number(match[2]) : NaN
}

export function minutesToClock(value) {
  const n=Number(value)
  if (!Number.isInteger(n)||n<0||n>1440) return ''
  return `${String(Math.trunc(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`
}

export function validateDailyWindows(input) {
  if (!Array.isArray(input)||input.length>MAX_DAILY_WINDOWS)
    return {ok:false,error:'حداکثر چهار بازه برای هر روز قابل ثبت است.'}
  const ranges=input.map(slot=>({
    start:clockToMinutes(slot.start),
    end:clockToMinutes(slot.end,{end:true}),
  }))
  if(ranges.some(({start,end})=>!Number.isInteger(start)||!Number.isInteger(end)||start>=end))
    return {ok:false,error:'ساعت‌ها باید به‌شکل HH:MM باشند؛ پایان هر بازه باید بعد از شروع و در همان روز باشد.'}
  ranges.sort((a,b)=>a.start-b.start||a.end-b.end)
  for(let i=1;i<ranges.length;i++)
    if(ranges[i].start<ranges[i-1].end)
      return {ok:false,error:'بازه‌های حضور نمی‌توانند با یکدیگر هم‌پوشانی داشته باشند.'}
  return {ok:true,intervals:ranges,minutes:ranges.reduce((sum,r)=>sum+r.end-r.start,0)}
}

export function selectedWeeklyWindows(slots,workerId,isoWeekday,onDate) {
  if(!workerId||!Array.isArray(slots)) return []
  return slots.filter(s=>
    s.worker_id===workerId&&Number(s.weekday_iso)===Number(isoWeekday)
    &&typeof s.valid_from==='string'&&s.valid_from<=onDate
    &&(!s.valid_until||s.valid_until>=onDate))
    .sort((a,b)=>Number(a.start_minute)-Number(b.start_minute))
    .slice(0,MAX_DAILY_WINDOWS)
    .map(s=>({start:minutesToClock(s.start_minute),end:minutesToClock(s.end_minute)}))
}

export function persianWeekBounds(date) {
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('invalid_date')
  const d=new Date(date+'T12:00:00Z')
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)
    throw new Error('invalid_date')
  // Gregorian date interpreted in the institution's Iran-local calendar day:
  // Saturday is day 0 of the displayed week, Friday is day 6.
  const offset=(d.getUTCDay()+1)%7
  const day=n=>{
    const clone=new Date(d)
    clone.setUTCDate(clone.getUTCDate()+n)
    return clone.toISOString().slice(0,10)
  }
  return {start:day(-offset),end:day(6-offset)}
}

export function suggestNextWindow(current) {
  const latest=Math.max(0,...(Array.isArray(current)?current:[]).map(slot=>
    clockToMinutes(slot.end,{end:true})).filter(Number.isFinite))
  const start=latest?latest+60:480
  if(start+60>1440) return {start:'',end:''}
  return {start:minutesToClock(start),end:minutesToClock(start+60)}
}
