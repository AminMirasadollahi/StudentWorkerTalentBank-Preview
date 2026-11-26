import {useEffect,useRef,useState} from 'react'
import {opsClient} from '../lib/operations'

// Deliberate, in-context confirmation: issuing a fresh one-time link stages
// password_required for an EXISTING worker account. Never do this accidentally.
export default function WorkerSecureLinkReissue({
  workerId,workerState,saving,onReissue,
}) {
  const [pendingWorkerId,setPendingWorkerId]=useState(null)
  const [support,setSupport]=useState(null)
  const [supportBusy,setSupportBusy]=useState(false)
  const [supportNotice,setSupportNotice]=useState('')
  const [cancelRef,setCancelRef]=useState(null)
  const supportFlight=useRef(false)
  // Identity or role changes invalidate an unconsumed confirmation.
  useEffect(()=>{setPendingWorkerId(null);setSupport(null);setSupportNotice('');setCancelRef(null)},[workerId,workerState])
  const isActive=workerState==='active'
  const confirming=isActive&&pendingWorkerId===workerId
  const disabled=saving||supportBusy||!isActive||!workerId||Boolean(support&&support.phase!=='none')
  const readSupport=async()=>{
    const {data,error}=await opsClient.rpc('ops_s01_support_status',{p_worker_id:workerId})
    if(error||data?.ok!==true||!['none','reserved','dispatched'].includes(data.phase))throw Error('status_unknown')
    setSupport(data);setCancelRef(null)
  }
  const refreshSupport=async()=>{
    if(supportFlight.current)return
    supportFlight.current=true;setSupportBusy(true);setSupportNotice('')
    try{await readSupport()}catch{setSupport({phase:'unknown'});setCancelRef(null);setSupportNotice('وضعیت قابل تأیید نیست؛ فعلاً اقدام دیگری انجام ندهید.')}
    finally{supportFlight.current=false;setSupportBusy(false)}
  }
  const cancelReserved=async()=>{
    if(supportFlight.current||support?.phase!=='reserved'||!support.support_ref||cancelRef!==support.support_ref)return
    supportFlight.current=true;setSupportBusy(true);setCancelRef(null);setSupportNotice('')
    try{
      const {data,error}=await opsClient.rpc('ops_s01_cancel_reserved',{p_worker_id:workerId,p_support_ref:support.support_ref})
      if(error||data?.ok!==true)throw Error('cancel_unconfirmed')
      setSupportNotice('رزرو ارسال‌نشده لغو شد؛ هیچ رمز یا لینکی تغییر نکرد.')
      await readSupport()
    }catch{setSupport({phase:'unknown'});setSupportNotice('نتیجه لغو قطعی نیست؛ وضعیت را دوباره بررسی کنید.')}
    finally{supportFlight.current=false;setSupportBusy(false)}
  }

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
      <div className="ops-field-row">
        <button type="button" className="report-btn report-btn--light ops-small-action" disabled={saving||supportBusy||!workerId} onClick={()=>{void refreshSupport()}}>بررسی وضعیت راه‌اندازی</button>
      </div>
      {support&&<p role="status">{support.phase==='none'?'عملیات معلقی وجود ندارد.':support.phase==='reserved'?'رزرو هنوز به سرویس احراز هویت ارسال نشده است.':support.phase==='dispatched'?'ممکن است عملیات به سرویس احراز هویت ارسال شده باشد. از تغییر رمز یا صدور لینک مجدد خودداری و موضوع را به پشتیبان ارجاع دهید.':'وضعیت نامشخص است.'}</p>}
      {support?.phase==='reserved'&&support.support_ref&&(
        cancelRef===support.support_ref
          ? <div role="group" aria-label="تأیید لغو رزرو ارسال‌نشده">
              <p>فقط رزرو ارسال‌نشده لغو می‌شود؛ عملیات ارسال‌شده قابل لغو از این مسیر نیست.</p>
              <button type="button" className="report-btn report-btn--light" disabled={supportBusy||saving} onClick={()=>setCancelRef(null)}>انصراف</button>
              <button type="button" className="report-btn report-btn--primary" disabled={supportBusy||saving} onClick={()=>{void cancelReserved()}}>تأیید لغو رزرو</button>
            </div>
          : <button type="button" className="report-btn report-btn--light" disabled={supportBusy||saving} onClick={()=>setCancelRef(support.support_ref)}>لغو رزرو ارسال‌نشده</button>
      )}
      {supportNotice&&<p role="status">{supportNotice}</p>}
      <small>
        صدور لینک جدید، ورود بعدی را منوط به تعیین مجدد رمز می‌کند.
        برای بازیابیِ حساب فعال، فقط با هماهنگی دانشجوکار اقدام کنید.
      </small>
    </div>
  )
}
