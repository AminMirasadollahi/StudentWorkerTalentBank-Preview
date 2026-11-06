// SWTB11: Never re-use a report idempotency key with a different payload.
// The RPC returns the earlier receipt for the same task+worker+key without
// comparing report contents. These pure helpers do NOT infer server success.
// All actual authorization/approval remains in installed PostgreSQL RPCs.

const FIELDS=['taskId','date','minutes','note','extraReasonCode','extraReasonText']

export function canonicalWorkerReportPayload(input={}) {
  return {
    taskId:String(input.taskId??''),
    date:String(input.date??''),
    minutes:Number(input.minutes),
    note:String(input.note??''),
    extraReasonCode:input.extraReasonCode||null,
    extraReasonText:input.extraReasonText == null
      ?null:String(input.extraReasonText).trim()||null,
  }
}

export function sameWorkerReportPayload(previous,next) {
  if(!previous||!next)return false
  return FIELDS.every(field=>Object.is(previous[field],next[field]))
}

// Only application-level SQLSTATE rejections with known, explicit server
// semantics are safe to discard. Never treat every five-character SQLSTATE as
// definitive: 08xxx connectivity failures and transient infrastructure states
// can leave the outcome uncertain. A known validation/auth error rolls back.
const DEFINITIVE_REPORT_REJECTIONS=new Set([
  '22023', // invalid date, minutes, or request
  '23514', // failed review-cycle or extra-time precondition
  '23505', // duplicate submission key for a different task
  '42501', // worker identity or task access denied
  'P0002', // explicitly missing related record
])
export function isDefinitiveWorkerReportRejection(error) {
  return typeof error?.code==='string'
    &&DEFINITIVE_REPORT_REJECTIONS.has(error.code)
}

export const WORKER_REPORT_CHANGED_RETRY_NOTICE=
  'نتیجه ارسال قبلی هنوز قطعی نیست. برای جلوگیری از تأیید اشتباه، تلاش مجدد باید دقیقاً با همان اطلاعات قبلی انجام شود. اطلاعات فرم را به حالت ارسال قبلی برگردانید یا ابتدا با «به‌روزرسانی» و «سوابق گزارش‌ها» وضعیت ثبت آن را بررسی کنید.'
