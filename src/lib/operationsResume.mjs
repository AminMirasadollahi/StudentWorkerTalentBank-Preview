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
  let windowFocused = true

  function markInactive() {
    if (disposed || needsVerification) return
    needsVerification = true
    activationGeneration += 1
  }

  async function recheck() {
    if (disposed || inFlight ||
        !needsVerification || !windowFocused ||
        documentTarget.visibilityState === 'hidden') return
    needsVerification = false
    inFlight = true
    const generation = activationGeneration
    onStart()
    try {
      const fresh = await readIdentity()
      // A result started before the browser left the page cannot authorize a
      // later activation. Only apply the generation that is still current.
      if (!disposed && generation === activationGeneration && windowFocused &&
          documentTarget.visibilityState !== 'hidden') onIdentity(fresh)
    } catch (error) {
      if (!disposed && generation === activationGeneration && windowFocused &&
          documentTarget.visibilityState !== 'hidden') onFailure(error)
    } finally {
      inFlight = false
      if (disposed) return
      if (needsVerification) {
        // If still blurred, remain frozen. A fresh focused activation MUST
        // produce its own server read before any protected content is revealed.
        if (windowFocused && documentTarget.visibilityState !== 'hidden')
          void recheck()
      } else if (windowFocused && documentTarget.visibilityState !== 'hidden') {
        onFinish()
      }
    }
  }

  const onFocus = () => { windowFocused = true; void recheck() }
  const onBlur = () => { windowFocused = false; markInactive() }
  const onVisible = () => {
    if (documentTarget.visibilityState === 'hidden') markInactive()
    else if (windowFocused) void recheck()
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
