import { useEffect, useMemo, useState } from 'react'
import {
  currentOperationsIdentity,
  getOperationsCandidates,
  provisionWorker,
  setCandidateScreening,
  setCandidateEmail,
  signInOperations,
  signOutOperations,
} from './lib/operations'
import { opsClient } from './lib/operations'
import { normalizeCandidateEmail, isValidCandidateEmail } from './lib/candidateEmail'
import { disabledWorkerCopy } from './lib/workerAccess.mjs'
import { watchOperationsResume } from './lib/operationsResume.mjs'
import { AdminOperations, WorkerOperations } from './OperationsWorkspace'
import {
  WORKER_PASSWORD_RECOVERY_REDIRECT,
  PASSWORD_RECOVERY_PENDING_KEY,
  isRecoveryCallbackHash,
  validNewPasswordPair,
} from './lib/passwordRecovery.mjs'
import './report.css'
import './ops.css'

// Enable only after the SMTP provider and Edge delivery switch are tested.
const emailInvitesAvailable = import.meta.env.VITE_OPS_EMAIL_INVITES_AVAILABLE === 'true'

// Navigation-only state stays above the authorization-check placeholder, so
// secure unmounting cannot reset the selected manager tab or worker filter.
// No credentials, worker records or unsaved form inputs are cached here.
const initialAdminNavigation = () => ({
  section: 'candidates',
  candidateFilter: 'all',
  workView: 'tasks',
  workerId: '',
  taskWorkerId: '',
  taskState: '',
  taskSearch: '',
  taskOrder: 'latest',
  approvalWorkerId: '',
  approvalKind: '',
  historyWorkerId: '',
  historyUnit: '',
  historyReview: '',
  historyFrom: '',
  historyTo: '',
  profileWorkerId: '',
})

// Navigation is non-sensitive and survives secure auth revalidation/unmounts.
const initialWorkerNavigation = () => ({ section:'tasks', taskRange:'today' })

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

function Login({ onLogin, busy, error, defaultMode, notice }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const [sendingRecovery, setSendingRecovery] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  const requestRecovery = async event => {
    event.preventDefault()
    if (sendingRecovery || recoverySent) return
    setRecoveryError('')
    setSendingRecovery(true)
    try {
      const { error: sendError } = await opsClient.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: WORKER_PASSWORD_RECOVERY_REDIRECT },
      )
      if (sendError) throw sendError
      // Deliberately avoid disclosing whether the address has an Auth account.
      setRecoverySent(true)
    } catch {
      setRecoveryError('درخواست در حال حاضر ارسال نشد. کمی بعد دوباره تلاش کنید.')
    } finally {
      setSendingRecovery(false)
    }
  }

  const toggleForgotMode = () => {
    setForgotMode(value => !value)
    setRecoveryError('')
    setRecoverySent(false)
    setPassword('')
  }

  return (
    <main className="report-shell report-shell--login ops-root" dir="rtl">
      <form
        className="report-login-card"
        onSubmit={forgotMode
          ? requestRecovery
          : event => { event.preventDefault(); onLogin(email.trim(), password) }}
      >
        <span className="report-eyebrow">دانشکده علوم انسانی شهید رجایی بابل</span>
        <div className="report-login-mark" aria-hidden="true">▦</div>
        <h1>{forgotMode
          ? 'بازیابی رمز عبور'
          : `ورود به ${defaultMode === 'worker' ? 'پنل دانشجوکار' : 'مدیریت دانشجوکارها'}`}</h1>
        <p>{forgotMode
          ? 'ایمیل همان حساب فعال را وارد کنید. در صورت امکان، لینک تعیین رمز تازه به صندوق شما فرستاده می‌شود.'
          : 'این بخش فقط برای دانشجوکارهای پذیرفته‌شده و مدیر مجاز است.'}</p>
        <label className="report-field">
          <span>ایمیل حساب</span>
          <input
            type="email"
            autoComplete="username"
            required
            dir="ltr"
            value={email}
            onChange={event => { setEmail(event.target.value); setRecoverySent(false) }}
            placeholder="example@email.com"
          />
        </label>
        {!forgotMode && <label className="report-field ops-login-password">
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
        </label>}
        {!forgotMode && notice && <p role="status" className="ops-alert-success">{notice}</p>}
        {!forgotMode && error && <div role="alert" className="report-alert report-alert--error">{error}</div>}
        {forgotMode && recoverySent && <p role="status" className="ops-alert-success">
          اگر این ایمیل به حسابی در سامانه متصل باشد، لینک بازیابی برای آن ارسال شده است.
          صندوق ورودی و هرزنامه را بررسی کنید. لطفاً درخواست را پیاپی تکرار نکنید.
        </p>}
        {forgotMode && recoveryError && <p role="alert" className="report-alert report-alert--error">{recoveryError}</p>}
        <button type="submit" className="report-btn report-btn--primary"
          disabled={busy || sendingRecovery || (forgotMode && recoverySent)}>
          {forgotMode
            ? (sendingRecovery ? 'در حال ارسال درخواست…' : 'ارسال لینک بازیابی')
            : (busy ? 'در حال بررسی…' : 'ورود')}
        </button>
        <button type="button" className="ops-recovery-toggle" onClick={toggleForgotMode}>
          {forgotMode ? 'بازگشت به ورود با رمز' : 'رمز عبورم را فراموش کرده‌ام'}
        </button>
        <a className="report-back-link" href={window.location.pathname}>بازگشت به فرم عمومی</a>
      </form>
    </main>
  )
}

