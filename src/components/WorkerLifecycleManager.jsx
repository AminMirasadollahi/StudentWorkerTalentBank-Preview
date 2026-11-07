import {useEffect,useRef,useState} from 'react'
import {
 allowedWorkerTransitions,isWorkerStateReasonValid,normalizeWorkerStateReason,
 workerStateLabels,workerTransitionAction,
} from '../lib/workerLifecycle.mjs'
import {getWorkerStateHistory,setWorkerState} from '../lib/operationsV2'
import './worker-lifecycle.css'

// Actual administrator-only workflow. Server is the source of authorization,
// allowed transitions, optimistic state precondition, append-only audit log.
export default function WorkerLifecycleManager({worker,onDone}) {
 const [target,setTarget]=useState('')
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [refreshRequired,setRefreshRequired]=useState(false)
 const [history,setHistory]=useState(null)
 const [historyError,setHistoryError]=useState('')
 const [historyLoading,setHistoryLoading]=useState(false)
 const lock=useRef(false)
 const historyRequest=useRef(0)

 useEffect(()=>{
  setTarget('');setReason('');setError('');setNotice('')
  setRefreshRequired(false);setHistory(null);setHistoryError('')
  historyRequest.current++
 },[worker?.id])
 useEffect(()=>{setTarget('');setReason('')},[worker?.state])

 if(!worker)return null
 const validTargets=allowedWorkerTransitions(worker.state)
 const selected=validTargets.includes(target)
 const canSubmit=selected&&isWorkerStateReasonValid(reason)&&!busy&&!refreshRequired

 const loadHistory=async()=>{
  if(historyLoading)return
  const request=++historyRequest.current
  const id=worker.id
  setHistoryLoading(true);setHistoryError('')
  try{
   const response=await getWorkerStateHistory(id)
   if(request!==historyRequest.current)return
   if(!Array.isArray(response))throw Error('invalid_history_response')
   setHistory(response)
  }catch{
   if(request===historyRequest.current){setHistory(null);setHistoryError('دریافت تاریخچه وضعیت تأیید نشد.')}
  }finally{if(request===historyRequest.current)setHistoryLoading(false)}
 }

 const commit=async()=>{
  if(lock.current||!canSubmit)return
  const id=worker.id
  const original=worker.state
  const next=target
  const auditReason=normalizeWorkerStateReason(reason)
  if(!allowedWorkerTransitions(original).includes(next))return
  lock.current=true
  setBusy(true);setError('');setNotice('')
  try{
   const result=await setWorkerState({
    workerId:id,expectedState:original,newState:next,reason:auditReason,
   })
   if(result?.worker_id!==id||result?.previous_state!==original||result?.state!==next) {
    setRefreshRequired(true)
    throw Error('unconfirmed_server_reply')
   }
   setRefreshRequired(true)
   const refreshed=await onDone?.()
   if(refreshed!==true){
    setNotice('تغییر وضعیت در سرور ثبت شد، اما دریافت دوباره وضعیت تأیید نشد. پیش از اقدام دیگر، صفحه را به‌روزرسانی کنید.')
   }else{
    setRefreshRequired(false)
    setTarget('');setReason('')
    setNotice('وضعیت حساب و دلیل تصمیم در سرور ثبت شد. سوابق قبلی حفظ شده‌اند.')
    setHistory(null)
   }
  }catch(e){
   const raw=String(e?.message||'')
   if(raw.includes('worker_state_changed_refresh_required')||raw.includes('unconfirmed_server_reply')){
    setRefreshRequired(true)
    setError('وضعیت حساب تغییر کرده یا پاسخ سرور قابل تأیید نیست. ابتدا صفحه را بازخوانی کنید؛ تصمیم را بدون بررسی مجدد تکرار نکنید.')
   }else if(raw.includes('operations_access_denied')){
    setRefreshRequired(true)
    setError('مجوز مدیریت این تغییر در سرور تأیید نشد. از حساب مدیر مجاز استفاده کنید.')
   }else if(raw.includes('worker_state_reason_required')){
    setError('توضیح تصمیم باید بین ۱۰ تا ۶۰۰ نویسه باشد.')
   }else {
    setRefreshRequired(true)
    setError('ثبت تصمیم تأیید نشد. برای اطمینان از وضعیت واقعی حساب، اطلاعات را بازخوانی کنید.')
   }
  }finally{lock.current=false;setBusy(false)}
 }

 return <section className="wl-panel" dir="rtl" aria-label="مدیریت وضعیت حساب دانشجوکار">
  <div className="wl-head">
   <div>
    <h4>مدیریت وضعیت حساب</h4>
    <p>وضعیت فعلی: <strong>{workerStateLabels[worker.state]||'نامشخص'}</strong></p>
   </div>
   <span className={'wl-state wl-state--'+worker.state}>
    {workerStateLabels[worker.state]||'نامشخص'}
   </span>
  </div>
  <p className="wl-caption">تعلیق یا غیرفعال‌سازی، دسترسی عملیاتی و نمایش برنامه همکاران را متوقف می‌کند؛
   تاریخچه کارها و ساعات قبلی حذف نمی‌شود. مجوز همکاری نیمسال مستقل از وضعیت حساب است.</p>
  <div className="wl-actions">
   {validTargets.map(next=><button key={next} type="button"
     className="report-btn report-btn--light" disabled={busy||refreshRequired}
     onClick={()=>{setTarget(next);setReason('');setError('');setNotice('')}}>
     {workerTransitionAction(next)}
    </button>)}
  </div>
  {selected&&<div role="group" aria-label="تأیید تغییر وضعیت حساب" className="wl-decision">
    <div className="wl-review">
     <div><dt>دانشجوکار</dt><dd>{worker.name||'—'}</dd></div>
     <div><dt>تغییر پیشنهادی</dt><dd>{workerStateLabels[worker.state]} ← {workerStateLabels[target]}</dd></div>
    </div>
    <p className="wl-warning">این تغییر روی حساب موجود اعمال می‌شود. فقط پس از بررسی هویت حساب و اطمینان از انتخاب صحیح ادامه دهید. فعال‌سازی مجدد به اقدام مستقل مدیر نیاز دارد.</p>
    <label className="report-field">
     <span>دلیل تصمیم (ضروری، ۱۰ تا ۶۰۰ نویسه)</span>
     <textarea aria-label="دلیل تغییر وضعیت حساب" maxLength={600} rows={3}
      value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}
      placeholder="برای نمونه: پایان دوره آزمون سامانه و آغاز فعالیت دانشجویان واقعی"/>
    </label>
    <div className="wl-actions">
     <button type="button" className="report-btn report-btn--light" disabled={busy}
      onClick={()=>{setTarget('');setReason('');setError('')}}>انصراف</button>
     <button type="button" className="report-btn report-btn--primary"
      disabled={!canSubmit} onClick={()=>{void commit()}}>
      {busy?'در حال ثبت تصمیم…':'تأیید نهایی و ثبت وضعیت'}
     </button>
    </div>
   </div>}
  {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
  {notice&&<p role="status" className="wl-notice">{notice}</p>}
  {refreshRequired&&<p className="wl-warning" role="status">
   تا بازخوانی موفق وضعیت، امکان صدور تصمیم تازه از این نما غیرفعال است.
   <button type="button" className="report-btn report-btn--light" disabled={busy}
    onClick={async()=>{
     const refreshed=await onDone?.()
     if(refreshed===true){setRefreshRequired(false);setError('');setTarget('');setReason('')}
    }}>بازخوانی وضعیت</button>
  </p>}
  <details className="wl-history" onToggle={e=>{if(e.currentTarget.open&&history===null&&!historyError&&!historyLoading)void loadHistory()}}>
   <summary>تاریخچه تغییر وضعیت حساب</summary>
   {historyLoading&&<p role="status">در حال دریافت تاریخچه…</p>}
   {historyError&&<p role="alert">{historyError}
    <button type="button" onClick={()=>void loadHistory()}>تلاش مجدد</button></p>}
   {history!==null&&<ol>
    {history.map((row,i)=><li key={row.id||i}>
     <strong>{workerStateLabels[row.from_state]||row.from_state} ← {workerStateLabels[row.to_state]||row.to_state}</strong>
     <small>{row.created_at?new Date(row.created_at).toLocaleString('fa-IR'):'تاریخ نامشخص'}</small>
     <p>{row.reason||'توضیح ثبت نشده است'}</p>
    </li>)}
    {!history.length&&<li>هنوز تغییر وضعیتی ثبت نشده است.</li>}
   </ol>}
  </details>
 </section>
}
