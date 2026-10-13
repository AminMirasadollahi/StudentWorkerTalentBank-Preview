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
test('weekly editor warns about already assigned Saturday tasks; exception warns about today',async()=>{
  const {host,teardown}=await setup({start:'availability'})
  try{
    const panels=Array.from(host.querySelectorAll('.ow-schedule-editor form'))
    assert.equal(panels.length,2)
    assert.match(panels[0].textContent,/هشدار تداخل با کارهای قبلی/)
    assert.match(panels[1].textContent,/هشدار: برای این روز قبلاً کار ثبت شده/)
    assert.equal(Array.from(host.querySelectorAll('button')).some(x=>x.textContent==='ثبت برنامه هفتگی'&&x.disabled),false)
  }finally{await teardown()}
})
test('invalid time range disables weekly save without submitting a write',async()=>{
  const {host,teardown}=await setup({start:'availability'})
  try{
    const panel=host.querySelector('.ow-schedule-editor form')
    const start=labeledField(panel,'ساعت شروع')
    const end=labeledField(panel,'ساعت پایان')
    await fill(start,'14:00')
    await fill(end,'12:00')
    assert.match(panel.textContent,/ساعت پایان باید بعد از شروع/)
    const submit=Array.from(panel.querySelectorAll('button')).find(x=>x.textContent==='ثبت برنامه هفتگی')
    assert.equal(submit.disabled,true)
  }finally{await teardown()}
})
