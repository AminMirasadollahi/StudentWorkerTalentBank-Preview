import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { act, createElement, useState } from 'react'
import { createServer } from 'vite'

// ACTUAL private AdminOperations UI with an in-memory authorized response.
// All Operations/Auth/Lifecycle RPC imports are replaced; no external requests.
const sample = {
  workers:[
    {id:'worker-A',name:'نمونه یک',unit:'library',state:'active'},
    {id:'worker-B',name:'نمونه دو',unit:'research',state:'active'},
  ],
  tasks:[
    {id:'task-A',worker_id:'worker-A',unit:'library',state:'completed',planned_date:'2026-10-01',title:'کار کتابخانه'},
    {id:'task-B',worker_id:'worker-B',unit:'research',state:'completed',planned_date:'2026-10-02',title:'کار پژوهش'},
    {id:'task-C',worker_id:'worker-A',unit:'library',state:'assigned',planned_date:'2026-10-03',title:'کار باز کتابخانه'},
  ],
  weekly_slots:[],exceptions:[],
  time_entries:[
    {id:'report-A',worker_id:'worker-A',task_id:'task-A',work_date:'2026-10-05',
      review_state:'approved',reported_minutes:90,approved_minutes:90},
    {id:'report-B',worker_id:'worker-B',task_id:'task-B',work_date:'2026-10-06',
      review_state:'submitted',reported_minutes:60,approved_minutes:null},
  ],
}
const plugin={
  name:'private-operations-filter-ui-stub',
  enforce:'pre',
  resolveId(source,importer){
    if((importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operationsV2')
      ||(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operationsV2'))
      return '\0qa-v2-no-network'
    if(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operations')
      return '\0qa-admin-operations'
    
    if(importer?.includes('/src/OperationsWorkspace.jsx') && source==='./lib/operations')
      return '\0qa-admin-operations'
    if(importer?.includes('/src/components/WorkerLifecycleControls.jsx') &&
       source==='../lib/operations') return '\0qa-admin-lifecycle'
  },
  load(id){
    if(id==='\0qa-v2-no-network')return [
      'export const getAdminWorkV2=async()=>globalThis.__historyFixture;',
      'export const getMyWorkV2=async()=>globalThis.__historyFixture;',
      'export const getMyWorkerProfileV2=async()=>({worker_id:"FAKE-WORKER",name:"نمونه غیرواقعی",major:"پژوهش",entry_year:"1405",unit:"library"});',
      'export const getMyProfileChangeRequests=async()=>[];',
      ...['requestProfileChange','reviewProfileChange','assignGroupTask'].map(name=>
       `export const ${name}=async()=>{throw Error("QA_NO_REAL_BACKEND")};`),
    ].join('\n')
    
    if(id==='\0qa-admin-operations')return [
      'export const getAdminWork=async()=>globalThis.__historyFixture;',
      ...['getMyWork','setWeeklyDay','setDateException','assignWorkerTask',
          'startMyTask','submitMyTime','reviewWorkerTime'].map(name=>
          `export const ${name}=async()=>{throw Error("QA_NO_NETWORK")};`),
    ].join('\n')
    if(id==='\0qa-admin-lifecycle')return [
      'export const setWorkerState=async()=>{throw Error("QA_NO_WRITES")};',
      'export const getWorkerStateHistory=async()=>[];',
    ].join('\n')
  },
}
let dom, vite, createRoot, AdminOperations
before(async()=>{
  dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
    url:'http://example.invalid/history-private-qa',pretendToBeVisual:true,
  })
  globalThis.window=dom.window
  globalThis.document=dom.window.document
  globalThis.HTMLElement=dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  globalThis.__historyFixture=sample
  ;({createRoot}=await import('react-dom/client'))
  vite=await createServer({plugins:[plugin],server:{middlewareMode:true},
    appType:'custom',logLevel:'error'})
  ;({AdminOperations}=await vite.ssrLoadModule('/src/OperationsWorkspace.jsx'))
})
after(async()=>{
  await vite?.close()
  dom?.window.close()
  for(const key of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__historyFixture'])
    delete globalThis[key]
})
function Wrapper({initial}){
  const [nav,setNav]=useState(initial)
  return createElement(AdminOperations,{navigation:nav,setNavigation:setNav})
}
const navigation=()=>({
  section:'work',workView:'history',workerId:'',historyWorkerId:'',
  historyUnit:'',historyReview:'',historyFrom:'',historyTo:'',
})
async function setup(){
  const host=document.createElement('div')
  document.body.append(host)
  const root=createRoot(host)
  await act(async()=>{root.render(createElement(Wrapper,{initial:navigation()}))})
  const list=()=>Array.from(host.querySelector('.ow-list')?.querySelectorAll('.ow-item')||[])
  const select=css=>host.querySelector(css)
  const choose=async(css,value)=>{
    const node=select(css)
    assert.ok(node,`missing ${css}`)
    await act(async()=>{
      node.value=value
      node.dispatchEvent(new window.Event('change',{bubbles:true}))
    })
  }
  const click=async caption=>{
    const button=Array.from(host.querySelectorAll('button')).find(x=>x.textContent.trim()===caption)
    assert.ok(button,`missing button ${caption}`)
    await act(async()=>button.click())
  }
  const cleanup=async()=>{await act(async()=>root.unmount());host.remove()}
  return {host,list,select,choose,click,cleanup}
}

test('mounted React filters by worker, unit and review; summaries & Excel share filter scope',async()=>{
  const ui=await setup()
  try{
    assert.equal(ui.list().length,2)
    await ui.choose('.ow-worker-selector select','worker-A')
    assert.equal(ui.list().length,1)
    assert.doesNotMatch(ui.host.textContent,/پروفایل دانشجوکارها/)
    assert.match(ui.host.textContent,/سوابق منطبق با فیلتر/)
    await ui.choose('.ow-history-extra select:nth-of-type(1)','research').catch(async()=>{
      await ui.choose('.ow-history-extra .report-field:first-child select','research')
    })
    assert.equal(ui.list().length,0)
    await ui.choose('.ow-history-extra .report-field:first-child select','library')
    assert.equal(ui.list().length,1)
    await ui.choose('.ow-history-extra .report-field:nth-child(2) select','submitted')
    assert.equal(ui.list().length,0)
    assert.equal(Array.from(ui.host.querySelectorAll('button')).some(x=>
      x.textContent.includes('خروجی Excel')&&!x.disabled),false)
    await ui.choose('.ow-history-extra .report-field:nth-child(2) select','approved')
    assert.equal(ui.list().length,1)
    assert.match(ui.host.textContent,/۱ گزارش/)
    assert.match(ui.host.textContent,/۱ ساعت و ۳۰ دقیقه تأییدشده/)
    const excel=Array.from(ui.host.querySelectorAll('button')).find(x=>x.textContent.includes('خروجی Excel'))
    assert.equal(excel.disabled,false)
  }finally{await ui.cleanup()}
})

test('worker profile is separate from history filter and preserves read-only lifecycle',async()=>{
 const ui=await setup()
 try {
  await ui.click('پروفایل‌ها')
  assert.ok(ui.host.querySelector('.ow-profile-section'))
  assert.match(ui.host.textContent,/پروفایل دانشجوکارها/)
  await ui.choose('.ow-profile-section select','worker-A')
  assert.match(ui.host.textContent,/نمونه یک/)
  assert.match(ui.host.textContent,/۱ ساعت و ۳۰ دقیقه/)
  const status=ui.host.querySelector('.ow-profile-fold')
  assert.ok(status,'profile provides task state details')
  assert.equal(ui.host.querySelectorAll('.ow-history-results .ow-item').length,0)
  await ui.click('سابقه و خروجی')
  assert.equal(ui.list().length,2,'history has independent filter state')
 }finally{await ui.cleanup()}
})
test('clear all restores combined records while preserving a standalone manager operations panel',async()=>{
  const ui=await setup()
  try{
    await ui.choose('.ow-history-extra .report-field:nth-child(2) select','without_report')
    assert.equal(ui.list().length,0)
    assert.match(ui.host.textContent,/کارهای بدون گزارش/)
    assert.equal(ui.host.querySelectorAll('.ow-history-unreported .ow-item').length,1)
    await ui.click('پاک‌کردن همه فیلترها')
    assert.equal(ui.list().length,2)
    assert.equal(ui.host.querySelectorAll('.ow-history-unreported .ow-item').length,1)
    assert.equal(ui.select('.ow-history-extra .report-field:nth-child(2) select').value,'')
  }finally{await ui.cleanup()}
})
