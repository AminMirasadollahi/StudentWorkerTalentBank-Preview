import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createElement,act} from 'react'
import {createServer} from 'vite'

// Fully synthetic auth/session/RPCs. NOT production, not an authenticated smoke.
// The feature flag is ON ONLY in this isolated test process; production default OFF.
const previousManagerFlag=process.env.VITE_SWTB22_MANAGER_SHELL_UI
const previousFallbackFlag=process.env.VITE_SWTB17_MANAGER_V3_IDENTITY_FALLBACK
process.env.VITE_SWTB22_MANAGER_SHELL_UI='true'
process.env.VITE_SWTB17_MANAGER_V3_IDENTITY_FALLBACK='true'
let dom,server,App,createRoot
const listeners=new Set()
const original={id:'FAKE_APP_1',worker_id:'FAKE_WORKER_1',full_name:'نام اولیه ساختگی',
  major:'رشته اولیه ساختگی',worker_state:'active',interview_status:'approved',
  clearance_status:'cleared',primary_unit:'library',entry_year:1404}
const current={id:'FAKE_WORKER_1',application_id:'FAKE_APP_1',
  name:'نام تأییدشده ساختگی',major:'رشته تأییدشده ساختگی'}
const reset=()=>{
 globalThis.__identity17Rows=[original]
 globalThis.__identity17WorkerSnapshot={
  workers:[current],
  tasks:[{title:'SENSITIVE_TASK_SENTINEL'}],
  time_entries:[{worker_note:'SENSITIVE_TIME_SENTINEL'}],
 }
 globalThis.__identity17RPCs=[]
 globalThis.__identity17ManagerDenied=false
 globalThis.__identity17CandidateDenied=false
 globalThis.__identity17ManagerResponder=null
}
const mock={
 name:'swtb17-manager-identity-offline-only',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/OpsApp.jsx')&&source==='./lib/operations')
   return '\0swtb17-mock-auth'
  if(importer?.endsWith('/src/OpsApp.jsx')&&source==='./OperationsWorkspace')
   return '\0swtb17-mock-work'
  if(importer?.endsWith('/src/OpsApp.jsx')&&source==='./ReportApp')
   return '\0swtb17-mock-report'
 },
 load(id){
  if(id==='\0swtb17-mock-auth')return [
   'export const opsClient={auth:{',
   ' onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},',
   ' getSession:async()=>({data:{session:null},error:null}),',
   ' updateUser:async()=>({error:null}),',
   ' resetPasswordForEmail:async()=>({error:null})},',
   ' rpc:async name=>{globalThis.__identity17RPCs.push(name);',
   ' if(name!=="ops_get_operations_v3")throw Error("UNEXPECTED_RPC");',
   ' if(globalThis.__identity17ManagerResponder)return globalThis.__identity17ManagerResponder();',
   ' return globalThis.__identity17ManagerDenied?',
   '  {data:null,error:Error("MANAGER_READ_DENIED")}:',
   '  {data:globalThis.__identity17WorkerSnapshot,error:null};},',
   ' functions:{invoke:async()=>{throw Error("NO_WRITE")}}};',
   'export const currentOperationsIdentity=async()=>({role:"admin",user:{id:"FAKE_ADMIN"}});',
   'export const getOperationsCandidates=async()=>{',
   ' if(globalThis.__identity17CandidateDenied)throw Error("CANDIDATE_READ_DENIED");',
   ' return globalThis.__identity17Rows;};',
   'export const provisionWorker=async()=>{throw Error("NO_WRITE")};',
   'export const setCandidateScreening=async()=>{throw Error("NO_WRITE")};',
   'export const setCandidateEmail=async()=>{throw Error("NO_WRITE")};',
   'export const signInOperations=async()=>({});',
   'export const signOutOperations=async()=>{};',
  ].join('\n')
  if(id==='\0swtb17-mock-work')return [
   'import React from "react";',
   'export function AdminOperations(){return React.createElement("div",null,"FAKE_WORK")}',
   'export function WorkerOperations(){return React.createElement("div",null,"FAKE_WORKER")}',
  ].join('\n')
  if(id==='\0swtb17-mock-report')return [
   'import React from "react";',
   'export default function ReportApp(){return React.createElement("div",null,"FAKE_REPORT")}',
  ].join('\n')
 }
}
before(async()=>{
 reset()
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://fixture.invalid/manager',pretendToBeVisual:true,
 })
 globalThis.window=dom.window;globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
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
 if(previousManagerFlag===undefined)delete process.env.VITE_SWTB22_MANAGER_SHELL_UI
 else process.env.VITE_SWTB22_MANAGER_SHELL_UI=previousManagerFlag
 if(previousFallbackFlag===undefined)delete process.env.VITE_SWTB17_MANAGER_V3_IDENTITY_FALLBACK
 else process.env.VITE_SWTB17_MANAGER_V3_IDENTITY_FALLBACK=previousFallbackFlag
 for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
  '__identity17Rows','__identity17WorkerSnapshot','__identity17RPCs',
  '__identity17ManagerDenied','__identity17CandidateDenied',
  '__identity17ManagerResponder'])delete globalThis[k]
})
async function mountCandidates(){
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 await act(async()=>root.render(createElement(App,{mode:'admin'})))
 const tab=host.querySelector('[data-swtb22-route="applicants"]')
 assert.ok(tab,'manager applicant route exists in fake admin session')
 await act(async()=>{tab.click();await Promise.resolve()})
 return {host,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const managerCalls=()=>globalThis.__identity17RPCs.filter(x=>x==='ops_get_operations_v3').length
test('flag ON: approved current identity rendered; historical identity preserved in inspector',async()=>{
 reset()
 const ui=await mountCandidates()
 try{
  const row=ui.host.querySelector('.swtb22-candidate-row')
  assert.ok(row)
  assert.match(row.textContent,/نام تأییدشده ساختگی/)
  assert.match(row.textContent,/رشته تأییدشده ساختگی/)
  assert.doesNotMatch(row.textContent,/نام اولیه ساختگی/)
  assert.equal(managerCalls(),1)
  await act(async()=>row.click())
  assert.match(ui.host.textContent,/نام هنگام ثبت‌نام: نام اولیه ساختگی/)
  assert.match(ui.host.textContent,/رشته هنگام ثبت‌نام: رشته اولیه ساختگی/)
  assert.doesNotMatch(ui.host.textContent,/SENSITIVE_(TASK|TIME)_SENTINEL/)
 }finally{await ui.cleanup()}
})
test('flag ON: new backend effective fields skip redundant manager RPC',async()=>{
 reset()
 globalThis.__identity17Rows=[{...original,
  worker_effective_full_name:'نام از RPC جدید ساختگی',
  worker_effective_major:'رشته از RPC جدید ساختگی'}]
 const ui=await mountCandidates()
 try{
  assert.equal(managerCalls(),0)
  assert.match(ui.host.textContent,/نام از RPC جدید ساختگی/)
 }finally{await ui.cleanup()}
})
test('flag ON: unlinked applicants do not trigger manager aggregate',async()=>{
 reset()
 globalThis.__identity17Rows=[{...original,worker_id:null}]
 const ui=await mountCandidates()
 try{
  assert.equal(managerCalls(),0)
  assert.match(ui.host.textContent,/نام اولیه ساختگی/)
 }finally{await ui.cleanup()}
})
test('flag ON: manager RPC denial never displays historic candidate list',async()=>{
 reset();globalThis.__identity17ManagerDenied=true
 const ui=await mountCandidates()
 try{
  assert.equal(managerCalls(),1)
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0)
  assert.match(ui.host.textContent,/پرونده‌های قبلی نمایش داده نمی‌شوند/)
 }finally{await ui.cleanup()}
})
test('flag ON: mismatched worker application fails closed',async()=>{
 reset()
 globalThis.__identity17WorkerSnapshot={workers:[{...current,application_id:'WRONG_APP'}]}
 const ui=await mountCandidates()
 try{
  assert.equal(managerCalls(),1)
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0)
  assert.match(ui.host.textContent,/پرونده‌های قبلی نمایش داده نمی‌شوند/)
 }finally{await ui.cleanup()}
})
test('flag ON: candidate RPC denial skips manager data and fails closed',async()=>{
 reset();globalThis.__identity17CandidateDenied=true
 const ui=await mountCandidates()
 try{
  assert.equal(managerCalls(),0)
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0)
  assert.match(ui.host.textContent,/پرونده‌های قبلی نمایش داده نمی‌شوند/)
 }finally{await ui.cleanup()}
})

