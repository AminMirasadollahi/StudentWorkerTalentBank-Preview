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
   'export function AdminOperations({navigation,hideSectionTabs}){',
   'return React.createElement("div",{"data-testid":"manager-stage"},',
   ' "WORK_VIEW="+navigation.workView+";HIDE_TABS="+String(hideSectionTabs));}',
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
async function mount(){
 identity={role:'admin',user:{id:'FAKE_ADMIN',email:'manager@example.invalid'}}
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 await act(async()=>{root.render(createElement(App,{mode:'admin'}))})
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
