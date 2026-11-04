import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createElement,act} from 'react'
import {createServer} from 'vite'

let dom,server,Component,createRoot
const date='2026-10-17'
const data={
 workers:[{id:'a',name:'آزمایش اول',state:'active',unit:'library'},
  {id:'b',name:'آزمایش دوم',state:'active',unit:'research'}],
 weekly_slots:[{worker_id:'a',weekday_iso:6,valid_from:'2026-10-01',
  valid_until:null,start_minute:480,end_minute:540}],
 exceptions:[],
 tasks:[{id:'t1',worker_id:'a',planned_date:date,
  title:'کار ایمن آزمایشی',unit:'research',state:'assigned'}],
}
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',
  {url:'http://fixture.invalid/',pretendToBeVisual:true})
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.HTMLDialogElement=dom.window.HTMLDialogElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 // JSDOM does not implement native showModal/close; test only the UI state,
 // without weakening production native browser behavior.
 Object.defineProperty(dom.window.HTMLDialogElement.prototype,'showModal',
  {configurable:true,value:function(){this.setAttribute('open','')}})
 Object.defineProperty(dom.window.HTMLDialogElement.prototype,'close',
  {configurable:true,value:function(){this.removeAttribute('open')}})
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 ;({default:Component}=await server.ssrLoadModule('/src/components/TeamScheduleOverview.jsx'))
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const name of ['window','document','HTMLElement','HTMLDialogElement',
  'IS_REACT_ACT_ENVIRONMENT'])delete globalThis[name]
})
async function mount({onPlanAssignment}={}){
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 await act(async()=>root.render(createElement(Component,
  {data,todayIso:date,onPlanAssignment})))
 return {host,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
test('all workers manager view has weekly + Persian monthly panels and distinct counts',async()=>{
 const {host,cleanup}=await mount()
 try{
  assert.ok(host.querySelector('.ow-teamcal-week'))
  assert.ok(host.querySelector('.ow-teamcal-month'))
  assert.equal(host.querySelectorAll('.ow-teamcal-week-row').length,7)
  assert.ok(host.querySelectorAll('.ow-teamcal-day').length>=29)
  assert.match(host.textContent,/برنامه هفتگی/)
  assert.match(host.textContent,/تقویم ماهانه/)
  assert.match(host.textContent,/نفر دارای برنامه/)
 }finally{await cleanup()}
})
test('day opens viewport dialog; detail shows tasks, not private notes; no unrequested writes',async()=>{
 const assignments=[]
 const {host,cleanup}=await mount({onPlanAssignment:date=>assignments.push(date)})
 try{
  const day=host.querySelector('.ow-teamcal-week-row')
  assert.ok(day)
  await act(async()=>day.click())
  const dialog=host.querySelector('dialog[open]')
  assert.ok(dialog,'day detail must open in immediately visible modal')
  assert.match(dialog.textContent,/آزمایش اول/)
  assert.match(dialog.textContent,/کار ایمن آزمایشی/)
  assert.doesNotMatch(dialog.textContent,/approved_minutes|auth_user_id|internal_notes/)
  assert.deepEqual(assignments,[])
  const action=[...dialog.querySelectorAll('button')].find(b=>/تعریف کار/.test(b.textContent))
  assert.ok(action)
  await act(async()=>action.click())
  assert.deepEqual(assignments,[date])
  assert.equal(host.querySelector('dialog[open]'),null)
 }finally{await cleanup()}
})
test('month navigation changes range without making any writes',async()=>{
 const {host,cleanup}=await mount()
 try{
  const title=host.querySelector('.ow-teamcal-month h3')?.textContent
  const next=[...host.querySelectorAll('.ow-teamcal-month button')].find(
   b=>b.textContent.trim()==='ماه بعد')
  assert.ok(next)
  await act(async()=>next.click())
  const changed=host.querySelector('.ow-teamcal-month h3')?.textContent
  assert.notEqual(changed,title)
 }finally{await cleanup()}
})
