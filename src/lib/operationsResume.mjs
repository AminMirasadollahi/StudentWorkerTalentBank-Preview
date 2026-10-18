// Verify server-owned Operations identity on every *real* tab/window return.
// A browser activation may emit both focus and visibilitychange in quick
// succession: they describe the same activation and must share ONE check.
// This never caches a role, skips a real activation, or changes server rules.
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
  // Initially permit a focus event to verify; thereafter only a preceding
  // blur/hidden event re-arms, including fast reactivation during a request.
  let needsVerification = true
  let activationGeneration = 0

  function markInactive() {
    if (disposed || needsVerification) return
    needsVerification = true
    activationGeneration += 1
  }

  async function recheck() {
    if (disposed || inFlight ||
        !needsVerification || documentTarget.visibilityState === 'hidden') return
    needsVerification = false
    inFlight = true
    const generation = activationGeneration
    onStart()
    try {
      const fresh = await readIdentity()
      // A result started before the browser left the page cannot authorize a
      // later activation. Only apply the generation that is still current.
      if (!disposed && generation === activationGeneration &&
          documentTarget.visibilityState !== 'hidden') onIdentity(fresh)
    } catch (error) {
      if (!disposed && generation === activationGeneration &&
          documentTarget.visibilityState !== 'hidden') onFailure(error)
    } finally {
      inFlight = false
      if (disposed) return
      if (needsVerification && documentTarget.visibilityState !== 'hidden') {
        // A new activation happened during the old request; do not unfreeze
        // with a stale result. Validate again before revealing the workspace.
        void recheck()
      } else {
        onFinish()
      }
    }
  }

  const onFocus = () => { void recheck() }
  const onBlur = () => { markInactive() }
  const onVisible = () => {
    if (documentTarget.visibilityState === 'hidden') markInactive()
    else void recheck()
  }
  windowTarget.addEventListener('focus', onFocus)
  windowTarget.addEventListener('blur', onBlur)
  documentTarget.addEventListener('visibilitychange', onVisible)

  return () => {
    disposed = true
    windowTarget.removeEventListener('focus', onFocus)
    windowTarget.removeEventListener('blur', onBlur)
    documentTarget.removeEventListener('visibilitychange', onVisible)
  }
}
