import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getAdminWork, getMyWork, setWeeklyDay, setDateException,
  assignWorkerTask, startMyTask, submitMyTime, reviewWorkerTime,
} from './lib/operations'
import './operations-workspace.css'
import JalaliDatePicker from './components/JalaliDatePicker'
import { scopeWorkerHistory, summarizeWorkerHistory } from './lib/workerHistory'

const fa = new Intl.NumberFormat('fa-IR')
const dLabel = new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
  dateStyle:'medium', timeZone:'UTC',
})
const dateParts = new Intl.DateTimeFormat('en-US',{
  calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'
})
const dayLabels = [[6,'شنبه'],[7,'یکشنبه'],[1,'دوشنبه'],[2,'سه‌شنبه'],[3,'چهارشنبه'],[4,'پنجشنبه'],[5,'جمعه']]
const unitLabels = {library:'کتابخانه',public_relations:'روابط عمومی',research:'پژوهش'}
const workerStateLabels = {active:'فعال',paused:'متوقف موقت',inactive:'غیرفعال'}
const stateLabels = {
  assigned:'واگذار شده',in_progress:'در حال انجام',submitted:'منتظر تأیید',
  completed:'تکمیل‌شده',needs_changes:'نیازمند اصلاح',cancelled:'لغوشده',
}
const reviewLabels = {
  submitted:'منتظر تأیید',approved:'تأییدشده',
  changes_requested:'نیازمند اصلاح',rejected:'ردشده',
}
const extraTimeReasons = {
  equipment_issue:'اختلال تجهیزات یا محیط',
  unexpected_complexity:'حجم یا پیچیدگی پیش‌بینی‌نشده',
  instructions_changed:'تغییر یا ابهام دستورالعمل',
  skill_gap:'نیاز به آموزش یا تسلط بیشتر',
  other:'سایر موارد',
}
const label = (id,items) => items.find(x=>x.id===id)?.name || '—'
const n = value=>fa.format(value||0)
const minutes = value=>`${n(value)} دقیقه`
function exactDuration(totalMinutes) {
  const total=Math.max(0,Math.trunc(Number(totalMinutes)||0))
  const hours=Math.floor(total/60)
  const remainder=total%60
  if(!hours)return `${n(remainder)} دقیقه`
  if(!remainder)return `${n(hours)} ساعت`
  return `${n(hours)} ساعت و ${n(remainder)} دقیقه`
}
function today() {
  const p = Object.fromEntries(dateParts.formatToParts(new Date()).map(x=>[x.type,x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function shift(date,delta) {
  const d=new Date(date+'T00:00:00Z')
  d.setUTCDate(d.getUTCDate()+delta)
  return d.toISOString().slice(0,10)
}
function isoDay(date) {
  return new Date(date+'T00:00:00Z').getUTCDay()||7
}
function pretty(date) {
  if(!date) return '—'
  return dLabel.format(new Date(date+'T00:00:00Z'))
}
function toMin(time) {
  const [h,m]=time.split(':').map(Number)
  return h*60+m
}
function asTime(value) {
  return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
}
function totalSlots(list) {
  return list.reduce((sum,s)=>sum+Number(s.end-s.start),0)
}
function availableOn(data,workerId,date) {
  const ex=(data.exceptions||[]).find(x=>x.worker_id===workerId && x.local_date===date)
  if(ex) return ex.kind==='unavailable'?0:totalSlots(ex.intervals)
  const slots=(data.weekly_slots||[]).filter(x=>
    x.worker_id===workerId && Number(x.weekday_iso)===isoDay(date)
    && x.valid_from<=date && (!x.valid_until || x.valid_until>=date)
  )
  return slots.reduce((sum,x)=>sum+Number(x.end_minute)-Number(x.start_minute),0)
}
function estimatedOn(data,workerId,date) {
  return (data.tasks||[]).filter(x=>
    x.worker_id===workerId && x.planned_date===date && x.state!=='cancelled'
  ).reduce((sum,x)=>sum+Number(x.estimate_minutes),0)
}
function readableError(e) {
  const raw=String(e?.message||'')
  const dict={
    short_notice_reason_required:'برای واگذاری امروز یا فردا، علت کوتاه وارد کنید.',
    worker_not_active:'این دانشجوکار هنوز فعال نیست.',
    worker_access_denied:'شما مجوز انجام این عملیات را ندارید.',
    task_access_denied:'این کار در فهرست وظایف شما نیست.',
    invalid_time_submission:'تاریخ یا مدت اجرای واردشده معتبر نیست.',
    invalid_task_transition:'وضعیت فعلی این کار اجازه شروع مجدد نمی‌دهد.',
    already_reviewed:'این گزارش قبلاً بررسی شده است.',
    review_reason_required:'برای اختلاف زمان یا تأیید زمان اضافه، توضیح تصمیم لازم است.',
    extra_time_reason_required:'برای درخواست زمان اضافه، نوع علت و توضیح کافی را وارد کنید.',
    invalid_extra_time_request:'زمان یا علت درخواست اضافه معتبر نیست.',
    overlapping_or_invalid_slots:'زمان‌های حضور هم‌پوشانی دارند یا نامعتبرند.',
    invalid_availability:'تنظیمات زمان حضور معتبر نیست.',
    invalid_exception:'تاریخ یا بازه تغییر حضور معتبر نیست.',
  }
  for (const [code,msg] of Object.entries(dict)) if(raw.includes(code)) return msg
  if(/fetch|network/i.test(raw))return 'ارتباط برقرار نشد؛ پاسخ‌ها حفظ شده‌اند. دوباره تلاش کنید.'
  return 'عملیات کامل نشد؛ اطلاعات را بررسی و دوباره تلاش کنید.'
}
function Message({error,notice}) {
  return <>
    {error&&<div role="alert" className="report-alert report-alert--error">{error}</div>}
    {notice&&<div role="status" className="ops-alert-success">{notice}</div>}
  </>
}
function SectionTabs({value,onChange,options}) {
  return <nav className="ow-tabs" aria-label="بخش‌های عملیاتی">
    {options.map(([id,title])=><button key={id} type="button"
      className={value===id?'ow-tab is-selected':'ow-tab'}
      aria-current={value===id?'page':undefined}
      onClick={()=>onChange(id)}>{title}</button>)}
  </nav>
}
function ScheduleEditor({workerId,onSaved}) {
  const [weekday,setWeekday]=useState('6')
  const [start,setStart]=useState('08:00')
  const [end,setEnd]=useState('12:00')
  const [effective,setEffective]=useState(today())
  const [noHours,setNoHours]=useState(false)
  const [exceptionDate,setExceptionDate]=useState(today())
  const [exceptionKind,setExceptionKind]=useState('unavailable')
  const [exceptionStart,setExceptionStart]=useState('08:00')
  const [exceptionEnd,setExceptionEnd]=useState('12:00')
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const save=async (fn)=>{
    setBusy(true);setError('');setNotice('')
    try{await fn();setNotice('برنامه حضور ذخیره شد.');await onSaved?.()}
    catch(e){setError(readableError(e))}
    finally{setBusy(false)}
  }
  if(!workerId)return <p className="ow-muted">یک دانشجوکار انتخاب کنید.</p>
  return <div className="ow-schedule-editor">
    <form onSubmit={event=>{event.preventDefault();save(()=>setWeeklyDay(
      workerId,Number(weekday),noHours?[]:[{start:toMin(start),end:toMin(end)}],effective
    ))}}>
      <h3>برنامه ثابت هفتگی</h3>
      <div className="ow-fields ow-fields--four">
        <label className="report-field"><span>روز هفته</span>
          <select value={weekday} onChange={e=>setWeekday(e.target.value)}>
            {dayLabels.map(([id,title])=><option value={id} key={id}>{title}</option>)}
          </select>
        </label>
        <label className="report-field"><span>ساعت شروع</span>
          <input type="time" value={start} disabled={noHours} onChange={e=>setStart(e.target.value)}/>
        </label>
        <label className="report-field"><span>ساعت پایان</span>
          <input type="time" value={end} disabled={noHours} onChange={e=>setEnd(e.target.value)}/>
        </label>
        <label className="report-field"><span>اعمال از تاریخ (شمسی)</span>
          <JalaliDatePicker min={today()} value={effective} onChange={setEffective} ariaLabel="تاریخ شروع برنامه هفتگی"/>
        </label>
      </div>
      <label className="ow-checkbox">
        <input type="checkbox" checked={noHours} onChange={e=>setNoHours(e.target.checked)}/>
        در این روز حضور پیش‌فرض ندارم
      </label>
      <button className="report-btn report-btn--primary" disabled={busy} type="submit">ثبت برنامه هفتگی</button>
    </form>
    <form onSubmit={event=>{event.preventDefault();save(()=>setDateException(
      workerId,exceptionDate,exceptionKind,
      exceptionKind==='unavailable'?[]:[{start:toMin(exceptionStart),end:toMin(exceptionEnd)}],
      note
    ))}}>
      <h3>تغییر موقت یک روز</h3>
      <div className="ow-fields ow-fields--four">
        <label className="report-field"><span>تاریخ (شمسی)</span>
          <JalaliDatePicker min={today()} value={exceptionDate} onChange={setExceptionDate} ariaLabel="تاریخ تغییر موقت حضور"/>
        </label>
        <label className="report-field"><span>نوع تغییر</span>
          <select value={exceptionKind} onChange={e=>setExceptionKind(e.target.value)}>
            <option value="unavailable">عدم حضور</option>
            <option value="replacement_intervals">ساعات جایگزین</option>
          </select>
        </label>
        {exceptionKind==='replacement_intervals'&&<>
          <label className="report-field"><span>از</span><input type="time" value={exceptionStart} onChange={e=>setExceptionStart(e.target.value)}/></label>
          <label className="report-field"><span>تا</span><input type="time" value={exceptionEnd} onChange={e=>setExceptionEnd(e.target.value)}/></label>
        </>}
      </div>
      <label className="report-field"><span>توضیح کوتاه (اختیاری)</span>
        <input maxLength={300} value={note} onChange={e=>setNote(e.target.value)}/>
      </label>
      <button className="report-btn report-btn--primary" disabled={busy} type="submit">ثبت تغییر این روز</button>
    </form>
    <Message error={error} notice={notice}/>
    <p className="ow-muted">تاریخ‌ها در تقویم شمسی انتخاب می‌شوند و تغییرات گذشته قابل بازنویسی نیستند.</p>
  </div>
}
function ApprovalCard({entry,task,worker,onDone}) {
  const standard=Number(task?.estimate_minutes ?? entry.reported_minutes)
  const requested=Number(entry.reported_minutes)
  const asksExtra=requested>standard
  const [approved,setApproved]=useState(String(Math.min(standard,requested)))
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const approvalNeedsReason=Number(approved)!==requested || Number(approved)>standard
  const act=async decision=>{
    setBusy(true);setError('')
    try{
      await reviewWorkerTime({entryId:entry.id,decision,approvedMinutes:approved,note})
      await onDone()
    }catch(e){setError(readableError(e))}
    finally{setBusy(false)}
  }
  return <article className="ow-item">
    <strong>{task?.title||'کار'}</strong>
    <small>{worker?.name||'—'} · {pretty(entry.work_date)}</small>
    <p>زمان استاندارد: <b>{minutes(standard)}</b> · زمان درخواستی: <b>{minutes(requested)}</b>
      {asksExtra&&<> · اضافه درخواستی: <b>{minutes(requested-standard)}</b></>}
    </p>
    {asksExtra&&<p className="ow-overtime-review">
      <b>علت درخواست اضافه:</b> {extraTimeReasons[entry.extra_time_reason_code]||'در گزارش قدیمی ثبت نشده'}
      {entry.extra_time_reason_text&&<> · {entry.extra_time_reason_text}</>}
    </p>}
    {entry.worker_note&&<p>توضیح تکمیلی دانشجو: {entry.worker_note}</p>}
    <div className="ow-fields ow-fields--two">
      <label className="report-field"><span>مدت تأییدشده (دقیقه)</span>
        <input type="number" min="0" max={requested} value={approved} onChange={e=>setApproved(e.target.value)}/>
      </label>
      <label className="report-field"><span>توضیح تصمیم {approvalNeedsReason?'(الزامی)':'(اختیاری)'}</span>
        <input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/>
      </label>
    </div>
    <div className="ow-actions">
      <button className="report-btn report-btn--primary" type="button"
        disabled={busy||approved===''||!Number.isInteger(Number(approved))||Number(approved)<0||Number(approved)>requested||(approvalNeedsReason&&!note.trim())}
        onClick={()=>act('approved')}>تأیید ساعت</button>
      <button className="report-btn report-btn--light" type="button"
        disabled={busy||!note.trim()} onClick={()=>act('changes_requested')}>نیازمند اصلاح</button>
      <button className="report-btn report-btn--light" type="button"
        disabled={busy||!note.trim()} onClick={()=>act('rejected')}>رد گزارش</button>
    </div>
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
  </article>
}
async function exportOpsExcel(data, filteredToOneWorker=false) {
  const ExcelJS=await import('exceljs')
  const wb=new ExcelJS.Workbook()
  const sh=wb.addWorksheet('کارها و ساعات',{views:[{rightToLeft:true}]})
  sh.columns=[
    {header:'دانشجوکار',key:'name',width:25},{header:'واحد',key:'unit',width:20},
    {header:'عنوان کار',key:'task',width:34},{header:'تاریخ برنامه',key:'date',width:21},
    {header:'زمان برآوردی (دقیقه)',key:'estimate',width:24},
    {header:'زمان درخواستی (دقیقه)',key:'reported',width:25},
    {header:'زمان تأییدشده (دقیقه)',key:'approved',width:25},
    {header:'وضعیت گزارش',key:'review',width:22},
    {header:'علت زمان اضافه',key:'extraReason',width:30},
    {header:'توضیح درخواست اضافه',key:'extraText',width:42},
    {header:'توضیح تأیید مدیر',key:'approvalNote',width:42},
  ]
  for(const task of data.tasks||[]){
    const worker=data.workers?.find(w=>w.id===task.worker_id)
    const entries=(data.time_entries||[]).filter(e=>e.task_id===task.id)
    if(!entries.length) sh.addRow({name:worker?.name||'',unit:unitLabels[task.unit],
      task:task.title,date:pretty(task.planned_date),estimate:task.estimate_minutes,review:'بدون گزارش'})
    for(const entry of entries) sh.addRow({
      name:worker?.name||'',unit:unitLabels[task.unit],task:task.title,
      date:pretty(task.planned_date),estimate:task.estimate_minutes,
      reported:entry.reported_minutes,
      approved:entry.review_state==='approved'?entry.approved_minutes:'',
      review:reviewLabels[entry.review_state] || entry.review_state,
      extraReason:extraTimeReasons[entry.extra_time_reason_code]||'',
      extraText:entry.extra_time_reason_text||'',
      approvalNote:entry.review_note||'',
    })
  }
  sh.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}}
  sh.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF153E5C'}}
  sh.autoFilter={from:{row:1,column:1},to:{row:sh.rowCount,column:11}}
  sh.views=[{state:'frozen',ySplit:1,rightToLeft:true}]
  const blob=new Blob([await wb.xlsx.writeBuffer()],
    {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url;a.download=filteredToOneWorker?'student-worker-selected-history.xlsx':'student-worker-operations.xlsx';a.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function AdminOperations() {
  const [data,setData]=useState({workers:[],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
  const [view,setView]=useState('tasks')
  const [workerId,setWorkerId]=useState('')
  const [historyWorkerId,setHistoryWorkerId]=useState('')
  const [title,setTitle]=useState('')
  const [instructions,setInstructions]=useState('')
  const [date,setDate]=useState(today())
  const [estimate,setEstimate]=useState('60')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  const refresh=async ()=>{
    setLoading(true)
    try{
      const result=await getAdminWork()
      setData(result||{workers:[],tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
    }catch(e){setError(readableError(e))}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])

  const workers=data.workers||[]
  const active=workers.filter(w=>w.state==='active')
  const chosen=workers.find(w=>w.id===workerId)
  const selectedHistoryWorker=workers.find(w=>w.id===historyWorkerId)
  const historyData=scopeWorkerHistory(data,historyWorkerId)
  const historySummary=summarizeWorkerHistory(historyData)
  const todayTasks=(data.tasks||[]).filter(t=>t.planned_date===today()&&t.state!=='cancelled')
  const pending=(data.time_entries||[]).filter(e=>e.review_state==='submitted')
  const approvedMinutes=(data.time_entries||[])
    .filter(e=>e.review_state==='approved')
    .reduce((sum,e)=>sum+Number(e.approved_minutes||0),0)
  const isShort=date<shift(today(),2)

  const run=async callback=>{
    setBusy(true);setError('');setNotice('')
    try{await callback();await refresh();setNotice('اطلاعات با موفقیت ذخیره شد.')}
    catch(e){setError(readableError(e))}
    finally{setBusy(false)}
  }
  const weekStart=shift(today(),-((new Date(today()+'T00:00:00Z').getUTCDay()+1)%7))
  const week=Array.from({length:7},(_,i)=>shift(weekStart,i))

  return <div className="ow-workspace">
    <div className="ow-summary">
      <article><span>دانشجوکار فعال</span><b>{n(active.length)}</b></article>
      <article><span>کار برنامه‌ریزی‌شده امروز</span><b>{n(todayTasks.length)}</b></article>
      <article><span>گزارش منتظر تأیید</span><b>{n(pending.length)}</b></article>
      <article><span>کل ساعات تأییدشده</span><b>{exactDuration(approvedMinutes)}</b></article>
    </div>
    <SectionTabs value={view} onChange={setView} options={[
      ['tasks','واگذاری کار'],['approvals','تأیید ساعات'],['availability','برنامه حضور'],['history','سابقه و خروجی'],
    ]}/>
    {loading&&<p className="ow-muted">در حال دریافت اطلاعات…</p>}
    <Message error={error} notice={notice}/>

    {view==='tasks'&&<>
      <section className="report-panel">
        <h2>کار جدید</h2>
        <form onSubmit={e=>{e.preventDefault();run(async()=>{
          await assignWorkerTask({workerId,unit:chosen?.unit,title,instructions,
            date,minutes:estimate,shortNoticeReason:reason})
          setTitle('');setInstructions('');setReason('')
        })}}>
          <div className="ow-fields ow-fields--three">
            <label className="report-field"><span>دانشجوکار</span>
              <select value={workerId} required onChange={e=>setWorkerId(e.target.value)}>
                <option value="">انتخاب کنید</option>
                {active.map(w=><option key={w.id} value={w.id}>{w.name} · {unitLabels[w.unit]}</option>)}
              </select>
            </label>
            <label className="report-field"><span>تاریخ اجرا (شمسی)</span>
              <JalaliDatePicker min={today()} value={date} onChange={setDate} ariaLabel="تاریخ اجرای کار"/>
            </label>
            <label className="report-field"><span>زمان استاندارد (دقیقه)</span>
              <input type="number" required min="1" max="1440" value={estimate} onChange={e=>setEstimate(e.target.value)}/>
            </label>
          </div>
          <div className="ow-fields ow-fields--two">
            <label className="report-field"><span>عنوان کار</span>
              <input required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثلاً ثبت ۱۰ جلد کتاب"/>
            </label>
            <label className="report-field"><span>شرح کوتاه</span>
              <input maxLength={3000} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="خروجی مورد انتظار را توضیح دهید"/>
            </label>
          </div>
          {isShort&&<label className="report-field ow-short-notice">
            <span>علت واگذاری نزدیک به موعد (الزامی)</span>
            <input required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="این کار برای امروز یا فردا برنامه‌ریزی شده است"/>
          </label>}
          {workerId&&<p className="ow-muted">
            ظرفیت این روز: {minutes(availableOn(data,workerId,date))} ·
            کارهای برنامه‌ریزی‌شده: {minutes(estimatedOn(data,workerId,date))}
          </p>}
          <button className="report-btn report-btn--primary" type="submit" disabled={busy||!workerId}>واگذاری کار</button>
        </form>
      </section>
      <section className="report-panel">
        <div className="report-panel-heading"><h2>کارهای ثبت‌شده</h2><small>{n((data.tasks||[]).length)} کار</small></div>
        <div className="ow-list">
          {(data.tasks||[]).slice(0,100).map(t=><article className="ow-item" key={t.id}>
            <div className="ow-item-header"><strong>{t.title}</strong><span className="ow-status">{stateLabels[t.state]}</span></div>
            <small>{label(t.worker_id,workers)} · {pretty(t.planned_date)} · {minutes(t.estimate_minutes)}</small>
            {t.short_notice&&<p className="ow-warning">واگذاری کوتاه‌مدت: {t.short_notice_reason}</p>}
          </article>)}
          {!data.tasks?.length&&<p className="ow-muted">هنوز کاری واگذار نشده است.</p>}
        </div>
      </section>
    </>}

    {view==='approvals'&&<section className="report-panel">
      <div className="report-panel-heading"><h2>گزارش‌های منتظر تأیید</h2><small>{n(pending.length)} گزارش</small></div>
      <div className="ow-list">
        {pending.map(e=><ApprovalCard key={e.id} entry={e}
          task={data.tasks?.find(t=>t.id===e.task_id)}
          worker={workers.find(w=>w.id===e.worker_id)} onDone={refresh}/>)}
        {!pending.length&&<p className="ow-muted">گزارشی در صف بررسی وجود ندارد.</p>}
      </div>
    </section>}

    {view==='availability'&&<section className="report-panel">
      <h2>ظرفیت و برنامه دانشجوکارها</h2>
      <label className="report-field ow-worker-selector"><span>دانشجوکار</span>
        <select value={workerId} onChange={e=>setWorkerId(e.target.value)}>
          <option value="">انتخاب کنید</option>
          {active.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      {workerId&&<>
        <div className="ow-week-grid">
          {week.map(d=><article key={d}><strong>{dayLabels.find(x=>x[0]===isoDay(d))?.[1]}</strong>
            <small>{pretty(d)}</small>
            <b>{minutes(availableOn(data,workerId,d))}</b>
            <small>برنامه: {minutes(estimatedOn(data,workerId,d))}</small>
          </article>)}
        </div>
        <ScheduleEditor key={workerId} workerId={workerId} onSaved={refresh}/>
      </>}
    </section>}

    {view==='history'&&<section className="report-panel">
      <div className="report-panel-heading">
        <h2>سابقه ساعات و خروجی</h2>
        <button className="report-btn report-btn--primary" type="button"
          disabled={loading||!historyData.tasks.length}
          onClick={()=>exportOpsExcel(historyData,Boolean(historyWorkerId))}>
          {historyWorkerId?'خروجی Excel این دانشجوکار':'خروجی Excel همه'}
        </button>
      </div>
      <div className="ow-history-filter">
        <label className="report-field ow-worker-selector"><span>فیلتر بر اساس دانشجوکار</span>
          <select value={historyWorkerId} onChange={e=>setHistoryWorkerId(e.target.value)}>
            <option value="">همه دانشجوکارها</option>
            {workers.map(w=><option key={w.id} value={w.id}>
              {w.name} · {unitLabels[w.unit]||w.unit}
            </option>)}
          </select>
        </label>
        <p className="ow-muted">
          {historyWorkerId?'سوابق و فایل Excel فقط به دانشجوکار انتخاب‌شده محدود می‌شوند.':'سوابق و خروجی همه دانشجوکارها نمایش داده می‌شود.'}
        </p>
      </div>
      {selectedHistoryWorker&&<section className="ow-worker-profile" aria-label="پروفایل عملکرد دانشجوکار">
        <div className="ow-profile-heading">
          <div>
            <h3>پرونده عملکرد: {selectedHistoryWorker.name}</h3>
            <p className="ow-muted">
              {unitLabels[selectedHistoryWorker.unit]||selectedHistoryWorker.unit||'واحد نامشخص'}
              {selectedHistoryWorker.major&&<> · {selectedHistoryWorker.major}</>}
              {selectedHistoryWorker.entry_year&&<> · ورودی {n(selectedHistoryWorker.entry_year)}</>}
            </p>
          </div>
          <span className="ow-status">{workerStateLabels[selectedHistoryWorker.state]||selectedHistoryWorker.state}</span>
        </div>
        <div className="ow-profile-metrics">
          <div><span>کل کارهای واگذارشده</span><b>{n(historySummary.taskCount)}</b></div>
          <div><span>کارهای باز</span><b>{n(historySummary.openCount)}</b></div>
          <div><span>گزارش منتظر تأیید</span><b>{n(historySummary.pendingCount)}</b></div>
          <div><span>مجموع ساعات تأییدشده</span><b>{exactDuration(historySummary.approvedMinutes)}</b></div>
        </div>
      </section>}
      <div className="report-panel-heading">
        <h3>{historyWorkerId?'سوابق فعالیت این دانشجوکار':'سوابق فعالیت همه دانشجوکارها'}</h3>
        <small>{n(historySummary.reportCount)} گزارش</small>
      </div>
      <div className="ow-list">
        {historyData.time_entries.slice(0,200).map(e=>(
          <article className="ow-item" key={e.id}>
            <strong>{label(e.worker_id,workers)} · {data.tasks?.find(t=>t.id===e.task_id)?.title||'کار'}</strong>
            <small>{pretty(e.work_date)} · {reviewLabels[e.review_state]||e.review_state}</small>
            <p>درخواست: {minutes(e.reported_minutes)} · تأیید:
              {e.review_state==='approved'?minutes(e.approved_minutes):'تأیید نشده'}
            </p>
            {e.extra_time_reason_code&&<small>دلیل درخواست اضافه: {extraTimeReasons[e.extra_time_reason_code]||e.extra_time_reason_code}
              {e.extra_time_reason_text&&<> · {e.extra_time_reason_text}</>}
            </small>}
            {e.review_note&&<small>توضیح مدیر: {e.review_note}</small>}
          </article>
        ))}
        {!historyData.time_entries.length&&<p className="ow-muted">
          {historyWorkerId?'برای این دانشجوکار هنوز گزارش کاری ثبت نشده است.':'هنوز سابقه‌ای وجود ندارد.'}
        </p>}
      </div>
    </section>}
  </div>
}
function WorkerTaskCard({task,onSaved}) {
  const [date,setDate]=useState(today())
  const [requestExtra,setRequestExtra]=useState(false)
  const [requested,setRequested]=useState(String(task.estimate_minutes))
  const [reasonCode,setReasonCode]=useState('')
  const [reasonText,setReasonText]=useState('')
  const [completionConfirmed,setCompletionConfirmed]=useState(false)
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const keyRef=useRef(crypto.randomUUID())
  const ready=['assigned','in_progress','needs_changes'].includes(task.state)
  const standard=Number(task.estimate_minutes)
  const requestedMinutes=requestExtra?Number(requested):standard
  const extraValid=!requestExtra || (
    Number.isInteger(requestedMinutes)&&requestedMinutes>standard&&requestedMinutes<=1440
    && Boolean(reasonCode)&&reasonText.trim().length>=10&&reasonText.trim().length<=600
  )
  const perform=async fn=>{
    setBusy(true);setError('')
    try{await fn();await onSaved()}
    catch(e){setError(readableError(e))}
    finally{setBusy(false)}
  }
  return <article className="ow-item">
    <div className="ow-item-header"><strong>{task.title}</strong><span className="ow-status">{stateLabels[task.state]}</span></div>
    <small>{pretty(task.planned_date)} · زمان استاندارد قابل ثبت: {minutes(standard)}</small>
    {task.instructions&&<p>{task.instructions}</p>}
    {ready&&<form onSubmit={e=>{e.preventDefault();if(!completionConfirmed||!extraValid)return;perform(async()=>{
      await submitMyTime({taskId:task.id,date,minutes:requestedMinutes,note,
        clientSubmissionId:keyRef.current,
        extraReasonCode:requestExtra?reasonCode:null,
        extraReasonText:requestExtra?reasonText.trim():null})
      keyRef.current=crypto.randomUUID()
    })}}>
      <div className="ow-fields ow-fields--two">
        <label className="report-field"><span>تاریخ انجام کار (شمسی)</span>
          <JalaliDatePicker value={date} max={today()} min={shift(today(),-90)}
            onChange={setDate} ariaLabel="تاریخ انجام کار"/>
        </label>
        <div className="ow-standard-credit">
          <span>زمان استاندارد این کار</span><b>{minutes(standard)}</b>
          <small>با تأیید انجام کار، همین زمان برای بررسی مدیر ارسال می‌شود؛ حتی اگر زودتر تمام کرده باشید.</small>
        </div>
      </div>
      <label className="ow-checkbox">
        <input type="checkbox" checked={completionConfirmed} onChange={e=>setCompletionConfirmed(e.target.checked)}/>
        کار محول‌شده را انجام داده‌ام و گزارش من برای بررسی مدیر آماده است.
      </label>
      <label className="report-field"><span>خلاصه نتیجه کار (اختیاری)</span>
        <input maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}
          placeholder="مثلاً تعداد منابع ثبت‌شده یا نتیجه کار"/>
      </label>
      <label className="ow-checkbox ow-extra-toggle">
        <input type="checkbox" checked={requestExtra} onChange={e=>{
          const checked=e.target.checked
          setRequestExtra(checked)
          if(!checked){setRequested(String(standard));setReasonCode('');setReasonText('')}
        }}/>
        درخواست ثبت زمان بیشتر از زمان استاندارد دارم
      </label>
      {requestExtra&&<div className="ow-extra-panel">
        <p>زمان اضافه فقط پس از بررسی و تأیید مدیر قابل ثبت است. دلیل دقیق افزایش زمان را وارد کنید.</p>
        <div className="ow-fields ow-fields--two">
          <label className="report-field"><span>زمان درخواستی کل (دقیقه)</span>
            <input type="number" min={standard+1} max="1440" required
              value={requested} onChange={e=>setRequested(e.target.value)}/>
          </label>
          <label className="report-field"><span>علت اصلی افزایش زمان</span>
            <select required value={reasonCode} onChange={e=>setReasonCode(e.target.value)}>
              <option value="">انتخاب کنید</option>
              {Object.entries(extraTimeReasons).map(([code,title])=><option key={code} value={code}>{title}</option>)}
            </select>
          </label>
        </div>
        <label className="report-field"><span>توضیح دلیل افزایش زمان (الزامی؛ حداقل ۱۰ نویسه)</span>
          <textarea required minLength={10} maxLength={600} rows={2}
            value={reasonText} onChange={e=>setReasonText(e.target.value)}
            placeholder="چه مشکلی رخ داد و چرا زمان استاندارد کافی نبود؟"/>
        </label>
        {Number.isFinite(requestedMinutes)&&requestedMinutes>standard&&<p className="ow-muted">
          زمان اضافه درخواستی: {minutes(requestedMinutes-standard)}
        </p>}
      </div>}
      <div className="ow-actions">
        {task.state!=='in_progress'&&<button type="button" className="report-btn report-btn--light"
          onClick={()=>perform(()=>startMyTask(task.id))} disabled={busy}>شروع کار</button>}
        <button type="submit" className="report-btn report-btn--primary"
          disabled={busy||!completionConfirmed||!extraValid}>
          {requestExtra?'ارسال درخواست زمان بیشتر برای بررسی':'ثبت انجام کار با زمان استاندارد'}
        </button>
      </div>
    </form>}
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
  </article>
}
export function WorkerOperations({profile}) {
  const [data,setData]=useState({tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})
  const [view,setView]=useState('today')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const refresh=async()=>{
    setLoading(true);setError('')
    try{setData(await getMyWork()||{tasks:[],weekly_slots:[],exceptions:[],time_entries:[]})}
    catch(e){setError(readableError(e))}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  const records=data.time_entries||[]
  const approved=records.filter(x=>x.review_state==='approved')
  const total=approved.reduce((sum,e)=>sum+Number(e.approved_minutes||0),0)
  const tasks=data.tasks||[]
  const visible=view==='today'?tasks.filter(t=>t.planned_date===today()):
    view==='week'?tasks.filter(t=>t.planned_date>=shift(today(),-2)&&t.planned_date<=shift(today(),7)):tasks
  return <div className="ow-workspace">
    <div className="ow-summary">
      <article><span>کارهای باز</span><b>{n(tasks.filter(t=>!['completed','cancelled'].includes(t.state)).length)}</b></article>
      <article><span>گزارش منتظر بررسی</span><b>{n(records.filter(e=>e.review_state==='submitted').length)}</b></article>
      <article><span>ساعات تأییدشده</span><b>{exactDuration(total)}</b></article>
    </div>
    <SectionTabs value={view} onChange={setView} options={[
      ['today','امروز'],['week','این هفته'],['availability','زمان حضور'],['history','سابقه من'],
    ]}/>
    {loading&&<p className="ow-muted">در حال دریافت برنامه…</p>}
    {error&&<div className="report-alert report-alert--error" role="alert">{error}</div>}
    {(view==='today'||view==='week')&&<section className="report-panel">
      <h2>{view==='today'?'کارهای امروز':'کارهای هفته'}</h2>
      <div className="ow-list">
        {visible.map(t=><WorkerTaskCard key={t.id} task={t} onSaved={refresh}/>)}
        {!visible.length&&<p className="ow-muted">کاری برای این بازه ثبت نشده است.</p>}
      </div>
    </section>}
    {view==='availability'&&<section className="report-panel">
      <h2>برنامه حضور</h2>
      <ScheduleEditor workerId={profile.worker_id} onSaved={refresh}/>
      <div className="ow-list">
        {(data.weekly_slots||[]).filter(s=>!s.valid_until || s.valid_until>=today())
          .map(s=><article className="ow-item" key={s.id}>
            <strong>{dayLabels.find(x=>x[0]===Number(s.weekday_iso))?.[1]}</strong>
            <small>{asTime(s.start_minute)} تا {asTime(s.end_minute)} · از {pretty(s.valid_from)}</small>
          </article>)}
      </div>
    </section>}
    {view==='history'&&<section className="report-panel">
      <h2>سابقه عملکرد من</h2>
      <div className="ow-list">
        {records.map(e=><article className="ow-item" key={e.id}>
          <strong>{tasks.find(t=>t.id===e.task_id)?.title||'کار'}</strong>
          <small>{pretty(e.work_date)} · {reviewLabels[e.review_state]||e.review_state}</small>
          <p>درخواست‌شده: {minutes(e.reported_minutes)} · تأیید:
            {e.review_state==='approved'?minutes(e.approved_minutes):'هنوز تأیید نشده'}</p>
          {e.extra_time_reason_code&&<small>دلیل زمان اضافه: {extraTimeReasons[e.extra_time_reason_code]} · {e.extra_time_reason_text}</small>}
          {e.review_note&&<small>نظر مدیر: {e.review_note}</small>}
        </article>)}
        {!records.length&&<p className="ow-muted">هنوز گزارشی ثبت نکرده‌اید.</p>}
      </div>
    </section>}
  </div>
}
