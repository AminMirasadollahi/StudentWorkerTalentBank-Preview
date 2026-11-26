// SWTB22-B: presentation-only mapping of existing manager navigation state.
// Never grant permissions or infer active worker eligibility from these routes.
export const MANAGER_WORKSPACE_GROUPS = [
 {id:'daily',title:'عملیات روزانه',items:[
  {id:'inbox',section:'work',view:'inbox',label:'کارتابل و رسیدگی',description:'گزارش‌ها و درخواست‌هایی که به تصمیم مدیر نیاز دارند.'},
  {id:'tasks',section:'work',view:'tasks',label:'کارها و واگذاری',description:'پیگیری وظایف و واگذاری کار با مجوز مدیر.'},
  {id:'workPool',section:'work',view:'workPool',label:'مخزن فرصت‌های کاری',description:'تعریف و انتشار فرصت‌های عمومی و نوبت‌های کتابخانه.',requires:'workPool'},
  {id:'availability',section:'work',view:'availability',label:'برنامه حضور',description:'برنامه هفتگی و تقویم حضور دانشجوکاران.'},
  {id:'approvals',section:'work',view:'approvals',label:'تأیید ساعات',description:'رسیدگی به گزارش‌های کار و ساعت‌های در انتظار بررسی.'},
 ]},
 {id:'people',title:'افراد و دسترسی‌ها',items:[
  {id:'applicants',section:'candidates',view:'applicants',label:'داوطلبان و پذیرش',description:'بررسی پرونده، مصاحبه و فعال‌سازی حساب.'},
  {id:'profiles',section:'work',view:'profiles',label:'پرونده دانشجوکاران',description:'مشاهده و مدیریت پرونده‌های دانشجوکاران.'},
  {id:'termMemberships',section:'work',view:'termMemberships',label:'مجوز همکاری نیمسال',description:'تصمیم‌های اختصاصی مجوز همکاری برای هر نیمسال.',requires:'termMembership'},
 ]},
 {id:'administration',title:'تنظیمات و گزارش‌ها',items:[
  {id:'terms',section:'work',view:'terms',label:'نیمسال و سهمیه‌ها',description:'تنظیم نیمسال و سهمیه‌های مصوب و مشترک.'},
  {id:'history',section:'work',view:'history',label:'سوابق و خروجی فعالیت',description:'بررسی سوابق و گزارش فعالیت‌های دانشجوکاران.'},
  {id:'candidateReport',section:'candidates',view:'report',label:'آمار و خروجی پذیرش',description:'گزارش آماری فرایند داوطلبان و پذیرش.'},
 ]},
]
// Review-only opt-in: a single parent maps to the existing internal views.
export const workHubEnabled=flags=>flags?.workHubFixture===true&&flags.workPoolEnabled!==false
export const isWorkHubView=view=>view==='tasks'||view==='workPool'
const legacyManagerGroups=(flags={})=>MANAGER_WORKSPACE_GROUPS.map(group=>({
 ...group,items:group.items.filter(item=>
  item.requires==='workPool'?flags.workPoolEnabled!==false:
  item.requires==='termMembership'?flags.termMembershipEnabled!==false:true)
  .filter(item=>!workHubEnabled(flags)||item.id!=='workPool')
  .map(item=>workHubEnabled(flags)&&item.id==='tasks'?{...item,hub:true,label:'مدیریت کارها',description:'پیگیری وظایف واگذارشده و تعریف فرصت‌های قابل انتخاب.'}:item),
}))
// R5 review only. Canonical route identity stays section+view; no new
// authorization, data projection, or write operation is introduced.
export const r5IaEnabled=flags=>flags?.r5IaFixture===true
const r5Groups=[
 {id:'daily',title:'عملیات روزانه',parents:[
  ['inbox','کارتابل و رسیدگی','گزارش‌ها و درخواست‌های نیازمند تصمیم مدیر.',['inbox','approvals']],
  ['tasks','مدیریت کارها','پیگیری وظایف و فرصت‌ها و تعریف کار جدید.',['tasks','workPool']],
  ['availability','برنامه حضور','تقویم و ظرفیت حضور دانشجوکاران.',['availability']],
 ]},
 {id:'people',title:'افراد و همکاری',parents:[
  ['applicants','افراد و همکاری','پذیرش، پرونده دانشجوکاران و مجوز همکاری.',['applicants','profiles','termMemberships']],
 ]},
 {id:'administration',title:'تنظیمات و گزارش‌ها',parents:[
  ['terms','نیمسال و سهمیه‌ها','تنظیم دوره‌ها و سهمیه‌های همکاری.',['terms']],
  ['history','گزارش‌ها و تحلیل','سوابق فعالیت و آمار پذیرش.',['history','candidateReport']],
 ]},
]
function r5Children(ids,flags){
 const items=legacyManagerGroups({...flags,workHubFixture:false}).flatMap(g=>g.items)
 return ids.map(id=>items.find(item=>item.id===id)).filter(Boolean)
}
export function visibleManagerGroups(flags={}){
 if(!r5IaEnabled(flags))return legacyManagerGroups(flags)
 return r5Groups.map(g=>({id:g.id,title:g.title,items:g.parents.map(([id,label,description,ids])=>{
  const children=r5Children(ids,flags)
  return {...children[0],id,label,description,r5Parent:true,children}
 })}))
}
const matchesRoute=(nav,item)=>item.section===nav?.section&&item.view===
 (item.section==='work'?nav?.workView:nav?.candidateView)
export function managerR5SubViews(nav,flags={}){
 if(!r5IaEnabled(flags))return []
 return currentManagerDestination(nav,flags)?.children??[]
}
export const currentManagerDestination=(nav,flags={})=>{
 const items=visibleManagerGroups(flags).flatMap(group=>group.items)
 if(r5IaEnabled(flags))return items.find(item=>item.children.some(child=>matchesRoute(nav,child)))
  ||items.find(item=>item.id==='inbox')
 const workView=workHubEnabled(flags)&&isWorkHubView(nav?.workView)?'tasks':nav?.workView
 return items.find(item=>item.section===nav?.section&&item.view===
  (item.section==='work'?workView:nav?.candidateView))
  ||items.find(item=>item.id===(nav?.section==='work'?'inbox':'applicants'))
}
export const nextManagerNavigation=(previous,item)=>{
 if(item.r5Parent===true){
  if(item.children.some(child=>matchesRoute(previous,child)))return previous
  item=item.children[0]
 }
 return {
  ...previous,section:item.section,
  ...(item.section==='work'?{workView:item.hub===true&&isWorkHubView(previous?.workView)?previous.workView:item.view}:{candidateView:item.view}),
 }
}
