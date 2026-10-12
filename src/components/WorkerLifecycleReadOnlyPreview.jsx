import { allowedWorkerTransitions, workerStateLabels, workerTransitionAction } from '../lib/workerLifecycle.mjs'
import './worker-lifecycle.css'

// Public Preview visual QA only. This component intentionally has NO operations
// API client, event handlers, account mutation, modal or permission to write.
export default function WorkerLifecycleReadOnlyPreview({ worker }) {
  if (!worker) return null
  const actions = allowedWorkerTransitions(worker.state)
  return <section className="wl-panel" dir="rtl" aria-label="پیش‌نمایش مدیریت وضعیت دانشجوکار">
    <div className="wl-head">
      <div>
        <h4>مدیریت وضعیت حساب</h4>
        <p>وضعیت فعلی: <strong>{workerStateLabels[worker.state] || 'نامشخص'}</strong></p>
      </div>
      <span className={`wl-state wl-state--${worker.state}`}>{workerStateLabels[worker.state] || 'نامشخص'}</span>
    </div>
    <p className="wl-caption">در این بخش، مدیر می‌تواند پس از تأیید و ثبت علت، حساب را تعلیق یا غیرفعال کند و بعداً همان حساب را با حفظ تمام سوابق فعال سازد.</p>
    <div className="wl-actions">
      {actions.map(next => <button key={next} type="button" className="report-btn report-btn--light" disabled>{workerTransitionAction(next)}</button>)}
    </div>
    <p className="wl-locked" role="status">پیش‌نمایش ظاهری: دکمه‌ها غیرفعال‌اند و هیچ تغییر وضعیت یا پیام ارسالی از این صفحه انجام نمی‌شود.</p>
  </section>
}
