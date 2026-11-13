import {useEffect,useMemo,useRef} from 'react'
import {candidateStage,candidateOnboardingLabel,candidateDisplayName,candidateDisplayMajor,selectManagerCandidates} from '../lib/managerCandidateView.mjs'

// One navigable directory and one purpose-built candidate inspector.
// No writes, authorization or onboarding decisions live in this component.
export default function ManagerCandidatesWorkspace({
 rows=[],filter='all',search='',selectedId='',onFilterChange,onSearchChange,
 onSelect,renderDetails,loading=false,error='',flash='',busy=false,
}){
 const filtered=useMemo(
  ()=>selectManagerCandidates(rows,filter,search),[rows,filter,search])
 const selected=filtered.find(row=>String(row.id)===String(selectedId))
 const inspectorHeading=useRef(null)
 useEffect(()=>{
  if(selected)inspectorHeading.current?.focus({preventScroll:true})
 },[selected?.id])
 return <section className="report-panel swtb22-candidate-workspace"
   aria-label="مدیریت پرونده‌های داوطلبان">
  <div className="swtb22-candidate-head">
   <div>
    <h2>داوطلبان و پذیرش</h2>
    <p>برای بررسی، یک داوطلب را از فهرست انتخاب کنید. اطلاعات پرونده و اقدام‌های مجاز در پنل جزئیات نمایش داده می‌شود.</p>
   </div>
   <span className="swtb22-candidate-count" aria-live="polite">
    {new Intl.NumberFormat('fa-IR').format(filtered.length)} از {new Intl.NumberFormat('fa-IR').format(rows.length)} پرونده
   </span>
  </div>
  <div className="swtb22-candidate-toolbar" role="group" aria-label="جست‌وجو و دسته‌بندی پرونده‌ها">
   <label className="report-field"><span>جست‌وجوی داوطلب</span>
    <input type="search" aria-label="جست‌وجو بر اساس نام، رشته یا شماره تماس"
     value={search} onChange={e=>onSearchChange(e.target.value)}
     placeholder="نام، رشته یا شماره تماس"/>
   </label>
   <label className="report-field"><span>وضعیت پرونده</span>
    <select aria-label="فیلتر وضعیت پرونده داوطلبان" value={filter}
     onChange={e=>onFilterChange(e.target.value)}>
     <option value="all">همه پرونده‌ها</option>
     <option value="pending">فاقد حساب دانشجوکاری</option>
     <option value="ready">آماده فعال‌سازی</option>
     <option value="active">حساب ایجادشده</option>
    </select>
   </label>
   {(search||filter!=='all')&&<button type="button" className="report-btn report-btn--light"
    onClick={()=>{onSearchChange('');onFilterChange('all')}}>پاک‌کردن فیلترها</button>}
  </div>
  {error&&<div role="alert" className="report-alert report-alert--error">{error}</div>}
  {flash&&<div role="status" className="ops-alert-success">{flash}</div>}
  {loading&&rows.length>0&&<p role="status" className="ops-muted">در حال به‌روزرسانی پرونده‌ها…</p>}
  {loading&&rows.length===0
   ?<p role="status" className="ops-muted">در حال دریافت پرونده‌ها…</p>
   :error
   ?<p className="swtb22-candidate-empty" role="status">تا دریافت موفق اطلاعات و بررسی مجوز، پرونده‌های قبلی نمایش داده نمی‌شوند.</p>
   :<div className="swtb22-candidate-grid">
    <div className="swtb22-candidate-directory" role="region" aria-label="فهرست انتخاب داوطلب">
     <div className="swtb22-candidate-directory-head"><strong>فهرست پرونده‌ها</strong>
      <small>برای مشاهده جزئیات، روی نام کلیک کنید.</small>
     </div>
     <div className="swtb22-candidate-list">
      {filtered.length
       ?filtered.map(row=><button type="button" key={row.id}
         className="swtb22-candidate-row" aria-pressed={selected?.id===row.id}
         aria-controls="swtb22-candidate-inspector"
         disabled={busy} onClick={()=>onSelect(row.id)}>
         <span className="swtb22-candidate-row-main">
          <strong>{candidateDisplayName(row)}</strong>
          <small>{candidateDisplayMajor(row)||'رشته نامشخص'}{row.entry_year?' · ورودی '+row.entry_year:''}</small>
          {row.worker_id && row.worker_onboarding_state && <small>راه‌اندازی: {candidateOnboardingLabel(row)}</small>}
         </span>
         <span className={'swtb22-candidate-stage'+(row.worker_id?' is-worker':'')}>
          {candidateStage(row)}
         </span>
        </button>)
       :<p className="swtb22-candidate-empty">
         {rows.length?'پرونده‌ای مطابق جست‌وجو و فیلتر وجود ندارد.':'هنوز پرونده‌ای ثبت نشده است.'}
        </p>}
     </div>
    </div>
    <div id="swtb22-candidate-inspector" className="swtb22-candidate-inspector"
      role="region" aria-label="جزئیات پرونده انتخاب‌شده">
     {selected
      ?<>
        <div className="swtb22-candidate-inspector-head">
         <h3 tabIndex={-1} ref={inspectorHeading}>بررسی پرونده: {candidateDisplayName(selected)}</h3>
         <button type="button" className="report-btn report-btn--light" disabled={busy}
          onClick={()=>onSelect('')}>بستن جزئیات</button>
        </div>
        {renderDetails(selected)}
       </>
      :<div className="swtb22-candidate-inspector-placeholder" role="status">
        <strong>پرونده‌ای انتخاب نشده است.</strong>
        <p>ابتدا از فهرست سمت راست یک داوطلب را انتخاب کنید تا بررسی مصاحبه، استعلام و دسترسی حساب در همین بخش انجام شود.</p>
       </div>}
    </div>
   </div>}
 </section>
}
