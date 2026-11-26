import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'
import {createWorkPoolRouteFence} from '../src/lib/workPoolRouteFence.mjs'

const fake={
 name:'swtb19-unified-ui-no-network',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/UnifiedWorkManagerPanel.jsx')
    &&source==='../lib/operationsV2')return '\0swtb19-manager-api'
  if(importer?.endsWith('/src/components/UnifiedWorkWorkerPanel.jsx')
    &&source==='../lib/operationsV2')return '\0swtb19-worker-api'
  if(importer?.endsWith('/src/components/UnifiedWorkWorkerPanel.jsx')
    &&source==='./DeskWorkPoolWorkerSection')return '\0swtb19-desk-stub'
  if(importer?.endsWith('/src/components/UnifiedWorkManagerPanel.jsx')
    &&source==='./DeskWorkPoolManagerSection')return '\0swtb19-desk-manager-stub'
 },
 load(id){
  if(id==='\0swtb19-desk-stub')return 'export default function DeskStub(){return null}'
  if(id==='\0swtb19-desk-manager-stub')return 'import React from "react";export default function DeskManagerStub(){return React.createElement("p",null,"SWTB19_DESK_MANAGER_FAKE")}'
  if(id==='\0swtb19-manager-api')return [
   'export const getOperationsTermDashboard=async()=>({ok:true,terms:[',
   '{id:"term",label:"نیمسال جاری",state:"active",start_date:"2026-09-23",end_date:"2027-02-09"}]});',
   "export const getManagerUnifiedWorkPool=async()=>{const p={\"ok\":true,\"templates\":[{\"id\":\"tpl-a\",\"kind\":\"general\",\"state\":\"active\",\"unit\":\"library\",\"title\":\"کار اصلی قفسه\",\"description\":\"شرح نخست مدیریت\\n\\nبخش دوم با جزئیاتِ <script>غیرقابل اجرا</script>\",\"priority\":3}],\"opportunities\":[{\"id\":\"mgr-offer\",\"template_id\":\"tpl-a\",\"state\":\"published\",\"date\":\"2026-12-01\",\"end_date\":\"2026-12-03\",\"claim_deadline\":\"2026-11-29\",\"claimed_count\":0,\"capacity\":3,\"effort_budget_minutes\":240,\"reserved_minutes\":0}]};p.templates[0].description=globalThis.__v1ManagerDescription??p.templates[0].description;p.opportunities[0].state=globalThis.__v1ManagerState||p.opportunities[0].state;p.opportunities[0].claimed_count=globalThis.__v1ManagerClaims??0;return p;}",
   'export const createUnifiedWorkPackage=async()=>{globalThis.__v1Writes++;return {ok:true,id:"op"};};',
   "export const setWorkOpportunityState=async({opportunityId,state})=>{globalThis.__v1ManagerState=state;return{id:opportunityId};};",
   "export const updateUnifiedWorkDescription=async args=>{globalThis.__v1EditCalls.push(args);globalThis.__v1ManagerDescription=args.newDescription;if(globalThis.__v1EditDropResponse)throw Error(\"synthetic_lost_response\");return{ok:true,id:args.opportunityId};};",
  ].join('\n')
  if(id==='\0swtb19-worker-api')return [
   'export const getWorkerUnifiedWorkPool=async()=>({',
   'ok:true,scope:"worker_published_work_pool",opportunities:[{',
   "id:\"offer\",title:\"ثبت وضعیت قفسه\",description:\"ثبت موضوعات قفسه‌های کتابخانه\\n\\nبخش دومِ توضیحات <script>غیرقابل اجرا</script>\",",
   'unit:"library",date:"2026-12-01",end_date:"2026-12-03",claim_deadline:"2026-11-29",',
   'estimated_minutes:120,priority:3,allocation_mode:"fixed",',
   'effort_budget_minutes:240,remaining_minutes:240,min_share_minutes:120,',
   'max_share_minutes:120,share_step_minutes:1,remaining:2,',
   'claimable:!globalThis.__v1Claimed,my_task_id:globalThis.__v1Claimed?"task-id":null',
   '} ]});',
   'export const claimUnifiedWorkShare=async(args)=>{',
   'globalThis.__v1Claims.push(args);if(globalThis.__v1ClaimFailOnce){globalThis.__v1ClaimFailOnce=false;throw Error("synthetic_lost_response");}globalThis.__v1Claimed=true;',
   'return {ok:true,task_id:"task-id",replayed:false};};',
   'export const claimWorkOpportunity=async()=>{throw Error("LEGACY_NOT_CALLED");};',
  ].join('\n')
  return null
 }
}
let server,dom,createRoot,Manager,Worker
before(async()=>{
 dom=new JSDOM('<!doctype html><html><body></body></html>',{
  url:'https://fake.invalid',pretendToBeVisual:true})
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[fake],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 Manager=(await server.ssrLoadModule('/src/components/UnifiedWorkManagerPanel.jsx')).default
 Worker=(await server.ssrLoadModule('/src/components/UnifiedWorkWorkerPanel.jsx')).default
})
after(async()=>{
 await server?.close()
 dom?.window.close()
 for(const p of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])
  delete globalThis[p]
})
async function mount(Component,props={}){
 const host=document.createElement('div')
 document.body.appendChild(host)
 const root=createRoot(host)
 await act(async()=>{root.render(createElement(Component,props))})
 return {host,rerender:async next=>{await act(async()=>root.render(createElement(Component,next)))},cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
test('manager sees one primary action; advanced settings remain collapsed until requested',async()=>{
 globalThis.__v1Writes=0
 const m=await mount(Manager)
 try{
  const create=[...m.host.querySelectorAll('button')].find(x=>x.textContent.includes('تعریف کار جدید'))
  assert.ok(create,'single manager entrypoint')
  assert.equal(m.host.querySelector('input[placeholder*="قفسه"]'),null)
  await act(async()=>{create.click()})
  assert.ok(m.host.querySelector('input[placeholder*="قفسه"]'),'single form opened')
  const advanced=m.host.querySelector('details.swtb19-unified-work__details')
  assert.ok(advanced&&!advanced.open,'advanced settings are not open by default')
  assert.equal(globalThis.__v1Writes,0,'opening must not create a task or offer')
 }finally{await m.cleanup()}
})
test('worker sees dated offer, commits one 120-minute share, never writes approved hours',async()=>{
 globalThis.__v1Claimed=false;globalThis.__v1Claims=[]
 let callback=0
 const m=await mount(Worker,{workerId:'worker-a',onClaimed:()=>{callback++}})
 try{
  assert.match(m.host.textContent,/ثبت وضعیت قفسه/)
  assert.match(m.host.textContent,/۲ ساعت/)
  assert.equal(m.host.querySelector('.swtb19-unified-work__two'),null,'no controls before selecting detail')
  assert.equal([...m.host.querySelectorAll('button')].some(x=>x.textContent==='انتخاب این کار'),false)
  await act(async()=>[...m.host.querySelectorAll('button')].find(x=>x.textContent==='مشاهده جزئیات').click())
  assert.equal(globalThis.__v1Claims.length,0)
  const button=[...m.host.querySelectorAll('button')].find(x=>x.textContent.includes('انتخاب این کار'))
  assert.ok(button)
  await act(async()=>{button.click()})
  assert.equal(globalThis.__v1Claims.length,1)
  assert.equal(globalThis.__v1Claims[0].minutes,120)
  assert.equal(globalThis.__v1Claims[0].date,'2026-12-01')
  assert.equal(globalThis.__v1Claims[0].opportunityId,'offer')
  assert.equal(callback,1)
  assert.match(m.host.textContent,/قبلاً توسط شما انتخاب/)
 }finally{await m.cleanup()}
})

test('timed desk is optional and preserves the general draft when switching back',async()=>{
 globalThis.__v1Writes=0
 const m=await mount(Manager)
 try{
  const create=[...m.host.querySelectorAll('button')].find(x=>x.textContent.includes('تعریف کار جدید'))
  await act(async()=>{create.click()})
  const title=m.host.querySelector('input[placeholder*="قفسه"]')
  assert.ok(title)
  await act(async()=>{
   title.value='کار واقعی کتابخانه'
   title.dispatchEvent(new window.Event('input',{bubbles:true}))
  })
  const toggle=m.host.querySelector('.swtb19-unified-work__kind input[type="checkbox"]')
  assert.ok(toggle&&!toggle.checked)
  await act(async()=>{toggle.click()})
  assert.equal(toggle.checked,true)
  assert.equal(m.host.querySelector('.swtb19-unified-work__general').hidden,true)
  // React.lazy resolves on a subsequent microtask/Vite SSR module load;
  // verify eventual committed render rather than asserting during fallback.
  for(let retry=0;retry<30&&!m.host.textContent.includes('SWTB19_DESK_MANAGER_FAKE');retry++){
   await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25))})
  }
  assert.match(m.host.textContent,/SWTB19_DESK_MANAGER_FAKE/)
  await act(async()=>{toggle.click()})
  assert.equal(toggle.checked,false)
  assert.equal(m.host.querySelector('.swtb19-unified-work__general').hidden,false)
  assert.ok(m.host.querySelector('input[placeholder*="قفسه"]'))
  assert.equal(globalThis.__v1Writes,0)
 }finally{await m.cleanup()}
})

