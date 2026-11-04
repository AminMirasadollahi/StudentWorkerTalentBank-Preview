import {useState} from 'react'
import {saveOperationsBudgetPool} from '../lib/operationsV2'
import ManagerSettingsDialog from './ManagerSettingsDialog'
import {AUTO_POOL_REASON,UNIT_LABELS,automaticPoolLabel,
 wholeHoursToMinutes,minutesToWholeHours,poolChanged,sameUnits} from '../lib/termSettingsInput.mjs'

export default function BudgetPoolEditor({term,pool=null,allPools=[],onSaved,onClose}){
 const [selected,setSelected]=useState(pool?.units||[])
 const [hours,setHours]=useState(minutesToWholeHours(pool?.allocated_minutes))
 const [customTitle,setCustomTitle]=useState('')
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const minutes=wholeHoursToMinutes(hours)
 const membersLocked=term.state==='active'&&Boolean(pool)
 const owners=new Map(allPools.flatMap(p=>(p.units||[]).map(u=>[u,p])))
 const generatedLabel=automaticPoolLabel(selected)
 const originalMembers=sameUnits(pool?.units||[],selected)
 const label=customTitle.trim()||(pool&&originalMembers?pool.label:generatedLabel)
 const edited=poolChanged(pool,{label,units:selected,allocatedMinutes:minutes})
 const valid=selected.length>0&&label.length>=3&&label.length<=100&&minutes!==null&&
   (!pool||(edited&&reason.trim().length>=5))
 const submit=async event=>{
  event.preventDefault()
  if(busy||!valid||term.state==='closed')return
  setBusy(true);setError('')
  try{
   const response=await saveOperationsBudgetPool({
    id:pool?.id||null,termId:term.id,label,units:selected,minutes,
    reason:pool?reason.trim():AUTO_POOL_REASON,
   })
   if(response?.ok!==true)throw Error('pool_write_unconfirmed')
   await onSaved()
  }catch{
   setError('ذخیره سهمیه تأیید نشد. لطفاً ابتدا آمار را بازخوانی کنید تا از ثبت نشدن تغییر اطمینان حاصل شود.')
  }finally{setBusy(false)}
 }
 return <ManagerSettingsDialog
  title={pool?'ویرایش سهمیه مصوب':'تعریف سهمیه مصوب'}
  busy={busy} onClose={onClose}>
  <form className="ow-compact-form" onSubmit={submit}>
   <p className="ow-muted">واحد یا واحدهایی را که از یک اعتبار استفاده می‌کنند انتخاب کنید. سهمیه فقط یک‌بار برای مجموعه آن‌ها محاسبه می‌شود.</p>
   <fieldset className="ow-pool-unit-fieldset" disabled={busy||membersLocked}>
    <legend>سهمیه برای کدام واحدهاست؟</legend>
    <div className="ow-pool-unit-choices">
     {Object.entries(UNIT_LABELS).map(([id,name])=>{
      const occupied=owners.get(id)
      const claimed=occupied&&occupied.id!==pool?.id
      return <label key={id} className="ow-pool-unit-choice">
       <input type="checkbox" checked={selected.includes(id)}
        disabled={Boolean(claimed)||busy||membersLocked}
        onChange={()=>setSelected(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id])}/>
       <span>{name}</span>
       {claimed&&<small>سهمیه دیگری دارد</small>}
      </label>
     })}
    </div>
   </fieldset>
   {membersLocked&&<p className="ow-muted">واحدهای یک سهمیه فعال قابل جابه‌جایی نیستند؛ مبلغ ساعت با ثبت علت قابل اصلاح است.</p>}
   {selected.length>0&&<div className="ow-pool-preview" role="status">
     <small>عنوان خودکار سهمیه</small>
     <strong>{label}</strong>
     <small>{selected.length>1?'سهمیه مشترک':'سهمیه تک‌واحدی'}</small>
    </div>}
   <label className="report-field"><span>سهمیه مصوب (ساعت)</span>
    <input type="text" inputMode="numeric" autoComplete="off"
     aria-label="سهمیه مصوب به ساعت" value={hours}
     disabled={busy} onChange={e=>setHours(e.target.value)}
     placeholder="مثلاً ۴۱۱"/>
   </label>
   {pool&&pool.allocated_minutes%60!==0&&<p className="ow-term-warning">
     مقدار قبلی شامل دقیقه است و بدون گرد کردن، محفوظ مانده؛ برای تغییر آن ساعت رسمی جدید را وارد کنید.
   </p>}
   {minutes!==null&&<p className="ow-compact-hint">هر ساعت در محاسبات برابر ۶۰ دقیقه ثبت می‌شود.</p>}
   <details className="ow-term-context-help">
    <summary>عنوان دلخواه (اختیاری)</summary>
    <label className="report-field"><span>عنوان جایگزین</span>
     <input value={customTitle} maxLength={100} disabled={busy}
      onChange={e=>setCustomTitle(e.target.value)}
      placeholder={generatedLabel||'ابتدا واحدها را انتخاب کنید'}/>
    </label>
    <p className="ow-muted">در حالت عادی نیازی به عنوان جداگانه نیست؛ نام از واحدهای انتخابی ساخته می‌شود.</p>
   </details>
   {pool&&edited&&<label className="report-field"><span>علت اصلاح سهمیه</span>
    <input required minLength={5} maxLength={500} disabled={busy}
     value={reason} onChange={e=>setReason(e.target.value)}
     placeholder="مثلاً اصلاح براساس ابلاغ جدید"/>
   </label>}
   {!pool&&<p className="ow-compact-hint">ثبت اولیه همراه با تاریخ و نام مدیر، خودکار در سابقه تغییرات ثبت می‌شود.</p>}
   {pool&&!edited&&<p className="ow-compact-hint">هنوز تغییری برای ذخیره انجام نشده است.</p>}
   {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
   <div className="ow-compact-form-actions">
    <button className="report-btn report-btn--light" type="button" disabled={busy} onClick={onClose}>انصراف</button>
    <button className="report-btn report-btn--primary" type="submit" disabled={busy||!valid}>
     {busy?'در حال ثبت…':pool?'ثبت تغییرات':'ثبت سهمیه'}
    </button>
   </div>
  </form>
 </ManagerSettingsDialog>
}
