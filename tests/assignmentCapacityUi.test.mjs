import test, {before, after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act, createElement, useState} from 'react'
import {createServer} from 'vite'
import {firstMatchingWeekday,isoWeekday} from '../src/lib/assignmentCapacity.mjs'

// Mount real private operations UI with synthetic data, stubbing all RPC imports.
const tehranToday=()=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(new Date()).map(x=>[x.type,x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
const date=tehranToday()
const upcomingSaturday=firstMatchingWeekday(date,6)
const worker='FAKE-NOT-A-REAL-UUID'
const sample=()=>({
  workers:[{id:worker,name:'کاربر نمونه',unit:'library',state:'active'}],
  tasks:[
    {id:'today-task',worker_id:worker,unit:'library',state:'assigned',
      planned_date:date,estimate_minutes:45,title:'کار ساختگی امروز'},
    {id:'saturday-task',worker_id:worker,unit:'library',state:'assigned',
      planned_date:upcomingSaturday,estimate_minutes:300,title:'کار ساختگی شنبه'},
  ],
  weekly_slots:[
    {worker_id:worker,weekday_iso:isoWeekday(date),start_minute:480,end_minute:540,
      valid_from:'2020-01-01',valid_until:null},
  ],
  exceptions:[],time_entries:[],
})
const plugin={
  name:'assignment-capacity-ui-no-network',
  enforce:'pre',
  resolveId(source,importer){
    if(importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operations')return '\0qa-operations-no-network'
    if(importer?.endsWith('/src/components/WorkerLifecycleControls.jsx')&&source==='../lib/operations')
      return '\0qa-lifecycle-no-network'
  },
  load(id){
    if(id==='\0qa-operations-no-network')return [
      'export const getAdminWork=async()=>globalThis.__qaCapacityData;',
      ...['getMyWork','setWeeklyDay','setDateException','assignWorkerTask','startMyTask',
        'submitMyTime','reviewWorkerTime'].map(name=>
          `export const ${name}=async()=>{throw Error("QA_NETWORK_FORBIDDEN")};`),
    ].join('\n')
    if(id==='\0qa-lifecycle-no-network')return [
      'export const setWorkerState=async()=>{throw Error("QA_LIFECYCLE_FORBIDDEN")};',
      'export const getWorkerStateHistory=async()=>[];',
    ].join('\n')
  },
}
let dom,vite,Component,createRoot
before(async()=>{
  dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
    url:'http://example.invalid/assignment-capacity-qa',pretendToBeVisual:true,
  })
  globalThis.window=dom.window
  globalThis.document=dom.window.document
  globalThis.HTMLElement=dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  ;({createRoot}=await import('react-dom/client'))
  vite=await createServer({plugins:[plugin],server:{middlewareMode:true},
    appType:'custom',logLevel:'error'})
  ;({AdminOperations:Component}=await vite.ssrLoadModule('/src/OperationsWorkspace.jsx'))
})
after(async()=>{
  await vite?.close()
  dom?.window.close()
  for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__qaCapacityData'])
    delete globalThis[key]
})
function Wrapper({start}){
  const [navigation,setNavigation]=useState({
    section:'work',workView:start,workerId:worker,historyWorkerId:'',
    historyUnit:'',historyFrom:'',historyTo:'',historyReview:'',
  })
  return createElement(Component,{navigation,setNavigation})
}
async function setup({start='tasks',data=sample()}={}){
  globalThis.__qaCapacityData=data
  const host=document.createElement('div')
  document.body.append(host)
  const root=createRoot(host)
  await act(async()=>{root.render(createElement(Wrapper,{start}))})
  const teardown=async()=>{await act(async()=>root.unmount());host.remove()}
  return {host,teardown}
}
const labeledField=(host,label)=>{
  const el=Array.from(host.querySelectorAll('label')).find(x=>x.textContent.includes(label))
  assert.ok(el,`missing label ${label}`)
  return el.querySelector('input,select')
}
async function fill(field,value){
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
  await act(async()=>{setter.call(field,value);field.dispatchEvent(new window.Event('input',{bubbles:true}))})
}

test('manager sees exact read-only overbooking warning and retains enabled assignment action',async()=>{
  const {host,teardown}=await setup()
  try{
    assert.match(host.textContent,/هشدار بیش‌ازظرفیت/)
    assert.match(host.textContent,/ظرفیت ثبت‌شده/)
    assert.match(host.textContent,/۴۵ دقیقه/)
    const submit=Array.from(host.querySelectorAll('button')).find(x=>x.textContent==='واگذاری کار')
    assert.ok(submit)
    assert.equal(submit.disabled,false,'advice must not silently change server/business policy')
    assert.match(host.textContent,/ظرفیت، یک برآورد بر اساس اطلاعات فعلی است/)
  }finally{await teardown()}
})
test('no-weekday-record is uncertain, never mislabeled as confirmed absence',async()=>{
  const data=sample()
  data.weekly_slots=[]
  const {host,teardown}=await setup({data})
  try{
    assert.match(host.textContent,/برنامه حضور برای این روز ثبت نشده است/)
    assert.doesNotMatch(host.textContent,/هشدار عدم حضور/)
  }finally{await teardown()}
})
test('one-day zero-availability overrides recurring slot with warning',async()=>{
  const data=sample()
  data.exceptions=[{worker_id:worker,local_date:date,kind:'unavailable',intervals:[]}]
  const {host,teardown}=await setup({data})
  try{
    assert.match(host.textContent,/هشدار عدم حضور/)
    assert.match(host.textContent,/تغییر موقت همین روز/)
  }finally{await teardown()}
})
test('weekly schedule is one grid with inline row editor; month has one exception editor',async()=>{
  const {host,teardown}=await setup({start:'availability'})
  try{
    assert.equal(host.querySelectorAll('.ow-week-row').length,7)
    assert.equal(host.querySelectorAll('.ow-week-slot').length,28)
    assert.equal(host.querySelectorAll('.ow-week-day-form').length,0)
    assert.ok(host.querySelector('.ow-presence-month'))
    assert.ok(host.querySelectorAll('.ow-month-day').length>=28)
    const button=host.querySelector('button[aria-label^="ویرایش برنامه شنبه"]')
    assert.ok(button)
    await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
    const form=host.querySelector('.ow-week-row-shell .ow-week-day-form')
    assert.ok(form,'editor must appear immediately under the clicked weekday')
    assert.match(form.textContent,/کار ثبت شده/)
    const add=Array.from(form.querySelectorAll('button')).find(x=>x.textContent.includes('+ نوبت'))
    assert.ok(add)
    await act(async()=>add.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
    assert.equal(form.querySelectorAll('.ow-inline-window').length,1)
    assert.equal(Array.from(form.querySelectorAll('button')).find(x=>x.textContent==='ذخیره همین روز').disabled,false)
    await act(async()=>host.querySelector('.ow-month-day.is-today')
      .dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
    const exceptionForm=host.querySelector('.ow-exception-inline')
    assert.ok(exceptionForm)
    const absent=exceptionForm.querySelectorAll('input[name="exception-kind"]')[1]
    await act(async()=>absent.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
    assert.match(exceptionForm.textContent,/ظرفیت این روز با/)
  }finally{await teardown()}
})
test('invalid local weekday interval keeps submit disabled and never writes',async()=>{
  const {host,teardown}=await setup({start:'availability'})
  try{
    const day=host.querySelector('button[aria-label^="ویرایش برنامه شنبه"]')
    await act(async()=>day.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
    const add=Array.from(host.querySelectorAll('button')).find(x=>x.textContent.includes('+ نوبت'))
    await act(async()=>add.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
    const form=host.querySelector('.ow-week-day-form')
    const fields=Array.from(form.querySelectorAll('.ow-inline-window input[type="text"]'))
    assert.equal(fields.length,2)
    await fill(fields[0],'14:00')
    await fill(fields[1],'12:00')
    assert.match(form.textContent,/پایان هر بازه باید بعد از شروع/)
    assert.equal(Array.from(form.querySelectorAll('button')).find(x=>x.textContent==='ذخیره همین روز').disabled,true)
  }finally{await teardown()}
})
