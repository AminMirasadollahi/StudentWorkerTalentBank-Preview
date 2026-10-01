import { supabase } from './supabase'

export async function getStudentWorkerReport(accessCode, filters = {}) {
  const { data, error } = await supabase.rpc('get_student_worker_report', {
    p_access_code: accessCode.trim(),
    p_major: filters.major || null,
    p_entry_year: filters.entryYear ? Number(filters.entryYear) : null,
    p_primary_unit: filters.primaryUnit || null,
  })

  if (error) {
    const message = String(error.message || '')
    if (
      message.includes('report_access_denied') ||
      message.includes('report_access_not_configured')
    ) {
      throw new Error('کد دسترسی گزارش‌ها معتبر نیست.')
    }
    throw new Error(message || 'دریافت گزارش با خطا مواجه شد.')
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('پاسخ گزارش معتبر نیست.')
  }

  return data
}
