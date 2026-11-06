import {useEffect,useState} from 'react'

// Deliberate, in-context confirmation: issuing a fresh one-time link stages
// password_required for an EXISTING worker account. Never do this accidentally.
export default function WorkerSecureLinkReissue({
  workerId,workerState,saving,onReissue,
}) {
  const [pendingWorkerId,setPendingWorkerId]=useState(null)
  // Identity or role changes invalidate an unconsumed confirmation.
  useEffect(()=>setPendingWorkerId(null),[workerId,workerState])
  const isActive=workerState==='active'
  const confirming=isActive&&pendingWorkerId===workerId
  const disabled=saving||!isActive||!workerId

  return (
    <div className="ops-secure-link-reissue">
      {!confirming ? (
        <button className="report-btn report-btn--light ops-small-action"
          type="button" disabled={disabled}
          onClick={()=>setPendingWorkerId(workerId)}>
          صدور لینک امن تعیین رمز
        </button>
      ) : (
        <div role="group" aria-label="تأیید صدور مجدد لینک امن">
          <p role="alert">
            این اقدام برای حساب موجود، تعیین مجدد رمز را در ورود بعدی الزامی می‌کند.
            فقط در صورت درخواست و آمادگی همان دانشجوکار ادامه دهید.
          </p>
          <div className="ops-field-row">
            <button className="report-btn report-btn--light ops-small-action"
              type="button" disabled={saving}
              onClick={()=>setPendingWorkerId(null)}>
              انصراف
            </button>
            <button className="report-btn report-btn--primary ops-small-action"
              type="button" disabled={disabled}
              onClick={()=>{
                const confirmed=pendingWorkerId===workerId&&isActive&&!saving
                setPendingWorkerId(null)
                if(confirmed)onReissue(workerId)
              }}>
              تأیید و صدور لینک
            </button>
          </div>
        </div>
      )}
      <small>
        صدور لینک جدید، ورود بعدی را منوط به تعیین مجدد رمز می‌کند.
        برای بازیابیِ حساب فعال، فقط با هماهنگی دانشجوکار اقدام کنید.
      </small>
    </div>
  )
}
