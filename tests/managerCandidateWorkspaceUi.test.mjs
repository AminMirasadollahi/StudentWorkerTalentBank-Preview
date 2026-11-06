import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createElement,act} from 'react'
import {createServer} from 'vite'
import {
 normalizeCandidateQuery,candidateStage,candidateIsReady,selectManagerCandidates,
} from '../src/lib/managerCandidateView.mjs'

const fixtures=[
 {id:'FAKE_A',full_name:'یاسمن نمونه',major:'آموزش ابتدایی',phone:'09123456780',
  entry_year:1404,primary_unit:'library',interview_status:'pending',clearance_status:'pending'},
 {id:'FAKE_B',full_name:'علی نمونه',major:'ریاضی',phone:'09123456781',
  entry_year:1403,primary_unit:'research',interview_status:'approved',clearance_status:'cleared'},
 {id:'FAKE_C',full_name:'ندا نمونه',major:'علوم',phone:'09123456782',
  entry_year:1402,primary_unit:'library',worker_id:'WORKER_FAKE_C',
  worker_state:'inactive',interview_status:'approved',clearance_status:'cleared'},
]
test('candidate label distinguishes authorized worker state and readiness',()=>{
 assert.equal(candidateStage(fixtures[0]),'در انتظار بررسی')
 assert.equal(candidateStage(fixtures[1]),'آماده فعال‌سازی')
 assert.equal(candidateIsReady(fixtures[1]),true)
 assert.equal(candidateStage(fixtures[2]),'حساب ایجادشده')
 assert.equal(candidateIsReady(fixtures[2]),false)
 assert.equal(candidateStage({...fixtures[2],worker_state:'active'}),'حساب فعال')
})
test('search normalizes Persian/Arabic spelling and digits without extra server reads',()=>{
 assert.equal(normalizeCandidateQuery('  كيارش يونس ۱۴۰۴  '),'کیارش یونس 1404')
 assert.equal(selectManagerCandidates(fixtures,'all','۱۴۰۳')[0].id,'FAKE_B')
 assert.equal(selectManagerCandidates(fixtures,'ready','علی').length,1)
 assert.equal(selectManagerCandidates(fixtures,'pending','یاسمن').length,1)
 assert.equal(selectManagerCandidates(fixtures,'active','علی').length,0)
 assert.equal(selectManagerCandidates(fixtures,'all','09123456782')[0].id,'FAKE_C')
 assert.equal(selectManagerCandidates(fixtures,'all','خبر ندارد').length,0)
 assert.equal(selectManagerCandidates(null,'all','').length,0)
})

let dom,server,createRoot,Workspace
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://unit.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Workspace=(await server.ssrLoadModule('/src/components/ManagerCandidatesWorkspace.jsx')).default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])
  delete globalThis[key]
})

async function mount(initial={}){
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 let state={
  rows:fixtures,filter:'all',search:'',selectedId:'',loading:false,
  error:'',flash:'',busy:false,...initial,
 }
 const controls={
  onFilterChange:next=>{state={...state,filter:next};void render()},
  onSearchChange:next=>{state={...state,search:next};void render()},
  onSelect:next=>{state={...state,selectedId:next};void render()},
  renderDetails:row=>createElement('div',{
   'data-testid':'fake-selected-candidate',
  },'DETAIL_'+row.id),
 }
 async function render(extra={}){
  state={...state,...extra}
  await act(async()=>root.render(createElement(Workspace,{...state,...controls})))
 }
 await render()
 return {host,render,get state(){return state},
  cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
const button=(host,id)=>host.querySelector('.swtb22-candidate-row[aria-controls="swtb22-candidate-inspector"]:has(strong)')

test('candidate workspace is list-first; inspector only renders on explicit selection',async()=>{
 const ui=await mount()
 try{
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,3)
  assert.equal(ui.host.querySelector('[data-testid="fake-selected-candidate"]'),null)
  assert.match(ui.host.textContent,/پرونده‌ای انتخاب نشده/)
  const row=ui.host.querySelectorAll('.swtb22-candidate-row')[1]
  await act(async()=>row.click())
  assert.equal(ui.host.querySelector('[data-testid="fake-selected-candidate"]').textContent,'DETAIL_FAKE_B')
  assert.equal(ui.host.querySelectorAll('[aria-pressed="true"]').length,1)
  assert.equal(document.activeElement.tagName,'H3','focus follows selected inspector')
  await act(async()=>{
   [...ui.host.querySelectorAll('button')].find(x=>x.textContent==='بستن جزئیات').click()
  })
  assert.equal(ui.host.querySelector('[data-testid="fake-selected-candidate"]'),null)
 }finally{await ui.cleanup()}
})
test('filters and authorized search update visible rows without hiding access checks',async()=>{
 const ui=await mount()
 try{
  await ui.render({filter:'ready'})
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,1)
  assert.match(ui.host.textContent,/علی نمونه/)
  await ui.render({filter:'all',search:'نام ناموجود'})
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0)
  assert.match(ui.host.textContent,/پرونده‌ای مطابق جست‌وجو/)
  await ui.render({error:'عدم تأیید مجوز',rows:[],search:'',loading:false})
  assert.equal(ui.host.querySelectorAll('.swtb22-candidate-row').length,0)
  assert.equal(ui.host.querySelector('[data-testid="fake-selected-candidate"]'),null)
  assert.match(ui.host.querySelector('[role="alert"]').textContent,/عدم تأیید مجوز/)
  assert.match(ui.host.textContent,/پرونده‌های قبلی نمایش داده نمی‌شوند/)
 }finally{await ui.cleanup()}
})
test('pending loading never incorrectly claims zero candidates and busy disables selection',async()=>{
 const ui=await mount({rows:[],loading:true})
 try{
  assert.match(ui.host.textContent,/در حال دریافت پرونده‌ها/)
  assert.doesNotMatch(ui.host.textContent,/هنوز پرونده‌ای ثبت نشده/)
  await ui.render({rows:fixtures,loading:false,busy:true})
  assert.ok([...ui.host.querySelectorAll('.swtb22-candidate-row')].every(x=>x.disabled))
 }finally{await ui.cleanup()}
})
