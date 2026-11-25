import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createServer} from 'vite'
let dom,vite,Host,createRoot
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body></body></html>',{url:'https://fixture.invalid',pretendToBeVisual:true})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Host=(await vite.ssrLoadModule('/src/components/AssignmentRecoveryFixtureHost.jsx')).default
})
after(async()=>{await vite?.close();dom?.window.close();for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])delete globalThis[k]})
const h=React.createElement,id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),A=id(1),K=id(100)
const draft={kind:'direct',workerIds:[id(10)],unit:'library',title:'Synthetic private title',instructions:'Synthetic private instructions',date:'2026-12-01',minutes:60,startMinute:null,endMinute:null,reason:null}
const envelope=(epoch=0,active=null)=>({ok:true,epoch,active})
function fixture(manualReserve=true){
 let server=envelope(),mode='',n=100
 const calls=[]
 const transport=Object.freeze({version:2,manualReserve,makeId:()=>id(n++),
  write:async p=>{
   calls.push(p)
   if(p.p_epoch!==server.epoch)throw Error('stale')
   const a={request_id:p.p_request_id,kind:p.p_kind,status:'reserved'}
   if(p.p_action==='reserve')server=envelope(p.p_epoch,a)
   else server=envelope(p.p_epoch,{...a,status:'committed',receipt:{ok:true,request_id:p.p_request_id,kind:p.p_kind,result:{id:id(200),state:'assigned',short_notice:false}}})
   if(mode===p.p_action)throw Error('lost response')
   return server
  },
  control:async p=>{
   calls.push(p)
   if(p.p_action==='cancel'&&server.active.status==='reserved')server=envelope(server.epoch,{...server.active,status:'cancelled'})
   if(p.p_action==='acknowledge')server=envelope(server.epoch+1)
   if(mode===p.p_action)throw Error('lost response')
   return server
  }})
 return {transport,calls,mode:m=>{mode=m},server:()=>server}
}
async function mount(f,options={}){
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 let port
 const paint=(checking=false,actorId=A)=>root.render(h(Host,{actorId,checking,fixture:f.transport},p=>{port=p;return h('main',null,h('button',{disabled:p.snapshot.state!=='idle',onClick:()=>void p.submit(draft)},'آماده‌سازی نمونه'),p.panel,h('span',{'data-revision':p.editorRevision,'data-committed':p.committedRevision}))}))
 await act(async()=>paint())
 const click=async label=>{const b=[...host.querySelectorAll('button')].find(x=>x.textContent===label);assert.ok(b,label);await act(async()=>b.click())}
 return {host,click,port:()=>port,paint:async(...args)=>{await act(async()=>paint(...args))},cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
test('real V2 host requires explicit reserve then commit and acknowledges exactly once',async()=>{
 const f=fixture(),m=await mount(f)
 try{
  assert.equal(m.port().snapshot.state,'idle')
  await m.click('آماده‌سازی نمونه')
  assert.match(m.host.textContent,/هنوز کاری ثبت نشده/)
  assert.equal(f.calls.filter(x=>x.p_action==='commit').length,0)
  await m.click('ثبت نهایی واگذاری');assert.match(m.host.textContent,/ثبت واگذاری تأیید شد/)
  await m.click('تأیید و بستن رسید')
  assert.equal(m.port().snapshot.state,'idle');assert.equal(m.port().editorRevision,1);assert.equal(m.port().committedRevision,1)
  assert.equal(f.calls.filter(x=>x.p_action==='commit').length,1)
 }finally{await m.cleanup()}
})
test('fresh host remount discovers reserved intent without draft and permits only cancellation',async()=>{
 const f=fixture(),a=await mount(f)
 await a.click('آماده‌سازی نمونه');await a.cleanup()
 const b=await mount(f)
 try{
  assert.match(b.host.textContent,/متن اصلی در این نشست در دسترس نیست/)
  assert.equal(b.port().initialPayload,null)
  assert.doesNotMatch(b.host.textContent,/ثبت نهایی واگذاری|Synthetic private/)
  await b.click('لغو ایمن درخواست');await b.click('بستن نتیجه لغو')
  assert.equal(b.port().snapshot.state,'idle');assert.equal(b.port().editorRevision,1);assert.equal(b.port().committedRevision,0)
  assert.equal(f.calls.filter(x=>x.p_action==='commit').length,0)
 }finally{await b.cleanup()}
})
test('lost ack uses advanced epoch read to reset editor and refresh once',async()=>{
 const f=fixture(),m=await mount(f)
 try{
  await m.click('آماده‌سازی نمونه');await m.click('ثبت نهایی واگذاری')
  f.mode('acknowledge');await m.click('تأیید و بستن رسید')
  assert.equal(m.port().snapshot.state,'unknown');assert.equal(m.port().committedRevision,0)
  f.mode('');await m.click('بررسی وضعیت درخواست')
  assert.equal(m.port().snapshot.state,'idle');assert.equal(m.port().committedRevision,1)
 }finally{await m.cleanup()}
})
test('scoped read failure and recheck suppress projection and actions until fresh discover',async()=>{
 const f=fixture(),m=await mount(f)
 try{
  await m.click('آماده‌سازی نمونه')
  await act(async()=>m.port().setReadState('failed'))
  assert.equal(m.port().snapshot.state,'checking');assert.equal(m.port().initialPayload,null)
  assert.doesNotMatch(m.host.textContent,/ثبت نهایی واگذاری/)
  await act(async()=>m.port().setReadState('ready'))
  assert.equal(m.port().snapshot.state,'reserved')
  await m.paint(true)
  assert.equal(m.port().snapshot.state,'checking')
  await m.paint(false)
  assert.equal(m.port().snapshot.state,'reserved')
  assert.equal(f.calls.filter(x=>x.p_action==='commit').length,0)
 }finally{await m.cleanup()}
})

test('normal V2 host submits in one action; receipt still requires explicit acknowledgment',async()=>{
 const f=fixture(false),m=await mount(f)
 try{
  await m.click('آماده‌سازی نمونه')
  assert.match(m.host.textContent,/ثبت واگذاری تأیید شد/)
  assert.doesNotMatch(m.host.textContent,/ثبت نهایی واگذاری/)
  assert.equal(f.calls.filter(x=>x.p_action==='reserve').length,1)
  assert.equal(f.calls.filter(x=>x.p_action==='commit').length,1)
  assert.equal(m.port().committedRevision,0)
  await m.click('تأیید و بستن رسید')
  assert.equal(m.port().committedRevision,1)
 }finally{await m.cleanup()}
})

test('existing shift cancellation locks assignment and duplicate cancellation above editor route',async()=>{
 const base=fixture(false),calls=[]
 let resolve
 const f={...base,transport:{...base.transport,cancelExistingShift:args=>{
  calls.push(args)
  return new Promise(r=>{resolve=r})
 }}}
 const m=await mount(f)
 const args={shiftId:id(301),reason:'synthetic cancellation'}
 let pending
 try{
  assert.equal(m.port().snapshot.state,'idle')
  await act(async()=>{pending=m.port().cancelExistingShift(args)})
  assert.equal(m.port().snapshot.state,'cancelling_shift')
  assert.match(m.host.textContent,/در حال لغو نوبت ثبت‌شده/)
  await assert.rejects(m.port().cancelExistingShift(args),/SHIFT_CANCEL_BLOCKED/)
  assert.equal(await m.port().submit(draft),'blocked')
  assert.equal(base.calls.filter(x=>x.p_action==='reserve').length,0)
  assert.deepEqual(calls,[args])
  await act(async()=>{resolve({ok:true,shift_id:args.shiftId,state:'cancelled'});await pending})
  assert.equal(m.port().snapshot.state,'idle')
  assert.equal(m.port().committedRevision,0,'shift cancellation is not a new assignment receipt')
 }finally{await m.cleanup()}
})
test('existing shift response from before access recheck is unconfirmed, not replayed',async()=>{
 const base=fixture(false),calls=[]
 let resolve,pending
 const f={...base,transport:{...base.transport,cancelExistingShift:args=>{
  calls.push(args)
  return new Promise(r=>{resolve=r})
 }}}
 const m=await mount(f)
 const args={shiftId:id(302),reason:'synthetic cancellation'}
 try{
  await act(async()=>{pending=m.port().cancelExistingShift(args);pending.catch(()=>{})})
  await m.paint(true)
  assert.equal(m.port().snapshot.state,'checking')
  await m.paint(false)
  assert.equal(m.port().snapshot.state,'cancelling_shift')
  await act(async()=>{resolve({ok:true,shift_id:args.shiftId,state:'cancelled'});await assert.rejects(pending,/SHIFT_CANCEL_UNCONFIRMED/)})
  assert.equal(m.port().snapshot.state,'idle')
  assert.equal(calls.length,1)
  assert.equal(m.port().committedRevision,0)
 }finally{await m.cleanup()}
})

test('scoped manager reads reject out-of-order cross-route and same-route completions',async()=>{
 const f=fixture(false),m=await mount(f)
 try{
  let oldCandidate,oldWork,newCandidate,newWork
  await act(async()=>{m.port().setReadScope('candidates');oldCandidate=m.port().beginScopedRead('candidates')})
  assert.equal(m.port().snapshot.state,'checking')
  await act(async()=>{m.port().setReadScope('work');oldWork=m.port().beginScopedRead('work')})
  assert.equal(oldCandidate('ready'),false)
  assert.equal(m.port().snapshot.state,'checking')
  assert.equal(await m.port().submit(draft),'blocked')
  await act(async()=>{m.port().setReadScope('candidates');newCandidate=m.port().beginScopedRead('candidates')})
  assert.equal(oldCandidate('failed'),false);assert.equal(oldWork('ready'),false)
  await act(async()=>{assert.equal(newCandidate('ready'),true)})
  assert.equal(m.port().snapshot.state,'idle')
  assert.equal(await m.port().submit(draft),'blocked')
  await act(async()=>{m.port().setReadScope('work');newWork=m.port().beginScopedRead('work');m.port().setReadState('ready')})
  assert.equal(m.port().snapshot.state,'checking')
  let latest
  await act(async()=>{latest=m.port().beginScopedRead('work')})
  assert.equal(newWork('ready'),false)
  await act(async()=>{assert.equal(latest('failed'),true)})
  assert.equal(m.port().snapshot.state,'checking')
  let fresh
  await act(async()=>{fresh=m.port().beginScopedRead('work');assert.equal(fresh('ready'),true)})
  assert.equal(m.port().snapshot.state,'idle');assert.equal(latest('ready'),false)
  await act(async()=>{assert.equal(await m.port().submit(draft),'committed')})
  assert.equal(f.calls.filter(x=>x.p_action==='commit').length,1)
 }finally{await m.cleanup()}
})
test('report route keeps verified receipt recovery without starting a new assignment',async()=>{
 const base=fixture(false),cancelCalls=[]
 const f={...base,transport:{...base.transport,cancelExistingShift:async args=>{cancelCalls.push(args);return {ok:true,shift_id:args.shiftId,state:'cancelled'}}}}
 const m=await mount(f)
 try{
  let settle
  await act(async()=>{m.port().setReadScope('work');settle=m.port().beginScopedRead('work');settle('ready')})
  await act(async()=>{assert.equal(await m.port().submit(draft),'committed')})
  await act(async()=>{m.port().setReadScope('report')})
  assert.equal(m.port().snapshot.state,'committed')
  assert.equal(settle('failed'),false)
  assert.equal(await m.port().submit(draft),'blocked')
  await assert.rejects(m.port().cancelExistingShift({shiftId:id(301),reason:'synthetic cancellation'}),/SHIFT_CANCEL_BLOCKED/)
  await m.click('تأیید و بستن رسید')
  assert.equal(m.port().snapshot.state,'idle')
  assert.equal(await m.port().submit(draft),'blocked')
  assert.equal(cancelCalls.length,0)
  assert.equal(base.calls.filter(x=>x.p_action==='commit').length,1)
 }finally{await m.cleanup()}
})
