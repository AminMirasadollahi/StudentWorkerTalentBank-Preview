import { useEffect, useMemo, useState } from 'react'
import { availabilitySlots, skills, units } from './data'
import { getStudentWorkerReport } from './lib/reporting'
import './report.css'

const REPORT_SESSION_KEY = 'student-worker-report:access:v1'
const faNumber = new Intl.NumberFormat('fa-IR')
const dateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Tehran',
})

const unitMap = new Map(units.map(unit => [unit.code, unit.label]))
const skillMap = new Map(skills.map(skill => [skill.code, skill.label]))
const slotMap = new Map(availabilitySlots.map(slot => [slot.key, `${slot.label} ${slot.hours}`]))

function unitLabel(code) {
  return unitMap.get(code) || code || '—'
}

function skillLabel(code) {
  return skillMap.get(code) || code || '—'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date)
}

function availabilityLabel(value) {
  if (!Array.isArray(value)) return '—'
  return value.map(item => {
    const [day, slot] = String(item).split('|')
    return `${day || '—'}، ${slotMap.get(slot) || slot || '—'}`
  }).join(' | ') || '—'
}

function listLabel(values, formatter = value => value) {
  if (!Array.isArray(values) || values.length === 0) return '—'
  return values.map(formatter).join('، ')
}

function yesNo(value) {
  return value ? 'بله' : 'خیر'
}

function reviewStatusLabel(value) {
  const labels = {
    new: 'جدید',
    reviewing: 'در حال بررسی',
    contacted: 'تماس گرفته شد',
    accepted: 'پذیرفته',
    rejected: 'عدم انتخاب',
  }
  return labels[value] || value || '—'
}

