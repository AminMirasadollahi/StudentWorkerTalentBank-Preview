import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const fixture=()=>({
 ok:true,term:{id:'TERM-SYNTH',label:'نیمسال آزمایشی',start_date:'2030-01-01',end_date:'2030-06-30',state:'active'},
 terms:[{id:'TERM-SYNTH',label:'نیمسال آزمایشی',start_date:'2030-01-01',end_date:'2030-06-30',state:'active'}],
 pools:[
  {id:'G1',label:'کتابخانه و پژوهش',units:['library','research'],allocated_minutes:24660,
   approved_minutes:165,pending_minutes:60,pending_reports:1,unreported_tasks:1,
   unreported_estimate_minutes:90,remaining_minutes:24495},
  {id:'G2',label:'روابط عمومی',units:['public_relations'],allocated_minutes:6000,
   approved_minutes:0,pending_minutes:0,pending_reports:0,unreported_tasks:0,
   unreported_estimate_minutes:0,remaining_minutes:6000},
 ],
 units:[
  {unit:'library',name:'کتابخانه',allocated_minutes:600,approved_minutes:120,pending_minutes:60,
   pending_reports:1,unreported_tasks:1,unreported_estimate_minutes:90,remaining_minutes:480},
  {unit:'research',name:'پژوهش',allocated_minutes:null,approved_minutes:45,pending_minutes:0,
   pending_reports:0,unreported_tasks:0,unreported_estimate_minutes:0,remaining_minutes:null},
  {unit:'public_relations',name:'روابط عمومی',allocated_minutes:null,approved_minutes:0,pending_minutes:0,
   pending_reports:0,unreported_tasks:0,unreported_estimate_minutes:0,remaining_minutes:null},
 ],
 workers:[{worker_id:'FAKE-A',unit:'library',approved_minutes:120,pending_minutes:0}],
 weeks:[{week_start:'2030-01-05',unit:'library',approved_minutes:120}],
})

const fakePlugin={
 name:'swtb18-no-network-term-mount',enforce:'pre',
 resolveId(source,importer){
  if((importer?.endsWith('/src/components/TermBudgetPanel.jsx')||importer?.endsWith('/src/components/BudgetPoolEditor.jsx')||importer?.endsWith('/src/components/TermStatusDialog.jsx'))&&
     source==='../lib/operationsV2')return '\0fake-swtb18'
 },
 load(id){
  if(id==='\0fake-swtb18')return [
   'export const getOperationsTermDashboard=async a=>{globalThis.__termReads.push(a);if(globalThis.__termFail)throw Error("SYNTHETIC_NO_DATA");return globalThis.__termFixture};',
   'export const saveOperationsTerm=async a=>{globalThis.__termWrites.push(a);return {ok:true,term_id:a.termId||"TERM-NEW",state:a.state};};',
   'export const saveOperationsAllocation=async a=>{globalThis.__termWrites.push(a);return {ok:true};};',
   'export const saveOperationsBudgetPool=async a=>{globalThis.__termWrites.push(a);return {ok:true};};',
  ].join('\n')
 }
}
let dom,vite,Panel,createRoot
before(async()=>{
 dom=new JSDOM('<html lang="fa"><body></body></html>',{url:'http://no-network.example.invalid',pretendToBeVisual:true})
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 vite=await createServer({plugins:[fakePlugin],server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 ;({default:Panel}=await vite.ssrLoadModule('/src/components/TermBudgetPanel.jsx'))
})
after(async()=>{await vite?.close();dom?.window.close();for(const k of
 ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__termReads','__termFixture','__termFail','__termWrites'])delete globalThis[k]})
async function mount(result=fixture()){
 globalThis.__termReads=[]
 globalThis.__termWrites=[]
 globalThis.__termFixture=result
 globalThis.__termFail=false
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 await act(async()=>root.render(createElement(Panel,{workers:[{id:'FAKE-A',name:'نمونه ساختگی'}]})))
 return {host,teardown:async()=>{await act(async()=>root.unmount());host.remove()}}
}
async function choose(select,value){
 const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set
 await act(async()=>{setter.call(select,value);select.dispatchEvent(new window.Event('change',{bubbles:true}))})
}
test('term explorer shows authoritative approved, pending and unknown quota without invoking write',async()=>{
 const {host,teardown}=await mount()
 try{
  assert.match(host.textContent,/نیمسال آزمایشی/)
  assert.match(host.textContent,/در انتظار بررسی/)
  assert.match(host.textContent,/کتابخانه و پژوهش/)
  assert.match(host.textContent,/۴۱۱ ساعت/)
  assert.match(host.textContent,/۱۰۰ ساعت/)
  assert.match(host.textContent,/سهمیه/)
  assert.equal(globalThis.__termWrites.length,0)
  const select=host.querySelector('[aria-label="فیلتر دانشجوکار بودجه"]')
  assert.ok(select)
  await choose(select,'FAKE-A')
  assert.equal(globalThis.__termReads.at(-1).workerId,'FAKE-A')
  assert.match(host.textContent,/مانده سهمیه واحد/)
  assert.equal(globalThis.__termWrites.length,0)
 }finally{await teardown()}
})
test('no active term and missing API data cannot silently show fake financial amounts',async()=>{
 const empty={ok:true,term:null,terms:[],units:[],workers:[],weeks:[],pools:[]}
 const {host,teardown}=await mount(empty)
 try{
  assert.match(host.textContent,/هنوز نیمسال فعال/)
  assert.doesNotMatch(host.textContent,/نیمسال آزمایشی/)
  globalThis.__termFail=true
  const refresh=Array.from(host.querySelectorAll('button')).find(x=>x.textContent==='بازخوانی')
  assert.ok(refresh)
  await act(async()=>refresh.click())
  assert.match(host.textContent,/آمار نیمسال در دسترس نیست/)
  assert.equal(globalThis.__termWrites.length,0)
 }finally{await teardown()}
})
