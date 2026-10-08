import { useEffect, useMemo, useState } from 'react'
import {
  currentOperationsIdentity,
  getOperationsCandidates,
  provisionWorker,
  setCandidateScreening,
  signInOperations,
  signOutOperations,
} from './lib/operations'
import { opsClient } from './lib/operations'
import { AdminOperations, WorkerOperations } from './OperationsWorkspace'
import './report.css'
import './ops.css'

const unitLabels = {
  library: 'کتابخانه',
  public_relations: 'روابط عمومی',
  research: 'پژوهش',
}
const screeningChoices = [
  ['pending', 'در انتظار بررسی'],
  ['approved', 'تأیید'],
  ['not_approved', 'عدم تأیید'],
]
const clearanceChoices = [
  ['pending', 'در انتظار استعلام'],
  ['cleared', 'تأیید شده'],
  ['not_cleared', 'عدم تأیید'],
]
const numbers = new Intl.NumberFormat('fa-IR')
const shortDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  dateStyle: 'medium',
  timeZone: 'Asia/Tehran',
})

function getMessage(error) {
  const raw = String(error?.message || '')
  if (/Invalid login credentials/i.test(raw)) return 'ایمیل یا رمز عبور صحیح نیست.'
  if (/Email not confirmed/i.test(raw)) return 'ایمیل این حساب هنوز تأیید نشده است.'
  if (/JWT|Auth session missing/i.test(raw)) return 'نشست شما منقضی شده؛ دوباره وارد شوید.'
  if (/Failed to fetch|Network/i.test(raw)) return 'ارتباط برقرار نشد. اینترنت را بررسی کنید.'
  if (/operations_access_denied/i.test(raw)) return 'این حساب مجوز مدیریت سامانه را ندارد.'
  if (/invalid_screening_status/i.test(raw)) return 'وضعیت مصاحبه یا استعلام نامعتبر است.'
  if (/screening_locked_after_activation/i.test(raw)) return 'پس از فعال‌سازی، وضعیت پذیرش از این فرم قابل تغییر نیست.'
  return 'عملیات تکمیل نشد. دوباره تلاش کنید و در صورت تکرار مشکل، دسترسی‌ها را بررسی کنید.'
}

function Login({ onLogin, busy, error, defaultMode }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <main className="report-shell report-shell--login ops-root" dir="rtl">
      <form
        className="report-login-card"
        onSubmit={event => { event.preventDefault(); onLogin(email.trim(), password) }}
      >
        <span className="report-eyebrow">دانشکده علوم انسانی شهید رجایی بابل</span>
        <div className="report-login-mark" aria-hidden="true">▦</div>
        <h1>ورود به {defaultMode === 'worker' ? 'پنل دانشجوکار' : 'مدیریت دانشجوکارها'}</h1>
        <p>این بخش فقط برای دانشجوکارهای پذیرفته‌شده و مدیر مجاز است.</p>
        <label className="report-field">
          <span>ایمیل حساب</span>
          <input
            type="email"
            autoComplete="username"
            required
            dir="ltr"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="example@email.com"
          />
        </label>
        <label className="report-field ops-login-password">
          <span>رمز عبور</span>
          <input
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            dir="ltr"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </label>
        {error && <div role="alert" className="report-alert report-alert--error">{error}</div>}
        <button type="submit" className="report-btn report-btn--primary" disabled={busy}>
          {busy ? 'در حال بررسی…' : 'ورود'}
        </button>
        <a className="report-back-link" href={window.location.pathname}>بازگشت به فرم عمومی</a>
      </form>
    </main>
  )
}

