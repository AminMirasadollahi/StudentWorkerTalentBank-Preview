import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const fake={
 name:'d1-private-worker-pool-no-real-rpc',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/WorkPoolWorkerPanel.jsx')&&
   source==='../lib/operationsV2')return '\0d1-worker-rpc'
  // D1 suite isolates its own RPC; D2 desk behavior has separate mounted tests.
  if(importer?.endsWith('/src/components/WorkPoolWorkerPanel.jsx')&&
    source==='./DeskWorkPoolWorkerSection')return '\0d1-desk-stub'
 },
 load(id){
  if(id==='\0d1-desk-stub')return 'export default function DeskStub(){return null}'
  if(id!=='\0d1-worker-rpc')return null
  return [
   'export const getWorkerWorkPool=async()=>{',
   'globalThis.__poolReads++;',
   'if(globalThis.__poolDenied)throw Error("NO_ACCESS");',
   'return {ok:true,scope:"worker_published_work_pool",opportunities:[',
   '{id:"op-1",title:"کار منتشرشده",description:"ثبت داده‌های عمومی کتابخانه",',
   'unit:"library",date:"2026-11-15",claim_deadline:"2026-11-13",',
   'estimated_minutes:60,priority:2,remaining:globalThis.__poolClaimed?0:1,',
   'my_task_id:globalThis.__poolClaimed?"task-1":null,',
   'claimable:!globalThis.__poolClaimed} ]};};',
   'export const claimWorkOpportunity=async({opportunityId,requestId})=>{',
   'globalThis.__poolClaims.push({opportunityId,requestId});',
   'if(globalThis.__claimDenied){',
   'if(globalThis.__poolCommitOnDenied)globalThis.__poolClaimed=true;',
   'throw Error("HTTP_UNKNOWN");}',
   'globalThis.__poolClaimed=true;',
   'return {ok:true,task_id:"task-1",claim_id:"claim-1",replayed:false};};',
  ].join('\n')
 }
}
let server,dom,Component,createRoot
before(async()=>{
 dom=new JSDOM('<!doctype html><html><body></body></html>',{
  url:'https://fixture.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({server:{middlewareMode:true},plugins:[fake],
  appType:'custom',logLevel:'error'})
 Component=(await server.ssrLoadModule('/src/components/WorkPoolWorkerPanel.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const p of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
  '__poolReads','__poolClaims','__poolClaimed','__poolDenied','__claimDenied',
  '__poolCommitOnDenied'])
   delete globalThis[p]
})
async function flush(){
 await act(async()=>{await Promise.resolve();await Promise.resolve()})
}
async function mount(props={}){
 globalThis.__poolReads=0
 globalThis.__poolClaims=[]
 globalThis.__poolClaimed=false
 globalThis.__poolDenied=false
 globalThis.__claimDenied=false
 globalThis.__poolCommitOnDenied=false
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const render=async next=>{
  await act(async()=>root.render(createElement(Component,{
   workerId:'worker-a',...props,...next})))
  await flush()
 }
 await render({})
 return {host,render,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const findButton=(host,label)=>[...host.querySelectorAll('button')].find(
 x=>x.textContent.includes(label))
test('worker sees published generic opportunity and no manager editing fields',async()=>{
 const {host,cleanup}=await mount()
 try{
  assert.match(host.textContent,/فرصت‌های کاری/)
  assert.match(host.textContent,/کار منتشرشده/)
  assert.match(host.textContent,/انتخاب این کار/)
  assert.equal(globalThis.__poolReads,1)
  assert.ok(!findButton(host,'انتشار فرصت'))
  assert.ok(!findButton(host,'تعریف الگوی کار'))
 }finally{await cleanup()}
})
test('a confirmed claim creates one client call, never claims approved minutes',async()=>{
 const results=[]
 const {host,cleanup}=await mount({onClaimed:id=>results.push(id)})
 try{
  const button=findButton(host,'انتخاب این کار')
  assert.ok(button)
  await act(async()=>{button.click();button.click()})
  await flush()
  assert.equal(globalThis.__poolClaims.length,1)
  assert.match(globalThis.__poolClaims[0].requestId,/^[a-f0-9-]{36}$/i)
  assert.deepEqual(results,['task-1'])
  assert.match(host.textContent,/قبلاً توسط شما انتخاب شده/)
  assert.doesNotMatch(host.textContent,/ساعت تأییدشده ثبت شد/)
 }finally{await cleanup()}
})
test('unknown general claim requires server read-back before any same-key retry',async()=>{
 const {host,cleanup}=await mount()
 try{
  globalThis.__claimDenied=true
  await act(async()=>findButton(host,'انتخاب این کار').click())
  await flush()
  assert.equal(globalThis.__poolClaims.length,1)
  assert.match(host.textContent,/نتیجه انتخاب مشخص نیست/)
  const retry=findButton(host,'تلاش مجدد با همان شناسه')
  assert.ok(retry?.disabled,'blind retry must be impossible')
  await act(async()=>retry.click())
  assert.equal(globalThis.__poolClaims.length,1)
  assert.equal(findButton(host,'انتخاب این کار')?.disabled,true)
  globalThis.__claimDenied=false
  await act(async()=>findButton(host,'بررسی وضعیت از سرور').click())
  await flush()
  assert.equal(globalThis.__poolClaims.length,1,'read-back cannot claim')
  assert.match(host.textContent,/نتیجه اولیه همچنان ممکن است نامشخص باشد/)
  assert.equal(findButton(host,'تلاش مجدد با همان شناسه')?.disabled,false)
  await act(async()=>findButton(host,'تلاش مجدد با همان شناسه').click())
  await flush()
  assert.equal(globalThis.__poolClaims.length,2)
  assert.equal(globalThis.__poolClaims[0].requestId,globalThis.__poolClaims[1].requestId)
  assert.match(host.textContent,/قبلاً توسط شما انتخاب شده/)
 }finally{await cleanup()}
})
test('read-back of committed claim after lost HTTP reply must never send duplicate claim',async()=>{
 const receipts=[]
 const {host,cleanup}=await mount({onClaimed:id=>receipts.push(id)})
 try{
  globalThis.__claimDenied=true
  globalThis.__poolCommitOnDenied=true
  await act(async()=>findButton(host,'انتخاب این کار').click())
  await flush()
  assert.equal(globalThis.__poolClaims.length,1)
  assert.equal(findButton(host,'تلاش مجدد با همان شناسه')?.disabled,true)
  await act(async()=>findButton(host,'بررسی وضعیت از سرور').click())
  await flush()
  assert.equal(globalThis.__poolClaims.length,1)
  assert.deepEqual(receipts,['task-1'])
  assert.match(host.textContent,/قبلاً توسط شما انتخاب شده/)
  assert.equal(findButton(host,'تلاش مجدد با همان شناسه'),undefined)
 }finally{await cleanup()}
})
test('failed authorized read-back hides all offers and never unlocks blind retry',async()=>{
 const {host,cleanup}=await mount()
 try{
  globalThis.__claimDenied=true
  await act(async()=>findButton(host,'انتخاب این کار').click())
  await flush()
  globalThis.__claimDenied=false
  globalThis.__poolDenied=true
  await act(async()=>findButton(host,'بررسی وضعیت از سرور').click())
  await flush()
  assert.match(host.textContent,/دریافت فرصت‌ها موفق نبود/)
  assert.doesNotMatch(host.textContent,/کار منتشرشده/)
  assert.equal(globalThis.__poolClaims.length,1)
  globalThis.__poolDenied=false
  await act(async()=>findButton(host,'تلاش مجدد').click())
  await flush()
  assert.equal(globalThis.__poolClaims.length,1)
  assert.equal(findButton(host,'تلاش مجدد با همان شناسه')?.disabled,false)
 }finally{await cleanup()}
})
test('worker identity change clears unresolved claim display without using another account key',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  globalThis.__claimDenied=true
  await act(async()=>findButton(host,'انتخاب این کار').click())
  await flush()
  assert.match(host.textContent,/نتیجه انتخاب مشخص نیست/)
  globalThis.__claimDenied=false
  await render({workerId:'FAKE-OTHER-WORKER'})
  assert.doesNotMatch(host.textContent,/نتیجه انتخاب مشخص نیست/)
  assert.equal(findButton(host,'انتخاب این کار')?.disabled,false)
  assert.equal(globalThis.__poolClaims.length,1)
 }finally{await cleanup()}
})
test('failed access refresh clears a previously rendered colleague/public work offer',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  assert.match(host.textContent,/کار منتشرشده/)
  globalThis.__poolDenied=true
  await render({refreshRevision:1})
  await flush()
  assert.match(host.textContent,/دریافت فرصت‌ها موفق نبود/)
  assert.doesNotMatch(host.textContent,/کار منتشرشده/)
  assert.ok(!findButton(host,'انتخاب این کار'))
 }finally{await cleanup()}
})