function RecoveryPasswordView({ onComplete, onCancel }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [updated, setUpdated] = useState(false)
  const [error, setError] = useState('')

  const save = async event => {
    event.preventDefault()
    if (saving) return
    if (!updated && !validNewPasswordPair(password, confirmation)) {
      setError('رمز جدید باید ۸ تا ۱۲۸ نویسه باشد و تکرار آن یکسان وارد شود.')
      return
    }
    setSaving(true)
    setError('')
    let passwordWasUpdated = updated
    try {
      if (!updated) {
        const { error: updateError } = await opsClient.auth.updateUser({ password })
        if (updateError) throw updateError
        passwordWasUpdated = true
        setUpdated(true)
        setPassword('')
        setConfirmation('')
      }
      // Require a clean password login after successful recovery.
      await onComplete()
    } catch {
      setError(passwordWasUpdated
        ? 'رمز تغییر کرده، اما خروج خودکار کامل نشده است. دوباره «خروج و بازگشت» را بزنید.'
        : 'ثبت رمز جدید تکمیل نشد. از معتبر بودن لینک مطمئن شوید و دوباره تلاش کنید.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="report-shell report-shell--login ops-root" dir="rtl">
      <section className="report-login-card">
        <span className="report-eyebrow">دانشکده علوم انسانی شهید رجایی بابل</span>
        <h1>تعیین رمز جدید حساب</h1>
        <p>لینک بازیابی تأیید شده است. یک رمز جدید و اختصاصی انتخاب کنید. پس از ثبت، برای ورود باید از همین رمز استفاده کنید.</p>
        <form onSubmit={save} className="ops-recovery-form">
          {!updated && <>
            <label className="report-field">
              <span>رمز جدید (حداقل ۸ نویسه)</span>
              <input type="password" required minLength={8} maxLength={128}
                dir="ltr" autoComplete="new-password"
                value={password} onChange={event => setPassword(event.target.value)}/>
            </label>
            <label className="report-field">
              <span>تکرار رمز جدید</span>
              <input type="password" required minLength={8} maxLength={128}
                dir="ltr" autoComplete="new-password"
                value={confirmation} onChange={event => setConfirmation(event.target.value)}/>
            </label>
          </>}
          {error && <p role="alert" className="report-alert report-alert--error">{error}</p>}
          <button type="submit" className="report-btn report-btn--primary"
            disabled={saving || (!updated && (!password || !confirmation))}>
            {saving ? 'در حال انجام…' : updated ? 'خروج و بازگشت به ورود' : 'ثبت رمز جدید'}
          </button>
        </form>
        <button type="button" className="ops-recovery-toggle" onClick={onCancel} disabled={saving}>
          انصراف و خروج از حساب
        </button>
      </section>
    </main>
  )
}

function WorkerView({ profile, loginEmail, onLogout, initialPasswordRequired = false, navigation, setNavigation }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordEstablished, setPasswordEstablished] = useState(!initialPasswordRequired)
  const [settingsOpen,setSettingsOpen] = useState(false)

  const changePassword = async event => {
    event.preventDefault()
    setMessage('')
    setPasswordError('')
    if (password.length < 8 || password !== confirmation) {
      setPasswordError('رمز جدید باید حداقل ۸ نویسه باشد و تکرار آن یکسان وارد شود.')
      return
    }
    setSaving(true)
    try {
      if (!passwordEstablished) {
        const { data, error } = await opsClient.functions.invoke(
          'ops-complete-worker-onboarding',
          { body: { password } },
        )
        if (error || data?.ok !== true) throw error || new Error(data?.error || 'password_setup_failed')
      } else {
        const { error } = await opsClient.auth.updateUser({ password })
        if (error) throw error
      }
    } catch {
      setSaving(false)
      setPasswordError('ثبت رمز انجام نشد. لطفاً رمز دیگری انتخاب کنید و دوباره تلاش کنید.')
      return
    }
    setSaving(false)
    setMessage('رمز اختصاصی حساب شما ثبت شد.')
    setPasswordEstablished(true)
    setSettingsOpen(false)
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
          {loginEmail && <p className="ops-worker-login-email">
            ایمیل ورود: <bdi dir="ltr">{loginEmail}</bdi>
          </p>}
        </div>
        <div className="report-header-actions">
          {passwordEstablished&&<button className="report-btn report-btn--ghost" type="button"
            aria-expanded={settingsOpen} aria-controls="ops-worker-account-settings"
            onClick={()=>{setSettingsOpen(open=>!open);setPasswordError('');setMessage('')}}>تنظیمات حساب</button>}
          <button className="report-btn report-btn--ghost" type="button" onClick={onLogout}>خروج</button>
        </div>
      </header>
      {passwordEstablished&&message&&<p className="ops-alert-success" role="status">{message}</p>}
      {(!passwordEstablished||settingsOpen)&&<section id="ops-worker-account-settings"
        className={`report-panel ops-password-panel ${!passwordEstablished ? 'ops-password-panel--required' : 'ops-account-settings-panel'}`}>
        {passwordEstablished
          ? <div className="ops-settings-title"><h2>تنظیمات حساب · تغییر رمز عبور</h2>
            <button type="button" className="report-btn report-btn--light"
              onClick={()=>setSettingsOpen(false)}>بستن</button></div>
          : <><h2>در اولین ورود، رمز اختصاصی خودتان را تعیین کنید</h2>
              <p>حساب شما با لینک اختصاصی باز شده است. برای ادامه، یک رمز جدید حداقل ۸ نویسه‌ای تعیین کنید.</p></>}
        <form onSubmit={changePassword}>
          <label className="report-field">
            <span>رمز جدید (حداقل ۸ نویسه)</span>
            <input type="password" minLength={8} required
              autoComplete="new-password" dir="ltr"
              value={password} onChange={event => setPassword(event.target.value)}/>
          </label>
          <label className="report-field">
            <span>تکرار رمز جدید</span>
            <input type="password" minLength={8} required
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
      </section>}
      {passwordEstablished && <WorkerOperations profile={profile} navigation={navigation} setNavigation={setNavigation}/>}
    </main>
  )
}

// A suspended worker may see only their own status. No task, schedule, time,
 // password-management, candidate or manager operations are mounted here.
export function WorkerDisabledView({ profile, onLogout }) {
  const copy = disabledWorkerCopy(profile.state)
  if (!copy) return null

  return (
    <main className="report-shell report-shell--login ops-root" dir="rtl">
      <section className="report-login-card ops-disabled-card" aria-labelledby="ops-disabled-title">
        <span className="report-eyebrow">پنل اختصاصی دانشجوکار</span>
        <div className="report-login-mark" aria-hidden="true">▦</div>
        <h1 id="ops-disabled-title">{copy.title}</h1>
        <p role="status" className="ops-disabled-state">وضعیت حساب: {copy.status}</p>
        <p>{copy.description}</p>
        <dl className="ops-disabled-details">
          <div><dt>دانشجوکار</dt><dd>{profile.name}</dd></div>
          <div><dt>واحد همکاری</dt><dd>{unitLabels[profile.unit] || profile.unit}</dd></div>
        </dl>
        <button type="button" className="report-btn report-btn--primary" onClick={onLogout}>
          خروج از حساب
        </button>
      </section>
    </main>
  )
}

function CandidateCard({ candidate, saving, onSave, onSaveEmail, onProvision, onReissue }) {
  const [interview, setInterview] = useState(candidate.interview_status || 'pending')
  const [clearance, setClearance] = useState(candidate.clearance_status || 'pending')
  const [email, setEmail] = useState(candidate.email || '')
  const [unit, setUnit] = useState(candidate.primary_unit)
  const [onboardingMode, setOnboardingMode] = useState('secure_link')
  const hasWorker = Boolean(candidate.worker_id)
  const accepted = candidate.interview_status === 'approved'
    && candidate.clearance_status === 'cleared'
  const isChanged = interview !== candidate.interview_status
    || clearance !== candidate.clearance_status
  const normalizedEmail = normalizeCandidateEmail(email)
  const savedEmail = candidate.email || ''
  const emailChanged = normalizedEmail !== savedEmail
  const emailValid = isValidCandidateEmail(normalizedEmail)
  const eligible = accepted && !isChanged && !hasWorker && !!savedEmail && !emailChanged

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
      <details className="ops-candidate-controls">
        <summary>{hasWorker?'پرونده حساب و دسترسی':eligible?'بررسی و فعال‌سازی':'جزئیات و بررسی پرونده'}</summary>
      {!hasWorker && (
        <>
          <div className="ops-field-row ops-email-row">
            <label className="report-field">
              <span>ایمیل داوطلب {savedEmail ? '(قابل اصلاح پیش از فعال‌سازی)' : '(برای ثبت‌نام‌های قبلی تکمیل کنید)'}</span>
              <input type="email" dir="ltr" autoComplete="off" maxLength={254}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="student@example.com" disabled={saving}/>
            </label>
            <button className="report-btn report-btn--light ops-small-action" type="button"
              disabled={saving || !emailChanged || !emailValid}
              onClick={() => onSaveEmail(candidate.id, normalizedEmail)}>
              ذخیره ایمیل
            </button>
          </div>
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
          {accepted && !hasWorker && (!savedEmail || emailChanged) && (
            <p className="ops-muted">برای فعال‌سازی حساب، ابتدا یک ایمیل معتبر را ذخیره کنید.</p>
          )}
          {eligible && (
            <form className="ops-provision" onSubmit={event => {
              event.preventDefault()
              onProvision(candidate.id, unit, email, onboardingMode)
            }}>
              <div className="ops-field-row">
                <label className="report-field">
                  <span>ایمیل ذخیره‌شده برای دعوت‌نامه</span>
                  <input type="email" readOnly dir="ltr" value={savedEmail}/>
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
              <label className="report-field ops-onboarding-select">
                <span>روش تحویل دسترسی</span>
                <select value={onboardingMode} onChange={e => setOnboardingMode(e.target.value)}>
                  <option value="secure_link">ساخت لینک امن برای تعیین رمز شخصی (پیشنهادی)</option>
                  <option value="password">نمایش رمز موقت (روش قبلی)</option>
                  <option value="email_link" disabled={!emailInvitesAvailable}>
                    {emailInvitesAvailable
                      ? 'فعال‌سازی حساب و ارسال لینک امن با ایمیل'
                      : 'ارسال ایمیل خودکار (پس از راه‌اندازی SMTP)'}
                  </option>
                </select>
              </label>
              <button className="report-btn report-btn--primary" type="submit" disabled={saving}>
                ایجاد حساب و فعال‌سازی
              </button>
              <small>{onboardingMode === 'secure_link'
                ? 'لینک اختصاصی فقط یک‌بار نمایش داده می‌شود و باید خصوصی تحویل داده شود. تنظیم Redirect URL در Supabase ضروری است.'
                : 'رمز موقت فقط یک‌بار نمایش داده می‌شود؛ آن را از مسیر امن تحویل دهید.'}</small>
            </form>
          )}
        </>
      )}
      {hasWorker && <>
        <p className="ops-worker-state">ایمیل حساب: <span dir="ltr">{candidate.email || '—'}</span></p>
        <p className="ops-worker-state">واحد فعال: {unitLabels[candidate.worker_unit]} · وضعیت: {candidate.worker_state}</p>
        <button className="report-btn report-btn--light ops-small-action"
          type="button" disabled={saving}
          onClick={() => onReissue(candidate.worker_id)}>
          صدور لینک امن تعیین رمز
        </button>
        <small>لینک جدید به معنای الزام تعیین مجدد رمز در ورود بعدی است. فقط با درخواست دانشجو یا برای آزمون از این گزینه استفاده کنید.</small>
      </>}
      </details>
    </article>
  )
}

