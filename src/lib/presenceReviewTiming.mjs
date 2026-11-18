// Presentation-only estimate of the CURRENT fixed 48h server policy.
// PostgreSQL decides whether a request is applied or pending. Never use this
// helper for access control or to override an RPC receipt. Future #53 must
// use the server-returned, versioned notice-hour policy in this presentation.
const clockParts=new Intl.DateTimeFormat('en-US-u-ca-gregory',{
 timeZone:'Asia/Tehran',hourCycle:'h23',year:'numeric',month:'2-digit',
 day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',
})
const offsetAtUtcMidnight=utc=>{
 const p=Object.fromEntries(clockParts.formatToParts(new Date(utc))
  .filter(x=>['year','month','day','hour','minute','second'].includes(x.type))
  .map(x=>[x.type,Number(x.value)]))
 return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-utc
}
function tehranMidnight(iso){
 const [y,m,d]=iso.split('-').map(Number)
 const utc=Date.UTC(y,m-1,d)
 // Offset can vary historically; it is derived from Asia/Tehran, not the
 // browser's timezone. The current operational period has no DST transition.
 return utc-offsetAtUtcMidnight(utc)
}
export function presenceReviewTiming(date,now=Date.now(),noticeHours=48){
 if(typeof date!=='string'||!/^(?:19|20)\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date)||
   !Number.isFinite(Number(now))||!Number.isFinite(noticeHours)||noticeHours<0)
   return {state:'invalid',requiresReview:false}
 const [y,m,d]=date.split('-').map(Number)
 if(new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)!==date)
   return {state:'invalid',requiresReview:false}
 const start=tehranMidnight(date)
 const nextDate=new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10)
 const end=tehranMidnight(nextDate)
 const time=Number(now)
 if(time>=end)return {state:'past',requiresReview:false}
 if(time>=start-noticeHours*3600000)
   return {state:'review',requiresReview:true}
 return {state:'direct',requiresReview:false}
}
