import React from 'react'
// Fixture only; server owns actual state. No raw identifiers, drafts or errors.
export default function AssignmentRecoveryPanel({snapshot,onDiscover,onRetryReserve,onCommit,onCancel,onAcknowledge}){
 const s=snapshot??{state:'blocked'}
 if(s.state==='idle'||s.state==='unavailable')return null
 const button=(label,fn,primary=false)=><button type="button" className={'report-btn '+(primary?'report-btn--primary':'report-btn--light')} onClick={fn}>{label}</button>
 const progress={checking:'در حال بررسی دسترسی…',discovering:'در حال بازیابی وضعیت درخواست…',reserving:'در حال آماده‌سازی درخواست…',committing:'در حال ثبت واگذاری…',cancelling:'در حال تعیین تکلیف لغو…',acknowledging:'در حال بستن رسید…'}
 if(Object.hasOwn(progress,s.state))return <p role="status">{progress[s.state]}</p>
 return <section aria-label="بازیابی واگذاری" dir="rtl" className="ow-assignment-recovery">
  {s.state==='reserved'?<>
   <p role="status">{s.canCommit?'درخواست آماده ثبت است. هنوز کاری ثبت نشده است.':'درخواست قبلی در سرور محفوظ است؛ متن اصلی در این نشست در دسترس نیست. برای جلوگیری از ثبت ناقص، فقط تعیین تکلیف درخواست امکان‌پذیر است.'}</p>
   {s.canCommit&&button('ثبت نهایی واگذاری',onCommit,true)}
   {s.canCancel&&button('لغو ایمن درخواست',onCancel)}
  </>:s.state==='committed'?<>
   <p role="status">ثبت واگذاری تأیید شد. این رسید تأیید ساعات کار نیست.</p>
   {s.canAcknowledge&&button('تأیید و بستن رسید',onAcknowledge,true)}
  </>:s.state==='cancelled'?<>
   <p role="status">لغو درخواست تأیید شد؛ این شناسه دیگر قابل ثبت نیست.</p>
   {s.canAcknowledge&&button('بستن نتیجه لغو',onAcknowledge)}
  </>:<>
   <p role="alert">{s.state==='reserve_unknown'?'نتیجه آماده‌سازی مشخص نیست؛ درخواست مستقل جدید ایجاد نکنید.':'وضعیت درخواست هنوز تأیید نشده است؛ پیش از ادامه آن را بررسی کنید.'}</p>
   {button('بررسی وضعیت درخواست',onDiscover)}
   {s.canRetryReserve&&button('تکرار آماده‌سازی همان درخواست',onRetryReserve)}
  </>}
 </section>
}
