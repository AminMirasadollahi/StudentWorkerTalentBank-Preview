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
 const [taskUnit,setTaskUnit]=useState('')
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [committed,setCommitted]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const selected=workers.filter(w=>workerIds.includes(w.id)&&w.state==='active')
 const shortNotice=date<dayAfter(localToday(),2)
 const capacity=useMemo(()=>selected.map(w=>({
  id:w.id,name:w.name,
  result:assessAssignmentCapacity(data,{workerId:w.id,date,estimateMinutes:Number(estimate)})
 })),[data,date,estimate,workers,workerIds])
 const issues=capacity.filter(c=>['overbooked','unavailable','not_configured','unknown'].includes(c.result.code))
 const toggle=id=>setWorkerIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])
 const submit=async event=>{
  event.preventDefault()
  if(busy||committed||!Object.hasOwn(unitNames,taskUnit)||selected.length===0||selected.length!==workerIds.length||date<localToday())return
  setBusy(true);setError('');setNotice('')
  try {
    if(selected.length===1){
      await assignWorkerTask({workerId:selected[0].id,unit:taskUnit,
        title,instructions,date,minutes:estimate,shortNoticeReason:reason})
    } else {
      await assignGroupTask({workerIds:selected.map(w=>w.id),unit:taskUnit,title,instructions,date,
        minutes:estimate,shortNoticeReason:reason})
    }
    // The server mutation is committed; a failed refresh must not be reported
    // as a failed assignment (or allow a second, duplicate submission).
    setCommitted(true)
    setTitle('');setInstructions('');setReason('')
    setNotice(selected.length===1?`کار در حوزهٔ ${unitNames[taskUnit]} واگذار شد.`:
      `کار گروهی در حوزهٔ ${unitNames[taskUnit]} برای ${fa.format(selected.length)} نفر ثبت شد؛ ساعت هر نفر مستقل بررسی می‌شود.`)
    try {
      await onSaved?.()
      onClose?.()
    } catch {
      setNotice('واگذاری با موفقیت ثبت شد؛ فقط تازه‌سازی فهرست ناموفق بود. برای مشاهده نتیجه، صفحه را دوباره بارگذاری کنید.')
    }
  } catch(err) {
    const message=String(err?.message||'')
    setError(message.includes('short_notice_reason_required')?'علت واگذاری نزدیک ضروری است.':
      message.includes('worker_not_active')?'یکی از افراد دیگر فعال نیست.':
      message.includes('invalid_group_members')?'برای واگذاری گروهی ۲ تا ۲۰ دانشجوکار لازم است.':
      message.includes('invalid_unit')?'واحد فعالیت معتبر یا فعال نیست.':
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
              <span>{w.name}</span>
            </label>)}
            {!options.length&&<span>دانشجوکار فعالی یافت نشد.</span>}
          </div>
        </div>
      </details>
    </div>
    <label className="report-field"><span>واحد انجام این کار (الزامی)</span>
      <select required aria-label="واحد انجام کار" value={taskUnit}
        onChange={e=>setTaskUnit(e.target.value)}>
        <option value="">انتخاب واحد فعالیت</option>
        {Object.entries(unitNames).map(([code,name])=><option key={code} value={code}>{name}</option>)}
      </select>
    </label>
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
  {issues.length>0&&<div className="ow-capacity-warning" role="status">
    {issues.map(c=><p key={c.id}>
      {selected.length>1&&<b>{c.name}: </b>}
      {c.result.code==='overbooked'
        ?<><strong>هشدار بیش‌ازظرفیت:</strong> مجموع کارهای ثبت‌شده از ظرفیت اعلام‌شده بیشتر می‌شود.</>
        :c.result.code==='unavailable'
          ?<><strong>هشدار عدم حضور:</strong> برای این روز ظرفیت صفر ثبت شده است.</>
          :c.result.code==='not_configured'
            ?<><strong>برنامه حضور برای این روز ثبت نشده است.</strong> نبود برنامه به معنی غیبت قطعی نیست.</>
            :<><strong>ظرفیت قابل محاسبه نیست.</strong> پیش از واگذاری بررسی کنید.</>}
      {c.result.exception&&<small>محاسبه بر اساس تغییر موقت همین روز است.</small>}
    </p>)}
  </div>}
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
  <p className="ow-muted">واحد انتخاب‌شده به خودِ کار تعلق دارد، نه به واحد اولیهٔ ثبت‌نام دانشجو. ساعت گزارش‌شده و تأییدشدهٔ هر نفر زیر همین واحد محاسبه می‌شود. در کار گروهی، یک واحد برای همهٔ اعضای آن کار در نظر گرفته می‌شود.</p>
  {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
  {notice&&<p role="status" className="ops-alert-success">{notice}</p>}
  <div className="ow-actions">
    {onClose&&<button type="button" className="report-btn report-btn--light" onClick={onClose}>انصراف</button>}
    <button type="submit" className="report-btn report-btn--primary"
      disabled={busy||committed||!Object.hasOwn(unitNames,taskUnit)||!selected.length||selected.length!==workerIds.length||date<localToday()}>
      {busy?'در حال ثبت…':selected.length>1?'واگذاری گروهی':'واگذاری کار'}
    </button>
  </div>
 </form>
}
