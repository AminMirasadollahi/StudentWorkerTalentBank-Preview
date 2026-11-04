import {useState} from 'react'
import {saveOperationsTerm} from '../lib/operationsV2'
import {faMinutes} from '../lib/termBudgetView.mjs'
import ManagerSettingsDialog from './ManagerSettingsDialog'

const persianDate=new Intl.DateTimeFormat('fa-IR-u-ca-persian',
 {dateStyle:'medium',timeZone:'UTC'})
const formatted=iso=>iso?persianDate.format(new Date(iso+'T12:00:00Z')):'—'

/** A deliberate, documented state transition, separate from editing dates. */
export default function TermStatusDialog({term,pools=[],onSaved,onClose}){
 const activating=term.state==='draft'
 const next=activating?'active':'closed'
 const [confirmed,setConfirmed]=useState(false)
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const canActivate=activating&&pools.length>0
 const valid=confirmed&&reason.trim().length>=5&&
  (activating?canActivate:term.state==='active')
 const save=async e=>{
  e.preventDefault()
  if(busy||!valid)return
  setBusy(true);setError('')
  try{
   const r=await saveOperationsTerm({
    termId:term.id,label:term.label,startDate:term.start_date,
    endDate:term.end_date,state:next,reason:reason.trim(),
   })
   if(r?.ok!==true||r?.state!==next)throw Error('unexpected_term_status')
   await onSaved(term.id)
  }catch{
   setError('وضعیت نیمسال تأیید نشد. برای جلوگیری از ثبت تکراری، ابتدا فهرست نیمسال‌ها را بازخوانی کنید.')
  }finally{setBusy(false)}
 }
 return <ManagerSettingsDialog title={activating?'تأیید و فعال‌سازی نیمسال':'بستن نیمسال'}
  busy={busy} onClose={onClose}>
  <form className="ow-compact-form" onSubmit={save}>
   <div className="ow-term-activation-summary">
    <strong>{term.label}</strong>
    <span>از {formatted(term.start_date)} تا {formatted(term.end_date)}</span>
    <small>{pools.length} سهمیه تعریف‌شده</small>
    {pools.map(p=><div className="ow-term-activation-row" key={p.id}>
      <span>{p.label}</span><strong>{faMinutes(p.allocated_minutes)}</strong>
    </div>)}
   </div>
   {activating?<p className="ow-term-warning">
     بعد از فعال‌سازی، بازه زمانی نیمسال و عضویت واحدها در سهمیه‌های موجود قفل می‌شود.
     در صورت ابهام در تاریخ پایان، نیمسال را فعلاً پیش‌نویس نگه دارید.
   </p>:<p className="ow-term-warning">
     بستن نیمسال یک اقدام مدیریتی است و بعد از آن ویرایش سهمیه‌های همین نیمسال امکان‌پذیر نیست.
   </p>}
   {activating&&!canActivate&&<p role="alert" className="report-alert report-alert--error">
     پیش از فعال‌سازی، حداقل یک سهمیه مصوب تعریف کنید.
   </p>}
   <label className="ow-term-confirm"><input type="checkbox"
     checked={confirmed} disabled={busy||!canActivate&&activating}
     onChange={e=>setConfirmed(e.target.checked)}/>
     <span>{activating?'نام، تاریخ‌ها و سهمیه‌های این نیمسال را بررسی و تأیید می‌کنم.':'از بسته‌شدن و فقط‌خواندنی شدن این نیمسال آگاه هستم.'}</span>
   </label>
   <label className="report-field"><span>دلیل {activating?'فعال‌سازی':'بستن'} نیمسال</span>
    <input required minLength={5} maxLength={500} value={reason}
     disabled={busy||activating&&!canActivate} onChange={e=>setReason(e.target.value)}
     placeholder={activating?'مثلاً تأیید نهایی بازه و سهمیه‌ها':'مثلاً پایان دوره مصوب'}/>
   </label>
   {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
   <div className="ow-compact-form-actions">
    <button type="button" className="report-btn report-btn--light"
     onClick={onClose} disabled={busy}>بازگشت</button>
    <button type="submit" className="report-btn report-btn--primary"
     disabled={busy||!valid}>{busy?'در حال ثبت…':activating?'فعال‌سازی قطعی نیمسال':'ثبت بستن نیمسال'}</button>
   </div>
  </form>
 </ManagerSettingsDialog>
}
