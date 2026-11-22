import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const fake={
 name:'swtb19-unified-ui-no-network',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/UnifiedWorkManagerPanel.jsx')
    &&source==='../lib/operationsV2')return '\0swtb19-manager-api'
  if(importer?.endsWith('/src/components/UnifiedWorkWorkerPanel.jsx')
    &&source==='../lib/operationsV2')return '\0swtb19-worker-api'
  if(importer?.endsWith('/src/components/UnifiedWorkWorkerPanel.jsx')
    &&source==='./DeskWorkPoolWorkerSection')return '\0swtb19-desk-stub'
 },
 load(id){
  if(id==='\0swtb19-desk-stub')return 'export default function DeskStub(){return null}'
  if(id==='\0swtb19-manager-api')return [
   'export const getOperationsTermDashboard=async()=>({ok:true,terms:[',
   '{id:"term",label:"نیمسال جاری",state:"active",start_date:"2026-09-23",end_date:"2027-02-09"}]});',
   'export const getManagerUnifiedWorkPool=async()=>({ok:true,templates:[],opportunities:[]});',
   'export const createUnifiedWorkPackage=async()=>{globalThis.__v1Writes++;return {ok:true,id:"op"};};',
   'export const setWorkOpportunityState=async()=>{throw Error("NO_ACTION");};',
  ].join('\n')
  if(id==='\0swtb19-worker-api')return [
   'export const getWorkerUnifiedWorkPool=async()=>({',
   'ok:true,scope:"worker_published_work_pool",opportunities:[{',
   'id:"offer",title:"ثبت وضعیت قفسه",description:"ثبت موضوعات قفسه‌های کتابخانه برای نقشه اولیه",',
   'unit:"library",date:"2026-12-01",end_date:"2026-12-03",claim_deadline:"2026-11-29",',
   'estimated_minutes:120,priority:3,allocation_mode:"fixed",',
   'effort_budget_minutes:240,remaining_minutes:240,min_share_minutes:120,',
   'max_share_minutes:120,share_step_minutes:1,remaining:2,',
   'claimable:!globalThis.__v1Claimed,my_task_id:globalThis.__v1Claimed?"task-id":null',
   '} ]});',
   'export const claimUnifiedWorkShare=async(args)=>{',
   'globalThis.__v1Claims.push(args);globalThis.__v1Claimed=true;',
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
 return {host,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
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
