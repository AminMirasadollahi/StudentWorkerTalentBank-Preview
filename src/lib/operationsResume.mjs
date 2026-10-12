// Re-check server-owned Operations identity when an already-open tab becomes active.
// The UI must not keep stale worker/admin screens mounted while the check is pending.
// This is presentation hardening: every sensitive RPC must still authorize server-side.
export function watchOperationsResume({
  windowTarget,
  documentTarget,
  readIdentity,
  onStart,
  onIdentity,
  onFailure,
  onFinish,
}) {
  let disposed = false
  let inFlight = false

  async function recheck() {
    if (disposed || inFlight || documentTarget.visibilityState === 'hidden') return
    inFlight = true
    onStart()
    try {
      const identity = await readIdentity()
      if (!disposed) onIdentity(identity)
    } catch (error) {
      // Fail closed for the visible workspace if online authorization cannot be checked.
      if (!disposed) onFailure(error)
    } finally {
      inFlight = false
      if (!disposed) onFinish()
    }
  }

  const onFocus = () => { void recheck() }
  const onVisible = () => {
    if (documentTarget.visibilityState === 'visible') void recheck()
  }
  windowTarget.addEventListener('focus', onFocus)
  documentTarget.addEventListener('visibilitychange', onVisible)

  return () => {
    disposed = true
    windowTarget.removeEventListener('focus', onFocus)
    documentTarget.removeEventListener('visibilitychange', onVisible)
  }
}
