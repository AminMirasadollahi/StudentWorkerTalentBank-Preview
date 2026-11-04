import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

const fakeApi={
 name:'swtb21c3-fake-team-only-no-network',enforce:'pre',
 resolveId(source,importer){
  if(importer?.endsWith('/src/components/WorkerTeamCalendar.jsx')
     &&source==='../lib/operationsV2')return '\0swtb-c3-test-team-rpc'
 },
 load(id){
  if(id!=='\0swtb-c3-test-team-rpc')return null
  return [
   'export const getWorkerTeamCalendar=async({from,to})=>{',
   'globalThis.__teamCalls.push({from,to});',
   'if(globalThis.__teamReject)throw Error("UNAUTHORIZED_TEAM_READ");',
   'const tasks=(from<="2026-10-17"&&to>="2026-10-17")?',
   '[{worker_id:"worker-a",planned_date:"2026-10-17",unit:"library",',
   'title:globalThis.__teamSecretTitle?"CONFIDENTIAL_RAW_TITLE":"فعالیت ثبت‌شده",',
   'state:"scheduled"}]:[];',
   'return {ok:true,scope:"coworker_summary_only",start_date:from,end_date:to,',
   'workers:[{id:"worker-a",name:"همکار آزمایشی",state:"active",unit:"library",',
   'email:"PRIVATE_EMAIL_NOT_FOR_PEERS"}],',
   'weekly_slots:[{worker_id:"worker-a",weekday_iso:6,start_minute:480,end_minute:540,',
   'valid_from:"2026-10-01",valid_until:null,note:"PRIVATE_ABSENCE_REASON"}],',
   'exceptions:[],tasks};',
   '};',
  ].join('\n')
 },
}
let dom,server,Component,createRoot,helper
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
  url:'http://synthetic.invalid/',pretendToBeVisual:true,
 })
 globalThis.window=dom.window
 globalThis.document=dom.window.document
 globalThis.HTMLElement=dom.window.HTMLElement
 globalThis.HTMLDialogElement=dom.window.HTMLDialogElement
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 Object.defineProperty(dom.window.HTMLDialogElement.prototype,'showModal',
  {configurable:true,value:function(){this.setAttribute('open','')}})
 Object.defineProperty(dom.window.HTMLDialogElement.prototype,'close',
  {configurable:true,value:function(){this.removeAttribute('open')}})
 ;({createRoot}=await import('react-dom/client'))
 server=await createServer({plugins:[fakeApi],server:{middlewareMode:true},
  appType:'custom',logLevel:'error'})
 helper=await server.ssrLoadModule('/src/components/WorkerTeamCalendar.jsx')
 Component=helper.default
})
after(async()=>{
 await server?.close();dom?.window.close()
 for(const x of ['window','document','HTMLElement','HTMLDialogElement',
  'IS_REACT_ACT_ENVIRONMENT','__teamCalls','__teamReject',
  '__teamSecretTitle'])delete globalThis[x]
})
async function flush(){
 await act(async()=>{await Promise.resolve();await Promise.resolve()})
}
async function mount(props={}){
 globalThis.__teamCalls=[]
 globalThis.__teamReject=false
 globalThis.__teamSecretTitle=false
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const render=async(next={})=>{
  await act(async()=>root.render(createElement(Component,{
   todayIso:'2026-10-17',...props,...next,
  })))
  await flush()
 }
 await render()
 return {host,render,cleanup:async()=>{
  await act(async()=>root.unmount());host.remove()
 }}
}
test('request only nonoverlapping week tails beside Persian month',()=>{
 const windows=helper.teamCalendarRequestWindows({
  monthStart:'2026-10-01',monthEnd:'2026-10-30',
  weekStart:'2026-09-29',weekEnd:'2026-10-05',
 })
 assert.deepEqual(windows,[{from:'2026-10-01',to:'2026-10-30'},
  {from:'2026-09-29',to:'2026-09-30'}])
 const far=helper.teamCalendarRequestWindows({
  monthStart:'2026-10-01',monthEnd:'2026-10-30',
  weekStart:'2026-11-07',weekEnd:'2026-11-13',
 })
 assert.deepEqual(far,[{from:'2026-10-01',to:'2026-10-30'},
  {from:'2026-11-07',to:'2026-11-13'}])
 assert.throws(()=>helper.teamCalendarRequestWindows({}),/invalid_team_calendar_window/)
})
test('deduplicate identical weekly rows without swallowing real repeated tasks',()=>{
 const base={workers:[{id:'x'}],weekly_slots:[
  {worker_id:'x',weekday_iso:6,start_minute:480,end_minute:540,
   valid_from:'2026-10-01',valid_until:null}],
  exceptions:[],tasks:[{worker_id:'x',planned_date:'2026-10-10'}]}
 const result=helper.mergeWorkerTeamCalendar([base,base])
 assert.equal(result.weekly_slots.length,1)
 assert.equal(result.tasks.length,2)
 assert.throws(()=>helper.mergeWorkerTeamCalendar([
  base,{...base,workers:[{id:'y'}]}]),/team_roster_changed_during_fetch/)
})
test('mounted worker team view has weekly/month, generic work and no manager edit',async()=>{
 const {host,cleanup}=await mount()
 try{
  assert.match(host.textContent,/برنامه همکاران/)
  assert.ok(host.querySelector('.ow-teamcal-week'))
  assert.ok(host.querySelector('.ow-teamcal-month'))
  assert.ok(globalThis.__teamCalls.length>=1)
  assert.match(host.textContent,/همکار آزمایشی/)
  assert.doesNotMatch(host.textContent,/PRIVATE_EMAIL_NOT_FOR_PEERS|PRIVATE_ABSENCE_REASON/)
  assert.ok(![...host.querySelectorAll('button')].some(b=>
   /ثبت.*برنامه|ویرایش نوبت|تعریف کار در این تاریخ/.test(b.textContent)))
  const anyDay=host.querySelector('.ow-teamcal-week-row')
  assert.ok(anyDay)
  await act(async()=>anyDay.click())
  assert.ok(host.querySelector('dialog[open]'))
 }finally{await cleanup()}
})
test('failed refreshed authorization hides all previously loaded coworker data',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  assert.match(host.textContent,/همکار آزمایشی/)
  globalThis.__teamReject=true
  await render({refreshRevision:1})
  await flush()
  assert.match(host.textContent,/برنامه همکاران در دسترس نیست/)
  assert.doesNotMatch(host.textContent,/همکار آزمایشی/)
  assert.equal(host.querySelector('.ow-teamcal-month'),null)
 }finally{await cleanup()}
})
test('unexpected raw private task title is rejected and never rendered',async()=>{
 const {host,render,cleanup}=await mount()
 try{
  globalThis.__teamSecretTitle=true
  await render({refreshRevision:1})
  await flush()
  assert.match(host.textContent,/برنامه همکاران در دسترس نیست/)
  assert.doesNotMatch(host.textContent,/CONFIDENTIAL_RAW_TITLE|همکار آزمایشی/)
 }finally{await cleanup()}
})
