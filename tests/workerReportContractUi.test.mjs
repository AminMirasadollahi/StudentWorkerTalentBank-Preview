import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import React,{act,useState,useRef,useEffect,useLayoutEffect} from 'react'
import {JSDOM} from 'jsdom'
import {transformWithEsbuild} from 'vite'
import * as contract from '../src/lib/workerReportContract.mjs'
import * as retry from '../src/lib/workerReportRetry.mjs'
let dom,createRoot,Card,calls=[]
const base={id:'synthetic-task',title:'Synthetic task',state:'assigned',estimate_minutes:60,planned_date:'2026-11-26',unit:'library',report_contract:{date_min:'2026-11-24',date_max:'2026-11-26',window_empty:false,standard_minutes:60,minimum_minutes:1,maximum_minutes:1440,extra_reason_above_minutes:60}}
const prior={id:'revision-1',work_date:'2026-11-24',reported_minutes:75,worker_note:'prior note',review_state:'changes_requested',review_note:'manager reason',extra_time_reason_code:'other',extra_time_reason_text:'synthetic reason'}
before(async()=>{
 dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://synthetic.invalid',pretendToBeVisual:true})
 for(const k of ['window','document','HTMLElement','HTMLDialogElement'])globalThis[k]=k==='window'?dom.window:dom.window[k]
 globalThis.IS_REACT_ACT_ENVIRONMENT=true
 ;({createRoot}=await import('react-dom/client'))
 const source=readFileSync(new URL('../src/OperationsWorkspace.jsx',import.meta.url),'utf8')
 const from=source.indexOf('function WorkerTaskCard('),to=source.indexOf('/**\n * Each timeline item',from)
 assert.ok(from>=0&&to>from)
 const {code}=await transformWithEsbuild(source.slice(from,to),'WorkerTaskCard.jsx',{loader:'jsx',jsx:'transform',jsxFactory:'React.createElement'})
 const ports={React,useState,useRef,useEffect,useLayoutEffect,...contract,...retry,today:()=> '2026-11-26',shift:()=> '2026-08-28',pretty:x=>x,minutes:x=>String(x),unitLabels:{library:'library'},stateLabels:{},extraTimeReasons:{other:'other'},trapModalTab:()=>{},readableError:e=>e.message,submitMyTime:async x=>{calls.push(x);return {id:'synthetic-receipt'}},startMyTask:async()=>{throw Error('START_NOT_ALLOWED')},JalaliDatePicker:({value,min,max,disabled})=>React.createElement('input',{'data-testid':'date',value,min,max,disabled,readOnly:true})}
 Card=new Function(...Object.keys(ports),code+'\nreturn WorkerTaskCard;')(...Object.values(ports))
})
after(()=>{dom?.window.close();for(const k of ['window','document','HTMLElement','HTMLDialogElement','IS_REACT_ACT_ENVIRONMENT'])delete globalThis[k]})
async function mount(task,cycle='',ledger=new Map()){
 calls=[]
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 let props={task,reviewCycle:cycle,contractVersion:1,serverToday:'2026-11-26',actionLedger:ledger,onSaved:async()=>true,onInspect:()=>{}}
 const render=async update=>{props={...props,...update};await act(async()=>root.render(React.createElement(Card,props)))}
 await render({})
 const form=()=>host.querySelector('form'),submit=()=>form().querySelector('button[type=submit]')
 const open=async()=>act(async()=>host.querySelector('.ow-worker-report-trigger').click())
 const send=async()=>act(async()=>form().dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})))
 return {host,form,submit,open,send,render,cleanup:async()=>{await act(async()=>root.unmount());host.remove()}}
}
test('actual card uses server dates and no duplicate start on correction',async()=>{
 const ui=await mount({...base,state:'needs_changes',latest_report:prior},prior.id)
 try{await ui.open();assert.equal(ui.host.querySelector('[data-testid=date]').value,'2026-11-24');assert.equal(ui.host.querySelector('[data-testid=date]').min,'2026-11-24');assert.equal(ui.form().querySelector('textarea').value,'prior note');assert.match(ui.host.textContent,/manager reason/);assert.ok(![...ui.form().querySelectorAll('button')].some(b=>b.textContent==='شروع کار'));assert.equal(ui.submit().disabled,false);await ui.send();assert.equal(calls.length,1);assert.equal(calls[0].minutes,75);assert.equal(calls[0].date,'2026-11-24');assert.equal(calls[0].note,'prior note')}finally{await ui.cleanup()}
})
test('expired previous date is preserved and cannot be submitted as new report',async()=>{
 const ui=await mount({...base,state:'needs_changes',latest_report:{...prior,work_date:'2026-01-01'}},prior.id)
 try{await ui.open();assert.equal(ui.host.querySelector('[data-testid=date]').value,'2026-01-01');assert.equal(ui.submit().disabled,true);await ui.send();assert.equal(calls.length,0)}finally{await ui.cleanup()}
})
test('unknown attempt is restored exactly even when new window excludes date',async()=>{
 const payload={taskId:base.id,date:'2026-11-23',minutes:30,note:'original',extraReasonCode:null,extraReasonText:null},key='synthetic-key'
 const ui=await mount(base,'',new Map([[base.id,{reviewCycle:'',clientSubmissionId:key,submissionPayload:payload}]]))
 try{await ui.open();assert.equal(ui.submit().disabled,false);await ui.send();assert.deepEqual(calls,[{...payload,clientSubmissionId:key}])}finally{await ui.cleanup()}
})
test('new manager correction replaces stale draft with new revision',async()=>{
 const ui=await mount({...base,state:'needs_changes',latest_report:prior},prior.id)
 try{await ui.open();await ui.render({task:{...base,state:'needs_changes',latest_report:{...prior,id:'revision-2',worker_note:'new note',review_note:'new reason'}},reviewCycle:'revision-2'});assert.equal(ui.form().querySelector('textarea').value,'new note');assert.match(ui.host.textContent,/new reason/)}finally{await ui.cleanup()}
})

test('unresolved prerequisite blocks new report, but exact uncertain receipt retry remains possible',async()=>{
 const task={...base,prerequisites:{total:2,unresolved:1}}
 const blocked=await mount(task)
 try{assert.equal(blocked.host.querySelector('.ow-worker-report-trigger').disabled,true);assert.equal(calls.length,0)}finally{await blocked.cleanup()}
 const payload={taskId:base.id,date:'2026-11-25',minutes:30,note:'original',extraReasonCode:null,extraReasonText:null},key='synthetic-blocked-replay'
 const retry=await mount(task,'',new Map([[base.id,{reviewCycle:'',clientSubmissionId:key,submissionPayload:payload}]]))
 try{await retry.open();assert.equal(retry.submit().disabled,false);await retry.send();assert.deepEqual(calls,[{...payload,clientSubmissionId:key}])}finally{await retry.cleanup()}
})
