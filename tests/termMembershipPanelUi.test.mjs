import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const term={
 id:'FAKE-TERM',label:'نیمسال ساختگی بدون داده واقعی',
 start_date:'2031-01-01',end_date:'2031-05-30',state:'active',
}
const fixture=()=>({
 ok:true,term_id:term.id,term_state:'active',
 enforcement_mode:'observe',active_workers:2,active_without_decision:1,
 active_not_eligible:0,legacy_noneligible_planned_tasks:0,
 workers:[
  {worker_id:'FAKE-A',global_state:'active',eligibility:'unknown',decided_at:null},
  {worker_id:'FAKE-B',global_state:'active',eligibility:'eligible',decided_at:'2031-01-01'},
 ],
})
const fakeApi={
 name:'swtb21b-mount-no-network',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/TermMembershipPanel.jsx')
     &&source==='../lib/operationsV2')return '\0swtb21b-test-api'
 },
 load(id){
  if(id!=='\0swtb21b-test-api')return null
  return [
   'export const getOperationsTermDashboard=async()=>({ok:true,term:globalThis.__t21term,terms:[globalThis.__t21term],units:[],weeks:[],workers:[],pools:[]});',
   'export const getTermAccessOverview=async()=>{if(globalThis.__t21readDenied)throw Error("READ_DENIED");return {...globalThis.__t21state,workers:globalThis.__t21state.workers.map(w=>({...w}))}};',
   'export const setWorkerTermMembership=async a=>{globalThis.__t21writes.push(["decision",a]);if(globalThis.__t21writeDenied)throw Error("DENIED");const w=globalThis.__t21state.workers.find(w=>w.worker_id===a.workerId);if(w.eligibility==="unknown")globalThis.__t21state.active_without_decision--;w.eligibility=a.eligibility;globalThis.__t21state.active_not_eligible=globalThis.__t21state.workers.filter(x=>x.global_state==="active"&&x.eligibility==="not_eligible").length;return {ok:true,eligibility:a.eligibility}};',
   'export const setTermAccessMode=async a=>{globalThis.__t21writes.push(["mode",a]);if(globalThis.__t21state.active_without_decision>0)throw Error("UNREVIEWED");globalThis.__t21state.enforcement_mode=a.mode;return {ok:true,enforcement_mode:a.mode}};',
  ].join('\n')
 },
}
let dom,server,Panel,createRoot
before(async()=>{
 dom=new JSDOM('<html lang="fa"><body></body></html>',{
  url:'http://synthetic.invalid/',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[fakeApi],server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 ;({default:Panel}=await server.ssrLoadModule('/src/components/TermMembershipPanel.jsx'))
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
  '__t21term','__t21state','__t21writes','__t21readDenied','__t21writeDenied'])delete globalThis[key]
})
async function mount(){
 globalThis.__t21term=term
 globalThis.__t21state=fixture()
 globalThis.__t21writes=[]
 globalThis.__t21readDenied=false
 globalThis.__t21writeDenied=false
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 await act(async()=>root.render(createElement(Panel,{
  workers:[{id:'FAKE-A',name:'آزمایش الف'},{id:'FAKE-B',name:'آزمایش ب'}],
 })))
 return {host,teardown:async()=>{
  await act(async()=>root.unmount());host.remove()
 }}
}
const findButton=(pattern,where=document)=>
 [...where.querySelectorAll('button')].find(b=>pattern.test(b.textContent))
const click=async b=>{assert.ok(b,'missing button');await act(async()=>b.click())}
const setValue=async(el,value)=>{
 const prototype=el.tagName==='INPUT'?window.HTMLInputElement.prototype:window.HTMLSelectElement.prototype
 const setter=Object.getOwnPropertyDescriptor(prototype,'value').set
 await act(async()=>{
  setter.call(el,value)
  el.dispatchEvent(new window.Event('input',{bubbles:true}))
  el.dispatchEvent(new window.Event('change',{bubbles:true}))
 })
}
test('initial state is observation-only; no automatic enrollment or write',async()=>{
 const {host,teardown}=await mount()
 try{
  assert.match(host.textContent,/کنترل غیرفعال/)
  assert.match(host.textContent,/تعیین‌تکلیف‌نشده/)
  assert.match(host.textContent,/آزمایش الف/)
  const enable=findButton(/فعال‌سازی کنترل واگذاری/,host)
  assert.ok(enable?.disabled,'gate must block incomplete roster')
  assert.deepEqual(globalThis.__t21writes,[])
 }finally{await teardown()}
})
test('admin decides enrollment then explicitly acknowledges and enables gate',async()=>{
 const {host,teardown}=await mount()
 try{
  await click(findButton(/تعیین وضعیت/,host))
  const dialog=document.querySelector('dialog[open]')
  assert.ok(dialog)
  assert.match(dialog.textContent,/آزمایش الف/)
  await click(findButton(/ثبت تصمیم/,dialog))
  assert.deepEqual(globalThis.__t21writes.map(a=>a[0]),['decision'])
  assert.equal(globalThis.__t21state.active_without_decision,0)
  const enable=findButton(/فعال‌سازی کنترل واگذاری/,host)
  assert.equal(enable?.disabled,false)
  await click(enable)
  const confirmation=document.querySelector('dialog[open]')
  assert.ok(confirmation)
  const submit=findButton(/فعال‌سازی کنترل$/,confirmation)
  assert.equal(submit?.disabled,true)
  const input=confirmation.querySelector('input[type="text"], input:not([type])')
  assert.ok(input)
  await setValue(input,'بررسی تمام حساب‌ها و آغاز کنترل واگذاری')
  const checkbox=confirmation.querySelector('input[type="checkbox"]')
  await act(async()=>{checkbox.click()})
  assert.equal(findButton(/فعال‌سازی کنترل$/,confirmation)?.disabled,false)
  await click(findButton(/فعال‌سازی کنترل$/,confirmation))
  assert.equal(globalThis.__t21state.enforcement_mode,'enforced')
  assert.deepEqual(globalThis.__t21writes.map(a=>a[0]),['decision','mode'])
 }finally{await teardown()}
})
test('failed authorized read hides roster rather than presenting stale state',async()=>{
 const {host,teardown}=await mount()
 try{
  globalThis.__t21readDenied=true
  await click(findButton(/بازخوانی/,host))
  assert.match(host.textContent,/دریافت وضعیت مجوزها تأیید نشد/)
  assert.equal(host.querySelector('.ow-membership-table'),null)
  assert.deepEqual(globalThis.__t21writes,[])
 }finally{await teardown()}
})
