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
  step('tasks','tasks-list','جزئیات و ثبت گزارش','در هر ردیف، جزئیات کار و دکمه ثبت یا اصلاح گزارش را خواهید دید. «شروع کار» فقط اعلام وضعیت است و ثبت ساعت نیست؛ ساعت‌ها پس از تأیید مدیر منظور می‌شوند.'),
 ]),
 availability:Object.freeze([
  step('availability','nav-availability','زمان حضور','اینجا برنامه حضور هفتگی و تغییرات روزانه خود را مشاهده و تنظیم می‌کنید؛ حضور برنامه‌ریزی‌شده به‌تنهایی ساعت کار تأییدشده محسوب نمی‌شود.'),
  step('availability','availability-week','برنامه ثابت هفتگی','روزها و نوبت‌های زمانی قابل حضور خود را مشخص کنید. تغییرات را از کنترل‌های همان روز ثبت کنید.'),
  step('availability','availability-month','تقویم و استثناهای روزانه','برای جابه‌جایی نوبت یا اعلام عدم حضور در تاریخ‌های مجاز، روز مربوط را از تقویم انتخاب کنید. روزهای گذشته فقط قابل مشاهده‌اند.'),
 ]),
 history:Object.freeze([
  step('history','nav-history','سوابق گزارش‌ها','تمام گزارش‌های کار ثبت‌شده و نتیجه بررسی مدیر را در این بخش پیگیری می‌کنید.'),
  step('history','history-summary','مجموع زمان تأییدشده','زمان‌های تأییدشده به‌صورت کلی و به تفکیک واحد انجام کار نمایش داده می‌شوند؛ زمان درخواستی تا تأیید مدیر به این مجموع اضافه نمی‌شود.'),
  step('history','history-controls','فیلتر و بررسی جزئیات','گزارش‌ها را بر اساس واحد یا وضعیت فیلتر کنید؛ سپس «جزئیات» را برای مشاهده زمان‌ها و نظر مدیر باز کنید.'),
 ]),
 profile:Object.freeze([
  step('profile','nav-profile','حساب من','مشخصات پرونده دانشجوکاری و مسیر درخواست اصلاح اطلاعات در این بخش قرار دارد.'),
  step('profile','profile-details','مشخصات ثبت‌شده','نام، رشته، سال ورود و واحد اولیه ثبت‌نام شما نمایش داده می‌شوند. واحد اولیه لزوماً همان واحد انجام همه کارها نیست.'),
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
