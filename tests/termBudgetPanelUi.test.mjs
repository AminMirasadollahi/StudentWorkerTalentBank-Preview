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

const draftFixture=()=>{
 const data=fixture()
 data.term={...data.term,state:'draft'}
 data.terms=data.terms.map(t=>({...t,state:'draft'}))
 data.pools=[]
 data.units=data.units.map(u=>({...u,allocated_minutes:null,remaining_minutes:null}))
 return data
}
const clickNamed=async(root,label)=>{
 const b=[...root.querySelectorAll('button')].find(el=>el.textContent.trim().includes(label))
 assert.ok(b,'missing button '+label)
 await act(async()=>b.click())
 return b
}
const writeInput=async(input,value)=>{
 assert.ok(input,'missing input')
 const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
 await act(async()=>{
  setter.call(input,value)
  input.dispatchEvent(new window.Event('input',{bubbles:true}))
 })
}
test('draft semester communicates state clearly and blocks activation before a quota exists',async()=>{
 const {host,teardown}=await mount(draftFixture())
 try{
  assert.match(host.textContent,/پیش‌نویس · هنوز فعال نیست/)
  const activate=[...host.querySelectorAll('button')].find(b=>b.textContent.includes('فعال‌سازی نیمسال'))
  assert.ok(activate?.disabled)
  assert.equal(globalThis.__termWrites.length,0)
  await clickNamed(host,'ویرایش نیمسال')
  const dialog=document.querySelector('dialog.ow-manager-dialog')
  assert.ok(dialog?.open)
  assert.equal(dialog.getAttribute('aria-modal'),'true')
  assert.ok(dialog.querySelector('[aria-label="تاریخ پایان نیمسال"]'))
  assert.doesNotMatch(dialog.textContent,/علت تنظیم یا تغییر/)
  assert.equal(dialog.querySelector('input[placeholder*="ابلاغ"]'),null)
  await clickNamed(dialog,'بستن')
  assert.equal(document.querySelector('dialog.ow-manager-dialog'),null)
 }finally{await teardown()}
})
test('first quota auto-names Library and Research, accepts Persian hours without minutes or reason',async()=>{
 const {host,teardown}=await mount(draftFixture())
 try{
  await clickNamed(host,'+ تعریف سهمیه')
  const dialog=document.querySelector('dialog.ow-manager-dialog')
  assert.ok(dialog)
  const boxes=dialog.querySelectorAll('.ow-pool-unit-choice input[type="checkbox"]')
  assert.equal(boxes.length,3)
  await act(async()=>boxes[0].click())
  await act(async()=>boxes[1].click())
  assert.match(dialog.textContent,/کتابخانه و پژوهش/)
  assert.equal(dialog.querySelector('[aria-label="دقیقه گروه سهمیه"]'),null)
  assert.equal(dialog.querySelector('input[placeholder*="ابلاغ جدید"]'),null)
  await writeInput(dialog.querySelector('[aria-label="سهمیه مصوب به ساعت"]'),'۴۱۱')
  await clickNamed(dialog,'ثبت سهمیه')
  assert.equal(globalThis.__termWrites.length,1)
  const saved=globalThis.__termWrites[0]
  assert.equal(saved.label,'کتابخانه و پژوهش')
  assert.equal(saved.minutes,24660)
  assert.deepEqual(saved.units,['library','research'])
  assert.match(saved.reason,/خودکار/)
 }finally{await teardown()}
})
test('editing existing pool enforces meaningful change and reason, preserving grouping',async()=>{
 const {host,teardown}=await mount()
 try{
  await clickNamed(host,'ویرایش سهمیه')
  const dialog=document.querySelector('dialog.ow-manager-dialog')
  assert.ok(dialog)
  let commit=[...dialog.querySelectorAll('button')].find(b=>b.textContent.trim()==='ثبت تغییرات')
  assert.ok(commit?.disabled,'unmodified pool must not be resubmitted')
  await writeInput(dialog.querySelector('[aria-label="سهمیه مصوب به ساعت"]'),'۴۲۰')
  const reason=dialog.querySelector('input[placeholder*="ابلاغ جدید"]')
  assert.ok(reason)
  commit=[...dialog.querySelectorAll('button')].find(b=>b.textContent.trim()==='ثبت تغییرات')
  assert.ok(commit?.disabled,'modification requires real audit reason')
  await writeInput(reason,'ابلاغ اصلاح سهمیه مصوب')
  await clickNamed(dialog,'ثبت تغییرات')
  const saved=globalThis.__termWrites.at(-1)
  assert.equal(saved.id,'G1')
  assert.equal(saved.minutes,25200)
  assert.deepEqual(saved.units,['library','research'])
  assert.equal(saved.reason,'ابلاغ اصلاح سهمیه مصوب')
 }finally{await teardown()}
})
test('activation is a deliberate separate confirmation and never an implicit edit',async()=>{
 const data=draftFixture()
 data.pools=[fixture().pools[0]]
 const {host,teardown}=await mount(data)
 try{
  await clickNamed(host,'فعال‌سازی نیمسال')
  const dialog=document.querySelector('dialog.ow-manager-dialog')
  assert.match(dialog.textContent,/بعد از فعال‌سازی، بازه زمانی نیمسال/)
  const submit=[...dialog.querySelectorAll('button')].find(b=>b.textContent.includes('فعال‌سازی قطعی'))
  assert.ok(submit?.disabled)
  assert.equal(globalThis.__termWrites.length,0)
  await act(async()=>dialog.querySelector('.ow-term-confirm input').click())
  await writeInput(dialog.querySelector('input[placeholder*="تأیید نهایی"]'),'تأیید بازه و سهمیه برای شروع')
  await clickNamed(dialog,'فعال‌سازی قطعی نیمسال')
  const saved=globalThis.__termWrites.at(-1)
  assert.equal(saved.state,'active')
  assert.equal(saved.startDate,'2030-01-01')
  assert.equal(saved.endDate,'2030-06-30')
  assert.match(saved.reason,/تأیید/)
 }finally{await teardown()}
})
