import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const fakeApi={
 name:'swtb12-lifecycle-isolated-no-network',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/WorkerLifecycleManager.jsx')
     &&source==='../lib/operationsV2')return '\0swtb12-lifecycle-stub'
 },
 load(id){
  if(id!=='\0swtb12-lifecycle-stub')return null
  return [
   'export const setWorkerState=async a=>{globalThis.__wlWrites.push(a);if(globalThis.__wlError)throw Error(globalThis.__wlError);return {worker_id:a.workerId,previous_state:a.expectedState,state:a.newState}};',
   'export const getWorkerStateHistory=async id=>{globalThis.__wlReads.push(id);return globalThis.__wlHistory}',
  ].join('\n')
 },
}
let dom,server,Component,createRoot
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://lifecycle-synthetic.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[fakeApi],server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Component=(await server.ssrLoadModule('/src/components/WorkerLifecycleManager.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__wlWrites','__wlReads','__wlError','__wlHistory'])delete globalThis[key]
})
const fakeWorker={id:'FAKE-WORKER-1',name:'دانشجوکار آزمایشی مصنوعی',state:'active'}
async function mount(extra={}){
 globalThis.__wlWrites=[]
 globalThis.__wlReads=[]
 globalThis.__wlError=''
 globalThis.__wlHistory=[{
  id:'FAKE-AUDIT-1',created_at:'2031-01-01T10:00:00Z',
  from_state:'paused',to_state:'active',reason:'بازگشت به همکاری برای آزمون ساختگی',
 }]
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const onChangeState=async args=>{
  globalThis.__wlWrites.push(args)
  if(globalThis.__wlError)throw Error(globalThis.__wlError)
  return {worker_id:args.workerId,previous_state:args.expectedState,state:args.newState}
 }
 const onReadHistory=async id=>{
  globalThis.__wlReads.push(id)
  return globalThis.__wlHistory
 }
 let props={worker:fakeWorker,onDone:async()=>true,onChangeState,onReadHistory,...extra}
 async function render(changes={}){
  props={...props,...changes}
  await act(async()=>root.render(createElement(Component,props)))
 }
 await render()
 return {host,render,dispose:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const button=(ui,label)=>[...ui.host.querySelectorAll('button')]
 .find(b=>b.textContent.trim()===label)
const click=async(b)=>{assert.ok(b);assert.equal(b.disabled,false);await act(async()=>b.click())}
const change=async(el,value)=>{
 assert.ok(el)
 const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
 await act(async()=>{
  setter.call(el,value)
  el.dispatchEvent(new window.Event('input',{bubbles:true}))
  el.dispatchEvent(new window.Event('change',{bubbles:true}))
 })
}
test('manager status panel initially reads only and requires an explicit decision',async()=>{
 const ui=await mount()
 try{
  assert.ok(button(ui,'تعلیق موقت'))
  assert.ok(button(ui,'غیرفعال‌سازی'))
  assert.deepEqual(globalThis.__wlWrites,[])
  assert.deepEqual(globalThis.__wlReads,[])
  await click(button(ui,'تعلیق موقت'))
  assert.ok(button(ui,'تأیید نهایی و ثبت وضعیت').disabled,'reason required')
  await click(button(ui,'انصراف'))
  assert.deepEqual(globalThis.__wlWrites,[],'cancel causes zero writes')
 }finally{await ui.dispose()}
})
test('explicit audited deactivation saves the exact current identity/state once',async()=>{
 const ui=await mount()
 try{
  await click(button(ui,'غیرفعال‌سازی'))
  await change(ui.host.querySelector('textarea'),'پایان دوره آزمون و خروج حساب ساختگی از سامانه')
  await click(button(ui,'تأیید نهایی و ثبت وضعیت'))
  assert.deepEqual(globalThis.__wlWrites,[{
   workerId:'FAKE-WORKER-1',expectedState:'active',newState:'inactive',
   reason:'پایان دوره آزمون و خروج حساب ساختگی از سامانه',
  }])
  assert.match(ui.host.textContent,/سوابق قبلی حفظ شده‌اند/)
 }finally{await ui.dispose()}
})
test('existing inactive worker can resume, but cannot silently suspend',async()=>{
 const ui=await mount({worker:{...fakeWorker,state:'inactive'}})
 try{
  assert.equal(button(ui,'تعلیق موقت'),undefined)
  assert.equal(button(ui,'غیرفعال‌سازی'),undefined)
  await click(button(ui,'فعال‌سازی مجدد'))
  assert.ok(button(ui,'تأیید نهایی و ثبت وضعیت').disabled)
  await change(ui.host.querySelector('textarea'),'بازگشت رسمی به وضعیت فعال پس از بررسی مدیر')
  await click(button(ui,'تأیید نهایی و ثبت وضعیت'))
  assert.equal(globalThis.__wlWrites[0].newState,'active')
  assert.equal(globalThis.__wlWrites[0].expectedState,'inactive')
 }finally{await ui.dispose()}
})
test('stale expected-state race requires refreshing before retry',async()=>{
 const ui=await mount()
 try{
  globalThis.__wlError='worker_state_changed_refresh_required'
  await click(button(ui,'تعلیق موقت'))
  await change(ui.host.querySelector('textarea'),'وقفه موقت در اجرای برنامه همکاری آزمایشی')
  await click(button(ui,'تأیید نهایی و ثبت وضعیت'))
  assert.equal(globalThis.__wlWrites.length,1)
  assert.ok(button(ui,'تعلیق موقت').disabled)
  assert.match(ui.host.textContent,/ابتدا صفحه را بازخوانی کنید/)
 }finally{await ui.dispose()}
})
test('history is lazy, admin-only wrapper and shows audited state changes',async()=>{
 const ui=await mount()
 try{
  assert.deepEqual(globalThis.__wlReads,[])
  const toggle=ui.host.querySelector('details.wl-history')
  await act(async()=>{toggle.open=true;toggle.dispatchEvent(new window.Event('toggle'))})
  assert.deepEqual(globalThis.__wlReads,['FAKE-WORKER-1'])
  assert.match(toggle.textContent,/بازگشت به همکاری برای آزمون ساختگی/)
 }finally{await ui.dispose()}
})
test('manager source uses a real lifecycle component; term permission UI remains independently controlled',()=>{
 const source=readFileSync(new URL('../src/OperationsWorkspace.jsx',import.meta.url),'utf8')
 assert.match(source,/<WorkerLifecycleManager key=\{selected.id\}/)
 assert.doesNotMatch(source,/وضعیت حساب · فقط مشاهده/)
 assert.match(source,/<TermMembershipPanel /)
})
