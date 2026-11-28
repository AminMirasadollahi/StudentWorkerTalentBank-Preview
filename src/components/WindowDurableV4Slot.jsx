import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {Report,Approval,Assignment} from './WindowEditorReview.jsx'
import WindowReadReview from './WindowReadReview.jsx'
import WindowTermReview from './WindowTermReview.jsx'
import {jalaliWindowDay} from '../lib/windowReviewPresentation.mjs'
import './window-review.css'
import './window-editor-review.css'
const labels={start:'شروع کار',submit:'ثبت گزارش',approve:'تأیید گزارش',cancel:'لغو واگذاری رزروشده',acknowledge:'تأیید دریافت رسید واگذاری'}
const results={ready:'وضعیت جاری بازخوانی شد.',prepared:'درخواست رزرو شد؛ هنوز اجرا نشده است.',ok:'پاسخ معتبر عملیات دریافت شد؛ وضعیت فعلی را بازخوانی کنید.',uncertain:'نتیجه نامشخص است؛ درخواست تازه ارسال نکنید.',blocked:'این عملیات در وضعیت فعلی مجاز نیست.',invalid:'ورودی معتبر نیست.',unavailable:'بازخوانی کامل نشد؛ عملیات تازه متوقف است.',stale:'پاسخ منسوخ نادیده گرفته شد.'}
function GlobalRecovery({s,session,run}){
 const a=s.slot?.active,h=a?.receipt
 return <section className="wr-shell we-shell" dir="rtl" aria-label="بازیابی پایدار عملیات">
 <h2>وضعیت عملیات آزمایشی</h2>
 {!s.ready?<p role="status">قرارداد V4 هنوز تأیید نشده است.</p>:!s.slot?<p role="status">وضعیت درخواست از سرور هنوز مشخص نیست.</p>:!a?<p>درخواستی در صف بازیابی فعال نیست.</p>:<><p><strong>{labels[a.operation]}</strong> · {a.status==='reserved'?'رزروشده؛ اجرا هنوز تأیید نشده':a.status==='committed'?'رسید تاریخی معتبر دریافت شد':'درخواست مسدود شده؛ دیگر از مسیر V4 اجرا نمی‌شود'}</p>
 {s.intentSummary?.title&&<p>{s.intentSummary.title}{s.intentSummary.minutes!==null?' · '+s.intentSummary.minutes+' دقیقه':''}{s.intentSummary.workDate?' · '+jalaliWindowDay(s.intentSummary.workDate):''}</p>}
 {h&&<p className="wr-meta">این رسید تاریخی است؛ {h.operation==='submit'?'ثبت گزارش به معنی تأیید ساعت نیست. ':''}وضعیت فعلی فقط از بازخوانی معتبر مشخص می‌شود.</p>}
 {a.status==='reserved'&&!s.canExecute&&!s.canRetryPrepare&&<p>محتوای دقیق درخواست در این نشست قابل اجرا نیست. پس از بازخوانی، می‌توانید همان رزرو را مسدود کنید.</p>}</>}
 {s.assignmentPending&&<p>درخواست واگذاری در این نشست قفل است؛ {s.assignmentSummary?.title}</p>}
 {s.uncertain&&<p role="alert">نتیجه نامشخص؛ عملیات جدید متوقف است.</p>}
 {s.refreshRequired&&<p>تا بازخوانی معتبر، عملیات جدید فعال نمی‌شود.</p>}
 <div className="we-actions">
 <button type="button" disabled={s.busy} onClick={()=>run(()=>s.ready?session.refresh():session.connect())}>بازخوانی وضعیت عملیات</button>
 {s.canRetryAssignment&&<button type="button" disabled={s.busy} onClick={()=>run(()=>session.retryAssignment())}>بازیابی همان درخواست واگذاری</button>}
 {s.canCommitAssignment&&<button type="button" disabled={s.busy} onClick={()=>run(()=>session.commitAssignment())}>ثبت نهایی واگذاری</button>}
 {s.canRetryPrepare&&<button type="button" disabled={s.busy} onClick={()=>run(()=>session.retryPrepare())}>بازیابی رزرو با محتوای دقیق</button>}
 {s.canExecute&&<button type="button" disabled={s.busy} onClick={()=>run(()=>session.execute())}>اجرای درخواست رزروشده</button>}
 {s.canSeal&&<button type="button" disabled={s.busy} onClick={()=>run(()=>session.seal())}>مسدودسازی درخواست رزروشده</button>}
 {s.canAcknowledge&&<button type="button" disabled={s.busy} onClick={()=>run(()=>session.acknowledge())}>تأیید دریافت نتیجه عملیات</button>}
 </div></section>
}
function BusinessRecovery({s,session,run}){
 const r=s.current?.assignment,a=r?.active
 if(!r)return null
 return <section className="wr-shell" dir="rtl" aria-label="وضعیت واگذاری"><h2>صف واگذاری</h2>
 <p>{!a?'درخواستی در انتظار نیست.':a.status==='reserved'?'واگذاری رزروشده است.':a.status==='committed'?'واگذاری ثبت شده است.':a.status==='cancelled'?'واگذاری لغو شده است.':'صف دیگری فعال است؛ تغییر مجاز نیست.'}</p>
 {a?.kind==='single_report_window_v1'&&a.status==='reserved'&&<button type="button" disabled={!s.canPrepareRecovery} onClick={()=>run(()=>session.prepare('recovery',{p_action:'cancel',p_epoch:r.epoch,p_request_id:a.requestId}))}>آماده‌سازی لغو واگذاری</button>}
 {a?.kind==='single_report_window_v1'&&['committed','cancelled'].includes(a.status)&&<button type="button" disabled={!s.canPrepareRecovery} onClick={()=>run(()=>session.prepare('recovery',{p_action:'acknowledge',p_epoch:r.epoch,p_request_id:a.requestId}))}>آماده‌سازی تأیید رسید واگذاری</button>}
 {a?.receipt&&<p className="wr-meta">زمان استاندارد ثبت‌شده: {a.receipt.standard_minutes} دقیقه · {jalaliWindowDay(a.receipt.window_start)} تا {jalaliWindowDay(a.receipt.window_end)}</p>}
 {a?.status==='reserved'&&!s.assignmentPending&&<p>پیش‌نویس دقیق در این نشست موجود نیست؛ ثبت نهایی مجاز نیست.</p>}
 {!s.assignmentEnabled&&<p className="wr-meta">ایجاد واگذاری در این کاندیدا غیرفعال است.</p>}</section>
}
function Term({scope,section,snapshot}){
 const [initial,setInitial]=useState(null),[failed,setFailed]=useState(false)
 useEffect(()=>{let active=true;scope.port.term(scope.context).then(x=>{if(active)setInitial(x)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[scope.key,scope.port])
 if(failed)return <p role="alert">اطلاعات نیمسال معتبر نیست.</p>
 return initial?<WindowTermReview scope={scope} section={section} snapshot={snapshot} initial={initial}/>:<p role="status">در حال دریافت اطلاعات نیمسال…</p>
}
function Forms({s,session,role,section,run,setMessage}){
 const snapshot=s.current.snapshot,[selected,setSelected]=useState('')
 const perform=async(kind,args)=>{const r=await session.prepare(kind,args);return r.status==='ok'?{...r,status:'prepared'}:r}
 const adapter={durableVersion:4,draft:session.draft,saveDraft:session.saveDraft,perform}
 const formState={busy:s.busy,uncertain:s.uncertain,refreshRequired:!s.canPrepare,ready:s.canPrepare,slot:null,receipt:null}
 if(role==='manager'&&section==='tasks'&&s.assignmentEnabled){
  if(!s.current.assignmentScope)return <p role="alert">دامنه واگذاری معتبر نیست.</p>
  const aState={...formState,ready:s.canReserveAssignment,slot:s.current.assignment,frozenDraft:s.assignmentPending,refreshRequired:!s.canReserveAssignment}
  return <section className="wr-shell we-shell" dir="rtl"><Assignment key={s.current.assignmentScope.term.id} scope={s.current.assignmentScope} s={aState} session={{...adapter,reserveAssignment:session.reserveAssignment}} run={run} setMessage={setMessage} showRecovery={false}/></section>
 }
 if(role==='worker'&&section==='tasks'){
  const tasks=snapshot.tasks.filter(t=>t.schedule_kind==='single_report_window'&&t.window_actions?.can_submit===true)
  const task=tasks.find(t=>t.id===selected)||tasks[0]
  return <>{task&&<section className="wr-shell we-shell" dir="rtl"><label>وظیفه بازه‌ای<select aria-label="وظیفه برای ثبت گزارش" value={task.id} disabled={!s.canPrepare} onChange={e=>setSelected(e.target.value)}>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
 <Report key={task.id+':'+task.window_revision} task={task} s={formState} session={adapter} run={run} setMessage={setMessage}/></section>}</>
 }
 if(role==='manager'&&['inbox','approvals'].includes(section)){
  const pairs=snapshot.time_entries.flatMap(e=>{const t=snapshot.tasks.find(t=>t.id===e.task_id&&t.worker_id===e.worker_id&&t.schedule_kind==='single_report_window'&&t.state==='submitted');return t&&e.review_state==='submitted'?[{task:t,entry:e}]:[]})
  const pair=pairs.find(x=>x.entry.id===selected)||pairs[0]
  const approvalState={...formState,ready:formState.ready&&s.current.assignment?.active===null}
  return <section className="wr-shell we-shell" dir="rtl"><h2>رسیدگی به گزارش‌های بازه‌ای</h2>{pair?<><label>گزارش<select aria-label="گزارش برای رسیدگی" value={pair.entry.id} disabled={!approvalState.ready} onChange={e=>setSelected(e.target.value)}>{pairs.map(x=><option key={x.entry.id} value={x.entry.id}>{x.task.title}</option>)}</select></label>
 <Approval key={pair.entry.id+':'+pair.task.window_revision} task={pair.task} entry={pair.entry} s={approvalState} session={adapter} run={run} setMessage={setMessage}/></>:<p>گزارش بازه‌ای قابل رسیدگی در فهرست بارگذاری‌شده وجود ندارد.</p>}</section>
 }
 return null
}
// The caller retains one branded session per verified principal; section changes
// remount forms but not their in-memory drafts or recovery controller.
export default function WindowDurableV4Slot({scope,section,session}){
 useSyncExternalStore(session.subscribe,session.getVersion,session.getVersion)
 const s=session.state(),[message,setMessage]=useState(''),lock=useRef(false),live=useRef(true)
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 useEffect(()=>{if(!session.state().busy){if(!session.state().ready)void session.connect();else if(session.state().current)void session.refresh()}},[session,scope.key])
 const run=async fn=>{if(lock.current)return {status:'blocked'};lock.current=true;try{const r=await fn();if(live.current)setMessage(results[r.status]||'وضعیت نیازمند بررسی است.');return r}finally{lock.current=false}}
 if(!s.verified||!session.scopeMatches(scope.context))return <p role="alert">مجوز نمای آزمایشی تأیید نشده است.</p>
 const role=scope.context.role
 return <><p className="wr-banner" dir="rtl">V4 · فقط داده مصنوعی؛ بدون ثبت واقعی</p>
 <GlobalRecovery s={s} session={session} run={run}/>
 {message&&<p role="status" className="wr-held">{message}</p>}
 {s.current&&<>{role==='manager'&&<BusinessRecovery s={s} session={session} run={run}/>}
 {role==='manager'&&['terms','termMemberships'].includes(section)?<Term key={scope.key+':'+section} scope={scope} section={section} snapshot={s.current.snapshot}/>:<>
 <Forms key={section} s={s} session={session} role={role} section={section} run={run} setMessage={setMessage}/>
 <WindowReadReview role={role} workerId={scope.context.workerId} snapshot={s.current.snapshot} syntheticReviewOnly section={section} embedded/></>}</>}
 </> 
}
