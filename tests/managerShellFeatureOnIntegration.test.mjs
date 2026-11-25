import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

// A real OpsApp shell, but a fake auth client and wholly fake module projections.
// The manager feature flag is enabled for this test only; the release default stays OFF.
const previousFlag=process.env.VITE_SWTB22_MANAGER_SHELL_UI
process.env.VITE_SWTB22_MANAGER_SHELL_UI='true'
let identity={role:'admin',user:{id:'FAKE_ADMIN',email:'manager@example.invalid'}}
let dom,server,App,createRoot
const listeners=new Set()
const mock={
 name:'swtb22-manager-feature-on-no-network',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/OpsApp.jsx')&&source==='./lib/operations')
   return '\0swtb22-auth'
  if(importer?.endsWith('/src/OpsApp.jsx')&&source==='./OperationsWorkspace')
   return '\0swtb22-workspaces'
  if(importer?.endsWith('/src/OpsApp.jsx')&&source==='./ReportApp')
   return '\0swtb22-report'
 },
 load(id){
  if(id==='\0swtb22-auth')return [
   'export const opsClient={auth:{',
   ' onAuthStateChange(fn){globalThis.__swtb22Listeners.add(fn);',
   ' return {data:{subscription:{unsubscribe(){globalThis.__swtb22Listeners.delete(fn)}}}}},',
   ' getSession:async()=>({data:{session:null},error:null}),',
   ' updateUser:async()=>({error:null}),',
   ' resetPasswordForEmail:async()=>({error:null})},',
   ' functions:{invoke:async()=>{throw Error("NO_REAL_RPC")}}};',
   'export const currentOperationsIdentity=async()=>globalThis.__swtb22Identity();',
   'export const getOperationsCandidates=async()=>{',
   'globalThis.__swtb22CandidateReads++;',
   'if(globalThis.__swtb22CandidateReadDenied)throw Error("READ_DENIED");',
   'return globalThis.__swtb22CandidateRows||[];};',
   'export const provisionWorker=async()=>{throw Error("NO_WRITE")};',
   'export const setCandidateScreening=async()=>{throw Error("NO_WRITE")};',
   'export const setCandidateEmail=async()=>{throw Error("NO_WRITE")};',
   'export const signInOperations=async()=>({});',
   'export const signOutOperations=async()=>{};',
  ].join('\n')
  if(id==='\0swtb22-workspaces')return [
   'import React from "react";',
   'const fixtureOwner=Symbol("synthetic work-pool owner");',
   'export function AdminOperations({navigation,hideSectionTabs,workPoolRouteFence:fence,assignmentReceiptPort:port}){',
   'React.useEffect(()=>{if(port?.beginScopedRead){const settle=port.beginScopedRead("work");settle("ready")}},[port?.readScopeOwner,port?.committedRevision]);',
   'return React.createElement("div",{"data-testid":"manager-stage"},',
   ' "WORK_VIEW="+navigation.workView+";HIDE_TABS="+String(hideSectionTabs),port?.panel,port&&navigation.workView==="tasks"&&React.createElement("button",{disabled:port.snapshot.state!=="idle",onClick:()=>void port.submit({kind:"direct",workerIds:["00000000-0000-4000-8000-000000000010"],unit:"library",title:"Synthetic integration draft",instructions:"Synthetic description",date:"2026-12-01",minutes:60,startMinute:null,endMinute:null,reason:null})},"آماده‌سازی ترکیبی"),fence&&navigation.workView==="workPool"&&React.createElement("button",{onClick:()=>{fence.begin(fixtureOwner,"create");fence.unknown(fixtureOwner)}},"درخواست نامطمئن نمونه"),fence&&React.createElement("button",{onClick:()=>fence.confirmed(fixtureOwner)},"تأیید رسید نمونه"));}',
   'export function WorkerOperations(){return React.createElement("div",',
   '{"data-testid":"worker-stage"},"WORKER_ONLY")}',
  ].join('\n')
  if(id==='\0swtb22-report')return [
   'import React from "react";',
   'export default function ReportApp({adminMode}){return React.createElement("div",',
   '{"data-testid":"candidate-report"},adminMode?"REPORT_ADMIN_ONLY":"REPORT_DENIED")}',
  ].join('\n')
 }
}
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://fixture.invalid/ops',pretendToBeVisual:true,
 })
 globalThis.window=dom.window;globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.__swtb22Identity=()=>identity
 globalThis.__swtb22Listeners=listeners
 globalThis.__swtb22CandidateRows=[]
 globalThis.__swtb22CandidateReads=0
 globalThis.__swtb22CandidateReadDenied=false
 Object.defineProperty(dom.window.document,'visibilityState',{
  configurable:true,get:()=> 'visible',
 })
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[mock],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 App=(await server.ssrLoadModule('/src/OpsApp.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 if(previousFlag===undefined)delete process.env.VITE_SWTB22_MANAGER_SHELL_UI
 else process.env.VITE_SWTB22_MANAGER_SHELL_UI=previousFlag
 for(const x of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
   '__swtb22Identity','__swtb22Listeners',
   '__swtb22CandidateRows','__swtb22CandidateReads',
   '__swtb22CandidateReadDenied'])delete globalThis[x]
})
async function mount(workHubFixture=false,assignmentReceiptFixture=null){
 identity={role:'admin',user:{id:assignmentReceiptFixture?'00000000-0000-4000-8000-000000000001':'FAKE_ADMIN',email:'manager@example.invalid'}}
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 await act(async()=>{root.render(createElement(App,{mode:'admin',workHubFixture,assignmentReceiptFixture}))})
 return {host,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const route=(host,id)=>host.querySelector('[data-swtb22-route="'+id+'"]')
test('flagged-on OpsApp uses one manager sidebar instead of two stacked nav layers',async()=>{
 const ui=await mount()
 try{
  assert.ok(ui.host.querySelector('.swtb22-manager-enabled'),
   'feature flag should activate only this isolated SSR build')
  assert.ok(ui.host.querySelector('.swtb22-manager-sidebar'))
  assert.equal(ui.host.querySelectorAll('nav[aria-label="بخش‌های مدیریت دانشجوکار"]').length,0)
  assert.equal(ui.host.querySelectorAll('nav[aria-label="بخش‌های داشبورد و داوطلبان"]').length,0)
  assert.equal(ui.host.querySelectorAll('nav[aria-label="بخش‌های فضای مدیریت"]').length,1)
  assert.ok(route(ui.host,'workPool'))
  assert.equal(route(ui.host,'inbox').getAttribute('aria-current'),'page',
   'coherent manager shell must start at actionable inbox')
  assert.match(ui.host.querySelector('.report-header h1').textContent,/کارتابل و رسیدگی/)
  assert.match(ui.host.textContent,/WORK_VIEW=inbox;HIDE_TABS=true/)
  await act(async()=>route(ui.host,'workPool').click())
  assert.match(ui.host.textContent,/WORK_VIEW=workPool;HIDE_TABS=true/)
  assert.ok(route(ui.host,'workPool').getAttribute('aria-current')==='page')
  assert.match(ui.host.querySelector('.report-header h1').textContent,/مخزن فرصت‌های کاری/)
  await act(async()=>route(ui.host,'candidateReport').click())
  assert.match(ui.host.textContent,/REPORT_ADMIN_ONLY/)
  assert.ok(!ui.host.querySelector('[data-testid="manager-stage"]'))
  await act(async()=>route(ui.host,'tasks').click())
  assert.match(ui.host.textContent,/WORK_VIEW=tasks;HIDE_TABS=true/)
 }finally{await ui.cleanup()}
})
test('role transition tears down all manager controls and sensitive route UI',async()=>{
 const ui=await mount()
 try{
  assert.ok(ui.host.querySelector('.swtb22-manager-sidebar'))
  identity={role:'worker',user:{id:'FAKE_OTHER'},profile:{
   worker_id:'FAKE-WORKER',name:'دانشجوکار آزمایشی',
   unit:'library',state:'active',onboarding_state:'ready',
  }}
  await act(async()=>{
   window.dispatchEvent(new window.Event('blur'))
   window.dispatchEvent(new window.Event('focus'))
   await Promise.resolve()
  })
  assert.equal(ui.host.querySelector('.swtb22-manager-sidebar'),null)
  assert.equal(route(ui.host,'applicants'),null)
  assert.doesNotMatch(ui.host.textContent,/WORKER_ONLY/)
  assert.match(ui.host.textContent,/نشست مرورگر به حساب دیگری تغییر کرده است/)
  assert.ok(!ui.host.querySelector('[data-testid="manager-stage"]'))
 }finally{await ui.cleanup()}
})

test('same principal role downgrade unmounts manager nav and renders the worker-only view',async()=>{
 const ui=await mount()
 try{
  assert.ok(ui.host.querySelector('.swtb22-manager-sidebar'))
  identity={role:'worker',user:{id:'FAKE_ADMIN'},profile:{
   worker_id:'FAKE-WORKER',name:'دانشجوکار آزمایشی',
   unit:'library',state:'active',onboarding_state:'ready',
  }}
  await act(async()=>{
   window.dispatchEvent(new window.Event('blur'))
   window.dispatchEvent(new window.Event('focus'))
   await Promise.resolve()
  })
  assert.equal(ui.host.querySelector('.swtb22-manager-sidebar'),null)
  assert.match(ui.host.textContent,/WORKER_ONLY/)
 }finally{await ui.cleanup()}
})

test('candidate directory retains unsaved per-person draft and never issues a write merely by navigation',async()=>{
 globalThis.__swtb22CandidateRows=[
  {id:'FAKE_A',full_name:'یاسمن نمونه',major:'علوم',phone:'09123456780',
   entry_year:1404,primary_unit:'library',interview_status:'pending',
   clearance_status:'pending'},
  {id:'FAKE_B',full_name:'علی نمونه',major:'ریاضی',phone:'09123456781',
   entry_year:1403,primary_unit:'research',interview_status:'pending',
   clearance_status:'pending'},
 ]
 const ui=await mount()
 try{
  await act(async()=>{route(ui.host,'applicants').click();await Promise.resolve()})
  assert.equal(globalThis.__swtb22CandidateReads,1)
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,2)
  assert.equal(ui.host.querySelector('.ops-candidate-controls'),null,
   'full onboarding controls should not mount for all list rows')
  await act(async()=>ui.host.querySelectorAll('.swtb22-candidate-row')[0].click())
  assert.ok(ui.host.querySelector('.ops-candidate-controls'))
  assert.equal(ui.host.querySelector('details.ops-candidate-controls'),null,
   'the inspector should show permitted review form directly')
  const interview=ui.host.querySelector('.ops-candidate-controls select')
  assert.equal(interview.value,'pending')
  await act(async()=>{
   interview.value='approved'
   interview.dispatchEvent(new window.Event('change',{bubbles:true}))
  })
  assert.equal(ui.host.querySelector('.ops-candidate-controls select').value,'approved')
  await act(async()=>ui.host.querySelectorAll('.swtb22-candidate-row')[1].click())
  assert.equal(ui.host.querySelector('.ops-candidate-controls select').value,'pending')
  await act(async()=>ui.host.querySelectorAll('.swtb22-candidate-row')[0].click())
  assert.equal(ui.host.querySelector('.ops-candidate-controls select').value,'approved',
   'unsaved draft in candidate A must remain after visiting B')
  assert.match(ui.host.textContent,/بررسی پرونده: یاسمن نمونه/)
 }finally{
  await ui.cleanup()
  globalThis.__swtb22CandidateRows=[]
 }
})
test('candidate read denial wipes old candidate list and inspector instead of showing stale private data',async()=>{
 globalThis.__swtb22CandidateRows=[
  {id:'FAKE_A',full_name:'یاسمن نمونه',major:'علوم',phone:'09123456780',
   entry_year:1404,primary_unit:'library',interview_status:'pending',
   clearance_status:'pending'},
 ]
 const ui=await mount()
 try{
  await act(async()=>{route(ui.host,'applicants').click();await Promise.resolve()})
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,1)
  await act(async()=>ui.host.querySelector('.swtb22-candidate-row').click())
  globalThis.__swtb22CandidateReadDenied=true
  const refresh=[...ui.host.querySelectorAll('button')].find(b=>b.textContent==='به‌روزرسانی')
  await act(async()=>{refresh.click();await Promise.resolve()})
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0)
  assert.equal(ui.host.querySelector('.ops-candidate'),null)
  assert.match(ui.host.textContent,/پرونده‌های قبلی نمایش داده نمی‌شوند/)
 }finally{
  globalThis.__swtb22CandidateReadDenied=false
  globalThis.__swtb22CandidateRows=[]
  await ui.cleanup()
 }
})

