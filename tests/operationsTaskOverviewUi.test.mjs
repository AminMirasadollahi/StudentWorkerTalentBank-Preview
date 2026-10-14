import test,{before,after} from 'node:test'
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
      ||(importer?.endsWith('/src/components/TaskAssignmentEditor.jsx')&&source==='../lib/operationsV2'))
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
  return createElement(AdminOperations,{navigation:nav,setNavigation:setNav})
}
async function setup(view,overrides={}){
  globalThis.__taskReviewFixture={...fixture(),...overrides}
  globalThis.__qaReviewCalls=[]
  globalThis.__qaProfileReviewCalls=[]
  globalThis.__qaAllowDecision=false
  globalThis.__qaRefreshFailsAfterCommit=false
  globalThis.__managerReadDenied=false
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
test('real manager task listing displays categorical stages and accurate filtered totals',async()=>{
  const ui=await setup('tasks')
  try{
    assert.equal(count(ui.host,'.ow-task-results .ow-item'),3)
    assert.match(ui.host.textContent,/منتظر بررسی/)
    assert.match(ui.host.textContent,/زمان تأییدشده: ۴۵ دقیقه/)
    assert.match(ui.host.textContent,/زمان تأییدشده، درصد پیشرفت نیست/)
    await ui.choose('فیلتر وضعیت کار','assigned')
    assert.equal(count(ui.host,'.ow-task-results .ow-item'),1)
    assert.match(ui.host.querySelector('.ow-task-results').textContent,/مرتب‌سازی نسخه‌ها/)
    await ui.choose('فیلتر کار بر اساس دانشجوکار','FAKE-B')
    assert.equal(count(ui.host,'.ow-task-results .ow-item'),0)
    assert.match(ui.host.querySelector('.ow-task-results').textContent,/کاری با فیلترهای انتخاب‌شده/)
  }finally{await ui.dispose()}
})
test('real approval queue sorts by oldest and filters verified overtime only',async()=>{
  const ui=await setup('approvals')
  try{
    assert.equal(count(ui.host,'.ow-approval-results .ow-item'),3)
    let cards=Array.from(ui.host.querySelectorAll('.ow-approval-results .ow-item'))
    assert.match(cards[0].textContent,/ثبت گزارش پژوهشی/)
    assert.match(cards[1].textContent,/مرتب‌سازی نسخه‌ها/)
    await ui.choose('فیلتر نوع درخواست زمان','extra')
    cards=Array.from(ui.host.querySelectorAll('.ow-approval-results .ow-item'))
    assert.equal(cards.length,1)
    assert.match(cards[0].textContent,/درخواست زمان اضافه/)
    await ui.choose('فیلتر صف تأیید بر اساس دانشجوکار','FAKE-B')
    assert.equal(count(ui.host,'.ow-approval-results .ow-item'),0)
  }finally{await ui.dispose()}
})
test('missing linked task is never silently treated as normal approval',async()=>{
  const ui=await setup('approvals')
  try{
    await ui.choose('فیلتر نوع درخواست زمان','unknown')
    const card=ui.host.querySelector('.ow-approval-results .ow-item')
    assert.ok(card)
    assert.match(card.textContent,/کار مرتبط در اطلاعات فعلی موجود نیست/)
    const buttons=Array.from(card.querySelectorAll('button'))
    assert.equal(buttons.length,3)
    assert.equal(buttons.every(x=>x.disabled),true)
  }finally{await ui.dispose()}
})


test('manager denies old privileged records when initial V2 read fails and recovers on retry',async()=>{
 globalThis.__managerReadDenied=true
 const ui=await setup('tasks')
 try{
  assert.ok(ui.host.querySelector('.ow-access-recheck'))
  assert.equal(ui.host.querySelector('.ow-task-results'),null)
  assert.doesNotMatch(ui.host.textContent,/مرتب‌سازی نسخه‌ها/)
  globalThis.__managerReadDenied=false
  const retry=Array.from(ui.host.querySelectorAll('button'))
    .find(b=>b.textContent==='تلاش مجدد برای دریافت اطلاعات')
  assert.ok(retry)
  await act(async()=>retry.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  assert.equal(ui.host.querySelector('.ow-access-recheck'),null)
  assert.equal(ui.host.querySelectorAll('.ow-task-results .ow-item').length,3)
 }finally{globalThis.__managerReadDenied=false;await ui.dispose()}
})

test('approved time decision remains locked when returned manager data is stale',async()=>{
 const ui=await setup('approvals')
 globalThis.__qaAllowDecision=true
 try{
  const card=Array.from(ui.host.querySelectorAll('.ow-approval-results .ow-item'))
    .find(el=>el.textContent.includes('ثبت گزارش پژوهشی'))
  assert.ok(card)
  const approve=Array.from(card.querySelectorAll('button'))
    .find(el=>el.textContent==='تأیید ساعت')
  assert.ok(approve)
  await act(async()=>{
   approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))
   approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))
  })
  assert.equal(globalThis.__qaReviewCalls.length,1,'only one server approval is requested')
  assert.equal(globalThis.__qaReviewCalls[0].entryId,'ENTRY-OLD')
  assert.equal(approve.disabled,true,'card cannot be re-approved even with stale cached queue')
  assert.match(card.textContent,/تصمیم در سرور ثبت شد/)
  await act(async()=>approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  assert.equal(globalThis.__qaReviewCalls.length,1)
 }finally{globalThis.__qaAllowDecision=false;await ui.dispose()}
})

