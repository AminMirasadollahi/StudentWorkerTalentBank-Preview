/* SWTB13 — help content is declarative, testable and independent of live data.
 * Every step only highlights an existing control; no step submits or saves.
 * The same definitions power the full tour and each local section guide.
 */
export const WORKER_GUIDE_VERSION = 1
export const GUIDE_SECTIONS = ['tasks','availability','history','profile']
const step=(section,anchor,title,description)=>Object.freeze({
 section,anchor,title,description,
})
export const SECTION_GUIDES=Object.freeze({
 tasks:Object.freeze([
  step('tasks','nav-tasks','کارهای من','تمام وظایفی که مدیر برای شما ثبت کرده است، در این بخش قابل پیگیری‌اند. از همین نوار می‌توانید به سایر بخش‌ها بروید.'),
  step('tasks','tasks-status','وضعیت وظایف','ابتدا کارهای نیازمند اقدام را ببینید؛ برای کارهای منتظر بررسی، پیش‌رو و انجام‌شده نیز دسته جدا وجود دارد.'),
  step('tasks','tasks-list','جزئیات و گزارش کار','در جزئیات هر کار، زمان استاندارد را از زمان گزارش‌شده و تأییدشده جدا ببینید. «شروع کار» اختیاری و فقط اعلام وضعیت است؛ برای منظورشدن ساعت، گزارش و تأیید مدیر لازم است.'),
 ]),
 availability:Object.freeze([
  step('availability','nav-availability','زمان حضور','اینجا برنامه حضور هفتگی و تغییرات روزانه خود را مشاهده و تنظیم می‌کنید؛ حضور برنامه‌ریزی‌شده به‌تنهایی ساعت کار تأییدشده محسوب نمی‌شود.'),
  step('availability','availability-week','برنامه ثابت هفتگی','برای هر روز تا چهار نوبت قابل حضور ثبت کنید. هر روز مستقل ذخیره می‌شود؛ خانه خالی به معنای غیبت قطعی یا ساعت کار انجام‌شده نیست.'),
  step('availability','availability-peers','برنامه همکاران و محور ساعت','نمایش برنامه همکاران پیش‌فرض خاموش است. با فعال‌کردن آن، بازه‌های همکاران فقط برای مشاهده روی محور ساعت واقعی نشان داده می‌شوند و برنامه شخصی شما قابل ویرایش می‌ماند.'),
  step('availability','availability-month','تقویم و استثناهای روزانه','با انتخاب روز، برنامه همان تاریخ و در صورت فعال‌بودن نمایش همکاران، جزئیات آنان را ببینید. ثبت عدم حضور یا ساعت جایگزین برای آینده ممکن است؛ حذف استثنای ثبت‌شده و بازگشت به برنامه ثابت فعلاً گزینه مستقلی ندارد.'),
 ]),
 history:Object.freeze([
  step('history','nav-history','سوابق گزارش‌ها','تمام گزارش‌های کار ثبت‌شده و نتیجه بررسی مدیر را در این بخش پیگیری می‌کنید.'),
  step('history','history-summary','مجموع قطعی زمان تأییدشده','خلاصه سروری بالای صفحه مجموع واقعی زمان تأییدشده را نمایش می‌دهد؛ کارکرد برنامه‌ریزی‌شده و زمان درخواستیِ تأییدنشده به این جمع اضافه نمی‌شوند.'),
  step('history','history-controls','فیلتر، عملکرد و جزئیات','با فیلتر واحد، وضعیت و بازه تاریخ شمسی، دفتر گزارش‌ها و «عملکرد من» را بررسی کنید. آمار و نمودارهای عملکرد فقط از ردیف‌های فعلاً بارگذاری‌شده‌اند؛ جمع قطعی همه دوره‌ها در خلاصه مستقل سرور است.'),
 ]),
 profile:Object.freeze([
  step('profile','nav-profile','حساب من','مشخصات پرونده دانشجوکاری و مسیر درخواست اصلاح اطلاعات در این بخش قرار دارد.'),
  step('profile','profile-details','مشخصات ثبت‌شده','نام، رشته، سال ورود و واحد اولیه ثبت‌نام نمایش داده می‌شود. واحد اولیه الزاماً واحد همه کارها نیست و اطلاعات شخصی بدون بررسی مدیر تغییر نمی‌کنند.'),
  step('profile','profile-shortcuts','پیگیری همکاری','برای دیدن کارهای نیازمند اقدام یا زمان‌های درخواست‌شده و تأییدشده، از میان‌برهای کارها و سوابق گزارش‌ها استفاده کنید.'),
  step('profile','profile-correction','درخواست اصلاح و پیگیری','اگر مشخصات نیاز به اصلاح دارد، درخواست و دلیل خود را ثبت کنید و وضعیت آن را در همان پنجره پیگیری کنید. تغییر نهایی نیازمند تأیید مدیر است.'),
 ]),
})
export function getWorkerGuideSteps(scope='all'){
 if(scope==='all')return GUIDE_SECTIONS.flatMap(section=>SECTION_GUIDES[section])
 return SECTION_GUIDES[scope]||[]
}
export function workerGuideStorageKey(workerId){
 if(typeof workerId!=='string'||!workerId)return null
 return 'swtb-worker-guide:v'+WORKER_GUIDE_VERSION+':'+workerId
}
export function isWorkerGuideSection(section){return GUIDE_SECTIONS.includes(section)}
