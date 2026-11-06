// SWTB22-D6B — independent, read-only source-contract reconciliation.
// The authenticated RPC supplies *authoritative* aggregates. This helper
// checks their consistency and scope; it does not invent quota or hours.
const minutes=value=>Number.isSafeInteger(value)&&value>=0?value:null
export const findTermBudgetIssues=(data,{
 unitFilter='',workerId='',
}={})=>{
 const issues=[]
 const add=(code,message)=>issues.push({code,message})
 if(!data||data.ok!==true||!data.term)return issues
 const units=Array.isArray(data.units)?data.units:[]
 const pools=Array.isArray(data.pools)?data.pools:[]
 const weeks=Array.isArray(data.weeks)?data.weeks:[]
 const allUnits=!unitFilter,allWorkers=!workerId
 if(!units.length&&!unitFilter)add('missing_units','فهرست واحدها برای جمع‌بندی نیمسال موجود نیست.')
 const unitMap=new Map()
 for(const unit of units){
  if(!unit?.unit||unitMap.has(unit.unit)){
   add('duplicate_unit','ردیف تکراری یا فاقد شناسه واحد در گزارش یافت شد.')
   continue
  }
  unitMap.set(unit.unit,unit)
  for(const field of ['approved_minutes','pending_minutes','unreported_estimate_minutes']){
   if(minutes(unit[field])===null)add('invalid_unit_minutes','مقدار «'+field+'» در واحد '+unit.unit+' معتبر نیست.')
  }
 }
 const poolIds=new Set(),memberPool=new Map()
 for(const pool of pools){
  if(!pool?.id||poolIds.has(pool.id))add('duplicate_pool','شناسه سهمیه تکراری یا خالی است.')
  else poolIds.add(pool.id)
  if(minutes(pool?.allocated_minutes)===null)add('invalid_allocation','سهمیه گروه «'+(pool?.label||'نامشخص')+'» معتبر نیست.')
  for(const field of ['approved_minutes','pending_minutes','unreported_estimate_minutes']){
   if(minutes(pool?.[field])===null)add('invalid_pool_minutes','زمان '+field+' گروه «'+(pool?.label||'نامشخص')+'» معتبر نیست.')
  }
  const localMembers=new Set()
  if(!Array.isArray(pool?.units)||pool.units.length===0)
   add('empty_pool','برای سهمیه «'+(pool?.label||'نامشخص')+'» هیچ واحدی مشخص نشده است.')
  for(const unit of pool?.units||[]){
   if(localMembers.has(unit)||memberPool.has(unit))
    add('duplicate_pool_member','یک واحد بیش از یک بار به سهمیه گروهی منتسب شده است: '+unit)
   localMembers.add(unit);memberPool.set(unit,pool.id)
   if(allUnits&&!unitMap.has(unit))add('missing_member_unit','واحد عضو سهمیه در فهرست تفکیک‌شده وجود ندارد: '+unit)
  }
  if(allWorkers){
   const a=minutes(pool?.allocated_minutes),p=minutes(pool?.approved_minutes)
   const rem=pool?.remaining_minutes
   if(a!==null&&p!==null&&(!Number.isSafeInteger(rem)||rem!==a-p))
    add('wrong_pool_remaining','مانده گروه «'+(pool?.label||'نامشخص')+'» با سهمیه منهای زمان تأییدشده برابر نیست.')
  }else if(pool?.remaining_minutes!==null)
   add('worker_remaining_present','مانده سهمیه جمعی نباید در نمای یک دانشجوکار مقدار داشته باشد.')
 }
 if(allUnits){
  for(const [unit,pool] of memberPool){
   const row=unitMap.get(unit)
   if(row&&row.allocated_minutes!==null&&row.allocated_minutes!==undefined)
    add('overlapping_allocations','واحد '+unit+' هم سهمیه گروهی و هم سهمیه مستقل دارد؛ شمارش سقف مبهم است.')
  }
  // Same approved and pending minutes must reconcile across the three
  // grain views (unit, pool+unpooled, calendar week) for identical filters.
  for(const field of ['approved_minutes','pending_minutes']){
   const sumUnits=units.reduce((a,u)=>a+(minutes(u[field])||0),0)
   const sumBuckets=pools.reduce((a,p)=>a+(minutes(p[field])||0),0)+
     units.filter(u=>!memberPool.has(u.unit)).reduce((a,u)=>a+(minutes(u[field])||0),0)
   if(sumUnits!==sumBuckets)
    add('pool_unit_mismatch','جمع '+field+' در ریز واحدها با جمع سهمیه‌های مشترک و مستقل مطابقت ندارد.')
  }
 }
 let weekTotal=0
 for(const week of weeks){
  const value=minutes(week?.approved_minutes)
  if(value===null)add('invalid_week_minutes','مقدار زمان تأییدشده در روند هفتگی معتبر نیست.')
  else weekTotal+=value
 }
 const unitTotal=units.reduce((a,u)=>a+(minutes(u.approved_minutes)||0),0)
 if(weekTotal!==unitTotal)
  add('week_unit_mismatch','جمع روند هفتگی با زمان تأییدشده در واحدهای همین فیلتر یکسان نیست.')
 return issues
}
export const termBudgetScopeText=({unitFilter='',workerId=''}={})=>{
 if(workerId&&unitFilter)return 'نمای فردی در یک واحد: فقط مصرف همان شخص/واحد؛ مانده سهمیه جمعی تعریف نمی‌شود.'
 if(workerId)return 'نمای یک دانشجوکار: فقط زمان فعالیت همان شخص؛ مانده سهمیه جمعی نمایش داده نمی‌شود.'
 if(unitFilter)return 'نمای یک واحد: اعداد واحد فیلترشده‌اند؛ مانده گروه‌های مشترک شامل همه واحدهای عضو است.'
 return 'نمای کل نیمسال: سهمیه هر گروه فقط یک بار شمرده می‌شود؛ مصرف قطعی فقط ساعات تأییدشده است.'
}