test('profile correction review also commits once despite unchanged queue projection',async()=>{
 const changes=[{id:'FAKE-CHANGE',worker_id:'FAKE-A',field_code:'major',
   proposed_value:'رشته کاملاً ساختگی',reason:'توضیح ساختگی کافی برای تصمیم مدیر',review_state:'pending'}]
 const ui=await setup('inbox',{profile_requests:changes})
 globalThis.__qaAllowDecision=true
 try{
  const card=ui.host.querySelector('.ow-profile-request')
  assert.ok(card)
  const approve=Array.from(card.querySelectorAll('button'))
    .find(el=>el.textContent==='تأیید اصلاح')
  assert.ok(approve)
  await act(async()=>{
   approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))
   approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true}))
  })
  assert.equal(globalThis.__qaProfileReviewCalls.length,1)
  assert.equal(globalThis.__qaProfileReviewCalls[0].requestId,'FAKE-CHANGE')
  assert.equal(approve.disabled,true)
  await act(async()=>approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  assert.equal(globalThis.__qaProfileReviewCalls.length,1)
 }finally{globalThis.__qaAllowDecision=false;await ui.dispose()}
})

test('an acknowledged time review followed by denied refresh never reports server rejection',async()=>{
 const ui=await setup('approvals')
 globalThis.__qaAllowDecision=true
 globalThis.__qaRefreshFailsAfterCommit=true
 try{
  const card=Array.from(ui.host.querySelectorAll('.ow-approval-results .ow-item'))
    .find(el=>el.textContent.includes('ثبت گزارش پژوهشی'))
  const approve=Array.from(card.querySelectorAll('button')).find(el=>el.textContent==='تأیید ساعت')
  await act(async()=>approve.dispatchEvent(new window.MouseEvent('click',{bubbles:true})))
  assert.equal(globalThis.__qaReviewCalls.length,1)
  assert.ok(ui.host.querySelector('.ow-access-recheck'),
    'manager read failure hides any stale pending cards after acknowledged mutation')
  assert.doesNotMatch(ui.host.textContent,/ثبت گزارش پژوهشی/)
 }finally{
  globalThis.__qaAllowDecision=false
  globalThis.__qaRefreshFailsAfterCommit=false
  globalThis.__managerReadDenied=false
  await ui.dispose()
 }
})