test('stale successful manager reply cannot repopulate candidates after a newer denial',async()=>{
 reset()
 const ui=await mountCandidates()
 let finishOld=null
 try{
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,1)
  globalThis.__identity17ManagerResponder=()=>new Promise(resolve=>{finishOld=resolve})
  await act(async()=>{
   const refresh=[...ui.host.querySelectorAll('button')].find(b=>b.textContent==='به‌روزرسانی')
   assert.ok(refresh)
   refresh.click()
   await Promise.resolve();await Promise.resolve()
  })
  assert.equal(typeof finishOld,'function','older manager read is still pending')
  globalThis.__identity17ManagerResponder=null
  globalThis.__identity17ManagerDenied=true
  const route=id=>ui.host.querySelector('[data-swtb22-route="'+id+'"]')
  await act(async()=>{route('tasks').click();await Promise.resolve()})
  await act(async()=>{route('applicants').click();await Promise.resolve()})
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0)
  assert.match(ui.host.textContent,/پرونده‌های قبلی نمایش داده نمی‌شوند/)
  await act(async()=>{
   finishOld({data:globalThis.__identity17WorkerSnapshot,error:null})
   await Promise.resolve();await Promise.resolve()
  })
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0,
   'older success must never override the newer authorization denial')
  assert.match(ui.host.textContent,/پرونده‌های قبلی نمایش داده نمی‌شوند/)
 }finally{
  if(finishOld)finishOld({data:globalThis.__identity17WorkerSnapshot,error:null})
  globalThis.__identity17ManagerResponder=null
  globalThis.__identity17ManagerDenied=false
  await ui.cleanup()
 }
})

