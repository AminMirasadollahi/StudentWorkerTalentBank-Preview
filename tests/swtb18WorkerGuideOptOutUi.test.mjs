import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createElement,act} from 'react'
import {createServer} from 'vite'

let dom,server,createRoot,WorkerGuideWelcome
let prevShowModal,prevClose

before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
   url:'http://example.invalid/qa',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 const proto=dom.window.HTMLDialogElement.prototype
 prevShowModal=proto.showModal
 prevClose=proto.close
 proto.showModal=function(){this.setAttribute('open','')}
 proto.close=function(){this.removeAttribute('open')}
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 ;({WorkerGuideWelcome}=await server.ssrLoadModule('/src/WorkerGuide.jsx'))
})
after(async()=>{
 await server?.close()
 if(dom){
   const proto=dom.window.HTMLDialogElement.prototype
   if(prevShowModal)proto.showModal=prevShowModal
   else delete proto.showModal
   if(prevClose)proto.close=prevClose
   else delete proto.close
   dom.window.close()
 }
 for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])delete globalThis[k]
})
async function mount(){
 const host=document.createElement('div')
 document.body.appendChild(host)
 const root=createRoot(host)
 const calls=[]
 await act(async()=>root.render(createElement(WorkerGuideWelcome,{
   onBegin:()=>calls.push('begin'),
   onSkip:value=>calls.push(value),
 })))
 const checkbox=host.querySelector('input[type="checkbox"]')
 assert.ok(checkbox,'explicit auto-open opt-out is present')
 assert.match(host.textContent,/همین مرورگر/)
 assert.match(host.textContent,/راهنمای سامانه همیشه در دسترس/)
 const skip=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='فعلاً نه')
 assert.ok(skip)
 const dispose=async()=>{await act(async()=>root.unmount());host.remove()}
 return {host,calls,checkbox,skip,dispose}
}

test('Later without opt-out does not persist a suppression decision',async()=>{
 const ui=await mount()
 try{
   assert.equal(ui.checkbox.checked,false)
   await act(async()=>ui.skip.click())
   assert.deepEqual(ui.calls,[false])
 }finally{await ui.dispose()}
})
test('Explicit opt-out is separately sent on Later, with manual help still described',async()=>{
 const ui=await mount()
 try{
   await act(async()=>ui.checkbox.click())
   assert.equal(ui.checkbox.checked,true)
   await act(async()=>ui.skip.click())
   assert.deepEqual(ui.calls,[true])
 }finally{await ui.dispose()}
})
test('Escape respects opt-out choice and cannot accidentally persist without selection',async()=>{
 const ui=await mount()
 try{
   const dialog=ui.host.querySelector('dialog')
   const cancel1=new window.Event('cancel',{bubbles:false,cancelable:true})
   await act(async()=>dialog.dispatchEvent(cancel1))
   assert.equal(cancel1.defaultPrevented,true)
   assert.deepEqual(ui.calls,[false])
   await act(async()=>ui.checkbox.click())
   const cancel2=new window.Event('cancel',{bubbles:false,cancelable:true})
   await act(async()=>dialog.dispatchEvent(cancel2))
   assert.equal(cancel2.defaultPrevented,true)
   assert.deepEqual(ui.calls,[false,true])
 }finally{await ui.dispose()}
})
test('Start guide uses explicit begin callback and never impersonates a skip',async()=>{
 const ui=await mount()
 try{
   const begin=Array.from(ui.host.querySelectorAll('button')).find(b=>b.textContent==='شروع راهنمای سامانه')
   assert.ok(begin)
   await act(async()=>begin.click())
   assert.deepEqual(ui.calls,['begin'])
 }finally{await ui.dispose()}
})
