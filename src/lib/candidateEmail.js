// Keep applicant email checks consistent with the applied Supabase
// applications_email_format_chk constraint and ops_set_candidate_email RPC.
// ASCII local part/domain are intentional under the current DB contract.
const CANDIDATE_EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/

export function normalizeCandidateEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isValidCandidateEmail(value) {
  const normalized = normalizeCandidateEmail(value)
  return normalized.length >= 5
    && normalized.length <= 254
    && CANDIDATE_EMAIL_PATTERN.test(normalized)
}
