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
    ? 'تکمیل فعال‌سازی تأیید نشد. ممکن است رمز جدید قبلاً ثبت شده باشد. ابتدا با همین رمز دوباره تلاش کنید؛ اگر نشست منقضی شده یا تلاش دوباره موفق نشد، برای دریافت لینک امن جدید با مسئول سامانه هماهنگ کنید.'
    : 'تغییر رمز تأیید نشد. ممکن است رمز جدید ثبت شده باشد؛ پیش از انتخاب رمز متفاوت، وضعیت ورود به حساب را بررسی کنید.'
}
