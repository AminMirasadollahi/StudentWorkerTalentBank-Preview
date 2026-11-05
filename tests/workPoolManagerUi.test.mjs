import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const mock={
 name:'d1-manager-rpc-no-network',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/WorkPoolManagerPanel.jsx')&&
    source==='../lib/operationsV2')return '\0d1-manager-rpc'
 },
 load(id){
  if(id!=='\0d1-manager-rpc')return null
  return [
   'export const getOperationsTermDashboard=async()=>({ok:true,',
   'terms:[{id:"term",label:"نیمسال فعال آزمون",state:"active"}]});',
   'export const getManagerWorkPool=async()=>{',
   'if(globalThis.__managerReadDenied)throw Error("NO_MANAGER_ACCESS");',
   'return {ok:true,templates:[{id:"tpl",title:"مستندسازی منابع",unit:"research",',
   'kind:"general",state:"active",priority:2,description:"شرح عمومی کار"}],',
   'opportunities:[{id:"opp",template_id:"tpl",term_id:"term",',
   'date:"2026-11-15",claim_deadline:"2026-11-13",capacity:2,claimed_count:0,',
   'state:globalThis.__managerOpportunityState}]};',
   '};',
   'export const createWorkTemplate=async()=>{throw Error("NOT_CALLED")};',
   'export const createWorkOpportunity=async()=>{throw Error("NOT_CALLED")};',
   'export const setWorkOpportunityState=async({opportunityId,state,reason})=>{',
   'globalThis.__managerWrites.push({opportunityId,state,reason});',
   'globalThis.__managerOpportunityState=state;',
   'return {id:opportunityId,state};',
   '};',
  ].join('\n')
 }
}
let dom,server,Component,createRoot
before(async()=>{
 dom=new JSDOM('<!doctype html><html><body></body></html>',{
  url:'https://fixture.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[mock],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 Component=(await server.ssrLoadModule('/src/components/WorkPoolManagerPanel.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
  '__managerReadDenied','__managerOpportunityState','__managerWrites'])
  delete globalThis[k]
})
async function flush(){
 await act(async()=>{await Promise.resolve();await Promise.resolve()})
}
async function mount(props={}){
 globalThis.__managerReadDenied=false
 globalThis.__managerOpportunityState='draft'
 globalThis.__managerWrites=[]
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const render=async next=>{
  await act(async()=>root.render(createElement(Component,{...props,...next})))
  await flush()
 }
 await render({})
 return {host,render,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const button=(host,part)=>[...host.querySelectorAll('button')].find(b=>
 b.textContent.includes(part))
test('manager pool shows draft without automatically publishing or assigning work',async()=>{
 const {host,cleanup}=await mount()
 try{
  assert.match(host.textContent,/مخزن وظایف/)
  assert.match(host.textContent,/مستندسازی منابع/)
  assert.match(host.textContent,/پیش‌نویس/)
  assert.match(host.textContent,/دو روز آینده/)
  assert.equal(globalThis.__managerWrites.length,0)
  assert.ok(button(host,'انتشار فرصت'))
  assert.ok(!button(host,'انتخاب این کار'))
 }finally{await cleanup()}
})
test('publishing is only performed after explicit manager button action',async()=>{
 const {host,cleanup}=await mount()
 try{
  const b=button(host,'انتشار فرصت')
  assert.ok(b)
  await act(async()=>b.click())
  await flush()
  assert.deepEqual(globalThis.__managerWrites,[{
   opportunityId:'opp',state:'published',reason:null,
  }])
  assert.match(host.textContent,/منتشرشده/)
  assert.ok(button(host,'توقف انتخاب جدید'))
 }finally{await cleanup()}
})
test('manager authorization read failure clears previous draft and blocks write controls',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  assert.match(host.textContent,/مستندسازی منابع/)
  globalThis.__managerReadDenied=true
  await render({refreshRevision:1})
  await flush()
  assert.match(host.textContent,/امکان ثبت تا بازخوانی موفق متوقف است/)
  assert.doesNotMatch(host.textContent,/مستندسازی منابع/)
  assert.ok(!button(host,'انتشار فرصت'))
 }finally{await cleanup()}
})
