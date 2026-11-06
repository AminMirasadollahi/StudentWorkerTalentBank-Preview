import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const fakeApi={
 name:'swtb21d2b-private-manager-desk-mock',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/DeskWorkPoolManagerSection.jsx')
    &&source==='../lib/operationsV2')return '\0desk-mock-manager'
 },
 load(id){
  if(id!=='\0desk-mock-manager')return null
  return [
   'export const getOperationsTermDashboard=async()=>({ok:true,',
   'terms:[{id:"term",label:"نیمسال آزمایشی",state:"active"}]});',
   'export const getManagerWorkPool=async()=>({ok:true,',
   'templates:[{id:"tpl",title:"نوبت میز کتابخانه",kind:"library_desk",',
   'unit:"library",state:"active",priority:2,estimated_minutes:60}],',
   'opportunities:[]});',
   'export const getManagerDeskWorkPool=async()=>{',
   'if(globalThis.__deskManagerDenied)throw Error("NO_ADMIN");',
   'return {ok:true,scope:"manager_desk_offers",offers:globalThis.__deskNoOffers?[]:[{',
   'id:"offer",title:"نوبت میز کتابخانه",state:globalThis.__deskManagerState,',
   'date:"2026-11-25",start_minute:480,end_minute:540,claimed_count:0,',
   'capacity:2,deadline:"2026-11-23"}]};};',
   'export const createDeskWorkTemplate=async()=>{throw Error("NOT_CALLED")};',
   'export const createDeskWorkOffer=async()=>{throw Error("NOT_CALLED")};',
   'export const setDeskWorkOfferState=async({offerId,state,reason})=>{',
   'globalThis.__deskManagerWrites.push({offerId,state,reason});',
   'globalThis.__deskManagerState=state;',
   'return {id:offerId,state};};',
  ].join('\n')
 }
}
let dom,server,Component,createRoot
before(async()=>{
 dom=new JSDOM('<!doctype html><html><body></body></html>',{
  url:'https://synthetic.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[fakeApi],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 Component=(await server.ssrLoadModule('/src/components/DeskWorkPoolManagerSection.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const p of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
 '__deskManagerDenied','__deskManagerState','__deskManagerWrites','__deskNoOffers'])delete globalThis[p]
})
async function flush(){await act(async()=>{await Promise.resolve();await Promise.resolve()})}
async function mount(){
 globalThis.__deskManagerDenied=false
 globalThis.__deskNoOffers=false
 globalThis.__deskManagerState='draft'
 globalThis.__deskManagerWrites=[]
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const render=async next=>{
  await act(async()=>root.render(createElement(Component,{...next})))
  await flush()
 }
 await render({})
 return {host,render,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const button=(host,label)=>[...host.querySelectorAll('button')].find(x=>x.textContent.includes(label))
test('manager sees desk draft with explicit time interval and NO automatic publish',async()=>{
 const {host,cleanup}=await mount()
 try{
  assert.match(host.textContent,/نوبت‌های میز کتابخانه/)
  assert.match(host.textContent,/نوبت میز کتابخانه/)
  assert.match(host.textContent,/پیش‌نویس/)
  assert.match(host.textContent,/08:00 تا 09:00/)
  assert.match(host.textContent,/ظرفیت دو نفر در کل میز/)
  assert.equal(globalThis.__deskManagerWrites.length,0)
  assert.ok(button(host,'انتشار نوبت'))
  assert.ok(!button(host,'انتخاب این نوبت'))
 }finally{await cleanup()}
})
test('manager explicitly publishes a timed desk offer; no task claim is created',async()=>{
 const {host,cleanup}=await mount()
 try{
  await act(async()=>button(host,'انتشار نوبت').click())
  await flush()
  assert.deepEqual(globalThis.__deskManagerWrites,[{offerId:'offer',
   state:'published',reason:null}])
  assert.match(host.textContent,/منتشرشده/)
  assert.ok(button(host,'توقف انتخاب جدید'))
 }finally{await cleanup()}
})
test('manager auth failure fails closed and disables publish controls',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  assert.match(host.textContent,/نوبت میز کتابخانه/)
  globalThis.__deskManagerDenied=true
  await render({refreshRevision:1})
  await flush()
  assert.match(host.textContent,/ثبت و انتشار غیرفعال است/)
  assert.ok(!button(host,'انتشار نوبت'))
  assert.doesNotMatch(host.textContent,/08:00 تا 09:00/)
 }finally{await cleanup()}
})

test('empty desk opportunity list adapts width without enabling an unauthorized booking',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  globalThis.__deskNoOffers=true
  await render({refreshRevision:3})
  assert.ok(host.querySelector('.ow-work-pool-columns--empty'))
  assert.match(host.textContent,/۱\. تعریف الگوی نوبت/)
  assert.match(host.textContent,/۳\. انتشار توسط مدیر/)
  assert.ok(host.querySelector('.ow-work-pool-empty'))
  assert.equal(globalThis.__deskManagerWrites.length,0)
  assert.ok(!button(host,'انتشار نوبت'))
 }finally{await cleanup()}
})
