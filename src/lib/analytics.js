import { campaignCode, supabase } from './supabase'

const VISITOR_KEY = 'student-worker-analytics:visitor:v1'
const SESSION_KEY = 'student-worker-analytics:session:v1'

function randomUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  if (bytes.some(Boolean)) {
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return '00000000-0000-4000-8000-000000000000'
}

function getOrCreate(storage, key) {
  try {
    const current = storage.getItem(key)
    if (current) return current
    const next = randomUuid()
    storage.setItem(key, next)
    return next
  } catch {
    return randomUuid()
  }
}

export async function trackStudentWorkerEvent(eventType) {
  try {
    const visitorId = getOrCreate(localStorage, VISITOR_KEY)
    const sessionId = getOrCreate(sessionStorage, SESSION_KEY)

    const { error } = await supabase.rpc('track_student_worker_event', {
      p_event_type: eventType,
      p_visitor_id: visitorId,
      p_session_id: sessionId,
      p_campaign_code: campaignCode,
    })

    if (error && import.meta.env.DEV) {
      console.warn('Analytics event was not recorded', error)
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Analytics event failed', error)
    }
  }
}
