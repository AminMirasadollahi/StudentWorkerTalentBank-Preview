// Only classify transport failures as retryable. A 401/403, revoked role,
// missing session or invalid token must NEVER be accepted as authentication.
export function isTransientIdentityTransportError(error) {
  if (!error || typeof error !== 'object') return false
  if (error.name === 'AuthRetryableFetchError') return true
  const message = String(error.message || '')
  return /(?:failed to fetch|networkerror|network request failed|connection reset|connection closed|err_connection_reset|load failed)/i.test(message)
}