function WorkerView({ profile, onLogout }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const changePassword = async event => {
    event.preventDefault()
    setMessage('')
    setPasswordError('')
    if (password.length < 12 || password !== confirmation) {
      setPasswordError('رمز جدید باید حداقل ۱۲ نویسه باشد و تکرار آن یکسان وارد شود.')
      return
    }
    setSaving(true)
    const { error } = await opsClient.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      setPasswordError('تغییر رمز انجام نشد؛ لطفاً دوباره وارد حساب شوید و تلاش کنید.')
      return
    }
    setMessage('رمز حساب شما تغییر کرد.')
    setPassword('')
    setConfirmation('')
  }

  return (
    <main className="report-shell report-shell--dashboard ops-root" dir="rtl">
      <header className="report-header">
        <div>
          <span className="report-eyebrow">پنل اختصاصی دانشجوکار</span>
          <h1>سلام، {profile.name}</h1>
          <p>{unitLabels[profile.unit] || profile.unit} · حساب فعال</p>
        </div>
        <button className="report-btn report-btn--ghost" type="button" onClick={onLogout}>
          خروج
        </button>
      </header>
      <WorkerOperations profile={profile} />
      <section className="report-panel ops-password-panel">
        <h2>تغییر رمز عبور</h2>
        <p>اگر با رمز موقت وارد شده‌اید، بهتر است رمز شخصی تازه‌ای انتخاب کنید.</p>
        <form onSubmit={changePassword}>
          <label className="report-field">
            <span>رمز جدید (حداقل ۱۲ نویسه)</span>
            <input type="password" minLength={12} required
              autoComplete="new-password" dir="ltr"
              value={password} onChange={event => setPassword(event.target.value)}/>
          </label>
          <label className="report-field">
            <span>تکرار رمز جدید</span>
            <input type="password" minLength={12} required
              autoComplete="new-password" dir="ltr"
              value={confirmation} onChange={event => setConfirmation(event.target.value)}/>
          </label>
          {passwordError && <p className="report-alert report-alert--error" role="alert">{passwordError}</p>}
          {message && <p className="ops-alert-success" role="status">{message}</p>}
          <button className="report-btn report-btn--primary" type="submit"
            disabled={saving || !password || !confirmation}>
            {saving ? 'در حال ذخیره…' : 'تغییر رمز'}
          </button>
        </form>
      </section>
    </main>
  )
}

