import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const mock={
 name:'swtb21d2b-private-worker-desk-mock',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/DeskWorkPoolWorkerSection.jsx')
    &&source==='../lib/operationsV2')return '\0desk-mock-worker'
 },
 load(id){
  if(id!=='\0desk-mock-worker')return null
  return [
   'export const getWorkerDeskWorkPool=async()=>{',
   ' globalThis.__deskReads++;',
   ' if(globalThis.__deskReadDenied||globalThis.__deskReadDeniedAfterClaim&&globalThis.__deskBooked)throw Error("NO_WORKER_ACCESS");',
   ' return {ok:true,scope:"worker_desk_offers",offers:[{',
   ' id:"offer-1",date:"2026-11-25",start_minute:480,end_minute:540,',
   ' deadline:"2026-11-23",title:"نوبت میز کتابخانه",',
   ' description:"ثبت و پاسخگویی به مراجعان کتابخانه",priority:2,',
   ' remaining_offer:globalThis.__deskBooked?0:2,',
   ' remaining_global_desk:globalThis.__deskBooked?0:1,',
   ' remaining_effective:globalThis.__deskBooked?0:1,',
   ' my_task_id:globalThis.__deskBooked?"task-a":null,',
   ' claimable:!globalThis.__deskBooked,',
   ' PRIVATE_INSTRUCTIONS:"MUST_NOT_RENDER_SECRET" }]};',
   '};',
   'export const claimDeskWorkOffer=async({offerId,requestId})=>{',
   ' globalThis.__deskClaims.push({offerId,requestId});',
   ' if(globalThis.__deskClaimFails){',
   ' if(globalThis.__deskCommitOnLostReply)globalThis.__deskBooked=true;',
   ' throw Error("UNKNOWN_NETWORK_RESULT");}',
   ' globalThis.__deskBooked=true;',
   ' return {ok:true,task_id:"task-a",shift_id:"shift-a",replayed:false};',
   '};',
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
 server=await createServer({plugins:[mock],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 Component=(await server.ssrLoadModule('/src/components/DeskWorkPoolWorkerSection.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const v of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
  '__deskReads','__deskReadDenied','__deskBooked','__deskClaims','__deskClaimFails',
  '__deskReadDeniedAfterClaim','__deskCommitOnLostReply'])
  delete globalThis[v]
})
async function flush(){await act(async()=>{await Promise.resolve();await Promise.resolve()})}
async function mount(props={}){
 globalThis.__deskReads=0
 globalThis.__deskReadDenied=false
 globalThis.__deskBooked=false
 globalThis.__deskClaims=[]
 globalThis.__deskClaimFails=false
 globalThis.__deskReadDeniedAfterClaim=false
 globalThis.__deskCommitOnLostReply=false
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const render=async next=>{
  await act(async()=>root.render(createElement(Component,{workerId:'worker-a',...props,...next})))
  await flush()
 }
 await render({})
 return {host,render,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const button=(host,label)=>[...host.querySelectorAll('button')].find(x=>
 x.textContent.includes(label))
test('worker reads real global free seat and never receives private instructions',async()=>{
 const {host,cleanup}=await mount()
 try{
  assert.match(host.textContent,/نوبت میز کتابخانه/)
  assert.match(host.textContent,/جای خالی واقعی: ۱ نفر/)
  assert.match(host.textContent,/ظرفیت فرصت: ۲ نفر/)
  assert.doesNotMatch(host.textContent,/MUST_NOT_RENDER_SECRET/)
  assert.ok(button(host,'انتخاب این نوبت'))
  assert.ok(!button(host,'انتشار نوبت'))
  assert.equal(globalThis.__deskClaims.length,0)
 }finally{await cleanup()}
})
test('explicit worker claim produces one call, one task and one shift receipt',async()=>{
 const claimed=[]
 const {host,cleanup}=await mount({onClaimed:id=>claimed.push(id)})
 try{
  const b=button(host,'انتخاب این نوبت');assert.ok(b)
  await act(async()=>{b.click();b.click()})
  await flush()
  assert.equal(globalThis.__deskClaims.length,1)
  assert.match(globalThis.__deskClaims[0].requestId,/^[0-9a-f-]{36}$/i)
  assert.deepEqual(claimed,['task-a'])
  assert.match(host.textContent,/قبلاً توسط شما رزرو شده/)
  assert.doesNotMatch(host.textContent,/ساعت تأییدشده ثبت شد/)
 }finally{await cleanup()}
})
test('ambiguous HTTP result cannot be blindly retried; same UUID retained after refresh',async()=>{
 const {host,cleanup}=await mount()
 try{
  globalThis.__deskClaimFails=true
  await act(async()=>button(host,'انتخاب این نوبت').click())
  await flush()
  assert.equal(globalThis.__deskClaims.length,1)
  const retry=button(host,'تلاش مجدد با همان شناسه')
  assert.ok(retry)
  assert.equal(retry.disabled,true)
  globalThis.__deskClaimFails=false
  await act(async()=>button(host,'بررسی نتیجه از سرور').click())
  await flush()
  assert.equal(button(host,'تلاش مجدد با همان شناسه').disabled,false)
  await act(async()=>button(host,'تلاش مجدد با همان شناسه').click())
  await flush()
  assert.equal(globalThis.__deskClaims.length,2)
  assert.equal(globalThis.__deskClaims[0].requestId,
   globalThis.__deskClaims[1].requestId)
  assert.match(host.textContent,/قبلاً توسط شما رزرو شده/)
 }finally{await cleanup()}
})
test('confirmed desk reservation survives failed post-commit read and remains navigable',async()=>{
 const receipts=[]
 const {host,cleanup}=await mount({onClaimed:id=>receipts.push(id)})
 try{
  globalThis.__deskReadDeniedAfterClaim=true
  await act(async()=>button(host,'انتخاب این نوبت').click())
  await flush()
  assert.equal(globalThis.__deskClaims.length,1)
  assert.deepEqual(receipts,['task-a'])
  assert.match(host.textContent,/رزرو نوبت در سرور تأیید شد/)
  assert.match(host.textContent,/دریافت فهرست تازه موفق نبود/)
  assert.match(host.textContent,/داده‌های قبلی پنهان شدند/)
  assert.doesNotMatch(host.textContent,/نتیجه رزرو مشخص نیست/)
  assert.ok(!button(host,'تلاش مجدد با همان شناسه'))
 }finally{await cleanup()}
})
test('navigation rejection after confirmed desk reservation never invites a second claim',async()=>{
 const receipts=[]
 const {host,cleanup}=await mount({onClaimed:async id=>{
  receipts.push(id);throw Error('SYNTHETIC_DESK_NAV_FAILURE')
 }})
 try{
  await act(async()=>button(host,'انتخاب این نوبت').click())
  await flush()
  assert.deepEqual(receipts,['task-a'])
  assert.equal(globalThis.__deskClaims.length,1)
  assert.match(host.textContent,/رزرو نوبت در سرور تأیید شد/)
  assert.match(host.textContent,/انتقال به «کارهای من» انجام نشد/)
  assert.doesNotMatch(host.textContent,/نتیجه رزرو مشخص نیست/)
  assert.ok(!button(host,'تلاش مجدد با همان شناسه'))
 }finally{await cleanup()}
})
test('lost desk HTTP reply after server commit is reconciled by read-back without rebooking',async()=>{
 const {host,cleanup}=await mount()
 try{
  globalThis.__deskClaimFails=true
  globalThis.__deskCommitOnLostReply=true
  await act(async()=>button(host,'انتخاب این نوبت').click())
  await flush()
  assert.equal(globalThis.__deskClaims.length,1)
  assert.equal(button(host,'تلاش مجدد با همان شناسه').disabled,true)
  await act(async()=>button(host,'بررسی نتیجه از سرور').click())
  await flush()
  assert.match(host.textContent,/رزرو قبلی شما از سرور تأیید شد/)
  assert.equal(globalThis.__deskClaims.length,1)
  assert.ok(!button(host,'تلاش مجدد با همان شناسه'))
 }finally{await cleanup()}
})
test('switching worker identity clears unresolved desk receipt and preserves isolation',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  globalThis.__deskClaimFails=true
  await act(async()=>button(host,'انتخاب این نوبت').click())
  await flush()
  assert.match(host.textContent,/نتیجه رزرو مشخص نیست/)
  globalThis.__deskClaimFails=false
  await render({workerId:'FAKE-OTHER-WORKER'})
  assert.doesNotMatch(host.textContent,/نتیجه رزرو مشخص نیست/)
  assert.equal(globalThis.__deskClaims.length,1)
 }finally{await cleanup()}
})
test('authorization refresh failure clears all previously displayed desk offers',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  assert.match(host.textContent,/ثبت و پاسخگویی/)
  globalThis.__deskReadDenied=true
  await render({refreshRevision:1})
  await flush()
  assert.match(host.textContent,/داده‌های قبلی پنهان شدند/)
  assert.doesNotMatch(host.textContent,/ثبت و پاسخگویی/)
  assert.ok(!button(host,'انتخاب این نوبت'))
 }finally{await cleanup()}
})
