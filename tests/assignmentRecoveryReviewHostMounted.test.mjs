import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createServer} from 'vite'
const h=React.createElement
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const A=id(1),B=id(2),S=id(301)
const config=Object.freeze({mode:'review',projectUrl:'https://synthetic.supabase.co',publishableKey:'sb_publishable_fixture'})
const draft={kind:'direct',workerIds:[id(10)],unit:'library',title:'Synthetic review',instructions:'Synthetic only',date:'2026-12-01',minutes:60,startMinute:null,endMinute:null,reason:null}
let dom,vite,Host,createRoot
const originalFetch=globalThis.fetch
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body></body></html>',{url:'http://localhost',pretendToBeVisual:true})
 globalThis.window=dom.window;globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true})
 ;({createRoot}=await import('react-dom/client'))
 vite=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Host=(await vite.ssrLoadModule('/src/components/AssignmentRecoveryReviewHost.jsx')).default
})
after(async()=>{
 globalThis.fetch=originalFetch
 await vite?.close();dom?.window.close()
 for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])delete globalThis[k]
})
const waitFor=async predicate=>{
 for(let i=0;i<100;i++){if(predicate())return;await act(async()=>{await new Promise(r=>setTimeout(r,10))})}
 assert.ok(predicate(),'review host did not reach expected state')
}
async function mount({initialRole=true,selectedConfig=config}={}){
 let role=initialRole,actor=A,token='fake.token.one',logoutCount=0,port=null,guardedLogout=null
 let delayCancellation=false,finishCancellation=null,active=null,epoch=0
 const listeners=new Set(),calls=[]
 const auth={
  getSession:async()=>({data:{session:{access_token:token,user:{id:actor}}}}),
  getUser:async supplied=>{assert.equal(supplied,token);return {data:{user:{id:actor,is_anonymous:false}}}},
  onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}
 }
 globalThis.fetch=async(url,opt)=>{
  assert.ok(url.startsWith(config.projectUrl+'/rest/v1/rpc/'),'unexpected network target')
  assert.equal(opt.headers.Authorization,'Bearer '+token)
  const rpc=url.split('/').at(-1),args=JSON.parse(opt.body)
  calls.push({rpc,args})
  const response=body=>({ok:true,json:async()=>body})
  if(rpc==='ops_is_admin')return response(role)
  if(rpc==='ops_assignment_recovery_control_v2'){
   if(args.p_action==='acknowledge'){epoch++;active=null}
   else assert.equal(args.p_action,'discover')
   return response({ok:true,epoch,active})
  }
  if(rpc==='ops_assignment_recovery_write_v2'){
   if(args.p_action==='reserve')active={status:'reserved',kind:args.p_kind,request_id:args.p_request_id}
   else if(args.p_action==='commit')active={...active,status:'committed',receipt:{ok:true,request_id:args.p_request_id,kind:args.p_kind,result:{id:id(201),state:'assigned',short_notice:false}}}
   else assert.fail('unexpected write action')
   return response({ok:true,epoch,active})
  }
  if(rpc==='ops_cancel_library_desk_shift'){
   const result=response({ok:true,shift_id:args.p_shift_id,state:'cancelled'})
   if(delayCancellation)return new Promise(r=>{finishCancellation=()=>r(result)})
   return result
  }
  assert.fail('unexpected RPC '+rpc)
 }
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node)
 const paint=checking=>root.render(h(Host,{config:selectedConfig,auth,actorId:A,checking,onLogout:()=>{logoutCount++}},(p,logout)=>{
  port=p;guardedLogout=logout
  return h('main',{'data-review-admin':true},p.panel,h('button',{onClick:logout},'guarded logout'))
 }))
 await act(async()=>paint(false))
 return {node,calls,port:()=>port,guardedLogout:()=>guardedLogout,logoutCount:()=>logoutCount,
  emit:async(event,nextActor=A)=>{actor=nextActor;await act(async()=>{for(const fn of listeners)fn(event,{user:{id:nextActor}})})},
  setRole:x=>{role=x},setDelay:()=>{delayCancellation=true},finish:()=>finishCancellation?.(),
  delayed:()=>finishCancellation!==null,
  paint:async checking=>{await act(async()=>paint(checking))},
  cleanup:async()=>{await act(async()=>root.unmount());node.remove();globalThis.fetch=originalFetch;assert.equal(listeners.size,0)}
 }
}
test('real review host verifies role, connects recovery, and synchronously invalidates logout',async()=>{
 const m=await mount()
 try{
  await waitFor(()=>m.port()?.snapshot.state==='idle')
  let submitted
  await act(async()=>{submitted=await m.port().submit(draft)})
  assert.equal(submitted,'committed')
  assert.equal(m.calls.filter(x=>x.rpc==='ops_assignment_recovery_write_v2').length,2)
  const button=[...m.node.querySelectorAll('button')].find(b=>b.textContent==='تأیید و بستن رسید')
  assert.ok(button)
  await act(async()=>button.click())
  await waitFor(()=>m.port()?.snapshot.state==='idle')
  const oldPort=m.port(),logout=m.guardedLogout()
  assert.equal(typeof logout,'function')
  const before=m.calls.length
  await act(async()=>{logout();await assert.rejects(oldPort.cancelExistingShift({shiftId:S,reason:'synthetic cancellation'}))})
  assert.equal(m.logoutCount(),1);assert.equal(m.calls.length,before)
  assert.equal(m.node.querySelector('[data-review-admin]'),null)
 }finally{await m.cleanup()}
})
test('real review host blocks role denial, then permits explicit fresh read; account switch is terminal',async()=>{
 const m=await mount({initialRole:false})
 try{
  await waitFor(()=>m.node.textContent.includes('مسیر آزمایشی واگذاری در دسترس نیست'))
  assert.equal(m.node.querySelector('[data-review-admin]'),null)
  assert.deepEqual(m.calls.map(x=>x.rpc),['ops_is_admin'])
  m.setRole(true)
  const retry=[...m.node.querySelectorAll('button')].find(b=>b.textContent==='بررسی مجدد دسترسی')
  await act(async()=>retry.click())
  await waitFor(()=>m.port()?.snapshot.state==='idle')
  const before=m.calls.length
  await m.emit('SIGNED_IN',B)
  assert.equal(m.node.querySelector('[data-review-admin]'),null)
  assert.equal(m.node.textContent.includes('بررسی مجدد دسترسی'),false)
  assert.equal(m.calls.length,before)
 }finally{await m.cleanup()}
})
test('real review host suppresses old cancellation result across parent recheck without retry',async()=>{
 const m=await mount()
 try{
  await waitFor(()=>m.port()?.snapshot.state==='idle')
  m.setDelay()
  let pending
  await act(async()=>{pending=m.port().cancelExistingShift({shiftId:S,reason:'synthetic cancellation'});pending.catch(()=>{})})
  await waitFor(()=>m.delayed())
  await m.paint(true)
  await m.paint(false)
  await waitFor(()=>m.port()?.snapshot.state==='cancelling_shift')
  await act(async()=>{m.finish();await assert.rejects(pending)})
  assert.equal(m.calls.filter(x=>x.rpc==='ops_cancel_library_desk_shift').length,1)
  await waitFor(()=>m.port()?.snapshot.state==='idle')
 }finally{await m.cleanup()}
})
test('invalid review configuration never mounts legacy manager or performs network',async()=>{
 const m=await mount({selectedConfig:Object.freeze({mode:'blocked'})})
 try{
  await waitFor(()=>m.node.textContent.includes('مسیر آزمایشی واگذاری در دسترس نیست'))
  assert.equal(m.node.querySelector('[data-review-admin]'),null)
  assert.equal(m.calls.length,0)
 }finally{await m.cleanup()}
})
