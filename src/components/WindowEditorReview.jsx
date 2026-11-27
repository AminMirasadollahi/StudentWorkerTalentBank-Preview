import {useState,useEffect,useRef,useSyncExternalStore} from 'react'
import JalaliDatePicker from './JalaliDatePicker.jsx'
import {assignmentWindowPayload,reportWindowPayload,reviewWindowPayload,extraReasons} from '../lib/windowEditorPayloads.mjs'
import {jalaliWindowDay} from '../lib/windowReviewPresentation.mjs'
import './window-review.css'
import './window-editor-review.css'
const units={library:'کتابخانه',research:'پژوهش',public_relations:'روابط عمومی'}
const errors={SCOPE:'قرارداد یا دامنه عملیات معتبر نیست.',WORKER:'دانشجوکار واجد شرایط و واحد کار را انتخاب کنید.',DATE:'تاریخ را در بازه مجاز انتخاب کنید.',TEXT:'عنوان ۳ تا ۱۶۰ نویسه و شرح حداکثر ۳۰۰۰ نویسه باشد.',MINUTES:'زمان را به دقیقه و در محدوده مجاز وارد کنید.',SHORT_NOTICE:'برای واگذاری با فاصله کمتر از دو روز تقویمی، دلیل لازم است.',PREREQUISITES:'حداکثر ۲۰ پیش‌نیاز معتبر و بدون تکرار انتخاب کنید.',EXTRA_REASON:'علت و توضیح حداقل ۱۰ نویسه برای زمان اضافه الزامی است.',REVIEW_REASON:'برای تغییر زمان یا تأیید زمان اضافه، توضیح لازم است.'}
const statusText={ok:'پاسخ معتبر آزمایشی دریافت شد.',uncertain:'نتیجه درخواست نامشخص است. درخواست جدید ارسال نکنید.',blocked:'این عملیات در وضعیت فعلی مجاز نیست.',invalid:'ورودی معتبر نیست.',unavailable:'دریافت وضعیت ممکن نشد.',stale:'پاسخ منسوخ نادیده گرفته شد.'}
const field=(d,set,k)=>({value:d[k],onChange:e=>set(v=>({...v,[k]:e.target.value}))})
function DateField({label,value,onChange,min,max,disabled}){return <div className="wr-date-field"><span>{label}</span><JalaliDatePicker ariaLabel={label} value={value} onChange={onChange} min={min} max={max} disabled={disabled}/></div>}
function Recovery({s,run,session}){
 const a=s.slot?.active
 return <section className="we-recovery" aria-label="وضعیت درخواست واگذاری">
 <h3>وضعیت درخواست واگذاری</h3>
 <p>{!s.slot?'وضعیت هنوز مشخص نیست':!a?'درخواستی در انتظار نیست':a.status==='foreign_kind_occupied'?'درخواست دیگری در صف بازیابی است؛ این فرم آن را تغییر نمی‌دهد.':a.status==='reserved'?'درخواست رزرو شده؛ هنوز ثبت نهایی نشده است.':a.status==='committed'?'ثبت نهایی با رسید معتبر تأیید شد.':'لغو درخواست تأیید شد.'}</p>
 {a?.receipt&&<dl><div><dt>شناسه وظیفه</dt><dd dir="ltr">{a.receipt.task_id}</dd></div><div><dt>زمان استاندارد کل</dt><dd>{a.receipt.standard_minutes} دقیقه</dd></div><div><dt>بازه</dt><dd>{jalaliWindowDay(a.receipt.window_start)} تا {jalaliWindowDay(a.receipt.window_end)}</dd></div></dl>}
 <div className="we-actions"><button type="button" disabled={s.busy||!s.ready} onClick={()=>run(()=>session.reconcile())}>خواندن وضعیت درخواست</button>
 {a?.status==='reserved'&&<><button type="button" disabled={s.busy||s.uncertain||!s.frozenDraft} onClick={()=>run(()=>session.commit())}>ثبت نهایی واگذاری</button><button type="button" disabled={s.busy||s.uncertain} onClick={()=>run(()=>session.cancel())}>لغو درخواست رزروشده</button></>}
 {['committed','cancelled'].includes(a?.status)&&<button type="button" disabled={s.busy||s.uncertain} onClick={()=>run(()=>session.ack())}>تأیید دریافت رسید</button>}</div>
 {a?.status==='reserved'&&!s.frozenDraft&&<p>پیش‌نویس دقیق این رزرو در نشست فعلی موجود نیست؛ ثبت نهایی مجاز نیست.</p>}</section>
}
function useSessionDraft(session,key,initial){
 const [d,setLocal]=useState(()=>session.draft(key,initial()))
 const ref=useRef(d)
 const set=change=>{const v=typeof change==='function'?change(ref.current):change;if(session.saveDraft(key,v)){ref.current=v;setLocal(v)}}
 return [d,set]
}
function Assignment({scope,s,session,run,setMessage,newId}){
 const initial=()=>({workerId:'',unit:'research',title:'',instructions:'',start:scope.serverToday,end:scope.serverToday,minutes:'60',reason:'',prerequisites:[]})
 const [d,set]=useSessionDraft(session,'assignment:'+scope.term.id,initial)
 const hadDraft=useRef(false)
 useEffect(()=>{if(hadDraft.current&&!s.frozenDraft&&!s.slot?.active&&s.slot){set(initial())}hadDraft.current=!!s.frozenDraft},[s.frozenDraft,s.slot])
 const frozen=!!s.frozenDraft||!!s.slot?.active||s.uncertain||s.busy||!s.ready||!s.slot
 const reserve=e=>{e.preventDefault();if(frozen)return;const v=assignmentWindowPayload(d,scope,newId(),s.slot.epoch);if(!v.ok){setMessage(errors[v.code]);return}void run(()=>session.reserve(v.args))}
 return <><h2>واگذاری کار بازه‌ای</h2><p>یک وظیفه، یک برآورد کل، یک گزارش. زمان بین روزهای بازه تقسیم نمی‌شود.</p>
 <form onSubmit={reserve}><fieldset disabled={frozen}><div className="we-grid">
 <label>دانشجوکار<select aria-label="دانشجوکار واگذاری" {...field(d,set,'workerId')}><option value="">انتخاب کنید</option>{scope.workers.filter(w=>w.state==='active'&&w.onboarding_state==='ready'&&w.eligibility==='eligible').map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
 <label>واحد کار<select {...field(d,set,'unit')}>{Object.entries(units).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <DateField label="آغاز بازه" value={d.start} onChange={v=>set(x=>({...x,start:v,end:x.end<v?v:x.end}))} min={scope.serverToday>scope.term.start_date?scope.serverToday:scope.term.start_date} max={scope.term.end_date} disabled={frozen}/>
 <DateField label="پایان بازه" value={d.end} onChange={v=>set(x=>({...x,end:v}))} min={d.start} max={scope.term.end_date} disabled={frozen}/>
 <label>زمان استاندارد کل (دقیقه)<input type="number" min="1" max="1440" {...field(d,set,'minutes')}/></label>
 <label className="we-wide">عنوان کار<input maxLength={160} {...field(d,set,'title')}/></label>
 <label className="we-wide">شرح کار<textarea rows={4} maxLength={3000} {...field(d,set,'instructions')}/></label>
 <label className="we-wide">دلیل واگذاری نزدیک به موعد<textarea rows={2} maxLength={300} {...field(d,set,'reason')}/></label>
 </div><details><summary>پیش‌نیازهای کار (اختیاری)</summary>{scope.prerequisites.map(t=><label className="we-check" key={t.id}><input type="checkbox" checked={d.prerequisites.includes(t.id)} onChange={e=>set(x=>({...x,prerequisites:e.target.checked?[...x.prerequisites,t.id]:x.prerequisites.filter(id=>id!==t.id)}))}/>{t.title}</label>)}</details>
 <button type="submit">رزرو درخواست واگذاری</button></fieldset></form>
 {s.frozenDraft&&<p className="wr-held">پیش‌نویس رزروشده تا تعیین تکلیف درخواست قفل است.</p>}
 <Recovery s={s} run={run} session={session}/></>
}
function Report({task,s,session,run,setMessage,newId}){
 const a=task.window_actions
 const [d,set]=useSessionDraft(session,'report:'+task.id+':'+task.window_revision,()=>({date:a.date_max,minutes:String(task.estimate_minutes),note:'',reasonCode:'',reasonText:''}))
 const [started,setStarted]=useState(false),[submitted,setSubmitted]=useState(false)
 const disabled=s.busy||s.uncertain||!s.ready||submitted||s.receipt?.status!=null
 const send=e=>{e.preventDefault();if(disabled)return;const v=reportWindowPayload(task,d,newId());if(!v.ok){setMessage(errors[v.code]);return}void run(()=>session.perform('submit',v.args)).then(r=>{if(r.status==='ok')setSubmitted(true)})}
 return <><h2>ثبت فعالیت بازه‌ای</h2><h3>{task.title}</h3><p>بازه انجام: {jalaliWindowDay(task.window_start)} تا {jalaliWindowDay(task.window_end)} · برآورد {task.estimate_minutes} دقیقه</p>
 {a.can_start&&<button type="button" disabled={disabled||started||s.receipt?.state==='in_progress'} onClick={()=>run(()=>session.perform('start',{p_task_id:task.id,p_expected_revision:task.window_revision})).then(r=>{if(r.status==='ok')setStarted(true)})}>شروع کار آزمایشی</button>}
 {!a.can_submit?<p role="status">ثبت گزارش در وضعیت فعلی مجاز نیست.</p>:<form onSubmit={send}><fieldset disabled={disabled}><div className="we-grid">
 <DateField label="تاریخ واقعی فعالیت" value={d.date} onChange={v=>set(x=>({...x,date:v}))} min={a.date_min} max={a.date_max} disabled={disabled}/>
 <label>زمان انجام کار (دقیقه)<input type="number" min={a.minimum_minutes} max={a.maximum_minutes} {...field(d,set,'minutes')}/></label>
 <label className="we-wide">شرح فعالیت<textarea maxLength={2000} rows={4} {...field(d,set,'note')}/></label>
 {Number(d.minutes)>task.estimate_minutes&&<><label>علت زمان اضافه<select {...field(d,set,'reasonCode')}><option value="">انتخاب کنید</option>{Object.entries(extraReasons).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="we-wide">توضیح زمان اضافه<textarea maxLength={600} rows={3} {...field(d,set,'reasonText')}/></label></>}
 </div><button type="submit">ارسال گزارش آزمایشی</button></fieldset></form>}
 {s.receipt?.status&&<p role="status">رسید گزارش: {s.receipt.status==='approved'?'تأییدشده':s.receipt.status==='submitted'?'دریافت شد؛ در انتظار بررسی':'وضعیت ثبت‌شده در سرور'}؛ ثبت گزارش به‌معنای اعتبار قطعی نیست.</p>}</>
}
function Approval({task,entry,s,session,run,setMessage}){
 const [d,set]=useSessionDraft(session,'review:'+entry.id+':'+task.window_revision,()=>({minutes:String(entry.reported_minutes),note:''}))
 const disabled=s.busy||s.uncertain||!s.ready||!!s.slot?.active||s.receipt?.review_state==='approved'
 const send=e=>{e.preventDefault();if(disabled)return;const v=reviewWindowPayload(task,entry,d);if(!v.ok){setMessage(errors[v.code]);return}void run(()=>session.perform('review',v.args))}
 return <><h2>تأیید گزارش بازه‌ای</h2><h3>{task.title}</h3><p>تاریخ واقعی: {jalaliWindowDay(entry.work_date)} · استاندارد {task.estimate_minutes} · درخواستی {entry.reported_minutes} دقیقه</p><form onSubmit={send}><fieldset disabled={disabled}><div className="we-grid"><label>زمان تأییدشده (دقیقه)<input type="number" min="0" max={entry.reported_minutes} {...field(d,set,'minutes')}/></label><label className="we-wide">توضیح مدیر<textarea maxLength={1000} rows={3} {...field(d,set,'note')}/></label></div><button type="submit">تأیید گزارش آزمایشی</button></fieldset></form><p className="wr-meta">رد گزارش، درخواست اصلاح و تمدید بازه هنوز فعال نیستند.</p>{s.receipt?.review_state==='approved'&&<p role="status">تأیید آزمایشی: {s.receipt.approved_minutes} دقیقه</p>}</>
}
// Mounted only by a synthetic fixture. Session retained by caller across tabs.
export default function WindowEditorReview({session,role,scope,task,entry,mode,newId,syntheticReviewOnly,onConfirmed}){
 const [message,setMessage]=useState(''),[localBusy,setLocalBusy]=useState(false)
 useSyncExternalStore(session.subscribe,session.getVersion,session.getVersion)
 const s=session.state()
 const live=useRef(true),lock=useRef(false)
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 const run=async fn=>{if(lock.current)return {status:'blocked'};lock.current=true;setLocalBusy(true);setMessage('');try{const promise=fn();const r=await promise;if(live.current){setMessage(statusText[r.status]||'وضعیت نیازمند بررسی است.');if(r.status==='ok'&&(r.value?.active?.status==='committed'||r.value?.state==='in_progress'||r.value?.status||r.value?.review_state==='approved'))onConfirmed?.(r.value)}return r}finally{lock.current=false;if(live.current)setLocalBusy(false)}}
 useEffect(()=>{if(syntheticReviewOnly===true&&!session.state().ready)void run(()=>session.connect())},[session,syntheticReviewOnly])
 if(syntheticReviewOnly!==true)return <p role="alert">نمای آزمایشی غیرفعال است.</p>
 const target=mode==='assignment'?'assignment':mode==='approval'?'review:'+entry?.id:'report:'+task?.id
 const editorState={...s,busy:s.busy||localBusy,receipt:s.receiptTarget===target?s.receipt:null}
 return <section className="wr-shell we-shell" dir="rtl"><p className="wr-banner">فقط آزمایش با داده مصنوعی؛ هیچ اطلاعات واقعی ثبت نمی‌شود.</p>
 {message&&<p role="status" className="wr-held">{message}</p>}
 {s.uncertain&&<section className="we-recovery" role="alert"><strong>نتیجه نامشخص؛ عملیات جدید متوقف است.</strong><p>{s.canReplay?'فقط همان درخواست با همان شناسه قابل بازیابی است.':'این عملیات نیازمند بررسی مستقل وضعیت است؛ ارسال مجدد غیرفعال است.'}</p>{s.canReplay&&s.pendingTarget!==target&&<p>برای بازیابی به همان فرم قبلی بازگردید.</p>}{s.canReplay&&s.pendingTarget===target&&<button type="button" disabled={s.busy||localBusy} onClick={()=>run(()=>session.replay())}>بازیابی همان درخواست</button>}</section>}
 {role==='manager'&&mode==='assignment'?<Assignment scope={scope} s={editorState} session={session} run={run} setMessage={setMessage} newId={newId}/>:role==='manager'&&mode==='approval'?<Approval task={task} entry={entry} s={editorState} session={session} run={run} setMessage={setMessage}/>:role==='worker'&&mode==='report'?<Report task={task} s={editorState} session={session} run={run} setMessage={setMessage} newId={newId}/>:<p role="alert">مسیر معتبر نیست.</p>}</section>
}