test('review-only work hub in real OpsApp uses one canonical parent and existing route content',async()=>{
 const ui=await mount(true)
 const click=async label=>{
  const b=[...ui.host.querySelectorAll('button')].find(x=>x.textContent.trim()===label)
  assert.ok(b,label);await act(async()=>b.click())
 }
 try{
  assert.equal(route(ui.host,'workPool'),null)
  await act(async()=>route(ui.host,'tasks').click())
  assert.equal(ui.host.querySelector('.report-header h1').textContent,'مدیریت کارها')
  assert.match(ui.host.textContent,/WORK_VIEW=tasks;HIDE_TABS=true/)
  assert.equal(ui.host.querySelectorAll('[data-testid="manager-stage"]').length,1)
  assert.equal(ui.host.querySelectorAll('[aria-current="page"]').length,1)
  await click('فرصت‌های قابل انتخاب')
  assert.match(ui.host.textContent,/WORK_VIEW=workPool;HIDE_TABS=true/)
  assert.equal(ui.host.querySelector('.report-header h1').textContent,'مدیریت کارها')
  assert.equal(route(ui.host,'tasks').getAttribute('aria-current'),'page')
  const group=ui.host.querySelector('[aria-label="بخش‌های مدیریت کارها"]')
  assert.equal(group.querySelectorAll('[aria-pressed="true"]').length,1)
  await act(async()=>route(ui.host,'tasks').click())
  assert.match(ui.host.textContent,/WORK_VIEW=workPool/)
  await click('وظایف واگذارشده')
  assert.match(ui.host.textContent,/WORK_VIEW=tasks/)
  await act(async()=>route(ui.host,'applicants').click())
  assert.equal(ui.host.querySelector('[aria-label="بخش‌های مدیریت کارها"]'),null)
  assert.equal(ui.host.querySelector('[data-testid="manager-stage"]'),null)
 }finally{await ui.cleanup()}
})

