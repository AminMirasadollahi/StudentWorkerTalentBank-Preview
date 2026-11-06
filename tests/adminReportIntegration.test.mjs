import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {act,createElement} from 'react'
import {createServer} from 'vite'

let dom,vite,ReportApp,createRoot
const fixture=()=>({
  summary:{total_applications:2,filtered_applications:1,pageviews:12,visitors:4,form_starts:4,tracked_submissions:2,analytics_started_at:null},
  filters:{majors:['آموزش ابتدایی'],entry_years:[1405],primary_units:['library']},
  rows:[{id:'SYNTHETIC_TEST_ONLY',submitted_at:'2026-10-20T08:00:00Z',
    full_name:'SYNTHETIC_P3_TEST_ONLY',student_number:'SYNTHETIC_ID',
    major:'آموزش ابتدایی',entry_year:1405,primary_unit:'library',phone:'00000000000',
    top_skills:[],selected_skills:[],secondary_units:[],availability:[]}],
})
const plugin={
  name:'p3-authenticated-report-test-only',
  enforce:'pre',
  resolveId(source,importer){
    if(importer?.endsWith('/src/ReportApp.jsx')&&source==='./lib/adminReporting')
      return '\0p3-admin-report'
    if(importer?.endsWith('/src/ReportApp.jsx')&&source==='./lib/reporting')
      return '\0p3-legacy-report'
  },
  load(id){
    if(id==='\0p3-admin-report')return [
      'export async function getAdminStudentWorkerReport(filters){',
      'globalThis.__p3AdminCalls.push(filters);',
      'if(globalThis.__p3Reject) throw new Error("مجوز مدیریت برای مشاهدهٔ گزارش‌ها معتبر نیست.");',
      'return globalThis.__p3Fixture;',
      '}',
    ].join('\n')
    if(id==='\0p3-legacy-report')return [
      'export async function getStudentWorkerReport(code,filters){',
      'globalThis.__p3LegacyCalls.push({code,filters});',
      'if(globalThis.__p3LegacyDeferred) return globalThis.__p3LegacyDeferred;',
      'if(globalThis.__p3LegacyReject) throw new Error("SYNTHETIC_LEGACY_REPORT_DENIED");',
      'return globalThis.__p3Fixture;',
      '}',
    ].join('\n')
  },
}
before(async()=>{
  dom=new JSDOM('<!doctype html><html lang="fa"><body></body></html>',{url:'https://example.invalid',pretendToBeVisual:true})
  globalThis.window=dom.window
  globalThis.document=dom.window.document
  globalThis.sessionStorage=dom.window.sessionStorage
  globalThis.HTMLElement=dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  globalThis.__p3AdminCalls=[]
  globalThis.__p3LegacyCalls=[]
  globalThis.__p3Fixture=fixture()
  globalThis.__p3Reject=false
  globalThis.__p3LegacyReject=false
  globalThis.__p3LegacyDeferred=null
  ;({createRoot}=await import('react-dom/client'))
  vite=await createServer({plugins:[plugin],server:{middlewareMode:true},appType:'custom',logLevel:'error'})
  ReportApp=(await vite.ssrLoadModule('/src/ReportApp.jsx')).default
})
after(async()=>{
  await vite?.close()
  dom?.window.close()
  for(const k of ['__p3AdminCalls','__p3LegacyCalls','__p3Fixture','__p3Reject',
    '__p3LegacyReject','__p3LegacyDeferred','IS_REACT_ACT_ENVIRONMENT',
    'window','document','sessionStorage','HTMLElement'])delete globalThis[k]
})
async function renderReport(props){
 const host=document.createElement('div');document.body.append(host)
 const root=createRoot(host)
 const update=async next=>{
   await act(async()=>{root.render(createElement(ReportApp,next));await Promise.resolve();await Promise.resolve()})
 }
 await update(props)
 return {host,update,dispose:async()=>{await act(async()=>root.unmount());host.remove()}}
}