test('worker preview stays compact; detailed Persian paragraphs render as plain text with focus return',async()=>{
 globalThis.__v1Claimed=false;globalThis.__v1Claims=[]
 const m=await mount(Worker,{workerId:'worker-a'})
 try{
  const excerpt=m.host.querySelector('.swtb19-unified-work__excerpt')
  assert.ok(excerpt)
  assert.equal(excerpt.textContent.includes('\\n'),false,'literal escaping must not appear')
  assert.ok(excerpt.textContent.includes('\n\n'),'original paragraph breaks preserved')
  const btn=[...m.host.querySelectorAll('button')].find(x=>x.textContent==='مشاهده جزئیات')
  assert.ok(btn)
  assert.equal(btn.getAttribute('aria-expanded'),'false')
  await act(async()=>{btn.click()})
  const detail=m.host.querySelector('#swtb19-worker-inspector')
  assert.ok(detail,'student inspector opened')
  assert.equal(btn.getAttribute('aria-expanded'),'true')
  assert.ok(detail.querySelector('.swtb19-unified-work__full-description').textContent.includes('\n\n'))
  assert.match(detail.textContent,/بخش دومِ توضیحات/)
  assert.equal(m.host.querySelectorAll('script').length,0,'never parse server text as HTML')
  assert.ok(detail.querySelector('button.report-btn--primary'),
    'claim remains an independent explicit action')
  await act(async()=>{
   detail.querySelector('.swtb19-unified-work__inspector-heading button').click()
  })
  assert.equal(m.host.querySelector('#swtb19-worker-inspector'),null)
  assert.equal(document.activeElement,btn,'closing should restore focus to opener')
  assert.equal(globalThis.__v1Claims.length,0,'inspection never claims work')
 }finally{await m.cleanup()}
})

