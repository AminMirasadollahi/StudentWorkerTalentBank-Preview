import {useEffect,useMemo,useState} from 'react'
import JalaliDatePicker from './JalaliDatePicker'
import {getOperationsTermDashboard,saveOperationsTerm} from '../lib/operationsV2'
import BudgetPoolEditor from './BudgetPoolEditor'
import TermStatusDialog from './TermStatusDialog'
import ManagerSettingsDialog from './ManagerSettingsDialog'
import {AUTO_TERM_REASON,termChanged} from '../lib/termSettingsInput.mjs'
import {faMinutes,poolTermTotals,allocationRatio,weekRows} from '../lib/termBudgetView.mjs'
import {findTermBudgetIssues,termBudgetScopeText} from '../lib/termBudgetIntegrity.mjs'

const fa=new Intl.NumberFormat('fa-IR')
const dateFa=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium',timeZone:'UTC'})
const pretty=date=>date?dateFa.format(new Date(date+'T12:00:00Z')):'—'
const unitName={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const termStateName={draft:'پیش‌نویس',active:'فعال',closed:'بسته‌شده'}

function TermEditor({term,onSave,onClose}){
 const editing=Boolean(term)
 const [label,setLabel]=useState(term?.label||'')
 const [start,setStart]=useState(term?.start_date||'')
 const [end,setEnd]=useState(term?.end_date||'')
 const [reason,setReason]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const locked=term?.state==='closed'
 const modified=termChanged(term,{label,start,end})
 const valid=label.trim().length>=4&&label.trim().length<=100&&start&&end&&
  end>start&&(!editing||(modified&&reason.trim().length>=5))
 const submit=async event=>{
  event.preventDefault()
  if(busy||locked||!valid)return
  setBusy(true);setError('')
  try{
   const r=await saveOperationsTerm({
    termId:term?.id||null,label:label.trim(),startDate:start,endDate:end,
    state:term?.state||'draft',reason:editing?reason.trim():AUTO_TERM_REASON,
   })
   if(r?.ok!==true)throw Error('term_write_unconfirmed')
   await onSave(r.term_id||term?.id)
  }catch{
   setError('ذخیره نیمسال تأیید نشد. ابتدا فهرست را بازخوانی کنید و سپس دوباره اقدام کنید.')
  }finally{setBusy(false)}
 }
 return <ManagerSettingsDialog title={editing?'ویرایش مشخصات نیمسال':'تعریف نیمسال جدید'}
    busy={busy} onClose={onClose}>
  <form className="ow-compact-form" onSubmit={submit}>
   {locked&&<p className="ow-muted">نیمسال بسته‌شده فقط قابل مشاهده است.</p>}
   {!editing&&<p className="ow-muted">نیمسال ابتدا به‌صورت پیش‌نویس ثبت می‌شود تا پیش از فعال‌سازی بتوانید تاریخ‌ها و سهمیه‌ها را تعیین کنید.</p>}
   <label className="report-field"><span>عنوان نیمسال</span>
    <input required minLength={4} maxLength={100} disabled={locked||busy}
     value={label} onChange={e=>setLabel(e.target.value)} placeholder="مثلاً ۱۴۰۵–۱۴۰۶ / نیمسال اول"/>
   </label>
   <div className="ow-term-fields ow-term-dates">
    <div className="report-field"><span>شروع نیمسال (شمسی)</span>
     <JalaliDatePicker value={start} onChange={setStart}
       ariaLabel="تاریخ شروع نیمسال" disabled={locked||busy||term?.state==='active'}/>
    </div>
    <div className="report-field"><span>پایان نیمسال (شمسی)</span>
     <JalaliDatePicker value={end} onChange={setEnd}
       ariaLabel="تاریخ پایان نیمسال" disabled={locked||busy||term?.state==='active'}/>
    </div>
   </div>
   {term?.state==='active'&&<p className="ow-muted">تاریخ‌های نیمسال فعال برای حفظ انتساب سوابق قفل شده‌اند.</p>}
   {editing&&modified&&<label className="report-field"><span>علت اصلاح مشخصات</span>
    <input required minLength={5} maxLength={500} value={reason} disabled={locked||busy}
     onChange={e=>setReason(e.target.value)} placeholder="مثلاً اصلاح تاریخ پایان طبق ابلاغ"/>
   </label>}
   {!editing&&<p className="ow-compact-hint">ایجاد اولیه همراه با نام مدیر و زمان ثبت، خودکار در سوابق ذخیره می‌شود.</p>}
   {editing&&!modified&&<p className="ow-compact-hint">هنوز تغییری برای ذخیره انجام نشده است.</p>}
   {error&&<p role="alert" className="report-alert report-alert--error">{error}</p>}
   <div className="ow-compact-form-actions">
    <button type="button" className="report-btn report-btn--light" onClick={onClose} disabled={busy}>انصراف</button>
    {!locked&&<button type="submit" className="report-btn report-btn--primary" disabled={busy||!valid}>
      {busy?'در حال ثبت…':editing?'ذخیره تغییرات':'ثبت پیش‌نویس'}
    </button>}
   </div>
  </form>
 </ManagerSettingsDialog>
}

export default function TermBudgetPanel({workers=[],refreshRevision=0,focusedUI=false}){
 const [termId,setTermId]=useState('')
 const [unitFilter,setUnitFilter]=useState('')
 const [workerId,setWorkerId]=useState('')
 const [advancedOpen,setAdvancedOpen]=useState(false)
 const [unitsOpen,setUnitsOpen]=useState(false)
 const [weeksOpen,setWeeksOpen]=useState(false)
 const [revision,setRevision]=useState(0)
 const [load,setLoad]=useState({state:'loading',data:null})
 const [termEditor,setTermEditor]=useState(undefined)
 const [editPool,setEditPool]=useState(undefined)
 const [termStatus,setTermStatus]=useState(null)
 const [notice,setNotice]=useState('')
 useEffect(()=>{
  let alive=true
  setLoad({state:'loading',data:null})
  getOperationsTermDashboard({termId:termId||null,unit:unitFilter||null,workerId:workerId||null})
   .then(r=>{
    if(!alive)return
    if(r?.ok!==true||!Array.isArray(r.terms)||!Array.isArray(r.units)||
       !Array.isArray(r.weeks)||!Array.isArray(r.workers)||
       !Array.isArray(r.pools))throw Error('invalid_term_summary')
    setLoad({state:'ready',data:r})
   }).catch(()=>{if(alive){
    setLoad({state:'error',data:null})
    // Never leave an old permission-sensitive editor usable if the fresh
    // authorized read fails. No stale quota should be committed.
    setTermEditor(undefined);setEditPool(undefined);setTermStatus(null)
   }})
  return()=>{alive=false}
 },[termId,unitFilter,workerId,revision,refreshRevision])
 const data=load.data
 const term=data?.term||null
 const unitRows=data?.units||[]
 const pools=data?.pools||[]
 const pooledUnits=new Map(pools.flatMap(p=>(p.units||[]).map(unit=>[unit,p])))
 const issues=focusedUI&&load.state==='ready'&&term
   ?findTermBudgetIssues(data,{unitFilter,workerId}):[]
 const dataReliable=issues.length===0
 const filteredScope=Boolean(unitFilter||workerId)
 const total=poolTermTotals(unitRows,pools,{workerSlice:Boolean(workerId),unitFilter:Boolean(unitFilter)})
 const weeks=useMemo(()=>weekRows(data?.weeks||[]),[data])
 const maxWeek=Math.max(1,...weeks.map(w=>w.minutes))
 const unitCards=(   <div className="ow-term-units">
    {unitRows.map(u=>{
      const pool=pooledUnits.get(u.unit)
      return <article key={u.unit}>
       <div className="ow-term-unit-head"><strong>{u.name||unitName[u.unit]||u.unit}</strong></div>
       <small>{pool?'عضو سهمیه مشترک «'+pool.label+'»':
         u.allocated_minutes===null?'بدون سهمیه تعریف‌شده':'سهمیه مستقل: '+faMinutes(u.allocated_minutes)}</small>
       <div className="ow-term-unit-figures">
        <div><small>تأییدشده این واحد</small><strong>{faMinutes(u.approved_minutes)}</strong></div>
        <div><small>در انتظار بررسی</small><strong>{faMinutes(u.pending_minutes)}</strong></div>
        <div><small>کار بدون گزارش</small><strong>{faMinutes(u.unreported_estimate_minutes)}</strong></div>
       </div>
       {!pool&&u.allocated_minutes!==null&&u.allocated_minutes!==undefined&&
         <small>مانده سهمیه مستقل: {u.remaining_minutes===null?'—':faMinutes(u.remaining_minutes)}</small>}
      </article>
    })}
   </div>);

 const userNames=new Map(workers.map(w=>[w.id,w.name]))
 // CRITICAL: backend returns a subset of pools when unitFilter is set.
 // Editing against that partial set can omit other units' assignments.
 // Hence ALL quota/term mutation entry points require the unfiltered
 // authorized whole-term view (and a reconciled budget snapshot).
 const canChange=Boolean(term&&load.state==='ready'&&term.state!=='closed'
   &&!filteredScope&&dataReliable)
 const canUpdateTerm=Boolean(load.state==='ready'&&!filteredScope&&dataReliable)
 const resetEditors=()=>{
  setTermEditor(undefined);setEditPool(undefined);setTermStatus(null)
 }
 const changeUnit=value=>{
  resetEditors();setUnitFilter(value)
  if(value)setAdvancedOpen(true)
 }
 const changeWorker=value=>{
  resetEditors();setWorkerId(value)
  if(value)setAdvancedOpen(true)
 }
 const finish=async nextId=>{
   setTermEditor(undefined);setEditPool(undefined);setTermStatus(null)
   if(nextId){setTermId(nextId)}
   setRevision(v=>v+1)
   setNotice('تغییر ثبت شد؛ آمار از سرور بازخوانی می‌شود.')
 }
 return <section className={'report-panel ow-terms'+(focusedUI?' swtb22-term-focused':'')}
   aria-label="نیمسال‌ها و سهمیه‌های ساعات">
  <div className="ow-term-heading">
   <div><h2>{focusedUI?'سهمیه و مصرف نیمسال':'نیمسال‌ها و سهمیه ساعات'}</h2>
    <p className="ow-muted">مصرف قطعی فقط از گزارش‌های تأییدشده محاسبه می‌شود؛ برنامه حضور و واگذاری هنوز مصرف قطعی نیستند.</p>
   </div>
   <div className="ow-term-heading-actions">
    <button type="button" className="report-btn report-btn--light" onClick={()=>setRevision(v=>v+1)}>بازخوانی</button>
    <button type="button" className="report-btn report-btn--primary"
     disabled={load.state!=='ready'||filteredScope}
     onClick={()=>{setEditPool(undefined);setTermEditor(null)}}>+ تعریف نیمسال</button>
   </div>
  </div>
  <div className={'ow-term-filters'+(focusedUI?' swtb22-term-filter-toolbar':'')}>
   <label className="report-field"><span>نیمسال</span>
    <select aria-label="فیلتر نیمسال" value={termId} onChange={e=>{
      setTermId(e.target.value);resetEditors()
    }}>
     <option value="">نیمسال فعال (در صورت تعریف)</option>
     {(data?.terms||[]).map(t=><option key={t.id} value={t.id}>{t.label} · {termStateName[t.state]||t.state}</option>)}
    </select>
   </label>
   {focusedUI?<details className="swtb22-term-advanced-filter"
    open={advancedOpen} onToggle={event=>setAdvancedOpen(event.currentTarget.open)}>
    <summary>فیلترهای تکمیلی: واحد و دانشجوکار {filteredScope?'· فعال':''}</summary>
    <div className="swtb22-term-advanced-controls">
     <label className="report-field"><span>واحد فعالیت</span>
      <select aria-label="فیلتر واحد بودجه" value={unitFilter}
       onChange={e=>changeUnit(e.target.value)}>
       <option value="">تمام واحدها</option>
       {Object.entries(unitName).map(([id,name])=><option key={id} value={id}>{name}</option>)}
      </select>
     </label>
     <label className="report-field"><span>دانشجوکار</span>
      <select aria-label="فیلتر دانشجوکار بودجه" value={workerId}
       onChange={e=>changeWorker(e.target.value)}>
       <option value="">تمام دانشجوکارها</option>
       {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
     </label>
     {filteredScope&&<button type="button" className="report-btn report-btn--light"
       onClick={()=>{changeUnit('');changeWorker('')}}>بازگشت به نمای کل نیمسال</button>}
    </div>
   </details>:<>
    <label className="report-field"><span>واحد فعالیت</span>
     <select aria-label="فیلتر واحد بودجه" value={unitFilter} onChange={e=>changeUnit(e.target.value)}>
      <option value="">تمام واحدها</option>
      {Object.entries(unitName).map(([id,name])=><option key={id} value={id}>{name}</option>)}
     </select>
    </label>
    <label className="report-field"><span>دانشجوکار</span>
     <select aria-label="فیلتر دانشجوکار بودجه" value={workerId} onChange={e=>changeWorker(e.target.value)}>
      <option value="">تمام دانشجوکارها</option>
      {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
     </select>
    </label>
   </>}
  </div>
  {focusedUI&&load.state==='ready'&&term&&<p className="swtb22-term-scope" role="status">
    {termBudgetScopeText({unitFilter,workerId})}
    {filteredScope&&<span> برای تغییر سهمیه یا وضعیت نیمسال، ابتدا به نمای کل نیمسال برگردید.</span>}
  </p>}
  {notice&&<p role="status" className="ops-alert-success">{notice}</p>}
  {load.state==='loading'&&<p role="status" className="ow-muted">در حال دریافت آمار نیمسال از سرور…</p>}
  {load.state==='error'&&<div role="alert" className="report-alert report-alert--error">
    آمار نیمسال در دسترس نیست. برای جلوگیری از نمایش اعداد اشتباه، هیچ مقدار قدیمی یا صفر جایگزین نشده است.
    <button type="button" className="report-btn report-btn--light" onClick={()=>setRevision(v=>v+1)}>تلاش مجدد</button>
  </div>}
  {load.state==='ready'&&!filteredScope&&termEditor!==undefined&&<TermEditor key={termEditor?.id||'new'} term={termEditor}
    onClose={()=>setTermEditor(undefined)} onSave={finish}/>}
  {canUpdateTerm&&termStatus&&term&&<TermStatusDialog key={term.id+'-'+termStatus}
    term={term} pools={pools} onSaved={finish} onClose={()=>setTermStatus(null)}/>}
  {load.state==='ready'&&!term&&<div className="ow-term-empty">
   <strong>هنوز نیمسال فعال برای گزارش‌گیری تعیین نشده است.</strong>
   <p className="ow-muted">یک نیمسال با تاریخ‌های رسمی تعریف کنید؛ پس از آن می‌توانید سهمیه واحدها را ثبت و آمار واقعی دوره را ببینید. ارقام نمونه به‌طور خودکار ثبت نمی‌شوند.</p>
  </div>}
  {term&&load.state==='ready'&&<>
   {focusedUI&&!dataReliable&&<div className="report-alert report-alert--error swtb22-term-audit"
     role="alert">
    <strong>گزارش سهمیه با داده‌های منبع سازگار نیست.</strong>
    <p>برای جلوگیری از محاسبه و تصمیم بر اساس اعداد ناسازگار، خلاصه مصرف و کنترل‌های تغییر مصوبه فعلاً نمایش داده نمی‌شوند.
      داده‌های مبنای سرور یا بازه انتخابی باید بررسی شوند.</p>
    <ul>{issues.map((issue,i)=><li key={issue.code+':'+i}>{issue.message}</li>)}</ul>
    <button type="button" className="report-btn report-btn--light"
      onClick={()=>setRevision(v=>v+1)}>بازخوانی آمار</button>
   </div>}
   {(!focusedUI||dataReliable)&&<>
   <div className="ow-term-context">
    <div><strong>{term.label}</strong>
      <small>{pretty(term.start_date)} تا {pretty(term.end_date)}</small>
      <small className="ow-term-status-explainer">
       {term.state==='draft'?'پیش‌نویس · هنوز فعال نیست؛ تاریخ‌ها و سهمیه‌ها قابل تنظیم‌اند.':
        term.state==='active'?'فعال · تاریخ‌ها و عضویت واحدها قفل شده‌اند.':
        'بسته‌شده · اطلاعات فقط قابل مشاهده‌اند.'}
      </small>
    </div>
    <div className="ow-term-context-actions">
     <span className={'ow-term-status-pill ow-term-status-pill--'+term.state}>
      {termStateName[term.state]||term.state}</span>
     {canUpdateTerm&&<button type="button" className="report-btn report-btn--light"
       onClick={()=>{setEditPool(undefined);setTermStatus(null);setTermEditor(term)}}>ویرایش نیمسال</button>}
     {term.state==='draft'&&canUpdateTerm&&<button type="button" className="report-btn report-btn--primary"
       disabled={pools.length===0} title={pools.length===0?'ابتدا سهمیه را تعریف کنید':''}
       onClick={()=>{setTermEditor(undefined);setEditPool(undefined);setTermStatus('active')}}>فعال‌سازی نیمسال</button>}
     {term.state==='active'&&canUpdateTerm&&<button type="button" className="report-btn report-btn--light"
       onClick={()=>{setTermEditor(undefined);setEditPool(undefined);setTermStatus('closed')}}>بستن نیمسال</button>}
    </div>
   </div>
   {term.state==='draft'&&pools.length===0&&<p className="ow-compact-hint">
      پس از ثبت سهمیه‌ها و تأیید تاریخ پایان، می‌توانید نیمسال را فعال کنید.
   </p>}
   {workerId&&<p role="status" className="ow-term-warning">نمای فردی فعال است؛ سهمیه واحد به کل دانشجوکارها تعلق دارد، بنابراین «مانده سهمیه واحد» برای یک نفر محاسبه نمی‌شود.</p>}
   {focusedUI&&<p className="swtb22-term-metric-note">
     سهمیه مشترک هر گروه فقط یک‌بار در سقف کل محاسبه می‌شود؛ «در انتظار بررسی» و «کار بدون گزارش» مصرف قطعی نیستند.
     این گزارش سقف را خودکار روی واگذاری یا تأیید ساعت اعمال نمی‌کند.
   </p>}
   <div className="ow-term-kpis" aria-label="شاخص‌های نیمسال">
    <article><small>ساعات تأییدشده</small><strong>{faMinutes(total.approved)}</strong></article>
    <article><small>در انتظار بررسی (درخواستی)</small><strong>{faMinutes(total.pending)}</strong></article>
    <article><small>کارِ بدون گزارش (برآورد)</small><strong>{faMinutes(total.planned)}</strong></article>
    <article><small>مانده نسبت به سهمیه</small>
     <strong>{total.remaining===null?'—':faMinutes(total.remaining)}</strong>
     {total.remaining===null&&<small>{workerId?'مانده جمعی برای یک نفر تعریف نمی‌شود':unitFilter?'جمع کل در فیلتر یک واحد قابل محاسبه نیست':'حداقل یک واحد بدون سهمیه'}</small>}
    </article>
   </div>
   <div className="ow-term-section-title">
    <h3>سهمیه‌های مصوب</h3>
    <small>هر گروه یک سقف دارد؛ مصرف تمام واحدهای عضو از همان سقف کسر می‌شود</small>
    {canChange&&<button type="button" className="report-btn report-btn--light"
      onClick={()=>{setTermEditor(undefined);setEditPool(null)}}>+ تعریف سهمیه</button>}
   </div>
   {pools.length===0&&<p className="ow-muted">برای این نیمسال هنوز سهمیه‌ای ثبت نشده است. هنگام افزودن سهمیه، یک یا چند واحد را انتخاب کنید؛ نام سهمیه خودکار ساخته می‌شود.</p>}
   <div className="ow-term-pools">
    {pools.map(p=><article key={p.id} className="ow-term-pool">
     <div className="ow-term-unit-head">
      <div><strong>{p.label}</strong>
       <small>واحدهای عضو: {(p.units||[]).map(u=>unitName[u]||u).join(' + ')}</small>
      </div>
      {canChange&&<button type="button" className="ow-mini-btn"
        onClick={()=>{setTermEditor(undefined);setEditPool(p)}}>ویرایش سهمیه</button>}
     </div>
     <div className="ow-term-unit-figures">
      <div><small>سهمیه کل گروه</small><strong>{faMinutes(p.allocated_minutes)}</strong></div>
      <div><small>زمان تأییدشده گروه</small><strong>{faMinutes(p.approved_minutes)}</strong></div>
      <div><small>مانده گروه</small><strong>{workerId||p.remaining_minutes===null?'—':faMinutes(p.remaining_minutes)}</strong></div>
     </div>
     {allocationRatio(p.approved_minutes,p.allocated_minutes)!==null&&!workerId&&
       <div className="ow-term-progress" aria-label={'درصد مصرف سهمیه مشترک '+p.label}>
        <span style={{width:allocationRatio(p.approved_minutes,p.allocated_minutes)+'%'}}/>
       </div>}
     <small>{fa.format(p.pending_reports)} گزارش منتظر بررسی · {faMinutes(p.pending_minutes)} درخواستی</small>
     <small>{fa.format(p.unreported_tasks)} کار بدون گزارش · {faMinutes(p.unreported_estimate_minutes)} برآورد</small>
     {Boolean(unitFilter)&&!workerId&&<small className="ow-pool-shared-notice">اعداد مصرف و مانده این گروه، مجموع تمام واحدهای عضو هستند؛ فقط به واحد فیلترشده محدود نشده‌اند.</small>}
     {Boolean(workerId)&&<small className="ow-pool-shared-notice">زمان مصرف‌شده مربوط به دانشجوکار انتخابی است؛ مانده سهمیه جمعی نمایش داده نمی‌شود.</small>}
    </article>)}
   </div>
   {canChange&&editPool!==undefined&&<BudgetPoolEditor
     key={term.id+'-'+(editPool?.id||'new')} term={term} pool={editPool}
     allPools={pools} onSaved={()=>finish(null)} onClose={()=>setEditPool(undefined)}/>}
   {focusedUI?<details className="swtb22-term-unit-disclosure"
     open={unitsOpen} onToggle={event=>setUnitsOpen(event.currentTarget.open)}>
      <summary>ریز مصرف تفکیکی واحدها · {fa.format(unitRows.length)} واحد</summary>
      <p className="ow-muted">
       سهمیه گروه‌های مشترک در کارت‌های بالا فقط یک‌بار منظور شده است؛ این بخش صرفاً تفکیک مصرف واحدهاست.
      </p>
      {unitCards}
    </details>:<>
     <div className="ow-term-section-title">
      <h3>سهم هر واحد در مصرف ساعات</h3>
      <small>تفکیک فعالیت واحدها؛ بدون تکرار سهمیه مشترک</small>
     </div>
     {unitCards}
    </>}
   <details className="ow-term-context-help"><summary>مبنای محاسبات و تفاوت وضعیت‌ها</summary>
    <p>«تأییدشده» مجموع دقایق مصوب مدیر بر اساس تاریخ واقعی انجام و واحد همان وظیفه است؛ «در انتظار» فقط زمان درخواست‌شده برای گزارش‌های ثبت‌شده و هنوز تأییدنشده است. «بدون گزارش» برآورد وظایفی است که هنوز گزارشی برای آن‌ها ثبت نشده. وضعیت‌های ردشده و نیازمند اصلاح، مصرف قطعی نیستند.</p>
    <p>مقدار صفر سهمیه تصمیم صریح است؛ نبود سهمیه یعنی اطلاعات ناموجود. سهمیه گروه مشترک برای هر واحد تکرار نمی‌شود. در فیلتر یک واحد، مانده گروه مشترک همچنان با احتساب مصرف تمام اعضای گروه محاسبه می‌شود. این نسخه سقف را خودکار روی واگذاری یا تأیید ساعت اعمال نمی‌کند.</p>
   </details>
   {focusedUI?<details className="swtb22-term-week-disclosure"
      open={weeksOpen} onToggle={event=>setWeeksOpen(event.currentTarget.open)}>
      <summary>روند هفتگی ساعت‌های تأییدشده · {fa.format(weeks.length)} هفته</summary>
      <p className="ow-muted">بازه هفتگی از شنبه آغاز می‌شود؛ فقط دقایق تأییدشده براساس تاریخ واقعی فعالیت نمایش داده شده‌اند.</p>
      {weeks.length===0?<p className="ow-muted">هنوز ساعتی در این محدوده تأیید نشده است.</p>:
    <div className="ow-term-week-chart" aria-label="نمودار میله‌ای ساعات تأییدشده هفتگی">
     {weeks.map(w=><div key={w.date} className="ow-term-week">
      <span className="ow-term-week-bar" style={{height:(Math.max(5,Math.round(100*w.minutes/maxWeek)))+'%'}}
       title={pretty(w.date)+' · '+faMinutes(w.minutes)} aria-hidden="true"/>
      <small>{pretty(w.date)}</small>
      <b>{faMinutes(w.minutes)}</b>
     </div>)}
    </div>}
     </details>:<>
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
     </>}
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
  </>}
 </section>
}
