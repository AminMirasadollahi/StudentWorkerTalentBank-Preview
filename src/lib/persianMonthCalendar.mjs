// Date-only UI projection. Server contracts still accept Gregorian ISO YYYY-MM-DD.
// No locale-dependent Gregorian month approximation; Persian month boundaries
// are derived from the official ICU Persian calendar in the Tehran day frame.
const persianParts = new Intl.DateTimeFormat('en-US-u-ca-persian',{
  calendar:'persian',timeZone:'UTC',year:'numeric',month:'numeric',day:'numeric',
})
const persianTitle = new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
  calendar:'persian',timeZone:'UTC',month:'long',year:'numeric',
})
const utcDate=iso=>new Date(iso+'T12:00:00Z')
export const plusIsoDays=(iso,delta)=>{
  const date=utcDate(iso)
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)
    throw new Error('invalid_iso_date')
  date.setUTCDate(date.getUTCDate()+delta)
  return date.toISOString().slice(0,10)
}
export function persianDayParts(iso){
  const obj=Object.fromEntries(persianParts.formatToParts(utcDate(iso))
    .filter(x=>['year','month','day'].includes(x.type))
    .map(x=>[x.type,Number(x.value)]))
  if(!obj.year||!obj.month||!obj.day)throw new Error('invalid_persian_date')
  return obj
}
export function persianMonthBounds(iso) {
  const {year,month}=persianDayParts(iso)
  let start=iso
  for(let i=0;i<32;i++){
    const previous=plusIsoDays(start,-1)
    const p=persianDayParts(previous)
    if(p.year!==year||p.month!==month)break
    start=previous
  }
  let end=iso
  for(let i=0;i<32;i++){
    const next=plusIsoDays(end,1)
    const p=persianDayParts(next)
    if(p.year!==year||p.month!==month)break
    end=next
  }
  return {start,end,title:persianTitle.format(utcDate(start)),year,month}
}
export function persianMonthCells(iso) {
  const month=persianMonthBounds(iso)
  const leading=(utcDate(month.start).getUTCDay()+1)%7 // Saturday-first grid
  const length=Math.round((utcDate(month.end)-utcDate(month.start))/86400000)+1
  const days=Array.from({length:leading+length},(_,i)=>{
    const offset=i-leading
    if(offset<0)return null
    const date=plusIsoDays(month.start,offset)
    const parts=persianDayParts(date)
    return {date,day:parts.day}
  })
  while(days.length%7)days.push(null)
  return {...month,days}
}
export const previousPersianMonth=iso=>plusIsoDays(persianMonthBounds(iso).start,-1)
export const nextPersianMonth=iso=>plusIsoDays(persianMonthBounds(iso).end,1)
