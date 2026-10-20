import { opsClient } from './operations'

// Always use the caller's authenticated operations session, NOT the public
// report's anonymous client, its access code or browser sessionStorage.
// The database RPC independently checks ops_is_admin() for every call.
export async function getAdminStudentWorkerReport(filters = {}) {
  const { data, error } = await opsClient.rpc('ops_get_admin_student_worker_report', {
    p_major: filters.major || null,
    p_entry_year: filters.entryYear ? Number(filters.entryYear) : null,
    p_primary_unit: filters.primaryUnit || null,
  })

  if (error) {
    if (error.code === '42501' || String(error.message || '').includes('operations_access_denied')) {
      throw new Error('مجوز مدیریت برای مشاهدهٔ گزارش‌ها معتبر نیست.')
    }
    throw new Error('دریافت اطلاعات گزارش‌گیری انجام نشد؛ اتصال و مجوزها را بررسی کنید.')
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('پاسخ گزارش‌گیری مدیر معتبر نیست.')
  }

  return data
}