test('manager can inspect published offer without any mutation or worker-private leakage',async()=>{
 globalThis.__v1Writes=0
 const m=await mount(Manager)
 try{
  const btn=[...m.host.querySelectorAll('button')].find(x=>x.textContent==='مشاهده جزئیات')
  assert.ok(btn)
  await act(async()=>{btn.click()})
  const detail=m.host.querySelector('#swtb19-manager-inspector')
  assert.ok(detail)
  assert.match(detail.textContent,/کار اصلی قفسه/)
  assert.match(detail.textContent,/حجم کل تخمینی/)
  assert.match(detail.textContent,/سهم رزروشده/)
  const facts=[...detail.querySelectorAll('dl > div')].map(n=>[n.querySelector('dt')?.textContent,n.querySelector('dd')?.textContent])
  assert.deepEqual(facts.find(([key])=>key==='تعداد انتخاب‌شده'),['تعداد انتخاب‌شده','۰ نفر'])
  assert.deepEqual(facts.find(([key])=>key==='سقف تعداد افراد'),['سقف تعداد افراد','۳ نفر'])
  assert.match(detail.textContent,/سقف تعداد افراد، تعداد نفرات موردنیاز نیست/)
  assert.ok(detail.querySelector('.swtb19-unified-work__full-description').textContent.includes('\n\n'))
  assert.equal(m.host.querySelectorAll('script').length,0)
  assert.equal(globalThis.__v1Writes,0)
  await act(async()=>{
   const ev=new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})
   document.dispatchEvent(ev)
  })
  assert.equal(m.host.querySelector('#swtb19-manager-inspector'),null)
  assert.equal(document.activeElement,btn)
 }finally{await m.cleanup()}
})

