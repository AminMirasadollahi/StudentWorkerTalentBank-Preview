import {useEffect,useRef,useState} from 'react'

// Read-only, manager-authorized history records already scoped by worker/date/unit/
// review in the existing filterWorkerHistory contract. One detail at a time.
export default function ManagerHistoryExplorer({rows=[],limit=100,emptyText='هنوز گزارشی ثبت نشده است.'}){
 const [selectedKey,setSelectedKey]=useState('')
 const selected=rows.find(r=>r.key===selectedKey)
 const heading=useRef(null)
 const directoryHeading=useRef(null)
 const opener=useRef(null)
 const previous=useRef('')
 useEffect(()=>{
  if(selected?.key&&selected.key!==previous.current){
   heading.current?.focus?.({preventScroll:true})
  }else if(!selected&&previous.current){
   directoryHeading.current?.focus?.({preventScroll:true})
  }
  previous.current=selected?.key||''
 },[selected?.key])
 const visible=rows.slice(0,limit)
 return <div className="swtb22-history-browser" aria-label="مرور سوابق فعالیت بارگذاری‌شده">
  <div className="swtb22-history-directory" role="region" aria-label="فهرست گزارش‌های فعالیت">
   <div className="swtb22-history-directory-heading">
    <strong ref={directoryHeading} tabIndex={-1}>گزارش‌های فعالیت</strong>
    <span>{new Intl.NumberFormat('fa-IR').format(rows.length)} گزارش</span>
   </div>
   <div className="swtb22-history-list">
    {visible.map(row=><button key={row.key} type="button" className="swtb22-history-row"
     aria-pressed={row.key===selected?.key} aria-controls="swtb22-history-inspector"
     onClick={event=>{opener.current=event.currentTarget;setSelectedKey(row.key)}}>
     <span className="swtb22-history-row-main">
      <strong>{row.taskTitle}</strong>
      <small>{row.workerName} · {row.dateText} · {row.unit}</small>
     </span>
     <span className={'swtb22-history-status'+(row.missingTask?' is-warning':'')}>
      {row.status}
     </span>
    </button>)}
    {!rows.length&&<p className="ow-muted swtb22-history-empty">{emptyText}</p>}
   </div>
  </div>
  <section id="swtb22-history-inspector" className="swtb22-history-inspector"
   role="region" aria-label="جزئیات گزارش انتخاب‌شده">
   {selected?<div className="swtb22-history-detail">
    <div className="swtb22-history-inspector-head">
     <h3 tabIndex={-1} ref={heading}>{selected.taskTitle}</h3>
     <button type="button" className="report-btn report-btn--light" onClick={()=>{
      opener.current?.focus?.({preventScroll:true});setSelectedKey('')
     }}>بستن جزئیات</button>
    </div>
    <p className="ow-muted">{selected.workerName} · {selected.unit} · {selected.dateText}</p>
    <dl className="swtb22-history-facts">
     <div><dt>وضعیت گزارش</dt><dd>{selected.status}</dd></div>
     <div><dt>زمان درخواستی</dt><dd>{selected.requestedMinutes===null?'نامشخص':new Intl.NumberFormat('fa-IR').format(selected.requestedMinutes)+' دقیقه'}</dd></div>
     <div><dt>زمان تأییدشده</dt><dd>{selected.reviewState==='approved'
       ?selected.approvedMinutes===null?'اطلاعات تأیید ناقص است':new Intl.NumberFormat('fa-IR').format(selected.approvedMinutes)+' دقیقه'
       :'هنوز زمان تأییدشده‌ای برای این گزارش ثبت نشده است'}</dd></div>
     <div><dt>برآورد وظیفه</dt><dd>{selected.estimateMinutes===null?'نامشخص':new Intl.NumberFormat('fa-IR').format(selected.estimateMinutes)+' دقیقه'}</dd></div>
    </dl>
    {selected.missingTask&&<p className="ow-warning" role="alert">
     کار مرتبط در فهرست بارگذاری‌شده موجود نیست؛ از واحد یا برآورد این گزارش نتیجه‌گیری نکنید.
    </p>}
    {selected.invalidMinutes&&<p className="ow-warning" role="alert">
     مقادیر زمان این گزارش برای جمع‌بندی نیازمند بررسی منبع هستند.
    </p>}
    {(selected.extraReason||selected.extraText||selected.workerNote||selected.reviewNote)&&
     <details className="swtb22-history-extra"><summary>توضیحات تکمیلی گزارش و تصمیم</summary>
      {selected.extraReason&&<p><b>علت زمان اضافه:</b> {selected.extraReason}</p>}
      {selected.extraText&&<p><b>شرح درخواست اضافه:</b> {selected.extraText}</p>}
      {selected.workerNote&&<p><b>یادداشت دانشجوکار:</b> {selected.workerNote}</p>}
      {selected.reviewNote&&<p><b>توضیح مدیر:</b> {selected.reviewNote}</p>}
     </details>}
   </div>:<div className="swtb22-history-placeholder" role="status">
    <strong>گزارشی انتخاب نشده است.</strong>
    <p>برای مشاهده جزئیات یک گزارش، آن را از فهرست انتخاب کنید.
    این بخش فقط برای مرور سوابق است و هیچ ساعت یا وضعیت کاری را تغییر نمی‌دهد.</p>
   </div>}
  </section>
 </div>
}
