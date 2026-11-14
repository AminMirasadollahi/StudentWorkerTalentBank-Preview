import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

// Purely synthetic. Intercept ALL new presence RPCs; no live network/Auth.
const plugin={
 name:'swtb18-presence-no-network',
 enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/PresenceChangePanels.jsx')
    &&source==='../lib/presenceChangesApi.js')return '\0swtb18-qa-presence'
 },
 load(id){
  if(id!=='\0swtb18-qa-presence')return
  return [
   'export const listPresenceChanges=async (workerId,pendingOnly)=>{',
   ' const q=globalThis.__swtb18qa;',
   ' if(q.failRead)throw Error("SYNTHETIC_READ_DENIED");',
   ' return {ok:true,scope:q.scope,items:q.items.filter(x=>(q.ignoreWorkerFilter||!workerId||x.worker_id===workerId)&&(!pendingOnly||x.status==="pending"))};',
   '};',
   'export const cancelPresenceChange=async id=>{',
   ' const q=globalThis.__swtb18qa;q.cancelCalls.push(id);',
   ' q.items=q.items.map(x=>x.id===id?{...x,status:"cancelled"}:x);',
   ' if(q.lostCancelReply)throw Error("SYNTHETIC_LOST_RESPONSE");',
   ' return {ok:true,request_id:id,status:"cancelled"};',
   '};',
   'export const reviewPresenceChange=async args=>{',
   ' const q=globalThis.__swtb18qa;q.reviewCalls.push(args);',
   ' q.items=q.items.map(x=>x.id===args.requestId?{...x,status:args.decision==="approve"?"approved":"rejected"}:x);',
   ' return {ok:true,request_id:args.requestId,status:args.decision==="approve"?"approved":"rejected"};',
   '};',
  ].join('\n')
 }
}
let dom,server,createRoot,WorkerPresenceRequests,ManagerPresenceReviewQueue
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'http://example.invalid/swtb18-qa',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 dom.window.confirm=()=>true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({
  plugins:[plugin],optimizeDeps:{noDiscovery:true,include:[]},
  server:{middlewareMode:true},appType:'custom',logLevel:'silent',
 })
 ;({WorkerPresenceRequests,ManagerPresenceReviewQueue}=
   await server.ssrLoadModule('/src/components/PresenceChangePanels.jsx'))
})
after(async()=>{
 await server?.close()
 dom?.window.close()
 for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__swtb18qa'])
   delete globalThis[key]
})
async function mount(Component,props){
 const host=document.createElement('div')
 document.body.appendChild(host)
 const root=createRoot(host)
 await act(async()=>{root.render(createElement(Component,props))})
 await act(async()=>{await Promise.resolve()})
 return {host,unmount:async()=>{
   await act(async()=>root.unmount());host.remove()
 }}
}
const pending={id:'FAKE-PRESENCE-ONE',worker_id:'FAKE-WORKER',
 local_date:'2030-01-01',action:'set_exception',kind:'unavailable',
 status:'pending',reason:'Synthetic change of attendance',
 requested_at:'2026-11-14T05:00:00Z',worker_note:null}
function fake(scope,items=[pending]){
 globalThis.__swtb18qa={scope,items:items.map(x=>({...x})),
  cancelCalls:[],reviewCalls:[],failRead:false,lostCancelReply:false}
}
test('worker pending request is shown separately from effective schedule; cancellation is single RPC',async()=>{
 fake('my_worker')
 const ui=await mount(WorkerPresenceRequests,{workerId:'FAKE-WORKER'})
 try{
   assert.match(ui.host.textContent,/در انتظار تأیید مدیر/)
   assert.match(ui.host.textContent,/برنامه مؤثر را تغییر نمی‌دهد/)
   const cancel=Array.from(ui.host.querySelectorAll('button')).find(b=>/انصراف از درخواست/.test(b.textContent))
   assert.ok(cancel)
   await act(async()=>{cancel.click()})
   assert.deepEqual(globalThis.__swtb18qa.cancelCalls,['FAKE-PRESENCE-ONE'])
   assert.match(ui.host.textContent,/انصراف داده‌شده/)
 }finally{await ui.unmount()}
})
test('cross-worker response fails closed and request details are not rendered',async()=>{
 fake('my_worker',[{...pending,worker_id:'ANOTHER-WORKER',reason:'NEVER_RENDER_PRIVATE_REASON'}])
 // Simulate a BUGGY server response containing an out-of-scope row.
 globalThis.__swtb18qa.ignoreWorkerFilter=true
 const ui=await mount(WorkerPresenceRequests,{workerId:'FAKE-WORKER'})
 try{
  assert.match(ui.host.textContent,/محدوده اطلاعات درخواست‌های حضور معتبر نیست/)
  assert.doesNotMatch(ui.host.textContent,/NEVER_RENDER_PRIVATE_REASON/)
 }finally{await ui.unmount()}
})
test('manager sees the independent queue and can reject without changing work reports',async()=>{
 fake('manager')
 const ui=await mount(ManagerPresenceReviewQueue,{
  workers:[{id:'FAKE-WORKER',name:'دانشجوکار ساختگی'}],
  tasks:[{id:'TASK-FAKE',worker_id:'FAKE-WORKER',planned_date:'2030-01-01'}],
 })
 try{
  assert.match(ui.host.textContent,/دانشجوکار ساختگی/)
  assert.match(ui.host.textContent,/Synthetic change of attendance/)
  assert.match(ui.host.textContent,/۱ کار ثبت‌شده|1 کار ثبت‌شده/)
  const reject=Array.from(ui.host.querySelectorAll('button')).find(b=>/رد درخواست/.test(b.textContent))
  assert.ok(reject)
  await act(async()=>{reject.click()})
  assert.equal(globalThis.__swtb18qa.reviewCalls.length,1)
  assert.equal(globalThis.__swtb18qa.reviewCalls[0].decision,'reject')
  assert.equal(globalThis.__swtb18qa.items[0].status,'rejected')
 }finally{await ui.unmount()}
})
test('manager-only response scope is required; worker payload is not treated as a review queue',async()=>{
 fake('my_worker')
 const ui=await mount(ManagerPresenceReviewQueue,{workers:[],tasks:[]})
 try{
  assert.match(ui.host.textContent,/صف تأیید مدیر قابل دریافت نیست/)
  assert.doesNotMatch(ui.host.textContent,/Synthetic change of attendance/)
  assert.equal(globalThis.__swtb18qa.reviewCalls.length,0)
 }finally{await ui.unmount()}
})