test('manager edits only paused unclaimed public descriptions; no re-publication or time write',async()=>{
 globalThis.__v1ManagerState='published'
 globalThis.__v1ManagerClaims=0
 globalThis.__v1ManagerDescription=undefined
 globalThis.__v1EditCalls=[]
 globalThis.__v1EditDropResponse=false
 globalThis.__v1Writes=0
 const m=await mount(Manager)
 try{
  const buttons=()=>[...m.host.querySelectorAll('button')]
  await act(async()=>{buttons().find(x=>x.textContent==='مشاهده جزئیات').click()})
  assert.ok(!buttons().find(x=>x.textContent==='اصلاح شرح عمومی'),
   'published opportunity must be paused before editing')
  await act(async()=>{buttons().find(x=>x.textContent==='توقف انتخاب').click()})
  assert.equal(globalThis.__v1ManagerState,'paused')
  for(let k=0;k<8&&!buttons().some(x=>x.textContent==='اصلاح شرح عمومی');k++){
   await act(async()=>{await Promise.resolve()})
  }
  const editButton=buttons().find(x=>x.textContent==='اصلاح شرح عمومی')
  assert.ok(editButton,'paused unclaimed opportunity now offers edit')
  await act(async()=>{editButton.click()})
  const input=m.host.querySelector('.swtb19-unified-work__edit textarea')
  assert.ok(input)
  assert.equal(input.maxLength,10000)
  const full='توضیحات تکمیلی دقیق.\n\n'+'بخش قابل مطالعه '.repeat(170)
  await act(async()=>{
   const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
   setter.call(input,full)
   input.dispatchEvent(new window.Event('input',{bubbles:true}))
  })
  const save=buttons().find(x=>x.textContent==='ذخیره اصلاحات')
  assert.ok(save&&!save.disabled)
  await act(async()=>{save.click()})
  assert.equal(globalThis.__v1EditCalls.length,1)
  const call=globalThis.__v1EditCalls[0]
  assert.equal(call.opportunityId,'mgr-offer')
  assert.equal(call.expectedDescription.startsWith('شرح نخست مدیریت'),true)
  assert.equal(call.newDescription,full.trim())
  assert.equal(globalThis.__v1ManagerDescription,full.trim())
  assert.equal(globalThis.__v1ManagerState,'paused','editor never silently republishes')
  assert.equal(globalThis.__v1Writes,0,'no new task/template/claim is created')
 }finally{
  await m.cleanup()
  globalThis.__v1ManagerState='published'
  globalThis.__v1ManagerDescription=undefined
  globalThis.__v1ManagerClaims=0
 }
})

