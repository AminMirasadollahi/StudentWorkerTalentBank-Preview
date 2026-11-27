import {useMemo,useState} from 'react'
import {managerWindowHistoryV2,managerUnallocatedWindowsV2} from '../lib/managerWindowReadV2.mjs'
import {buildManagerWindowHistoryWorkbookV2} from '../lib/managerWindowHistoryWorkbookV2.mjs'
import {workerWindowReviewModel,jalaliWindowDay,windowUnitLabel} from '../lib/windowReviewPresentation.mjs'
import JalaliDatePicker from './JalaliDatePicker.jsx'
import './window-review.css'
const number=n=>new Intl.NumberFormat('fa-IR').format(n)
const mins=n=>n===null?'—':number(n)+' دقیقه'
const lanes={action:'قابل انجام',upcoming:'آینده',held:'نیازمند بررسی',pending:'در انتظار بررسی',completed:'پایان‌یافته'}
const unitLabels={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const reviewLabels={submitted:'در انتظار بررسی',approved:'تأییدشده',changes_requested:'نیازمند اصلاح',rejected:'ردشده'}
const opts={dateLabel:jalaliWindowDay,unitLabels,reviewLabels}
function Task({t}){
 return <article className="wr-task"><div className="wr-task-head"><strong>{t.title}</strong><span className="wr-tag">{t.kind}</span></div>
 <p className="wr-meta">{t.unit} · {t.state}</p><dl><div><dt>{t.kind==='بازه‌ای'?'بازه انجام':'روز برنامه‌ریزی'}</dt><dd>{t.scheduleText}</dd></div><div><dt>زمان استاندارد</dt><dd>{mins(t.standardMinutes)}</dd></div></dl>
 <p className="wr-meta">{t.allocationText}</p>{t.holdText&&<p className="wr-held">{t.holdText}</p>}
 {(t.canStart||t.canSubmit)&&<p className="wr-meta">{t.canStart?'شروع کار مجاز در قرارداد آزمایشی':'ثبت گزارش مجاز در قرارداد آزمایشی'}</p>}
 {t.instructions&&<details><summary>شرح کار</summary><p className="wr-instructions">{t.instructions}</p></details>}</article>
}
function Worker({snapshot,workerId}){
 const [lane,setLane]=useState('action')
 const m=workerWindowReviewModel(snapshot,workerId)
 return <><div className="wr-head"><div><h2>کارهای من</h2><p>تاریخ مبنای سرور: {jalaliWindowDay(m.serverToday)}</p></div><div><small>جمع تأییدشده تمام‌دوره سرور</small><strong>{mins(m.approvedMinutesTotal)}</strong></div></div>
 <div className="wr-tabs" role="group" aria-label="دسته کارها">{Object.entries(lanes).map(([k,v])=><button type="button" key={k} aria-pressed={lane===k} onClick={()=>setLane(k)}>{v} ({number(m.groups[k].length)})</button>)}</div>
 <div className="wr-list">{m.groups[lane].map(t=><Task key={t.id} t={t}/>)}{!m.groups[lane].length&&<p role="status">کاری در این دسته وجود ندارد.</p>}</div>
 <h3>سوابق گزارش‌های بارگذاری‌شده</h3><p className="wr-meta">این فهرست ممکن است شامل تمام گزارش‌های قبلی نباشد.</p>
 <div className="wr-list">{m.reports.map(e=><article key={e.id} className="wr-task"><strong>{e.taskTitle}</strong><p className="wr-meta">تاریخ واقعی فعالیت: {e.actualDate} · {e.status}</p><dl><div><dt>درخواستی</dt><dd>{mins(e.reportedMinutes)}</dd></div><div><dt>تأییدشده</dt><dd>{mins(e.approvedMinutes)}</dd></div></dl></article>)}</div></>
}
function Manager({snapshot}){
 const [filters,setFilters]=useState({workerId:'',unit:'',review:'',from:'',to:''}),[selected,setSelected]=useState(''),[exporting,setExporting]=useState(false),[message,setMessage]=useState(''),[page,setPage]=useState(0)
 const model=useMemo(()=>{try{return {history:managerWindowHistoryV2(snapshot,filters,opts),backlog:managerUnallocatedWindowsV2(snapshot,{from:filters.from,to:filters.to,workerId:filters.workerId,unit:filters.unit})}}catch{return null}},[snapshot,filters])
 const change=(k,v)=>{setFilters(f=>({...f,[k]:v}));setSelected('');setMessage('');setPage(0)}
 const row=model?.history.records.slice(page*50,page*50+50).find(r=>r.key===selected)
 const download=async()=>{if(!model||exporting)return;setExporting(true);setMessage('');try{const ExcelJS=await import('exceljs');const workbook=buildManagerWindowHistoryWorkbookV2(ExcelJS,model.history,[['محیط','داده مصنوعی؛ صرفاً بررسی'],['فیلتر دانشجوکار',snapshot.workers.find(w=>w.id===filters.workerId)?.name||'همه'],['فیلتر واحد',unitLabels[filters.unit]||'همه'],['فیلتر وضعیت',filters.review==='without_report'?'بدون گزارش':reviewLabels[filters.review]||'همه'],['از تاریخ ISO',filters.from||'بدون محدودیت'],['تا تاریخ ISO',filters.to||'بدون محدودیت']]);const data=await workbook.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download='SWTB25-window-history-review.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch{setMessage('تهیه فایل ناموفق بود.')}finally{setExporting(false)}}
 return <><div className="wr-head"><div><h2>مدیریت کارها و سوابق</h2><p>فهرست محدود به داده‌های بارگذاری‌شده است؛ آمار کامل نیمسال نیست.</p></div><button type="button" disabled={!model||exporting} onClick={download}>{exporting?'در حال تهیه فایل':'خروجی Excel آزمایشی'}</button></div>
 <div className="wr-filters"><label>دانشجوکار<select aria-label="دانشجوکار" value={filters.workerId} onChange={e=>change('workerId',e.target.value)}><option value="">همه</option>{snapshot.workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>واحد<select aria-label="واحد" value={filters.unit} onChange={e=>change('unit',e.target.value)}><option value="">همه</option>{Object.entries(unitLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>وضعیت<select aria-label="وضعیت" value={filters.review} onChange={e=>change('review',e.target.value)}><option value="">همه</option><option value="without_report">بدون گزارش</option>{Object.entries(reviewLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><div className="wr-date-field"><span>از تاریخ</span><JalaliDatePicker ariaLabel="از تاریخ سوابق" value={filters.from} onChange={v=>change('from',v)} min="2000-01-01" max={filters.to||'2100-12-31'}/>{filters.from&&<button type="button" onClick={()=>change('from','')}>پاک کردن تاریخ آغاز</button>}</div><div className="wr-date-field"><span>تا تاریخ</span><JalaliDatePicker ariaLabel="تا تاریخ سوابق" value={filters.to} onChange={v=>change('to',v)} min={filters.from||'2000-01-01'} max="2100-12-31"/>{filters.to&&<button type="button" onClick={()=>change('to','')}>پاک کردن تاریخ پایان</button>}</div></div>
 {message&&<p role="status">{message}</p>}
 {!model?<p role="alert">دامنه تاریخ یا قرارداد اطلاعات معتبر نیست؛ نتایج و خروجی غیرفعال‌اند.</p>:<><div className="wr-stats"><div><small>برآورد یکتای نتایج</small><strong>{mins(model.history.summary.standardMinutesOnce)}</strong></div><div><small>تأییدشده در نتایج</small><strong>{mins(model.history.summary.approvedMinutes)}</strong></div><div><small>کارهای بازه‌ای باز (دامنه شخص/واحد/تاریخ)</small><strong>{number(model.backlog.windowCount)}</strong></div></div>
 <p className="wr-held">کارهای دارای گزارش خارج از فهرست بارگذاری‌شده (پیش از فیلتر تاریخ و وضعیت): {number(model.history.summary.unloadedReportTaskCount)}. از نبود ردیف، نبود گزارش نتیجه نگیرید.</p>
 <div className="wr-split"><div className="wr-list" aria-label="نتایج سوابق">{model.history.records.slice(page*50,page*50+50).map(r=><button type="button" key={r.key} aria-pressed={selected===r.key} className="wr-row" onClick={()=>setSelected(r.key)}><strong>{r.taskTitle}</strong><small>{r.workerName} · {r.status}</small><small>{r.scheduleLabel} · {r.dateText}</small></button>)}{!model.history.records.length&&<p>نتیجه‌ای در دامنه انتخاب‌شده وجود ندارد.</p>}{model.history.records.length>50&&<nav className="wr-page" aria-label="صفحه‌بندی سوابق"><button type="button" disabled={page===0} onClick={()=>{setPage(p=>p-1);setSelected('')}}>قبلی</button><span>{number(page+1)} از {number(Math.ceil(model.history.records.length/50))}</span><button type="button" disabled={(page+1)*50>=model.history.records.length} onClick={()=>{setPage(p=>p+1);setSelected('')}}>بعدی</button></nav>}</div>
 <section className="wr-detail" aria-label="جزئیات انتخاب‌شده">{row?<><h3>{row.taskTitle}</h3><p>{row.workerName} · {row.unit} · {row.status}</p><dl><div><dt>روز برنامه‌ریزی</dt><dd>{jalaliWindowDay(row.plannedDate)}</dd></div><div><dt>بازه انجام</dt><dd>{row.windowStart?jalaliWindowDay(row.windowStart)+' تا '+jalaliWindowDay(row.windowEnd):'—'}</dd></div><div><dt>تاریخ واقعی فعالیت</dt><dd>{jalaliWindowDay(row.actualWorkDate)}</dd></div><div><dt>برآورد</dt><dd>{mins(row.estimateMinutes)}</dd></div><div><dt>درخواستی</dt><dd>{mins(row.requestedMinutes)}</dd></div><div><dt>تأییدشده</dt><dd>{mins(row.approvedMinutes)}</dd></div></dl>{row.missingTask&&<p role="alert">اطلاعات وظیفه مرتبط در فهرست موجود نیست.</p>}{row.workerNote&&<p className="wr-instructions">{row.workerNote}</p>}</>:<p>برای مشاهده جزئیات، یک ردیف را انتخاب کنید.</p>}</section></div>
 <h3>وظایف بازه‌ای بدون تخصیص روزانه</h3><p className="wr-meta">برآورد کل بازه یک‌بار نمایش داده می‌شود و به ظرفیت هیچ روزی اضافه نمی‌شود.</p><div className="wr-list">{model.backlog.items.map(t=><article className="wr-task" key={t.taskId}><strong>{t.title}</strong><p>{windowUnitLabel(t.unit)} · {jalaliWindowDay(t.windowStart)} تا {jalaliWindowDay(t.windowEnd)}</p><p>{mins(t.standardMinutes)} · تخصیص روزانه تعیین نشده</p></article>)}</div></>}
 </>
}
// This component is reachable ONLY from synthetic review entrypoint; no live import.
export default function WindowReadReview({role,snapshot,workerId,syntheticReviewOnly}){
 if(syntheticReviewOnly!==true||!['manager','worker'].includes(role))return <p role="alert">نمای آزمایشی غیرفعال است.</p>
 try{if(role==='worker')workerWindowReviewModel(snapshot,workerId);else managerWindowHistoryV2(snapshot,{},opts)}catch{return <p role="alert">قرارداد اطلاعات معتبر نیست؛ نمایش متوقف شد.</p>}
 return <main className="wr-shell" dir="rtl"><p className="wr-banner">نسخه آزمایشی · داده مصنوعی · بدون ثبت یا تغییر اطلاعات واقعی</p>{role==='worker'?<Worker key={workerId} snapshot={snapshot} workerId={workerId}/>:<Manager snapshot={snapshot}/>}</main>
}
