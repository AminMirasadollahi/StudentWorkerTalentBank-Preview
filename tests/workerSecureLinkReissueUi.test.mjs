import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {JSDOM} from 'jsdom'
import {createElement,act} from 'react'
import {createServer} from 'vite'

let dom,server,createRoot,Component

before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://synthetic.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Component=(await server.ssrLoadModule('/src/components/WorkerSecureLinkReissue.jsx')).default
})

after(async()=>{
 await server?.close()
 dom?.window.close()
 for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])
  delete globalThis[key]
})

async function mount(extra={}){
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 const requests=[]
 let props={
  workerId:'SYNTHETIC_WORKER_A',workerState:'active',saving:false,
  onReissue:id=>{requests.push(id)},
  supportRpc:async()=>({data:{ok:true,phase:'none'},error:null}),...extra,
 }
 async function render(update={}){
  props={...props,...update}
  await act(async()=>root.render(createElement(Component,props)))
 }
 await render()
 return {host,requests,render,cleanup:async()=>{
  await act(async()=>root.unmount())
  host.remove()
 }}
}
function click(ui,label){
 const button=[...ui.host.querySelectorAll('button')].find(b=>b.textContent.trim()===label)
 assert.ok(button,'button exists: '+label)
 assert.equal(button.disabled,false,'button enabled: '+label)
 return act(async()=>{button.click()})
}

test('one click opens warning but does not issue credential; cancellation is harmless',async()=>{
 const ui=await mount()
 try{
  await click(ui,'صدور لینک امن تعیین رمز')
  assert.deepEqual(ui.requests,[])
  const alert=ui.host.querySelector('[role="alert"]')
  assert.ok(alert)
  assert.match(alert.textContent,/تعیین مجدد رمز/)
  assert.match(alert.textContent,/درخواست و آمادگی/)
  await click(ui,'انصراف')
  assert.deepEqual(ui.requests,[])
  assert.equal(ui.host.querySelector('[role="alert"]'),null)
  assert.ok(ui.host.textContent.includes('صدور لینک امن تعیین رمز'))
 }finally{await ui.cleanup()}
})

test('two explicit deliberate clicks issue once for the originally selected worker',async()=>{
 const ui=await mount()
 try{
  await click(ui,'صدور لینک امن تعیین رمز')
  await click(ui,'تأیید و صدور لینک')
  assert.deepEqual(ui.requests,['SYNTHETIC_WORKER_A'])
  assert.equal(ui.host.querySelector('[role="alert"]'),null)
  assert.ok(ui.host.querySelector('button').textContent.includes('صدور لینک امن'))
 }finally{await ui.cleanup()}
})

test('paused or inactive existing accounts never expose a usable reset action',async()=>{
 const ui=await mount({workerState:'paused'})
 try{
  const btn=ui.host.querySelector('button')
  assert.equal(btn.disabled,true)
  await ui.render({workerState:'inactive'})
  assert.equal(ui.host.querySelector('button').disabled,true)
  assert.deepEqual(ui.requests,[])
 }finally{await ui.cleanup()}
})

test('identity or account-status changes invalidate a pending confirmation',async()=>{
 const ui=await mount()
 try{
  await click(ui,'صدور لینک امن تعیین رمز')
  await ui.render({workerId:'SYNTHETIC_WORKER_B'})
  assert.equal(ui.host.querySelector('[role="alert"]'),null)
  assert.deepEqual(ui.requests,[])
  await click(ui,'صدور لینک امن تعیین رمز')
  await ui.render({workerState:'paused'})
  assert.equal(ui.host.querySelector('[role="alert"]'),null)
  assert.deepEqual(ui.requests,[])
  await ui.render({workerState:'active'})
  assert.equal(ui.host.querySelector('[role="alert"]'),null)
  await click(ui,'صدور لینک امن تعیین رمز')
  await click(ui,'تأیید و صدور لینک')
  assert.deepEqual(ui.requests,['SYNTHETIC_WORKER_B'])
 }finally{await ui.cleanup()}
})

