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
    if((importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operationsV2')
      ||(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operationsV2'))
      return '\0qa-v2-no-network'
    if(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operations')
      return '\0qa-operations-no-network'

    if(importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operations')return '\0qa-operations-no-network'
    if(importer?.endsWith('/src/components/WorkerLifecycleControls.jsx')&&source==='../lib/operations')
      return '\0qa-lifecycle-no-network'
  },
  load(id){
    if(id==='\0qa-v2-no-network')return [
      'export const getAdminWorkV2=async()=>globalThis.__qaCapacityData;',
      'export const getMyWorkV2=async()=>globalThis.__qaCapacityData;',
      'export const getMyWorkerProfileV2=async()=>({worker_id:"FAKE-WORKER",name:"نمونه غیرواقعی",major:"پژوهش",entry_year:"1405",unit:"library"});',
      'export const getMyProfileChangeRequests=async()=>[];',
      'export const assignGroupTask=async args=>{globalThis.__qaGroupCalls.push(args);return {ok:true};};',
      ...['requestProfileChange','reviewProfileChange'].map(name=>
        `export const ${name}=async()=>{throw Error("QA_NO_REAL_BACKEND")};`),
    ].join('\n')

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
let dom,vite,Component,Editor,createRoot
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
  ;({default:Editor}=await vite.ssrLoadModule('/src/components/TaskAssignmentEditor.jsx'))
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
  globalThis.__qaGroupCalls=[]
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
    assert.match(host.textContent,/مجموع کارهای ثبت‌شده از ظرفیت اعلام‌شده/)
    assert.match(host.textContent,/ظرفیت نفرات انتخابی/)
    const submit=Array.from(host.querySelectorAll('button')).find(x=>x.textContent==='واگذاری کار')
    assert.ok(submit)
    assert.equal(submit.disabled,false,'advice must not silently change server/business policy')
    assert.match(host.textContent,/زمان استاندارد برای هر نفر جداگانه/)
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
test('weekly schedule exposes 28 in-cell actions and preserves compact Jalali exception editor',async()=>{
 const {host,teardown}=await setup({start:'availability'})
 try{
  assert.equal(host.querySelectorAll('.ow-week-row').length,7)
  assert.equal(host.querySelectorAll('.ow-week-cell').length,28)
  assert.equal(host.querySelectorAll('.ow-week-day-form').length,0)
  assert.ok(host.querySelector('.ow-presence-month'))
  const button=host.querySelector('button[aria-label="ویرایش برنامه شنبه نوبت 1"]')
  assert.ok(button)
  await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  const editor=host.querySelector('.ow-week-cell .ow-slot-editor')
  assert.ok(editor,'editor appears in the exact cell, without an expanded row')
  assert.equal(editor.querySelectorAll('input').length,2)
  assert.equal(host.querySelectorAll('.ow-week-day-form').length,0)
  assert.equal(editor.querySelector('button[aria-label="ذخیره همین روز"]').disabled,false)
  await act(async()=>host.querySelector('.ow-month-day.is-today')
    .dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  const exceptionForm=host.querySelector('.ow-exception-inline')
  assert.ok(exceptionForm)
  const absent=exceptionForm.querySelectorAll('input[name="exception-kind"]')[1]
  await act(async()=>absent.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  assert.match(exceptionForm.textContent,/ظرفیت این روز با/)
 }finally{await teardown()}
})
test('invalid local in-cell interval blocks weekly saving',async()=>{
 const {host,teardown}=await setup({start:'availability'})
 try{
  const day=host.querySelector('button[aria-label="ویرایش برنامه شنبه نوبت 1"]')
  await act(async()=>day.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  const form=host.querySelector('.ow-slot-editor')
  const fields=Array.from(form.querySelectorAll('input[type="text"]'))
  assert.equal(fields.length,2)
  await fill(fields[0],'14:00')
  await fill(fields[1],'12:00')
  assert.match(form.textContent,/پایان هر بازه باید بعد از شروع/)
  assert.equal(form.querySelector('button[aria-label="ذخیره همین روز"]').disabled,true)
 }finally{await teardown()}
})

test('group assignment submits a single atomic manager RPC with one standard duration for each selected member',async()=>{
 const data=sample()
 data.workers.push({id:'FAKE-WORKER-SECOND',name:'نمونه دوم',unit:'research',state:'active'})
 const {host,teardown}=await setup({data})
 try {
  const checkbox=Array.from(host.querySelectorAll('.ow-worker-option-list input[type="checkbox"]'))[1]
  assert.ok(checkbox,'group member selector exists')
  await act(async()=>checkbox.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  assert.match(host.textContent,/۲ نفر انتخاب‌شده/)
  const title=labeledField(host,'عنوان کار')
  await fill(title,'مرتب‌سازی گروهی منابع کتابخانه')
  const short=labeledField(host,'علت واگذاری امروز یا فردا')
  await fill(short,'آماده‌سازی سریع و هماهنگ منابع امروز')
  const form=host.querySelector('.ow-assignment-form')
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(globalThis.__qaGroupCalls.length,1)
  const payload=globalThis.__qaGroupCalls[0]
  assert.deepEqual(new Set(payload.workerIds),new Set([worker,'FAKE-WORKER-SECOND']))
  assert.equal(payload.minutes,'60')
  assert.equal(payload.title,'مرتب‌سازی گروهی منابع کتابخانه')
 }finally{await teardown()}
})

test('committed group assignment cannot be submitted twice when post-save refresh fails',async()=>{
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 let closeCount=0
 globalThis.__qaGroupCalls=[]
 const workers=[
  {id:'FAKE-FIRST',name:'عضو ساختگی اول',unit:'library',state:'active'},
  {id:'FAKE-SECOND',name:'عضو ساختگی دوم',unit:'research',state:'active'},
 ]
 try{
  await act(async()=>root.render(createElement(Editor,{
   workers,data:{workers,tasks:[],weekly_slots:[],exceptions:[]},
   defaultWorkerId:'FAKE-FIRST',onSaved:async()=>{throw Error('SYNTHETIC_REFRESH_FAILURE')},
   onClose:()=>{closeCount++},
  })))
  const second=host.querySelectorAll('.ow-worker-option-list input[type="checkbox"]')[1]
  await act(async()=>second.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  await fill(labeledField(host,'عنوان کار'),'وظیفه مشترک کاملاً ساختگی')
  await fill(labeledField(host,'علت واگذاری امروز یا فردا'),'دلیل ساختگی قابل قبول برای واگذاری سریع')
  const form=host.querySelector('form.ow-assignment-form')
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(globalThis.__qaGroupCalls.length,1)
  assert.match(host.textContent,/واگذاری با موفقیت ثبت شد؛ فقط تازه‌سازی فهرست ناموفق بود/)
  assert.equal(closeCount,0)
  const submit=Array.from(form.querySelectorAll('button')).find(b=>b.type==='submit')
  assert.equal(submit.disabled,true,'must not allow a duplicate after confirmed commit')
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(globalThis.__qaGroupCalls.length,1)
 }finally{await act(async()=>root.unmount());host.remove()}
})