test('pending manager revalidation hides prior candidate directory and inspector until a fresh success',async()=>{
 reset()
 const ui=await mountCandidates()
 let resolvePending=null
 try{
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,1)
  await act(async()=>ui.host.querySelector('.swtb22-candidate-row').click())
  assert.ok(ui.host.querySelector('.ops-candidate'),'the previous inspector was visible')
  globalThis.__identity17ManagerResponder=()=>new Promise(resolve=>{resolvePending=resolve})
  await act(async()=>{
   const refresh=[...ui.host.querySelectorAll('button')].find(b=>b.textContent==='به‌روزرسانی')
   assert.ok(refresh)
   refresh.click()
   await Promise.resolve();await Promise.resolve()
  })
  assert.equal(typeof resolvePending,'function','manager authorization is pending')
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0,
   'previous candidate identities must be concealed during revalidation')
  assert.equal(ui.host.querySelector('.ops-candidate'),null,
   'prior detailed candidate record must be concealed during revalidation')
  assert.match(ui.host.textContent,/در حال دریافت پرونده‌ها/)
  await act(async()=>{
   resolvePending({data:globalThis.__identity17WorkerSnapshot,error:null})
   await Promise.resolve();await Promise.resolve()
  })
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,1,
   'only the completed fresh authorized read can show candidates again')
 }finally{
  if(resolvePending)resolvePending({data:globalThis.__identity17WorkerSnapshot,error:null})
  globalThis.__identity17ManagerResponder=null
  await ui.cleanup()
 }
})
