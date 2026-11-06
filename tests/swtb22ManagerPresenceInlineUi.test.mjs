import test,{before,after} from 'node:test'
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
 let config={data:fakeData,todayIso,inlineManager:true,selectedDay:todayIso,
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

test('manager calendar renders an in-page day inspector next to two real calendar views, not a dialog',async()=>{
 const ui=await mount()
 try{
  assert.ok(ui.host.querySelector('.swtb22-manager-teamcal'))
  assert.ok(ui.host.querySelector('.ow-teamcal-week'))
  assert.ok(ui.host.querySelector('.ow-teamcal-month'))
  assert.ok(ui.host.querySelector('#swtb22-presence-day-inspector'))
  assert.equal(ui.host.querySelector('dialog'),null,'manager inspector is inline, not modal')
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-week-row[aria-pressed="true"]').length,1)
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-day[aria-pressed="true"]').length,1)
  assert.match(ui.host.textContent,/برنامه نامشخص/)
  assert.match(ui.host.textContent,/کار نمونه/)
  assert.doesNotMatch(ui.host.textContent,/PRIVATE_|9999|حساب تعلیق‌شده/)
  assert.equal(ui.calls.assign.length,0)
 }finally{await ui.cleanup()}
})
test('navigating week or Persian month keeps selection, month, week and inspector synchronized',async()=>{
 const ui=await mount()
 try{
  const firstSelected=ui.host.querySelector('.ow-teamcal-week-row[aria-pressed="true"]')
  assert.ok(firstSelected)
  await act(async()=>btn(ui.host,'هفته بعد').click())
  const next=ui.calls.selected.at(-1)
  assert.ok(next>todayIso)
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-week-row[aria-pressed="true"]').length,1)
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-day[aria-pressed="true"]').length,1)
  assert.ok(ui.host.querySelector('.swtb22-presence-day-inspector'))
  assert.equal(document.activeElement?.id,'ow-teamcal-day-title')
  await act(async()=>btn(ui.host,'ماه بعد').click())
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-week-row[aria-pressed="true"]').length,1)
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-day[aria-pressed="true"]').length,1)
  assert.ok(ui.calls.selected.at(-1)>next)
  await act(async()=>btn(ui.host,'بازگشت به امروز').click())
  assert.equal(ui.calls.selected.at(-1),todayIso)
  assert.equal(ui.host.querySelectorAll('.ow-teamcal-day[aria-pressed="true"]').length,1)
 }finally{await ui.cleanup()}
})
test('clicking worker/date edits only the selected person, not an arbitrary day or private record',async()=>{
 const ui=await mount()
 try{
  const actions=[...ui.host.querySelectorAll('.swtb22-presence-person-actions button')]
  assert.equal(actions.length,2)
  await act(async()=>actions[0].click())
  assert.deepEqual(ui.calls.edit,[{id:'FAKE-A',date:todayIso}])
  assert.deepEqual(ui.calls.assign,[])
  await act(async()=>btn(ui.host,'+ تعریف کار در این تاریخ').click())
  assert.deepEqual(ui.calls.assign,[todayIso])
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector')!==null,true)
 }finally{await ui.cleanup()}
})
test('past-day review remains available but legacy RPC action routes cannot edit or assign a past day',async()=>{
 const ui=await mount()
 try{
  await act(async()=>btn(ui.host,'هفته قبل').click())
  const buttons=[...ui.host.querySelectorAll('.swtb22-presence-person-actions button')]
  assert.ok(buttons.length>0)
  assert.ok(buttons.every(b=>b.disabled))
  assert.ok(btn(ui.host,'+ تعریف کار در این تاریخ').disabled)
  assert.match(ui.host.textContent,/روزهای گذشته/)
  assert.deepEqual(ui.calls.edit,[])
  assert.deepEqual(ui.calls.assign,[])
 }finally{await ui.cleanup()}
})
test('selected day survives unmount from a person editor and return to group calendar',async()=>{
 const ui=await mount()
 try{
  await act(async()=>btn(ui.host,'هفته بعد').click())
  const selected=ui.calls.selected.at(-1)
  await ui.cleanup()
  const again=await mount({selectedDay:selected})
  try{
   const inspector=again.host.querySelector('#swtb22-presence-day-inspector')
   assert.ok(inspector)
   assert.equal(again.host.querySelectorAll('.ow-teamcal-day[aria-pressed="true"]').length,1)
   assert.equal(again.host.querySelectorAll('.ow-teamcal-week-row[aria-pressed="true"]').length,1)
   assert.equal(again.calls.selected.length,0,'restoring state must not call external navigation')
  }finally{await again.cleanup()}
 }catch(err){throw err}
})
test('legacy/worker team calendar still opens native dialog and has no manager edit buttons',async()=>{
 const ui=await mount({inlineManager:false,onEditWorker:null})
 try{
  assert.equal(ui.host.querySelector('#swtb22-presence-day-inspector'),null)
  const day=ui.host.querySelector('.ow-teamcal-week-row')
  await act(async()=>day.click())
  assert.ok(ui.host.querySelector('dialog[open]'))
  assert.equal(ui.host.querySelectorAll('.swtb22-presence-person-actions button').length,0)
 }finally{await ui.cleanup()}
})
