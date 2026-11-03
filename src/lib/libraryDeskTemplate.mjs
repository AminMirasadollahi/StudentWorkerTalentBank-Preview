/**
 * SWTB15: versioned, non-mutating desk-duty template.
 * IMPORTANT: This is only a manager drafting aid. No recurring shift, overlap,
 * staff cap, approved time or entitlement is created by selecting this template.
 * Correct automatic two-person concurrency must be checked transactionally
 * once explicit start/end times exist server-side.
 */
export const LIBRARY_DESK_TEMPLATE=Object.freeze({
 id:'library_desk_v1',
 unit:'library',
 title:'خدمات جاری، پاسخ‌گویی و نظارت بر کتابخانه',
 instructions:[
  'در بازه کاری مصوب، مسئول نظم، حضور پاسخ‌گو و مراقبت از فضای عمومی و منابع کتابخانه باشید و به دانشجویان، استادان و سایر مراجعان مطابق ضوابط خدمات ارائه کنید.',
  'به علت غیرفعال‌بودن موقت سامانه جست‌وجوی مرکزی، مراجعه‌کننده را آگاه کنید که یافتن کتاب فعلاً از طریق بررسی قفسه‌ها و با راهنمایی شما انجام می‌شود.',
  'هیچ کتابی بدون هماهنگی و ثبت امانت در دفتر یا فرم موقت از مخزن یا کتابخانه خارج نشود. پیش از تحویل، مشخصات لازم امانت‌گیرنده، مشخصات/شناسه کتاب، تاریخ و موعد بازگشت را ثبت کنید.',
  'برای دریافت کتاب برگشتی، اطلاعات لازم مراجعه‌کننده (نام، شناسه دانشجویی یا پرسنلی، رشته و سال ورود در صورت نیاز)، مشخصات کتاب و تاریخ تحویل را ثبت کنید. اگر سوابق امانت در سامانه قطع‌شده قابل استعلام نیست، رسید موقت ثبت کنید؛ تأیید تسویه قطعی را به تطبیق بعدی با سامانه موکول کنید.',
  'دفتر موقت و اطلاعات شخصی مراجعان را محرمانه نگهداری کنید و هنگام بازگشت سامانه، ثبت‌ها را برای تطبیق و انتقال به مسئول کتابخانه تحویل دهید. نواقص و مغایرت‌ها را به مسئول اطلاع دهید.',
  'در پایان نوبت، اقدامات انجام‌شده و موارد مهم را در گزارش کار توضیح دهید؛ ساعت فقط پس از گزارش و تأیید مدیر قابل‌احتساب است.'
 ].join('\n'),
 maxPerRoutineShift:2,
})
export const canDraftLibraryDeskGroup=(unit,templateSelected,selectedCount)=>{
 if(!templateSelected||unit!==LIBRARY_DESK_TEMPLATE.unit)return true
 return Number.isInteger(selectedCount)&&selectedCount>0&&
  selectedCount<=LIBRARY_DESK_TEMPLATE.maxPerRoutineShift
}
