import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement,useState} from 'react'
import {createServer} from 'vite'

const prior=process.env.VITE_SWTB22_TASKS_FOCUS_UI
process.env.VITE_SWTB22_TASKS_FOCUS_UI='true'
const fixture=()=>({
 workers:[
  {id:'FAKE-W1',name:'دانشجوکار ساختگی الف',unit:'library',state:'active'},
  {id:'FAKE-W2',name:'دانشجوکار ساختگی ب',unit:'research',state:'active'},
 ],
 tasks:[
  {id:'FAKE-T1',worker_id:'FAKE-W1',unit:'library',
   title:'مرتب‌سازی نسخه‌های نمونه',state:'assigned',planned_date:'2026-11-06',
   estimate_minutes:60,created_at:'2026-11-05T11:00:00Z'},
  {id:'FAKE-T2',worker_id:'FAKE-W2',unit:'research',
   title:'ثبت اطلاعات نمونه',state:'submitted',planned_date:'2026-11-07',
   estimate_minutes:90,created_at:'2026-11-05T12:00:00Z'},
 ],
 weekly_slots:[],exceptions:[],time_entries:[],profile_requests:[],
})
const plugin={
 name:'swtb22d3-no-network',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/OperationsWorkspace.jsx')&&
    source==='./lib/operationsV2')return '\0swtb22d3-v2'
  if(importer?.endsWith('/src/OperationsWorkspace.jsx')&&
    source==='./lib/operations')return '\0swtb22d3-ops'
  if(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&
    source==='../lib/operationsV2')return '\0swtb22d3-v2'
  if(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&
    source==='../lib/operations')return '\0swtb22d3-ops'
  if(importer?.endsWith('/src/components/TermBudgetPanel.jsx')&&
    source==='../lib/operationsV2')return '\0swtb22d3-v2'
  if(importer?.endsWith('/src/components/BudgetPoolEditor.jsx')&&
    source==='../lib/operationsV2')return '\0swtb22d3-v2'
  if(importer?.endsWith('/src/components/TermStatusDialog.jsx')&&
    source==='../lib/operationsV2')return '\0swtb22d3-v2'
  if(importer?.endsWith('/src/components/WorkerLifecycleControls.jsx')&&
    source==='../lib/operations')return '\0swtb22d3-ops'
 },
 load(id){
  if(id==='\0swtb22d3-v2')return [
   'export const getAdminWorkV2=async()=>{globalThis.__qaD3Reads++;',
   'if(globalThis.__qaD3Denied)throw Error("ACCESS_DENIED");',
   'return globalThis.__qaD3Fixture;};',
   'export const getOperationsTermDashboard=async()=>({ok:true,term:null,terms:[],units:[],workers:[],pools:[]});',
   'export const getUnitHourTotals=async()=>({scope:"admin",units:[]});',
   'export const getLibraryDeskShifts=async()=>({ok:true,shifts:[]});',
   ...['assignGroupTask','assignLibraryDeskShift','cancelLibraryDeskShift',
     'saveOperationsTerm','saveOperationsAllocation','saveOperationsBudgetPool',
     'reviewProfileChange','requestProfileChange'].map(name=>
     'export const '+name+'=async()=>{globalThis.__qaD3Writes++;throw Error("NO_WRITES")};'),
   'export const getMyWorkV2=async()=>({});',
   'export const getMyWorkerProfileV2=async()=>({});',
   'export const getMyProfileChangeRequests=async()=>[];',
  ].join('\n')
  if(id==='\0swtb22d3-ops')return [
   ...['assignWorkerTask','reviewWorkerTime','setWeeklyDay','setDateException',
     'startMyTask','submitMyTime'].map(name=>
     'export const '+name+'=async()=>{globalThis.__qaD3Writes++;throw Error("NO_WRITES")};'),
   'export const getAdminWork=async()=>({});',
   'export const getMyWork=async()=>({});',
   'export const getWorkerStateHistory=async()=>[];',
   'export const setWorkerState=async()=>{throw Error("NO_WRITES")};',
  ].join('\n')
 }
}
let dom,server,createRoot,AdminOperations
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'https://synthetic.invalid',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.Node=dom.window.Node
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[plugin],
  server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 ;({AdminOperations}=await server.ssrLoadModule('/src/OperationsWorkspace.jsx'))
})
after(async()=>{
 await server?.close();dom?.window.close()
 if(prior===undefined)delete process.env.VITE_SWTB22_TASKS_FOCUS_UI
 else process.env.VITE_SWTB22_TASKS_FOCUS_UI=prior
 for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT',
  'Node','__qaD3Reads','__qaD3Writes','__qaD3Denied','__qaD3Fixture'])
  delete globalThis[key]
})
async function mount(options={}){
 globalThis.__qaD3Fixture=options.fixture||fixture()
 globalThis.__qaD3Denied=false
 globalThis.__qaD3Writes=0
 globalThis.__qaD3Reads=0
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 let updateRevision=()=>{}
 function Harness({revision}){
  const [nav,setNav]=useState({
   section:'work',workView:'tasks',workerId:'',historyWorkerId:'',
   taskWorkerId:'',taskUnit:'',taskState:'',taskSearch:'',taskOrder:'latest',
  })
  return createElement(AdminOperations,{navigation:nav,setNavigation:setNav,
   hideSectionTabs:options.hideSectionTabs!==false,refreshRevision:revision})
 }
 let rev=0
 async function render(){await act(async()=>{
  root.render(createElement(Harness,{revision:rev}))
  await Promise.resolve()
 })}
 await render()
 return {
  host,
  async refresh(){rev++;await render()},
  async cleanup(){await act(async()=>root.unmount());host.remove()}
 }
}
const editor=host=>host.querySelector('#swtb22-task-assign-dialog')
const action=(host,name)=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(name))