function AdminView({ onLogout, navigation, setNavigation }) {
  const [rows, setRows] = useState([])
  const [busyId, setBusyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [issuedCredentials, setIssuedCredentials] = useState(null)
  const filter = navigation.candidateFilter
  const adminSection = navigation.section
  const setFilter = value => setNavigation(previous => ({ ...previous, candidateFilter: value }))
  const setAdminSection = value => setNavigation(previous => ({ ...previous, section: value }))

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

  const saveEmail = async (id, email) => {
    setBusyId(id);setError('');setFlash('')
    try {
      await setCandidateEmail(id,email)
      setFlash('ایمیل داوطلب در پرونده ذخیره شد.')
      await refresh()
    } catch (e) { setError(getMessage(e)) }
    finally { setBusyId('') }
  }

  const activate = async (id, unit, email, onboardingMode) => {
    setBusyId(id); setError(''); setFlash('')
    try {
      const result = await provisionWorker(id, unit, email, onboardingMode)
      setIssuedCredentials(result)
      setFlash(onboardingMode === 'email_link'
        ? result.email_send_requested
          ? 'حساب فعال شد و درخواست ارسال ایمیل ثبت شد. تحویل ایمیل را نیز بررسی کنید.'
          : 'حساب فعال شد ولی درخواست ارسال ایمیل ناموفق بود؛ لینک امن را جداگانه صادر کنید.'
        : 'حساب دانشجوکار فعال شد.')
      await refresh()
    } catch (e) { setError(getMessage(e)) }
    finally { setBusyId('') }
  }

  const reissueLink = async (workerId) => {
    setBusyId(workerId); setError(''); setFlash('')
    try {
      const { data, error } = await opsClient.functions.invoke('ops-issue-worker-link', {
        body: { worker_id: workerId },
      })
      if (error || !data?.ok || !data.invitation_link) {
        throw error || new Error(data?.error || 'secure_link_generation_failed')
      }
      setIssuedCredentials(data)
      setFlash('لینک اختصاصی آماده شد؛ آن را فقط در مسیر خصوصی ارسال کنید.')
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
          <div><h2>داوطلبان و پذیرش</h2></div>
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
                  saving={busyId === row.id || busyId === row.worker_id}
                  onSave={saveScreening}
                  onSaveEmail={saveEmail}
                  onProvision={activate}
                  onReissue={reissueLink}
                />
              ))}
            </div>
          ) : <p className="ops-muted">موردی برای نمایش وجود ندارد.</p>}
      </section>
      </>}
      {adminSection === 'work' && <AdminOperations navigation={navigation} setNavigation={setNavigation} />}
      {issuedCredentials && (
        <div className="ops-modal" role="dialog" aria-modal="true" aria-labelledby="ops-credentials-title">
          <div className="ops-modal__card">
            <h2 id="ops-credentials-title">{issuedCredentials.onboarding_mode === 'email_link' ? 'حساب دانشجوکار فعال شد' : 'اطلاعات فعال‌سازی دانشجوکار'}</h2>
            <p>{issuedCredentials.onboarding_mode === 'email_link'
              ? issuedCredentials.email_send_requested
                ? 'درخواست ارسال دعوت‌نامه ثبت شد؛ دریافت ایمیل را با دانشجو بررسی کنید. ثبت درخواست به‌معنای تحویل قطعی نیست.'
                : 'دعوت‌نامه ایمیلی ارسال نشد. از روش امن دیگری برای تحویل دسترسی استفاده کنید.'
              : 'اطلاعات لینک یا رمز فقط همین یک‌بار نمایش داده می‌شود. آن را محرمانه و خصوصی تحویل دهید.'}</p>
            <label className="report-field">
              <span>ایمیل ورود</span>
              <input readOnly dir="ltr" value={issuedCredentials.email}/>
            </label>
            {issuedCredentials.invitation_link ? (
              <label className="report-field">
                <span>لینک امن تعیین رمز (محرمانه، با اعتبار محدود)</span>
                <textarea readOnly rows={4} dir="ltr" value={issuedCredentials.invitation_link} />
              </label>
            ) : issuedCredentials.temporary_password ? (
              <label className="report-field">
                <span>رمز موقت</span>
                <input readOnly dir="ltr" value={issuedCredentials.temporary_password}/>
              </label>
            ) : null}
            {(issuedCredentials.invitation_link || issuedCredentials.temporary_password) && (
              <button type="button" className="report-btn report-btn--light"
                onClick={() => navigator.clipboard?.writeText(
                  issuedCredentials.invitation_link
                    ? `لینک فعال‌سازی: ${issuedCredentials.invitation_link}`
                    : `ایمیل: ${issuedCredentials.email}\nرمز موقت: ${issuedCredentials.temporary_password}`
                )}>
                کپی اطلاعات محرمانه ورود
              </button>
            )}
            <button type="button" className="report-btn report-btn--primary"
              onClick={() => setIssuedCredentials(null)}>متوجه شدم، بستن</button>
          </div>
        </div>
      )}
    </main>
  )
}

