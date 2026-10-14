import {useMemo,useState} from 'react'
import JalaliDatePicker from './JalaliDatePicker'
import {assignWorkerTask} from '../lib/operations'
import {assignGroupTask} from '../lib/operationsV2'
import {assessAssignmentCapacity} from '../lib/assignmentCapacity.mjs'

const fa=new Intl.NumberFormat('fa-IR')
const persianDate=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'})
const localToday=()=>{
 const parts=Object.fromEntries(persianDate.formatToParts(new Date()).map(x=>[x.type,x.value]))
 return [parts.year,parts.month,parts.day].join('-')
}
const dayAfter=(date,increment)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+increment);return d.toISOString().slice(0,10)}
const unitNames={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
export default function TaskAssignmentEditor({workers=[],data={},defaultDate,defaultWorkerId='',onSaved,onClose}) {
 const [workerIds,setWorkerIds]=useState(defaultWorkerId?[defaultWorkerId]:[])
 const [filter,setFilter]=useState('')
 const [date,setDate]=useState(defaultDate||localToday())
 const [title,setTitle]=useState('')
 const [instructions,setInstructions]=useState('')
 const [estimate,setEstimate]=useState('60')
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const selected=workers.filter(w=>workerIds.includes(w.id)&&w.state==='active')
 const shortNotice=date<dayAfter(localToday(),2)
 const capacity=useMemo(()=>selected.map(w=>({
  id:w.id,name:w.name,
  result:assessAssignmentCapacity(data,{workerId:w.id,date,estimateMinutes:Number(estimate)})
 })),[data,date,estimate,workers,workerIds])
 const toggle=id=>setWorkerIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])
 const submit=async event=>{
  event.preventDefault()
  if(busy||selected.length===0||selected.length!==workerIds.length||date<localToday())return
  setBusy(true);setError('');setNotice('')
  try {
    if(selected.length===1){
      await assignWorkerTask({workerId:selected[0].id,unit:selected[0].unit,
        title,instructions,date,minutes:estimate,shortNoticeReason:reason})
    } else {
      await assignGroupTask({workerIds:selected.map(w=>w.id),title,instructions,date,
        minutes:estimate,shortNoticeReason:reason})
    }
    setTitle('');setInstructions('');setReason('')
    setNotice(selected.length===1?'کار به دانشجوکار واگذار شد.':
      `کار گروهی برای ${fa.format(selected.length)} نفر ثبت شد؛ تأیید ساعت هر نفر مستقل است.`)
    await onSaved?.()
    onClose?.()
  } catch(err) {
    const message=String(err?.message||'')
    setError(message.includes('short_notice_reason_required')?'علت واگذاری نزدیک ضروری است.':
      message.includes('worker_not_active')?'یکی از افراد دیگر فعال نیست.':
      message.includes('invalid_group_members')?'برای واگذاری گروهی ۲ تا ۲۰ دانشجوکار لازم است.':
      'واگذاری انجام نشد. اطلاعات را بررسی کنید؛ انتخاب‌ها و توضیحات حفظ شده‌اند.')
  } finally{setBusy(false)}
 }
 const options=workers.filter(w=>w.state==='active'&&
  (w.name||'').toLocaleLowerCase('fa-IR').includes(filter.toLocaleLowerCase('fa-IR')))
 return <form className="ow-assignment-form" onSubmit={submit}>
  <div className="ow-assignment-fields">
    <div className="report-field ow-multi-picker">
      <span>دانشجوکارها · {fa.format(selected.length)} نفر انتخاب‌شده</span>
      <details>
        <summary>{selected.length?selected.map(w=>w.name).slice(0,2).join('، ')+
          (selected.length>2?` و ${fa.format(selected.length-2)} نفر دیگر`:''):'انتخاب یک یا چند نفر'}</summary>
        <div className="ow-worker-options">
          <input type="search" value={filter} onChange={e=>setFilter(e.target.value)}
            aria-label="جست‌وجوی دانشجوکار" placeholder="جست‌وجوی نام"/>
          <div className="ow-worker-option-list">
            {options.map(w=><label key={w.id}>
              <input type="checkbox" checked={workerIds.includes(w.id)} onChange={()=>toggle(w.id)}/>
              <span>{w.name} · {unitNames[w.unit]||w.unit}</span>
            </label>)}
            {!options.length&&<span>دانشجوکار فعالی یافت نشد.</span>}
          </div>
        </div>
      </details>
    </div>
    <div className="report-field"><span>تاریخ اجرا (شمسی)</span>
      <JalaliDatePicker value={date} min={localToday()} onChange={setDate} ariaLabel="تاریخ اجرای کار"/>
    </div>
    <label className="report-field ow-estimate-input"><span>زمان استاندارد هر نفر (دقیقه)</span>
      <input type="number" required min="1" max="1440" value={estimate}
        onChange={e=>setEstimate(e.target.value)}/>
    </label>
    <label className="report-field"><span>عنوان کار</span><input required minLength={3} maxLength={160}
      value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان کوتاه و مشخص"/></label>
    <label className="report-field"><span>شرح مورد انتظار</span>
      <input maxLength={3000} value={instructions} onChange={e=>setInstructions(e.target.value)}
        placeholder="خروجی مدنظر"/></label>
  </div>
  {shortNotice&&<label className="report-field ow-short-notice">
    <span>علت واگذاری امروز یا فردا (الزامی)</span>
    <input required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/>
  </label>}
  {selected.length>0&&<details className="ow-context-help">
    <summary>ظرفیت نفرات انتخابی · {fa.format(selected.length)} نفر</summary>
    <div className="ow-capacity-preview">
      {capacity.map(c=><div key={c.id}>
        <strong>{c.name}</strong>
        <span>{c.result.code==='ok'||c.result.code==='full'?'متناسب':
          c.result.code==='overbooked'?'بیش از ظرفیت':
          c.result.code==='unavailable'?'عدم حضور ثبت‌شده':'نیازمند هماهنگی'}</span>
      </div>)}
    </div>
  </details>}
  <p className="ow-muted">در کار گروهی، زمان استاندارد برای هر نفر جداگانه ثبت و گزارش هر نفر مستقل تأیید می‌شود.</p>
  {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
  {notice&&<p role="status" className="ops-alert-success">{notice}</p>}
  <div className="ow-actions">
    {onClose&&<button type="button" className="report-btn report-btn--light" onClick={onClose}>انصراف</button>}
    <button type="submit" className="report-btn report-btn--primary"
      disabled={busy||!selected.length||selected.length!==workerIds.length||date<localToday()}>
      {busy?'در حال ثبت…':selected.length>1?'واگذاری گروهی':'واگذاری کار'}
    </button>
  </div>
 </form>
}
