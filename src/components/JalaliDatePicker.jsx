import { useEffect, useId, useMemo, useRef, useState } from 'react'
import './jalali-date-picker.css'

// Date values remain ISO Gregorian YYYY-MM-DD at API/database boundaries.
// Only the calendar and selection experience use the Persian calendar.
const dayFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian', {
  timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric',
})
const titleFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC', year: 'numeric', month: 'long',
})
const selectedFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
})
const weekdayLabels = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
const numberFormat = new Intl.NumberFormat('fa-IR')

function toDate(iso) {
  return new Date(`${iso}T12:00:00Z`)
}
function isoShift(iso, days) {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function jalaliParts(iso) {
  return Object.fromEntries(
    dayFormatter.formatToParts(toDate(iso))
      .filter(p => ['year', 'month', 'day'].includes(p.type))
      .map(p => [p.type, Number(p.value)]),
  )
}
function firstOfMonth(iso) {
  const { day } = jalaliParts(iso)
  return isoShift(iso, 1 - day)
}
function gregWeekdayOffset(iso) {
  const day = toDate(iso).getUTCDay() // 0 Sunday, 6 Saturday
  return (day + 1) % 7
}
function todayTehran() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(x => [x.type, x.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * Native-feeling lightweight, keyboard-operable Jalali date picker.
 * Does not change SQL dates or require extra frontend dependencies.
 */
export default function JalaliDatePicker({
  value, onChange, min, max, disabled = false, ariaLabel = 'تاریخ شمسی',
}) {
  const fieldId = useId()
  const containerRef = useRef(null)
  const [opened, setOpened] = useState(false)
  const [anchor, setAnchor] = useState(value || todayTehran())

  useEffect(() => {
    if (value) setAnchor(value)
  }, [value])

  useEffect(() => {
    if (!opened) return
    const closeOnOutside = event => {
      if (!containerRef.current?.contains(event.target)) setOpened(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [opened])

  const base = useMemo(() => firstOfMonth(anchor), [anchor])
  const days = useMemo(() => {
    const firstCell = isoShift(base, -gregWeekdayOffset(base))
    return Array.from({ length: 42 }, (_, i) => isoShift(firstCell, i))
  }, [base])
  const currentJalali = jalaliParts(base)
  const todayValue = todayTehran()

  const selectDay = iso => {
    if ((min && iso < min) || (max && iso > max)) return
    onChange(iso)
    setOpened(false)
  }
  const stepMonth = delta => {
    // The 1st of the previous month is the day before current month start.
    // Every Persian month has 29-31 days, so start + 32 is always next month.
    setAnchor(delta < 0 ? isoShift(base, -1) : isoShift(base, 32))
  }

  return (
    <div className="jd-field" ref={containerRef}>
      <button
        type="button"
        className="jd-control"
        id={fieldId}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={opened}
        aria-haspopup="dialog"
        onClick={() => setOpened(o => !o)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpened(false)
        }}
      >
        <span>{value ? selectedFormatter.format(toDate(value)) : 'انتخاب تاریخ'}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="3" y="5" width="18" height="16" rx="2"/>
          <path d="M7 3v4M17 3v4M3 10h18"/>
        </svg>
      </button>
      {opened && (
        <div className="jd-popup" role="dialog" aria-label="انتخاب تاریخ از تقویم شمسی" dir="rtl"
          onKeyDown={e => { if (e.key === 'Escape') setOpened(false) }}>
          <div className="jd-heading">
            <button type="button" className="jd-arrow" aria-label="ماه قبل" onClick={() => stepMonth(-1)}>‹</button>
            <strong>{titleFormatter.format(toDate(base))}</strong>
            <button type="button" className="jd-arrow" aria-label="ماه بعد" onClick={() => stepMonth(1)}>›</button>
          </div>
          <div className="jd-grid" role="grid" aria-label="روزهای ماه">
            {weekdayLabels.map((w,i) => <span className="jd-weekday" key={i}>{w}</span>)}
            {days.map(iso => {
              const p = jalaliParts(iso)
              const inMonth = p.month === currentJalali.month && p.year === currentJalali.year
              const outOfRange = (min && iso < min) || (max && iso > max)
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    'jd-day',
                    !inMonth ? 'jd-outside' : '',
                    iso === value ? 'jd-selected' : '',
                    iso === todayValue ? 'jd-today' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={Boolean(outOfRange)}
                  aria-selected={iso === value}
                  aria-label={selectedFormatter.format(toDate(iso))}
                  onClick={() => selectDay(iso)}
                >{numberFormat.format(p.day)}</button>
              )
            })}
          </div>
          <div className="jd-footer">
            <button type="button" onClick={() => {
              if ((!min || todayValue >= min) && (!max || todayValue <= max)) selectDay(todayValue)
              else setAnchor(todayValue)
            }}>امروز</button>
            <button type="button" onClick={() => setOpened(false)}>بستن</button>
          </div>
        </div>
      )}
    </div>
  )
}