export default function OpsApp({ mode = 'admin' }) {
  // This does NOT trust a cached session for authorization. When the fresh
  // server identity check returns no user but a local Supabase session still
  // exists, we cannot distinguish temporary network failure from revoked
  // credentials. Fail closed and let the user explicitly repeat the online
  // identity+role check without reissuing a secure link.
  const verifyIdentityOrBlock = async () => {
    const verified = await currentOperationsIdentity()
    if (verified) return verified
    try {
      const {data} = await opsClient.auth.getSession()
      if (data?.session) throw new Error('OPS_IDENTITY_UNVERIFIED')
    } catch (e) {
      if (e?.message === 'OPS_IDENTITY_UNVERIFIED') throw e
    }
    return null
  }
  const [identity, setIdentity] = useState(null)
  const [adminNavigation, setAdminNavigation] = useState(initialAdminNavigation)
  const [workerNavigation, setWorkerNavigation] = useState(initialWorkerNavigation)
  const [busy, setBusy] = useState(true)
  const [recheckingAccess, setRecheckingAccess] = useState(false)
  const [accessUnverified, setAccessUnverified] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(() => {
    const isCallback = isRecoveryCallbackHash(window.location.hash)
    try {
      if (isCallback) window.sessionStorage.setItem(PASSWORD_RECOVERY_PENDING_KEY, '1')
      return isCallback || window.sessionStorage.getItem(PASSWORD_RECOVERY_PENDING_KEY) === '1'
    } catch { return isCallback }
  })

  useEffect(() => {
    const { data: { subscription } } = opsClient.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        try { window.sessionStorage.setItem(PASSWORD_RECOVERY_PENDING_KEY, '1') } catch {}
        setRecoveryMode(true)
      }
      if (event === 'SIGNED_OUT') {
        setAccessUnverified(false)
        setIdentity(null)
        setAdminNavigation(initialAdminNavigation)
        setWorkerNavigation(initialWorkerNavigation)
        setRecheckingAccess(false)
        setNotice('نشست این مرورگر پایان یافت. برای ورود مجدد از ایمیل حساب استفاده کنید؛ برای کار هم‌زمان با چند حساب، پروفایل‌های جداگانه باز کنید.')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let mounted = true
    document.title = mode === 'worker' ? 'پنل دانشجوکار' : 'مدیریت دانشجوکارها'
    verifyIdentityOrBlock().then(result => {
      if (mounted) {
        if (result?.role === 'no_access') setError('برای این حساب، دسترسی عملیاتی فعال نشده است.')
        setIdentity(result?.role === 'no_access' ? null : result)
      }
    }).catch(() => {
      if (mounted) {
        setIdentity(null)
        setAccessUnverified(true)
      }
    }).finally(() => { if (mounted) setBusy(false) })
    return () => { mounted = false }
  }, [mode])

  // A previously open worker/admin dashboard is not proof that its role is still valid.
  // Recheck on tab resume; block stale operational components while verifying.
  useEffect(() => {
    if (!identity || recoveryMode) return
    return watchOperationsResume({
      windowTarget: window,
      documentTarget: document,
      readIdentity: verifyIdentityOrBlock,
      onStart: () => setRecheckingAccess(true),
      onIdentity: fresh => {
        // One Chrome profile stores ONE Supabase session. If a separate tab
        // signed in as another person, NEVER silently morph this A tab into
        // B's authenticated workspace. Prompt for isolated profile/login.
        if (fresh?.user?.id && identity.user?.id &&
            fresh.user.id !== identity.user.id) {
          setAdminNavigation(initialAdminNavigation)
          setWorkerNavigation(initialWorkerNavigation)
          setIdentity(null)
          setAccessUnverified(false)
          setError('نشست مرورگر به حساب دیگری تغییر کرده است. برای بررسی هم‌زمان چند حساب از پروفایل‌های جداگانهٔ مرورگر استفاده کنید.')
        } else if (!fresh || fresh.role === 'no_access') {
          setError('دسترسی این نشست دیگر معتبر نیست. لطفاً مجدداً وارد شوید.')
          setAdminNavigation(initialAdminNavigation)
          setWorkerNavigation(initialWorkerNavigation)
          setAccessUnverified(false)
          setIdentity(null)
        } else {
          setAccessUnverified(false)
          // Never carry a former administrator's selection across identities.
          if (fresh.role !== identity.role || fresh.user?.id !== identity.user?.id) {
            setAdminNavigation(initialAdminNavigation)
            setWorkerNavigation(initialWorkerNavigation)
          }
          setError('')
          setIdentity(fresh)
        }
      },
      onFailure: () => {
        // We have no fresh authorization. Immediately UNMOUNT the old secure
        // view; do not assume its previous session was actually revoked.
        // Require a new server validation via an explicit, read-only button.
        setAdminNavigation(initialAdminNavigation)
        setWorkerNavigation(initialWorkerNavigation)
        setIdentity(null)
        setAccessUnverified(true)
        setError('')
      },
      onFinish: () => setRecheckingAccess(false),
    })
  }, [Boolean(identity), recoveryMode])

  const retryIdentityVerification = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const fresh = await verifyIdentityOrBlock()
      setAccessUnverified(false)
      if (!fresh || fresh.role === 'no_access') {
        setIdentity(null)
        setError('نشست معتبر نیست. با ایمیل حساب و رمز انتخابی خود وارد شوید.')
      } else {
        setIdentity(fresh)
      }
    } catch {
      setAccessUnverified(true)
      setIdentity(null)
      setError('اتصال برای بررسی مجوز برقرار نشد؛ دوباره تلاش کنید.')
    } finally { setBusy(false) }
  }

  const clearRecoveryIntent = () => {
    try { window.sessionStorage.removeItem(PASSWORD_RECOVERY_PENDING_KEY) } catch {}
    setRecoveryMode(false)
  }

  const login = async (email, password) => {
    setRecheckingAccess(false)
    setBusy(true); setAccessUnverified(false); setError(''); setNotice('')
    try {
      await signInOperations(email, password)
      const who = await currentOperationsIdentity()
      if (!who || who.role === 'no_access') {
        await signOutOperations()
        throw new Error('operations_access_denied')
      }
      setAdminNavigation(initialAdminNavigation)
      setWorkerNavigation(initialWorkerNavigation)
      setIdentity(who)
    } catch (e) { setError(getMessage(e)) }
    finally { setBusy(false) }
  }

  const logout = async () => {
    setRecheckingAccess(false)
    setAccessUnverified(false)
    setAdminNavigation(initialAdminNavigation)
    setWorkerNavigation(initialWorkerNavigation)
    setBusy(true)
    try { await signOutOperations() }
    finally { clearRecoveryIntent(); setIdentity(null); setBusy(false) }
  }

  const finishRecovery = async () => {
    await signOutOperations()
    clearRecoveryIntent()
    setAdminNavigation(initialAdminNavigation)
    setWorkerNavigation(initialWorkerNavigation)
    setIdentity(null)
    setError('')
    setNotice('رمز جدید ثبت شد. اکنون با ایمیل حساب و رمز جدید وارد شوید.')
  }

  if (accessUnverified && !identity && !recoveryMode) return (
    <main className="report-shell report-shell--login ops-root" dir="rtl">
      <section className="report-login-card" role="alert">
        <h1>دسترسی نیازمند بررسی مجدد است</h1>
        <p>تأیید آنلاین مجوز کامل نشد؛ برای حفاظت از اطلاعات، پنل بسته شده است.
        این اتفاق لزوماً به معنی خروج از حساب یا تغییر رمز نیست.</p>
        {error && <p className="report-alert report-alert--error">{error}</p>}
        <button type="button" className="report-btn report-btn--primary"
          disabled={busy} onClick={retryIdentityVerification}>
          {busy ? 'در حال بررسی مجوز…' : 'بررسی دوبارهٔ دسترسی'}
        </button>
        <p>اگر نشست واقعاً منقضی شده باشد، فرم ورود نمایش داده می‌شود.</p>
      </section>
    </main>
  )
  if (busy && !identity) return (
    <main className="report-shell report-shell--login ops-root" dir="rtl">
      <div className="report-login-card"><p>در حال بررسی دسترسی…</p></div>
    </main>
  )

  if (recoveryMode && !identity) return (
    <main className="report-shell report-shell--login ops-root" dir="rtl">
      <section className="report-login-card">
        <h1>لینک بازیابی قابل استفاده نیست</h1>
        <p>اگر لینک منقضی شده یا نشست ایجاد نشده است، از فرم ورود دوباره درخواست بازیابی بدهید.</p>
        <button type="button" className="report-btn report-btn--primary" onClick={logout}>
          بازگشت به صفحه ورود
        </button>
      </section>
    </main>
  )
  if (recoveryMode) return <RecoveryPasswordView onComplete={finishRecovery} onCancel={logout}/>
  if (!identity) return <Login onLogin={login} busy={busy} error={error} defaultMode={mode} notice={notice}/>
  // Keep same-account unsent form state through a role revalidation on
  // tab focus, but never present or accept input in privileged UI while
  // permission is being checked. Identity/role/revocation changes remount.
  const authorizedView = identity.role === 'admin'
    ? <AdminView key={'admin:' + identity.user?.id}
        onLogout={logout} navigation={adminNavigation} setNavigation={setAdminNavigation}/>
    : identity.role === 'worker_disabled'
      ? <WorkerDisabledView key={'disabled:' + identity.user?.id + ':' + identity.profile?.state}
          profile={identity.profile} onLogout={logout}/>
      : <WorkerView
          key={'worker:' + (identity.user?.id || identity.profile?.worker_id) + ':' +
            identity.profile?.worker_id + ':' + identity.profile?.state + ':' +
            identity.profile?.onboarding_state}
          profile={identity.profile}
          loginEmail={identity.user?.email}
          navigation={workerNavigation}
          setNavigation={setWorkerNavigation}
          onLogout={logout}
          initialPasswordRequired={identity.profile?.onboarding_state === 'password_required'}/>
  return (
    <>
      <div className={recheckingAccess ? 'ops-recheck-frozen' : undefined}
        inert={recheckingAccess}
        aria-hidden={recheckingAccess ? 'true' : undefined}>
        {authorizedView}
      </div>
      {recheckingAccess && !recoveryMode && (
        <div className="ops-recheck-curtain ops-root" dir="rtl"
          role="status" aria-live="polite"
          aria-label="در حال تأیید مجدد مجوز؛ تعاملات موقتاً متوقف است.">
          <div className="ops-recheck-layout" aria-hidden="true">
            <div className="ops-recheck-banner">
              <span className="ops-recheck-ghost ops-recheck-ghost--title" />
              <span className="ops-recheck-ghost ops-recheck-ghost--subtitle" />
            </div>
            <div className="ops-recheck-toolbar">
              <span className="ops-recheck-ghost ops-recheck-ghost--tab" />
              <span className="ops-recheck-ghost ops-recheck-ghost--tab" />
              <span className="ops-recheck-ghost ops-recheck-ghost--tab" />
            </div>
            <div className="ops-recheck-panels">
              <div className="ops-recheck-panel">
                <span className="ops-recheck-ghost ops-recheck-ghost--heading" />
                <span className="ops-recheck-ghost ops-recheck-ghost--line" />
                <span className="ops-recheck-ghost ops-recheck-ghost--line" />
              </div>
              <div className="ops-recheck-panel">
                <span className="ops-recheck-ghost ops-recheck-ghost--heading" />
                <span className="ops-recheck-ghost ops-recheck-ghost--line" />
                <span className="ops-recheck-ghost ops-recheck-ghost--line" />
              </div>
            </div>
          </div>
          <span className="ops-recheck-indicator">
            <span className="ops-recheck-indicator__dot" />
            بررسی کوتاه دسترسی…
          </span>
        </div>
      )}
    </>
  )
}
