import {useEffect,useRef,useState} from 'react'

// Manager-authorized rows and review callbacks are supplied by the existing
// operations modules. This is a browsing-only surface; it never writes or
// infers approval from status, nor does it preselect a decision.
export default function FocusedReviewQueue({
 items=[],label='صف رسیدگی',emptyText='درخواستی برای رسیدگی وجود ندارد.',
 renderReview,
}){
 const [selectedKey,setSelectedKey]=useState('')
 const selected=items.find(item=>item.key===selectedKey)
 const selectedHeading=useRef(null)
 const directoryHeading=useRef(null)
 const activeTrigger=useRef(null)
 const lastKey=useRef('')
 useEffect(()=>{
  if(selected?.key && lastKey.current!==selected.key){
   selectedHeading.current?.focus?.({preventScroll:true})
  }else if(!selected && lastKey.current){
   // Server refresh or filter removed the reviewed row; do not focus
   // an unmounted form or auto-select the next potentially sensitive case.
   directoryHeading.current?.focus?.({preventScroll:true})
  }
  lastKey.current=selected?.key||''
 },[selected?.key])
 return <div className="swtb22-review-workspace" aria-label={label}>
  <div className="swtb22-review-directory" role="region" aria-label={label+' ـ فهرست'}>
   <div className="swtb22-review-directory-heading">
    <strong tabIndex={-1} ref={directoryHeading}>درخواست‌های قابل رسیدگی</strong>
    <span>{new Intl.NumberFormat('fa-IR').format(items.length)} مورد</span>
   </div>
   <div className="swtb22-review-list">
    {items.map(item=><button type="button" className="swtb22-review-row"
     key={item.key} disabled={item.disabled}
     aria-pressed={selected?.key===item.key}
     aria-controls="swtb22-review-inspector"
     onClick={event=>{activeTrigger.current=event.currentTarget;setSelectedKey(item.key)}}>
      <span className="swtb22-review-row-main">
       <strong>{item.title}</strong>
       <small>{item.subtitle}</small>
      </span>
      <span className={'swtb22-review-badge'+(item.alert?' is-alert':'')}>{item.badge}</span>
     </button>)}
    {items.length===0&&<p className="ow-muted swtb22-review-empty">{emptyText}</p>}
   </div>
  </div>
  <section id="swtb22-review-inspector" className="swtb22-review-inspector"
   role="region" aria-label="جزئیات درخواست انتخاب‌شده">
   {selected
    ?<>
      <div className="swtb22-review-inspector-head">
       <h3 tabIndex={-1} ref={selectedHeading}>{selected.title}</h3>
       <button type="button" className="report-btn report-btn--light"
        onClick={()=>{activeTrigger.current?.focus?.({preventScroll:true});setSelectedKey('')}}>بستن جزئیات</button>
      </div>
      {renderReview(selected)}
     </>
    :<div role="status" className="swtb22-review-placeholder">
      <strong>درخواستی انتخاب نشده است.</strong>
      <p>برای بررسی جزئیات و تصمیم‌گیری، یک درخواست را از فهرست انتخاب کنید.
      انتخاب درخواست هیچ تصمیمی را ثبت نمی‌کند.</p>
     </div>}
  </section>
 </div>
}