function CandidateCard({ candidate, saving, onSave, onProvision }) {
  const [interview, setInterview] = useState(candidate.interview_status || 'pending')
  const [clearance, setClearance] = useState(candidate.clearance_status || 'pending')
  const [email, setEmail] = useState('')
  const [unit, setUnit] = useState(candidate.primary_unit)
  const hasWorker = Boolean(candidate.worker_id)
  const accepted = candidate.interview_status === 'approved'
    && candidate.clearance_status === 'cleared'
  const isChanged = interview !== candidate.interview_status
    || clearance !== candidate.clearance_status
  const eligible = accepted && !isChanged && !hasWorker

  return (
    <article className="ops-candidate">
      <div className="ops-candidate__head">
        <div>
          <strong>{candidate.full_name}</strong>
          <small>{candidate.major} · ورودی {candidate.entry_year} · {unitLabels[candidate.primary_unit]}</small>
          <small dir="ltr">{candidate.phone}</small>
        </div>
        <span className={`ops-status ${hasWorker ? 'ops-status--active' : ''}`}>
          {hasWorker ? 'دانشجوکار فعال' : 'داوطلب'}
        </span>
      </div>
      {!hasWorker && (
        <>
          <div className="ops-field-row">
            <label className="report-field">
              <span>نتیجه مصاحبه</span>
              <select value={interview} onChange={e => setInterview(e.target.value)} disabled={saving}>
                {screeningChoices.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </label>
            <label className="report-field">
              <span>نتیجه استعلام (فقط وضعیت)</span>
              <select value={clearance} onChange={e => setClearance(e.target.value)} disabled={saving}>
                {clearanceChoices.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </label>
          </div>
          <button className="report-btn report-btn--light ops-small-action"
            type="button" disabled={!isChanged || saving}
            onClick={() => onSave(candidate.id, interview, clearance)}>
            ثبت نتیجه بررسی
          </button>
          {eligible && (
            <form className="ops-provision" onSubmit={event => {
              event.preventDefault()
              onProvision(candidate.id, unit, email)
            }}>
              <div className="ops-field-row">
                <label className="report-field">
                  <span>ایمیل معتبر دانشجوکار پذیرفته‌شده</span>
                  <input type="email" required dir="ltr" autoComplete="off"
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="student@example.com" disabled={saving}/>
                </label>
                <label className="report-field">
                  <span>واحد همکاری</span>
                  <select value={unit} onChange={e => setUnit(e.target.value)} disabled={saving}>
                    {Object.entries(unitLabels).map(([code,label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="report-btn report-btn--primary" type="submit" disabled={saving}>
                ایجاد حساب و فعال‌سازی
              </button>
              <small>رمز موقت فقط یک‌بار نمایش داده می‌شود؛ آن را از مسیر امن به دانشجو تحویل دهید.</small>
            </form>
          )}
        </>
      )}
      {hasWorker && <p className="ops-worker-state">واحد فعال: {unitLabels[candidate.worker_unit]} · وضعیت: {candidate.worker_state}</p>}
    </article>
  )
}

function AdminView({ onLogout }) {
  const [rows, setRows] = useState([])
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [issuedCredentials, setIssuedCredentials] = useState(null)
  const [filter, setFilter] = useState('all')
  const [adminSection, setAdminSection] = useState('candidates')

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const results = await getOperationsCandidates()
      setRows(Array.isArray(results) ? results : [])
    } catch (e) {
      setError(getMessage(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const saveScreening = async (id, interview, clearance) => {
    setBusyId(id); setError(''); setFlash('')
    try {
      await setCandidateScreening(id, interview, clearance)
      setFlash('وضعیت بررسی ثبت شد.')
      await refresh()
    } catch (e) { setError(getMessage(e)) }
    finally { setBusyId('') }
  }

  const activate = async (id, unit, email) => {
    setBusyId(id); setError(''); setFlash('')
    try {
      const result = await provisionWorker(id, unit, email)
      setIssuedCredentials(result)
      setFlash('حساب دانشجوکار فعال شد.')
      await refresh()
    } catch (e) { setError(getMessage(e)) }
    finally { setBusyId('') }
  }

  const filtered = useMemo(() => rows.filter(row => {
    if (filter === 'active') return Boolean(row.worker_id)
    if (filter === 'ready') return !row.worker_id &&
      row.interview_status === 'approved' && row.clearance_status === 'cleared'
    if (filter === 'pending') return !row.worker_id
    return true
  }), [rows, filter])

  const activeCount = rows.filter(row => Boolean(row.worker_id)).length
  const readyCount = rows.filter(row => !row.worker_id
    && row.interview_status === 'approved' && row.clearance_status === 'cleared').length

  return (
    <main className="report-shell report-shell--dashboard ops-root" dir="rtl">
      <header className="report-header">
        <div>
          <span className="report-eyebrow">دانشکده علوم انسانی شهید رجایی بابل</span>
          <h1>مدیریت دانشجوکارها</h1>
          <p>بررسی داوطلبان، مصاحبه، استعلام و فعال‌سازی حساب</p>
        </div>
        <div className="report-header-actions">
          <button type="button" className="report-btn report-btn--ghost" onClick={refresh} disabled={loading}>به‌روزرسانی</button>
          <button type="button" className="report-btn report-btn--ghost" onClick={onLogout}>خروج</button>
        </div>
      </header>
      <nav className="ow-tabs" aria-label="بخش‌های مدیریت دانشجوکار">
        <button type="button"
          className={adminSection === 'candidates' ? 'ow-tab is-selected' : 'ow-tab'}
          onClick={() => setAdminSection('candidates')}>پذیرش داوطلبان</button>
        <button type="button"
          className={adminSection === 'work' ? 'ow-tab is-selected' : 'ow-tab'}
          onClick={() => setAdminSection('work')}>برنامه و کارها</button>
      </nav>
      {adminSection === 'candidates' && <>
      <section className="ops-kpis" aria-label="وضعیت دانشجوکارها">
        <article><span>کل داوطلبان</span><strong>{numbers.format(rows.length)}</strong></article>
        <article><span>آماده فعال‌سازی</span><strong>{numbers.format(readyCount)}</strong></article>
        <article><span>دانشجوکار فعال‌شده</span><strong>{numbers.format(activeCount)}</strong></article>
      </section>
      <section className="report-panel">
        <div className="report-panel-heading">
          <div><h2>داوطلبان و پذیرش</h2><p>اطلاعات ثبت‌نام به همین پرونده متصل می‌ماند.</p></div>
          <label className="report-field ops-filter">
            <span>نمایش</span>
            <select value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">همه</option>
              <option value="pending">در انتظار فعال‌سازی</option>
              <option value="ready">تأییدهای تکمیل‌شده</option>
              <option value="active">فعال‌شده‌ها</option>
            </select>
          </label>
        </div>
        {error && <div role="alert" className="report-alert report-alert--error">{error}</div>}
        {flash && <div role="status" className="ops-alert-success">{flash}</div>}
        {loading ? <p className="ops-muted">در حال دریافت اطلاعات…</p> :
          filtered.length ? (
            <div className="ops-list">
              {filtered.map(row => (
                <CandidateCard
                  key={row.id + ':' + row.interview_status + ':' + row.clearance_status + ':' + (row.worker_id || '')}
                  candidate={row}
                  saving={busyId === row.id}
                  onSave={saveScreening}
                  onProvision={activate}
                />
              ))}
            </div>
          ) : <p className="ops-muted">موردی برای نمایش وجود ندارد.</p>}
      </section>
      </>}
      {adminSection === 'work' && <AdminOperations />}
      {issuedCredentials && (
        <div className="ops-modal" role="dialog" aria-modal="true" aria-labelledby="ops-credentials-title">
          <div className="ops-modal__card">
            <h2 id="ops-credentials-title">حساب دانشجوکار ساخته شد</h2>
            <p>این اطلاعات فقط همین یک‌بار نمایش داده می‌شود. از مسیر امن به دانشجوکار تحویل دهید.</p>
            <label className="report-field">
              <span>ایمیل ورود</span>
              <input readOnly dir="ltr" value={issuedCredentials.email}/>
            </label>
            <label className="report-field">
              <span>رمز موقت</span>
              <input readOnly dir="ltr" value={issuedCredentials.temporary_password}/>
            </label>
            <button type="button" className="report-btn report-btn--light"
              onClick={() => navigator.clipboard?.writeText(
                `ایمیل: ${issuedCredentials.email}\nرمز موقت: ${issuedCredentials.temporary_password}`
              )}>
              کپی اطلاعات ورود
            </button>
            <button type="button" className="report-btn report-btn--primary"
              onClick={() => setIssuedCredentials(null)}>متوجه شدم، بستن</button>
          </div>
        </div>
      )}
    </main>
  )
}

export default function OpsApp({ mode = 'admin' }) {
  const [identity, setIdentity] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    document.title = mode === 'worker' ? 'پنل دانشجوکار' : 'مدیریت دانشجوکارها'
    currentOperationsIdentity().then(result => {
      if (mounted) {
        if (result?.role === 'no_access') setError('برای این حساب، دسترسی عملیاتی فعال نشده است.')
        setIdentity(result?.role === 'no_access' ? null : result)
      }
    }).catch(() => {
      if (mounted) setIdentity(null)
    }).finally(() => { if (mounted) setBusy(false) })
    return () => { mounted = false }
  }, [mode])

  const login = async (email, password) => {
    setBusy(true); setError('')
    try {
      await signInOperations(email, password)
      const who = await currentOperationsIdentity()
      if (!who || who.role === 'no_access') {
        await signOutOperations()
        throw new Error('operations_access_denied')
      }
      setIdentity(who)
    } catch (e) { setError(getMessage(e)) }
    finally { setBusy(false) }
  }

  const logout = async () => {
    setBusy(true)
    try { await signOutOperations() }
    finally { setIdentity(null); setBusy(false) }
  }

  if (busy && !identity) return (
    <main className="report-shell report-shell--login ops-root" dir="rtl">
      <div className="report-login-card"><p>در حال بررسی دسترسی…</p></div>
    </main>
  )

  if (!identity) return <Login onLogin={login} busy={busy} error={error} defaultMode={mode}/>
  if (identity.role === 'admin') return <AdminView onLogout={logout}/>
  return <WorkerView profile={identity.profile} onLogout={logout}/>
}
