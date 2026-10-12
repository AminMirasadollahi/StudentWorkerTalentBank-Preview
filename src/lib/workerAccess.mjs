// Determine the smallest permissible signed-in view using server-owned identity fields.
// This classification is UI only: authorization for tasks and administration remains in DB RPCs.
export function classifyOperationsIdentity({ user, isAdmin, profile }) {
  if (!user) return null
  if (isAdmin === true) return { role: 'admin', user }

  if (profile?.worker_id && profile.state === 'active') {
    return { role: 'worker', user, profile }
  }

  if (
    profile?.worker_id &&
    (profile.state === 'paused' || profile.state === 'inactive')
  ) {
    return { role: 'worker_disabled', user, profile }
  }

  return { role: 'no_access', user }
}

export function disabledWorkerCopy(state) {
  if (state === 'paused') {
    return {
      title: 'حساب دانشجوکاری شما موقتاً تعلیق شده است',
      status: 'تعلیق موقت',
      description: 'تا زمان رفع تعلیق، دسترسی به وظایف، برنامه کاری و گزارش‌های ساعت امکان‌پذیر نیست. برای پیگیری وضعیت با مسئول واحد همکاری خود تماس بگیرید.',
    }
  }
  if (state === 'inactive') {
    return {
      title: 'حساب دانشجوکاری شما غیرفعال شده است',
      status: 'غیرفعال',
      description: 'دسترسی به وظایف، برنامه کاری و گزارش‌های ساعت این حساب بسته شده است. برای اطلاع از وضعیت با مسئول واحد همکاری خود تماس بگیرید.',
    }
  }
  return null
}
