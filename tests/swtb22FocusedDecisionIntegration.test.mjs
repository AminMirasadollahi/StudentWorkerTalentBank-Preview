import test,{before,after} from 'node:test'
// The reviewed manager-only feature is ON in this synthetic integration test.
process.env.VITE_SWTB22_REVIEW_FOCUS_UI='true'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement,useState} from 'react'
import {createServer} from 'vite'

// Real private AdminOperations; no auth, network or mutation provider is loaded.
const fixture=()=>({
  workers:[{id:'FAKE-A',name:'نمونه کتابخانه',unit:'library',state:'active'},
    {id:'FAKE-B',name:'نمونه پژوهش',unit:'research',state:'active'}],
  weekly_slots:[],exceptions:[],
  tasks:[
    {id:'TASK-A',worker_id:'FAKE-A',unit:'library',title:'مرتب‌سازی نسخه‌ها',
      state:'assigned',planned_date:'2026-10-09',estimate_minutes:90,created_at:'2026-10-08T09:00:00Z'},
    {id:'TASK-B',worker_id:'FAKE-B',unit:'research',title:'ثبت گزارش پژوهشی',
      state:'submitted',planned_date:'2026-10-11',estimate_minutes:60,created_at:'2026-10-08T10:00:00Z'},
    {id:'TASK-C',worker_id:'FAKE-A',unit:'library',title:'تحویل منابع',
      state:'completed',planned_date:'2026-10-13',estimate_minutes:45,created_at:'2026-10-08T11:00:00Z'},
  ],
  time_entries:[
    {id:'ENTRY-OLD',task_id:'TASK-B',worker_id:'FAKE-B',review_state:'submitted',
      work_date:'2026-10-12',reported_minutes:60,submitted_at:'2026-10-12T01:00:00Z'},
    {id:'ENTRY-EXTRA',task_id:'TASK-A',worker_id:'FAKE-A',review_state:'submitted',
      work_date:'2026-10-12',reported_minutes:120,extra_time_reason_code:'equipment_issue',
      extra_time_reason_text:'علت ساختگی',submitted_at:'2026-10-12T03:00:00Z'},
    {id:'ENTRY-MISSING',task_id:'TASK-ABSENT',worker_id:'FAKE-B',review_state:'submitted',
      work_date:'2026-10-12',reported_minutes:75,submitted_at:'2026-10-12T05:00:00Z'},
    {id:'ENTRY-APPROVED',task_id:'TASK-C',worker_id:'FAKE-A',review_state:'approved',
      work_date:'2026-10-10',reported_minutes:45,approved_minutes:45},
  ],
})
const plugin={
  name:'qa-task-review-offline',
  enforce:'pre',
  resolveId(source,importer){
    if((importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operationsV2')
      ||(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operationsV2')
      ||(importer?.endsWith('/src/components/TermBudgetPanel.jsx')&&source==='../lib/operationsV2')
      ||(importer?.endsWith('/src/components/BudgetPoolEditor.jsx')&&source==='../lib/operationsV2')
      ||(importer?.endsWith('/src/components/TermStatusDialog.jsx')&&source==='../lib/operationsV2'))
      return '\0qa-v2-no-network'
    if(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operations')
      return '\0qa-task-review-ops'
    
    if(importer?.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operations')
      return '\0qa-task-review-ops'
    if(importer?.endsWith('/src/components/WorkerLifecycleControls.jsx')&&source==='../lib/operations')
      return '\0qa-task-review-lifecycle'
  },
  load(id){
    if(id==='\0qa-v2-no-network')return [
      'export const getOperationsTermDashboard=async()=>({ok:true,term:null,terms:[],units:[],workers:[],weeks:[],pools:[]});',
      'export const saveOperationsTerm=async()=>{throw Error("QA_TERM_WRITE_DENIED")};',
      'export const saveOperationsAllocation=async()=>{throw Error("QA_ALLOCATION_WRITE_DENIED")};',
      'export const saveOperationsBudgetPool=async()=>{throw Error("QA_POOL_WRITES_FORBIDDEN")};',
      'export const getLibraryDeskShifts=async()=>({ok:true,shifts:globalThis.__qaDeskShifts||[]});',
      'export const assignLibraryDeskShift=async args=>{if(!globalThis.__qaPermitDesk)throw Error("QA_NO_BOOKING");(globalThis.__qaDeskCalls??=[]).push(args);return {ok:true};};',
      'export const cancelLibraryDeskShift=async()=>{throw Error("QA_NO_CANCELLATION")};',
      'export const getUnitHourTotals=async()=>({scope:"admin",units:[{unit:"library",name:"کتابخانه",approved_minutes:55,pending_requested_minutes:0,pending_reports:0}]});',
      'export const getAdminWorkV2=async()=>{if(globalThis.__managerReadDenied)throw Error("operations_access_denied");return globalThis.__taskReviewFixture;};',
      'export const getMyWorkV2=async()=>globalThis.__taskReviewFixture;',
      'export const getMyWorkerProfileV2=async()=>({worker_id:"FAKE-WORKER",name:"نمونه غیرواقعی",major:"پژوهش",entry_year:"1405",unit:"library"});',
      'export const getMyProfileChangeRequests=async()=>[];',
      'export const reviewProfileChange=async args=>{if(!globalThis.__qaAllowDecision)throw Error("QA_NO_REAL_BACKEND");globalThis.__qaProfileReviewCalls.push(args);if(globalThis.__qaRefreshFailsAfterCommit)globalThis.__managerReadDenied=true;return {ok:true};};',
      ...['requestProfileChange','assignGroupTask'].map(name=>
       `export const ${name}=async()=>{throw Error("QA_NO_REAL_BACKEND")};`),
    ].join('\n')
    
    if(id==='\0qa-task-review-ops')return [
      'export const getAdminWork=async()=>globalThis.__taskReviewFixture;',
      'export const reviewWorkerTime=async args=>{if(!globalThis.__qaAllowDecision)throw Error("NO_REAL_WRITES_OR_NETWORK");globalThis.__qaReviewCalls.push(args);if(globalThis.__qaRefreshFailsAfterCommit)globalThis.__managerReadDenied=true;return {ok:true};};',
      ...['getMyWork','setWeeklyDay','setDateException','assignWorkerTask',
        'startMyTask','submitMyTime'].map(name=>
        `export const ${name}=async()=>{throw Error("NO_REAL_WRITES_OR_NETWORK")};`),
    ].join('\n')
    if(id==='\0qa-task-review-lifecycle')return [
      'export const getWorkerStateHistory=async()=>[];',
      'export const setWorkerState=async()=>{throw Error("NO_LIFECYCLE_MUTATION")};',
    ].join('\n')
  },
}
let dom,vite,createRoot,AdminOperations
before(async()=>{
  dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{
    url:'http://example.invalid/task-review-qa',pretendToBeVisual:true,
  })
  globalThis.window=dom.window
  globalThis.document=dom.window.document
  globalThis.HTMLElement=dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  ;({createRoot}=await import('react-dom/client'))
  vite=await createServer({plugins:[plugin],server:{middlewareMode:true},
    appType:'custom',logLevel:'error'})
  ;({AdminOperations}=await vite.ssrLoadModule('/src/OperationsWorkspace.jsx'))
})
after(async()=>{
  await vite?.close()
  dom?.window.close()
  for(const name of ['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__taskReviewFixture',
    '__qaReviewCalls','__qaProfileReviewCalls','__qaAllowDecision','__qaRefreshFailsAfterCommit','__managerReadDenied'])
    delete globalThis[name]
})
function Wrapper({view}){
  const [nav,setNav]=useState({
    section:'work',workView:view,workerId:'',historyWorkerId:'',
    historyUnit:'',historyFrom:'',historyTo:'',historyReview:'',
    taskWorkerId:'',taskState:'',taskSearch:'',taskOrder:'latest',
    approvalWorkerId:'',approvalKind:'',
  })
  return createElement(AdminOperations,{navigation:nav,setNavigation:setNav,hideSectionTabs:true})
}
async function setup(view,overrides={}){
  globalThis.__taskReviewFixture={...fixture(),...overrides}
  globalThis.__qaReviewCalls=[]
  globalThis.__qaProfileReviewCalls=[]
  globalThis.__qaAllowDecision=false
  globalThis.__qaRefreshFailsAfterCommit=false
  // Preserve an explicitly configured denied initial read for the fail-closed test.
  globalThis.__managerReadDenied ??= false
  const host=document.createElement('div')
  document.body.append(host)
  const root=createRoot(host)
  await act(async()=>{root.render(createElement(Wrapper,{view}))})
  const choose=async(name,value)=>{
    const field=host.querySelector(`[aria-label="${name}"]`)
    assert.ok(field,`missing ${name}`)
    await act(async()=>{
      field.value=value
      field.dispatchEvent(new window.Event('change',{bubbles:true}))
    })
  }
  const dispose=async()=>{await act(async()=>root.unmount());host.remove()}
  return {host,choose,dispose}
}
const count=(host,selector)=>host.querySelectorAll(selector).length

test('manager approvals load as a compact directory; one explicit selection exposes the canonical form',async()=>{
 const ui=await setup('approvals')
 try{
  assert.equal(count(ui.host,'.swtb22-review-row'),3)
  assert.equal(count(ui.host,'.ow-approval-results .ow-item'),0)
  assert.equal(count(ui.host,'.swtb22-review-inspector .ow-item'),0)
  assert.equal(count(ui.host,'.swtb22-review-row[aria-pressed="true"]'),0)
  const rows=[...ui.host.querySelectorAll('.swtb22-review-row')]
  assert.match(rows[0].textContent,/ثبت گزارش پژوهشی/)
  await act(async()=>rows[0].click())
  assert.equal(count(ui.host,'.swtb22-review-inspector .ow-item'),1)
  assert.equal(count(ui.host,'.swtb22-review-row[aria-pressed="true"]'),1)
  assert.equal(document.activeElement.tagName,'H3')
  const approve=[...ui.host.querySelectorAll('.swtb22-review-inspector button')]
   .find(b=>b.textContent==='تأیید ساعت')
  assert.ok(approve && !approve.disabled,'normal, task-linked report can be reviewed')
  assert.equal(count(ui.host,'.ow-approval-detail>summary'),0,
   'the already-focused inspector should not hide the action behind another disclosure')
  await ui.choose('فیلتر نوع درخواست زمان','unknown')
  assert.equal(count(ui.host,'.swtb22-review-row'),1)
  assert.equal(count(ui.host,'.swtb22-review-inspector .ow-item'),0)
  await act(async()=>ui.host.querySelector('.swtb22-review-row').click())
  assert.match(ui.host.textContent,/کار مرتبط در اطلاعات فعلی موجود نیست/)
  assert.ok([...ui.host.querySelectorAll('.swtb22-review-inspector .ow-actions button')]
   .every(b=>b.disabled),'missing task never enables review buttons')
  assert.deepEqual(globalThis.__qaReviewCalls,[])
 }finally{await ui.dispose()}
})
test('inbox unifies authorized profile corrections and time reports without automatic decisions',async()=>{
 const changes=[{id:'FAKE-CHANGE',worker_id:'FAKE-A',field_code:'major',
  proposed_value:'تاریخ ساختگی',reason:'توضیح ساختگی کافی برای بررسی',
  review_state:'pending'}]
 const ui=await setup('inbox',{profile_requests:changes})
 try{
  assert.equal(count(ui.host,'.swtb22-review-row'),4)
  assert.equal(count(ui.host,'.ow-profile-request'),0,
   'requests must not mount form controls before explicit selection')
  assert.match(ui.host.querySelector('.swtb22-review-row').textContent,/اصلاح رشته/)
  await act(async()=>ui.host.querySelector('.swtb22-review-row').click())
  assert.equal(count(ui.host,'.ow-profile-request'),1)
  assert.ok([...ui.host.querySelectorAll('.ow-profile-request button')]
   .some(b=>b.textContent==='تأیید اصلاح'))
  assert.deepEqual(globalThis.__qaProfileReviewCalls,[])
  await act(async()=>ui.host.querySelectorAll('.swtb22-review-row')[1].click())
  assert.equal(count(ui.host,'.ow-profile-request'),0)
  assert.equal(count(ui.host,'.swtb22-review-inspector .ow-approval-detail'),1)
 }finally{await ui.dispose()}
})
test('a focused approved decision remains single-commit on a stale unchanged projection',async()=>{
 const ui=await setup('approvals')
 globalThis.__qaAllowDecision=true
 try{
  await act(async()=>ui.host.querySelector('.swtb22-review-row').click())
  const approve=[...ui.host.querySelectorAll('.swtb22-review-inspector button')]
   .find(b=>b.textContent==='تأیید ساعت')
  assert.ok(approve)
  await act(async()=>{
   approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))
   approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))
  })
  assert.equal(globalThis.__qaReviewCalls.length,1)
  assert.equal(approve.disabled,true)
  assert.match(ui.host.textContent,/تصمیم در سرور ثبت شد/)
 }finally{globalThis.__qaAllowDecision=false;await ui.dispose()}
})
test('selected worker profile has a single focused review surface while preserving history',async()=>{
 const changes=[{id:'FAKE-CHANGE',worker_id:'FAKE-A',field_code:'major',
  proposed_value:'رشته ساختگی',reason:'توضیح ساختگی',
  review_state:'pending'}]
 const ui=await setup('profiles',{profile_requests:changes})
 try{
  await act(async()=>ui.host.querySelector('.ow-people-directory button').click())
  assert.ok(ui.host.querySelector('.ow-profile-metrics'))
  assert.ok(ui.host.querySelector('.swtb22-profile-review'))
  const rows=ui.host.querySelectorAll('.swtb22-profile-review .swtb22-review-row')
  assert.equal(rows.length,2,'A has a pending profile change and extra-time report')
  assert.equal(count(ui.host,'.swtb22-profile-review .ow-item'),0)
  await act(async()=>rows[0].click())
  assert.equal(count(ui.host,'.swtb22-profile-review .ow-profile-request'),1)
  assert.match(ui.host.textContent,/سوابق ساعات و گزارش‌ها/)
  assert.deepEqual(globalThis.__qaReviewCalls,[])
 }finally{await ui.dispose()}
})
test('denied admin read never reveals prior sensitive reviewer controls',async()=>{
 globalThis.__managerReadDenied=true
 const ui=await setup('approvals')
 try{
  assert.ok(ui.host.querySelector('.ow-access-recheck'))
  assert.equal(count(ui.host,'.swtb22-review-workspace'),0)
  assert.equal(count(ui.host,'.ow-approval-detail'),0)
  assert.doesNotMatch(ui.host.textContent,/ثبت گزارش پژوهشی/)
 }finally{globalThis.__managerReadDenied=false;await ui.dispose()}
})