function safeText(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

async function downloadExcel(rows) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('درخواست‌های دانشجوکار', {
    views: [{ rightToLeft: true }],
  })

  const data = rows.map((row, index) => ({
    ردیف: index + 1,
    'تاریخ ثبت': formatDate(row.submitted_at),
    'نام و نام خانوادگی': safeText(row.full_name),
    'شماره دانشجویی': safeText(row.student_number),
    'شماره تماس': safeText(row.phone),
    'شماره ایتا / شبکه اجتماعی': safeText(row.social_phone),
    رشته: safeText(row.major),
    'سال ورود': row.entry_year ?? '',
    'ترم جاری': row.current_semester ?? '',
    'حوزه اصلی': unitLabel(row.primary_unit),
    'حوزه‌های بعدی': listLabel(row.secondary_units, unitLabel),
    'زمان‌های در دسترس': availabilityLabel(row.availability),
    مهارت‌ها: listLabel(row.selected_skills, skillLabel),
    'سه مهارت برتر': listLabel(row.top_skills, skillLabel),
    'مهارت دیگر': safeText(row.other_skill_text),
    'سابقه مرتبط': yesNo(row.has_relevant_experience),
    'شرح سابقه': safeText(row.experience_summary),
    'انتظار از همکاری': safeText(row.benefit_expectation),
    'لینک نمونه‌کار': safeText(row.portfolio_url),
    'رضایت بانک استعداد': yesNo(row.consent_talent_bank),
    وضعیت: reviewStatusLabel(row.review_status),
  }))

  const headers = data[0] ? Object.keys(data[0]) : [
    'ردیف', 'تاریخ ثبت', 'نام و نام خانوادگی', 'شماره دانشجویی', 'شماره تماس',
    'شماره ایتا / شبکه اجتماعی', 'رشته', 'سال ورود', 'ترم جاری', 'حوزه اصلی',
    'حوزه‌های بعدی', 'زمان‌های در دسترس', 'مهارت‌ها', 'سه مهارت برتر',
    'مهارت دیگر', 'سابقه مرتبط', 'شرح سابقه', 'انتظار از همکاری', 'لینک نمونه‌کار',
    'رضایت بانک استعداد', 'وضعیت',
  ]

  sheet.columns = headers.map(header => ({
    header,
    key: header,
    width: Math.min(Math.max(header.length + 6, 14), 38),
  }))

  data.forEach(row => sheet.addRow(row))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).height = 24
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
  sheet.views = [{ state: 'frozen', ySplit: 1, rightToLeft: true }]
  sheet.eachRow((row, rowNumber) => {
    row.alignment = {
      vertical: 'top',
      horizontal: rowNumber === 1 ? 'center' : 'right',
      wrapText: true,
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `student-worker-report-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function ReportApp() {
  const [accessCode, setAccessCode] = useState(() => {
    try { return sessionStorage.getItem(REPORT_SESSION_KEY) || '' } catch { return '' }
  })
  const [authorized, setAuthorized] = useState(false)
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState({ major: '', entryYear: '', primaryUnit: '' })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)

  const rows = data?.rows || []
  const summary = data?.summary || {}
  const filterOptions = data?.filters || {}

  const conversion = useMemo(() => {
    const starts = Number(summary.form_starts || 0)
    const submissions = Number(summary.tracked_submissions || 0)
    return starts > 0 ? Math.round((submissions / starts) * 100) : 0
  }, [summary.form_starts, summary.tracked_submissions])

  const loadReport = async (code = accessCode, nextFilters = filters, remember = false) => {
    const normalized = code.trim()
    if (!normalized) {
      setError('کد دسترسی را وارد کنید.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await getStudentWorkerReport(normalized, nextFilters)
      setData(result)
      setAuthorized(true)
      setAccessCode(normalized)
      if (remember) {
        try { sessionStorage.setItem(REPORT_SESSION_KEY, normalized) } catch { /* convenience only */ }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'دریافت گزارش با خطا مواجه شد.')
      if (!authorized) {
        try { sessionStorage.removeItem(REPORT_SESSION_KEY) } catch { /* ignore */ }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    document.title = 'گزارش همکاری دانشجویی'
    if (accessCode) void loadReport(accessCode, filters, true)
    // only bootstrap saved session code
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!detail) return
    const close = event => {
      if (event.key === 'Escape') setDetail(null)
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [detail])

  const applyFilters = () => void loadReport(accessCode, filters)
  const clearFilters = () => {
    const empty = { major: '', entryYear: '', primaryUnit: '' }
    setFilters(empty)
    void loadReport(accessCode, empty)
  }

  const logout = () => {
    try { sessionStorage.removeItem(REPORT_SESSION_KEY) } catch { /* ignore */ }
    setAccessCode('')
    setAuthorized(false)
    setData(null)
    setFilters({ major: '', entryYear: '', primaryUnit: '' })
    setDetail(null)
    setError('')
  }

  const handleExport = async () => {
    if (!rows.length) return
    setExporting(true)
    setError('')
    try {
      await downloadExcel(rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ساخت فایل Excel با خطا مواجه شد.')
    } finally {
      setExporting(false)
    }
  }

  if (!authorized) {
    return (
      <main className="report-shell report-shell--login" dir="rtl">
        <section className="report-login-card">
          <div className="report-login-mark" aria-hidden="true">▦</div>
          <span className="report-eyebrow">مدیریت سامانه دانشجوکار</span>
          <h1>ورود به صفحه گزارش‌گیری</h1>
          <p>این صفحه شامل اطلاعات ثبت‌شده دانشجویان است و فقط با کد دسترسی باز می‌شود.</p>

          <label className="report-field">
            <span>کد دسترسی</span>
            <input
              type="password"
              value={accessCode}
              autoComplete="current-password"
              autoFocus
              onChange={event => {
                setAccessCode(event.target.value)
                setError('')
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') void loadReport(accessCode, filters, true)
              }}
            />
          </label>

          {error && <div className="report-alert report-alert--error">{error}</div>}

          <button
            type="button"
            className="report-btn report-btn--primary"
            disabled={loading}
            onClick={() => void loadReport(accessCode, filters, true)}
          >
            {loading ? 'در حال بررسی…' : 'ورود به گزارش‌ها'}
          </button>

          <a className="report-back-link" href={window.location.pathname}>بازگشت به فرم عمومی</a>
        </section>
      </main>
    )
  }

  return (
    <main className="report-shell report-shell--dashboard" dir="rtl">
      <header className="report-header">
        <div>
          <span className="report-eyebrow">دانشکده علوم انسانی شهید رجایی بابل</span>
          <h1>داشبورد همکاری دانشجویی</h1>
          <p>نمای خلاصه ثبت‌ها، بازدیدها و درخواست‌های دانشجوکار</p>
        </div>
        <div className="report-header-actions">
          <a className="report-btn report-btn--ghost" href={window.location.pathname} target="_blank" rel="noreferrer">فرم عمومی</a>
          <button type="button" className="report-btn report-btn--ghost" onClick={logout}>خروج</button>
        </div>
      </header>

      <section className="report-kpis" aria-label="آمار کلی">
        <article><span>کل ثبت‌ها</span><strong>{faNumber.format(summary.total_applications || 0)}</strong></article>
        <article><span>نتیجه فیلتر</span><strong>{faNumber.format(summary.filtered_applications || 0)}</strong></article>
        <article><span>بازدید صفحه</span><strong>{faNumber.format(summary.pageviews || 0)}</strong></article>
        <article><span>بازدیدکننده</span><strong>{faNumber.format(summary.visitors || 0)}</strong></article>
        <article><span>شروع فرم</span><strong>{faNumber.format(summary.form_starts || 0)}</strong></article>
        <article><span>نرخ تکمیل جدید</span><strong>{faNumber.format(conversion)}٪</strong></article>
      </section>

      <p className="report-analytics-note">
        آمار بازدید و نرخ تکمیل از زمان فعال‌شدن Analytics در این نسخه محاسبه می‌شود و شامل بازدیدهای پیش از آن نیست.
        {summary.analytics_started_at ? ` شروع ثبت آمار: ${formatDate(summary.analytics_started_at)}` : ''}
      </p>

      <section className="report-panel report-filter-panel">
        <div className="report-panel-heading">
          <div><h2>فیلتر درخواست‌ها</h2><p>رشته، سال ورود و حوزه اصلی همکاری</p></div>
          <button type="button" className="report-btn report-btn--light" onClick={clearFilters} disabled={loading}>پاک کردن فیلترها</button>
        </div>

        <div className="report-filters">
          <label className="report-field">
            <span>رشته</span>
            <select value={filters.major} onChange={event => setFilters(value => ({ ...value, major: event.target.value }))}>
              <option value="">همه رشته‌ها</option>
              {(filterOptions.majors || []).map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="report-field">
            <span>سال ورود</span>
            <select value={filters.entryYear} onChange={event => setFilters(value => ({ ...value, entryYear: event.target.value }))}>
              <option value="">همه سال‌ها</option>
              {(filterOptions.entry_years || []).map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="report-field">
            <span>حوزه اصلی</span>
            <select value={filters.primaryUnit} onChange={event => setFilters(value => ({ ...value, primaryUnit: event.target.value }))}>
              <option value="">همه حوزه‌ها</option>
              {units.map(unit => <option key={unit.code} value={unit.code}>{unit.label}</option>)}
            </select>
          </label>
          <button type="button" className="report-btn report-btn--primary report-filter-submit" onClick={applyFilters} disabled={loading}>
            {loading ? 'در حال دریافت…' : 'اعمال فیلتر'}
          </button>
        </div>
      </section>

      <section className="report-panel">
        <div className="report-panel-heading">
          <div>
            <h2>درخواست‌های ثبت‌شده</h2>
            <p>{faNumber.format(rows.length)} مورد در فهرست فعلی</p>
          </div>
          <div className="report-panel-actions">
            <button type="button" className="report-btn report-btn--light" onClick={() => void loadReport(accessCode, filters)} disabled={loading}>به‌روزرسانی</button>
            <button type="button" className="report-btn report-btn--primary" onClick={handleExport} disabled={exporting || rows.length === 0}>
              {exporting ? 'در حال ساخت…' : 'خروجی Excel'}
            </button>
          </div>
        </div>

        {error && <div className="report-alert report-alert--error">{error}</div>}

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>ثبت</th>
                <th>نام دانشجو</th>
                <th>رشته / ورودی</th>
                <th>حوزه اصلی</th>
                <th>راه ارتباطی</th>
                <th>مهارت‌های برتر</th>
                <th>جزئیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>{formatDate(row.submitted_at)}</td>
                  <td><strong>{safeText(row.full_name)}</strong><small>{safeText(row.student_number)}</small></td>
                  <td>{safeText(row.major)}<small>ورودی {row.entry_year ?? '—'} · ترم {row.current_semester ?? '—'}</small></td>
                  <td>{unitLabel(row.primary_unit)}</td>
                  <td><span dir="ltr">{safeText(row.phone)}</span></td>
                  <td>{listLabel(row.top_skills, skillLabel)}</td>
                  <td><button type="button" className="report-detail-btn" onClick={() => setDetail(row)}>مشاهده</button></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan="7" className="report-empty">موردی با فیلترهای فعلی پیدا نشد.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <div className="report-modal" role="dialog" aria-modal="true" onMouseDown={event => {
          if (event.target === event.currentTarget) setDetail(null)
        }}>
          <section className="report-modal-card">
            <div className="report-modal-heading">
              <div><span className="report-eyebrow">جزئیات درخواست</span><h2>{safeText(detail.full_name)}</h2></div>
              <button type="button" className="report-close-btn" onClick={() => setDetail(null)} aria-label="بستن">×</button>
            </div>

            <div className="report-detail-grid">
              <div><span>شماره دانشجویی</span><strong>{safeText(detail.student_number)}</strong></div>
              <div><span>تاریخ ثبت</span><strong>{formatDate(detail.submitted_at)}</strong></div>
              <div><span>شماره تماس</span><strong dir="ltr">{safeText(detail.phone)}</strong></div>
              <div><span>ایتا / شبکه اجتماعی</span><strong dir="ltr">{safeText(detail.social_phone)}</strong></div>
              <div><span>رشته</span><strong>{safeText(detail.major)}</strong></div>
              <div><span>سال ورود / ترم</span><strong>{detail.entry_year ?? '—'} / {detail.current_semester ?? '—'}</strong></div>
              <div><span>حوزه اصلی</span><strong>{unitLabel(detail.primary_unit)}</strong></div>
              <div><span>حوزه‌های بعدی</span><strong>{listLabel(detail.secondary_units, unitLabel)}</strong></div>
              <div className="report-detail-wide"><span>زمان‌های در دسترس</span><strong>{availabilityLabel(detail.availability)}</strong></div>
              <div className="report-detail-wide"><span>مهارت‌ها</span><strong>{listLabel(detail.selected_skills, skillLabel)}</strong></div>
              <div className="report-detail-wide"><span>مهارت‌های برتر</span><strong>{listLabel(detail.top_skills, skillLabel)}</strong></div>
              <div className="report-detail-wide"><span>مهارت دیگر</span><strong>{safeText(detail.other_skill_text)}</strong></div>
              <div><span>سابقه مرتبط</span><strong>{yesNo(detail.has_relevant_experience)}</strong></div>
              <div><span>بانک استعداد</span><strong>{yesNo(detail.consent_talent_bank)}</strong></div>
              <div className="report-detail-wide"><span>شرح سابقه</span><strong>{safeText(detail.experience_summary)}</strong></div>
              <div className="report-detail-wide"><span>انتظار از همکاری</span><strong>{safeText(detail.benefit_expectation)}</strong></div>
              <div className="report-detail-wide"><span>نمونه‌کار</span><strong>{safeText(detail.portfolio_url)}</strong></div>
              <div><span>وضعیت</span><strong>{reviewStatusLabel(detail.review_status)}</strong></div>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
