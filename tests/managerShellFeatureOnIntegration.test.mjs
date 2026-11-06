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
   'export const getOperationsCandidates=async()=>[];',
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
   '__swtb22Identity','__swtb22Listeners'])delete globalThis[x]
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