test('list-first manager tasks keep old TaskAssignmentEditor entirely behind a closed focused dialog',async()=>{
 const ui=await mount()
 try{
  assert.equal(ui.host.querySelectorAll('.ow-task-results .ow-item').length,2)
  assert.equal(ui.host.querySelectorAll('.swtb22-task-directory').length,1)
  assert.equal(ui.host.querySelectorAll('.report-panel > .ow-assignment-form').length,0)
  assert.ok(editor(ui.host))
  assert.equal(editor(ui.host).open,false)
  assert.ok(ui.host.querySelector('.swtb22-task-directory').compareDocumentPosition(
   editor(ui.host))&Node.DOCUMENT_POSITION_FOLLOWING)
  const open=action(ui.host,'واگذاری کار جدید')
  assert.equal(open.getAttribute('aria-haspopup'),'dialog')
  assert.equal(open.getAttribute('aria-controls'),'swtb22-task-assign-dialog')
  await act(async()=>open.click())
  assert.equal(editor(ui.host).open,true)
  assert.equal(document.activeElement?.id,'swtb22-task-editor-heading')
  assert.equal(globalThis.__qaD3Writes,0,'no write on display or open')
  assert.match(editor(ui.host).textContent,/مخزن فرصت‌های کاری/)
 }finally{await ui.cleanup()}
})
test('manual dismissal retains unsent selection and controls remain accessible',async()=>{
 const ui=await mount()
 try{
  await act(async()=>action(ui.host,'واگذاری کار جدید').click())
  const select=editor(ui.host).querySelector('select[aria-label="واحد انجام کار"]')
  assert.equal(select.value,'')
  await act(async()=>{
   select.value='research'
   select.dispatchEvent(new window.Event('change',{bubbles:true}))
  })
  assert.equal(select.value,'research')
  await act(async()=>action(ui.host,'بستن و حفظ پیش‌نویس').click())
  assert.equal(editor(ui.host).open,false)
  assert.ok(document.activeElement?.textContent.includes('واگذاری کار جدید'),
   'focus should restore to the creating action')
  await act(async()=>action(ui.host,'واگذاری کار جدید').click())
  assert.equal(editor(ui.host).querySelector('select[aria-label="واحد انجام کار"]').value,'research')
  assert.equal(globalThis.__qaD3Writes,0)
 }finally{await ui.cleanup()}
})
test('read denial tears down selected tasks and the modal, and fresh read starts with a closed editor',async()=>{
 const ui=await mount()
 try{
  await act(async()=>action(ui.host,'واگذاری کار جدید').click())
  assert.equal(editor(ui.host).open,true)
  globalThis.__qaD3Denied=true
  await ui.refresh()
  assert.equal(editor(ui.host),null)
  assert.equal(ui.host.querySelector('.ow-task-results'),null)
  assert.match(ui.host.textContent,/تا بررسی دوبارهٔ مجوز، داده‌های قبلی نمایش داده نمی‌شوند/)
  globalThis.__qaD3Denied=false
  await ui.refresh()
  assert.ok(editor(ui.host))
  assert.equal(editor(ui.host).open,false,'fail closed without auto-reopening stale editor')
  assert.equal(globalThis.__qaD3Writes,0)
 }finally{await ui.cleanup()}
})
test('reversible feature off for legacy manager retains always-visible inline form',async()=>{
 const ui=await mount({hideSectionTabs:false})
 try{
  assert.equal(ui.host.querySelectorAll('.swtb22-task-directory').length,0)
  assert.equal(ui.host.querySelectorAll('#swtb22-task-assign-dialog').length,0)
  assert.equal(ui.host.querySelectorAll('.report-panel .ow-assignment-form').length,1)
  assert.equal(globalThis.__qaD3Writes,0)
 }finally{await ui.cleanup()}
})
test('no active worker disables the direct assignment action without inventing eligibility',async()=>{
 const empty=fixture();empty.workers=empty.workers.map(w=>({...w,state:'paused'}))
 const ui=await mount({fixture:empty})
 try{
  const open=action(ui.host,'واگذاری کار جدید')
  assert.ok(open.disabled)
  assert.match(ui.host.textContent,/ابتدا باید دست‌کم یک دانشجوکار فعال/)
  assert.equal(globalThis.__qaD3Writes,0)
 }finally{await ui.cleanup()}
})
