// Reversible staff-only worker lifecycle states. Server RPC is authoritative.
export const workerStateLabels = Object.freeze({
  active: 'فعال',
  paused: 'تعلیق موقت',
  inactive: 'غیرفعال',
})

// No implicit inactive -> paused: resume to active before suspending again.
export function allowedWorkerTransitions(state) {
  if (state === 'active') return ['paused', 'inactive']
  if (state === 'paused') return ['active', 'inactive']
  if (state === 'inactive') return ['active']
  return []
}

export function workerTransitionAction(state) {
  if (state === 'active') return 'فعال‌سازی مجدد'
  if (state === 'paused') return 'تعلیق موقت'
  if (state === 'inactive') return 'غیرفعال‌سازی'
  return null
}

export function normalizeWorkerStateReason(value) {
  return String(value || '').trim()
}

export function isWorkerStateReasonValid(value) {
  const reason = normalizeWorkerStateReason(value)
  return reason.length >= 10 && reason.length <= 600
}
