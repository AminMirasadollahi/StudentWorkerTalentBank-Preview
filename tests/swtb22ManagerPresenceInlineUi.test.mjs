import test,{before,after} from 'node:test'
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createElement,act} from 'react'
import {createServer} from 'vite'

const todayIso='2026-11-06'
const fakeData={
 workers:[
  {id:'FAKE-A',name:'دانشجوکار نمونه کتابخانه',unit:'library',state:'active'},
  {id:'FAKE-B',name:'دانشجوکار نمونه پژوهش',unit:'research',state:'active'},
  {id:'FAKE-P',name:'حساب تعلیق‌شده',unit:'library',state:'paused'},
 ],
 weekly_slots:[{
  worker_id:'FAKE-A',weekday_iso:5,valid_from:'2026-10-01',
  valid_until:null,start_minute:480,end_minute:600,
 }],
 exceptions:[],
 tasks:[{
  id:'FAKE-ONE',worker_id:'FAKE-B',title:'کار نمونه',
  planned_date:todayIso,unit:'research',state:'assigned',
  instructions:'PRIVATE_INSTRUCTIONS_MUST_NOT_APPEAR',
 }],
 time_entries:[{approved_minutes:9999,private_note:'PRIVATE_TIME_NOTE'}],
}
let dom,server,createRoot,Calendar
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://synthetic.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.HTMLDialogElement=dom.window.HTMLDialogElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 Object.defineProperty(dom.window.HTMLDialogElement.prototype,'showModal',{
  configurable:true,value:function(){this.setAttribute('open','')}
 })
 Object.defineProperty(dom.window.HTMLDialogElement.prototype,'close',{
  configurable:true,value:function(){this.removeAttribute('open')}
 })
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Calendar=(await server.ssrLoadModule('/src/components/TeamScheduleOverview.jsx')).default
})
after(async()=>{
 await server?.close()
 dom?.window.close()
 for(const key of ['window','document','HTMLElement','HTMLDialogElement',
  'IS_REACT_ACT_ENVIRONMENT'])delete globalThis[key]
})
async function mount(props={}){
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const calls={selected:[],edit:[],assign:[]}
 let config={data:fakeData,todayIso,inlineManager:true,selectedDay:'',
  onSelectedDayChange:d=>calls.selected.push(d),
  onEditWorker:(id,date)=>calls.edit.push({id,date}),
  onPlanAssignment:d=>calls.assign.push(d),...props}
 await act(async()=>root.render(createElement(Calendar,config)))
 return {host,calls,async render(next){
  config={...config,...next}
  await act(async()=>root.render(createElement(Calendar,config)))
 },async cleanup(){await act(async()=>root.unmount());host.remove()}}
}
const btn=(host,text)=>[...host.querySelectorAll('button')].find(
 b=>b.textContent.includes(text))


