// Shared mounted owner lifecycle, selected by explicit review or release wrapper.
// Keep owner above editor/route remounts; no default fetch.
import React,{useLayoutEffect,useRef,useState} from 'react'
import {captureDeskCancellationTarget} from '../lib/deskCancellationObservation.mjs'
import {createWorkPoolRouteFence} from '../lib/workPoolRouteFence.mjs'
import {createDayBatchWorkspaceReadGate} from '../lib/dayBatchWorkspaceRead.mjs'
import {ManagerDraftContext,createManagerDraftGuard} from '../lib/managerDraftGuard.mjs'
const denied={state:'checking',canStart:false,canDiscover:false}
const fa=n=>Number(n).toLocaleString('fa-IR')
export default function TypedAssignmentManagerHost({fixture,ownerFactory,portMode,scope='work',workspace=false,checking=false,onLogout,children}){
 const ref=useRef(null),scopeRef=useRef(scope),parentChecking=useRef(checking)
 const [,paint]=useState(0)
 const redraw=i=>{if(ref.current===i)paint(n=>n+1)}
 const active=i=>ref.current===i&&!i.closed
 const finishAck=i=>{
  const ack=i.ack;i.ack=null;i.editorRevision++
  if(ack.owner==='batch'){i.batchRevision++;i.drafts.clearDraft('day-batch')}
  if(ack.owner==='legacy'){i.legacyRevision++;i.drafts.clearDraft('direct-task')}
  if(ack.committed)i.committedRevision++
 }
 const pause=i=>{i.revision++;i.data=null;i.readGate.invalidate();i.verified=false;i.owner.suspend();redraw(i)}
 const reload=async i=>{
  if(!active(i)||!i.verified)return 'blocked'
  const g=++i.revision,route=scopeRef.current
  i.data=null;i.readGate.invalidate();i.owner.selectReadScope(route);redraw(i)
  if(workspace&&route!=='report'){
   i.owner.beginScopedRead(route);i.workspaceReadRevision++;redraw(i);return 'checking'
  }
  if(route==='work'||route==='candidates'){
   const settle=i.owner.beginScopedRead(route)
   try{
    const result=await fixture.read(route)
    if(!active(i)||g!==i.revision)return 'stale'
    if(!result||typeof result!=='object'||route==='work'&&(!result.term?.id||!Array.isArray(result.workers)||!Array.isArray(result.data?.tasks)))throw Error('INVALID_REVIEW_DATA')
    if(!settle('ready'))return 'stale'
    i.data=result
   }catch{if(active(i)&&g===i.revision){settle('failed');redraw(i)}return 'blocked'}
  }
  if(!active(i)||g!==i.revision)return 'stale'
  const out=await i.owner.discover()
  if(!active(i)||g!==i.revision)return 'stale'
  if(i.ack&&out==='idle'){
   finishAck(i);return reload(i)
  }
  redraw(i);return out
 }
 const verify=async i=>{
  if(!active(i)||i.terminal)return false
  pause(i);const g=i.revision
  const ok=await i.owner.check()
  if(!active(i)||g!==i.revision)return false
  i.verified=ok;if(!ok)i.drafts.clearRetained();redraw(i);if(ok)await reload(i)
  return ok
 }
 useLayoutEffect(()=>{
  if(!fixture||typeof ownerFactory!=='function'||!['synthetic-review','typed-release'].includes(portMode)||portMode==='typed-release'&&!workspace||fixture.durableDeskCancel===true&&typeof fixture.readDeskShifts!=='function'||(workspace?(typeof fixture.readTerm!=='function'||typeof fixture.today!=='function'):typeof fixture.read!=='function')||typeof fixture.fetchImpl!=='function'||typeof fixture.auth?.onAuthStateChange!=='function')return
  let i=null,subscription=null,timer=null
  const clear=()=>{if(timer!==null){clearTimeout(timer);timer=null}}
  const isVisible=()=>i!==null&&active(i)&&!parentChecking.current&&document.visibilityState==='visible'&&document.hasFocus()
  const schedule=()=>{clear();if(isVisible()&&!i.terminal)timer=setTimeout(()=>{timer=null;void verify(i)},0)}
  const suspend=()=>{clear();if(i&&active(i))pause(i)}
  const resume=()=>{suspend();schedule()}
  const visibility=()=>{if(document.visibilityState==='hidden')suspend();else resume()}
  try{
   const owner=ownerFactory(fixture,isVisible)
   i={owner,fixture,closed:false,terminal:false,verified:false,revision:0,editorRevision:0,batchRevision:0,legacyRevision:0,committedRevision:0,drafts:createManagerDraftGuard(),readGate:createDayBatchWorkspaceReadGate(),readScopeOwner:Object.freeze({}),workPoolRouteFence:createWorkPoolRouteFence(),workspaceReadRevision:0,data:null,deskReadTicket:null,ack:null,uiBusy:false,schedule,clearSchedule:clear}
   ref.current=i;owner.selectReadScope(scopeRef.current)
   subscription=fixture.auth.onAuthStateChange((event,session)=>{
    if(event==='INITIAL_SESSION'||!active(i))return
    clear();i.revision++;i.data=null;i.readGate.invalidate();i.verified=false
    const retry=owner.authChanged(event,session)
    if(!retry){i.terminal=true;i.drafts.clearRetained()}
    redraw(i);if(retry)schedule()
   }).data.subscription
   window.addEventListener('blur',suspend);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',visibility)
   schedule();redraw(i)
  }catch{if(i){i.closed=true;i.owner.dispose();if(ref.current===i)ref.current=null}}
  return ()=>{clear();if(i){i.closed=true;i.owner.dispose();i.drafts.clearRetained();i.readGate.invalidate();i.data=null;if(ref.current===i)ref.current=null}subscription?.unsubscribe();window.removeEventListener('blur',suspend);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',visibility)}
 },[fixture,workspace,ownerFactory,portMode])
 useLayoutEffect(()=>{
  parentChecking.current=checking;const i=ref.current
  if(!i||!active(i))return
  if(checking){i.clearSchedule();pause(i)}else i.schedule()
 },[checking,fixture,workspace])
 useLayoutEffect(()=>{
  scopeRef.current=scope;const i=ref.current
  if(!i||!active(i))return
  i.owner.selectReadScope(scope)
  if(i.verified)void reload(i)
 },[scope,fixture,workspace])
 const i=ref.current
 // Config/actor changes cannot render an old owner before effect cleanup.
 if(!i||i.fixture!==fixture)return <p role="status">مسیر بررسی در دسترس نیست.</p>
 const s=i.owner.snapshot(),renderRevision=i.revision,renderData=i.data
 const run=async(method,...args)=>{
  if(!active(i)||i.uiBusy||!i.verified||parentChecking.current||checking||i.revision!==renderRevision||scope!==scopeRef.current)return 'blocked'
  const g=i.revision
  if(method==='acknowledge'){
   if(!s.canAcknowledge)return 'blocked'
   i.ack={owner:s.owner,committed:s.state==='committed'}
  }
  i.uiBusy=true
  let out
  try{
   const p=i.owner[method](...args);redraw(i);out=await p
   if(!active(i))return 'stale'
   if(g!==i.revision)return 'stale'
   // A lost ack needs a fresh discovery. Never reset on an unknown result.
   if(method==='acknowledge'&&out==='needs_discovery')out=await i.owner.discover()
   if(!active(i)||g!==i.revision)return 'stale'
   if(i.ack&&out==='idle'){
    finishAck(i);await reload(i)
   }
   return out
  }catch{return 'unknown'}finally{if(active(i)){i.uiBusy=false;redraw(i)}}
 }
 const snap=i.uiBusy?{...denied,state:'busy'}:s
 const allow=Boolean(i.verified&&!checking&&scope==='work'&&i.data&&snap.canStart&&!i.ack)
 // Bind exact current day projection to the current work read; no editor-supplied work.
 const deskLive=()=>active(i)&&i.verified&&!checking&&!parentChecking.current&&scope==='work'&&scopeRef.current==='work'&&i.revision===renderRevision&&i.data===renderData&&document.visibilityState==='visible'&&document.hasFocus()
 const deskWork=workspace?renderData:renderData?.data
 const deskReadReady=Boolean(deskLive()&&Array.isArray(deskWork?.tasks)&&Array.isArray(deskWork?.time_entries))
 const deskRead=async day=>{
  if(!deskReadReady||!deskLive())throw Error('DESK_READ_STALE')
  const ticket={day,revision:renderRevision,value:null};i.deskReadTicket=ticket
  const raw=await fixture.readDeskShifts(day,()=>deskLive()&&i.deskReadTicket===ticket)
  if(!deskLive()||i.deskReadTicket!==ticket||raw?.ok!==true||raw.from!==day||raw.to!==day||!Array.isArray(raw.shifts))throw Error('DESK_READ_INVALID')
  const value=Object.freeze({ok:true,from:day,to:day,shifts:Object.freeze(raw.shifts.map(s=>Object.freeze({id:s?.id,task_id:s?.task_id,worker_id:s?.worker_id,shift_date:s?.shift_date,start_minute:s?.start_minute,end_minute:s?.end_minute,state:s?.state})))})
  ticket.value=value;return value
 }
 const deskContext=value=>deskLive()&&i.deskReadTicket?.revision===renderRevision&&i.deskReadTicket.value===value?{day:i.deskReadTicket.day,shifts:value,work:deskWork}:null
 const deskPort=fixture.durableDeskCancel===true?Object.freeze({mode:portMode,readRevision:renderRevision,readReady:deskReadReady,read:deskRead,canStart:allow&&snap.canStartDeskCancel===true,
  eligible:(shiftId,value)=>{const c=deskContext(value);return Boolean(c&&captureDeskCancellationTarget({shiftId,...c}))},
  submit:(d,value)=>{const c=deskContext(value);return allow&&snap.canStartDeskCancel===true&&c&&captureDeskCancellationTarget({shiftId:d?.shiftId,...c})?run('submitDeskCancel',d,c):Promise.resolve('blocked')}
 }):null
 const legacyPort={deskCancelPort:deskPort,version:3,snapshot:{...snap,state:allow?'idle':snap.state==='idle'?'checking':snap.state},editorRevision:i.legacyRevision,committedRevision:i.committedRevision,syntheticSharedOwner:true,submit:d=>allow&&active(i)&&i.data===renderData?run('submitLegacy',d):Promise.resolve('blocked')}
 const context=workspace?i.readGate.contextFor(i.data):i.data
 const batchPort={mode:portMode,environment:fixture.mode,editorRevision:i.batchRevision,snapshot:{...snap,canStart:allow&&Boolean(context)},submit:(d,c)=>allow&&active(i)&&c===context&&(!workspace||i.readGate.contextFor(i.data)===c)?run('submitBatch',d,c):Promise.resolve('blocked')}
 const button=(label,method,flag)=>snap[flag]&&<button type="button" className="report-btn report-btn--light" onClick={()=>void run(method)}>{label}</button>
 const beginWorkspaceRead=route=>{
  if(!workspace||!active(i)||!i.verified||checking||parentChecking.current||route!==scopeRef.current||!['work','candidates'].includes(route))return Object.assign(()=>false,{isCurrent:()=>false})
  const g=++i.revision,ticket=i.readGate.begin(),settle=i.owner.beginScopedRead(route);i.data=null;redraw(i)
  let done=false
  const live=()=>active(i)&&i.verified&&g===i.revision&&ticket.isCurrent()&&route===scopeRef.current&&!parentChecking.current
  const complete=(state,value)=>{
   if(done||!live())return false
   done=true
   const ok=state==='ready'&&(route==='work'?ticket.acceptWork(value):Array.isArray(value))
   if(!settle(ok?'ready':'failed'))return false
   if(!ok){i.drafts.clearRetained();redraw(i);return false}
   i.data=value;redraw(i)
   void (async()=>{
    const out=await i.owner.discover();if(!live())return
    if(i.ack&&out==='idle'){finishAck(i);await reload(i);return}
    redraw(i)
   })()
   if(route==='work')void (async()=>{
    try{const result=await fixture.readTerm(live);if(live())ticket.acceptTerm(result,fixture.today())}catch{/* batch only remains disabled */}
    if(live())redraw(i)
   })()
   return true
  }
  // Distinguish a superseded read from a current authoritative denial.
  return Object.assign(complete,{isCurrent:live})
 }
 const panel=<section className="swtb30-recovery-panel" dir="rtl" aria-label={workspace?'مالک مشترک واگذاری':undefined} data-state={workspace?snap.state:undefined}>
  {!i.verified&&<><p role="status">{i.terminal?'نشست قبلی پایان یافته است.':'در حال بررسی دسترسی یا دسترسی تأیید نشده است.'}</p>{!i.terminal&&<button type="button" onClick={i.schedule}>بررسی مجدد دسترسی</button>}</>}
  {fixture.mode==='staging-review'&&<p role="status">محیط آزمایشی مستقل؛ این نسخه برای انتشار عمومی نیست.</p>}
  {portMode==='typed-release'&&i.verified&&!checking&&s.releaseCapability==='recover_only'&&<p role="status">ثبت درخواست جدید موقتاً متوقف است. می‌توانید وضعیت درخواست قبلی و رسید آن را بررسی و تعیین تکلیف کنید.</p>}
  {portMode==='typed-release'&&i.verified&&!checking&&!i.uiBusy&&<button type="button" className="report-btn report-btn--light" onClick={i.schedule}>بررسی مجدد آمادگی واگذاری</button>}
  {i.verified&&<section className="swtb30-recovery-content" aria-label="بازیابی مشترک واگذاری" data-recovery-state={snap.state}>
   <p role="status">{snap.state==='idle'?(snap.releaseCapability==='recover_only'?'درخواست فعالی برای بازیابی باقی نمانده است.':'مسیر واگذاری آماده است.'):snap.state==='committed'?(snap.kind==='desk_cancel_v1'?'لغو نوبت و وظیفه مرتبط تأیید شد؛ این رسید تأیید ساعت نیست.':'ثبت واگذاری تأیید شد؛ این رسید تأیید ساعت نیست.'):snap.state==='cancelled'?(snap.kind==='desk_cancel_v1'?'درخواست لغو نوبت کنار گذاشته شد؛ این نتیجه به معنی لغو نوبت نیست.':'لغو درخواست تأیید شد.'):snap.state==='reserved'?(snap.kind==='desk_cancel_v1'?'درخواست لغو نوبت رزرو شده است؛ هنوز لغو نهایی نشده است.':'درخواست رزرو شده است؛ هنوز کاری ثبت نشده است.'):snap.state==='shift_unconfirmed'?'نتیجه لغو شیفت نامشخص است؛ ثبت جدید مسدود است.':'در حال بررسی یا تعیین تکلیف وضعیت عملیات.'}</p>
   {snap.receipt?.kind==='batch_direct_v1'&&<p data-testid="batch-receipt-summary">{fa(snap.receipt.result.pair_count)} تخصیص · {fa(snap.receipt.result.standard_person_minutes)} دقیقه زمان استاندارد</p>}
   {button('بررسی وضعیت درخواست','discover','canDiscover')}
   {button('تکرار آماده‌سازی همان درخواست','retryReserve','canRetryReserve')}
   {button('ثبت نهایی درخواست رزروشده','commit','canCommit')}
   {button(snap.kind==='desk_cancel_v1'?'انصراف از درخواست لغو نوبت':'لغو ایمن درخواست','cancel','canCancel')}
   {button('تأیید و بستن نتیجه','acknowledge','canAcknowledge')}
   {!workspace&&scope!=='report'&&!i.data&&<button type="button" disabled={i.uiBusy} onClick={()=>void reload(i)}>بازخوانی اطلاعات</button>}
  </section>}
 </section>
 if(workspace){
  if(!i.verified||checking)return panel
  const guardedLogout=()=>{
   if(!active(i))return
   i.terminal=true;i.verified=false;i.revision++;i.data=null;i.readGate.invalidate();i.drafts.clearRetained();i.owner.terminate();redraw(i)
   return onLogout?.()
  }
  const scopedRead=(method,ticket)=>fixture[method](()=>active(i)&&i.verified&&!parentChecking.current&&document.visibilityState==='visible'&&document.hasFocus()&&ticket?.isCurrent?.()===true)
  const stageReads=(fixture.mode==='staging-review'||portMode==='typed-release')?{readWork:ticket=>scopedRead('readWork',ticket),readCandidates:ticket=>scopedRead('readCandidates',ticket)}:{}
  const port={...legacyPort,...stageReads,panel,readScopeOwner:i.readScopeOwner,beginScopedRead:beginWorkspaceRead,workspaceReadRevision:i.workspaceReadRevision,managerDraftGuard:i.drafts,workPoolRouteFence:i.workPoolRouteFence,
   batchWorkspace:{mode:portMode,contextFor:data=>active(i)&&i.verified&&!parentChecking.current?i.readGate.contextFor(data):null,port:batchPort}}
  return <ManagerDraftContext.Provider value={i.drafts}>{children({workspacePort:port,draftGuard:i.drafts,guardedLogout})}</ManagerDraftContext.Provider>
 }
 return <section dir="rtl" aria-label="مالک مشترک واگذاری" data-state={snap.state}>{panel}{i.verified&&i.data&&scope==='work'&&!checking&&<ManagerDraftContext.Provider value={i.drafts}>{children({context:i.data,legacyPort,batchPort,editorRevision:i.editorRevision,committedRevision:i.committedRevision})}</ManagerDraftContext.Provider>}</section>
}
