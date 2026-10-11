// Shared, client-only Supabase recovery routing. No access tokens are persisted.
export const WORKER_PASSWORD_RECOVERY_REDIRECT =
  'https://aminmirasadollahi.github.io/StudentWorkerTalentBank-Preview/?page=worker'
export const PASSWORD_RECOVERY_PENDING_KEY = 'student-worker-password-recovery-pending-v1'

export function isRecoveryCallbackHash(hash) {
  if (typeof hash !== 'string') return false
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return params.get('type') === 'recovery'
}

export function validNewPasswordPair(password, confirmation) {
  return typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 128 &&
    password === confirmation
}
