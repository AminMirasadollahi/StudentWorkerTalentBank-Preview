// Preview by default. Only the isolated SWTB27 review host supplies a submit port.
// No API import, fallback writer, storage or independent retry.
import React,{useRef,useState} from 'react'
import JalaliDatePicker from './JalaliDatePicker.jsx'
import {previewBatchAssignment} from '../lib/batchAssignmentPreview.mjs'
import {useManagerRetainedState} from '../lib/managerDraftGuard.mjs'
import './batch-assignment-preview.css'
import {managerIdentityLabel} from '../lib/managerIdentityLabel.mjs'
const labels={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const fa=x=>Number(x).toLocaleString('fa-IR')
const day=x=>new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(x+'T12:00:00Z'))
const errors={CONTEXT_UNAVAILABLE:'اطلاعات لازم برای پیش‌نمایش در دسترس نیست.',INVALID_PLAN_OR_TERM:'نیمسال یا ساختار مجموعه معتبر نیست.',INVALID_ROW:'ساختار ردیف نامعتبر یا تکراری است.',UNSUPPORTED_MODE:'این نوع تخصیص هنوز پشتیبانی نمی‌شود.',SELECT_WORKERS:'حداقل یک مسئول انتخاب کنید.',DUPLICATE_PAIR:'مسئول تکراری انتخاب شده است.',WORKER_NOT_ACTIVE_OR_UNKNOWN:'مسئول غیرفعال یا ناشناخته است.',GROUP_SIZE:'کار گروهی باید ۲ تا ۲۰ عضو داشته باشد.',DATE_OUTSIDE_TERM_OR_PAST:'روز برنامه‌ریزی باید از امروز و در نیمسال فعال باشد.',INVALID_UNIT:'واحد را مشخص کنید.',SHORT_NOTICE_REASON:'برای امروز یا فردا دلیل اطلاع‌رسانی کوتاه را بنویسید.',INVALID_PREREQUISITES:'مجموعه پیش‌نیاز نامعتبر است.',PREREQUISITE_NOT_LOADED:'پیش‌نیاز در اطلاعات فعلی یافت نشد.',INVALID_V3_FIELDS:'عنوان، شرح، زمان یا دلیل را بررسی کنید.'}
const capacity={ok:'ظرفیت کافی در داده‌های فعلی',full:'ظرفیت پر می‌شود',overbooked:'بیش از ظرفیت اعلام‌شده',unavailable:'عدم حضور',not_configured:'برنامه حضور ثبت نشده',unknown:'ظرفیت نامشخص'}
const blank=id=>({id,title:'',instructions:'',minutes:60,mode:'independent',workerIds:[],date:null,unit:null,reason:null,prerequisiteIds:[]})
export default function BatchAssignmentPreview({context,reviewPort=null}){
 const revision=context.term.id+':'+(reviewPort?.editorRevision??0)
 const retained=useManagerRetainedState(['synthetic-review','typed-release'].includes(reviewPort?.mode)?'day-batch':null,revision,()=>({termId:context.term.id,defaults:{date:context.defaultDate??context.today,unit:'library',reason:''},rows:[blank('row-1')]}))
 const draft=retained.value
 const [review,setReview]=useState(null)
 const previewRef=useRef(null)
 const submitLock=useRef(false)
 const [submitting,setSubmitting]=useState(false)
 const [notice,setNotice]=useState('')
 const enabled=['synthetic-review','typed-release'].includes(reviewPort?.mode)&&reviewPort?.snapshot?.canStart===true&&typeof reviewPort.submit==='function'
 const locked=reviewPort!==null&&(!enabled||submitting)
 const change=fn=>{if(locked||submitLock.current)return;retained.change(fn);setReview(null);setNotice('')}
 const defaults=(key,value)=>change(p=>({...p,defaults:{...p.defaults,[key]:value}}))
 const rowChange=(id,fn)=>change(p=>({...p,rows:p.rows.map(r=>r.id===id?fn(r):r)}))
 const field=(id,key,value)=>rowChange(id,r=>({...r,[key]:value}))
 const toggle=(id,worker)=>rowChange(id,r=>({...r,workerIds:r.workerIds.includes(worker)?r.workerIds.filter(x=>x!==worker):[...r.workerIds,worker]}))
 const workers=context.workers.filter(w=>w.state==='active')
 const workerName=id=>managerIdentityLabel(workers.find(w=>w.id.toLowerCase()===id)?.name,id)
 const displayReview=review?.context===context&&review?.draft===draft?review.result:null
 const submit=async()=>{
  if(!enabled||submitLock.current||!displayReview?.ok)return
  submitLock.current=true;setSubmitting(true);setNotice('')
  try{const result=await reviewPort.submit(draft,context);if(result==='invalid')setNotice('اطلاعات مجموعه معتبر نیست. پیش‌نویس را اصلاح کنید.');else if(result==='blocked')setNotice('درخواست جدید ارسال نشد. وضعیت واگذاری را بررسی کنید.')}
  catch{setNotice('نتیجه درخواست تأیید نشده است؛ وضعیت را بررسی کنید.')}
  finally{submitLock.current=false;setSubmitting(false)}
 }
 const units=(value,onChange,inherit=false)=><select value={value??''} onChange={e=>onChange(e.target.value||null)}>{inherit&&<option value="">پیش‌فرض مجموعه</option>}{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
 return <section className="report-panel swtb24-batch-preview" dir="rtl" aria-label="پیش‌نمایش واگذاری مجموعه‌ای">
  <header><h2>تعریف مجموعه کارها</h2><p role="status">{reviewPort===null?'نسخه بررسی با اطلاعات نمونه؛ هیچ وظیفه یا ساعتی ثبت نمی‌شود.':reviewPort.mode==='typed-release'?'ثبت مجموعه کارها برای دانشجوکاران انتخاب‌شده انجام می‌شود؛ زمان استاندارد به معنی ساعت تأییدشده نیست.':reviewPort.environment==='staging-review'?'ثبت در محیط آزمایشی مستقل انجام می‌شود؛ اطلاعات عملیاتی تغییر نمی‌کند.':'مسیر بررسی با اطلاعات مصنوعی؛ اطلاعات عملیاتی تغییر نمی‌کند.'}</p></header>
  <fieldset disabled={locked} style={{border:0,margin:0,padding:0,minWidth:0}}>
  <fieldset className="swtb24-batch-defaults"><legend>پیش‌فرض مشترک</legend>
   <label className="report-field"><span>واحد</span>{units(draft.defaults.unit,v=>defaults('unit',v))}</label>
   <div className="report-field"><span>روز برنامه‌ریزی</span><JalaliDatePicker value={draft.defaults.date} min={context.today} onChange={v=>defaults('date',v)} ariaLabel="روز مشترک مجموعه"/></div>
   <label className="report-field"><span>دلیل اطلاع‌رسانی کوتاه (در صورت نیاز)</span><input maxLength={300} value={draft.defaults.reason} onChange={e=>defaults('reason',e.target.value)}/></label>
  </fieldset>
  <div className="swtb24-batch-rows">
   {draft.rows.map((r,i)=><fieldset key={r.id} className="swtb24-batch-row" data-row-id={r.id}><legend>کار {fa(i+1)}</legend>
    <div className="swtb24-batch-title">
     <label className="report-field"><span>عنوان کار {fa(i+1)}</span><input maxLength={160} value={r.title} onChange={e=>field(r.id,'title',e.target.value)}/></label>
     <label className="report-field"><span>زمان استاندارد هر نفر (دقیقه)</span><input type="number" min="1" max="1440" value={r.minutes??''} onChange={e=>field(r.id,'minutes',e.target.value===''?null:Number(e.target.value))}/></label>
    </div>
    <label className="report-field"><span>شرح کار و نتیجه مورد انتظار</span><textarea rows={2} maxLength={3000} value={r.instructions} onChange={e=>field(r.id,'instructions',e.target.value)}/></label>
    <label className="report-field"><span>نوع تخصیص</span><select value={r.mode} onChange={e=>field(r.id,'mode',e.target.value)}><option value="independent">وظایف مستقل برای افراد منتخب</option><option value="collaborative">کار گروهی با گزارش فردی</option></select></label>
    {draft.rows.length===1&&<fieldset><legend>مسئولان کار</legend><div className="swtb24-batch-people">{workers.map(w=><label key={w.id}><input type="checkbox" checked={r.workerIds.includes(w.id)} onChange={()=>toggle(r.id,w.id)}/>{managerIdentityLabel(w.name,w.id)}</label>)}</div></fieldset>}
    <details><summary>تنظیمات اختصاصی و پیش‌نیازها</summary>
     <label className="report-field"><span>واحد اختصاصی</span>{units(r.unit,v=>field(r.id,'unit',v),true)}</label>
     <label><input type="checkbox" checked={r.date!==null} onChange={e=>field(r.id,'date',e.target.checked?draft.defaults.date:null)}/>روز اختصاصی</label>
     {r.date!==null&&<JalaliDatePicker value={r.date} min={context.today} onChange={v=>field(r.id,'date',v)} ariaLabel={'روز اختصاصی کار '+fa(i+1)}/>}
     <label className="report-field"><span>دلیل اختصاصی اطلاع‌رسانی کوتاه</span><input maxLength={300} value={r.reason??''} onChange={e=>field(r.id,'reason',e.target.value||null)} placeholder="در صورت نیاز، جایگزین دلیل مشترک"/></label>
     <fieldset><legend>پیش‌نیازهای موجود (اختیاری)</legend>{context.data.tasks.map(t=><label key={t.id}><input type="checkbox" checked={r.prerequisiteIds.includes(t.id)} disabled={!r.prerequisiteIds.includes(t.id)&&r.prerequisiteIds.length>=20} onChange={()=>rowChange(r.id,x=>({...x,prerequisiteIds:x.prerequisiteIds.includes(t.id)?x.prerequisiteIds.filter(id=>id!==t.id):[...x.prerequisiteIds,t.id]}))}/>{t.title??'وظیفه موجود'}</label>)}</fieldset>
    </details>
    {draft.rows.length>1&&<button type="button" className="report-btn report-btn--light" onClick={()=>change(p=>({...p,rows:p.rows.filter(x=>x.id!==r.id)}))}>حذف کار {fa(i+1)}</button>}
   </fieldset>)}
  </div>
  <button type="button" className="report-btn report-btn--light" onClick={()=>change(p=>{let n=2;while(p.rows.some(r=>r.id==='row-'+n))n++;return {...p,rows:[...p.rows,blank('row-'+n)]}})}>+ افزودن کار دیگر</button>
  {draft.rows.length>1&&<section><h3>تخصیص مسئولان</h3><p>فقط مواردی که علامت می‌زنید در پیش‌نمایش منظور می‌شوند.</p>
   <div className="swtb24-batch-matrix-scroll"><table><thead><tr><th scope="col">کار</th>{workers.map(w=><th scope="col" key={w.id}>{managerIdentityLabel(w.name,w.id)}</th>)}</tr></thead><tbody>
    {draft.rows.map((r,i)=><tr key={r.id}><th scope="row">{r.title||'کار '+fa(i+1)}</th>{workers.map(w=><td key={w.id}><input type="checkbox" aria-label={'کار '+fa(i+1)+' — '+managerIdentityLabel(w.name,w.id)} checked={r.workerIds.includes(w.id)} onChange={()=>toggle(r.id,w.id)}/></td>)}</tr>)}
   </tbody></table></div></section>}
  <button type="button" className="report-btn report-btn--primary" onClick={()=>{setReview({context,draft,result:previewBatchAssignment(draft,context)});requestAnimationFrame(()=>previewRef.current?.focus())}}>بررسی تخصیص</button>
  {['synthetic-review','typed-release'].includes(reviewPort?.mode)&&retained.dirty&&<button type="button" className="report-btn report-btn--light" onClick={()=>{if(locked||submitLock.current)return;if(window.confirm('پیش‌نویس ثبت‌نشده حذف شود؟')){retained.reset();setReview(null);setNotice('')}}}>حذف پیش‌نویس محلی</button>}
  <div ref={previewRef} tabIndex={-1} aria-live="polite">
   {displayReview&&!displayReview.ok&&<div role="alert"><h3>موارد نیازمند اصلاح</h3><ul>{displayReview.errors.map((e,i)=><li key={i}>{e.rowId?'کار '+fa(draft.rows.findIndex(r=>r.id===e.rowId)+1)+' — ':''}{errors[e.code]??e.code}</li>)}</ul></div>}
   {displayReview?.ok&&<section className="swtb24-batch-result"><h3>پیش‌نمایش تخصیص</h3>
    <p>تعداد کارها: {fa(displayReview.plan.rowCount)} · تخصیص فردی: {fa(displayReview.plan.pairCount)} · افراد: {fa(displayReview.plan.personCount)}</p>
    <p><strong data-testid="batch-standard-total">{fa(displayReview.plan.totalMinutes)} دقیقه</strong> مجموع زمان استاندارد نفر-دقیقه؛ نه ساعات تأییدشده یا قابل پرداخت.</p>
    <div className="swtb24-batch-matrix-scroll"><table><thead><tr><th>فرد / روز</th><th>زمان پیشنهادی</th><th>کارهای موجود</th><th>ظرفیت اعلام‌شده</th><th>وضعیت</th></tr></thead><tbody>{displayReview.plan.dailyTotals.map(x=><tr key={x.workerId+'/'+x.date}><th scope="row">{workerName(x.workerId)} · {day(x.date)}</th><td>{fa(x.proposedMinutes)}</td><td>{x.existingMinutes===null?'نامشخص':fa(x.existingMinutes)}</td><td>{x.availableMinutes===null?'نامشخص':fa(x.availableMinutes)}</td><td>{capacity[x.capacityCode]}</td></tr>)}</tbody></table></div>
    {displayReview.plan.warnings.some(w=>w.code==='CANCELLED_PREREQUISITE')&&<p role="alert">حداقل یک پیش‌نیاز لغوشده وجود دارد؛ تا تعیین تکلیف امکان انجام کار وابسته وجود نخواهد داشت.</p>}
    <p>ظرفیت صرفاً راهنمای برنامه‌ریزی بر اساس داده‌های موجود است؛ مجوز همکاری یا تأیید ساعت نیست.</p>
    <button type="button" className="report-btn report-btn--primary" disabled={!enabled||submitting} onClick={reviewPort===null?undefined:submit}>{reviewPort===null?'ثبت نهایی مجموعه (هنوز فعال نیست)':reviewPort.mode==='typed-release'?(submitting?'در حال ثبت مجموعه…':'ثبت مجموعه کارها'):(submitting?'در حال ثبت آزمایشی…':'ثبت آزمایشی مجموعه')}</button>
   </section>}
  </div>
  </fieldset>
  {notice&&<p role="alert">{notice}</p>}
 </section>
}