test('real manager route setter blocks hub tab and sidebar exits until simulated receipt confirmation',async()=>{
 const ui=await mount(true)
 const click=async label=>{
  const b=[...ui.host.querySelectorAll('button')].find(x=>x.textContent.trim()===label)
  assert.ok(b,label);await act(async()=>b.click())
 }
 try{
  await act(async()=>route(ui.host,'tasks').click())
  await click('فرصت‌های قابل انتخاب');await click('درخواست نامطمئن نمونه')
  await click('وظایف واگذارشده')
  assert.match(ui.host.textContent,/WORK_VIEW=workPool/)
  assert.match(ui.host.textContent,/جابه‌جایی فعلاً ممکن نیست/)
  await act(async()=>route(ui.host,'applicants').click())
  assert.match(ui.host.textContent,/WORK_VIEW=workPool/)
  await click('تأیید رسید نمونه');await click('وظایف واگذارشده')
  assert.match(ui.host.textContent,/WORK_VIEW=tasks/)
  assert.doesNotMatch(ui.host.textContent,/جابه‌جایی فعلاً ممکن نیست/)
 }finally{await ui.cleanup()}
})

test('combined real OpsApp keeps V2 receipt owner across hub and candidate routes while pool fence guards its own exits',async()=>{
 let server={ok:true,epoch:0,active:null}
 const calls=[]
 const fixture=Object.freeze({version:2,manualReserve:true,makeId:()=> '00000000-0000-4000-8000-000000000100',
  write:async p=>{
   calls.push(p.p_action)
   const a={request_id:p.p_request_id,kind:p.p_kind,status:'reserved'}
   if(p.p_action==='reserve')server={...server,active:a}
   else server={...server,active:{...a,status:'committed',receipt:{ok:true,request_id:a.request_id,kind:a.kind,result:{id:'00000000-0000-4000-8000-000000000200',state:'assigned',short_notice:false}}}}
   return server
  },
  control:async p=>{
   calls.push(p.p_action)
   if(p.p_action==='acknowledge')server={ok:true,epoch:server.epoch+1,active:null}
   return server
  }})
 const ui=await mount(true,fixture)
 const click=async label=>{
  const b=[...ui.host.querySelectorAll('button')].find(x=>x.textContent.trim()===label)
  assert.ok(b,label);await act(async()=>b.click())
 }
 try{
  await act(async()=>route(ui.host,'tasks').click())
  await click('آماده‌سازی ترکیبی')
  assert.match(ui.host.textContent,/هنوز کاری ثبت نشده/)
  assert.equal(calls.filter(x=>x==='commit').length,0)
  await click('فرصت‌های قابل انتخاب')
  assert.match(ui.host.textContent,/WORK_VIEW=workPool/)
  assert.match(ui.host.textContent,/هنوز کاری ثبت نشده/)
  await click('درخواست نامطمئن نمونه')
  await click('وظایف واگذارشده')
  assert.match(ui.host.textContent,/WORK_VIEW=workPool/)
  assert.match(ui.host.textContent,/جابه‌جایی فعلاً ممکن نیست/)
  await click('تأیید رسید نمونه')
  await act(async()=>route(ui.host,'applicants').click())
  assert.equal(ui.host.querySelector('[data-testid="manager-stage"]'),null)
  assert.match(ui.host.textContent,/هنوز کاری ثبت نشده/)
  await act(async()=>route(ui.host,'tasks').click())
  await click('وظایف واگذارشده')
  await click('ثبت نهایی واگذاری')
  assert.match(ui.host.textContent,/ثبت واگذاری تأیید شد/)
  await click('تأیید و بستن رسید')
  assert.equal(calls.filter(x=>x==='reserve').length,1)
  assert.equal(calls.filter(x=>x==='commit').length,1)
  assert.equal(calls.filter(x=>x==='acknowledge').length,1)
  assert.equal(server.epoch,1)
  assert.equal(ui.host.querySelectorAll('[aria-label="بخش‌های مدیریت کارها"]').length,1)
 }finally{await ui.cleanup()}
})
