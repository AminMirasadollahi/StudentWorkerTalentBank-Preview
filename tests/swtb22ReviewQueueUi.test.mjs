import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'
import {managerReviewItems} from '../src/lib/managerReviewRows.mjs'

const workers=[{id:'FAKE-A',name:'دانشجوکار نمونه الف'}]
const tasks=[{id:'FAKE-T',title:'ثبت نسخه‌های آزمایشی',worker_id:'FAKE-A',
 unit:'library',estimate_minutes:60}]
const pending=[
 {id:'FAKE-R1',task_id:'FAKE-T',worker_id:'FAKE-A',reported_minutes:60,
  review_state:'submitted',work_date:'2026-11-06'},
 {id:'FAKE-R2',task_id:'FAKE-T',worker_id:'FAKE-A',reported_minutes:90,
  review_state:'submitted',work_date:'2026-11-06'},
 {id:'FAKE-R3',task_id:'MISSING',worker_id:'FAKE-A',reported_minutes:45,
  review_state:'submitted',work_date:'2026-11-06'},
 {id:'FAKE-APPROVED',task_id:'FAKE-T',worker_id:'FAKE-A',reported_minutes:60,
  review_state:'approved',approved_minutes:60},
]
const changes=[
 {id:'FAKE-C1',worker_id:'FAKE-A',review_state:'pending',field_code:'major',
  proposed_value:'رشته ساختگی',reason:'متن توضیح ساختگی'},
 {id:'FAKE-DONE',worker_id:'FAKE-A',review_state:'approved',
  field_code:'name',proposed_value:'نمونه دیگر'},
]
test('authorized projection keeps pending only and never presents reported as approved minutes',()=>{
 const all=managerReviewItems({
  timeEntries:pending,profileChanges:changes,workers,tasks,
  formatDate:s=>s,formatUnit:s=>s||'—',
 })
 assert.equal(all.length,4)
 assert.deepEqual(all.map(x=>x.key),['profile:FAKE-C1','time:FAKE-R1','time:FAKE-R2','time:FAKE-R3'])
 assert.deepEqual(all.map(x=>x.badge),[
  'اصلاح مشخصات','گزارش ساعت','زمان اضافه','کار نامشخص',
 ])
 assert.deepEqual(all.map(x=>x.alert),[false,false,true,true])
 assert.doesNotMatch(JSON.stringify(all.map(x=>x.title)),/FAKE-APPROVED/)
 assert.equal(managerReviewItems({...{timeEntries:pending,profileChanges:changes},mode:'time'}).length,3)
 assert.equal(managerReviewItems({...{timeEntries:pending,profileChanges:changes},mode:'profile'}).length,1)
 assert.deepEqual(managerReviewItems({}),[])
})
let dom,server,createRoot,Queue
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://synthetic.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Queue=(await server.ssrLoadModule('/src/components/FocusedReviewQueue.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])
  delete globalThis[key]
})
async function mount(items=managerReviewItems({timeEntries:pending,profileChanges:changes,workers,tasks})){
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 let current=items
 const render=async list=>{
  current=list
  await act(async()=>root.render(createElement(Queue,{
   items:current,label:'صف ساختگی',
   renderReview:item=>createElement('article',{'data-testid':'fake-only-review'},
    item.key+' / NO_REAL_ACTION'),
  })))
 }
 await render(current)
 return {host,render,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
test('review queue never auto-opens a report or calls a mutation when list loads',async()=>{
 const ui=await mount()
 try{
  assert.equal(ui.host.querySelectorAll('.swtb22-review-row').length,4)
  assert.equal(ui.host.querySelector('[data-testid="fake-only-review"]'),null)
  assert.match(ui.host.querySelector('.swtb22-review-inspector').textContent,/درخواستی انتخاب نشده/)
  assert.equal(ui.host.querySelectorAll('[aria-pressed="true"]').length,0)
  const row=ui.host.querySelectorAll('.swtb22-review-row')[1]
  await act(async()=>row.click())
  assert.match(ui.host.querySelector('[data-testid="fake-only-review"]').textContent,/time:FAKE-R1/)
  assert.equal(ui.host.querySelectorAll('[aria-pressed="true"]').length,1)
  assert.equal(document.activeElement.tagName,'H3')
  const close=[...ui.host.querySelectorAll('button')].find(x=>x.textContent==='بستن جزئیات')
  await act(async()=>close.click())
  assert.equal(ui.host.querySelector('[data-testid="fake-only-review"]'),null)
  assert.equal(document.activeElement,row,'return focus to the original request')
 }finally{await ui.cleanup()}
})
test('server removal or filter of active item never auto-selects the next decision',async()=>{
 const ui=await mount()
 try{
  await act(async()=>ui.host.querySelectorAll('.swtb22-review-row')[0].click())
  assert.equal(document.activeElement.tagName,'H3')
  await ui.render(managerReviewItems({timeEntries:pending.slice(0,2),workers,tasks}))
  assert.equal(ui.host.querySelector('[data-testid="fake-only-review"]'),null)
  assert.equal(ui.host.querySelectorAll('[aria-pressed="true"]').length,0)
  assert.equal(document.activeElement.tagName,'STRONG',
   'focus returns to the safe directory heading, never another private item')
  await ui.render([])
  assert.match(ui.host.textContent,/درخواستی برای رسیدگی وجود ندارد/)
 }finally{await ui.cleanup()}
})