// No network or production user: retain an ambiguous request across navigation and denied work reads.
test('SWTB21 unified claim keeps its identity after leaving the view and rechecking authorization',async()=>{
 globalThis.__v1Claimed=false;globalThis.__v1Claims=[];globalThis.__v1ClaimFailOnce=true
 const receipts=[]
 const props={workerId:'worker-a',onClaimed:id=>receipts.push(id)}
 const m=await mount(Worker,props)
 const button=label=>[...m.host.querySelectorAll('button')].find(x=>x.textContent.includes(label))
 try{
  await act(async()=>button('مشاهده جزئیات').click())
  const first=button('انتخاب این کار');assert.ok(first)
  await act(async()=>first.click())
  assert.equal(globalThis.__v1Claims.length,1)
  const request=globalThis.__v1Claims[0]
  assert.ok(request.requestId)
  assert.match(m.host.textContent,/نتیجه انتخاب نامشخص/)
  await m.rerender({...props,active:false})
  await m.rerender({...props,active:false,authorized:false})
  assert.doesNotMatch(m.host.textContent,/ثبت وضعیت قفسه|بخش دومِ توضیحات/)
  assert.equal(m.host.querySelector('button'),null)
  assert.equal(globalThis.__v1Claims.length,1)
  await m.rerender({...props,active:true,authorized:true})
  assert.match(m.host.textContent,/نتیجه انتخاب نامشخص/)
  const retry=button('تلاش مجدد با همان شناسه')
  assert.ok(retry?.disabled)
  const read=button('بررسی نتیجه از سرور')||button('بررسی وضعیت از سرور')||button('بازخوانی')
  assert.ok(read)
  await act(async()=>read.click())
  const retry2=button('تلاش مجدد با همان شناسه');assert.ok(retry2&&!retry2.disabled)
  await act(async()=>retry2.click())
  assert.equal(globalThis.__v1Claims.length,2)
  assert.deepEqual(globalThis.__v1Claims[1],request)
  assert.deepEqual(receipts,['task-id'])
 }finally{globalThis.__v1ClaimFailOnce=false;await m.cleanup()}
})

test('unified description lost response holds fence through explicit read-back, blocks desk toggle and Escape',async()=>{
 const f=createWorkPoolRouteFence()
 globalThis.__v1ManagerState='paused';globalThis.__v1ManagerClaims=0;globalThis.__v1ManagerDescription=undefined
 globalThis.__v1EditCalls=[];globalThis.__v1EditDropResponse=true;globalThis.__v1Writes=0
 const m=await mount(Manager,{routeFence:f})
 const btn=label=>[...m.host.querySelectorAll('button')].find(b=>b.textContent===label)
 try{
  await act(async()=>btn('مشاهده جزئیات').click())
  await act(async()=>btn('اصلاح شرح عمومی').click())
  const input=m.host.querySelector('.swtb19-unified-work__edit textarea')
  const next='شرح آزمایشی جدید و کامل برای بررسی رسید'
  await act(async()=>{
   Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,next)
   input.dispatchEvent(new window.Event('input',{bubbles:true}))
  })
  await act(async()=>btn('ذخیره اصلاحات').click())
  assert.equal(globalThis.__v1EditCalls.length,1)
  assert.equal(f.getSnapshot()?.kind,'edit');assert.equal(f.getSnapshot()?.status,'unknown')
  assert.equal(f.permitsNavigation({section:'work',workView:'workPool'},{section:'work',workView:'tasks'}),false)
  assert.equal(m.host.querySelector('.swtb19-unified-work__kind input').disabled,true)
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  assert.ok(m.host.querySelector('#swtb19-manager-inspector'))
  await act(async()=>btn('بررسی نتیجه از سرور').click())
  assert.equal(f.getSnapshot(),null)
  assert.equal(globalThis.__v1EditCalls.length,1)
  assert.equal(globalThis.__v1Writes,0)
 }finally{await m.cleanup();globalThis.__v1ManagerState='published';globalThis.__v1ManagerDescription=undefined;globalThis.__v1EditDropResponse=false}
})
