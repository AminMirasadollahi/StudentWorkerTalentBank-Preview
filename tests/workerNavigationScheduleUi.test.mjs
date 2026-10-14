import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement,useState} from 'react'
import {createServer} from 'vite'
import {readFileSync} from 'node:fs'

const day=()=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',
 }).formatToParts(new Date()).map(x=>[x.type,x.value]))
 return `${p.year}-${p.month}-${p.day}`
}
const worker='FAKE-WORKER-NOT-REAL'
const fixture=()=>({
 tasks:[{id:'FAKE-TASK',worker_id:worker,title:'کار نمونه دانشجوکار',
  planned_date:day(),state:'assigned',estimate_minutes:60,
  instructions:'توضیح ساختگی',created_at:'2026-10-13T08:00:00Z'}],
 weekly_slots:[],exceptions:[],time_entries:[],
})
const plugin={
 name:'worker-focus-ui-fully-isolated',
 enforce:'pre',
 resolveId(source,importer){
    if((importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operationsV2')
      ||(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operationsV2'))
      return '\0qa-v2-no-network'
    if(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operations')
      return '\0qa-worker-no-network'
    
  if(importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operations')
   return '\0qa-worker-no-network'
 },
 load(id){
    if(id==='\0qa-v2-no-network')return [
      'export const getAdminWorkV2=async()=>globalThis.__workerFocusFixture;',
      'export const getMyWorkV2=async()=>{if(globalThis.__workerWorkPlan?.length)return await globalThis.__workerWorkPlan.shift()();if(globalThis.__workerReadDenied)throw Error("worker_access_denied");return globalThis.__workerFocusFixture;};',
      'export const getMyWorkerProfileV2=async()=>({worker_id:"FAKE-WORKER",name:"نمونه غیرواقعی",major:"پژوهش",entry_year:"1405",unit:"library"});',
      'export const getMyProfileChangeRequests=async()=>globalThis.__profileChangeRequests;',
      'export const requestProfileChange=async args=>{globalThis.__profileChangeCalls.push(args);globalThis.__profileChangeRequests.push({id:"FAKE-REQUEST",field_code:args.field,proposed_value:args.value,review_state:"pending"});return {ok:true};};',
      ...['reviewProfileChange','assignGroupTask'].map(name=>
       `export const ${name}=async()=>{throw Error("QA_NO_REAL_BACKEND")};`),
    ].join('\n')
    
  if(id==='\0qa-worker-no-network')return [
    'export const getMyWork=async()=>globalThis.__workerFocusFixture;',
    'export const setWeeklyDay=async(...args)=>{globalThis.__workerFocusCalls.push(args);};',
    'export const setDateException=async(...args)=>{globalThis.__workerExceptionCalls.push(args);};',
    'export const submitMyTime=async args=>{if(!globalThis.__qaAllowWorkerSubmit)throw Error("QA_WRITES_DENIED");globalThis.__qaSubmitCalls.push(args);if(globalThis.__qaSubmitFailCount>0){globalThis.__qaSubmitFailCount--;throw Error("synthetic_submit_failed")}if(globalThis.__qaDenyReadAfterSubmission)globalThis.__workerReadDenied=true;return {ok:true};};',
    'export const startMyTask=async id=>{if(!globalThis.__qaAllowWorkerSubmit)throw Error("QA_WRITES_DENIED");globalThis.__qaStartCalls.push(id);return {ok:true};};',
    ...['getAdminWork','assignWorkerTask','reviewWorkerTime'].map(name=>
      `export const ${name}=async()=>{throw Error("QA_WRITES_DENIED")};`),
  ].join('\n')
 },
}
let dom,server,createRoot,WorkerOperations
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'http://example.invalid/qa',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.__workerFocusFixture=fixture()
 globalThis.__workerFocusCalls=[]
 globalThis.__workerExceptionCalls=[]
 globalThis.__profileChangeCalls=[]
 globalThis.__profileChangeRequests=[]
 globalThis.__workerReadDenied=false
 globalThis.__workerWorkPlan=[]
 globalThis.__qaAllowWorkerSubmit=false
 globalThis.__qaSubmitFailCount=0
 globalThis.__qaSubmitCalls=[]
 globalThis.__qaStartCalls=[]
 globalThis.__qaDenyReadAfterSubmission=false
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[plugin],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 ;({WorkerOperations}=await server.ssrLoadModule('/src/OperationsWorkspace.jsx'))
})
after(async()=>{
 await server?.close()
 dom?.window.close()
 for(const p of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
  '__workerFocusFixture','__workerFocusCalls','__workerExceptionCalls',
  '__profileChangeCalls','__profileChangeRequests','__workerReadDenied',
  '__workerWorkPlan','__qaAllowWorkerSubmit','__qaSubmitFailCount',
  '__qaSubmitCalls','__qaStartCalls','__qaDenyReadAfterSubmission'])delete globalThis[p]
})
function Harness(){
 const [nav,setNav]=useState({section:'tasks',taskRange:'today'})
 const [visible,setVisible]=useState(true)
 return createElement('div',{},[
  createElement('button',{key:'toggle','data-testid':'resume',onClick:()=>setVisible(x=>!x)},'recheck'),
  visible?createElement(WorkerOperations,{key:'worker',profile:{worker_id:worker},
   navigation:nav,setNavigation:setNav}):null,
 ])
}
async function setup(){
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 await act(async()=>root.render(createElement(Harness)))
 const click=async(selector)=>{
  const button=host.querySelector(selector)
  assert.ok(button,`missing ${selector}`)
  await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
 }
 const clickText=async(label)=>{
  const button=Array.from(host.querySelectorAll('button')).find(x=>x.textContent.trim()===label)
  assert.ok(button,`missing button ${label}`)
  await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
 }
 const dispose=async()=>{await act(async()=>root.unmount());host.remove()}
 return {host,click,clickText,dispose}
}
test('one worker tasks tab, range choices and safely preserved selection after unmount/resume',async()=>{
 const ui=await setup()
 try{
  assert.equal(ui.host.querySelectorAll('.ow-tabs button').length,3)
  assert.ok(ui.host.querySelector('.ow-range-switch'))
  assert.equal(ui.host.querySelectorAll('.ow-worker-tasks .ow-item').length,1)
  const reports=ui.host.querySelector('.ow-worker-action-detail')
  assert.ok(reports)
  assert.equal(reports.open,false)
  await ui.clickText('این هفته')
  assert.equal(ui.host.querySelector('[aria-pressed="true"]').textContent,'این هفته')
  await ui.click('[data-testid="resume"]')
  assert.equal(ui.host.querySelector('.ow-workspace'),null)
  await ui.click('[data-testid="resume"]')
  assert.equal(ui.host.querySelector('[aria-pressed="true"]').textContent,'این هفته')
  assert.equal(ui.host.querySelectorAll('.ow-tabs button').length,3)
 }finally{await ui.dispose()}
})
test('seven weekday rows render four independent slots and safe per-day single RPC request',async()=>{
 const ui=await setup()
 try{
  await ui.clickText('زمان حضور')
  assert.equal(ui.host.querySelectorAll('.ow-week-row').length,7)
  assert.equal(ui.host.querySelectorAll('.ow-week-slot').length,28)
  assert.equal(ui.host.querySelectorAll('.ow-slot-editor').length,0)
  assert.ok(ui.host.querySelector('.ow-month-grid'),'real monthly view is integrated into presence hub')
  await ui.click('button[aria-label="ویرایش برنامه شنبه نوبت 1"]')
  assert.equal(ui.host.querySelectorAll('.ow-slot-editor').length,1)
  assert.equal(ui.host.querySelectorAll('.ow-week-day-form').length,0)
  await ui.click('button[aria-label="ذخیره همین روز"]')
  assert.equal(globalThis.__workerFocusCalls.length,1)
  const [who,weekday,slots,effective]=globalThis.__workerFocusCalls[0]
  assert.equal(who,worker)
  assert.equal(weekday,6)
  assert.deepEqual(slots,[{start:480,end:540}])
  assert.match(effective,/^\d{4}-\d{2}-\d{2}$/)
 }finally{await ui.dispose()}
})
test('worker exposes This Month and personal profile without permanent password controls',async()=>{
 const ui=await setup()
 try{
  await ui.clickText('این هفته')
  assert.ok(ui.host.querySelector('.ow-range-switch'))
  await ui.clickText('این ماه')
  assert.equal(ui.host.querySelector('[aria-pressed="true"]').textContent,'این ماه')
  await ui.clickText('پروفایل من')
  assert.ok(ui.host.querySelector('.ow-self-profile'))
  assert.ok(ui.host.textContent.includes('سابقه گزارش‌ها و ساعات'))
  assert.equal(ui.host.querySelectorAll('.ow-tabs button').length,3)
 }finally{await ui.dispose()}
})
test('month view edits one dated exception through injected fake RPC only',async()=>{
 const ui=await setup()
 const previousWeeklyCalls=globalThis.__workerFocusCalls.length
 try{
  await ui.clickText('زمان حضور')
  assert.ok(ui.host.querySelector('.ow-month-grid'))
  await ui.click('.ow-month-day.is-today')
  assert.ok(ui.host.querySelector('.ow-exception-inline'))
  await ui.click('.ow-exception-kind label:last-child input')
  await ui.clickText('ذخیره استثنای این تاریخ')
  assert.equal(globalThis.__workerExceptionCalls.length,1)
  const [who,date,kind,windows]=globalThis.__workerExceptionCalls[0]
  assert.equal(who,worker)
  assert.match(date,/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  assert.equal(kind,'unavailable')
  assert.deepEqual(windows,[])
  assert.equal(globalThis.__workerFocusCalls.length,previousWeeklyCalls,
    'date exception must not accidentally invoke weekly schedule writes')
 }finally{await ui.dispose()}
})
test('overdue unfinished task remains actionable when Today is selected',async()=>{
 const old='2026-08-10'
 const extra={id:'FAKE-OVERDUE',worker_id:worker,title:'کار قدیمی ناتمام و نیازمند گزارش',
  planned_date:old,state:'needs_changes',estimate_minutes:60}
 globalThis.__workerFocusFixture=fixture()
 globalThis.__workerFocusFixture.tasks.push(extra)
 const ui=await setup()
 try{
  assert.match(ui.host.textContent,/کار قدیمی ناتمام و نیازمند گزارش/)
  const card=Array.from(ui.host.querySelectorAll('.ow-worker-tasks .ow-item'))
    .find(x=>x.textContent.includes('کار قدیمی ناتمام'))
  assert.ok(card)
  assert.match(card.textContent,/ثبت انجام و گزارش کار/)
 }finally{
  await ui.dispose()
  globalThis.__workerFocusFixture=fixture()
 }
})
test('personal profile change only queues a synthetic manager-reviewed proposal',async()=>{
 const ui=await setup()
 try{
  await ui.clickText('پروفایل من')
  assert.match(ui.host.textContent,/رشته تحصیلی/)
  assert.match(ui.host.textContent,/پژوهش/)
  const summary=ui.host.querySelector('.ow-profile-change > summary')
  assert.ok(summary)
  await act(async()=>summary.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})))
  assert.ok(ui.host.querySelector('.ow-profile-change-form'))
  const fields=ui.host.querySelectorAll('.ow-profile-change-form input,.ow-profile-change-form textarea')
  assert.equal(fields.length,2)
  const setText=async(el,value)=>{
   const setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?
     window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set
   await act(async()=>{setter.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}))})
  }
  await setText(fields[0],'رشته آموزشی آزمایشی')
  await setText(fields[1],'درخواست اصلاح اطلاعات ثبت‌شده به صورت آزمایشی')
  const form=ui.host.querySelector('.ow-profile-change-form')
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(globalThis.__profileChangeCalls.length,1)
  assert.equal(globalThis.__profileChangeCalls[0].field,'major')
  assert.match(ui.host.textContent,/منتظر تأیید/)
  assert.match(ui.host.textContent,/پژوهش/,'approved value must not be silently replaced')
 }finally{await ui.dispose()}
})
test('sources preserve fail-closed auth and critical applicant/protected operational wiring',()=>{
 const app=readFileSync('src/OpsApp.jsx','utf8')
 const ops=readFileSync('src/OperationsWorkspace.jsx','utf8')
 assert.match(app,/setWorkerNavigation\(initialWorkerNavigation\)/)
 assert.match(app,/watchOperationsResume/)
 assert.match(app,/if \(recheckingAccess && identity && !recoveryMode\)/)
 assert.match(app,/navigation=\{workerNavigation\}/)
 assert.match(app,/setSettingsOpen/)
 assert.match(app,/ops-account-settings-panel/)
 assert.doesNotMatch(ops,/WorkerLifecycleControls|VITE_WORKER_LIFECYCLE_ADMIN_ENABLED|ops_set_worker_state/)
 const css=readFileSync('src/operations-workspace.css','utf8')
 assert.match(css,/\.ow-worker-tasks,.ow-worker-history/)
 assert.match(css,/@media\(max-width:600px\)/)
})


