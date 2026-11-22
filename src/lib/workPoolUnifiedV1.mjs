// SWTB19: pure client-side presentation and input checks. PostgreSQL is the
// final authority for role, term, dates, effort, claim and concurrency.
export const addDays=(iso,n)=>{
 const d=new Date(String(iso)+'T12:00:00Z')
 if(!Number.isFinite(d.getTime()))return ''
 d.setUTCDate(d.getUTCDate()+n)
 return d.toISOString().slice(0,10)
}
export function todayTehran(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const p=k=>parts.find(x=>x.type===k)?.value||''
 return p('year')+'-'+p('month')+'-'+p('day')
}
export const isISODate=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&
  !Number.isNaN(new Date(x+'T12:00:00Z').getTime())&&
  new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x
export const durationFa=mins=>{
 const n=Number(mins)
 if(!Number.isInteger(n)||n<1)return '—'
 const h=Math.floor(n/60),m=n%60
 const f=new Intl.NumberFormat('fa-IR')
 return [h?f.format(h)+' ساعت':'',m?f.format(m)+' دقیقه':''].filter(Boolean).join(' و ')
}
export function workPackagePayload(d,termId,now=todayTehran(),term=null){
 const unitCode=d.unit||'library',title=String(d.title||'').trim()
 const description=String(d.description||'').trim()
 const instructions=String(d.instructions||'').trim()
 const totalMinutes=Number(d.totalMinutes)
 const priority=Number(d.priority||3)
 const allocationMode=d.allocationMode==='choice'?'choice':'fixed'
 const shareMinutes=Number(d.shareMinutes),minShareMinutes=Number(d.minShareMinutes)
 const maxShareMinutes=Number(d.maxShareMinutes),shareStepMinutes=Number(d.shareStepMinutes)
 const maxPeople=d.maxPeople===''||d.maxPeople==null?null:Number(d.maxPeople)
 const startDate=String(d.startDate||'')
 const endDate=d.dateMode==='range'?String(d.endDate||''):startDate
 const claimDeadline=d.claimDeadline||null
 const isInt=n=>Number.isInteger(n)
 if(!['library','research','public_relations'].includes(unitCode)
  ||title.length<3||title.length>160||description.length<10||description.length>1200
  ||instructions.length>3000||!isInt(priority)||priority<1||priority>5)
  throw Error('عنوان، شرح یا واحد کار معتبر نیست.')
 if(!isInt(totalMinutes)||totalMinutes<1||totalMinutes>28800)
  throw Error('حجم کل کار باید بین ۱ دقیقه و ۴۸۰ ساعت باشد.')
 if(!termId||!isISODate(now)||!isISODate(startDate)||!isISODate(endDate)
  ||startDate<addDays(now,2)||endDate<startDate||endDate>addDays(now,90)
  ||term&&(startDate<term.start_date||endDate>term.end_date))
  throw Error('تاریخ انجام باید داخل نیمسال فعال و بین دو تا نود روز آینده باشد.')
 if(claimDeadline&&(!isISODate(claimDeadline)||claimDeadline<now||claimDeadline>addDays(startDate,-2)))
  throw Error('مهلت انتخاب باید امروز یا بعد از آن و حداکثر دو روز قبل از شروع کار باشد.')
 if(maxPeople!==null&&(!isInt(maxPeople)||maxPeople<1||maxPeople>20))
  throw Error('حداکثر تعداد افراد باید بین ۱ تا ۲۰ باشد.')
 let estimatedPeople
 if(allocationMode==='fixed'){
  if(!isInt(shareMinutes)||shareMinutes<1||shareMinutes>1440)
   throw Error('سهم هر نفر باید بین ۱ دقیقه و ۲۴ ساعت باشد.')
  estimatedPeople=Math.ceil(totalMinutes/shareMinutes)
  if(estimatedPeople>20||(maxPeople!==null&&maxPeople<estimatedPeople))
   throw Error('برای پوشش حجم کل کار، سهم هر نفر یا سقف تعداد افراد را اصلاح کنید (حداکثر ۲۰ نفر).')
 }else{
  if(![minShareMinutes,maxShareMinutes,shareStepMinutes].every(isInt)
    ||minShareMinutes<1||minShareMinutes>1440
    ||maxShareMinutes<minShareMinutes||maxShareMinutes>1440
    ||shareStepMinutes<1||shareStepMinutes>maxShareMinutes
    ||totalMinutes<minShareMinutes
    ||[totalMinutes,minShareMinutes,maxShareMinutes].some(n=>n%shareStepMinutes!==0)
    ||(maxPeople??20)*maxShareMinutes<totalMinutes)
   throw Error('حداقل، حداکثر، گام سهم و حجم کل با یکدیگر سازگار نیستند.')
  estimatedPeople=Math.ceil(totalMinutes/maxShareMinutes)
 }
 return {payload:{
  unitCode,title,description,instructions,priority,totalMinutes,
  allocationMode,shareMinutes:allocationMode==='fixed'?shareMinutes:null,
  minShareMinutes:allocationMode==='choice'?minShareMinutes:null,
  maxShareMinutes:allocationMode==='choice'?maxShareMinutes:null,
  shareStepMinutes:allocationMode==='choice'?shareStepMinutes:null,
  termId,startDate,endDate,maxPeople,claimDeadline,publish:false,
 },estimatedPeople}
}
export function shareOptions(offer){
 if(offer?.allocation_mode==='legacy'||!offer?.allocation_mode)return []
 const remain=Number(offer.remaining_minutes),min=Number(offer.min_share_minutes)
 const max=Number(offer.max_share_minutes),step=Number(offer.share_step_minutes)
 if(![remain,min,max,step].every(Number.isInteger)||remain<=0||step<1||max<1)return []
 if(offer.allocation_mode==='fixed')return [Math.min(remain,max)]
 const out=[]
 for(let n=min;n<=max&&n<=remain;n+=step){
  if((remain-n)===0||(remain-n)>=min)out.push(n)
 }
 return out
}
export function selectedDayAllowed(date,offer,now=todayTehran()){
 const end=offer?.end_date||offer?.date
 return isISODate(date)&&date>=addDays(now,2)&&date>=offer?.date&&date<=end
}
