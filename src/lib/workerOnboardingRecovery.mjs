// SWTB11: worker password validation and non-misleading recovery guidance.
// Neither helper persists credentials, changes Auth state or sends network requests.
export function validWorkerPasswordPair(password, confirmation) {
  return typeof password === 'string'
    && typeof confirmation === 'string'
    && password.length >= 8
    && password.length <= 128
    && /\S/.test(password)
    && password === confirmation
}

export function workerPasswordChangeErrorCopy({ initialSetup = false } = {}) {
  return initialSetup
    ? 'تکمیل فعال‌سازی تأیید نشد. ممکن است رمز جدید قبلاً ثبت شده باشد. برای جلوگیری از تغییر دوباره رمز، گزینه «تکمیل با همین رمز» را بزنید؛ این مسیر فقط رمز موجود را تأیید می‌کند. اگر نشست منقضی شده با همین رمز دوباره وارد شوید؛ اگر دسترسی ندارید، برای دریافت لینک امن جدید با مسئول سامانه هماهنگ کنید.'
    : 'تغییر رمز تأیید نشد. ممکن است رمز جدید ثبت شده باشد؛ پیش از انتخاب رمز متفاوت، وضعیت ورود به حساب را بررسی کنید.'
}

/**
 * Only a structured Edge 422/password_update_failed reply may offer the
 * initial password setup again. Network failures and finalize failures are
 * ambiguous and MUST use existing-password proof, never automatic rotation.
 * Supabase FunctionsHttpError carries the HTTP Response in .context.
 */
export async function confirmedInitialPasswordUpdateRejected(error,data) {
  const response=error?.context
  if(response?.status!==422)return false
  let body=data
  if(typeof body?.error!=='string' && typeof response.clone==='function'){
    try{body=await response.clone().json()}catch{return false}
  }
  return body?.error==='password_update_failed'
}
