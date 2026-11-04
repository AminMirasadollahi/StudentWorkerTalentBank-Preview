import {useEffect,useMemo,useState} from 'react'
import JalaliDatePicker from './JalaliDatePicker'
import {getOperationsTermDashboard,saveOperationsTerm,saveOperationsAllocation} from '../lib/operationsV2'
import {faMinutes,fromHourMinuteInputs,toHourMinuteInputs,termTotals,allocationRatio,weekRows} from '../lib/termBudgetView.mjs'

const fa=new Intl.NumberFormat('fa-IR')
const dateFa=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium',timeZone:'UTC'})
const pretty=date=>date?dateFa.format(new Date(date+'T12:00:00Z')):'—'
const unitName={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const termStateName={draft:'پیش‌نویس',active:'فعال',closed:'بسته‌شده'}
const updateTitle='علت تنظیم یا تغییر (برای ثبت در تاریخچه)'

function TermEditor({term,onSave,onClose}){
 const editing=Boolean(term)
 const [label,setLabel]=useState(term?.label||'')
 const [start,setStart]=useState(term?.start_date||'')
 const [end,setEnd]=useState(term?.end_date||'')
 const [state,setState]=useState(term?.state||'draft')
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const locked=term?.state==='closed'
 const valid=label.trim().length>=4&&start&&end&&end>start&&reason.trim().length>=5
 const submit=async event=>{
  event.preventDefault()
  if(busy||locked||!valid)return
  setBusy(true);setError('')
  try{
   const response=await saveOperationsTerm({
    termId:term?.id||null,label:label.trim(),startDate:start,endDate:end,
    state:editing?state:'draft',reason:reason.trim(),
   })
   if(response?.ok!==true)throw Error('term_write_not_confirmed')
   await onSave(response.term_id||term?.id)
  }catch{setError('تأیید ذخیره نیمسال دریافت نشد. قبل از تلاش مجدد فهرست نیمسال‌ها را بازخوانی کنید.')}
  finally{setBusy(false)}
 }
 return <form className="ow-term-editor" onSubmit={submit} aria-label={editing?'ویرایش نیمسال':'تعریف نیمسال جدید'}>
  <div className="ow-term-editor__title">
   <strong>{editing?'ویرایش نیمسال':'تعریف نیمسال جدید'}</strong>
   <button type="button" className="report-btn report-btn--light" onClick={onClose} disabled={busy}>بستن</button>
  </div>
  {locked&&<p className="ow-muted">نیمسال بسته‌شده فقط قابل مشاهده است و تنظیمات آن تغییر نمی‌کنند.</p>}
  <div className="ow-term-fields">
   <label className="report-field"><span>عنوان نیمسال</span>
    <input required minLength={4} maxLength={100} disabled={locked||busy}
     value={label} onChange={e=>setLabel(e.target.value)} placeholder="مثلاً ۱۴۰۵–۱۴۰۶ / نیمسال اول"/>
   </label>
   <div className="report-field"><span>شروع نیمسال (شمسی)</span>
    <JalaliDatePicker value={start} onChange={setStart} ariaLabel="تاریخ شروع نیمسال" disabled={locked||busy||term?.state==='active'}/>
   </div>
   <div className="report-field"><span>پایان نیمسال (شمسی)</span>
    <JalaliDatePicker value={end} onChange={setEnd} ariaLabel="تاریخ پایان نیمسال" disabled={locked||busy||term?.state==='active'}/>
   </div>
   {editing&&<label className="report-field"><span>وضعیت نیمسال</span>
    <select value={state} disabled={locked||busy} onChange={e=>setState(e.target.value)}>
     <option value="draft">پیش‌نویس</option>
     {(term.state==='active'||term.state==='draft')&&<option value="active">فعال</option>}
     {term.state==='active'&&<option value="closed">بسته‌شده</option>}
    </select>
   </label>}
  </div>
  {term?.state==='active'&&<p className="ow-muted">تاریخ شروع و پایان نیمسال فعال قفل است؛ بستن نیمسال، تنظیمات سهمیه آن را فقط‌خواندنی می‌کند.</p>}
  <label className="report-field"><span>{updateTitle}</span>
   <input required minLength={5} maxLength={500} value={reason} disabled={locked||busy}
    onChange={e=>setReason(e.target.value)} placeholder="مبنای تصمیم یا اصلاح را بنویسید"/>
  </label>
  {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
  {!locked&&<button className="report-btn report-btn--primary" type="submit" disabled={busy||!valid}>
    {busy?'در حال ثبت…':'ذخیره نیمسال'}
   </button>}
 </form>
}

function AllocationEditor({term,unit,onSave,onClose}){
 const initial=toHourMinuteInputs(unit.allocated_minutes)
 const [hours,setHours]=useState(initial.hours)
 const [minutes,setMinutes]=useState(initial.minutes)
 const [reason,setReason]=useState('')
 const [removeConfirm,setRemoveConfirm]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const computed=fromHourMinuteInputs(hours,minutes)
 const send=async remove=>{
  if(busy||reason.trim().length<5||(!remove&&computed===null))return
  setBusy(true);setError('')
  try{
   const r=await saveOperationsAllocation({
    termId:term.id,unit:unit.unit,minutes:remove?null:computed,reason:reason.trim(),
   })
   if(r?.ok!==true)throw Error('allocation_write_not_confirmed')
   await onSave()
  }catch{setError('نتیجه تغییر سهمیه روشن نیست. ابتدا داده‌ها را بازخوانی کنید و سپس دوباره اقدام کنید.')}
  finally{setBusy(false)}
 }
 return <div className="ow-term-editor ow-term-allocation-editor" aria-label={'تنظیم سهمیه '+unit.name}>
  <div className="ow-term-editor__title"><strong>سهمیه {unit.name||unitName[unit.unit]}</strong>
   <button className="report-btn report-btn--light" type="button" onClick={onClose} disabled={busy}>بستن</button>
  </div>
  <p className="ow-muted">سهمیه به دقیقه در دیتابیس ذخیره می‌شود. خالی‌بودن سهمیه با مقدار صفر متفاوت است.</p>
  <div className="ow-term-fields ow-term-budget-hours">
   <label className="report-field"><span>ساعت</span>
    <input type="number" aria-label="ساعت سهمیه" min={0} max={33333} step={1}
     value={hours} disabled={busy} onChange={e=>setHours(e.target.value)}/>
   </label>
   <label className="report-field"><span>دقیقه (۰ تا ۵۹)</span>
    <input type="number" aria-label="دقیقه سهمیه" min={0} max={59} step={1}
     value={minutes} disabled={busy} onChange={e=>setMinutes(e.target.value)}/>
   </label>
   <div className="ow-term-allocation-result">
    <small>سهمیه پیشنهادی</small>
    <strong>{computed===null?'—':faMinutes(computed)}</strong>
   </div>
  </div>
  <label className="report-field"><span>{updateTitle}</span>
   <input minLength={5} maxLength={500} value={reason} disabled={busy}
    onChange={e=>setReason(e.target.value)} placeholder="مثلاً بر اساس ابلاغ سهمیه این نیمسال"/>
  </label>
  {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
  <div className="ow-term-actions">
   <button type="button" className="report-btn report-btn--primary"
    disabled={busy||computed===null||reason.trim().length<5} onClick={()=>{void send(false)}}>
    {busy?'در حال ثبت…':'ثبت سهمیه'}
   </button>
   {unit.allocated_minutes!==null&&unit.allocated_minutes!==undefined&&
    <button type="button" className="report-btn report-btn--light"
      disabled={busy} onClick={()=>setRemoveConfirm(v=>!v)}>
      حذف سهمیه تعریف‌شده
    </button>}
  </div>
  {removeConfirm&&<div className="ow-term-remove-confirm">
   <p>با حذف سهمیه، مقدار آن «تعریف‌نشده» می‌شود؛ ساعات تأییدشده دانشجوکارها حذف نمی‌شوند.</p>
   <button type="button" className="report-btn report-btn--light"
    disabled={busy||reason.trim().length<5} onClick={()=>{void send(true)}}>تأیید حذف سهمیه</button>
  </div>}
 </div>
}

export default function TermBudgetPanel({workers=[],refreshRevision=0}){
 const [termId,setTermId]=useState('')
 const [unitFilter,setUnitFilter]=useState('')
 const [workerId,setWorkerId]=useState('')
 const [revision,setRevision]=useState(0)
 const [load,setLoad]=useState({state:'loading',data:null})
 const [termEditor,setTermEditor]=useState(undefined)
 const [editAllocation,setEditAllocation]=useState(null)
 const [notice,setNotice]=useState('')
 useEffect(()=>{
  let alive=true
  setLoad({state:'loading',data:null})
  getOperationsTermDashboard({termId:termId||null,unit:unitFilter||null,workerId:workerId||null})
   .then(r=>{
    if(!alive)return
    if(r?.ok!==true||!Array.isArray(r.terms)||!Array.isArray(r.units)||
       !Array.isArray(r.weeks)||!Array.isArray(r.workers))throw Error('invalid_term_summary')
    setLoad({state:'ready',data:r})
   }).catch(()=>{if(alive)setLoad({state:'error',data:null})})
  return()=>{alive=false}
 },[termId,unitFilter,workerId,revision,refreshRevision])
 const data=load.data
 const term=data?.term||null
 const unitRows=data?.units||[]
 const total=termTotals(unitRows,Boolean(workerId))
 const weeks=useMemo(()=>weekRows(data?.weeks||[]),[data])
 const maxWeek=Math.max(1,...weeks.map(w=>w.minutes))
 const userNames=new Map(workers.map(w=>[w.id,w.name]))
 const canChange=term&&term.state!=='closed'&&!workerId
 const finish=async nextId=>{
   setTermEditor(undefined);setEditAllocation(null)
   if(nextId){setTermId(nextId)}
   setRevision(v=>v+1)
   setNotice('تغییر ثبت شد؛ آمار از سرور بازخوانی می‌شود.')
 }
 return <section className="report-panel ow-terms" aria-label="نیمسال‌ها و سهمیه‌های ساعات">
  <div className="ow-term-heading">
   <div><h2>نیمسال‌ها و سهمیه ساعات</h2>
    <p className="ow-muted">مصرف قطعی فقط از گزارش‌های تأییدشده محاسبه می‌شود؛ برنامه حضور و واگذاری هنوز مصرف قطعی نیستند.</p>
   </div>
   <div className="ow-term-heading-actions">
    <button type="button" className="report-btn report-btn--light" onClick={()=>setRevision(v=>v+1)}>بازخوانی</button>
    <button type="button" className="report-btn report-btn--primary"
     onClick={()=>{setEditAllocation(null);setTermEditor(null)}}>+ تعریف نیمسال</button>
   </div>
  </div>
  <div className="ow-term-filters">
   <label className="report-field"><span>نیمسال</span>
    <select aria-label="فیلتر نیمسال" value={termId} onChange={e=>{setTermId(e.target.value);setTermEditor(undefined);setEditAllocation(null)}}>
     <option value="">نیمسال فعال (در صورت تعریف)</option>
     {(data?.terms||[]).map(t=><option key={t.id} value={t.id}>{t.label} · {termStateName[t.state]||t.state}</option>)}
    </select>
   </label>
   <label className="report-field"><span>واحد فعالیت</span>
    <select aria-label="فیلتر واحد بودجه" value={unitFilter} onChange={e=>setUnitFilter(e.target.value)}>
     <option value="">تمام واحدها</option>
     {Object.entries(unitName).map(([id,name])=><option key={id} value={id}>{name}</option>)}
    </select>
   </label>
   <label className="report-field"><span>دانشجوکار</span>
    <select aria-label="فیلتر دانشجوکار بودجه" value={workerId} onChange={e=>setWorkerId(e.target.value)}>
     <option value="">تمام دانشجوکارها</option>
     {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
   </label>
  </div>
  {notice&&<p role="status" className="ops-alert-success">{notice}</p>}
  {load.state==='loading'&&<p role="status" className="ow-muted">در حال دریافت آمار نیمسال از سرور…</p>}
  {load.state==='error'&&<div role="alert" className="report-alert report-alert--error">
    آمار نیمسال در دسترس نیست. برای جلوگیری از نمایش اعداد اشتباه، هیچ مقدار قدیمی یا صفر جایگزین نشده است.
    <button type="button" className="report-btn report-btn--light" onClick={()=>setRevision(v=>v+1)}>تلاش مجدد</button>
  </div>}
  {termEditor!==undefined&&<TermEditor key={termEditor?.id||'new'} term={termEditor}
    onClose={()=>setTermEditor(undefined)} onSave={finish}/>}
  {load.state==='ready'&&!term&&<div className="ow-term-empty">
   <strong>هنوز نیمسال فعال برای گزارش‌گیری تعیین نشده است.</strong>
   <p className="ow-muted">یک نیمسال با تاریخ‌های رسمی تعریف کنید؛ پس از آن می‌توانید سهمیه واحدها را ثبت و آمار واقعی دوره را ببینید. ارقام نمونه به‌طور خودکار ثبت نمی‌شوند.</p>
  </div>}
  {term&&load.state==='ready'&&<>
   <div className="ow-term-context">
    <div><strong>{term.label}</strong>
      <small>{pretty(term.start_date)} تا {pretty(term.end_date)} · {termStateName[term.state]||term.state}</small></div>
    <button type="button" className="report-btn report-btn--light"
      onClick={()=>{setEditAllocation(null);setTermEditor(term)}}>تنظیمات نیمسال</button>
   </div>
   {workerId&&<p role="status" className="ow-term-warning">نمای فردی فعال است؛ سهمیه واحد به کل دانشجوکارها تعلق دارد، بنابراین «مانده سهمیه واحد» برای یک نفر محاسبه نمی‌شود.</p>}
   <div className="ow-term-kpis" aria-label="شاخص‌های نیمسال">
    <article><small>ساعات تأییدشده</small><strong>{faMinutes(total.approved)}</strong></article>
    <article><small>در انتظار بررسی (درخواستی)</small><strong>{faMinutes(total.pending)}</strong></article>
    <article><small>کارِ بدون گزارش (برآورد)</small><strong>{faMinutes(total.planned)}</strong></article>
    <article><small>مانده نسبت به سهمیه</small>
     <strong>{total.remaining===null?'—':faMinutes(total.remaining)}</strong>
     {total.remaining===null&&<small>{workerId?'فقط در نمای همه دانشجوکارها':'حداقل یک واحد بدون سهمیه'}</small>}
    </article>
   </div>
   <div className="ow-term-section-title"><h3>سهمیه و مصرف به تفکیک واحد</h3>
    <small>دقیقه‌های تأییدشده منبع رسمی مصرف هستند</small>
   </div>
   <div className="ow-term-units">
    {unitRows.map(u=><article key={u.unit}>
      <div className="ow-term-unit-head"><strong>{u.name||unitName[u.unit]||u.unit}</strong>
       {canChange&&<button type="button" className="ow-mini-btn"
         onClick={()=>{setTermEditor(undefined);setEditAllocation(u.unit)}}>تنظیم سهمیه</button>}
      </div>
      <div className="ow-term-unit-figures">
       <div><small>سهمیه</small><strong>{u.allocated_minutes===null?'تعریف نشده':faMinutes(u.allocated_minutes)}</strong></div>
       <div><small>تأییدشده</small><strong>{faMinutes(u.approved_minutes)}</strong></div>
       <div><small>مانده</small><strong>{u.remaining_minutes===null?'—':faMinutes(u.remaining_minutes)}</strong></div>
      </div>
      {allocationRatio(u.approved_minutes,u.allocated_minutes)!==null&&!workerId&&
       <div className="ow-term-progress" aria-label={'درصد مصرف سهمیه '+u.name}>
        <span style={{width:allocationRatio(u.approved_minutes,u.allocated_minutes)+'%'}}/>
       </div>}
      <small>{fa.format(u.pending_reports)} گزارش منتظر بررسی · {faMinutes(u.pending_minutes)} درخواستی</small>
      <small>{fa.format(u.unreported_tasks)} کار بدون گزارش · برآورد {faMinutes(u.unreported_estimate_minutes)}</small>
    </article>)}
   </div>
   {canChange&&editAllocation&&unitRows.some(u=>u.unit===editAllocation)&&<AllocationEditor
    key={term.id+'-'+editAllocation}
    term={term} unit={unitRows.find(u=>u.unit===editAllocation)}
    onClose={()=>setEditAllocation(null)} onSave={()=>finish(null)}/>}
   <details className="ow-term-context-help"><summary>مبنای محاسبات و تفاوت وضعیت‌ها</summary>
    <p>«تأییدشده» مجموع دقایق مصوب مدیر بر اساس تاریخ واقعی انجام و واحد همان وظیفه است؛ «در انتظار» فقط زمان درخواست‌شده برای گزارش‌های ثبت‌شده و هنوز تأییدنشده است. «بدون گزارش» برآورد وظایفی است که هنوز گزارشی برای آن‌ها ثبت نشده. وضعیت‌های ردشده و نیازمند اصلاح، مصرف قطعی نیستند.</p>
    <p>مقدار صفر سهمیه، تصمیم صریح مدیریتی است؛ سهمیه تعریف‌نشده اطلاعات ناموجود محسوب می‌شود. این نسخه سقف سهمیه را خودکار روی واگذاری یا تأیید ساعت اعمال نمی‌کند.</p>
   </details>
   <div className="ow-term-section-title"><h3>روند ساعات تأییدشده</h3><small>تجمیع هفتگی از روز شنبه</small></div>
   {weeks.length===0?<p className="ow-muted">هنوز ساعتی در این محدوده تأیید نشده است.</p>:
    <div className="ow-term-week-chart" aria-label="نمودار میله‌ای ساعات تأییدشده هفتگی">
     {weeks.map(w=><div key={w.date} className="ow-term-week">
      <span className="ow-term-week-bar" style={{height:(Math.max(5,Math.round(100*w.minutes/maxWeek)))+'%'}}
       title={pretty(w.date)+' · '+faMinutes(w.minutes)} aria-hidden="true"/>
      <small>{pretty(w.date)}</small>
      <b>{faMinutes(w.minutes)}</b>
     </div>)}
    </div>}
   <details className="ow-term-worker-details"><summary>ریز جمع ساعات به تفکیک دانشجوکار و واحد · {fa.format(data.workers.length)} ردیف</summary>
    {data.workers.length>0?<div className="ow-term-worker-table-wrap"><table className="ow-term-worker-table">
     <thead><tr><th>دانشجوکار</th><th>واحد کار</th><th>تأییدشده</th><th>درخواست منتظر</th></tr></thead>
     <tbody>{data.workers.map((w,i)=><tr key={w.worker_id+'-'+w.unit+'-'+i}>
      <td>{userNames.get(w.worker_id)||'شناسه نامشخص'}</td><td>{unitName[w.unit]||w.unit}</td>
      <td>{faMinutes(w.approved_minutes)}</td><td>{faMinutes(w.pending_minutes)}</td>
     </tr>)}</tbody>
    </table></div>:<p className="ow-muted">در این نیمسال گزارشی مطابق فیلترها ثبت نشده است.</p>}
   </details>
  </>}
 </section>
}