test('worker loses stale task data after a failed read and can retry without changing tab selection',async()=>{
 globalThis.__workerReadDenied=false
 const ui=await setup()
 try{
  assert.match(ui.host.textContent,/کار نمونه دانشجوکار/)
  await ui.clickText('زمان حضور')
  await ui.click('button[aria-label="ویرایش برنامه شنبه نوبت 1"]')
  globalThis.__workerReadDenied=true
  await ui.click('button[aria-label="ذخیره همین روز"]')
  assert.ok(ui.host.querySelector('.ow-access-recheck'),'restricted fallback should replace the work UI')
  assert.doesNotMatch(ui.host.textContent,/کار نمونه دانشجوکار/)
  assert.equal(ui.host.querySelector('.ow-week-row'),null)
  globalThis.__workerReadDenied=false
  await ui.clickText('تلاش مجدد برای دریافت اطلاعات')
  assert.equal(ui.host.querySelector('.ow-access-recheck'),null)
  assert.ok(ui.host.querySelector('.ow-week-row'),'selected schedule tab persists after retry')
 }finally{
  globalThis.__workerReadDenied=false
  await ui.dispose()
 }
})

test('an older successful work fetch cannot override a newer denied refresh',async()=>{
 let resolveOld
 globalThis.__workerReadDenied=false
 globalThis.__workerWorkPlan=[
  ()=>new Promise(resolve=>{resolveOld=resolve}),
  ()=>Promise.reject(Error('worker_access_denied')),
 ]
 const ui=await setup()
 try{
  assert.equal(typeof resolveOld,'function','first read is suspended')
  await ui.clickText('زمان حضور')
  await ui.click('button[aria-label="ویرایش برنامه شنبه نوبت 1"]')
  await ui.click('button[aria-label="ذخیره همین روز"]')
  assert.ok(ui.host.querySelector('.ow-access-recheck'),'newer denied read must hide worker data')
  await act(async()=>{resolveOld(fixture())})
  assert.ok(ui.host.querySelector('.ow-access-recheck'),
    'late old success must not re-expose stale work after a newer authorization failure')
  assert.doesNotMatch(ui.host.textContent,/کار نمونه دانشجوکار/)
  await ui.clickText('تلاش مجدد برای دریافت اطلاعات')
  assert.equal(ui.host.querySelector('.ow-access-recheck'),null)
  assert.ok(ui.host.querySelector('.ow-week-row'),'selected schedule section remains after retry')
 }finally{
  globalThis.__workerReadDenied=false
  globalThis.__workerWorkPlan=[]
  if(resolveOld)resolveOld(fixture())
  await ui.dispose()
 }
})

