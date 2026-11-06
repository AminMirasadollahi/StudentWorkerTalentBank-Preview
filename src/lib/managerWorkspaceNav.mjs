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
export const visibleManagerGroups=(flags={})=>MANAGER_WORKSPACE_GROUPS.map(group=>({
 ...group,items:group.items.filter(item=>
  item.requires==='workPool'?flags.workPoolEnabled!==false:
  item.requires==='termMembership'?flags.termMembershipEnabled!==false:true),
}))
export const currentManagerDestination=(nav,flags={})=>{
 const items=visibleManagerGroups(flags).flatMap(group=>group.items)
 return items.find(item=>item.section===nav?.section&&item.view===
  (item.section==='work'?nav?.workView:nav?.candidateView))
  ||items.find(item=>item.id===(nav?.section==='work'?'inbox':'applicants'))
}
export const nextManagerNavigation=(previous,item)=>({
 ...previous,section:item.section,
 ...(item.section==='work'?{workView:item.view}:{candidateView:item.view}),
})