test('P3: verified-manager report fetches new role-scoped RPC with NO legacy access code',async()=>{
 globalThis.__p3AdminCalls=[]
 globalThis.__p3LegacyCalls=[]
 sessionStorage.setItem('student-worker-report:access:v1','FAKE_STORED_CODE_MUST_NOT_BE_READ')
 const ui=await renderReport({adminMode:true})
 try{
  assert.equal(globalThis.__p3AdminCalls.length,1)
  assert.equal(globalThis.__p3LegacyCalls.length,0)
  assert.match(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  assert.match(ui.host.textContent,/خروجی Excel/)
  assert.doesNotMatch(ui.host.textContent,/ورود به صفحه گزارش‌گیری|کد دسترسی/)
  assert.equal(ui.host.querySelector('input[type=password]'),null)
  assert.equal(sessionStorage.getItem('student-worker-report:access:v1'),'FAKE_STORED_CODE_MUST_NOT_BE_READ',
    'manager must not touch separate legacy reader session')
  assert.ok(ui.host.querySelector('.report-shell--embedded'),'only manager subview style')
 }finally{await ui.dispose();sessionStorage.clear()}
})

test('P3: after permission failure, a formerly loaded managerial report is removed (fail closed)',async()=>{
 globalThis.__p3Reject=false
 const ui=await renderReport({adminMode:true,refreshRevision:0})
 try{
  assert.match(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  globalThis.__p3Reject=true
  await ui.update({adminMode:true,refreshRevision:1})
  assert.doesNotMatch(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  assert.doesNotMatch(ui.host.textContent,/خروجی Excel/)
  assert.match(ui.host.textContent,/مجوز مدیریت/)
  assert.ok(ui.host.querySelector('[role=alert]'))
 }finally{globalThis.__p3Reject=false;await ui.dispose()}
})

test('P3: standalone report continues using independent access-code login, not manager RPC',async()=>{
 globalThis.__p3AdminCalls=[]
 globalThis.__p3LegacyCalls=[]
 sessionStorage.clear()
 const ui=await renderReport({})
 try{
  assert.match(ui.host.textContent,/ورود به صفحه گزارش‌گیری/)
  assert.ok(ui.host.querySelector('input[type=password]'))
  assert.equal(globalThis.__p3AdminCalls.length,0)
 }finally{await ui.dispose()}
})

test('SWTB11: legacy previously authorized candidate rows vanish after a denied refresh',async()=>{
 sessionStorage.clear()
 globalThis.__p3LegacyDeferred=null
 globalThis.__p3LegacyReject=false
 sessionStorage.setItem('student-worker-report:access:v1','SYNTHETIC_BEARER_TEST_ONLY')
 const ui=await renderReport({adminMode:false,refreshRevision:0})
 try{
  assert.match(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  assert.ok(ui.host.querySelector('.report-table'))
  globalThis.__p3LegacyReject=true
  await ui.update({adminMode:false,refreshRevision:1})
  assert.doesNotMatch(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  assert.equal(ui.host.querySelector('.report-table'),null)
  assert.match(ui.host.textContent,/ورود به صفحه گزارش‌گیری/)
  assert.match(ui.host.textContent,/SYNTHETIC_LEGACY_REPORT_DENIED/)
  assert.equal(sessionStorage.getItem('student-worker-report:access:v1'),null,
    'revoked or denied credential must not silently auto-read on next mount')
 }finally{
  globalThis.__p3LegacyReject=false
  await ui.dispose();sessionStorage.clear()
 }
})

test('SWTB11: pending legacy refresh hides previously loaded applicant PII immediately',async()=>{
 sessionStorage.clear()
 globalThis.__p3LegacyReject=false
 globalThis.__p3LegacyDeferred=null
 sessionStorage.setItem('student-worker-report:access:v1','SYNTHETIC_BEARER_TEST_ONLY')
 const ui=await renderReport({adminMode:false,refreshRevision:0})
 let release
 try{
  assert.match(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  globalThis.__p3LegacyDeferred=new Promise(resolve=>{release=resolve})
  await ui.update({adminMode:false,refreshRevision:1})
  assert.doesNotMatch(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY|خروجی Excel/)
  assert.equal(ui.host.querySelector('.report-table'),null)
  assert.match(ui.host.textContent,/اطلاعات قبلی تا پایان بررسی پنهان هستند/)
  assert.ok([...ui.host.querySelectorAll('button')].some(b=>b.textContent.includes('خروج از گزارش‌ها')))
 }finally{
  if(release)await act(async()=>{release(fixture());await Promise.resolve()})
  globalThis.__p3LegacyDeferred=null
  await ui.dispose();sessionStorage.clear()
 }
})

test('SWTB11: a delayed successful legacy response cannot restore report after logout',async()=>{
 sessionStorage.clear()
 globalThis.__p3LegacyReject=false
 globalThis.__p3LegacyDeferred=null
 sessionStorage.setItem('student-worker-report:access:v1','SYNTHETIC_BEARER_TEST_ONLY')
 const ui=await renderReport({adminMode:false,refreshRevision:0})
 let release
 try{
  assert.match(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  globalThis.__p3LegacyDeferred=new Promise(resolve=>{release=resolve})
  await ui.update({adminMode:false,refreshRevision:1})
  const exit=[...ui.host.querySelectorAll('button')].find(b=>b.textContent.includes('خروج از گزارش‌ها'))
  assert.ok(exit)
  await act(async()=>{exit.click();await Promise.resolve()})
  assert.match(ui.host.textContent,/ورود به صفحه گزارش‌گیری/)
  assert.doesNotMatch(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  assert.equal(sessionStorage.getItem('student-worker-report:access:v1'),null)
  await act(async()=>{release(fixture());await Promise.resolve();await Promise.resolve()})
  assert.match(ui.host.textContent,/ورود به صفحه گزارش‌گیری/)
  assert.doesNotMatch(ui.host.textContent,/SYNTHETIC_P3_TEST_ONLY/)
  assert.equal(ui.host.querySelector('.report-table'),null)
  assert.equal(sessionStorage.getItem('student-worker-report:access:v1'),null)
 }finally{
  if(release)await act(async()=>{release(fixture());await Promise.resolve()})
  globalThis.__p3LegacyDeferred=null
  await ui.dispose();sessionStorage.clear()
 }
})
