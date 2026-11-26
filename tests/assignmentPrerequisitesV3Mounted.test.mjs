import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
let dom,vite,Editor,ExistingEditor,createRoot,legacyCalls=0
const previousFlag=process.env.VITE_SWTB23_WORKER_POLICY_RELEASE
const h=React.createElement,id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
const worker={id:id(1),name:'کاربر مصنوعی',state:'active'},a={id:id(2),title:'پیش‌نیاز نخست',worker_id:worker.id,planned_date:'2099-01-01',state:'assigned'},b={id:id(3),title:'پیش‌نیاز دوم',worker_id:worker.id,planned_date:'2099-01-01',state:'completed'}
const target={id:id(4),title:'وظیفه وابسته',worker_id:worker.id,planned_date:'2099-01-02',state:'assigned'}
const seed={p_kind:'direct',p_worker_ids:[worker.id],p_unit_code:'research',p_title:'وظیفه مصنوعی',p_instructions:'',p_planned_date:'2099-01-02',p_estimate_minutes:60,p_start_minute:null,p_end_minute:null,p_short_notice_reason:null,p_prerequisites:[]}
before(async()=>{
 process.env.VITE_SWTB23_WORKER_POLICY_RELEASE='true'
 dom=new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body></body></html>',{url:'https://fixture.invalid',pretendToBeVisual:true})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.__swtb24Legacy=()=>{legacyCalls++;throw Error('LEGACY_FORBIDDEN')}
 ;({createRoot}=await import('react-dom/client'))
 const isolation={name:'swtb24-fake-assignment-only',enforce:'pre',resolveId(source,importer){
  if(importer?.split('?')[0].endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operations')return '\0swtb24-legacy'
  if(importer?.split('?')[0].endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operationsV2')return '\0swtb24-v2'
 },load(x){
  if(x==='\0swtb24-legacy')return 'export const assignWorkerTask=async()=>globalThis.__swtb24Legacy()'
  if(x==='\0swtb24-v2')return 'export const assignGroupTask=async()=>globalThis.__swtb24Legacy();export const assignLibraryDeskShift=assignGroupTask;export const cancelLibraryDeskShift=assignGroupTask;export const getLibraryDeskShifts=async()=>({ok:true,shifts:[]})'
 }}
 vite=await createServer({configFile:false,plugins:[isolation,react()],server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Editor=(await vite.ssrLoadModule('/src/components/TaskAssignmentEditor.jsx')).default
 ExistingEditor=(await vite.ssrLoadModule('/src/components/TaskPrerequisiteEditor.jsx')).default
})
after(async()=>{
 await vite?.close();dom?.window.close()
 if(previousFlag===undefined)delete process.env.VITE_SWTB23_WORKER_POLICY_RELEASE;else process.env.VITE_SWTB23_WORKER_POLICY_RELEASE=previousFlag
 for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__swtb24Legacy'])delete globalThis[k]
})
async function mount(element){
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(element))
 return {host,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
test('actual assignment editor selects concrete prerequisites and submits exactly one complete draft',async()=>{
 const writes=[]
 const port={version:3,snapshot:{state:'idle'},initialPayload:seed,submit:async draft=>{writes.push(draft);return 'committed'}}
 const m=await mount(h(Editor,{workers:[worker],data:{tasks:[b,a]},assignmentReceiptPort:port}))
 try{
  const field=m.host.querySelector('.ow-prerequisite-options')
  assert.ok(field);const checks=[...field.querySelectorAll('input[type=checkbox]')];assert.equal(checks.length,2)
  await act(async()=>checks[0].click());await act(async()=>checks[1].click())
  assert.ok(checks.every(x=>x.checked))
  const submit=m.host.querySelector('button[type=submit]');assert.equal(submit.disabled,false)
  await act(async()=>m.host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(writes.length,1);assert.deepEqual(writes[0].prerequisiteIds,[a.id,b.id])
  assert.equal(legacyCalls,0)
 }finally{await m.cleanup()}
})
test('strict editor refuses legacy/V2 port and never strips recovered prerequisite set',async()=>{
 const writes=[]
 const port={version:2,snapshot:{state:'idle'},initialPayload:{...seed,p_prerequisites:[a.id]},submit:async d=>writes.push(d)}
 const m=await mount(h(Editor,{workers:[worker],data:{tasks:[a]},assignmentReceiptPort:port}))
 try{
  assert.equal(m.host.querySelector('button[type=submit]').disabled,true)
  await act(async()=>m.host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(writes.length,0);assert.equal(legacyCalls,0)
 }finally{await m.cleanup()}
})
test('existing-task editor uses expected set and reads authoritative state after a confirmed write',async()=>{
 let ids=[],reads=0;const writes=[]
 const read=async()=>{reads++;return {task_id:target.id,editable:true,prerequisites:ids.map(id=>({...a,id,satisfied:false}))}}
 const write=async args=>{writes.push(args);ids=args.prerequisites;return {ok:true,changed:true,prerequisite_ids:ids}}
 const m=await mount(h(ExistingEditor,{task:target,tasks:[target,a],workerLabel:()=>worker.name,formatDate:x=>x,read,write}))
 try{
  const box=m.host.querySelector('.ow-prerequisite-options input[type=checkbox]');assert.ok(box)
  await act(async()=>box.click())
  const save=[...m.host.querySelectorAll('button')].find(x=>x.textContent==='ثبت تغییر پیش‌نیازها')
  assert.equal(save.disabled,false);await act(async()=>save.click())
  assert.deepEqual(writes,[{taskId:target.id,expected:[],prerequisites:[a.id],reason:null}])
  assert.equal(reads,2);assert.match(m.host.textContent,/تغییر پیش‌نیازها ثبت شد/)
 }finally{await m.cleanup()}
})
