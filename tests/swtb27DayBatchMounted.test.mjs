import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import React,{act} from 'react'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
let dom,vite,Host,Batch,Direct,createRoot,legacyCalls=0
const h=React.createElement,id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),worker=id(2),term=id(3)
const today=new Date().toISOString().slice(0,10)
const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10)
const context={today,defaultDate:date,term:{id:term,state:'active',start_date:today,end_date:new Date(Date.now()+90*86400000).toISOString().slice(0,10)},workers:[{id:worker,name:'دانشجوکار نمونه',state:'active'}],data:{tasks:[],weekly_slots:[],exceptions:[]}}
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body></body></html>',{url:'https://fixture.invalid',pretendToBeVisual:true})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window)
 Object.defineProperty(document,'hasFocus',{value:()=>true,configurable:true})
 globalThis.__swtb27Forbidden=()=>{legacyCalls++;throw Error('LEGACY_FORBIDDEN')}
 ;({createRoot}=await import('react-dom/client'))
 const isolation={name:'swtb27-only-fake-assignment',enforce:'pre',resolveId(source,importer){
  if(importer?.split('?')[0].endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operations')return '\0swtb27-legacy'
  if(importer?.split('?')[0].endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operationsV2')return '\0swtb27-v2'
 },load(x){
  if(x==='\0swtb27-legacy')return 'export const assignWorkerTask=async()=>globalThis.__swtb27Forbidden()'
  if(x==='\0swtb27-v2')return 'export const assignGroupTask=async()=>globalThis.__swtb27Forbidden();export const assignLibraryDeskShift=assignGroupTask;export const cancelLibraryDeskShift=assignGroupTask;export const getLibraryDeskShifts=async()=>({ok:true,shifts:[]})'
 }}
 vite=await createServer({configFile:false,plugins:[isolation,react()],server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Host=(await vite.ssrLoadModule('/src/components/DayBatchManagerReviewHost.jsx')).default
 Batch=(await vite.ssrLoadModule('/src/components/BatchAssignmentPreview.jsx')).default
 Direct=(await vite.ssrLoadModule('/src/components/TaskAssignmentEditor.jsx')).default
})
after(async()=>{
 await vite?.close();dom?.window.close()
 for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','requestAnimationFrame','cancelAnimationFrame','__swtb27Forbidden'])delete globalThis[k]
})
const wait=()=>new Promise(r=>setTimeout(r,5))
async function until(fn){for(let i=0;i<80;i++){if(fn())return;await act(async()=>{await wait()})}throw Error('MOUNTED_WAIT_EXPIRED')}
function fixture(initial=null){
 let active=initial,epoch=7,seq=20,mode='',callback=null,reads=0
 const calls=[]
 const transport=async(url,init)=>{
  assert.ok(url.startsWith('https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/'))
  const rpc=url.split('/').pop(),a=JSON.parse(init.body);calls.push([rpc,a])
  if(rpc==='ops_is_admin')return {ok:true,json:async()=>true}
  assert.ok(['ops_assignment_batch_write_v1','ops_assignment_batch_control_v1','ops_assignment_recovery_write_v3','ops_assignment_recovery_control_v2'].includes(rpc))
  const batch=rpc.includes('_batch_'),control=rpc.endsWith('control_v1')||rpc.endsWith('control_v2')
  if(a.p_action==='reserve'){
   assert.equal(active,null);assert.equal(a.p_epoch,epoch)
   active={kind:batch?'batch_direct_v1':a.p_kind,status:'reserved',request_id:a.p_request_id}
  }
  if(a.p_action==='commit'){
   assert.equal(active.request_id,a.p_request_id);assert.equal(active.status,'reserved')
   const result=batch?{term_id:term,rows:a.p_rows.map((r,i)=>({row_id:r.id,mode:r.mode,group_id:null,minutes_per_worker:r.minutes,tasks:r.worker_ids.map((w,j)=>({worker_id:w,task_id:id(100+i*10+j)}))})),pair_count:a.p_rows.reduce((n,r)=>n+r.worker_ids.length,0),standard_person_minutes:a.p_rows.reduce((n,r)=>n+r.worker_ids.length*r.minutes,0)}:{id:id(101),state:'assigned',short_notice:false}
   active={...active,status:'committed',receipt:{ok:true,kind:active.kind,request_id:active.request_id,result}}
  }
  if(a.p_action==='cancel'){assert.equal(active.request_id,a.p_request_id);active={...active,status:'cancelled'}}
  if(a.p_action==='acknowledge'){assert.equal(active.request_id,a.p_request_id);active=null;epoch++}
  if(mode===a.p_action){mode='';throw Error('SYNTHETIC_LOST_RESPONSE')}
  if(!batch&&active?.kind==='batch_direct_v1')throw Error('LEGACY_UPGRADE_REQUIRED')
  const projection=batch&&a.p_action==='discover'&&active&&active.kind!=='batch_direct_v1'?{kind:active.kind,status:active.status,foreign:true}:active
  const result={ok:true,epoch,active:projection,...(batch&&control?{durable_active:false}:{})}
  return {ok:true,json:async()=>structuredClone(result)}
 }
 const config=Object.freeze({mode:'synthetic-review',actorId:actor,expectedProjectRef:'abcdefghijklmnopqrst',projectUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fixture',
  auth:{getSession:async()=>({data:{session:{access_token:'abc.def.ghi'}}}),getUser:async()=>({data:{user:{id:actor,is_anonymous:false}}}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){callback=null}}}}}},
  makeId:()=>id(seq++),fetchImpl:transport,read:async scope=>{reads++;return scope==='work'?structuredClone(context):{rows:[]}}})
 return {config,calls,reads:()=>reads,lose:action=>{mode=action},auth:event=>callback?.(event,{user:{id:actor}}),server:()=>active}
}
async function mount(f,{editor='batch',scope='work'}={}){
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);let port
 const render=(kind=editor,route=scope)=>root.render(h(Host,{fixture:f.config,scope:route},p=>{
  port=p
  return kind==='batch'?h(Batch,{key:p.editorRevision,context:p.context,reviewPort:p.batchPort}):h(Direct,{key:p.editorRevision,workers:p.context.workers,data:p.context.data,defaultWorkerId:worker,defaultDate:date,assignmentReceiptPort:p.legacyPort})
 }))
 await act(async()=>render())
 const state=()=>node.querySelector('[data-state]')?.dataset.state
 const button=label=>[...node.querySelectorAll('button')].find(x=>x.textContent===label)
 const click=async label=>{const b=button(label);assert.ok(b,label);assert.equal(b.disabled,false,label);await act(async()=>b.click())}
 const fill=async(sel,value)=>{const el=node.querySelector(sel);assert.ok(el,sel);const prototype=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})}
 await until(()=>['idle','reserved','committed','cancelled'].includes(state()))
 return {node,state,button,click,fill,port:()=>port,render:async(...args)=>{await act(async()=>render(...args))},cleanup:async()=>{await act(async()=>root.unmount());node.remove()}}
}
async function fillBatch(m){
 await m.fill('input[maxlength="160"]','کار مصنوعی آزمایشی')
 await act(async()=>m.node.querySelector('.swtb24-batch-people input').click())
 await m.click('بررسی تخصیص')
 assert.equal(m.button('ثبت آزمایشی مجموعه').disabled,false)
}
test('real mounted batch composer commits exactly once, shows receipt, refreshes after ack',async()=>{
 const f=fixture(),m=await mount(f)
 try{
  await fillBatch(m);await m.click('ثبت آزمایشی مجموعه')
  assert.equal(m.state(),'committed');assert.match(m.node.querySelector('[data-testid="batch-receipt-summary"]').textContent,/۶۰ دقیقه/)
  assert.equal(m.button('ثبت آزمایشی مجموعه').disabled,true)
  await m.click('بررسی وضعیت درخواست');await m.click('تأیید و بستن نتیجه')
  assert.equal(m.state(),'idle');assert.equal(m.node.querySelector('input[maxlength="160"]').value,'')
  assert.equal(f.calls.filter(x=>x[1].p_action==='commit').length,1);assert.ok(f.reads()>=2);assert.equal(legacyCalls,0)
 }finally{await m.cleanup()}
})
test('switch editor while receipt open; direct cannot write, then fresh direct after acknowledgement',async()=>{
 const f=fixture(),m=await mount(f)
 try{
  await fillBatch(m);await m.click('ثبت آزمایشی مجموعه');await m.render('direct')
  assert.equal(m.node.querySelector('button[type=submit]').disabled,true)
  await m.click('بررسی وضعیت درخواست');await m.click('تأیید و بستن نتیجه')
  await m.fill('input[maxlength="160"]','کار مستقیم مصنوعی');await m.fill('select[aria-label="واحد انجام کار"]','research')
  assert.equal(m.node.querySelector('button[type=submit]').disabled,false)
  await act(async()=>m.node.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(m.state(),'committed');assert.equal(f.calls.filter(x=>x[0]==='ops_assignment_recovery_write_v3'&&x[1].p_action==='commit').length,1);assert.equal(legacyCalls,0)
 }finally{await m.cleanup()}
})
test('lost commit response survives editor and scope switch; no second commit',async()=>{
 const f=fixture(),m=await mount(f)
 try{
  await fillBatch(m);f.lose('commit');await m.click('ثبت آزمایشی مجموعه');assert.equal(m.state(),'unknown')
  await m.render('direct','report');await until(()=>m.state()==='committed')
  assert.equal(m.node.querySelector('form'),null)
  await m.click('تأیید و بستن نتیجه');await m.render('batch','work');await until(()=>m.state()==='idle')
  assert.equal(f.calls.filter(x=>x[1].p_action==='commit').length,1)
 }finally{await m.cleanup()}
})
test('fresh host sees reserved server key but cannot reconstruct or commit',async()=>{
 const f=fixture({kind:'batch_direct_v1',status:'reserved',request_id:id(99)}),m=await mount(f)
 try{
  assert.equal(m.button('ثبت نهایی درخواست رزروشده'),undefined)
  assert.equal(m.node.querySelector('.swtb24-batch-preview fieldset').disabled,true)
  await m.click('لغو ایمن درخواست');await m.click('تأیید و بستن نتیجه')
  assert.equal(m.state(),'idle');assert.equal(f.calls.filter(x=>x[1].p_action==='commit').length,0)
 }finally{await m.cleanup()}
})
test('preview-only old caller still has disabled submit without a port',async()=>{
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el)
 try{
  await act(async()=>root.render(h(Batch,{context})))
  const input=el.querySelector('input[maxlength="160"]')
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'کار مصنوعی پیش‌نمایش');input.dispatchEvent(new window.Event('input',{bubbles:true}))})
  await act(async()=>el.querySelector('.swtb24-batch-people input').click())
  await act(async()=>[...el.querySelectorAll('button')].find(x=>x.textContent==='بررسی تخصیص').click())
  assert.equal([...el.querySelectorAll('button')].find(x=>x.textContent==='ثبت نهایی مجموعه (هنوز فعال نیست)').disabled,true)
 }finally{await act(async()=>root.unmount());el.remove()}
})
test('identity refresh hides stale editor and rediscovery does not repeat commit',async()=>{
 const f=fixture(),m=await mount(f)
 try{
  await fillBatch(m);await m.click('ثبت آزمایشی مجموعه');assert.equal(m.state(),'committed')
  await act(async()=>f.auth('TOKEN_REFRESHED'))
  assert.equal(m.node.querySelector('.swtb24-batch-preview'),null)
  await until(()=>m.state()==='committed')
  assert.equal(f.calls.filter(x=>x[1].p_action==='commit').length,1)
  await m.click('تأیید و بستن نتیجه');assert.equal(m.state(),'idle')
  assert.ok(f.reads()>=3)
 }finally{await m.cleanup()}
})
