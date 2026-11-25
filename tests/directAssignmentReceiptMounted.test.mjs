import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import React,{act,useState} from 'react'
import {createServer} from 'vite'
import {createDirectAssignmentSession,fixtureVerifiedRollback} from '../src/lib/directAssignmentSession.mjs'
let dom,vite,Panel,createRoot
before(async()=>{
 dom=new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body></body></html>',{url:'https://fixture.invalid',pretendToBeVisual:true})
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'})
 Panel=(await vite.ssrLoadModule('/src/components/DirectAssignmentReceiptPanel.jsx')).default
})
after(async()=>{await vite?.close();dom?.window.close();for(const k of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT'])delete globalThis[k]})
const h=React.createElement
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const A=id(1),B=id(2)
const draft={kind:'direct',workerIds:[id(3)],unit:'library',title:'Synthetic private title',instructions:'Synthetic private instructions',date:'2026-12-01',minutes:60,startMinute:null,endMinute:null,reason:null}
const receipt=p=>({ok:true,request_id:p.p_request_id,kind:p.p_kind,result:{id:id(201),state:'assigned',short_notice:false}})
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
async function mount(write,read=async()=>({found:false})){
 const writes=[],reads=[],revisions=[];let key=100
 const s=createDirectAssignmentSession({makeId:()=>id(key++),write:p=>{writes.push(p);return write(p)},read:k=>{reads.push(k);return read(k)}})
 s.setAccess({status:'verified',actorId:A})
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 let redraw
 function Fixture(){
  const [route,setRoute]=useState('tasks'),[,setVersion]=useState(0)
  redraw=()=>setVersion(v=>v+1)
  const run=async fn=>{const p=fn();redraw();await p;redraw()}
  const snap=s.snapshot()
  return h('main',null,h('button',{onClick:()=>setRoute('tasks')},'وظایف'),h('button',{onClick:()=>setRoute('offers')},'فرصت‌ها'),
   h('span',null,route),
   route==='tasks'&&h('button',{disabled:snap.state!=='idle',onClick:()=>void run(()=>s.submit(draft))},'ثبت آزمایشی'),
   h(Panel,{snapshot:snap,onReconcile:()=>void run(s.reconcile),onRetry:()=>void run(s.retry),onAcknowledge:()=>{s.acknowledge();redraw()},onRevise:()=>{revisions.push(s.reviseRejected());redraw()}}))
 }
 await act(async()=>root.render(h(Fixture)))
 return {host,s,writes,reads,revisions,click:async label=>{const b=[...host.querySelectorAll('button')].find(x=>x.textContent===label);assert.ok(b,label);await act(async()=>b.click())},
 access:async next=>{await act(async()=>{s.setAccess(next);redraw()})},
 cleanup:async()=>{s.dispose();await act(async()=>root.unmount());host.remove()}}
}
test('receipt panel survives fixture route switching, missing receipt only enables same-key manual replay',async()=>{
 let n=0
 const m=await mount(async p=>{if(++n===1)throw Error('lost response');return receipt(p)})
 try{
  await m.click('ثبت آزمایشی');assert.match(m.host.textContent,/نتیجه ثبت هنوز مشخص نیست/)
  await m.click('فرصت‌ها');assert.match(m.host.textContent,/نتیجه ثبت هنوز مشخص نیست/);assert.equal(m.writes.length,1)
  await m.click('بررسی رسید');assert.match(m.host.textContent,/ارسال مجدد همان درخواست/)
  await m.click('ارسال مجدد همان درخواست');assert.match(m.host.textContent,/واگذاری ثبت شد/)
  assert.equal(m.writes.length,2);assert.equal(m.writes[0],m.writes[1]);assert.deepEqual(m.reads,[m.writes[0].p_request_id])
  await m.click('تأیید و بستن رسید');await m.click('وظایف');assert.equal(m.s.snapshot().state,'idle')
 }finally{await m.cleanup()}
})
test('synthetic definite rejection permits revision, retains original text, no extra write',async()=>{
 const m=await mount(async()=>fixtureVerifiedRollback('worker_not_eligible_for_term'))
 try{
  await m.click('ثبت آزمایشی');assert.match(m.host.textContent,/مجوز همکاری این نیمسال/)
  assert.doesNotMatch(m.host.textContent,/ارسال مجدد همان درخواست/)
  await m.click('بازگشت به پیش‌نویس')
  assert.equal(m.revisions[0].p_instructions,draft.instructions);assert.equal(m.writes.length,1);assert.equal(m.s.snapshot().state,'idle')
 }finally{await m.cleanup()}
})
test('checking and actor switch hide panel; late callback cannot display previous receipt',async()=>{
 const d=deferred(),m=await mount(()=>d.promise)
 try{
  await m.click('ثبت آزمایشی');assert.match(m.host.textContent,/در حال ثبت واگذاری/)
  await m.access({status:'checking'});assert.match(m.host.textContent,/بررسی دسترسی/);assert.doesNotMatch(m.host.textContent,/در حال ثبت واگذاری/)
  await m.access({status:'verified',actorId:B});await act(async()=>d.resolve(receipt(m.writes[0])))
  assert.doesNotMatch(m.host.textContent,/واگذاری ثبت شد|Synthetic private/)
  assert.equal(m.s.snapshot().state,'idle');assert.equal(m.writes.length,1)
 }finally{await m.cleanup()}
})
