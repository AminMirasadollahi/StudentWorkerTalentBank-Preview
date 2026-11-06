import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const prev=process.env.VITE_SWTB22_WORK_POOL_FOCUS_UI
process.env.VITE_SWTB22_WORK_POOL_FOCUS_UI='true'
let dom,server,createRoot,D1,D2
const fixture={
 name:'swtb22-focus-pool-all-fake',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/WorkPoolManagerPanel.jsx')
    &&source==='./DeskWorkPoolManagerSection')return '\0swtb22-desk-visual-stub'
  if((importer?.endsWith('/src/components/WorkPoolManagerPanel.jsx')
   ||importer?.endsWith('/src/components/DeskWorkPoolManagerSection.jsx'))
   &&source==='../lib/operationsV2')return '\0swtb22-fake-pool-rpcs'
 },
 load(id){
  if(id==='\0swtb22-desk-visual-stub')return [
   'import React from "react";',
   'export default function DeskStub(){return React.createElement("section",',
   '{"data-testid":"swtb22-desk-stub"},"DESK_VIEW_WITHOUT_REAL_RECORDS")}',
  ].join('\n')
  if(id!=='\0swtb22-fake-pool-rpcs')return null
  return [
   'export const getOperationsTermDashboard=async()=>({ok:true,',
   'terms:[{id:"term",label:"نیمسال ساختگی",state:"active"}]});',
   'export const getManagerWorkPool=async()=>{if(globalThis.__swtb22Denied)throw Error("DENIED");',
   'return {ok:true,templates:[',
   '{id:"general",title:"الگوی عمومی",kind:"general",unit:"research",state:"active",',
   'estimated_minutes:60},',
   '{id:"desk",title:"الگوی نوبت",kind:"library_desk",unit:"library",state:"active",',
   'estimated_minutes:60}],opportunities:[]};};',
   'export const getManagerDeskWorkPool=async()=>({ok:true,scope:"manager_desk_offers",offers:[]});',
   ...['createWorkTemplate','createWorkOpportunity','setWorkOpportunityState',
       'createDeskWorkTemplate','createDeskWorkOffer','setDeskWorkOfferState'].map(name=>
       `export const ${name}=async()=>{globalThis.__swtb22Writes++;throw Error("NO_WRITES")};`),
  ].join('\n')
 }
}
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://fixtures.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window;globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.__swtb22Denied=false;globalThis.__swtb22Writes=0
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[fixture],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 D1=(await server.ssrLoadModule('/src/components/WorkPoolManagerPanel.jsx')).default
 D2=(await server.ssrLoadModule('/src/components/DeskWorkPoolManagerSection.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 if(prev===undefined)delete process.env.VITE_SWTB22_WORK_POOL_FOCUS_UI
 else process.env.VITE_SWTB22_WORK_POOL_FOCUS_UI=prev
 for(const name of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
   '__swtb22Denied','__swtb22Writes'])delete globalThis[name]
})
async function mount(Component,props={}){
 globalThis.__swtb22Denied=false;globalThis.__swtb22Writes=0
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const render=async extra=>{
  await act(async()=>{root.render(createElement(Component,{...props,...extra}));await Promise.resolve()})
 }
 await render({})
 return {host,render,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
function button(root,text){
 return [...root.querySelectorAll('button')].find(b=>b.textContent.includes(text))
}
test('general pool is list-first, no editor expanded, with type selection and no implicit writes',async()=>{
 const ui=await mount(D1)
 try{
  const col=ui.host.querySelector('.ow-work-pool-columns')
  assert.ok(col)
  const children=[...col.children].map(c=>c.className)
  assert.equal(children[0],'swtb22-work-pool-commands')
  assert.equal(children[1],'ow-work-pool-list')
  assert.equal(children[2],'ow-work-pool-compose')
  assert.equal(ui.host.querySelectorAll('.ow-work-pool-editor[open]').length,0)
  assert.equal(ui.host.querySelectorAll('.swtb22-kind-switch [aria-pressed="true"]').length,1)
  assert.equal(globalThis.__swtb22Writes,0)
  await act(async()=>button(ui.host,'تعریف الگوی کار').click())
  assert.equal(ui.host.querySelectorAll('.ow-work-pool-editor[open]').length,1)
  assert.equal([...col.children][1].className,'ow-work-pool-compose',
   'focused editor moves into the keyboard-readable DOM before the list')
  await act(async()=>button(ui.host,'ساخت فرصت تاریخ‌دار').click())
  assert.equal(ui.host.querySelectorAll('.ow-work-pool-editor[open]').length,1)
  assert.match(ui.host.querySelector('details[open] summary').textContent,/تعریف فرصت/)
  assert.equal(globalThis.__swtb22Writes,0)
 }finally{await ui.cleanup()}
})
test('type switch lazy-mounts desk once and retains general draft/editor on return',async()=>{
 const ui=await mount(D1)
 try{
  await act(async()=>button(ui.host,'ساخت فرصت تاریخ‌دار').click())
  assert.equal(ui.host.querySelectorAll('details[open]').length,1)
  await act(async()=>button(ui.host,'نوبت‌های زمان‌دار کتابخانه').click())
  assert.equal(ui.host.querySelector('.swtb22-work-pool-kind-view').hidden,true)
  // React.lazy may resolve after the initial click's microtask; wait for the
  // actual stub rather than racing the module loader on busy CI runners.
  const deadline=Date.now()+800
  while(!ui.host.querySelector('[data-testid="swtb22-desk-stub"]')&&Date.now()<deadline){
   await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25))})
  }
  assert.ok(ui.host.querySelector('[data-testid="swtb22-desk-stub"]'),
   'desk remains lazily mounted after the first explicit selection')
  await act(async()=>button(ui.host,'فرصت‌های عمومی').click())
  assert.equal(ui.host.querySelector('.swtb22-work-pool-kind-view').hidden,false)
  assert.match(ui.host.querySelector('details[open] summary').textContent,/تعریف فرصت/)
  assert.equal(globalThis.__swtb22Writes,0)
 }finally{await ui.cleanup()}
})
test('desk pool uses the same list-first progressive editor without publishing',async()=>{
 const ui=await mount(D2)
 try{
  const col=ui.host.querySelector('.ow-work-pool-columns')
  assert.ok(col)
  assert.equal([...col.children][1].className,'ow-work-pool-list')
  await act(async()=>button(ui.host,'تعریف الگوی نوبت').click())
  assert.equal([...col.children][1].className,'ow-work-pool-compose')
  assert.equal(ui.host.querySelectorAll('details[open]').length,1)
  await act(async()=>button(ui.host,'ساخت نوبت تاریخ‌دار').click())
  assert.equal(ui.host.querySelectorAll('details[open]').length,1)
  assert.match(ui.host.querySelector('details[open] summary').textContent,/فرصت نوبت/)
  assert.equal(globalThis.__swtb22Writes,0)
 }finally{await ui.cleanup()}
})
test('manager read denial fails closed under focused Work Pool',async()=>{
 const ui=await mount(D1)
 try{
  assert.ok(button(ui.host,'ساخت فرصت تاریخ‌دار'))
  globalThis.__swtb22Denied=true
  await ui.render({refreshRevision:1})
  assert.match(ui.host.textContent,/امکان ثبت تا بازخوانی موفق متوقف است/)
  assert.equal(ui.host.querySelector('.ow-work-pool-columns'),null)
  assert.equal(globalThis.__swtb22Writes,0)
 }finally{await ui.cleanup()}
})
