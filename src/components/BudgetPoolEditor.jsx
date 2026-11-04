import {useState} from 'react'
import {saveOperationsBudgetPool} from '../lib/operationsV2'
import {faMinutes,fromHourMinuteInputs,toHourMinuteInputs} from '../lib/termBudgetView.mjs'

const units={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}

export default function BudgetPoolEditor({term,pool=null,allPools=[],onSaved,onClose}){
 const pre=toHourMinuteInputs(pool?.allocated_minutes)
 const [label,setLabel]=useState(pool?.label||'')
 const [selected,setSelected]=useState(pool?.units||[])
 const [hours,setHours]=useState(pre.hours)
 const [minutes,setMinutes]=useState(pre.minutes)
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const count=fromHourMinuteInputs(hours,minutes)
 const membersLocked=term.state==='active'&&Boolean(pool)
 const owners=new Map(allPools.flatMap(p=>(p.units||[]).map(u=>[u,p])))
 const toggle=unit=>setSelected(items=>items.includes(unit)?items.filter(u=>u!==unit):[...items,unit])
 const valid=label.trim().length>=3&&selected.length>0&&count!==null&&reason.trim().length>=5
 const submit=async ev=>{
  ev.preventDefault()
  if(busy||!valid||term.state==='closed')return
  setBusy(true);setError('')
  try{
   const r=await saveOperationsBudgetPool({
    id:pool?.id||null,termId:term.id,label:label.trim(),
    units:selected,minutes:count,reason:reason.trim(),
   })
   if(r?.ok!==true)throw Error('pool_write_unconfirmed')
   await onSaved()
  }catch{
   setError('ثبت تنظیمات سهمیه تأیید نشد. ابتدا بازخوانی کنید و از وضعیت فعلی مطمئن شوید.')
  }finally{setBusy(false)}
 }
 return <form className="ow-term-editor ow-pool-editor" onSubmit={submit}
    aria-label={pool?'ویرایش گروه سهمیه':'تعریف گروه سهمیه'}>
  <div className="ow-term-editor__title">
   <strong>{pool?'ویرایش سهمیه مشترک':'تعریف سهمیه (یک یا چند واحد)'}</strong>
   <button type="button" className="report-btn report-btn--light" onClick={onClose} disabled={busy}>بستن</button>
  </div>
  <label className="report-field"><span>عنوان گروه سهمیه</span>
   <input required maxLength={100} minLength={3} value={label} disabled={busy}
    onChange={e=>setLabel(e.target.value)} placeholder="مثلاً کتابخانه و پژوهش"/>
  </label>
  <fieldset className="ow-pool-unit-fieldset" disabled={busy||membersLocked}>
   <legend>واحدهای استفاده‌کننده از این سهمیه</legend>
   <div className="ow-pool-unit-choices">
    {Object.entries(units).map(([id,name])=>{
      const occupied=owners.get(id)
      const claimedByOther=occupied&&occupied.id!==pool?.id
      return <label key={id} className="ow-pool-unit-choice">
       <input type="checkbox" checked={selected.includes(id)}
        disabled={Boolean(claimedByOther)||busy||membersLocked}
        onChange={()=>toggle(id)}/>
       <span>{name}</span>
       {claimedByOther&&<small>در گروه «{occupied.label}»</small>}
      </label>
    })}
   </div>
  </fieldset>
  {membersLocked&&<p className="ow-muted">عضویت واحدها پس از فعال‌سازی نیمسال قفل می‌شود تا انتساب ساعات گذشته جابه‌جا نشود؛ خود مقدار سهمیه با ثبت دلیل همچنان قابل اصلاح است.</p>}
  <div className="ow-term-fields ow-term-budget-hours">
   <label className="report-field"><span>ساعت کل گروه</span>
    <input type="number" min="0" max="33333" step="1" value={hours}
     aria-label="ساعت کل گروه سهمیه" disabled={busy} onChange={e=>setHours(e.target.value)}/>
   </label>
   <label className="report-field"><span>دقیقه</span>
    <input type="number" min="0" max="59" step="1" value={minutes}
     aria-label="دقیقه گروه سهمیه" disabled={busy} onChange={e=>setMinutes(e.target.value)}/>
   </label>
   <div className="ow-term-allocation-result">
    <small>سهمیه کل (نه برای هر واحد)</small>
    <strong>{count===null?'—':faMinutes(count)}</strong>
   </div>
  </div>
  <p className="ow-muted">سهمیه این گروه فقط یک‌بار ثبت می‌شود و مجموع ساعات تأییدشده تمام واحدهای انتخاب‌شده از همان سقف کسر خواهد شد.</p>
  <label className="report-field"><span>علت تعریف یا اصلاح سهمیه (ثبت در تاریخچه)</span>
   <input required minLength={5} maxLength={500} value={reason} disabled={busy}
    onChange={e=>setReason(e.target.value)} placeholder="مبنای ابلاغ یا اصلاح سهمیه را وارد کنید"/>
  </label>
  {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
  <div className="ow-term-actions">
   <button type="submit" className="report-btn report-btn--primary" disabled={busy||!valid}>
    {busy?'در حال ثبت…':'ذخیره گروه سهمیه'}
   </button>
  </div>
 </form>
}
