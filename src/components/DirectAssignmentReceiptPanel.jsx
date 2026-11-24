import React from 'react'

// Disconnected, presentation-only receipt panel. The future verified host owns
// session, auth and refresh. Never import a live writer or mount from the
// production entrypoint before the release gate.
const rejectionCopy=Object.freeze({
 invalid_assignment:'اطلاعات واگذاری معتبر نیست.',
 invalid_unit:'واحد فعالیت معتبر یا فعال نیست.',
 worker_not_active:'حداقل یکی از دانشجوکاران فعال نیست.',
 worker_not_eligible_for_term:'حداقل یکی از افراد مجوز همکاری این نیمسال را ندارد.',
 task_term_not_active:'نیمسال مربوط به تاریخ کار فعال نیست.',
 short_notice_reason_required:'علت واگذاری نزدیک ضروری است.',
 library_desk_capacity_exceeded:'ظرفیت نوبت کتابخانه تکمیل شده است.',
 library_desk_worker_overlap:'حداقل یکی از افراد در این بازه نوبت دارد.',
 library_desk_shift_already_started:'زمان شروع نوبت گذشته است.',
 invalid_library_desk_interval:'بازه زمانی نوبت معتبر نیست.',
 invalid_group_members:'تعداد یا انتخاب اعضای گروه معتبر نیست.'
})
export default function DirectAssignmentReceiptPanel({snapshot,onReconcile,onRetry,onAcknowledge,onRevise}){
 const state=snapshot?.state
 if(state==='idle'||state==='unavailable'||!state)return null
 if(state==='checking')return <p role="status">در حال بررسی دسترسی…</p>
 if(state==='sending')return <p role="status">در حال ثبت واگذاری…</p>
 if(state==='checking_receipt')return <p role="status">در حال بررسی رسید واگذاری…</p>
 if(state==='confirmed')return <section aria-label="نتیجه واگذاری" dir="rtl">
  <p role="status">واگذاری ثبت شد. این رسید تأیید ثبت اولیه است؛ ساعات پس از بررسی گزارش محاسبه می‌شوند.</p>
  <button type="button" className="report-btn report-btn--light" onClick={onAcknowledge}>تأیید و بستن رسید</button>
 </section>
 if(state==='rejected')return <section aria-label="اصلاح واگذاری" dir="rtl">
  <p role="alert">{rejectionCopy[snapshot.rejectionCode]||'درخواست تأیید نشد.'} پیش‌نویس حفظ شده است.</p>
  <button type="button" className="report-btn report-btn--light" onClick={onRevise}>بازگشت به پیش‌نویس</button>
 </section>
 if(state==='unknown')return <section aria-label="بررسی نتیجه واگذاری" dir="rtl">
  <p role="alert">نتیجه ثبت هنوز مشخص نیست. درخواست جدید ایجاد نکنید.</p>
  <button type="button" className="report-btn report-btn--light" onClick={onReconcile}>بررسی رسید</button>
  {snapshot.retryReady===true&&<>
   <p role="status">رسید هنوز یافت نشده است؛ این به معنای ثبت‌نشدن قطعی نیست.</p>
   <button type="button" className="report-btn report-btn--primary" onClick={onRetry}>ارسال مجدد همان درخواست</button>
  </>}
 </section>
 return null
}
