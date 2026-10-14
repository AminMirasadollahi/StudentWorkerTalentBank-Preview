import { createClient } from '@supabase/supabase-js'
import { classifyOperationsIdentity } from './workerAccess.mjs'

// Separate identity/session from the public, intentionally sessionless intake client.
// Only the publishable key enters the browser. Never use the service-role key here.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://pmwxryavkrjcdobwkryw.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_HybJBqEBQVXaDYE2KbQlLg_jGIwi7on'

export const opsClient = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'student-worker-operations-auth-v1',
  },
})

function assertResult({ data, error }) {
  if (error) throw error
  return data
}

export async function signInOperations(email, password) {
  return assertResult(await opsClient.auth.signInWithPassword({ email, password }))
}

export async function signOutOperations() {
  return assertResult(await opsClient.auth.signOut())
}

export async function currentOperationsIdentity() {
  const { data, error } = await opsClient.auth.getUser()
  if (error || !data?.user) return null

  const isAdmin = assertResult(await opsClient.rpc('ops_is_admin'))
  if (isAdmin) return classifyOperationsIdentity({ user: data.user, isAdmin: true })

  const profile = assertResult(await opsClient.rpc('ops_get_my_worker_profile_v2'))
  return classifyOperationsIdentity({ user: data.user, isAdmin: false, profile })
}

export async function getOperationsCandidates() {
  return assertResult(await opsClient.rpc('ops_list_candidates'))
}

export async function setCandidateScreening(id, interview, clearance) {
  return assertResult(await opsClient.rpc('ops_set_screening', {
    p_application_id: id,
    p_interview_status: interview,
    p_clearance_status: clearance,
  }))
}

export async function setCandidateEmail(id, email) {
  return assertResult(await opsClient.rpc('ops_set_candidate_email', {
    p_application_id: id,
    p_email: email.trim().toLowerCase(),
  }))
}

export async function provisionWorker(applicationId, unitCode, email, onboardingMode = 'password') {
  const { data, error } = await opsClient.functions.invoke('ops-provision-worker', {
    body: {
      application_id: applicationId,
      unit_code: unitCode,
      email: email.trim().toLowerCase(),
      onboarding_mode: onboardingMode,
    },
  })
  if (error) throw error
  if (!data?.ok || !data.worker_id
      || (onboardingMode === 'password' && !data.temporary_password)
      || (onboardingMode === 'secure_link' && !data.invitation_link)) {
    throw new Error(data?.error || 'فعال‌سازی تکمیل نشد.')
  }
  return data
}


export async function getAdminWork() {
  return assertResult(await opsClient.rpc('ops_get_operations_v3'))
}
export async function getMyWork() {
  return assertResult(await opsClient.rpc('ops_get_my_work_v2'))
}
export async function setWeeklyDay(workerId, weekday, intervals, effectiveDate) {
  return assertResult(await opsClient.rpc('ops_set_weekly_day', {
    p_worker_id:workerId, p_weekday_iso:weekday,
    p_intervals:intervals, p_valid_from:effectiveDate,
  }))
}
export async function setDateException(workerId, date, kind, intervals, note) {
  return assertResult(await opsClient.rpc('ops_set_date_exception', {
    p_worker_id:workerId, p_local_date:date, p_kind:kind,
    p_intervals:intervals, p_note:note || null,
  }))
}
export async function assignWorkerTask({workerId,unit,title,instructions,date,minutes,shortNoticeReason}) {
  return assertResult(await opsClient.rpc('ops_assign_task', {
    p_worker_id:workerId, p_unit_code:unit,
    p_title:title, p_instructions:instructions || '',
    p_planned_date:date, p_estimate_minutes:Number(minutes),
    p_short_notice_reason:shortNoticeReason || null,
  }))
}
export async function startMyTask(taskId) {
  return assertResult(await opsClient.rpc('ops_start_task',{p_task_id:taskId}))
}
export async function submitMyTime({taskId,date,minutes,note,clientSubmissionId,extraReasonCode=null,extraReasonText=null}) {
  // Only server-side v2 enforces reason, task ownership and default standard credit.
  return assertResult(await opsClient.rpc('ops_submit_time_v2', {
    p_task_id:taskId,p_work_date:date,p_reported_minutes:Number(minutes),
    p_worker_note:note || '',p_client_submission_id:clientSubmissionId,
    p_extra_reason_code:extraReasonCode,p_extra_reason_text:extraReasonText,
  }))
}
export async function reviewWorkerTime({entryId,decision,approvedMinutes,note}) {
  return assertResult(await opsClient.rpc('ops_review_time', {
    p_entry_id:entryId,p_decision:decision,
    p_approved_minutes:decision==='approved'? Number(approvedMinutes):null,
    p_review_note:note || null,
  }))
}

/** Group assignment is one server transaction; each member receives independent report/credit. */
export async function assignGroupTask({workerIds,title,instructions,date,minutes,shortNoticeReason}) {
 return assertResult(await opsClient.rpc('ops_assign_group_task',{
  p_worker_ids:workerIds,p_title:title,p_instructions:instructions,
  p_planned_date:date,p_estimate_minutes:Number(minutes),
  p_short_notice_reason:shortNoticeReason||null,
 }))
}
export async function getMyProfileChangeRequests() {
 return assertResult(await opsClient.rpc('ops_get_my_profile_change_requests'))
}
export async function requestProfileChange({field,value,reason}) {
 return assertResult(await opsClient.rpc('ops_request_profile_change',{
  p_field:field,p_value:value,p_reason:reason,
 }))
}
export async function reviewProfileChange({requestId,decision,note}) {
 return assertResult(await opsClient.rpc('ops_review_profile_change',{
  p_request_id:requestId,p_decision:decision,p_note:note||null,
 }))
}
