// SWTB17 intake-only normalization: preserve ASCII payload contracts, including
// the leading zero in Iranian mobile numbers. No Supabase/Auth dependencies.
export function toAsciiDigits(value) {
  return String(value ?? '')
    .replace(/[\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
}

export function digitsOnly(value, maxLength = Infinity) {
  const digits = toAsciiDigits(value).replace(/\D/g, '')
  return Number.isFinite(maxLength) ? digits.slice(0, Math.max(0, maxLength)) : digits
}

export function isValidEntryYearOther(value) {
  const year = toAsciiDigits(value).trim()
  return /^\d{4}$/.test(year) && Number(year) >= 1300 && Number(year) <= 1500
}
