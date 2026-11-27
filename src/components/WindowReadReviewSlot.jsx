import {useEffect,useState,useSyncExternalStore,useRef} from 'react'
import {windowReadReviewScope} from '../lib/windowReadReviewPort.mjs'
import WindowReadReview from './WindowReadReview.jsx'
import WindowEditorReview from './WindowEditorReview.jsx'
import WindowTermReview from './WindowTermReview.jsx'
import {buildReviewAssignmentScope} from '../lib/windowTermReview.mjs'
import {managerWindowHistoryV2} from '../lib/managerWindowReadV2.mjs'
import {workerWindowReviewModel} from '../lib/windowReviewPresentation.mjs'
const noSubscribe=()=>()=>{}
const zero=()=>0
function Editors({scope,section,snapshot,editor,assignmentScope}){
 const session=editor.session
 useSyncExternalStore(session.subscribe,session.getVersion,session.getVersion)
 const ss=session.state(),role=scope.context.role
 const [selected,setSelected]=useState('')
 const [open,setOpen]=useState(false)
 const common={session,role,newId:editor.newId,syntheticReviewOnly:true}
 const matches=ss.pendingTarget||ss.receiptTarget
 if(role==='manager'&&section==='tasks'){
  const term=assignmentScope?.term
  if(!term)return <p role="alert">دامنه واگذاری آزمایشی معتبر نیست.</p>
  return <WindowEditorReview key={'assignment:'+term.id} {...common} mode="assignment" scope={assignmentScope}/>
 }
 if(role==='manager'&&['inbox','approvals'].includes(section)){
  const pairs=snapshot.time_entries.flatMap(e=>{const t=snapshot.tasks.find(t=>t.id===e.task_id&&t.worker_id===e.worker_id&&t.schedule_kind==='single_report_window');return t&&(e.review_state==='submitted'&&t.state==='submitted'||matches==='review:'+e.id)?[{task:t,entry:e}]:[]})
  const pair=pairs.find(x=>x.entry.id===selected)||pairs.find(x=>'review:'+x.entry.id===matches)||pairs[0]
  return <section className="wr-shell" dir="rtl"><h2>رسیدگی به گزارش‌های بازه‌ای</h2>{pairs.length?<><label>گزارش<select aria-label="گزارش برای رسیدگی" value={pair.entry.id} disabled={ss.busy||ss.uncertain} onChange={e=>setSelected(e.target.value)}>{pairs.map(x=><option key={x.entry.id} value={x.entry.id}>{x.task.title}</option>)}</select></label><WindowEditorReview key={'review:'+pair.entry.id+':'+pair.task.window_revision} {...common} mode="approval" task={pair.task} entry={pair.entry}/></>:<p>گزارش بازه‌ای قابل رسیدگی در فهرست بارگذاری‌شده وجود ندارد.</p>}</section>
 }
 if(role==='worker'&&section==='tasks'){
  const tasks=snapshot.tasks.filter(t=>t.schedule_kind==='single_report_window'&&(t.window_actions?.can_submit===true||matches==='report:'+t.id))
  const task=tasks.find(t=>t.id===selected)||tasks.find(t=>'report:'+t.id===matches)||tasks[0]
  return <><WindowReadReview role="worker" workerId={scope.context.workerId} snapshot={snapshot} syntheticReviewOnly section="tasks" embedded/>
  {task&&<section className="wr-shell" dir="rtl"><button type="button" aria-expanded={open||!!ss.uncertain||!!ss.receiptTarget} onClick={()=>setOpen(v=>!v)}>فرم فعالیت بازه‌ای</button>
  {(open||ss.uncertain||ss.receiptTarget)&&<><label>وظیفه بازه‌ای<select aria-label="وظیفه برای ثبت گزارش" value={task.id} disabled={ss.busy||ss.uncertain} onChange={e=>setSelected(e.target.value)}>{tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><WindowEditorReview key={'report:'+task.id+':'+task.window_revision} {...common} mode="report" task={task}/></>}</section>}</>
 }
 return null
}
function ScopedRead({scope,section,editor}){
 const [result,setResult]=useState({state:'loading'})
 const [retry,setRetry]=useState(0)
 useEffect(()=>{
  let active=true
  scope.port.read(scope.context).then(async snapshot=>{
   if(scope.context.role==='manager')managerWindowHistoryV2(snapshot,{},{})
   else workerWindowReviewModel(snapshot,scope.context.workerId)
   let termRead=null,assignmentScope=null
   if(scope.context.role==='manager'&&['terms','termMemberships'].includes(section))termRead=await scope.port.term(scope.context)
   if(scope.context.role==='manager'&&section==='tasks'&&editor){
    const metadata=await scope.port.assignmentScope(scope.context)
    assignmentScope=buildReviewAssignmentScope({snapshot,assignmentScope:metadata,actorId:scope.context.actorId})
   }
   if(active)setResult({state:'ready',snapshot,termRead,assignmentScope})
  }).catch(()=>{if(active)setResult({state:'denied'})})
  return()=>{active=false}
 },[scope.port,scope.key,retry])
 if(result.state==='loading')return <p role="status">در حال دریافت اطلاعات معتبر آزمایشی…</p>
 if(result.state!=='ready')return <><p role="alert">دریافت قرارداد معتبر ممکن نشد؛ اطلاعات قبلی نمایش داده نمی‌شود.</p><button type="button" onClick={()=>{setResult({state:'loading'});setRetry(x=>x+1)}}>تلاش مجدد برای دریافت اطلاعات</button></>
 if(scope.context.role==='manager'&&['terms','termMemberships'].includes(section))return <WindowTermReview scope={scope} section={section} snapshot={result.snapshot} initial={result.termRead}/>
 if(editor?.session.state().pendingReceiptV2||editor?.session.state().refreshRequired)return <p role="status">فرم تا تعیین تکلیف درخواست قبلی متوقف است.</p>
 if(editor&&((scope.context.role==='manager'&&['tasks','inbox','approvals'].includes(section))||(scope.context.role==='worker'&&section==='tasks')))return <Editors scope={scope} section={section} snapshot={result.snapshot} editor={editor} assignmentScope={result.assignmentScope}/>
 return <WindowReadReview role={scope.context.role} workerId={scope.context.workerId} snapshot={result.snapshot} syntheticReviewOnly section={section} embedded/>
}
function ReceiptRecovery({session}){
 const s=session.state(),[message,setMessage]=useState(''),lock=useRef(false)
 const run=async fn=>{if(lock.current)return;lock.current=true;try{const r=await fn();setMessage(r.status==='ok'?'پاسخ معتبر دریافت شد.':r.status==='uncertain'?'پاسخ قطعی دریافت نشد.':'بازخوانی یا بازیابی هنوز کامل نشده است.')}finally{lock.current=false}}
 useEffect(()=>{if((session.state().pendingReceiptV2||session.state().refreshRequired)&&!session.state().ready&&!session.state().busy)void session.connect()},[session])
 return <section className="wr-shell" dir="rtl" aria-label="بازیابی تراکنش">
 {s.pendingReceiptV2&&<><p role="alert">نتیجه نامشخص؛ عملیات جدید متوقف است.</p><button type="button" disabled={s.busy||!s.canReplay} onClick={()=>run(()=>session.replay())}>بازیابی همان درخواست تراکنشی</button></>}
 {s.refreshRequired&&<><p role="status">رسید تاریخی معتبر است؛ تا بازخوانی وضعیت فعلی عملیات جدید متوقف است.</p><button type="button" disabled={s.busy||!s.ready} onClick={()=>run(()=>session.refreshReceipt())}>بازخوانی وضعیت پس از رسید</button></>}
 {s.historicalReceipt&&<p className="wr-meta">رسید عملیات قبلی دریافت شده است؛ وضعیت فعلی فقط از بازخوانی معتبر مشخص می‌شود.</p>}
 {message&&<p role="status">{message}</p>}</section>
}
export default function WindowReadReviewSlot({request,role,workerId=null,refreshRevision=0,section}){
 const scope=windowReadReviewScope(request,role,workerId,refreshRevision)
 const editor=request?.editor??null
 const s=editor?.session
 // Subscribe to confirmation even if the editor was not visible during completion.
 const mutationRevision=useSyncExternalStore(s?.subscribe??noSubscribe,s?.getReadVersion??zero,s?.getReadVersion??zero)
 useSyncExternalStore(s?.subscribe??noSubscribe,s?.getVersion??zero,s?.getVersion??zero)
 if(!scope||editor&&(!s?.scopeMatches?.(scope.context)||typeof editor.newId!=='function'))return <p role="alert">مجوز نمای آزمایشی تأیید نشده است.</p>
 const ss=s?.state()
 return <>{ss?.receiptV2&&(ss.pendingReceiptV2||ss.refreshRequired||ss.historicalReceipt)&&<ReceiptRecovery key={scope.key} session={s}/>}
 <ScopedRead key={scope.key+':'+section+':'+mutationRevision} scope={scope} section={section} editor={editor}/></>
}