async function submitSyntheticWorkerReport(ui){
 const check=ui.host.querySelector('.ow-worker-action-detail .ow-checkbox input')
 assert.ok(check,'worker completion checkbox')
 await act(async()=>check.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
 const form=ui.host.querySelector('.ow-worker-action-detail form')
 assert.ok(form)
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
}
test('acknowledged worker report cannot be double submitted while task snapshot is stale',async()=>{
 globalThis.__qaAllowWorkerSubmit=true
 globalThis.__qaSubmitCalls=[]
 globalThis.__qaSubmitFailCount=0
 const ui=await setup()
 try{
  await submitSyntheticWorkerReport(ui)
  assert.equal(globalThis.__qaSubmitCalls.length,1)
  const first=globalThis.__qaSubmitCalls[0]
  assert.equal(first.taskId,'FAKE-TASK')
  assert.match(first.clientSubmissionId,/^[0-9a-f-]{36}$/i)
  assert.match(ui.host.textContent,/گزارش در سرور ثبت شد/)
  const btn=ui.host.querySelector('.ow-worker-action-detail button[type="submit"]')
  assert.equal(btn.disabled,true)
  await act(async()=>ui.host.querySelector('.ow-worker-action-detail form')
    .dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(globalThis.__qaSubmitCalls.length,1,'stale assigned task must not create a second report')
 }finally{
  globalThis.__qaAllowWorkerSubmit=false
  globalThis.__qaSubmitCalls=[]
  await ui.dispose()
 }
})
test('definite report RPC rejection keeps the same submission identity on a safe retry',async()=>{
 globalThis.__qaAllowWorkerSubmit=true
 globalThis.__qaSubmitCalls=[]
 globalThis.__qaSubmitFailCount=1
 const ui=await setup()
 try{
  await submitSyntheticWorkerReport(ui)
  assert.equal(globalThis.__qaSubmitCalls.length,1)
  assert.ok(ui.host.querySelector('.ow-worker-tasks .report-alert--error'))
  const btn=ui.host.querySelector('.ow-worker-action-detail button[type="submit"]')
  assert.equal(btn.disabled,false,'actual RPC failure must not silently claim success')
  await act(async()=>ui.host.querySelector('.ow-worker-action-detail form')
    .dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(globalThis.__qaSubmitCalls.length,2)
  assert.equal(globalThis.__qaSubmitCalls[0].clientSubmissionId,
    globalThis.__qaSubmitCalls[1].clientSubmissionId,
    'same idempotency key is reused instead of generating another report identity')
  assert.equal(btn.disabled,true)
 }finally{
  globalThis.__qaAllowWorkerSubmit=false
  globalThis.__qaSubmitFailCount=0
  globalThis.__qaSubmitCalls=[]
  await ui.dispose()
 }
})
test('acknowledged worker report with denied refresh hides old task rather than resubmitting',async()=>{
 globalThis.__qaAllowWorkerSubmit=true
 globalThis.__qaSubmitCalls=[]
 globalThis.__qaDenyReadAfterSubmission=true
 globalThis.__workerReadDenied=false
 const ui=await setup()
 try{
  await submitSyntheticWorkerReport(ui)
  assert.equal(globalThis.__qaSubmitCalls.length,1)
  assert.ok(ui.host.querySelector('.ow-access-recheck'))
  assert.doesNotMatch(ui.host.textContent,/کار نمونه دانشجوکار/)
 }finally{
  globalThis.__qaAllowWorkerSubmit=false
  globalThis.__qaDenyReadAfterSubmission=false
  globalThis.__workerReadDenied=false
  globalThis.__qaSubmitCalls=[]
  await ui.dispose()
 }
})
test('start work is one-shot after acknowledgement yet report can still be submitted',async()=>{
 globalThis.__qaAllowWorkerSubmit=true
 globalThis.__qaStartCalls=[]
 globalThis.__qaSubmitCalls=[]
 const ui=await setup()
 try{
  const start=Array.from(ui.host.querySelectorAll('.ow-worker-action-detail button'))
    .find(el=>el.textContent.trim()==='شروع کار')
  assert.ok(start)
  await act(async()=>{
   start.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))
   start.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))
  })
  assert.equal(globalThis.__qaStartCalls.length,1)
  assert.equal(start.disabled,true)
  await submitSyntheticWorkerReport(ui)
  assert.equal(globalThis.__qaSubmitCalls.length,1,'start acknowledgement must not block report')
 }finally{
  globalThis.__qaAllowWorkerSubmit=false
  globalThis.__qaStartCalls=[]
  globalThis.__qaSubmitCalls=[]
  await ui.dispose()
 }
})
