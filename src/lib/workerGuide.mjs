/* SWTB12/13 worker help: declarative, contextual, optional and read-only.
 * Each step highlights a real visible control; no step submits or saves.
 * All-section tour includes the optional work pool ONLY when enabled.
 */
export const WORKER_GUIDE_VERSION = 1
export const GUIDE_SECTIONS = ['tasks','workPool','availability','history','profile']
const step=(section,anchor,title,description)=>Object.freeze({
 section,anchor,title,description,
})
export const SECTION_GUIDES=Object.freeze({
 tasks:Object.freeze([
  step('tasks','nav-tasks','کارهای من','کارهایی که مدیر واگذار کرده و وضعیت رسیدگی به گزارش‌های شما اینجا نمایش داده می‌شوند.'),
  step('tasks','tasks-status','دسته‌بندی کارها','برای کارهای نیازمند اقدام، در انتظار بررسی، برنامه‌ریزی‌شده و انجام‌شده، دسته مرتبط را انتخاب کنید.'),
  step('tasks','tasks-list','جزئیات کار و ارسال گزارش','جزئیات هر کار، زمان استاندارد و وضعیت آن را نشان می‌دهد. پس از انجام واقعی کار، گزارش زمان را ارسال کنید؛ فقط مدت تأییدشده توسط مدیر در کارکرد قطعی منظور می‌شود. شروع کار به‌تنهایی ثبت ساعت نیست.'),
 ]),
 workPool:Object.freeze([
  step('workPool','nav-workPool','فرصت‌های کاری','فرصت‌های منتشرشده را می‌توانید بررسی کنید. وجود الگوی مدیریتی لزوماً به معنی وجود فرصت قابل انتخاب نیست.'),
  step('workPool','work-pool-list','انتخاب فرصت و نوبت کتابخانه','فرصت عمومی با توجه به مجوز نیمسال، ظرفیت و مهلت قابل انتخاب است. نوبت‌های میز کتابخانه، در صورت انتشار، در قسمت جداگانه همین صفحه نمایش داده می‌شوند. زمان پیشنهادی و رزرو نوبت به‌تنهایی ساعت کار تأییدشده نیستند.'),
 ]),
 availability:Object.freeze([
  step('availability','nav-availability','زمان حضور','این بخش برنامه شخصی قابل ویرایش و نمای اختیاری برنامه همکاران را در یک صفحه جمع می‌کند. برنامه حضور، ثبت حضور واقعی یا ساعت تأییدشده نیست.'),
  step('availability','availability-week','برنامه ثابت هفتگی','برای هر روز می‌توانید تا چهار نوبت زمانی تنظیم کنید. ذخیره برنامه هر روز مستقل است و خانه خالی به معنی غیبت قطعی نیست.'),
  step('availability','availability-peers','برنامه همکاران و محور ساعت','گزینه نمایش همکاران در ابتدا خاموش است. با روشن‌کردن آن فقط بازه‌های مجاز و خواندنی همکاران روی محور زمان مشترک دیده می‌شوند؛ برنامه شخصی همچنان قابل ویرایش است.'),
  step('availability','availability-month','تقویم و تغییرات یک روز','یک روز را انتخاب کنید تا برنامه همان تاریخ را ببینید و در صورت نیاز، عدم حضور یا ساعت جایگزین آینده را ثبت کنید. برای بازگرداندن یک استثنای ثبت‌شده به برنامه ثابت، فعلاً گزینه مستقل حذف در پنل در دسترس نیست.'),
 ]),
 history:Object.freeze([
  step('history','nav-history','سوابق گزارش‌ها','گزارش‌های مجاز و بارگذاری‌شده خودتان، مدت زمان درخواست‌شده و نتیجه رسیدگی مدیر را اینجا پیگیری کنید.'),
  step('history','history-summary','ساعات تأییدشده قطعی','جمع قطعی سرور در بالا، مستقل از فیلترهای گزارش‌هاست؛ فقط مدت تأییدشده شمرده می‌شود، نه ساعات برنامه‌ریزی‌شده یا درخواستی.'),
  step('history','history-controls','فیلتر، دفتر گزارش‌ها و تحلیل','واحد، تاریخ شمسی انجام کار و وضعیت رسیدگی را در یک محل فیلتر کنید. دفتر گزارش‌های منطبق بلافاصله زیر فیلتر قرار دارد و تحلیل و نمودارهای انتهای صفحه از همان گزارش‌های بارگذاری‌شده ساخته می‌شوند؛ ممکن است همه تاریخچه را پوشش ندهند. نمودار سهم واحدها دوناتی و روند ماهانه میله‌ای است؛ صفر به معنی نبود کارکرد تأییدشده در نتایج فعلی است.'),
 ]),
 profile:Object.freeze([
  step('profile','nav-profile','حساب من','اطلاعات تأییدشده پرونده، پیگیری فعالیت و درخواست اصلاح مشخصات در این قسمت قرار دارند.'),
  step('profile','profile-details','مشخصات پرونده','نام، رشته، سال ورود و واحد اولیه ثبت‌نام خود را ببینید. واحد اولیه الزاماً واحد انجام همه کارها نیست.'),
  step('profile','profile-shortcuts','پیگیری همکاری','می‌توانید مستقیم به کارهای من یا سوابق گزارش‌ها بروید. زمان برنامه‌ریزی‌شده و زمان تأییدشده دو مفهوم متفاوت‌اند.'),
  step('profile','profile-correction','درخواست اصلاح اطلاعات','اگر مشخصات نیازمند تغییر است، درخواست مستند ثبت کنید و نتیجه آن را همین‌جا پیگیری کنید؛ تا پیش از تأیید مدیر مشخصات پرونده تغییر نمی‌کنند.'),
 ]),
})
export function getWorkerGuideSteps(scope='all',{includeWorkPool=true}={}){
 if(scope==='all')return GUIDE_SECTIONS
  .filter(section=>includeWorkPool||section!=='workPool')
  .flatMap(section=>SECTION_GUIDES[section])
 return SECTION_GUIDES[scope]||[]
}
export function workerGuideStorageKey(workerId){
 if(typeof workerId!=='string'||!workerId)return null
 return 'swtb-worker-guide:v'+WORKER_GUIDE_VERSION+':'+workerId
}
export function isWorkerGuideSection(section){return GUIDE_SECTIONS.includes(section)}