test('saving disables the confirmation step and cannot trigger duplicate issue',async()=>{
 const ui=await mount()
 try{
  await click(ui,'صدور لینک امن تعیین رمز')
  await ui.render({saving:true})
  assert.ok([...ui.host.querySelectorAll('button')].every(btn=>btn.disabled))
  assert.deepEqual(ui.requests,[])
  await ui.render({saving:false})
  await click(ui,'تأیید و صدور لینک')
  assert.deepEqual(ui.requests,['SYNTHETIC_WORKER_A'])
 }finally{await ui.cleanup()}
})

test('real manager candidate form uses the gated action, not an unguarded one-click RPC',()=>{
 const source=readFileSync(new URL('../src/OpsApp.jsx',import.meta.url),'utf8')
 const start=source.indexOf('function CandidateCard(')
 const end=source.indexOf('function AdminView(',start)
 const section=source.slice(start,end)
 assert.ok(section.includes('<WorkerSecureLinkReissue'))
 assert.ok(section.includes('onReissue={onReissue}'))
 assert.ok(section.includes('workerState={candidate.worker_state}'))
 assert.doesNotMatch(section,/onClick=\{\(\) => onReissue\(candidate\.worker_id\)\}/)
})

test('reserved support requires confirmation and uses exact support reference',async()=>{
 const calls=[]
 const ui=await mount({supportRpc:async(name,args)=>{
  calls.push([name,args])
  return {data:name==='ops_s01_cancel_reserved'?{ok:true}:{ok:true,phase:calls.length===1?'reserved':'none',support_ref:'synthetic-ref'},error:null}
 }})
 try{
  await click(ui,'بررسی وضعیت راه‌اندازی')
  await click(ui,'لغو رزرو ارسال‌نشده')
  assert.equal(calls.length,1)
  await click(ui,'تأیید لغو رزرو')
  assert.deepEqual(calls[1],['ops_s01_cancel_reserved',{p_worker_id:'SYNTHETIC_WORKER_A',p_support_ref:'synthetic-ref'}])
  assert.equal(calls.length,3)
  assert.match(ui.host.textContent,/رزرو ارسال‌نشده لغو شد/)
 }finally{await ui.cleanup()}
})

test('dispatched or unknown support never enables cancellation or reissue',async()=>{
 for(const phase of ['dispatched','unknown']){
  const ui=await mount({supportRpc:async()=>({data:{ok:true,phase,support_ref:'synthetic-ref'},error:null})})
  try{
   await click(ui,'بررسی وضعیت راه‌اندازی')
   assert.ok(![...ui.host.querySelectorAll('button')].some(b=>b.textContent.includes('لغو رزرو')))
   assert.equal([...ui.host.querySelectorAll('button')].find(b=>b.textContent.includes('صدور لینک امن')).disabled,true)
   assert.deepEqual(ui.requests,[])
  }finally{await ui.cleanup()}
 }
})

test('late support result for old identity or state cannot populate new controls',async()=>{
 for(const update of [{workerId:'SYNTHETIC_WORKER_B'},{workerState:'paused'}]){
  let resolve
  const ui=await mount({supportRpc:()=>new Promise(r=>{resolve=r})})
  try{
   const button=[...ui.host.querySelectorAll('button')].find(b=>b.textContent.includes('بررسی وضعیت'))
   await act(async()=>{button.click()})
   assert.equal(typeof resolve,'function')
   await ui.render(update)
   await act(async()=>{resolve({data:{ok:true,phase:'reserved',support_ref:'old-ref'},error:null})})
   assert.ok(!ui.host.textContent.includes('لغو رزرو ارسال‌نشده'))
   assert.ok(!ui.host.textContent.includes('رزرو هنوز'))
  }finally{await ui.cleanup()}
 }
})