test('manager desktop calendar shows adjacent week/month with details closed until selection',async()=>{
 const ui=await mount()
 try{
  const css=readFileSync(new URL('../src/operations-workspace.css',import.meta.url),'utf8')
  assert.match(css,/\.swtb22-manager-teamcal>\.ow-teamcal-week\{\s*grid-column:1;grid-row:1/)
  assert.match(css,/\.swtb22-manager-teamcal>\.ow-teamcal-month\{\s*grid-column:2;grid-row:1/)
  assert.match(css,/\.swtb22-presence-day-inspector\{\s*grid-column:1 \/ -1;grid-row:2/)
  assert.ok(ui.host.querySelector('.swtb22-manager-teamcal'))
  assert.ok(ui.host.querySelector('.ow-teamcal-week'))
  assert.ok(ui.host.querySelector('.ow-teamcal-month'))
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector'),null)
  assert.equal(ui.host.querySelector('dialog'),null,'manager view must remain nonmodal')
  assert.equal(ui.host.querySelectorAll('[aria-pressed="true"]').length,0)
  assert.equal(ui.calls.assign.length,0)
  await act(async()=>ui.host.querySelector('.ow-teamcal-week-row.is-today').click())
  assert.ok(ui.host.querySelector('#swtb22-presence-day-inspector'))
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-week-row[aria-pressed="true"]').length,1)
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-day[aria-pressed="true"]').length,1)
  assert.equal(ui.calls.selected.at(-1),todayIso)
  assert.match(ui.host.textContent,/برنامه نامشخص|برنامه ثبت نشده/)
  assert.match(ui.host.textContent,/کار نمونه/)
  assert.doesNotMatch(ui.host.textContent,/PRIVATE_|9999|حساب تعلیق‌شده/)
  assert.equal(document.activeElement?.id,'ow-teamcal-day-title')
  await act(async()=>btn(ui.host,'بستن جزئیات').click())
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector'),null)
  assert.equal(ui.host.querySelectorAll('[aria-pressed="true"]').length,0)
  assert.equal(ui.calls.selected.at(-1),'')
  assert.match(document.activeElement?.className||'',/ow-teamcal-week-row/,
   'focus returns to day button, not removed inspector')
 }finally{await ui.cleanup()}
})
test('week/month navigation does not implicitly open a new inspector',async()=>{
 const ui=await mount()
 try{
  await act(async()=>btn(ui.host,'هفته بعد').click())
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector'),null)
  assert.equal(ui.calls.selected.at(-1),'')
  await act(async()=>ui.host.querySelector('.ow-teamcal-week-row').click())
  const selected=ui.calls.selected.at(-1)
  assert.ok(selected>todayIso)
  assert.ok(ui.host.querySelector('#swtb22-presence-day-inspector'))
  assert.equal(document.activeElement?.id,'ow-teamcal-day-title')
  await act(async()=>btn(ui.host,'ماه بعد').click())
  assert.equal(ui.calls.selected.at(-1),'')
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector'),null)
  assert.equal(ui.host.querySelectorAll('[aria-pressed="true"]').length,0)
  await act(async()=>btn(ui.host,'امروز').click())
  assert.equal(ui.calls.selected.at(-1),'')
  assert.ok(ui.host.querySelector('.ow-teamcal-week-row.is-today'))
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector'),null)
 }finally{await ui.cleanup()}
})
test('manager actions still edit/assign only an explicitly selected day and person',async()=>{
 const ui=await mount()
 try{
  assert.equal(ui.host.querySelectorAll('.swtb22-presence-person-actions button').length,0)
  await act(async()=>ui.host.querySelector('.ow-teamcal-week-row.is-today').click())
  const actions=[...ui.host.querySelectorAll('.swtb22-presence-person-actions button')]
  assert.equal(actions.length,2)
  const workerButton=actions.find(b=>b.closest('.ow-teamcal-person')?.textContent.includes('دانشجوکار نمونه کتابخانه'))
  assert.ok(workerButton)
  await act(async()=>workerButton.click())
  assert.deepEqual(ui.calls.edit,[{id:'FAKE-A',date:todayIso}])
  assert.deepEqual(ui.calls.assign,[])
  await act(async()=>btn(ui.host,'+ تعریف کار در این تاریخ').click())
  assert.deepEqual(ui.calls.assign,[todayIso])
  assert.ok(ui.host.querySelector('#swtb22-presence-day-inspector'))
 }finally{await ui.cleanup()}
})
test('review of a selected past day is read only',async()=>{
 const ui=await mount()
 try{
  await act(async()=>btn(ui.host,'هفته قبل').click())
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector'),null)
  await act(async()=>ui.host.querySelector('.ow-teamcal-week-row').click())
  const actions=[...ui.host.querySelectorAll('.swtb22-presence-person-actions button')]
  assert.ok(actions.length>0)
  assert.ok(actions.every(b=>b.disabled))
  assert.ok(btn(ui.host,'+ تعریف کار در این تاریخ').disabled)
  assert.match(ui.host.textContent,/روزهای گذشته/)
  assert.deepEqual(ui.calls.edit,[])
  assert.deepEqual(ui.calls.assign,[])
 }finally{await ui.cleanup()}
})
test('an explicitly selected day restores after returning from the worker editor',async()=>{
 const ui=await mount()
 let selected
 try{
  await act(async()=>btn(ui.host,'هفته بعد').click())
  await act(async()=>ui.host.querySelector('.ow-teamcal-week-row').click())
  selected=ui.calls.selected.at(-1)
  assert.ok(selected)
 }finally{await ui.cleanup()}
 const again=await mount({selectedDay:selected})
 try{
  assert.ok(again.host.querySelector('#swtb22-presence-day-inspector'))
  assert.equal(again.host.querySelectorAll('.ow-teamcal-day[aria-pressed="true"]').length,1)
  assert.equal(again.host.querySelectorAll('.ow-teamcal-week-row[aria-pressed="true"]').length,1)
  assert.equal(again.calls.selected.length,0)
 }finally{await again.cleanup()}
})
test('worker and legacy calendar remain the existing native-dialog behavior',async()=>{
 const ui=await mount({inlineManager:false,onEditWorker:null})
 try{
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector'),null)
  await act(async()=>ui.host.querySelector('.ow-teamcal-week-row').click())
  assert.ok(ui.host.querySelector('dialog[open]'))
  assert.equal(ui.host.querySelectorAll('.swtb22-presence-person-actions button').length,0)
 }finally{await ui.cleanup()}
})
