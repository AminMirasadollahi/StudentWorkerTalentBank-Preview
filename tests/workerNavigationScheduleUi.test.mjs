import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement,useState} from 'react'
import {createServer} from 'vite'
import {readFileSync} from 'node:fs'

const day=()=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',
 }).formatToParts(new Date()).map(x=>[x.type,x.value]))
 return `${p.year}-${p.month}-${p.day}`
}
const worker='FAKE-WORKER-NOT-REAL'
const fixture=()=>({
 tasks:[{id:'FAKE-TASK',worker_id:worker,title:'کار نمونه دانشجوکار',
  planned_date:day(),state:'assigned',estimate_minutes:60,
  instructions:'توضیح ساختگی',created_at:'2026-10-13T08:00:00Z'}],
 weekly_slots:[],exceptions:[],time_entries:[],
})
const plugin={
 name:'worker-focus-ui-fully-isolated',
 enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operations')
   return '\0qa-worker-no-network'
 },
 load(id){
  if(id==='\0qa-worker-no-network')return [
    'export const getMyWork=async()=>globalThis.__workerFocusFixture;',
    'export const setWeeklyDay=async(...args)=>{globalThis.__workerFocusCalls.push(args);};',
    'export const setDateException=async(...args)=>{globalThis.__workerExceptionCalls.push(args);};',
    ...['getAdminWork','assignWorkerTask','startMyTask','submitMyTime',
      'reviewWorkerTime'].map(name=>
      `export const ${name}=async()=>{throw Error("QA_WRITES_DENIED")};`),
  ].join('\n')
 },
}
let dom,server,createRoot,WorkerOperations
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'http://example.invalid/qa',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.__workerFocusFixture=fixture()
 globalThis.__workerFocusCalls=[]
 globalThis.__workerExceptionCalls=[]
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[plugin],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 ;({WorkerOperations}=await server.ssrLoadModule('/src/OperationsWorkspace.jsx'))
})
after(async()=>{
 await server?.close()
 dom?.window.close()
 for(const p of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
  '__workerFocusFixture','__workerFocusCalls','__workerExceptionCalls'])delete globalThis[p]
})
function Harness(){
 const [nav,setNav]=useState({section:'tasks',taskRange:'today'})
 const [visible,setVisible]=useState(true)
 return createElement('div',{},[
  createElement('button',{key:'toggle','data-testid':'resume',onClick:()=>setVisible(x=>!x)},'recheck'),
  visible?createElement(WorkerOperations,{key:'worker',profile:{worker_id:worker},
   navigation:nav,setNavigation:setNav}):null,
 ])
}
async function setup(){
 const host=document.createElement('div')
 document.body.append(host)
 const root=createRoot(host)
 await act(async()=>root.render(createElement(Harness)))
 const click=async(selector)=>{
  const button=host.querySelector(selector)
  assert.ok(button,`missing ${selector}`)
  await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
 }
 const clickText=async(label)=>{
  const button=Array.from(host.querySelectorAll('button')).find(x=>x.textContent.trim()===label)
  assert.ok(button,`missing button ${label}`)
  await act(async()=>button.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
 }
 const dispose=async()=>{await act(async()=>root.unmount());host.remove()}
 return {host,click,clickText,dispose}
}
test('one worker tasks tab, range choices and safely preserved selection after unmount/resume',async()=>{
 const ui=await setup()
 try{
  assert.equal(ui.host.querySelectorAll('.ow-tabs button').length,3)
  assert.ok(ui.host.querySelector('.ow-range-switch'))
  assert.equal(ui.host.querySelectorAll('.ow-worker-tasks .ow-item').length,1)
  const reports=ui.host.querySelector('.ow-worker-action-detail')
  assert.ok(reports)
  assert.equal(reports.open,false)
  await ui.clickText('این هفته')
  assert.equal(ui.host.querySelector('[aria-pressed="true"]').textContent,'این هفته')
  await ui.click('[data-testid="resume"]')
  assert.equal(ui.host.querySelector('.ow-workspace'),null)
  await ui.click('[data-testid="resume"]')
  assert.equal(ui.host.querySelector('[aria-pressed="true"]').textContent,'این هفته')
  assert.equal(ui.host.querySelectorAll('.ow-tabs button').length,3)
 }finally{await ui.dispose()}
})
test('seven weekday rows render four independent slots and safe per-day single RPC request',async()=>{
 const ui=await setup()
 try{
  await ui.clickText('زمان حضور')
  assert.equal(ui.host.querySelectorAll('.ow-week-row').length,7)
  assert.equal(ui.host.querySelectorAll('.ow-week-slot').length,28)
  assert.equal(ui.host.querySelectorAll('.ow-inline-window input').length,0)
  assert.ok(ui.host.querySelector('.ow-month-grid'),'real monthly view is integrated into presence hub')
  await ui.click('button[aria-label^="ویرایش برنامه شنبه"]')
  assert.equal(ui.host.querySelectorAll('.ow-inline-window').length,0)
  await ui.clickText('+ نوبت (۰ از ۴)')
  assert.equal(ui.host.querySelectorAll('.ow-inline-window').length,1)
  await ui.clickText('ذخیره همین روز')
  assert.equal(globalThis.__workerFocusCalls.length,1)
  const [who,weekday,slots,effective]=globalThis.__workerFocusCalls[0]
  assert.equal(who,worker)
  assert.equal(weekday,6)
  assert.deepEqual(slots,[{start:480,end:540}])
  assert.match(effective,/^\d{4}-\d{2}-\d{2}$/)
 }finally{await ui.dispose()}
})
test('worker exposes This Month and personal profile without permanent password controls',async()=>{
 const ui=await setup()
 try{
  await ui.clickText('این هفته')
  assert.ok(ui.host.querySelector('.ow-range-switch'))
  await ui.clickText('این ماه')
  assert.equal(ui.host.querySelector('[aria-pressed="true"]').textContent,'این ماه')
  await ui.clickText('پروفایل من')
  assert.ok(ui.host.querySelector('.ow-self-profile'))
  assert.ok(ui.host.textContent.includes('سابقه گزارش‌ها و ساعات'))
  assert.equal(ui.host.querySelectorAll('.ow-tabs button').length,3)
 }finally{await ui.dispose()}
})
test('month view edits one dated exception through injected fake RPC only',async()=>{
 const ui=await setup()
 try{
  await ui.clickText('زمان حضور')
  assert.ok(ui.host.querySelector('.ow-month-grid'))
  await ui.click('.ow-month-day.is-today')
  assert.ok(ui.host.querySelector('.ow-exception-inline'))
  await ui.click('.ow-exception-kind label:last-child input')
  await ui.clickText('ذخیره استثنای این تاریخ')
  assert.equal(globalThis.__workerExceptionCalls.length,1)
  const [who,date,kind,windows]=globalThis.__workerExceptionCalls[0]
  assert.equal(who,worker)
  assert.match(date,/^\\d{4}-\\d{2}-\\d{2}$/)
  assert.equal(kind,'unavailable')
  assert.deepEqual(windows,[])
  assert.equal(globalThis.__workerFocusCalls.length,1,
    'prior weekly fake invocation remains separate from date exception fake')
 }finally{await ui.dispose()}
})
test('sources preserve fail-closed auth and critical applicant/protected operational wiring',()=>{
 const app=readFileSync('src/OpsApp.jsx','utf8')
 const ops=readFileSync('src/OperationsWorkspace.jsx','utf8')
 assert.match(app,/setWorkerNavigation\(initialWorkerNavigation\)/)
 assert.match(app,/watchOperationsResume/)
 assert.match(app,/if \(recheckingAccess && identity && !recoveryMode\)/)
 assert.match(app,/navigation=\{workerNavigation\}/)
 assert.match(app,/setSettingsOpen/)
 assert.match(app,/ops-account-settings-panel/)
 assert.doesNotMatch(ops,/WorkerLifecycleControls|VITE_WORKER_LIFECYCLE_ADMIN_ENABLED|ops_set_worker_state/)
 const css=readFileSync('src/operations-workspace.css','utf8')
 assert.match(css,/\.ow-worker-tasks,.ow-worker-history/)
 assert.match(css,/@media\(max-width:600px\)/)
})
